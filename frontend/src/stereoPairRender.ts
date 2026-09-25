import type { TechniqueSettings } from './techniques'
import type { StereoPairFiles } from './studioAssets'

export type PairTechnique =
    | 'anaglyph'
    | 'parallel'
    | 'cross'
    | 'cardboard'
    | 'stereoscope'
    | 'mirror'
    | 'lenticular'
    | 'topbottom'
    | 'halfsbs'
    | 'rowinterlaced'
    | 'columninterlaced'
    | 'checkerboard'

type RenderOptions = {
    technique: PairTechnique
    settings: TechniqueSettings
    swapEyes: boolean
    scope: 'preview' | 'full'
    format: 'jpeg' | 'png'
    quality: number
}

type RenderedOutput = {
    blob: Blob
    width: number
    height: number
}

const PREVIEW_MAX_DIMENSION = 1500

const makeCanvas = (width: number, height: number) => {
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(width))
    canvas.height = Math.max(1, Math.round(height))
    return canvas
}

const loadBitmap = async (file: File) => createImageBitmap(file)

const canvasBlob = (canvas: HTMLCanvasElement, format: 'jpeg' | 'png', quality: number) => new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('Could not encode stereo-pair output')), format === 'jpeg' ? 'image/jpeg' : 'image/png', Math.max(.7, Math.min(1, quality / 100)))
})

const drawCover = (ctx: CanvasRenderingContext2D, image: CanvasImageSource, imageWidth: number, imageHeight: number, x: number, y: number, width: number, height: number) => {
    const scale = Math.max(width / imageWidth, height / imageHeight)
    const sourceWidth = width / scale
    const sourceHeight = height / scale
    const sourceX = (imageWidth - sourceWidth) / 2
    const sourceY = (imageHeight - sourceHeight) / 2
    ctx.drawImage(image, sourceX, sourceY, sourceWidth, sourceHeight, x, y, width, height)
}

const normalizedEyes = (left: ImageBitmap, right: ImageBitmap, width: number, height: number) => {
    const leftCanvas = makeCanvas(width, height)
    const rightCanvas = makeCanvas(width, height)
    const leftContext = leftCanvas.getContext('2d')!
    const rightContext = rightCanvas.getContext('2d')!
    drawCover(leftContext, left, left.width, left.height, 0, 0, width, height)
    drawCover(rightContext, right, right.width, right.height, 0, 0, width, height)
    return { leftCanvas, rightCanvas }
}

const previewScale = (width: number, height: number, scope: 'preview' | 'full') => scope === 'full' ? 1 : Math.min(1, PREVIEW_MAX_DIMENSION / Math.max(width, height))

const pairBaseSize = (left: ImageBitmap, right: ImageBitmap, scope: 'preview' | 'full') => {
    const width = Math.max(left.width, right.width)
    const height = Math.max(left.height, right.height)
    const scale = previewScale(width * 2, height, scope)
    return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) }
}

