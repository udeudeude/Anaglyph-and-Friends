import { coverPlacement } from './viewMasterCrop'
import type { CropPosition, EyeImage, StereoPair } from './viewMasterCrop'

type JpegImage = {
    bytes: Uint8Array
    width: number
    height: number
}

const SLOT_COUNT = 7
const REEL_DIAMETER_MM = 90
const FRAME_WIDTH_MM = 11.75
const FRAME_HEIGHT_MM = 10.5
const FRAME_CENTER_RADIUS_MM = 31.3
const INDEX_RADIUS_MM = 38.5
const MASTER_SIZE_MM = 98
const MASTER_CENTER_MM = MASTER_SIZE_MM / 2
const POSITION_STEP_DEG = 360 / 14
const SCENE_STEP_DEG = 360 / SLOT_COUNT
const PT_PER_MM = 72 / 25.4

const encode = (value: string) => new TextEncoder().encode(value)
const mmToPt = (value: number) => value * PT_PER_MM

const joinBytes = (parts: Uint8Array[]) => {
    const length = parts.reduce((total, part) => total + part.length, 0)
    const joined = new Uint8Array(length)
    let offset = 0
    for (const part of parts) {
        joined.set(part, offset)
        offset += part.length
    }
    return joined
}

const pointOnCircle = (radius: number, angleDeg: number) => {
    const radians = angleDeg * Math.PI / 180
    return {
        x: MASTER_CENTER_MM + radius * Math.cos(radians),
        y: MASTER_CENTER_MM + radius * Math.sin(radians),
    }
}

const scenePositions = (scene: number) => {
    const left = (scene * 2) % 14
    return { left, right: (left + 7) % 14 }
}

const loadImage = (dataUrl: string) => new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error('Could not decode a View-Master eye image for PDF export'))
    image.src = dataUrl
})

const dataUrlToJpeg = async (eye: EyeImage): Promise<JpegImage> => {
    const image = await loadImage(eye.url)
    const canvas = document.createElement('canvas')
    canvas.width = image.naturalWidth
    canvas.height = image.naturalHeight
    const context = canvas.getContext('2d')
    if (!context) throw new Error('Canvas is unavailable for View-Master PDF export')
    context.fillStyle = '#fff'
    context.fillRect(0, 0, canvas.width, canvas.height)
    context.drawImage(image, 0, 0)
    const blob = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob(result => result ? resolve(result) : reject(new Error('Could not encode View-Master PDF image')), 'image/jpeg', 0.98)
    })
    return {
        bytes: new Uint8Array(await blob.arrayBuffer()),
        width: canvas.width,
        height: canvas.height,
    }
}

const circlePath = (cx: number, cy: number, radius: number) => {
    const k = 0.552284749831
    const control = radius * k
    return [
        `${(cx + radius).toFixed(3)} ${cy.toFixed(3)} m`,
        `${(cx + radius).toFixed(3)} ${(cy + control).toFixed(3)} ${(cx + control).toFixed(3)} ${(cy + radius).toFixed(3)} ${cx.toFixed(3)} ${(cy + radius).toFixed(3)} c`,
        `${(cx - control).toFixed(3)} ${(cy + radius).toFixed(3)} ${(cx - radius).toFixed(3)} ${(cy + control).toFixed(3)} ${(cx - radius).toFixed(3)} ${cy.toFixed(3)} c`,
        `${(cx - radius).toFixed(3)} ${(cy - control).toFixed(3)} ${(cx - control).toFixed(3)} ${(cy - radius).toFixed(3)} ${cx.toFixed(3)} ${(cy - radius).toFixed(3)} c`,
        `${(cx + control).toFixed(3)} ${(cy - radius).toFixed(3)} ${(cx + radius).toFixed(3)} ${(cy - control).toFixed(3)} ${(cx + radius).toFixed(3)} ${cy.toFixed(3)} c`,
    ].join('\n')
}

const pdfObject = (id: number, parts: Uint8Array[]) => joinBytes([
    encode(`${id} 0 obj\n`),
    ...parts,
    encode('\nendobj\n'),
])

