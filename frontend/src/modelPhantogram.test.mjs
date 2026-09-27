import assert from 'node:assert/strict'
import { makePhantogramTestBlock, parseModelFile, prepareTriangles, projectPointToPrint } from './modelPhantogram.ts'

const settings = {
    widthIn: 8, heightIn: 6, dpi: 150, viewDistanceIn: 20,
    eyeHeightIn: 14, ipdMm: 63, reliefMm: 35,
    glasses: 'red-cyan', rotateX: 0, rotateY: 0, rotateZ: 0, footprintPct: 50,
}
const printMesh = prepareTriangles({ name: 'rectangle', triangles: [{
    a: [0, 0, 0], b: [2, 0, 0], c: [0, 1, 1], color: [200, 200, 200],
}] }, settings)
const points = [printMesh[0].a, printMesh[0].b, printMesh[0].c]
const extent = axis => Math.max(...points.map(point => point[axis])) - Math.min(...points.map(point => point[axis]))
assert.ok(Math.abs(extent(0) / extent(1) - 2) < 1e-8, 'model footprint keeps its proportions')
assert.ok(Math.abs(extent(2) - 35) < 1e-8)
assert.ok(makePhantogramTestBlock().triangles.length === 10)

const testBlock = prepareTriangles(makePhantogramTestBlock(), { ...settings, footprintPct: 72 })
for (const tri of testBlock) for (const point of [tri.a, tri.b, tri.c]) for (const eyeX of [-31.5, 31.5]) {
    const print = projectPointToPrint(point, [eyeX, -508, 355.6])
    assert.ok(print && print.x >= -8 * 25.4 / 2 && print.x <= 8 * 25.4 / 2)
    assert.ok(print.y >= 0 && print.y <= 6 * 25.4, 'both eye projections fit the physical print')
}
assert.throws(() => prepareTriangles(makePhantogramTestBlock(), { ...settings, reliefMm: 100, eyeHeightIn: 4 }), /too large/)

const eyeZ = 14 * 25.4, eyeY = -20 * 25.4
const left = projectPointToPrint([0, 60, 35], [-31.5, eyeY, eyeZ])
const right = projectPointToPrint([0, 60, 35], [31.5, eyeY, eyeZ])
const flat = projectPointToPrint([0, 60, 0], [-31.5, eyeY, eyeZ])
assert.ok(left && right && flat)
assert.ok(Math.abs((left.x - right.x) - 63 * 35 / (eyeZ - 35)) < 1e-8, 'left/right print positions create crossed pop-out disparity')
assert.ok(left.y > 60 && right.y > 60, 'raised point shifts away from the viewer on the paper')
assert.ok(Math.abs(flat.x) < 1e-8 && Math.abs(flat.y - 60) < 1e-8, 'print-plane points stay fixed')
assert.ok(left.distance < flat.distance, 'raised geometry wins occlusion from the eye')

// Minimal glTF binary: a vertical Y-up triangle must become a vertical Z-up
// triangle, not a triangle lying flat on the paper.
const positions = new Float32Array([0, 0, 0, 1, 0, 0, 0, 2, 0])
const indices = new Uint16Array([0, 1, 2])
const json = {
    asset: { version: '2.0' }, buffers: [{ byteLength: 44 }],
    bufferViews: [{ buffer: 0, byteOffset: 0, byteLength: 36 }, { buffer: 0, byteOffset: 36, byteLength: 6 }],
    accessors: [{ bufferView: 0, componentType: 5126, count: 3, type: 'VEC3' }, { bufferView: 1, componentType: 5123, count: 3, type: 'SCALAR' }],
    meshes: [{ primitives: [{ attributes: { POSITION: 0 }, indices: 1 }] }], nodes: [{ mesh: 0 }], scenes: [{ nodes: [0] }], scene: 0,
}
const jsonBytes = new TextEncoder().encode(JSON.stringify(json))
const paddedJsonLength = Math.ceil(jsonBytes.length / 4) * 4
const bytes = new Uint8Array(12 + 8 + paddedJsonLength + 8 + 44)
const view = new DataView(bytes.buffer)
view.setUint32(0, 0x46546c67, true); view.setUint32(4, 2, true); view.setUint32(8, bytes.length, true)
view.setUint32(12, paddedJsonLength, true); view.setUint32(16, 0x4e4f534a, true)
bytes.fill(32, 20, 20 + paddedJsonLength); bytes.set(jsonBytes, 20)
const binOffset = 20 + paddedJsonLength
view.setUint32(binOffset, 44, true); view.setUint32(binOffset + 4, 0x004e4942, true)
bytes.set(new Uint8Array(positions.buffer), binOffset + 8)
bytes.set(new Uint8Array(indices.buffer), binOffset + 8 + 36)
const glb = await parseModelFile(new File([bytes], 'vertical.glb'))
assert.equal(glb.triangles.length, 1)
assert.deepEqual(glb.triangles[0].c, [0, 0, 2], 'glTF Y up becomes print Z up')

console.log('Phantogram model geometry passed')
