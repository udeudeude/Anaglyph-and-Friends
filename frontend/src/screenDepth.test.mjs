import assert from 'node:assert/strict'
import { pointInContainedImage, screenDepthParameters } from './screenDepth.ts'

// A wide image inside a square viewport has top/bottom letterboxing.
const frame = { left: 10, top: 20, width: 200, height: 200 }
assert.deepEqual(pointInContainedImage(110, 120, frame, 400, 200), { x: .5, y: .5 })
assert.equal(pointInContainedImage(110, 30, frame, 400, 200), null)
assert.deepEqual(pointInContainedImage(10, 70, frame, 400, 200), { x: 0, y: 0 })
// Portrait letterboxing and a translated/scaled image must sample the same point.
assert.equal(pointInContainedImage(15, 120, frame, 100, 200), null)
assert.deepEqual(pointInContainedImage(250, 220, { left: 50, top: 120, width: 400, height: 200 }, 400, 200), { x: .5, y: .5 })
assert.equal(pointInContainedImage(0, 0, frame, 0, 0), null)
assert.deepEqual(screenDepthParameters(null), {})
assert.deepEqual(screenDepthParameters(0), { screen_depth: '0' })
assert.deepEqual(screenDepthParameters(.625), { screen_depth: '0.625' })
console.log('Screen-depth selection: contained image coordinates and zero-plane parameters passed')