const downloadBlob = (blob: Blob, filename: string) => {
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = filename
    document.body.appendChild(link)
    link.click()
    link.remove()
    window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export async function downloadViewMasterPdf(pairs: StereoPair[], imageRotation: number, crops: CropPosition[]) {
    if (pairs.length !== SLOT_COUNT || crops.length !== SLOT_COUNT) throw new Error('View-Master PDF export requires seven stereo pairs and crop positions')

    const sources = pairs.flatMap(pair => [pair.left, pair.right])
    const images = await Promise.all(sources.map(dataUrlToJpeg))
    const pageSize = mmToPt(MASTER_SIZE_MM)
    const frameWidth = mmToPt(FRAME_WIDTH_MM)
    const frameHeight = mmToPt(FRAME_HEIGHT_MM)
    const content: string[] = ['q', '1 1 1 rg', `0 0 ${pageSize.toFixed(3)} ${pageSize.toFixed(3)} re f`, 'Q']

    let imageIndex = 0
    pairs.forEach((_pair, scene) => {
        const positions = scenePositions(scene)
        const rotation = scene * SCENE_STEP_DEG + imageRotation
        ;(['left', 'right'] as const).forEach(eye => {
            const position = positions[eye]
            const centerAngle = 180 + position * POSITION_STEP_DEG
            const centerMm = pointOnCircle(FRAME_CENTER_RADIUS_MM, centerAngle)
            const centerX = mmToPt(centerMm.x)
            const centerY = pageSize - mmToPt(centerMm.y)
            const angle = -rotation * Math.PI / 180
            const cos = Math.cos(angle)
            const sin = Math.sin(angle)
            const image = images[imageIndex]
            const placement = coverPlacement(image.width, image.height, frameWidth, frameHeight, crops[scene])
            const drawX = -frameWidth / 2 + placement.x
            const drawY = frameHeight / 2 - placement.y - placement.height
            const name = `Im${imageIndex + 1}`
            content.push(
                'q',
                `${cos.toFixed(6)} ${sin.toFixed(6)} ${(-sin).toFixed(6)} ${cos.toFixed(6)} ${centerX.toFixed(3)} ${centerY.toFixed(3)} cm`,
                `${(-frameWidth / 2).toFixed(3)} ${(-frameHeight / 2).toFixed(3)} ${frameWidth.toFixed(3)} ${frameHeight.toFixed(3)} re W n`,
                `${placement.width.toFixed(3)} 0 0 ${placement.height.toFixed(3)} ${drawX.toFixed(3)} ${drawY.toFixed(3)} cm`,
                `/${name} Do`,
                'Q',
            )
            imageIndex += 1
        })
    })

    const center = pageSize / 2
    content.push('0.28 G', '0.51 w', '[2.8 1.8] 0 d')
    content.push(circlePath(center, center, mmToPt(REEL_DIAMETER_MM / 2)), 'S')
    content.push(circlePath(center, center, mmToPt(3.5)), 'S')

    for (let index = 0; index < SLOT_COUNT; index += 1) {
        const angleDeg = -90 + index * (360 / SLOT_COUNT)
        const centerMm = pointOnCircle(INDEX_RADIUS_MM, angleDeg)
        const x = mmToPt(centerMm.x)
        const y = pageSize - mmToPt(centerMm.y)
        const rotation = -(angleDeg + 90) * Math.PI / 180
        const cos = Math.cos(rotation)
        const sin = Math.sin(rotation)
        content.push(
            'q',
            `${cos.toFixed(6)} ${sin.toFixed(6)} ${(-sin).toFixed(6)} ${cos.toFixed(6)} ${x.toFixed(3)} ${y.toFixed(3)} cm`,
            `${mmToPt(-2.1).toFixed(3)} ${mmToPt(-3.5).toFixed(3)} ${mmToPt(4.2).toFixed(3)} ${mmToPt(7).toFixed(3)} re S`,
            'Q',
        )
    }

    content.push('[] 0 d', '0.25 G', 'BT', '/F1 5 Tf', `${mmToPt(8).toFixed(3)} ${mmToPt(2.2).toFixed(3)} Td`, '(PROTOTYPE TRANSPORT GEOMETRY - PRINT 100% / ACTUAL SIZE) Tj', 'ET')

    const contentBytes = encode(content.join('\n'))
    const imageObjectStart = 5
    const contentObjectId = imageObjectStart + images.length
    const xObjectEntries = images.map((_image, index) => `/Im${index + 1} ${imageObjectStart + index} 0 R`).join(' ')
    const objects: Uint8Array[] = []

    objects.push(pdfObject(1, [encode('<< /Type /Catalog /Pages 2 0 R >>')]))
    objects.push(pdfObject(2, [encode('<< /Type /Pages /Kids [3 0 R] /Count 1 >>')]))
    objects.push(pdfObject(3, [encode(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageSize.toFixed(3)} ${pageSize.toFixed(3)}] /Resources << /Font << /F1 4 0 R >> /XObject << ${xObjectEntries} >> >> /Contents ${contentObjectId} 0 R >>`)]))
    objects.push(pdfObject(4, [encode('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>')]))

    images.forEach((image, index) => {
        const dictionary = encode(`<< /Type /XObject /Subtype /Image /Width ${image.width} /Height ${image.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${image.bytes.length} >>\nstream\n`)
        objects.push(pdfObject(imageObjectStart + index, [dictionary, image.bytes, encode('\nendstream')]))
    })
    objects.push(pdfObject(contentObjectId, [encode(`<< /Length ${contentBytes.length} >>\nstream\n`), contentBytes, encode('\nendstream')]))

    const header = encode('%PDF-1.4\n%ANAGLYPH-FRIENDS\n')
    const offsets: number[] = [0]
    let byteOffset = header.length
    for (const object of objects) {
        offsets.push(byteOffset)
        byteOffset += object.length
    }
    const xrefOffset = byteOffset
    const xref = [
        `xref\n0 ${objects.length + 1}\n`,
        '0000000000 65535 f \n',
        ...offsets.slice(1).map(offset => `${String(offset).padStart(10, '0')} 00000 n \n`),
        `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`,
    ].join('')

    downloadBlob(new Blob([header, ...objects, encode(xref)], { type: 'application/pdf' }), 'view-master-print-master.pdf')
}
