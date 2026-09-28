import { projectPointToPrint } from './modelPhantogram.ts'
import type { ModelPhantogramSettings } from './modelPhantogram.ts'

type Vec3 = [number, number, number]
type Edge = { a: Vec3; b: Vec3 }
type Sweep = 'height' | 'distance'
type Candidate = { label: string; eyeHeightIn: number; viewDistanceIn: number; panel: { minX: number; maxX: number } }

export const SHEET_WIDTH_MM = 279.4 // US Letter landscape, 11 inches
export const SHEET_HEIGHT_MM = 215.9 // 8.5 inches
const PT_PER_MM = 72 / 25.4
const PANEL_MARGIN_MM = 9
const PANEL_GAP_MM = 4
const PANEL_WIDTH_MM = (SHEET_WIDTH_MM - 2 * PANEL_MARGIN_MM - 2 * PANEL_GAP_MM) / 3
const SHAPE_CENTER_Y_MM = 100
const SHAPE_SPACING_MM = 22
const DARK = 0.16

const encode = (s: string) => new TextEncoder().encode(s)
const mmPt = (value: number) => (value * PT_PER_MM).toFixed(3)
const join = (parts: Uint8Array[]) => {
    const result = new Uint8Array(parts.reduce((size, bytes) => size + bytes.length, 0))
    let offset = 0
    for (const bytes of parts) { result.set(bytes, offset); offset += bytes.length }
    return result
}
const pdfObject = (id: number, value: string) => encode(`${id} 0 obj\n${value}\nendobj\n`)
const pdfText = (value: string) => value.replace(/[\\()]/g, '\\$&')
const svgText = (value: string) => value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;')
const mmX = (x: number) => mmPt(x + SHEET_WIDTH_MM / 2)
const svgX = (x: number) => (x + SHEET_WIDTH_MM / 2).toFixed(3)
const svgY = (y: number) => (SHEET_HEIGHT_MM - y).toFixed(3)

export function comparisonCandidates(settings: ModelPhantogramSettings, sweep: Sweep): Candidate[] {
    const labels = sweep === 'height' ? ['Lower', 'Entered', 'Higher'] : ['Nearer', 'Entered', 'Farther']
    return [0.8, 1, 1.2].map((factor, index) => {
        const minX = -SHEET_WIDTH_MM / 2 + PANEL_MARGIN_MM + index * (PANEL_WIDTH_MM + PANEL_GAP_MM)
        return {
            label: labels[index],
            eyeHeightIn: sweep === 'height' ? settings.eyeHeightIn * factor : settings.eyeHeightIn,
            viewDistanceIn: sweep === 'distance' ? settings.viewDistanceIn * factor : settings.viewDistanceIn,
            panel: { minX, maxX: minX + PANEL_WIDTH_MM },
        }
    })
}

