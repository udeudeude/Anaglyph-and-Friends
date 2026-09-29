import assert from 'node:assert/strict'
import { assignViewMasterDrop } from './viewMasterDrop.ts'

const left = new File(['L'], 'left.png', { type: 'image/png' })
const right = new File(['R'], 'right.jpg', { type: 'image/jpeg' })
assert.deepEqual(assignViewMasterDrop([left], 'single', 'right'), { mode: 'single', file: left })
assert.deepEqual(assignViewMasterDrop([left], 'pair', 'left'), { mode: 'pair', left })
assert.deepEqual(assignViewMasterDrop([right], 'pair', 'right'), { mode: 'pair', right })
assert.deepEqual(assignViewMasterDrop([left, right], 'pair', 'right'), { mode: 'pair', left, right })
assert.equal(assignViewMasterDrop([], 'single', 'left'), null)
assert.throws(() => assignViewMasterDrop([left, right], 'single', 'left'), /Drop one image/)
assert.throws(() => assignViewMasterDrop([left, right, left], 'pair', 'left'), /Drop one eye image or two/)
assert.throws(() => assignViewMasterDrop([new File(['x'], 'note.txt', { type: 'text/plain' })], 'single', 'left'), /image files only/)
console.log('View-Master dropped-image routing passed')