const colorAmount = (mode: string) => mode === 'full' ? 1 : mode === 'half' ? .5 : mode === 'gray' ? 0 : Math.max(0, Math.min(1, Number(mode) / 100 || 0))
const luminance = (r: number, g: number, b: number) => Math.round(.299 * r + .587 * g + .114 * b)
const mix = (gray: number, color: number, amount: number) => Math.round(gray * (1 - amount) + color * amount)
const parseHex = (value: string, fallback: [number, number, number]): [number, number, number] => {
    let text = String(value || '').trim().replace(/^#/, '')
    if (text.length === 3) text = text.split('').map(char => char + char).join('')
    if (!/^[0-9a-f]{6}$/i.test(text)) return fallback
    return [Number.parseInt(text.slice(0, 2), 16), Number.parseInt(text.slice(2, 4), 16), Number.parseInt(text.slice(4, 6), 16)]
}

const renderAnaglyph = (leftCanvas: HTMLCanvasElement, rightCanvas: HTMLCanvasElement, settings: TechniqueSettings) => {
    const canvas = makeCanvas(leftCanvas.width, leftCanvas.height)
    const context = canvas.getContext('2d')!
    const leftData = leftCanvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height)
    const rightData = rightCanvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height)
    const output = context.createImageData(canvas.width, canvas.height)
    const amount = colorAmount(settings.anaglyph.colorMode)
    const glasses = settings.anaglyph.glasses
    const standard = glasses === 'red-cyan' || glasses === 'red-green' || glasses === 'red-blue'

    if (!standard) {
        const calibration = settings.anaglyph[settings.anaglyph.target]
        const [lr, lg, lb] = parseHex(calibration.leftColor, [255, 0, 0])
        const [rr, rg, rb] = parseHex(calibration.rightColor, [0, 255, 255])
        const leftGain = Math.max(0, Math.min(1.5, calibration.leftGain / 100))
        const rightGain = Math.max(0, Math.min(1.5, calibration.rightGain / 100))
        for (let index = 0; index < output.data.length; index += 4) {
            const ll = luminance(leftData.data[index], leftData.data[index + 1], leftData.data[index + 2]) / 255
            const rl = luminance(rightData.data[index], rightData.data[index + 1], rightData.data[index + 2]) / 255
            output.data[index] = Math.min(255, Math.round(ll * lr * leftGain + rl * rr * rightGain))
            output.data[index + 1] = Math.min(255, Math.round(ll * lg * leftGain + rl * rg * rightGain))
            output.data[index + 2] = Math.min(255, Math.round(ll * lb * leftGain + rl * rb * rightGain))
            output.data[index + 3] = 255
        }
        context.putImageData(output, 0, 0)
        return canvas
    }

    for (let index = 0; index < output.data.length; index += 4) {
        const ll = luminance(leftData.data[index], leftData.data[index + 1], leftData.data[index + 2])
        const rl = luminance(rightData.data[index], rightData.data[index + 1], rightData.data[index + 2])
        const red = mix(ll, leftData.data[index], amount)
        const green = mix(rl, rightData.data[index + 1], amount)
        const blue = mix(rl, rightData.data[index + 2], amount)
        output.data[index] = red
        output.data[index + 1] = glasses === 'red-blue' ? 0 : green
        output.data[index + 2] = glasses === 'red-green' ? 0 : blue
        output.data[index + 3] = 255
    }
    context.putImageData(output, 0, 0)
    return canvas
}

const renderSideBySide = (left: HTMLCanvasElement, right: HTMLCanvasElement, cross: boolean) => {
    const canvas = makeCanvas(left.width * 2, left.height)
    const context = canvas.getContext('2d')!
    context.drawImage(cross ? right : left, 0, 0)
    context.drawImage(cross ? left : right, left.width, 0)
    return canvas
}

const renderHalfSbs = (left: HTMLCanvasElement, right: HTMLCanvasElement) => {
    const canvas = makeCanvas(left.width, left.height)
    const context = canvas.getContext('2d')!
    context.drawImage(left, 0, 0, left.width / 2, left.height)
    context.drawImage(right, left.width / 2, 0, left.width / 2, left.height)
    return canvas
}

const renderTopBottom = (left: HTMLCanvasElement, right: HTMLCanvasElement) => {
    const canvas = makeCanvas(left.width, left.height * 2)
    const context = canvas.getContext('2d')!
    context.drawImage(left, 0, 0)
    context.drawImage(right, 0, left.height)
    return canvas
}

const renderInterlaced = (left: HTMLCanvasElement, right: HTMLCanvasElement, kind: 'row' | 'column' | 'checker') => {
    const canvas = makeCanvas(left.width, left.height)
    const context = canvas.getContext('2d')!
    if (kind === 'row') {
        for (let y = 0; y < canvas.height; y += 1) context.drawImage(y % 2 === 0 ? left : right, 0, y, canvas.width, 1, 0, y, canvas.width, 1)
        return canvas
    }
    if (kind === 'column') {
        for (let x = 0; x < canvas.width; x += 1) context.drawImage(x % 2 === 0 ? left : right, x, 0, 1, canvas.height, x, 0, 1, canvas.height)
        return canvas
    }
    const leftData = left.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height)
    const rightData = right.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height)
    const output = context.createImageData(canvas.width, canvas.height)
    for (let y = 0; y < canvas.height; y += 1) {
        for (let x = 0; x < canvas.width; x += 1) {
            const offset = (y * canvas.width + x) * 4
            const source = (x + y) % 2 === 0 ? leftData : rightData
            output.data[offset] = source.data[offset]
            output.data[offset + 1] = source.data[offset + 1]
            output.data[offset + 2] = source.data[offset + 2]
            output.data[offset + 3] = 255
        }
    }
    context.putImageData(output, 0, 0)
    return canvas
}

