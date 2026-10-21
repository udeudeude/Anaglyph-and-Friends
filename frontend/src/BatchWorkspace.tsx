import { useEffect, useRef, useState } from 'react';
import type { DragEvent } from 'react';
import UiIcon from './UiIcon';
import { describeBrowserDepthError, generateBrowserDepth } from './browserDepth';
import { resolveDepthGenerator } from './depthGenerators';
import { directOutputTechniques, finalOutputUrl, outputFilename } from './techniqueOutput';
import { screenDepthParameters } from './screenDepth';
import { techniqueInfo } from './techniques';
import {
    batchArchiveEntries, batchImageAccept, batchRequest, collectDroppedImages, runBatchQueue, selectBatchInputs, uniqueOutputPath,
    type BatchInput, type BatchItem, type BatchRecipe,
} from './batchProcessing';
import { createBatchZip } from './batchZip';
import './styles/BatchWorkspace.css';

type Props = { apiUrl: string; recipe: BatchRecipe; hosted: boolean; onClose: () => void };
const sizeLabel = (bytes: number) => bytes < 1024 * 1024 ? `${Math.ceil(bytes / 1024)} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`;
const labelForKey = (key: string) => key.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/^./, char => char.toUpperCase());
const settingsRows = (settings: object): Array<[string, string]> => Object.entries(settings).flatMap(([key, value]) =>
    typeof value === 'object' && value !== null ? settingsRows(value).map(([label, text]) => [`${labelForKey(key)} · ${label}`, text] as [string, string])
        : [[labelForKey(key), typeof value === 'boolean' ? value ? 'On' : 'Off' : String(value)]]);

