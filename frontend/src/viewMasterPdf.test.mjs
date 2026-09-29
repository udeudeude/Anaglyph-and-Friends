import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

// Node's type-stripping runner does not resolve Vite's extensionless TypeScript imports.
const temporary = mkdtempSync(join(tmpdir(), 'viewmaster-pdf-'))
writeFileSync(join(temporary, 'viewMasterCrop.ts'), readFileSync(new URL('./viewMasterCrop.ts', import.meta.url)))
writeFileSync(join(temporary, 'viewMasterPdf.ts'), readFileSync(new URL('./viewMasterPdf.ts', import.meta.url), 'utf8').replace("from './viewMasterCrop'", "from './viewMasterCrop.ts'"))
const { downloadViewMasterPdf } = await import(pathToFileURL(join(temporary, 'viewMasterPdf.ts')).href)
rmSync(temporary, { recursive: true, force: true })

let exportedBlob
globalThis.Image = class {
    naturalWidth = 200
    naturalHeight = 100
    set src(_value) { queueMicrotask(() => this.onload()) }
}
globalThis.document = {
    createElement: tag => tag === 'canvas' ? {
        width: 0, height: 0,
        getContext: () => ({ fillRect() {}, drawImage() {}, set fillStyle(_value) {} }),
        toBlob: callback => callback(new Blob([new Uint8Array([255, 216, 255, 217])])),
    } : { click() {}, remove() {}, set href(_value) {}, set download(_value) {} },
    body: { appendChild() {} },
}
globalThis.URL.createObjectURL = blob => { exportedBlob = blob; return 'blob:test' }
globalThis.URL.revokeObjectURL = () => {}
globalThis.window = { setTimeout() {} }

const eye = { url: 'data:image/png;base64,test', width: 200, height: 100 }
const pairs = Array.from({ length: 7 }, () => ({ left: eye, right: eye }))
const crops = Array.from({ length: 7 }, () => ({ x: 0.25, y: 0.5 }))
await downloadViewMasterPdf(pairs, 0, crops, 'MY (REEL)')
assert.equal(exportedBlob.type, 'application/pdf')
const pdf = new TextDecoder().decode(await exportedBlob.arrayBuffer())
assert.ok(pdf.includes('(MY \\(REEL\\)) Tj'))
assert.match(pdf, /\(1L\) Tj/)
assert.match(pdf, /\(7R\) Tj/)
assert.equal((pdf.match(/\/Subtype \/Image/g) || []).length, 14)
assert.equal((pdf.match(/\bh\nW n/g) || []).length, 14, 'each eye is clipped by a closed rounded path')
assert.ok(!pdf.includes(' re W n'), 'rectangular frame clips have been replaced')
console.log('View-Master PDF title, labels, rounded frames, and images passed')