export function wireframeShapes(centerX: number, heightMm: number) {
    const h = heightMm
    const cubeX = centerX - SHAPE_SPACING_MM
    const cube: Vec3[] = [
        [cubeX - h / 2, SHAPE_CENTER_Y_MM - h / 2, 0], [cubeX + h / 2, SHAPE_CENTER_Y_MM - h / 2, 0],
        [cubeX + h / 2, SHAPE_CENTER_Y_MM + h / 2, 0], [cubeX - h / 2, SHAPE_CENTER_Y_MM + h / 2, 0],
        [cubeX - h / 2, SHAPE_CENTER_Y_MM - h / 2, h], [cubeX + h / 2, SHAPE_CENTER_Y_MM - h / 2, h],
        [cubeX + h / 2, SHAPE_CENTER_Y_MM + h / 2, h], [cubeX - h / 2, SHAPE_CENTER_Y_MM + h / 2, h],
    ]
    const cubeEdges: Edge[] = []
    for (let i = 0; i < 4; i += 1) {
        cubeEdges.push({ a: cube[i], b: cube[(i + 1) % 4] }, { a: cube[i + 4], b: cube[(i + 1) % 4 + 4] }, { a: cube[i], b: cube[i + 4] })
    }

    // A regular tetrahedron of height h has base circumradius h/sqrt(2).
    // One base vertex faces the viewer in the first; a triangular face formed
    // by the near base edge and apex faces the viewer in the second.
    const radius = h / Math.sqrt(2)
    const tetra = (x: number, nearVertex: boolean) => {
        const sign = nearVertex ? 1 : -1
        const base: Vec3[] = [
            [x, SHAPE_CENTER_Y_MM - sign * radius, 0],
            [x - Math.sqrt(3) * radius / 2, SHAPE_CENTER_Y_MM + sign * radius / 2, 0],
            [x + Math.sqrt(3) * radius / 2, SHAPE_CENTER_Y_MM + sign * radius / 2, 0],
        ]
        const apex: Vec3 = [x, SHAPE_CENTER_Y_MM, h]
        return { vertices: [...base, apex], edges: [
            { a: base[0], b: base[1] }, { a: base[1], b: base[2] }, { a: base[2], b: base[0] },
            ...base.map(point => ({ a: point, b: apex })),
        ] as Edge[] }
    }
    return [
        { label: 'WIRE CUBE', vertices: cube, edges: cubeEdges },
        { label: 'TETRA: POINT NEAR', ...tetra(centerX, true) },
        { label: 'TETRA: FACE NEAR', ...tetra(centerX + SHAPE_SPACING_MM, false) },
    ]
}

export function diagnosticSheetGeometry(settings: ModelPhantogramSettings, sweep: Sweep) {
    if (![settings.eyeHeightIn, settings.viewDistanceIn, settings.ipdMm, settings.reliefMm].every(Number.isFinite) ||
        settings.eyeHeightIn <= 0 || settings.viewDistanceIn <= 0 || settings.ipdMm <= 0 || settings.reliefMm <= 0) {
        throw new Error('Enter positive eye height, distance, separation, and model height for the diagnostic sheet')
    }
    const candidates = comparisonCandidates(settings, sweep)
    const maxHeight = Math.min(settings.reliefMm, 20)
    const fits = (heightMm: number) => candidates.every(candidate => {
        const eyeZ = candidate.eyeHeightIn * 25.4
        if (eyeZ <= heightMm) return false
        const centerX = (candidate.panel.minX + candidate.panel.maxX) / 2
        return wireframeShapes(centerX, heightMm).every(shape => shape.vertices.every(point => [-1, 1].every(side => {
            const print = projectPointToPrint(point, [side * settings.ipdMm / 2, -candidate.viewDistanceIn * 25.4, eyeZ])
            return print && print.x >= candidate.panel.minX + 2 && print.x <= candidate.panel.maxX - 2 && print.y >= 85 && print.y <= 160
        })))
    })
    let lower = 0, upper = maxHeight
    if (!fits(upper)) {
        for (let i = 0; i < 22; i += 1) {
            const middle = (lower + upper) / 2
            if (fits(middle)) lower = middle
            else upper = middle
        }
        upper = lower * 0.999
    }
    if (upper < 5) throw new Error('The selected viewing setup cannot fit the wireframes on one sheet; reduce the viewing distance or model height')
    return { candidates, shapes: candidates.map(candidate => wireframeShapes((candidate.panel.minX + candidate.panel.maxX) / 2, upper)), heightMm: upper }
}