export default function BatchWorkspace({ apiUrl, recipe, hosted, onClose }: Props) {
    const dialogRef = useRef<HTMLDialogElement>(null);
    const folderRef = useRef<HTMLInputElement>(null);
    const filesRef = useRef<HTMLInputElement>(null);
    const rowsRef = useRef<BatchItem[]>([]);
    const nextId = useRef(1);
    const runningRef = useRef(false);
    const pauseRef = useRef(false);
    const aliveRef = useRef(true);
    const workspaceReady = useRef<Promise<string> | null>(null);
    const executionRef = useRef<Promise<void> | null>(null);
    const [items, setItems] = useState<BatchItem[]>([]);
    const [running, setRunning] = useState(false);
    const [pausing, setPausing] = useState(false);
    const [reading, setReading] = useState(false);
    const [dragging, setDragging] = useState(false);
    const [notice, setNotice] = useState('');
    const [error, setError] = useState('');
    const [initialising, setInitialising] = useState(true);
    const [ready, setReady] = useState(false);
    const [setupAttempt, setSetupAttempt] = useState(0);
    const [selectedId, setSelectedId] = useState<number | null>(null);
    const [showOriginal, setShowOriginal] = useState(false);
    const [previewUrl, setPreviewUrl] = useState('');
    const [zipProgress, setZipProgress] = useState<number | null>(null);
    const [zipDownload, setZipDownload] = useState<{ url: string; name: string } | null>(null);
    const [leaving, setLeaving] = useState(false);
    const [includeDepthMaps, setIncludeDepthMaps] = useState(() => localStorage.getItem('aaf-batch-depth-maps') === 'true');
    const done = items.filter(item => item.status === 'done');
    const failed = items.filter(item => item.status === 'error');
    const pending = items.filter(item => item.status === 'queued');
    const current = items.find(item => item.status === 'working');
    const selected = items.find(item => item.id === selectedId);
    const selectedBlob = selected && (!showOriginal && selected.output ? selected.output : selected.file);
    const frozen = running || reading || zipProgress !== null;
    const processed = done.length + failed.length;
    const progress = items.length ? processed / items.length * 100 : 0;
    const outputName = outputFilename(recipe);
    const outputFormat = outputName.split('.').pop()?.toUpperCase();
    const depthName = resolveDepthGenerator(recipe.depth.generator, hosted ? 'browser' : 'local').name;
    const techniqueSettings = recipe.settings[recipe.technique === 'randomdot' || recipe.technique === 'pattern' ? 'autostereogram' : recipe.technique as keyof typeof recipe.settings];

    const sync = () => { if (aliveRef.current) setItems(rowsRef.current.map(item => ({ ...item }))); };
    const clearZip = () => setZipDownload(null);

    useEffect(() => {
        const dialog = dialogRef.current;
        const previousFocus = document.activeElement as HTMLElement | null;
        dialog?.showModal();
        return () => { dialog?.close(); previousFocus?.focus(); };
    }, []);

    useEffect(() => {
        aliveRef.current = true;
        let disposed = false;
        setInitialising(true); setReady(false); setError('');
        const promise = fetch(`${apiUrl}/batch-workspace`, { method: 'POST', credentials: 'include' })
            .then(async response => {
                const info = await response.json().catch(() => ({}));
                if (!response.ok || !info.workspace) throw new Error(info.error || 'Could not prepare the batch. Please retry.');
                if (!disposed) { setReady(true); setInitialising(false); }
                return info.workspace as string;
            });
        workspaceReady.current = promise;
        void promise.catch(reason => {
            if (!disposed) { setError(reason instanceof Error ? reason.message : 'Could not prepare the batch.'); setInitialising(false); }
        });
        return () => {
            disposed = true; aliveRef.current = false; pauseRef.current = true;
            // Let the current server request finish before removing its files.
            void Promise.all([promise, executionRef.current]).then(([workspace]) =>
                batchRequest(`${apiUrl}/batch-workspace`, workspace, { method: 'DELETE' }),
            ).catch(() => { /* The server also expires abandoned workspaces. */ });
        };
    }, [apiUrl, setupAttempt]);

    useEffect(() => {
        if (!selectedBlob) { setPreviewUrl(''); return; }
        const url = URL.createObjectURL(selectedBlob); setPreviewUrl(url);
        return () => URL.revokeObjectURL(url);
    }, [selectedBlob]);
    useEffect(() => () => { if (zipDownload) URL.revokeObjectURL(zipDownload.url); }, [zipDownload]);
    useEffect(() => {
        if (!items.length) return;
        const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
        window.addEventListener('beforeunload', warn);
        return () => window.removeEventListener('beforeunload', warn);
    }, [items.length]);

    const addInputs = (inputs: BatchInput[]) => {
        if (!aliveRef.current) return;
        const { images, skipped } = selectBatchInputs(inputs);
        const existing = new Set(rowsRef.current.map(item => `${item.path}:${item.file.size}:${item.file.lastModified}`));
        const used = new Set(rowsRef.current.map(item => item.outputPath.toLowerCase()));
        let duplicates = 0;
        const added: BatchItem[] = [];
        for (const input of images) {
            const key = `${input.path}:${input.file.size}:${input.file.lastModified}`;
            if (existing.has(key)) { duplicates++; continue; }
            existing.add(key);
            added.push({ ...input, id: nextId.current++, outputPath: uniqueOutputPath(input.path, outputName, used), status: 'queued', message: 'Waiting to process' });
        }
        rowsRef.current.push(...added); sync(); clearZip(); setError('');
        if (selectedId === null && added.length) setSelectedId(added[0].id);
        setNotice([added.length ? `${added.length} photo${added.length === 1 ? '' : 's'} added.` : 'No new photos added.', skipped ? `${skipped} unsupported or hidden file${skipped === 1 ? '' : 's'} skipped.` : '', duplicates ? `${duplicates} duplicate${duplicates === 1 ? '' : 's'} skipped.` : ''].filter(Boolean).join(' '));
    };

    const drop = async (event: DragEvent) => {
        event.preventDefault(); setDragging(false);
        if (frozen) return;
        setReading(true); setError('');
        try { addInputs(await collectDroppedImages(event.dataTransfer)); }
        catch { setError('Could not read that folder. Try Choose folder or Choose images instead.'); }
        finally { if (aliveRef.current) setReading(false); }
    };

    const processPhoto = async (item: BatchItem, workspace: string) => {
        const message = (value: string) => { item.message = value; sync(); };
        const source = new FormData(); source.append('file', item.file, item.file.name);
        await batchRequest(`${apiUrl}/image`, workspace, { method: 'POST', body: source });
        message('Estimating depth…');
        if (hosted) {
            let generated;
            try { generated = await generateBrowserDepth(item.file, message, recipe.depth.generator); }
            catch (reason) {
                const failure = describeBrowserDepthError(reason);
                // Startup/download failures usually affect the whole folder.
                if (failure.kind !== 'inference' && failure.kind !== 'output') { pauseRef.current = true; setPausing(true); }
                throw new Error(`${failure.title}. ${failure.detail}`);
            }
            const form = new FormData(); form.append('file', generated.file); form.append('invert', String(recipe.depth.invert));
            await batchRequest(`${apiUrl}/depth-map/ai-import`, workspace, { method: 'POST', body: form });
        } else {
            await batchRequest(`${apiUrl}/depth-map/regenerate`, workspace, {
                method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(recipe.depth),
            });
        }
        message('Rendering final output…');
        const depthResponse = await batchRequest(`${apiUrl}/depth-map/download?kind=gray16`, workspace);
        item.depthMap = await depthResponse.blob();
        if (directOutputTechniques.has(recipe.technique)) {
            const params = new URLSearchParams({ pop_out: String(recipe.popOut), max_disparity_percentage: String(recipe.strength), ...screenDepthParameters(recipe.screenDepth) });
            await batchRequest(`${apiUrl}/prepare-full?${params}`, workspace);
        }
        const response = await batchRequest(finalOutputUrl(apiUrl, recipe), workspace);
        const blob = await response.blob();
        if (!blob.size || !blob.type.startsWith('image/')) throw new Error('The app returned an empty or unreadable result. Retry this photo.');
        return blob;
    };

    const start = (retryFailed = false) => {
        if (runningRef.current || !ready || reading || zipProgress !== null) return;
        if (retryFailed) for (const item of rowsRef.current) if (item.status === 'error') { item.status = 'queued'; item.message = 'Waiting to retry'; }
        runningRef.current = true; pauseRef.current = false; setRunning(true); setPausing(false); setError(''); clearZip(); sync();
        const execution = (async () => {
            try {
                const workspace = await workspaceReady.current!;
                await runBatchQueue(rowsRef.current, item => processPhoto(item, workspace), () => pauseRef.current || !aliveRef.current, sync);
            } catch (reason) {
                if (aliveRef.current) setError(reason instanceof Error ? reason.message : 'Could not start the batch.');
            } finally {
                runningRef.current = false;
                if (aliveRef.current) { setRunning(false); setPausing(false); sync(); }
            }
        })();
        executionRef.current = execution;
    };

    const pause = () => { pauseRef.current = true; setPausing(true); };
    const requestClose = () => {
        if (!items.length && !reading) onClose(); else setLeaving(true);
    };
    const downloadZip = async () => {
        if (!done.length || frozen) return;
        setZipProgress(0); setError(''); clearZip();
        try {
            const blob = await createBatchZip(batchArchiveEntries(rowsRef.current, recipe, includeDepthMaps),
                value => { if (aliveRef.current) setZipProgress(value); });
            if (aliveRef.current) setZipDownload({ url: URL.createObjectURL(blob), name: `anaglyph-friends-${recipe.technique}-${done.length}-photos.zip` });
        } catch (reason) { if (aliveRef.current) setError(reason instanceof Error ? reason.message : 'Could not prepare the ZIP. Individual results are still available.'); }
        finally { if (aliveRef.current) setZipProgress(null); }
    };

    return <dialog ref={dialogRef} className="batchDialog" aria-labelledby="batch-title" onCancel={event => { event.preventDefault(); requestClose(); }}>
        <header className="batchHeader"><div><span className="panelLabel">ONE LOOK. A WHOLE FOLDER.</span><h2 id="batch-title">Batch photos</h2><p>The settings you chose, applied to every photo.</p></div><button className="batchBack" onClick={requestClose}><UiIcon name="back" /> Back to Studio</button></header>
        {leaving && <div className="batchLeave" role="alert"><div><strong>Leave this batch?</strong><p>{running ? 'Pause after the current photo before leaving.' : 'Download the results you want to keep. Leaving clears this queue and its results.'}</p></div><button onClick={() => setLeaving(false)}>Keep batch</button>{running ? <button onClick={pause} disabled={pausing}>Pause after this photo</button> : <button onClick={onClose} disabled={reading || zipProgress !== null}>Discard batch & return</button>}</div>}
        <div className="batchLayout">
            <aside className="batchRecipe"><div className="batchRecipeHeading"><UiIcon name="batch" /><span>CAPTURED SETTINGS</span></div><h3>{techniqueInfo[recipe.technique].label}</h3><div className="batchChips"><span>{outputFormat}</span><span>{recipe.strength.toFixed(1)}% strength</span>{recipe.swapEyes && <span>Eyes swapped</span>}</div>
                <dl><dt>Depth model</dt><dd>{depthName}{recipe.depth.invert ? ' · inverted' : ''}</dd><dt>Screen depth</dt><dd>{recipe.screenDepth === null ? (recipe.popOut ? 'Pop out' : 'Automatic') : `${Math.round(recipe.screenDepth * 100)}% · same depth level for each photo`}</dd><dt>Output size</dt><dd>{hosted ? 'Up to 1800 pixels; print formats use their chosen dimensions' : 'Full source resolution; print formats use their chosen dimensions'}</dd></dl>
                <details><summary>All technique settings</summary><dl>{settingsRows(techniqueSettings || {}).map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>{recipe.format === 'jpeg' && <p>JPEG quality: {recipe.jpegQuality}%</p>}{recipe.retinalRivalry && <p>Retinal rivalry reduction on</p>}</details>
                <label className="batchDepthOption"><input type="checkbox" checked={includeDepthMaps} disabled={zipProgress !== null} onChange={event => { setIncludeDepthMaps(event.target.checked); localStorage.setItem('aaf-batch-depth-maps', String(event.target.checked)); clearZip(); }} /><span><strong>Include depth maps</strong><small>16-bit grayscale PNGs in a separate folder. Change this any time before downloading.</small></span></label>
                <p className="batchRecipeNote">Each photo gets a fresh depth map. Painted edits and imported depth maps belong to the original photo and aren’t copied.</p><p className="batchRecipeNote">{recipe.technique === 'pattern' ? 'Your current custom pattern is included. ' : ''}Return to Studio to capture different settings.</p>
            </aside>
            <section className="batchMain" aria-label="Batch queue">
                <div className={`batchDrop ${dragging ? 'dragging' : ''} ${items.length ? 'compact' : ''}`} onDragOver={event => { event.preventDefault(); event.dataTransfer.dropEffect = frozen ? 'none' : 'copy'; if (!frozen) setDragging(true); }} onDragLeave={event => { if (!event.currentTarget.contains(event.relatedTarget as Node)) setDragging(false); }} onDrop={event => void drop(event)}>
                    <UiIcon name="folder" /><div><h3>{reading ? 'Reading folder…' : items.length ? 'Add more photos' : 'Drop a folder of photos here'}</h3><p>Subfolders included. JPEG, PNG, WebP, TIFF, BMP, and more.</p></div><div className="batchPickers"><button onClick={() => folderRef.current?.click()} disabled={frozen}>Choose folder</button><button onClick={() => filesRef.current?.click()} disabled={frozen}>Choose images</button></div>
                    <input ref={folderRef} type="file" multiple {...{ webkitdirectory: '', directory: '' }} aria-label="Choose batch folder" hidden onChange={event => { addInputs(Array.from(event.target.files || []).map(file => ({ file, path: file.webkitRelativePath || file.name }))); event.target.value = ''; }} />
                    <input ref={filesRef} type="file" accept={batchImageAccept} multiple aria-label="Choose batch images" hidden onChange={event => { addInputs(Array.from(event.target.files || []).map(file => ({ file, path: file.name }))); event.target.value = ''; }} />
                </div>
                {notice && <p className="batchNotice" role="status">{notice}</p>}
                {error && <div className="batchError" role="alert">{error}{!ready && !initialising && <button onClick={() => setSetupAttempt(value => value + 1)}>Retry setup</button>}</div>}
                {!items.length ? <div className="batchEmptySteps"><div><span>1</span><strong>Add your photos</strong><p>Drop a folder or choose images.</p></div><div><span>2</span><strong>Process the batch</strong><p>Follow each photo from depth to finished output.</p></div><div><span>3</span><strong>Download together</strong><p>One ZIP, with filenames and folders preserved.</p></div></div> : <>
                    <div className="batchProgressHeader"><strong>{running ? pausing ? 'Pausing after this photo…' : 'Processing your photos' : pending.length ? processed ? 'Batch paused' : 'Ready to process' : failed.length ? 'Finished with some errors' : 'Your batch is ready'}</strong><span>{processed} / {items.length} processed</span></div>
                    <progress className="batchProgress" value={processed} max={items.length} aria-label="Photos processed" />
                    <p className="batchCounts" aria-live="polite">{done.length} ready{failed.length > 0 && ` · ${failed.length} failed`}{pending.length > 0 && ` · ${pending.length} queued`}{current && ` · ${current.file.name}: ${current.message}`}</p>
                    <div className="batchResults"><div className="batchList" role="list" aria-label="Photos in batch">{items.map((item, index) => <div key={item.id} role="listitem" className={`batchRow ${item.status} ${item.id === selectedId ? 'selected' : ''}`}>
                        <button className="batchRowSelect" onClick={() => { setSelectedId(item.id); setShowOriginal(false); }} aria-pressed={item.id === selectedId}><span className="batchRowStatus">{item.status === 'working' ? <span className="miniLoader" /> : item.status === 'done' ? '✓' : item.status === 'error' ? '!' : String(index + 1).padStart(2, '0')}</span><span><strong>{item.file.name}</strong><small title={item.path}>{item.path}</small><span className="batchRowMessage">{item.message}</span></span></button>
                        {!frozen && <button className="batchRemove" title={`Remove ${item.file.name} from batch`} aria-label={`Remove ${item.file.name} from batch`} onClick={() => { rowsRef.current = rowsRef.current.filter(row => row.id !== item.id); if (selectedId === item.id) setSelectedId(rowsRef.current[0]?.id || null); sync(); clearZip(); }}><UiIcon name="close" /></button>}
                    </div>)}</div>
                    <div className="batchInspector">{selected && <><div className="batchPreviewTabs"><button className={!showOriginal ? 'active' : ''} onClick={() => setShowOriginal(false)} disabled={!selected.output}>Result</button><button className={showOriginal ? 'active' : ''} onClick={() => setShowOriginal(true)}>Original</button></div><div className="batchPreview">{previewUrl && <img src={previewUrl} alt={`${showOriginal || !selected.output ? 'Original' : 'Processed'}: ${selected.file.name}`} />}{!selected.output && !showOriginal && <span>Original · result will appear here</span>}</div><strong className="batchPreviewName">{selected.file.name}</strong>{selected.output && <a className="batchIndividualDownload" href={previewUrl} download={showOriginal ? selected.file.name : selected.outputPath.split('/').pop()}><UiIcon name="download" />{showOriginal ? 'Save original' : `Save result · ${sizeLabel(selected.output.size)}`}</a>}{selected.status === 'error' && <p className="batchError">{selected.message}</p>}</>}</div></div>
                </>}
            </section>
        </div>
        <footer className="batchFooter"><div><strong>{items.length ? `${items.length} photo${items.length === 1 ? '' : 's'} · ${techniqueInfo[recipe.technique].label}` : 'Ready for your photos'}</strong><small>{initialising ? 'Preparing batch workspace…' : running ? 'Keep this tab open. Pause safely after the current photo.' : 'Original files stay unchanged. Results stay here until you leave or reload.'}</small></div><div className="batchFooterActions">
            {failed.length > 0 && <button onClick={() => start(true)} disabled={frozen || !ready}>Retry {failed.length} failed</button>}
            {running ? <button onClick={pause} disabled={pausing}>{pausing ? 'Pausing…' : 'Pause after this photo'}</button> : pending.length > 0 && <button className="batchPrimary" onClick={() => start()} disabled={!ready || frozen}>{processed ? `Resume · ${pending.length} remaining` : `Process ${pending.length} photo${pending.length === 1 ? '' : 's'}`}</button>}
            {done.length > 0 && (zipDownload ? <a className="batchPrimary" href={zipDownload.url} download={zipDownload.name}><UiIcon name="download" /> Save ZIP · {done.length} results</a> : <button className={!pending.length && !running ? 'batchPrimary' : ''} onClick={() => void downloadZip()} disabled={frozen}><UiIcon name="download" />{zipProgress !== null ? `Preparing ZIP… ${zipProgress}/${done.length * (includeDepthMaps ? 2 : 1) + 1}` : `Prepare ZIP · ${done.length} results`}</button>)}
        </div>{zipDownload && <p className="batchSaveHint">ZIP ready. Choose Save ZIP to download. On iPhone, use Share → Save to Files if it opens.</p>}<span className="batchSrOnly" role="status">{Math.round(progress)}% of photos processed.</span></footer>
    </dialog>;
}
