import { useEffect, useMemo, useRef, useState } from 'react'
import type { MouseEvent as ReactMouseEvent } from 'react'
import { parseModelFile, renderModelPhantogram, type ModelMesh } from './modelPhantogram'
import './styles/PhantogramBuilder.css'

type ProcessingStage = 'idle' | 'uploading' | 'depth' | 'stereo' | 'technique' | 'full' | 'ready' | 'error'
type Glasses = 'red-cyan' | 'red-green' | 'red-blue'
type SourceMode = 'relief' | 'groundplane' | 'model'
type PlanePoint = [number, number]

type Props = { isDepthMapReady: boolean; sourceFile: File | null; setProcessingStage: (stage: ProcessingStage) => void }
type Settings = {
    dpi: number; widthIn: number; heightIn: number; viewDistanceIn: number; eyeHeightIn: number; ipdMm: number; reliefMm: number; glasses: Glasses; reverseDepth: boolean
    rotateX: number; rotateY: number; rotateZ: number; footprintPct: number
}
const defaults: Settings = { dpi: 300, widthIn: 8, heightIn: 6, viewDistanceIn: 20, eyeHeightIn: 14, ipdMm: 63, reliefMm: 35, glasses: 'red-cyan', reverseDepth: false, rotateX: 0, rotateY: 0, rotateZ: 0, footprintPct: 72 }
const loadSettings = (): Settings => { try { return { ...defaults, ...JSON.parse(localStorage.getItem('aaf-phantogram-settings') || '{}') } } catch { return defaults } }

const defaultPlaneCorners: PlanePoint[] = [[0.15, 0.15], [0.85, 0.15], [0.85, 0.85], [0.15, 0.85]]

