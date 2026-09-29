import assert from 'node:assert/strict'
import { layeredTransparencyPdf } from './layeredTransparencyPdf.ts'

const page = { jpeg: new Uint8Array([255, 216, 255, 217]), width: 100, height: 100 }
const blob = layeredTransparencyPdf([page, page, page])
assert.equal(blob.type, 'application/pdf')
const pdf = new TextDecoder().decode(await blob.arrayBuffer())
assert.match(pdf, /\/Count 3/)
assert.equal((pdf.match(/\/Subtype \/Image/g) || []).length, 3)
assert.equal((pdf.match(/\/MediaBox \[0 0 612 792\]/g) || []).length, 3)
assert.match(pdf, /%%EOF/)
assert.throws(() => layeredTransparencyPdf([]), /incomplete/)
console.log('Layered transparency letter-page PDF structure passed')
