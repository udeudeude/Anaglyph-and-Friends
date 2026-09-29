import assert from 'node:assert/strict'
import { CENTER_CROP, coverPlacement, draggedCrop } from './viewMasterCrop.ts'

const near = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-9, `${actual} differs from ${expected}`)

// Wide source: changing horizontal framing moves only the horizontal crop.
const centered = coverPlacement(200, 100, 100, 100, CENTER_CROP)
assert.deepEqual(centered, { x: -50, y: 0, width: 200, height: 100 })
assert.deepEqual(coverPlacement(200, 100, 100, 100, { x: 0, y: 0 }), { x: 0, y: 0, width: 200, height: 100 })
assert.deepEqual(coverPlacement(200, 100, 100, 100, { x: 1, y: 1 }), { x: -100, y: 0, width: 200, height: 100 })

// Tall source: the vertical crop moves in the top-down SVG convention.
assert.deepEqual(coverPlacement(100, 200, 100, 100, CENTER_CROP), { x: 0, y: -50, width: 100, height: 200 })
assert.deepEqual(coverPlacement(100, 200, 100, 100, { x: 0, y: 0 }), { x: 0, y: 0, width: 100, height: 200 })
assert.deepEqual(coverPlacement(100, 200, 100, 100, { x: 1, y: 1 }), { x: 0, y: -100, width: 100, height: 200 })

const fractional = coverPlacement(200, 100, 100, 100, { x: 0.25, y: 0.8 })
near(fractional.x, -25)
assert.equal(fractional.y, 0)
assert.equal(coverPlacement(200, 100, 100, 100, { x: -3, y: 9 }).x, 0)
assert.equal(coverPlacement(200, 100, 100, 100, { x: Number.NaN, y: 0.5 }).x, -50)

// Different eye dimensions still cover the same frame with the same position.
for (const [width, height] of [[300, 150], [240, 180]]) {
    const frame = coverPlacement(width, height, 11.75, 10.5, { x: 0.7, y: 0.3 })
    assert.ok(frame.x <= 0 && frame.y <= 0)
    assert.ok(frame.x + frame.width >= 11.75 && frame.y + frame.height >= 10.5)
}
assert.throws(() => coverPlacement(0, 100, 100, 100, CENTER_CROP), /positive dimensions/)
assert.deepEqual(draggedCrop(200, 100, 100, 100, CENTER_CROP, 25, 30), { x: 0.25, y: 0.5 })
assert.deepEqual(draggedCrop(100, 200, 100, 100, CENTER_CROP, 20, -25), { x: 0.5, y: 0.75 })
assert.deepEqual(draggedCrop(200, 100, 100, 100, CENTER_CROP, -1000, 0), { x: 1, y: 0.5 })
console.log('View-Master crop geometry passed')
