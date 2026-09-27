import assert from 'node:assert/strict'
import {
    AUTOMATIC_DEPTH_GENERATOR,
    DEPTH_GENERATORS,
    resolveDepthGenerator,
} from './depthGenerators.ts'

for (const runtime of ['browser', 'local']) {
    const recommended = resolveDepthGenerator(AUTOMATIC_DEPTH_GENERATOR, runtime)
    assert.equal(recommended.id, 'depth-anything-v2-small')
    assert.equal(resolveDepthGenerator(recommended.id, runtime), recommended)
    assert.equal(recommended.depthConvention, 'near-is-high')
}

assert.deepEqual(DEPTH_GENERATORS.map(generator => generator.id), ['depth-anything-v2-small'])
assert.throws(() => resolveDepthGenerator('depth-anything-v3-small', 'browser'), /unavailable/)
assert.throws(() => resolveDepthGenerator('depth-pro', 'local'), /unavailable/)
console.log('Depth generator selection passed')
