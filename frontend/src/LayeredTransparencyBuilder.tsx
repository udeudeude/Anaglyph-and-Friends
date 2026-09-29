import { useCallback, useEffect, useMemo, useState } from 'react'
import { isolateSheet, readDepthNpy, type DepthImage } from './layeredTransparency'
import { layeredTransparencyPdf, type PrintPageImage } from './layeredTransparencyPdf'
import './styles/LayeredTransparencyBuilder.css'

type ProcessingStage = 'idle' | 'uploading' | 'depth' | 'stereo' | 'technique' | 'full' | 'ready' | 'error'
type Props = { isDepthMapReady: boolean; sourceFile: File | null; setProcessingStage: (stage: ProcessingStage) => void }
type Settings = { count: number; backgroundPct: number; reverse: boolean; artworkWidthIn: number; dpi: number; spacing: 'rack' | 'measured'; spacingMm: string }
const defaults: Settings = { count: 10, backgroundPct: 25, reverse: false, artworkWidthIn: 2.5, dpi: 300, spacing: 'rack', spacingMm: '' }
const loadSettings = (): Settings => { try { return { ...defaults, ...JSON.parse(localStorage.getItem('aaf-layered-transparency') || '{}') } } catch { return defaults } }
const makeCanvas = (width: number, height: number) => { const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height; return canvas }
const canvasBlob = (canvas: HTMLCanvasElement, type: string, quality?: number) => new Promise<Blob>((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('Could not encode a transparency page.')), type, quality))
const download = (blob: Blob, name: string) => { const url = URL.createObjectURL(blob); const link = document.createElement('a'); link.href = url; link.download = name; document.body.appendChild(link); link.click(); link.remove(); window.setTimeout(() => URL.revokeObjectURL(url), 2000) }

function printPage(image: ImageData, index: number, count: number, settings: Settings, kind: 'color' | 'mask'): HTMLCanvasElement {
    const dpi = settings.dpi
    const page = makeCanvas(Math.round(8.5 * dpi), Math.round(11 * dpi))
    const context = page.getContext('2d')!
    context.fillStyle = '#fff'; context.fillRect(0, 0, page.width, page.height)
    const artworkWidth = settings.artworkWidthIn * dpi
    const artworkHeight = artworkWidth * image.height / image.width
    if (artworkHeight > 9 * dpi) throw new Error('This artwork is too tall for a letter page. Reduce its print width.')
    const left = (page.width - artworkWidth) / 2, top = 1.05 * dpi
    const layer = makeCanvas(image.width, image.height)
    const layerContext = layer.getContext('2d')!
    if (kind === 'color') layerContext.putImageData(image, 0, 0)
    else {
        const outline = layerContext.createImageData(image.width, image.height)
        for (let y = 0; y < image.height; y += 1) for (let x = 0; x < image.width; x += 1) {
            const offset = (y * image.width + x) * 4
            if (!image.data[offset + 3]) continue
            const edge = x === 0 || y === 0 || x === image.width - 1 || y === image.height - 1 ||
                !image.data[offset - 1] || !image.data[offset + 7] || !image.data[offset + 3 - image.width * 4] || !image.data[offset + 3 + image.width * 4]
            if (edge) { outline.data[offset] = 70; outline.data[offset + 1] = 70; outline.data[offset + 2] = 70; outline.data[offset + 3] = 255 }
        }
        layerContext.putImageData(outline, 0, 0)
    }
    context.drawImage(layer, left, top, artworkWidth, artworkHeight)
    context.strokeStyle = '#777'; context.lineWidth = 1
    context.strokeRect(left, top, artworkWidth, artworkHeight)
    // Registration corners lie outside the trim box on both color and mask pages.
    const tick = dpi * .13
    for (const x of [left, left + artworkWidth]) for (const y of [top, top + artworkHeight]) {
        context.beginPath(); context.moveTo(x - tick, y); context.lineTo(x + tick, y); context.moveTo(x, y - tick); context.lineTo(x, y + tick); context.stroke()
    }
    context.fillStyle = '#111'; context.font = `bold ${Math.round(dpi * .13)}px sans-serif`
    context.fillText(`${kind === 'color' ? 'TRANSPARENCY' : 'WHITE BACKING CUT GUIDE'}  ${index + 1} / ${count}  -  ${index === count - 1 ? 'BACK' : 'FRONT TO BACK'}`, .5 * dpi, .5 * dpi)
    context.font = `${Math.round(dpi * .09)}px sans-serif`
    context.fillText(`Print at 100% / Actual Size. Trim box: ${settings.artworkWidthIn.toFixed(2)} x ${(artworkHeight / dpi).toFixed(2)} in. Keep registration marks aligned.`, .5 * dpi, .76 * dpi)
    return page
}

