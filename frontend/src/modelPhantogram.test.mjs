import assert from 'node:assert/strict'
import { makePhantogramTestBlock, parseModelFile, prepareTriangles, projectPointToPrint, printPixelCoordinates, renderEye } from './modelPhantogram.ts'

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
assert.ok(Math.abs(extent(0) / extent(2) - 2) < 1e-8, 'model width and height share the same physical scale')
assert.ok(Math.abs(extent(2) - 35) < 1e-8)
assert.ok(makePhantogramTestBlock().triangles.length === 10)

const testBlock = prepareTriangles(makePhantogramTestBlock(), { ...settings, footprintPct: 72 })
const blockPoints = testBlock.flatMap(tri => [tri.a, tri.b, tri.c])
const blockExtent = axis => Math.max(...blockPoints.map(point => point[axis])) - Math.min(...blockPoints.map(point => point[axis]))
for (const axis of [0, 1, 2]) assert.ok(Math.abs(blockExtent(axis) - 35) < 1e-8, 'unit test block stays a 35 mm cube, not a wide slab')
for (const tri of testBlock) for (const point of [tri.a, tri.b, tri.c]) for (const eyeX of [-31.5, 31.5]) {
    const print = projectPointToPrint(point, [eyeX, -508, 355.6])
    assert.ok(print && print.x >= -8 * 25.4 / 2 && print.x <= 8 * 25.4 / 2)
    assert.ok(print.y >= 0 && print.y <= 6 * 25.4, 'both eye projections fit the physical print')
}
const constrained = prepareTriangles(makePhantogramTestBlock(), { ...settings, footprintPct: 10 })
const constrainedPoints = constrained.flatMap(tri => [tri.a, tri.b, tri.c])
const constrainedExtent = axis => Math.max(...constrainedPoints.map(point => point[axis])) - Math.min(...constrainedPoints.map(point => point[axis]))
assert.ok(constrainedExtent(2) < settings.reliefMm, 'print footprint can reduce the actual model height')
assert.ok(Math.abs(constrainedExtent(0) - constrainedExtent(2)) < 1e-8, 'fitting does not distort the cube')
assert.throws(() => prepareTriangles(makePhantogramTestBlock(), { ...settings, reliefMm: 120, eyeHeightIn: 4 }), /Eye height must exceed/)

// Exercise the rasterizer, not only the vertex projection. From the intended
// eye, both the top and the near wall of the cube must occupy the print.
globalThis.ImageData ??= class ImageData { constructor(data, width, height) { Object.assign(this, { data, width, height }) } }
const eye = [-31.5, -508, 355.6]
const eyeImage = renderEye(testBlock, eye, 203.2, 152.4, 800, 600)
const nearY = Math.min(...blockPoints.map(point => point[1]))
const centerY = (nearY + Math.max(...blockPoints.map(point => point[1]))) / 2
const sample = point => {
    const paper = projectPointToPrint(point, eye)
    const pixel = printPixelCoordinates(paper, 203.2, 152.4, 800, 600)
    const index = (Math.floor(pixel.y) * 800 + Math.floor(pixel.x)) * 4
    return [...eyeImage.data.slice(index, index + 3)]
}
const topColor = sample([0, centerY, 35])
const nearColor = sample([0, nearY, 17.5])
assert.ok(topColor.every(channel => channel < 255), 'cube top is rendered in the left-eye print')
assert.ok(nearColor.every(channel => channel < 255), 'cube near wall is rendered in the left-eye print')
assert.notDeepEqual(topColor, nearColor, 'top and near wall remain distinct 3D faces')

const eyeZ = 14 * 25.4, eyeY = -20 * 25.4
const left = projectPointToPrint([0, 60, 35], [-31.5, eyeY, eyeZ])
const right = projectPointToPrint([0, 60, 35], [31.5, eyeY, eyeZ])
const flat = projectPointToPrint([0, 60, 0], [-31.5, eyeY, eyeZ])
assert.ok(left && right && flat)
assert.ok(Math.abs((left.x - right.x) - 63 * 35 / (eyeZ - 35)) < 1e-8, 'left/right print positions create crossed pop-out disparity')
assert.ok(left.y > 60 && right.y > 60, 'raised point shifts away from the viewer on the paper')
const raisedRow = printPixelCoordinates(left, 203.2, 152.4, 800, 600).y
const flatRow = printPixelCoordinates(flat, 203.2, 152.4, 800, 600).y
assert.ok(raisedRow < flatRow, 'raised point moves toward the far/top edge of the upright image')
assert.equal(printPixelCoordinates({ x: 0, y: 0 }, 203.2, 152.4, 800, 600).y, 599, 'bottom row is the near edge')
assert.ok(Math.abs(flat.x) < 1e-8 && Math.abs(flat.y - 60) < 1e-8, 'print-plane points stay fixed')
assert.ok(left.distance < flat.distance, 'raised geometry wins occlusion from the eye')
for (const [eye, print] of [[[-31.5, eyeY, eyeZ], left], [[31.5, eyeY, eyeZ], right]]) {
    const alongRay = (eyeZ - 35) / eyeZ
    assert.ok(Math.abs(eye[0] + alongRay * (print.x - eye[0])) < 1e-8)
    assert.ok(Math.abs(eye[1] + alongRay * (print.y - eye[1]) - 60) < 1e-8, 'looking through the print reaches the original 3D point')
}

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