const renderCardboard = (left: ImageBitmap, right: ImageBitmap, settings: TechniqueSettings, scope: 'preview' | 'full') => {
    const s = settings.cardboard
    const scale = previewScale(s.width, s.height, scope)
    const width = Math.max(1, Math.round(s.width * scale))
    const height = Math.max(1, Math.round(s.height * scale))
    const canvas = makeCanvas(width, height)
    const context = canvas.getContext('2d')!
    context.fillStyle = '#000'
    context.fillRect(0, 0, width, height)
    const pxPerMm = width / Math.max(1, s.screenWidthMm)
    const separation = s.lensSeparationMm * pxPerMm
    const eyeWidth = width * .46 * (s.imageScale / 100)
    const eyeHeight = height * .9 * (s.imageScale / 100)
    const leftCenter = width / 2 - separation / 2
    const rightCenter = width / 2 + separation / 2
    drawCover(context, left, left.width, left.height, leftCenter - eyeWidth / 2, (height - eyeHeight) / 2, eyeWidth, eyeHeight)
    drawCover(context, right, right.width, right.height, rightCenter - eyeWidth / 2, (height - eyeHeight) / 2, eyeWidth, eyeHeight)
    return canvas
}

const archedPhoto = (context: CanvasRenderingContext2D, image: ImageBitmap, x: number, y: number, width: number, height: number, arch: number) => {
    context.save()
    context.beginPath()
    context.moveTo(x, y + arch)
    context.quadraticCurveTo(x + width / 2, y - arch, x + width, y + arch)
    context.lineTo(x + width, y + height)
    context.lineTo(x, y + height)
    context.closePath()
    context.clip()
    drawCover(context, image, image.width, image.height, x, y, width, height)
    context.restore()
    context.strokeStyle = '#4d4d4d'
    context.lineWidth = Math.max(1, width / 500)
    context.strokeRect(x, y + arch * .35, width, height - arch * .35)
}

const renderStereoscope = (left: ImageBitmap, right: ImageBitmap, settings: TechniqueSettings, scope: 'preview' | 'full') => {
    const s = settings.stereoscope
    const fullWidth = Math.max(1, Math.round(s.cardWidth * s.dpi))
    const fullHeight = Math.max(1, Math.round(s.cardHeight * s.dpi))
    const scale = previewScale(fullWidth, fullHeight, scope)
    const dpi = s.dpi * scale
    const width = Math.round(fullWidth * scale)
    const height = Math.round(fullHeight * scale)
    const canvas = makeCanvas(width, height)
    const context = canvas.getContext('2d')!
    const dark = s.cardTone === 'black'
    context.fillStyle = dark ? '#000' : '#fff'
    context.fillRect(0, 0, width, height)
    const imageWidth = s.imageWidth * dpi
    const imageHeight = s.imageHeight * dpi
    const gap = s.gap * dpi
    const arch = s.arch * dpi
    const totalWidth = imageWidth * 2 + gap
    const startX = (width - totalWidth) / 2
    const imageY = Math.max(dpi * .2, (height - imageHeight) / 2 - dpi * .08)
    archedPhoto(context, left, startX, imageY, imageWidth, imageHeight, arch)
    archedPhoto(context, right, startX + imageWidth + gap, imageY, imageWidth, imageHeight, arch)
    context.fillStyle = dark ? '#fff' : '#111'
    context.textAlign = 'center'
    context.font = `700 ${Math.max(10, dpi * .12)}px Georgia, serif`
    if (s.title) context.fillText(s.title, width / 2, Math.max(dpi * .15, imageY - dpi * .06))
    context.font = `${Math.max(8, dpi * .075)}px Georgia, serif`
    if (s.caption) context.fillText(s.caption, width / 2, Math.min(height - dpi * .14, imageY + imageHeight + dpi * .14))
    context.font = `${Math.max(7, dpi * .06)}px Georgia, serif`
    if (s.publisher) context.fillText(s.publisher, width / 2, height - dpi * .05)
    return canvas
}