function PhantogramBuilder({ isDepthMapReady, sourceFile, setProcessingStage }: Props) {
    const apiUrl = import.meta.env.VITE_FLASK_BACKEND_API_URL || 'http://localhost:8000'
    const modelInputRef = useRef<HTMLInputElement>(null)
    const [sourceMode, setSourceMode] = useState<SourceMode>('relief')
    const [settings, setSettings] = useState<Settings>(loadSettings)
    const [model, setModel] = useState<ModelMesh | null>(null)
    const [modelInfo, setModelInfo] = useState('')
    const [previewUrl, setPreviewUrl] = useState<string | null>(null)
    const [loading, setLoading] = useState(false)
    const [downloading, setDownloading] = useState(false)
    const [error, setError] = useState('')
    const [sourceUrl, setSourceUrl] = useState<string | null>(null)
    const [planeCorners, setPlaneCorners] = useState<PlanePoint[]>(defaultPlaneCorners)
    const [activeCorner, setActiveCorner] = useState(0)

    const params = useMemo(() => new URLSearchParams({ dpi: String(settings.dpi), width_in: String(settings.widthIn), height_in: String(settings.heightIn), view_distance_in: String(settings.viewDistanceIn), eye_height_in: String(settings.eyeHeightIn), ipd_mm: String(settings.ipdMm), relief_mm: String(settings.reliefMm), glasses: settings.glasses, reverse_depth: String(settings.reverseDepth), ground_plane: String(sourceMode === 'groundplane'), plane_corners: JSON.stringify(planeCorners) }), [settings, sourceMode, planeCorners])
    const modelSettings = useMemo(() => ({ widthIn: settings.widthIn, heightIn: settings.heightIn, dpi: settings.dpi, viewDistanceIn: settings.viewDistanceIn, eyeHeightIn: settings.eyeHeightIn, ipdMm: settings.ipdMm, reliefMm: settings.reliefMm, glasses: settings.glasses, rotateX: settings.rotateX, rotateY: settings.rotateY, rotateZ: settings.rotateZ, footprintPct: settings.footprintPct }), [settings])
    const ready = sourceMode === 'model' ? !!model : sourceMode === 'groundplane' ? isDepthMapReady && !!sourceFile : isDepthMapReady
    const presetValue = settings.widthIn === 8 && settings.heightIn === 6 ? '8x6' : settings.widthIn === 10 && settings.heightIn === 7.5 ? '10x7.5' : settings.widthIn === 7 && settings.heightIn === 5 ? '7x5' : 'custom'
    const glassesLabel: Record<Glasses, string> = { 'red-cyan': 'Red / Cyan', 'red-green': 'Red / Green', 'red-blue': 'Red / Blue' }

    useEffect(() => { localStorage.setItem('aaf-phantogram-settings', JSON.stringify(settings)) }, [settings])
    useEffect(() => {
        if (!ready) { setPreviewUrl(old => { if (old) URL.revokeObjectURL(old); return null }); return }
        const controller = new AbortController()
        const timer = window.setTimeout(async () => {
            setLoading(true); setError(''); setProcessingStage('technique')
            try {
                let blob: Blob
                if (sourceMode === 'model') {
                    if (!model) return
                    blob = (await renderModelPhantogram(model, modelSettings, 'preview')).blob
                } else {
                    const response = await fetch(`${apiUrl}/special/phantogram?scope=preview&${params.toString()}`, { credentials: 'include', signal: controller.signal })
                    if (!response.ok) throw new Error(`Preview failed with status ${response.status}`)
                    blob = await response.blob()
                }
                if (controller.signal.aborted) return
                const url = URL.createObjectURL(blob)
                setPreviewUrl(old => { if (old) URL.revokeObjectURL(old); return url }); setProcessingStage('ready')
            } catch (caught) {
                if (controller.signal.aborted) return
                console.error(caught); setError(caught instanceof Error ? caught.message : 'Could not render the phantogram preview.'); setProcessingStage('error')
            } finally { if (!controller.signal.aborted) setLoading(false) }
        }, sourceMode === 'model' ? 180 : 280)
        return () => { window.clearTimeout(timer); controller.abort() }
    }, [apiUrl, ready, sourceMode, model, modelSettings, params, setProcessingStage])

    const patch = (values: Partial<Settings>) => setSettings(current => ({ ...current, ...values }))
    const setPreset = (value: string) => { if (value === '8x6') patch({ widthIn: 8, heightIn: 6 }); if (value === '10x7.5') patch({ widthIn: 10, heightIn: 7.5 }); if (value === '7x5') patch({ widthIn: 7, heightIn: 5 }) }
    const loadModel = async (file: File) => {
        setLoading(true); setError(''); setProcessingStage('uploading')
        try {
            const parsed = await parseModelFile(file)
            setModel(parsed); setModelInfo(`${file.name} · ${parsed.triangles.length.toLocaleString()} triangles`); setSourceMode('model'); setProcessingStage('ready')
        } catch (caught) { console.error(caught); setError(caught instanceof Error ? caught.message : 'Could not read 3D model.'); setProcessingStage('error') }
        finally { setLoading(false) }
    }
    const download = async () => {
        if (!ready || downloading) return
        setDownloading(true); setError(''); setProcessingStage('full')
        try {
            let blob: Blob
            if (sourceMode === 'model') {
                if (!model) return
                blob = (await renderModelPhantogram(model, modelSettings, 'full')).blob
            } else {
                const response = await fetch(`${apiUrl}/special/phantogram?scope=full&${params.toString()}`, { credentials: 'include' })
                if (!response.ok) throw new Error(`Download failed with status ${response.status}`)
                blob = await response.blob()
            }
            const url = URL.createObjectURL(blob); const link = document.createElement('a'); link.href = url; link.download = `phantogram-${sourceMode === 'model' ? '3d-model-' : ''}${settings.glasses}-${settings.widthIn}x${settings.heightIn}in.png`; document.body.appendChild(link); link.click(); link.remove(); window.setTimeout(() => URL.revokeObjectURL(url), 1000); setProcessingStage('ready')
        } catch (caught) { console.error(caught); setError(caught instanceof Error ? caught.message : 'Could not create the full-resolution phantogram.'); setProcessingStage('error') }
        finally { setDownloading(false) }
    }

    return <main className="phantogramWorkspace">
        <section className="phantogramIntro"><div><div className="panelLabel">PHYSICAL PRINT</div><h2>Phantogram</h2><p>Projects physical 3D geometry independently from two eye positions onto a flat print plane. Build the geometry from an image + depth map, or import an actual 3D mesh.</p></div><div className="phantogramBadge">EXPERIMENTAL · GEOMETRIC</div></section>

        <div className="phantogramSourceMode"><button className={sourceMode === 'relief' ? 'active' : ''} onClick={() => setSourceMode('relief')}><strong>Image + depth map</strong><span>Use the current 3D Studio source as a height field</span></button><button className={sourceMode === 'model' ? 'active' : ''} onClick={() => setSourceMode('model')}><strong>3D model</strong><span>Import GLB, OBJ, or STL geometry directly</span></button></div>

        {sourceMode === 'relief' && !isDepthMapReady && <div className="phantogramNotice"><strong>No current source + depth map.</strong><span>Load an image in 3D Studio first. Phantogram uses that source and whichever AI or imported depth map is active.</span></div>}
        {sourceMode === 'model' && <div className="phantogramModelSource"><div><strong>{model ? '3D model loaded' : 'Import a 3D model'}</strong><span>{modelInfo || 'GLB 2.0, OBJ, and binary/ASCII STL are supported. GLB base-color materials are retained where available.'}</span></div><button onClick={() => modelInputRef.current?.click()}>{model ? 'Replace model' : 'Choose 3D model'}</button><input ref={modelInputRef} type="file" accept=".glb,.obj,.stl,model/gltf-binary,model/stl" onChange={event => { const file = event.target.files?.[0]; event.currentTarget.value = ''; if (file) void loadModel(file) }}/></div>}

        <div className="phantogramGrid">
            <section className="phantogramControls">
                <div className="phantogramControlHeader"><div><span className="panelLabel">PRINT GEOMETRY</span><strong>Physical setup</strong></div><select value={presetValue} onChange={e => setPreset(e.target.value)} aria-label="Print size preset"><option value="8x6">8 × 6 in</option><option value="10x7.5">10 × 7.5 in</option><option value="7x5">7 × 5 in</option><option value="custom">Custom</option></select></div>
                <div className="phantogramFields">
                    <label><span>Print width</span><input type="number" min="2" max="16" step="0.1" value={settings.widthIn} onChange={e => patch({ widthIn: Number(e.target.value) || 8 })}/><small>in</small></label><label><span>Print height</span><input type="number" min="2" max="16" step="0.1" value={settings.heightIn} onChange={e => patch({ heightIn: Number(e.target.value) || 6 })}/><small>in</small></label>
                    <label><span>Final print resolution</span><select value={settings.dpi} onChange={e => patch({ dpi: Number(e.target.value) })}><option value="150">150 DPI</option><option value="300">300 DPI</option><option value="600">600 DPI · slower</option></select></label><label><span>Glasses</span><select value={settings.glasses} onChange={e => patch({ glasses: e.target.value as Glasses })}><option value="red-cyan">Red / Cyan</option><option value="red-green">Red / Green</option><option value="red-blue">Red / Blue</option></select></label>
                    <label><span>Eyes beyond near edge</span><input type="number" min="4" max="72" step="0.5" value={settings.viewDistanceIn} onChange={e => patch({ viewDistanceIn: Number(e.target.value) || 20 })}/><small>in</small></label><label><span>Eye height above print</span><input type="number" min="4" max="72" step="0.5" value={settings.eyeHeightIn} onChange={e => patch({ eyeHeightIn: Number(e.target.value) || 14 })}/><small>in</small></label>
                    <label><span>Eye separation</span><input type="number" min="45" max="80" step="0.5" value={settings.ipdMm} onChange={e => patch({ ipdMm: Number(e.target.value) || 63 })}/><small>mm</small></label><label><span>{sourceMode === 'model' ? 'Model height above print' : 'Maximum apparent relief'}</span><input type="number" min="0" max="100" step="1" value={settings.reliefMm} onChange={e => patch({ reliefMm: Number(e.target.value) || 0 })}/><small>mm</small></label>
                </div>
                {sourceMode === 'relief' ? <label className="phantogramToggle"><input type="checkbox" checked={settings.reverseDepth} onChange={e => patch({ reverseDepth: e.target.checked })}/><span><strong>Reverse depth</strong><small>Use if the result appears carved into the page instead of rising from it.</small></span></label> : <div className="phantogramModelControls"><div className="panelLabel">MODEL ON PRINT PLANE</div><div className="phantogramFields"><label><span>Footprint</span><input type="number" min="10" max="100" step="1" value={settings.footprintPct} onChange={e => patch({ footprintPct: Number(e.target.value) || 72 })}/><small>%</small></label><label><span>Rotate X</span><input type="number" step="5" value={settings.rotateX} onChange={e => patch({ rotateX: Number(e.target.value) || 0 })}/><small>°</small></label><label><span>Rotate Y</span><input type="number" step="5" value={settings.rotateY} onChange={e => patch({ rotateY: Number(e.target.value) || 0 })}/><small>°</small></label><label><span>Rotate Z</span><input type="number" step="5" value={settings.rotateZ} onChange={e => patch({ rotateZ: Number(e.target.value) || 0 })}/><small>°</small></label></div><p>The rotated model is normalized onto the print plane. Its lowest point touches the paper; “model height” sets the highest point above it.</p></div>}
                <div className="phantogramPrintCheck"><div><strong>Print calibration</strong><span>Print the ruler first and confirm the 100 mm marks physically measure 100 mm.</span></div><a href={`${apiUrl}/phantogram/calibration?dpi=${settings.dpi}`}>Download 100 mm ruler</a></div>
            </section>

            <section className="phantogramPreviewCard"><div className="phantogramPreviewHeader"><div><span className="panelLabel">PREVIEW</span><strong>{glassesLabel[settings.glasses]} · {sourceMode === 'model' ? '3D model' : 'image relief'}</strong></div><span>{loading ? 'Rendering…' : ready ? 'Ready' : 'Waiting for source'}</span></div><div className="phantogramPreview">{previewUrl ? <img src={previewUrl} alt="Phantogram preview"/> : <div><strong>Phantogram preview</strong><span>{sourceMode === 'model' ? 'Import a mesh to project it onto the print plane.' : 'The deliberately distorted print image will appear here.'}</span></div>}</div><div className="phantogramViewDiagram" aria-label="Viewing geometry diagram"><div className="eyes">● ●</div><div className="sightLines">╲ ╱</div><div className="paperLine"/><span>Lay print flat · near edge toward you</span></div>{error && <div className="phantogramError">{error}</div>}<button className="phantogramDownload" disabled={!ready || downloading} onClick={() => void download()}>{downloading ? 'Preparing full-resolution print…' : 'Download print-ready PNG'}</button><p className="phantogramFinePrint">The PNG contains physical DPI metadata. Print at <strong>100% / Actual Size</strong>, never Fit to Page. {sourceMode === 'model' ? 'Imported mesh geometry is projected directly; no depth estimation is used.' : 'The source and depth map are center-cropped together to the selected print aspect ratio.'}</p></section>
        </div>
    </main>
}
export default PhantogramBuilder
