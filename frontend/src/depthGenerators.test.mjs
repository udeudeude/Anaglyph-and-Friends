import assert from 'node:assert/strict'
import {
    AUTOMATIC_DEPTH_GENERATOR,
    DEPTH_GENERATORS,
    activeDepthMapPath,
    generatorDiffersFromActive,
    resolveDepthGenerator,
} from './depthGenerators.ts'
import { v3InputSize, v3NearPixels } from './depthV3Math.ts'

for (const runtime of ['browser', 'local']) {
    const recommended = resolveDepthGenerator(AUTOMATIC_DEPTH_GENERATOR, runtime)
    assert.equal(recommended.id, 'depth-anything-v2-small')
    assert.equal(resolveDepthGenerator(recommended.id, runtime), recommended)
    assert.equal(recommended.depthConvention, 'near-is-high')
}

assert.deepEqual(DEPTH_GENERATORS.map(generator => generator.id), ['depth-anything-v2-small', 'depth-anything-v3-small'])
assert.equal(resolveDepthGenerator('depth-anything-v3-small', 'browser').depthConvention, 'near-is-high')
assert.equal(activeDepthMapPath('depth-anything-v3-small', 'browser'), '/depth-map')
assert.equal(activeDepthMapPath('automatic', 'browser'), '/depth-map')
assert.equal(activeDepthMapPath('automatic', 'local'), '/depth-map?generator=automatic')
assert.equal(generatorDiffersFromActive('automatic', 'depth-anything-v2-small', 'browser'), false)
assert.equal(generatorDiffersFromActive('depth-anything-v2-small', 'automatic', 'local'), false)
assert.equal(generatorDiffersFromActive('depth-anything-v3-small', 'automatic', 'browser'), true)
assert.throws(() => activeDepthMapPath('depth-anything-v3-small', 'local'), /unavailable/)
assert.throws(() => resolveDepthGenerator('depth-anything-v3-small', 'local'), /unavailable/)
assert.throws(() => resolveDepthGenerator('depth-pro', 'local'), /unavailable/)
assert.deepEqual(v3InputSize(1600, 1200, 504), [504, 378])
assert.deepEqual(v3InputSize(1200, 1600, 252), [196, 252])
assert.deepEqual(Array.from(v3NearPixels([1, 2, 3], 3, 1)), [255, 255, 255, 255, 128, 128, 128, 255, 0, 0, 0, 255])
assert.deepEqual(Array.from(v3NearPixels([3, 3], 2, 1)), [128, 128, 128, 255, 128, 128, 128, 255])
assert.throws(() => v3NearPixels([Number.NaN], 1, 1), /non-finite/)
assert.throws(() => v3NearPixels([1], 2, 1), /shape/)
console.log('Depth generator selection passed')
