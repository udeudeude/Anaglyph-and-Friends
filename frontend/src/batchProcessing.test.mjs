import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { batchArchiveEntries, collectDroppedImages, runBatchQueue, selectBatchInputs, uniqueOutputPath } from './batchProcessing.ts';
import { createBatchZip } from './batchZip.ts';
import { directOutputUrl, finalOutputUrl, outputFilename } from './techniqueOutput.ts';
import { defaultTechniqueSettings, techniqueInfo } from './techniques.ts';

const photo = (name = 'photo.jpg') => new File(['photo'], name, { type: 'image/jpeg', lastModified: 123 });
const recipe = { technique: 'anaglyph', settings: structuredClone(defaultTechniqueSettings), popOut: true, strength: 1.7,
    swapEyes: true, retinalRivalry: true, screenDepth: .38, format: 'png', jpegQuality: 91,
    depth: { generator: 'automatic', invert: false }, capturedAt: '2026-10-21T12:00:00Z' };
recipe.settings.anaglyph.glasses = 'custom';
recipe.settings.anaglyph.screen = { leftColor: '#aabbcc', rightColor: '#334455', leftGain: 83, rightGain: 72 };
const parameters = new URL(finalOutputUrl('https://local.test', recipe)).searchParams;
for (const [key, value] of Object.entries({ scope: 'full', max_disparity_percentage: '1.7', screen_depth: '0.38', swap_eyes: 'true', format: 'png', quality: '91', anaglyph_left_color: '#aabbcc', anaglyph_right_gain: '72', repairs: 'false' })) assert.equal(parameters.get(key), value, key);
assert.equal(new URL(directOutputUrl('https://local.test', recipe, 'preview', true)).searchParams.get('repairs'), 'true');
for (const technique of Object.keys(techniqueInfo)) {
    const next = { ...recipe, technique };
    const url = new URL(finalOutputUrl('https://local.test', next));
    assert.equal(url.searchParams.get('scope'), ['wiggle', 'pulfrich'].includes(technique) ? 'preview' : 'full');
    assert.ok(outputFilename(next).includes('.'));
}

const used = new Set();
assert.equal(uniqueOutputPath('Trip/foto.jpg', 'anaglyph.png', used), 'Trip/foto--anaglyph.png');
assert.equal(uniqueOutputPath('Trip/foto.png', 'anaglyph.png', used), 'Trip/foto--anaglyph-2.png');
assert.equal(uniqueOutputPath('../Trip\\bad:name.jpg', 'anaglyph.png', used), 'Trip/bad_name--anaglyph.png');
const selected = selectBatchInputs(['folder/10.jpg', 'folder/2.PNG', 'folder/.DS_Store', 'folder/raw.heic', '__MACOSX/1.jpg', 'folder/.hidden/1.png'].map(path => ({ path, file: photo() })));
assert.deepEqual(selected.images.map(x => x.path), ['folder/2.PNG', 'folder/10.jpg']); assert.equal(selected.skipped, 4);

// Directory readers deliver more than one page, and subfolders must be walked.
const entry = name => ({ name, isFile: true, file: resolve => resolve(photo(name)) });
const directory = (name, chunks) => ({ name, isDirectory: true, createReader: () => { let index = 0; return { readEntries: resolve => resolve(chunks[index++] || []) }; } });
const root = directory('trip', [[entry('1.jpg')], [directory('nested', [[entry('2.jpg')]])], []]);
const files = await collectDroppedImages({ items: [{ kind: 'file', webkitGetAsEntry: () => root }], files: [] });
assert.deepEqual(files.map(x => x.path), ['trip/1.jpg', 'trip/nested/2.jpg']);

const items = [1, 2, 3].map(id => ({ id, path: `${id}.jpg`, file: photo(`${id}.jpg`), outputPath: `${id}.png`, status: 'queued', message: '' }));
let paused = false; const calls = [];
const process = async item => { calls.push(item.id); if (item.id === 2) throw new Error('Bad image'); item.depthMap = new Blob(['depth']); return new Blob([`result-${item.id}`], { type: 'image/png' }); };
await runBatchQueue(items, async item => { const result = await process(item); paused = true; return result; }, () => paused, () => {});
assert.deepEqual(calls, [1]); assert.deepEqual(items.map(x => x.status), ['done', 'queued', 'queued']);
await runBatchQueue(items, process, () => false, () => {});
assert.deepEqual(calls, [1, 2, 3]); assert.deepEqual(items.map(x => x.status), ['done', 'error', 'done']);
items[1].status = 'queued';
await runBatchQueue(items, async item => { calls.push(item.id); item.depthMap = new Blob(['depth']); return new Blob(['retried']); }, () => false, () => {});
assert.deepEqual(calls, [1, 2, 3, 2]);

// Toggle maps after processing: no inference/rendering is repeated.
const without = batchArchiveEntries(items, recipe, false), withMaps = batchArchiveEntries(items, recipe, true);
assert.equal(without.filter(x => x.name.startsWith('depth-maps/')).length, 0);
assert.equal(withMaps.filter(x => x.name.startsWith('depth-maps/')).length, 3);
assert.equal(JSON.parse(await without.at(-1).blob.text()).includeDepthMaps, false);
assert.equal(JSON.parse(await withMaps.at(-1).blob.text()).includeDepthMaps, true);
assert.equal(JSON.parse(await withMaps.at(-1).blob.text()).results[0].depthMap, 'depth-maps/1--depth.png');

// Verify the actual archive with Python's independent reader, including Unicode
// nested names, empty files, all CRCs, and both depth-map export choices.
const directoryPath = mkdtempSync(join(tmpdir(), 'aaf-batch-'));
try {
    for (const [name, entries] of [['without', without], ['with', withMaps]]) {
        const blob = await createBatchZip([...entries, { name: 'nested/épreuve.png', blob: new Blob(['unicode']) }, { name: 'empty', blob: new Blob([]) }]);
        const path = join(directoryPath, name + '.zip'); writeFileSync(path, Buffer.from(await blob.arrayBuffer()));
        execFileSync('python3', ['-c', `import zipfile,sys,json
with zipfile.ZipFile(sys.argv[1]) as z:
 assert z.testzip() is None
 assert z.read('nested/épreuve.png') == b'unicode'
 info=json.loads(z.read('batch-settings.json'))
 assert len([n for n in z.namelist() if n.startswith('depth-maps/')]) == (3 if info['includeDepthMaps'] else 0)
`, path]);
    }
} finally { rmSync(directoryPath, { recursive: true, force: true }); }
console.log('Batch settings, folder traversal, pause/resume, failure recovery, optional depth maps, and ZIP integrity passed');
