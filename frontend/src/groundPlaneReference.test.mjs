import assert from 'node:assert/strict'
import { REFERENCE_HEIGHT_IN, REFERENCE_WIDTH_IN, renderGroundPlaneReferencePdf } from './groundPlaneReference.ts'

assert.equal(REFERENCE_WIDTH_IN, 8)
assert.equal(REFERENCE_HEIGHT_IN, 6)
const pdf = renderGroundPlaneReferencePdf()
assert.equal(pdf.type, 'application/pdf')
const data = new TextDecoder().decode(await pdf.arrayBuffer())
assert(data.startsWith('%PDF-1.4'))
assert(data.includes('/MediaBox [0 0 792 612]'))
// 8 × 6 inches on the Letter page; these are the actual corners the user marks.
assert(data.includes('108.000 90.000 576.000 432.000 re S'))
assert(data.includes('600 568 m 741.732 568 l S')) // 50 mm at 72 points per inch
assert(data.includes('(1) Tj') && data.includes('(2) Tj') && data.includes('(3) Tj') && data.includes('(4) Tj'))
assert(data.includes('object height remains approximate'))
console.log('Ground-plane reference PDF geometry passed')
