import assert from 'node:assert/strict'
import { readDepthNpy, sheetForDepth, isolateSheet, renderSheet } from './layeredTransparency.ts'

const headerText = "{'descr': '<f4', 'fortran_order': False, 'shape': (1, 5), }"
const padding = ' '.repeat((16 - (10 + headerText.length + 1) % 16) % 16)
const header = new TextEncoder().encode(`${headerText}${padding}\n`)
const array = new ArrayBuffer(10 + header.length + 20)
const bytes = new Uint8Array(array)
bytes.set([147, 78, 85, 77, 80, 89, 1, 0, header.length & 255, header.length >> 8])
bytes.set(header, 10)
const view = new DataView(array)
;[0, .25, .4, .8, 1].forEach((value, index) => view.setFloat32(10 + header.length + index * 4, value, true))
const depth = readDepthNpy(array)
assert.equal(depth.width, 5)
assert.equal(depth.height, 1)
assert.deepEqual(Array.from(depth.values).map(value => sheetForDepth(value, 4, .25)), [3, 3, 2, 0, 0])
assert.equal(sheetForDepth(.4, 4, .25, true), 1)
assert.equal(sheetForDepth(.4, 4, .8), 3, 'background control consolidates distant values')
assert.throws(() => sheetForDepth(.4, 11, .25), /2 to 10/)
assert.throws(() => readDepthNpy(new ArrayBuffer(16)), /NumPy/)

globalThis.ImageData = class { constructor(width, height) { this.width = width; this.height = height; this.data = new Uint8ClampedArray(width * height * 4) } }
const source = new ImageData(5, 1)
for (let i = 0; i < 5; i += 1) source.data.set([i + 10, 20, 30, 255], i * 4)
const layers = Array.from({ length: 4 }, (_, i) => isolateSheet(source, depth, i, 4, .25))
for (let pixel = 0; pixel < 5; pixel += 1) {
    const owners = layers.filter(layer => layer.data[pixel * 4 + 3] === 255)
    assert.equal(owners.length, 1, 'each source pixel belongs to one physical sheet')
    assert.equal(owners[0].data[pixel * 4], source.data[pixel * 4])
}
const cumulative = Array.from({ length: 4 }, (_, i) => renderSheet(source, depth, i, 4, .25))
const fullBack = Array.from({ length: 4 }, (_, i) => renderSheet(source, depth, i, 4, .25, false, 'full-back'))
for (let pixel = 0; pixel < 5; pixel += 1) {
    const owner = sheetForDepth(depth.values[pixel], 4, .25)
    for (let index = 0; index < 4; index += 1) {
        assert.equal(cumulative[index].data[pixel * 4 + 3] === 255, owner <= index, 'cumulative sheets repeat every foreground pixel behind its first sheet')
        assert.equal(fullBack[index].data[pixel * 4 + 3] === 255, index === owner || index === 3, 'separate slices repeat only on the full back')
    }
    assert.equal(cumulative[3].data[pixel * 4], source.data[pixel * 4], 'cumulative back retains the complete image')
    assert.equal(fullBack[3].data[pixel * 4], source.data[pixel * 4], 'full-back mode retains the complete image')
}
console.log('Layered transparency depth parsing and sheet assignment passed')