function LayeredTransparencyBuilder({ isDepthMapReady, sourceFile, setProcessingStage }: Props) {
    const apiUrl = import.meta.env.VITE_FLASK_BACKEND_API_URL || 'http://localhost:8000'
    const [settings, setSettings] = useState<Settings>(loadSettings)
    const [depth, setDepth] = useState<DepthImage | null>(null)
    const [selected, setSelected] = useState(0)
    const [previewUrl, setPreviewUrl] = useState<string | null>(null)
    const [busy, setBusy] = useState(false)
    const [error, setError] = useState('')
    const ready = !!sourceFile && isDepthMapReady && !!depth
    const heightIn = useMemo(() => sourceFile && depth ? settings.artworkWidthIn * depth.height / depth.width : null, [sourceFile, depth, settings.artworkWidthIn])
    useEffect(() => { localStorage.setItem('aaf-layered-transparency', JSON.stringify(settings)) }, [settings])
    useEffect(() => () => { if (previewUrl) URL.revokeObjectURL(previewUrl) }, [previewUrl])
    const patch = (values: Partial<Settings>) => { setSettings(current => ({ ...current, ...values })); setError('') }
    const refreshDepth = useCallback(async (signal?: AbortSignal) => {
        if (!isDepthMapReady || !sourceFile) return
        setBusy(true); setError('')
        try {
            const response = await fetch(`${apiUrl}/depth-map/download?kind=npy`, { credentials: 'include', signal })
            if (!response.ok) throw new Error('Could not read the active Studio depth map. Reopen this technique after depth is ready.')
            const next = readDepthNpy(await response.arrayBuffer())
            if (!signal?.aborted) setDepth(next)
        } catch (caught) { if (!signal?.aborted) { setError(caught instanceof Error ? caught.message : 'Could not load depth map.'); setDepth(null) } }
        finally { if (!signal?.aborted) setBusy(false) }
    }, [apiUrl, isDepthMapReady, sourceFile])
    useEffect(() => {
        if (!isDepthMapReady || !sourceFile) { setDepth(null); return }
        const controller = new AbortController()
        void refreshDepth(controller.signal)
        return () => controller.abort()
    }, [isDepthMapReady, sourceFile, refreshDepth])

    const prepareSource = useCallback(async (scope: 'preview' | 'full') => {
        if (!sourceFile) throw new Error('Load a source image first.')
        const bitmap = await createImageBitmap(sourceFile)
        try {
            const targetWidth = Math.max(1, Math.min(bitmap.width, scope === 'preview' ? 760 : Math.round(settings.artworkWidthIn * settings.dpi)))
            const targetHeight = Math.max(1, Math.round(targetWidth * bitmap.height / bitmap.width))
            const canvas = makeCanvas(targetWidth, targetHeight)
            const context = canvas.getContext('2d', { willReadFrequently: true })!
            context.drawImage(bitmap, 0, 0, targetWidth, targetHeight)
            return context.getImageData(0, 0, targetWidth, targetHeight)
        } finally { bitmap.close() }
    }, [sourceFile, settings.artworkWidthIn, settings.dpi])
    const renderLayer = useCallback(async (scope: 'preview' | 'full', index: number) => {
        if (!depth) throw new Error('Load the active depth map first.')
        return isolateSheet(await prepareSource(scope), depth, index, settings.count, settings.backgroundPct / 100, settings.reverse)
    }, [prepareSource, depth, settings.count, settings.backgroundPct, settings.reverse])
    useEffect(() => {
        if (!ready) { setPreviewUrl(null); return }
        let cancelled = false
        const timer = window.setTimeout(async () => {
            try {
                const image = await renderLayer('preview', Math.min(selected, settings.count - 1))
                const canvas = makeCanvas(image.width, image.height)
                canvas.getContext('2d')!.putImageData(image, 0, 0)
                const url = URL.createObjectURL(await canvasBlob(canvas, 'image/png'))
                if (cancelled) URL.revokeObjectURL(url)
                else setPreviewUrl(url)
            } catch (caught) { if (!cancelled) setError(caught instanceof Error ? caught.message : 'Preview failed.') }
        }, 120)
        return () => { cancelled = true; window.clearTimeout(timer) }
    }, [ready, selected, settings.count, renderLayer])

    const exportPages = async (kind: 'color' | 'mask') => {
        if (!ready || busy) return
        setBusy(true); setError(''); setProcessingStage('full')
        try {
            const pages: PrintPageImage[] = []
            const source = await prepareSource('full')
            if (!depth) throw new Error('Load the active depth map first.')
            for (let index = 0; index < settings.count; index += 1) {
                const image = isolateSheet(source, depth, index, settings.count, settings.backgroundPct / 100, settings.reverse)
                const page = printPage(image, index, settings.count, settings, kind)
                pages.push({ jpeg: new Uint8Array(await (await canvasBlob(page, 'image/jpeg', .94)).arrayBuffer()), width: page.width, height: page.height })
                // Release each large page before building the next one.
                page.width = 0; page.height = 0
                await new Promise(resolve => window.setTimeout(resolve, 0))
            }
            download(layeredTransparencyPdf(pages), kind === 'color' ? 'layered-transparency-pages.pdf' : 'layered-transparency-white-cut-guides.pdf')
            setProcessingStage('ready')
        } catch (caught) { setError(caught instanceof Error ? caught.message : 'Could not build printable sheets.'); setProcessingStage('error') }
        finally { setBusy(false) }
    }

    return <main className="transparencyWorkspace">
        <header><div className="panelLabel">PRINT / PHYSICAL DEPTH</div><h2>Layered Transparency</h2><p>Split the current image across clear sheets using its active depth map. Stack the sheets from front to back for real parallax.</p></header>
        {!isDepthMapReady && <div className="transparencyNotice">Load a single image and make or import its depth map in 3D Studio first.</div>}
        <div className="transparencyGrid"><section className="transparencyControls">
            <label>Sheets, including the back image <input type="number" min="2" max="10" step="1" value={settings.count} onChange={event => patch({ count: Math.min(10, Math.max(2, Number(event.target.value) || 2)), backgroundPct: settings.backgroundPct })} /></label>
            <label>Background compressed onto back sheet <input type="range" min="0" max="90" step="1" value={settings.backgroundPct} onChange={event => patch({ backgroundPct: Number(event.target.value) })} /><strong>{settings.backgroundPct}% of depth range</strong></label>
            <p className="transparencyHint">Higher values move more distant detail onto one back image. Nearer detail is distributed among the other sheets. Blank areas remain clear.</p>
            <label className="transparencyCheck"><input type="checkbox" checked={settings.reverse} onChange={event => patch({ reverse: event.target.checked })} /> Reverse near and far</label>
            <label>Artwork width on each letter page (inches) <input type="number" min=".5" max="7" step=".1" value={settings.artworkWidthIn} onChange={event => patch({ artworkWidthIn: Math.min(7, Math.max(.5, Number(event.target.value) || .5)) })} /></label>
            <p className="transparencyHint">Height follows the source image: {heightIn?.toFixed(2) || '—'} in. The 2.5 in starting size is an example, not a measured Rack-O fit. Measure your rack before trimming.</p>
            <details><summary>Spacing &amp; print settings</summary><div className="transparencyAdvanced">
                <label>Sheet spacing <select value={settings.spacing} onChange={event => patch({ spacing: event.target.value as Settings['spacing'] })}><option value="rack">Rack-O card rack · use its slots</option><option value="measured">Measured gap between sheets</option></select></label>
                {settings.spacing === 'measured' && <label>Measured gap (millimeters) <input type="number" min=".1" step=".1" value={settings.spacingMm} onChange={event => patch({ spacingMm: event.target.value })} placeholder="Enter your measurement" /></label>}
                <label>Print resolution (pixels per inch) <input type="number" min="150" max="600" step="50" value={settings.dpi} onChange={event => patch({ dpi: Math.min(600, Math.max(150, Number(event.target.value) || 150)) })} /></label>
                <button onClick={() => void refreshDepth()} disabled={busy || !isDepthMapReady}>Refresh active depth map</button>
            </div></details>
            {settings.spacing === 'measured' && Number(settings.spacingMm) > 0 && <p className="transparencyHint">Front-to-back span: {((settings.count - 1) * Number(settings.spacingMm)).toFixed(1)} mm. This changes assembly guidance, not the number of depth slices.</p>}
            <div className="transparencyActions"><button disabled={!ready || busy} onClick={() => void exportPages('color')}>{busy ? 'Preparing pages…' : `Download ${settings.count} transparency pages · PDF`}</button><button disabled={!ready || busy} onClick={() => void exportPages('mask')}>Download white backing cut guides · PDF</button></div>
            {error && <div className="transparencyError">{error}</div>}
        </section><section className="transparencyOutput"><strong>Preview one sheet</strong><label>Sheet <select value={Math.min(selected, settings.count - 1)} onChange={event => setSelected(Number(event.target.value))}>{Array.from({ length: settings.count }, (_, index) => <option key={index} value={index}>{index + 1} / {settings.count} {index === settings.count - 1 ? '· back image' : ''}</option>)}</select></label><div className="transparencyPreview">{previewUrl ? <img src={previewUrl} alt={`Transparent sheet ${Math.min(selected, settings.count - 1) + 1}`} /> : <span>Load an image and depth map to preview a sheet.</span>}</div><small>Checkerboard areas remain transparent. Labels and cut guides print outside the image.</small></section></div>
        <details className="transparencyInstructions"><summary>Explanation &amp; assembly instructions</summary><ol><li>Start in Studio with a photograph and its active depth map. Edit the map first if subjects are assigned to the wrong depth. The light values are near by default.</li><li>Print the transparency PDF on suitable clear film at 100% / Actual Size. Sheet 1 faces the viewer; the highest number goes at the back. Keep the pages in order and register their printed corner marks before cutting.</li><li>Use the Rack-O rack as an evenly spaced holder if the trimmed film fits your particular rack. No slot gap or card dimensions are assumed. For other holders, measure the gap and enter it above.</li><li>Ordinary printer white usually means no ink on clear film. To make an object opaque, paint white behind its colored regions or cut white paper using the matching labeled cut-guide page and place it behind that film, facing the same way. White backing also blocks layers behind that object; use it selectively for a more transparent effect.</li><li>The back sheet gathers the chosen far-depth range. A photograph contains no information about scenery hidden behind a foreground object, so moving your head may reveal empty gaps. Reduce the depth spread, edit the source, or paint/fill those regions manually if needed. A side view has real parallax, but this is a set of discrete planes rather than a continuous solid object.</li></ol></details>
    </main>
}

export default LayeredTransparencyBuilder