const renderMirrorStereoscope = (left: ImageBitmap, right: ImageBitmap, settings: TechniqueSettings, scope: 'preview' | 'full') => {
    const s = settings.mirror
    const fullWidth = Math.max(1, Math.round(s.cardWidth * s.dpi))
    const fullHeight = Math.max(1, Math.round(s.cardHeight * s.dpi))
    const scale = previewScale(fullWidth, fullHeight, scope)
    const dpi = s.dpi * scale
    const width = Math.max(1, Math.round(fullWidth * scale))
    const height = Math.max(1, Math.round(fullHeight * scale))
    const canvas = makeCanvas(width, height)
    const context = canvas.getContext('2d')!
    context.fillStyle = '#fff'
    context.fillRect(0, 0, width, height)

    let imageWidth = s.imageWidth * dpi
    let imageHeight = s.imageHeight * dpi
    let gap = Math.max(0, s.mirrorGap * dpi)
    const total = imageWidth * 2 + gap
    if (total > width) {
        const shrink = width / total
        imageWidth *= shrink
        imageHeight *= shrink
        gap *= shrink
    }
    const startX = (width - (imageWidth * 2 + gap)) / 2
    const imageY = (height - imageHeight) / 2
    const reflected = s.reflectedEye

    const drawPanel = (image: ImageBitmap, x: number, mirror: boolean) => {
        context.save()
        if (mirror) {
            context.translate(x + imageWidth, imageY)
            context.scale(-1, 1)
            drawCover(context, image, image.width, image.height, 0, 0, imageWidth, imageHeight)
        } else drawCover(context, image, image.width, image.height, x, imageY, imageWidth, imageHeight)
        context.restore()
    }

    drawPanel(left, startX, reflected === 'left')
    drawPanel(right, startX + imageWidth + gap, reflected === 'right')

    if (s.showGuide) {
        const center = startX + imageWidth + gap / 2
        context.strokeStyle = '#888'
        context.lineWidth = Math.max(1, dpi / 150)
        context.beginPath()
        context.moveTo(center, Math.max(0, imageY - dpi * .18))
        context.lineTo(center, Math.min(height, imageY + imageHeight + dpi * .18))
        context.stroke()
        if (gap > 0) {
            context.strokeStyle = '#d2d2d2'
            context.strokeRect(startX + imageWidth, imageY, gap, imageHeight)
        }
    }
    return canvas
}

const renderLenticular = (left: ImageBitmap, right: ImageBitmap, settings: TechniqueSettings, scope: 'preview' | 'full') => {
    const s = settings.lenticular
    const fullWidth = Math.max(1, Math.round(s.widthIn * s.dpi))
    const fullHeight = Math.max(1, Math.round(s.heightIn * s.dpi))
    const scale = previewScale(fullWidth, fullHeight, scope)
    const width = Math.round(fullWidth * scale)
    const height = Math.round(fullHeight * scale)
    const { leftCanvas, rightCanvas } = normalizedEyes(left, right, width, height)
    const canvas = makeCanvas(width, height)
    const context = canvas.getContext('2d')!
    const pitch = Math.max(1, (s.dpi / Math.max(1, s.lpi)) * scale)
    for (let x = 0; x < width; x += 1) {
        const phase = (x % pitch) / pitch
        const source = phase < .5 ? leftCanvas : rightCanvas
        context.drawImage(source, x, 0, 1, height, x, 0, 1, height)
    }
    return canvas
}

export async function renderStereoPairOutput(pair: StereoPairFiles, options: RenderOptions): Promise<RenderedOutput> {
    let [left, right] = await Promise.all([loadBitmap(pair.left), loadBitmap(pair.right)])
    if (options.swapEyes) [left, right] = [right, left]
    try {
        let canvas: HTMLCanvasElement
        if (options.technique === 'cardboard') canvas = renderCardboard(left, right, options.settings, options.scope)
        else if (options.technique === 'stereoscope') canvas = renderStereoscope(left, right, options.settings, options.scope)
        else if (options.technique === 'mirror') canvas = renderMirrorStereoscope(left, right, options.settings, options.scope)
        else if (options.technique === 'lenticular') canvas = renderLenticular(left, right, options.settings, options.scope)
        else {
            const base = pairBaseSize(left, right, options.scope)
            const eyes = normalizedEyes(left, right, base.width, base.height)
            if (options.technique === 'anaglyph') canvas = renderAnaglyph(eyes.leftCanvas, eyes.rightCanvas, options.settings)
            else if (options.technique === 'parallel') canvas = renderSideBySide(eyes.leftCanvas, eyes.rightCanvas, false)
            else if (options.technique === 'cross') canvas = renderSideBySide(eyes.leftCanvas, eyes.rightCanvas, true)
            else if (options.technique === 'halfsbs') canvas = renderHalfSbs(eyes.leftCanvas, eyes.rightCanvas)
            else if (options.technique === 'topbottom') canvas = renderTopBottom(eyes.leftCanvas, eyes.rightCanvas)
            else if (options.technique === 'rowinterlaced') canvas = renderInterlaced(eyes.leftCanvas, eyes.rightCanvas, 'row')
            else if (options.technique === 'columninterlaced') canvas = renderInterlaced(eyes.leftCanvas, eyes.rightCanvas, 'column')
            else canvas = renderInterlaced(eyes.leftCanvas, eyes.rightCanvas, 'checker')
        }
        return { blob: await canvasBlob(canvas, options.format, options.quality), width: canvas.width, height: canvas.height }
    } finally {
        left.close()
        right.close()
    }
}