export function renderPhantogramDiagnosticSheet(settings: ModelPhantogramSettings, sweep: Sweep, format: 'svg' | 'pdf'): Blob {
    const { candidates, shapes, heightMm } = diagnosticSheetGeometry(settings, sweep)
    const svg: string[] = [`<svg xmlns="http://www.w3.org/2000/svg" width="${SHEET_WIDTH_MM}mm" height="${SHEET_HEIGHT_MM}mm" viewBox="0 0 ${SHEET_WIDTH_MM} ${SHEET_HEIGHT_MM}">`, '<rect width="100%" height="100%" fill="white"/>']
    const pdf: string[] = ['0 0 0 RG', '0 0 0 rg']
    const text = (x: number, y: number, value: string, size = 3.2, bold = false) => {
        svg.push(`<text x="${svgX(x)}" y="${svgY(y)}" font-family="Arial, sans-serif" font-size="${size}" font-weight="${bold ? 700 : 400}" fill="#111">${svgText(value)}</text>`)
        pdf.push(`BT /F1 ${mmPt(size)} Tf ${mmX(x)} ${mmPt(y)} Td (${pdfText(value)}) Tj ET`)
    }
    const rule = (a: [number, number], b: [number, number], width = 0.25) => {
        svg.push(`<line x1="${svgX(a[0])}" y1="${svgY(a[1])}" x2="${svgX(b[0])}" y2="${svgY(b[1])}" stroke="#555" stroke-width="${width}"/>`)
        pdf.push('0.33 G', `${mmPt(width)} w`, `${mmX(a[0])} ${mmPt(a[1])} m ${mmX(b[0])} ${mmPt(b[1])} l S`, '0 G')
    }
    text(-SHEET_WIDTH_MM / 2 + 9, SHEET_HEIGHT_MM - 10, 'ANAGLYPH & FRIENDS  /  PHANTOGRAM VIEWING COMPARISON', 4.1, true)
    text(-SHEET_WIDTH_MM / 2 + 9, SHEET_HEIGHT_MM - 17, `US Letter landscape 11 x 8.5 in  |  ${sweep === 'height' ? 'EYE HEIGHT' : 'EYE DISTANCE'} sweep  |  red lens over left eye`, 3)
    rule([-SHEET_WIDTH_MM / 2 + 9, SHEET_HEIGHT_MM - 21], [SHEET_WIDTH_MM / 2 - 9, SHEET_HEIGHT_MM - 21])
    const drawEdge = (edge: Edge, eye: Vec3, left: boolean) => {
        const a = projectPointToPrint(edge.a, eye), b = projectPointToPrint(edge.b, eye)
        if (!a || !b) throw new Error('A wireframe point is above the selected eye position')
        const rightColor = settings.glasses === 'red-green' ? `1 ${DARK} 1` : settings.glasses === 'red-blue' ? `1 1 ${DARK}` : `1 ${DARK} ${DARK}`
        const rightSvgColor = settings.glasses === 'red-green' ? '#ff29ff' : settings.glasses === 'red-blue' ? '#ffff29' : '#ff2929'
        const color = left ? `${DARK} 1 1` : rightColor
        svg.push(`<line x1="${svgX(a.x)}" y1="${svgY(a.y)}" x2="${svgX(b.x)}" y2="${svgY(b.y)}" stroke="${left ? '#29ffff' : rightSvgColor}" stroke-width="0.64" stroke-linecap="round" style="mix-blend-mode:multiply"/>`)
        pdf.push(`${color} RG`, `${mmPt(0.64)} w`, `${mmX(a.x)} ${mmPt(a.y)} m ${mmX(b.x)} ${mmPt(b.y)} l S`)
    }
    candidates.forEach((candidate, i) => {
        const centerX = (candidate.panel.minX + candidate.panel.maxX) / 2
        if (i) rule([candidate.panel.minX - PANEL_GAP_MM / 2, 45], [candidate.panel.minX - PANEL_GAP_MM / 2, SHEET_HEIGHT_MM - 25], 0.18)
        const angle = Math.atan2(candidate.eyeHeightIn * 25.4, candidate.viewDistanceIn * 25.4 + SHAPE_CENTER_Y_MM) * 180 / Math.PI
        text(candidate.panel.minX + 3, SHEET_HEIGHT_MM - 30, `${String.fromCharCode(65 + i)}  ${candidate.label.toUpperCase()}`, 3.8, true)
        text(candidate.panel.minX + 3, SHEET_HEIGHT_MM - 37, `Eye height ${candidate.eyeHeightIn.toFixed(1)} in  /  beyond edge ${candidate.viewDistanceIn.toFixed(1)} in`, 2.6)
        text(candidate.panel.minX + 3, SHEET_HEIGHT_MM - 43, `Sightline to print center ${angle.toFixed(1)} degrees`, 2.6)
        const eyeZ = candidate.eyeHeightIn * 25.4, eyeY = -candidate.viewDistanceIn * 25.4
        pdf.push('q /Mul gs 1 J 1 j')
        for (const shape of shapes[i]) for (const edge of shape.edges) drawEdge(edge, [-settings.ipdMm / 2, eyeY, eyeZ], true)
        for (const shape of shapes[i]) for (const edge of shape.edges) drawEdge(edge, [settings.ipdMm / 2, eyeY, eyeZ], false)
        pdf.push('Q', '0 0 0 RG')
        const shapeXs = [centerX - SHAPE_SPACING_MM, centerX, centerX + SHAPE_SPACING_MM]
        const captions = ['WIRE CUBE', 'POINT NEAR', 'FACE NEAR']
        shapes[i].forEach((_, index) => text(shapeXs[index] - 9, 76, captions[index], 2.8))
    })
    text(-SHEET_WIDTH_MM / 2 + 9, 34, `All wireframes have the same ${heightMm.toFixed(1)} mm height. Eye separation ${settings.ipdMm.toFixed(1)} mm.`, 3)
    text(-SHEET_WIDTH_MM / 2 + 9, 27, 'Keep the midpoint between your eyes above the CENTERLINE OF THE WHOLE SHEET, not over each panel.', 2.8)
    text(-SHEET_WIDTH_MM / 2 + 9, 20, 'Bottom edge nearest you. Lay sheet flat. Print at 100% / Actual Size; disable Fit to Page.', 2.8)
    text(-SHEET_WIDTH_MM / 2 + 9, 13, 'Check the 50 mm rule below with a physical ruler before comparing the images.', 2.8)
    rule([-25, 8], [25, 8], 0.4)
    rule([-25, 6.5], [-25, 9.5], 0.35)
    rule([25, 6.5], [25, 9.5], 0.35)
    if (format === 'svg') return new Blob([svg.join('') + '</svg>'], { type: 'image/svg+xml' })

    const content = encode(pdf.join('\n'))
    const pageWidth = (SHEET_WIDTH_MM * PT_PER_MM).toFixed(3), pageHeight = (SHEET_HEIGHT_MM * PT_PER_MM).toFixed(3)
    const objects = [
        pdfObject(1, '<< /Type /Catalog /Pages 2 0 R >>'),
        pdfObject(2, '<< /Type /Pages /Kids [3 0 R] /Count 1 >>'),
        pdfObject(3, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] /Resources << /Font << /F1 4 0 R >> /ExtGState << /Mul 5 0 R >> >> /Contents 6 0 R >>`),
        pdfObject(4, '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'),
        pdfObject(5, '<< /Type /ExtGState /BM /Multiply >>'),
        join([encode(`6 0 obj\n<< /Length ${content.length} >>\nstream\n`), content, encode('\nendstream\nendobj\n')]),
    ]
    const header = encode('%PDF-1.4\n%ANAGLYPH-FRIENDS\n')
    const offsets: number[] = [0]
    let next = header.length
    for (const object of objects) { offsets.push(next); next += object.length }
    const xref = `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.slice(1).map(offset => `${String(offset).padStart(10, '0')} 00000 n \n`).join('')}trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${next}\n%%EOF\n`
    return new Blob([header, ...objects, encode(xref)], { type: 'application/pdf' })
}
