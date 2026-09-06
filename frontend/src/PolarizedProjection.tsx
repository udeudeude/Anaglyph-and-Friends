import { useEffect, useMemo, useRef, useState } from 'react'
import type { StereoPairDraft } from './studioAssets'
import './styles/PolarizedProjection.css'

type ProcessingStage = 'idle' | 'uploading' | 'depth' | 'stereo' | 'technique' | 'full' | 'ready' | 'error'
type Polarization = 'linear' | 'circular'
type LinearPreset = '0/90' | '45/135'
type CircularPreset = 'left/right' | 'right/left'

type Props = {
    pair: StereoPairDraft | null
    generatedPairAvailable: boolean
    setProcessingStage: (stage: ProcessingStage) => void
}

type Align = { x: number; y: number; scale: number; rotation: number; keystoneX: number; keystoneY: number; brightness: number }
const defaultAlign: Align = { x: 0, y: 0, scale: 100, rotation: 0, keystoneX: 0, keystoneY: 0, brightness: 100 }

const blobUrl = (blob: Blob) => URL.createObjectURL(blob)
const loadImage = (src: string) => new Promise<HTMLImageElement>((resolve, reject) => { const image = new Image(); image.onload = () => resolve(image); image.onerror = reject; image.src = src })

function PolarizedProjection({ pair, generatedPairAvailable, setProcessingStage }: Props) {
    const apiUrl = import.meta.env.VITE_FLASK_BACKEND_API_URL || 'http://localhost:8000'
    const [polarization, setPolarization] = useState<Polarization>('linear')
    const [linearPreset, setLinearPreset] = useState<LinearPreset>('0/90')
    const [circularPreset, setCircularPreset] = useState<CircularPreset>('left/right')
    const [swapEyes, setSwapEyes] = useState(false)
    const [leftAlign, setLeftAlign] = useState<Align>(defaultAlign)
    const [rightAlign, setRightAlign] = useState<Align>(defaultAlign)
    const [leftUrl, setLeftUrl] = useState<string | null>(null)
    const [rightUrl, setRightUrl] = useState<string | null>(null)
    const [mode, setMode] = useState<'images' | 'grid' | 'leakage'>('images')
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState('')
    const leftStage = useRef<HTMLDivElement>(null), rightStage = useRef<HTMLDivElement>(null)

    const importedReady = !!pair?.left && !!pair?.right
    const ready = importedReady || generatedPairAvailable

    useEffect(() => {
        let cancelled = false
        const run = async () => {
            if (!ready) { setLeftUrl(null); setRightUrl(null); return }
            setLoading(true); setError(''); setProcessingStage('technique')
            try {
                let leftBlob: Blob, rightBlob: Blob
                if (importedReady) {
                    leftBlob = pair!.left as File; rightBlob = pair!.right as File
                } else {
                    const params = new URLSearchParams({ scope: 'preview', format: 'png', quality: '100', swap_eyes: 'false' })
                    const [leftResponse, rightResponse] = await Promise.all([
                        fetch(`${apiUrl}/output/left?${params}`, { credentials: 'include' }),
                        fetch(`${apiUrl}/output/right?${params}`, { credentials: 'include' }),
                    ])
                    if (!leftResponse.ok || !rightResponse.ok) throw new Error('Could not retrieve generated stereo eyes')
                    leftBlob = await leftResponse.blob(); rightBlob = await rightResponse.blob()
                }
                if (cancelled) return
                const lu = blobUrl(leftBlob), ru = blobUrl(rightBlob)
                setLeftUrl(old => { if (old) URL.revokeObjectURL(old); return lu })
                setRightUrl(old => { if (old) URL.revokeObjectURL(old); return ru })
                setProcessingStage('ready')
            } catch (caught) {
                console.error(caught); if (!cancelled) { setError('Could not prepare projector images.'); setProcessingStage('error') }
            } finally { if (!cancelled) setLoading(false) }
        }
        void run()
        return () => { cancelled = true }
    }, [apiUrl, importedReady, pair?.left, pair?.right, generatedPairAvailable, ready, setProcessingStage])

    const physicalLeft = swapEyes ? rightUrl : leftUrl
    const physicalRight = swapEyes ? leftUrl : rightUrl
    const filterLabels = polarization === 'linear'
        ? (linearPreset === '0/90' ? ['0° linear', '90° linear'] : ['45° linear', '135° linear'])
        : (circularPreset === 'left/right' ? ['Left-circular', 'Right-circular'] : ['Right-circular', 'Left-circular'])

    const stageTransform = (align: Align) => ({ transform: `translate(${align.x}px, ${align.y}px) rotate(${align.rotation}deg) scale(${align.scale / 100}) skew(${align.keystoneX}deg, ${align.keystoneY}deg)`, filter: `brightness(${align.brightness}%)` })

    const renderContent = (eye: 'left' | 'right', url: string | null, align: Align) => {
        if (mode === 'grid') return <div className="polarGrid" style={stageTransform(align)}><span>{eye === 'left' ? 'LEFT PROJECTOR' : 'RIGHT PROJECTOR'}</span></div>
        if (mode === 'leakage') return <div className={`polarLeakage ${eye}`} style={stageTransform(align)}><strong>{eye === 'left' ? 'L' : 'R'}</strong><span>View through the opposite eye of the glasses: this should be as dark as possible.</span></div>
        return url ? <img src={url} alt={`${eye} projector`} style={stageTransform(align)} /> : <div className="polarEmpty">Stereo pair required</div>
    }

    const downloadEye = async (eye: 'left' | 'right') => {
        const source = eye === 'left' ? physicalLeft : physicalRight
        const align = eye === 'left' ? leftAlign : rightAlign
        if (!source) return
        setProcessingStage('full')
        try {
            const image = await loadImage(source)
            const canvas = document.createElement('canvas'); canvas.width = image.naturalWidth; canvas.height = image.naturalHeight
            const context = canvas.getContext('2d'); if (!context) throw new Error('Canvas unavailable')
            context.fillStyle = '#000'; context.fillRect(0, 0, canvas.width, canvas.height)
            context.save(); context.translate(canvas.width / 2 + align.x, canvas.height / 2 + align.y); context.rotate(align.rotation * Math.PI / 180); context.scale(align.scale / 100, align.scale / 100); context.filter = `brightness(${align.brightness}%)`; context.drawImage(image, -image.naturalWidth / 2, -image.naturalHeight / 2); context.restore()
            const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(value => value ? resolve(value) : reject(new Error('PNG encoding failed')), 'image/png'))
            const url = URL.createObjectURL(blob), link = document.createElement('a'); link.href = url; link.download = `polarized-projector-${eye}.png`; document.body.appendChild(link); link.click(); link.remove(); window.setTimeout(() => URL.revokeObjectURL(url), 1000)
            setProcessingStage('ready')
        } catch (caught) { console.error(caught); setError('Could not create projector export.'); setProcessingStage('error') }
    }

    const alignControl = (label: string, value: Align, setValue: (next: Align) => void) => <div className="polarAlignCard">
        <strong>{label}</strong>
        <div className="polarAlignFields">
            <label>X <input type="number" value={value.x} onChange={e => setValue({ ...value, x: Number(e.target.value) })}/><small>px</small></label>
            <label>Y <input type="number" value={value.y} onChange={e => setValue({ ...value, y: Number(e.target.value) })}/><small>px</small></label>
            <label>Scale <input type="number" min="50" max="150" step="0.1" value={value.scale} onChange={e => setValue({ ...value, scale: Number(e.target.value) })}/><small>%</small></label>
            <label>Rotate <input type="number" min="-15" max="15" step="0.05" value={value.rotation} onChange={e => setValue({ ...value, rotation: Number(e.target.value) })}/><small>°</small></label>
            <label>Keystone X <input type="number" min="-15" max="15" step="0.1" value={value.keystoneX} onChange={e => setValue({ ...value, keystoneX: Number(e.target.value) })}/><small>°</small></label>
            <label>Keystone Y <input type="number" min="-15" max="15" step="0.1" value={value.keystoneY} onChange={e => setValue({ ...value, keystoneY: Number(e.target.value) })}/><small>°</small></label>
            <label>Brightness <input type="number" min="20" max="150" value={value.brightness} onChange={e => setValue({ ...value, brightness: Number(e.target.value) })}/><small>%</small></label>
        </div>
        <button onClick={() => setValue(defaultAlign)}>Reset alignment</button>
    </div>

    return <main className="polarWorkspace">
        <section className="polarIntro"><div><div className="panelLabel">PASSIVE STEREO PROJECTION</div><h2>Dual-Projector Polarized 3D</h2><p>Send one eye to each projector, align the two images on a polarization-preserving screen, then put a matching polarizer in front of each projector. The software controls geometry; the filters and screen create the polarization.</p></div><div className="phantogramBadge">HARDWARE CALIBRATION</div></section>
        <div className="polarNotice"><strong>Two different projectors can work.</strong><span>Resolution, lens geometry, brightness and color may differ; the independent controls below compensate for alignment and brightness. A silver/polarization-preserving screen is still essential.</span></div>

        <section className="polarSetup">
            <div><span className="panelLabel">GLASSES / FILTER SYSTEM</span><strong>Match projector filters to the glasses you actually own</strong></div>
            <label>Polarization<select value={polarization} onChange={e => setPolarization(e.target.value as Polarization)}><option value="linear">Linear</option><option value="circular">Circular</option></select></label>
            {polarization === 'linear' ? <label>Axes<select value={linearPreset} onChange={e => setLinearPreset(e.target.value as LinearPreset)}><option value="0/90">0° / 90°</option><option value="45/135">45° / 135°</option></select></label> : <label>Handedness<select value={circularPreset} onChange={e => setCircularPreset(e.target.value as CircularPreset)}><option value="left/right">Left / Right circular</option><option value="right/left">Right / Left circular</option></select></label>}
            <label className="polarSwap"><input type="checkbox" checked={swapEyes} onChange={e => setSwapEyes(e.target.checked)}/> Swap projector eyes</label>
        </section>

        <div className="polarFilterMap"><div><strong>Projector A · left channel</strong><span>Filter: {filterLabels[0]}</span></div><div><strong>Projector B · right channel</strong><span>Filter: {filterLabels[1]}</span></div></div>
        {polarization === 'linear' ? <p className="polarFine">Linear glasses only work with matching orthogonal axes. Rotating your head causes crosstalk. The exact printed/physical axis of an unidentified pair should be measured rather than inferred from its frame.</p> : <p className="polarFine">Circular systems require matching handedness and projector filters built as circular polarizers. Different cinema systems are not automatically interchangeable merely because both are called “circular.”</p>}

        <div className="polarModeBar"><button className={mode === 'images' ? 'active' : ''} onClick={() => setMode('images')}>Stereo images</button><button className={mode === 'grid' ? 'active' : ''} onClick={() => setMode('grid')}>Alignment grid</button><button className={mode === 'leakage' ? 'active' : ''} onClick={() => setMode('leakage')}>Crosstalk test</button></div>
        <div className="polarStages"><div ref={leftStage} className="polarStage">{renderContent('left', physicalLeft, leftAlign)}<button onClick={() => leftStage.current?.requestFullscreen?.()}>Fullscreen A</button></div><div ref={rightStage} className="polarStage">{renderContent('right', physicalRight, rightAlign)}<button onClick={() => rightStage.current?.requestFullscreen?.()}>Fullscreen B</button></div></div>
        {loading && <div className="polarStatus">Preparing stereo eyes…</div>}{error && <div className="phantogramError">{error}</div>}

        <div className="polarAlignment">{alignControl('Projector A alignment', leftAlign, setLeftAlign)}{alignControl('Projector B alignment', rightAlign, setRightAlign)}</div>
        <div className="polarDownloads"><button disabled={!ready} onClick={() => void downloadEye('left')}>Download projector A PNG</button><button disabled={!ready} onClick={() => void downloadEye('right')}>Download projector B PNG</button></div>
        <p className="polarFine">For mismatched projectors, first make their physical image rectangles overlap as closely as possible with projector placement/zoom. Then use software translation, scale and rotation for fine registration. Keystone is best corrected optically or in each projector when possible; the preview skew controls are primarily diagnostic.</p>
    </main>
}

export default PolarizedProjection
