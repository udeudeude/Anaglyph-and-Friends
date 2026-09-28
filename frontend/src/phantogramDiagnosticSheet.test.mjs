import assert from 'node:assert/strict'
import { comparisonCandidates, diagnosticSheetGeometry, renderPhantogramDiagnosticSheet, SHEET_HEIGHT_MM, SHEET_WIDTH_MM } from './phantogramDiagnosticSheet.ts'
import { projectPointToPrint } from './modelPhantogram.ts'

const settings = { eyeHeightIn: 14, viewDistanceIn: 20, ipdMm: 63, reliefMm: 35, glasses: 'red-cyan' }
for (const sweep of ['height', 'distance']) {
    const candidates = comparisonCandidates(settings, sweep)
    assert.equal(candidates.length, 3)
    assert.deepEqual(candidates.map(item => sweep === 'height' ? item.eyeHeightIn : item.viewDistanceIn), [0.8, 1, 1.2].map(factor => factor * (sweep === 'height' ? 14 : 20)))
    assert(candidates.every(item => (sweep === 'height' ? item.viewDistanceIn === 20 : item.eyeHeightIn === 14)))

    const geometry = diagnosticSheetGeometry(settings, sweep)
    assert(geometry.heightMm > 5 && geometry.heightMm <= 20)
    for (const [index, shapes] of geometry.shapes.entries()) {
        assert.deepEqual(shapes.map(shape => shape.edges.length), [12, 6, 6])
        assert.deepEqual(shapes.map(shape => shape.vertices.length), [8, 4, 4])
        const [cube, pointNear, faceNear] = shapes
        assert.equal(cube.vertices.filter(point => point[2] === 0).length, 4)
        assert.equal(cube.vertices.filter(point => point[2] === geometry.heightMm).length, 4)
        assert.equal(pointNear.vertices.filter(point => point[1] === Math.min(...pointNear.vertices.map(vertex => vertex[1]))).length, 1)
        assert.equal(faceNear.vertices.filter(point => point[1] === Math.min(...faceNear.vertices.map(vertex => vertex[1]))).length, 2)
        const candidate = geometry.candidates[index]
        for (const shape of shapes) for (const point of shape.vertices) for (const side of [-1, 1]) {
            const projected = projectPointToPrint(point, [side * settings.ipdMm / 2, -candidate.viewDistanceIn * 25.4, candidate.eyeHeightIn * 25.4])
            assert(projected && projected.x >= candidate.panel.minX + 2 && projected.x <= candidate.panel.maxX - 2)
            assert(projected.y >= 85 && projected.y <= 160)
        }
    }
    const pdf = renderPhantogramDiagnosticSheet(settings, sweep, 'pdf')
    assert.equal(pdf.type, 'application/pdf')
    const bytes = await pdf.arrayBuffer()
    const content = new TextDecoder().decode(bytes)
    assert(content.startsWith('%PDF-1.4'))
    assert(content.includes('/MediaBox [0 0 792.000 612.000]'))
    assert(content.includes('/BM /Multiply'))
    assert(content.includes('50 mm rule'))
    assert(content.includes(sweep === 'height' ? 'EYE HEIGHT' : 'EYE DISTANCE'))
}
assert.equal(SHEET_WIDTH_MM, 279.4)
assert.equal(SHEET_HEIGHT_MM, 215.9)
const svg = await renderPhantogramDiagnosticSheet({ ...settings, glasses: 'red-green' }, 'height', 'svg').text()
assert(svg.includes('width="279.4mm" height="215.9mm"'))
assert(svg.includes('ANAGLYPH &amp; FRIENDS'))
assert(!svg.includes('ANAGLYPH & FRIENDS'))
assert(svg.includes('stroke="#ff29ff"'))
assert((await renderPhantogramDiagnosticSheet({ ...settings, glasses: 'red-blue' }, 'height', 'svg').text()).includes('stroke="#ffff29"'))
assert.throws(() => diagnosticSheetGeometry({ ...settings, eyeHeightIn: 0 }, 'height'), /positive eye height/)
console.log('Phantogram wireframe sheet geometry and vector export passed')
