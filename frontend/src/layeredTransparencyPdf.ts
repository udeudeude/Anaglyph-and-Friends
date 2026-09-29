export type PrintPageImage = { jpeg: Uint8Array; width: number; height: number }
const encode = (text: string) => new TextEncoder().encode(text)
const PAGE_WIDTH = 612 // US Letter, 8.5 x 11 in
const PAGE_HEIGHT = 792

export function layeredTransparencyPdf(pages: PrintPageImage[]): Blob {
    if (!pages.length || pages.some(page => !page.width || !page.height || !page.jpeg.length)) throw new Error('The printable pages are incomplete.')
    const objects: Uint8Array[] = []
    const object = (id: number, parts: (string | Uint8Array)[]) => {
        const bytes = parts.map(part => typeof part === 'string' ? encode(part) : part)
        objects[id - 1] = new Uint8Array(bytes.reduce((total, part) => total + part.length, 0))
        let cursor = 0
        for (const part of bytes) { objects[id - 1].set(part, cursor); cursor += part.length }
    }
    object(1, ['<< /Type /Catalog /Pages 2 0 R >>'])
    object(2, [`<< /Type /Pages /Count ${pages.length} /Kids [${pages.map((_, i) => `${3 + i * 3} 0 R`).join(' ')}] >>`])
    pages.forEach((page, index) => {
        const pageId = 3 + index * 3
        const imageId = pageId + 1
        const contentId = pageId + 2
        object(pageId, [`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_WIDTH} ${PAGE_HEIGHT}] /Resources << /XObject << /Im ${imageId} 0 R >> >> /Contents ${contentId} 0 R >>`])
        object(imageId, [`<< /Type /XObject /Subtype /Image /Width ${page.width} /Height ${page.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${page.jpeg.length} >>\nstream\n`, page.jpeg, '\nendstream'])
        const content = encode(`q\n${PAGE_WIDTH} 0 0 ${PAGE_HEIGHT} 0 0 cm\n/Im Do\nQ\n`)
        object(contentId, [`<< /Length ${content.length} >>\nstream\n`, content, 'endstream'])
    })
    const header = encode('%PDF-1.4\n%ANAGLYPH-FRIENDS\n')
    const parts: (Uint8Array | string)[] = [header]
    let byteOffset = header.length
    const offsets = [0]
    for (let i = 0; i < objects.length; i += 1) {
        offsets.push(byteOffset)
        const prefix = encode(`${i + 1} 0 obj\n`), suffix = encode('\nendobj\n')
        parts.push(prefix, objects[i], suffix)
        byteOffset += prefix.length + objects[i].length + suffix.length
    }
    parts.push(`xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.slice(1).map(offset => `${String(offset).padStart(10, '0')} 00000 n \n`).join('')}trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${byteOffset}\n%%EOF\n`)
    return new Blob(parts, { type: 'application/pdf' })
}
