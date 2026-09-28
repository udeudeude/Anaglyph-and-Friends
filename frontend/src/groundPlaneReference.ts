/** A known planar rectangle for photographing an object with visible reference corners. */
export const REFERENCE_WIDTH_IN = 8
export const REFERENCE_HEIGHT_IN = 6
const PAGE_WIDTH_PT = 11 * 72
const PAGE_HEIGHT_PT = 8.5 * 72
const PT_PER_MM = 72 / 25.4
const encode = (value: string) => new TextEncoder().encode(value)
const pt = (value: number) => value.toFixed(3)

export function renderGroundPlaneReferencePdf(): Blob {
    const width = REFERENCE_WIDTH_IN * 72, height = REFERENCE_HEIGHT_IN * 72
    const left = (PAGE_WIDTH_PT - width) / 2, bottom = (PAGE_HEIGHT_PT - height) / 2
    const right = left + width, top = bottom + height
    const ruleStart = 600, ruleEnd = ruleStart + 50 * PT_PER_MM
    const commands = [
        '0 G 0 g',
        '0.7 w', `${pt(left)} ${pt(bottom)} ${pt(width)} ${pt(height)} re S`,
        '0.5 w', `${ruleStart} 568 m ${pt(ruleEnd)} 568 l S`,
        `${ruleStart} 563 m ${ruleStart} 573 l S`, `${pt(ruleEnd)} 563 m ${pt(ruleEnd)} 573 l S`,
        'BT /F1 12 Tf 108 578 Td (PHOTOGRAPHED GROUND PLANE / 8 x 6 in) Tj ET',
        'BT /F1 9 Tf 600 578 Td (50 mm check) Tj ET',
        `BT /F1 10 Tf ${pt(left + width / 2 - 26)} ${pt(top + 17)} Td (FAR EDGE) Tj ET`,
        `BT /F1 10 Tf ${pt(left + width / 2 - 55)} ${pt(bottom - 23)} Td (NEAR EDGE / CAMERA) Tj ET`,
        `BT /F1 11 Tf ${pt(left - 17)} ${pt(top + 6)} Td (1) Tj ET`,
        `BT /F1 11 Tf ${pt(right + 8)} ${pt(top + 6)} Td (2) Tj ET`,
        `BT /F1 11 Tf ${pt(right + 8)} ${pt(bottom - 10)} Td (3) Tj ET`,
        `BT /F1 11 Tf ${pt(left - 17)} ${pt(bottom - 10)} Td (4) Tj ET`,
        'BT /F1 9 Tf 108 32 Td (Print at Actual Size. Keep all four border corners visible around the object.) Tj ET',
        'BT /F1 9 Tf 108 20 Td (Use this 8 x 6 in area as the print size; the object height remains approximate.) Tj ET',
    ]
    const content = encode(commands.join('\n'))
    const objects = [
        '<< /Type /Catalog /Pages 2 0 R >>',
        '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
        `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_WIDTH_PT} ${PAGE_HEIGHT_PT}] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>`,
        '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    ]
    const parts: Uint8Array[] = [encode('%PDF-1.4\n%ANAGLYPH-FRIENDS\n')]
    const offsets = [0]
    let size = parts[0].length
    for (const [index, value] of objects.entries()) {
        const bytes = encode(`${index + 1} 0 obj\n${value}\nendobj\n`)
        offsets.push(size); size += bytes.length; parts.push(bytes)
    }
    const stream = encode(`5 0 obj\n<< /Length ${content.length} >>\nstream\n`)
    offsets.push(size); size += stream.length + content.length
    parts.push(stream, content)
    const end = encode('\nendstream\nendobj\n')
    size += end.length; parts.push(end)
    parts.push(encode(`xref\n0 6\n0000000000 65535 f \n${offsets.slice(1).map(offset => `${String(offset).padStart(10, '0')} 00000 n \n`).join('')}trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${size}\n%%EOF\n`))
    return new Blob(parts, { type: 'application/pdf' })
}
