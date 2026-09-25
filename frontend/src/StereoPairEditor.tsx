import { useEffect, useMemo, useRef, useState } from 'react'
import TechniqueControls from './TechniqueControls'
import { mergeStoredSettings, techniqueInfo, type TechniqueSettings } from './techniques'
import { isCompletePair, type StereoPairDraft } from './studioAssets'
import { renderStereoPairOutput, type PairTechnique } from './stereoPairRender'
import './styles/StereoPairEditor.css'

type ProcessingStage = 'idle' | 'uploading' | 'depth' | 'stereo' | 'technique' | 'full' | 'ready' | 'error'

type Props = {
    pair: StereoPairDraft
    setProcessingStage: (stage: ProcessingStage) => void
    onSendToViewMaster: () => void
}

const supported = new Set<PairTechnique>([
    'anaglyph', 'parallel', 'cross', 'cardboard', 'stereoscope', 'mirror', 'lenticular',
    'topbottom', 'halfsbs', 'rowinterlaced', 'columninterlaced', 'checkerboard',
])

const settingsTechniques = new Set<PairTechnique>(['anaglyph', 'cardboard', 'stereoscope', 'mirror', 'lenticular'])
const cloneSettings = (settings: TechniqueSettings): TechniqueSettings => JSON.parse(JSON.stringify(settings))

function StereoPairEditor({ pair, setProcessingStage, onSendToViewMaster }: Props) {
    const apiUrl = import.meta.env.VITE_FLASK_BACKEND_API_URL || 'http://localhost:8000'
    const previewRef = useRef<HTMLDivElement>(null)
    const initialSettings = mergeStoredSettings(localStorage.getItem('aaf-technique-settings'))
    const [activeTechnique, setActiveTechnique] = useState<PairTechnique>('anaglyph')
    const [draftSettings, setDraftSettings] = useState<TechniqueSettings>(() => cloneSettings(initialSettings))
    const [appliedSettings, setAppliedSettings] = useState<TechniqueSettings>(() => cloneSettings(initialSettings))
    const [swapEyes, setSwapEyes] = useState(false)
    const [previewUrl, setPreviewUrl] = useState<string | null>(null)
    const [loading, setLoading] = useState(false)
    const [downloading, setDownloading] = useState(false)
    const [error, setError] = useState('')
    const [viewScale, setViewScale] = useState(100)
    const [downloadFormat, setDownloadFormat] = useState<'jpeg' | 'png'>('png')
    const [jpegQuality, setJpegQuality] = useState(95)

    const pairReady = isCompletePair(pair)
    const techniqueDirty = JSON.stringify(draftSettings) !== JSON.stringify(appliedSettings)
    const info = techniqueInfo[activeTechnique]
    const fixedPng = activeTechnique === 'stereoscope' || activeTechnique === 'mirror' || activeTechnique === 'lenticular'

    useEffect(() => {
        localStorage.setItem('aaf-technique-settings', JSON.stringify(draftSettings))
    }, [draftSettings])

    const renderPreview = async () => {
        if (!pairReady) {
            setPreviewUrl(old => { if (old) URL.revokeObjectURL(old); return null })
            return
        }
        setLoading(true)
        setError('')
        setProcessingStage('technique')
        try {
            const rendered = await renderStereoPairOutput(pair, {
                technique: activeTechnique,
                settings: appliedSettings,
                swapEyes,
                scope: 'preview',
                format: 'png',
                quality: 95,
            })
            const nextUrl = URL.createObjectURL(rendered.blob)
            setPreviewUrl(old => { if (old) URL.revokeObjectURL(old); return nextUrl })
            setProcessingStage('ready')
        } catch (caught) {
            console.error(caught)
            setError(caught instanceof Error ? caught.message : 'Could not render imported stereo pair')
            setProcessingStage('error')
        } finally {
            setLoading(false)
        }
    }

    useEffect(() => {
        void renderPreview()
    }, [pair.left, pair.right, activeTechnique, swapEyes, appliedSettings])

    useEffect(() => () => { if (previewUrl) URL.revokeObjectURL(previewUrl) }, [previewUrl])

    const applyTechniqueSettings = (settings?: TechniqueSettings) => setAppliedSettings(cloneSettings(settings || draftSettings))

    const downloadCurrent = async () => {
        if (!pairReady || downloading) return
        setDownloading(true)
        setError('')
        setProcessingStage('full')
        try {
            const format = fixedPng ? 'png' : downloadFormat
            const rendered = await renderStereoPairOutput(pair, {
                technique: activeTechnique,
                settings: appliedSettings,
                swapEyes,
                scope: 'full',
                format,
                quality: jpegQuality,
            })
            const url = URL.createObjectURL(rendered.blob)
            const link = document.createElement('a')
            link.href = url
            link.download = `imported-pair-${activeTechnique}.${format === 'jpeg' ? 'jpg' : 'png'}`
            document.body.appendChild(link)
            link.click()
            link.remove()
            window.setTimeout(() => URL.revokeObjectURL(url), 1000)
            setProcessingStage('ready')
        } catch (caught) {
            console.error(caught)
            setError(caught instanceof Error ? caught.message : 'Could not create full-resolution pair output')
            setProcessingStage('error')
        } finally {
            setDownloading(false)
        }
    }

    const downloadEye = (eye: 'left' | 'right') => {
        const file = pair[eye]
        if (!file) return
        const url = URL.createObjectURL(file)
        const link = document.createElement('a')
        link.href = url
        link.download = file.name || `${eye}-eye`
        document.body.appendChild(link)
        link.click()
        link.remove()
        window.setTimeout(() => URL.revokeObjectURL(url), 1000)
    }

    const selectMore = (value: string) => {
        if (supported.has(value as PairTechnique)) setActiveTechnique(value as PairTechnique)
    }

    const specialSelected = !['anaglyph', 'parallel', 'cross'].includes(activeTechnique)
    const settingsVisible = settingsTechniques.has(activeTechnique)
    const pairNote = useMemo(() => {
        if (activeTechnique === 'lenticular') return 'Imported pairs use a two-view lenticular interlace. No intermediate viewpoints are invented.'
        if (activeTechnique === 'cardboard') return 'The two imported views are positioned directly for the selected phone-viewer geometry.'
        if (activeTechnique === 'stereoscope') return 'The imported left/right photographs are placed directly on the printable stereograph card.'
        if (activeTechnique === 'mirror') return 'One imported eye is horizontally reversed and placed across a configurable center mirror gap for single-mirror viewing.'
        return 'The supplied left and right images are used directly. No depth map or AI-generated second eye is involved.'
    }, [activeTechnique])

    return <div className="pairEditorWorkspace">
        <div className="editorHeader">
            <div><div className="panelLabel">OUTPUT</div><h2>Imported Stereo Pair Studio</h2></div>
            <div className="generationState">{loading ? 'Rendering imported pair…' : pairReady ? 'Pair ready' : 'Waiting for both eyes'}</div>
        </div>

        <div className="techniqueChooser">
            <div className="outputTabs">
                <button className={activeTechnique === 'anaglyph' ? 'outputTab active' : 'outputTab'} onClick={() => setActiveTechnique('anaglyph')}>Anaglyph</button>
                <button className={activeTechnique === 'parallel' ? 'outputTab active' : 'outputTab'} onClick={() => setActiveTechnique('parallel')}>Parallel</button>
                <button className={activeTechnique === 'cross' ? 'outputTab active' : 'outputTab'} onClick={() => setActiveTechnique('cross')}>Cross-Eyed</button>
            </div>
            <select className={specialSelected ? 'moreTechniques active' : 'moreTechniques'} value={specialSelected ? activeTechnique : ''} onChange={(event) => selectMore(event.target.value)}>
                <option value="" disabled>More techniques…</option>
                <optgroup label="Viewers"><option value="cardboard">Cardboard / Phone Viewer</option><option value="stereoscope">Traditional Stereoscope Card</option><option value="mirror">Single-Mirror Stereoscope</option></optgroup>
                <optgroup label="Print"><option value="lenticular">Lenticular 3D · two-view</option></optgroup>
                <optgroup label="Display & compatibility"><option value="halfsbs">Half-Width Side-by-Side</option><option value="topbottom">Top / Bottom Stereo</option><option value="rowinterlaced">Row-Interlaced</option><option value="columninterlaced">Column-Interlaced</option><option value="checkerboard">Checkerboard Stereo</option></optgroup>
                <optgroup label="Requires source + depth map"><option disabled>ChromaDepth</option><option disabled>Wiggle-gram multi-view</option><option disabled>Random-Dot Stereogram</option><option disabled>Pattern Stereogram</option><option disabled>Phantogram</option></optgroup>
            </select>
        </div>

        <div className="techniqueSummary"><strong>{info.label}</strong><span>{pairNote}</span><em>Imported stereo</em></div>

        <div className="pairPreviewFrame" ref={previewRef}>
            {previewUrl ? <img src={previewUrl} alt={info.label} style={{ maxWidth: `${viewScale}%` }} /> : <div className="emptyStage"><div className="stereoGlyph">L · R</div><strong>Load both stereo images</strong><span>The pair will be used directly by compatible techniques.</span></div>}
            {loading && <div className="loadingVeil"><div className="largeLoader" /><span>Rendering {info.label}…</span></div>}
        </div>

        <div className="pairPreviewMeta">
            <div><strong>{info.label}</strong><span>{pairNote}</span></div>
            <div className="previewActions"><button onClick={() => previewRef.current?.requestFullscreen?.()} disabled={!previewUrl}>Fullscreen</button><button className="downloadAction" onClick={() => void downloadCurrent()} disabled={!pairReady || downloading}>{downloading ? 'Preparing…' : 'Download'}</button></div>
        </div>

        <div className="settingsCard pairGenericSettings">
            <div className="settingGroup"><div className="settingTitle"><span>On-screen preview size</span><strong>{viewScale}%</strong></div><input type="range" min="35" max="100" step="1" value={viewScale} onChange={(event) => setViewScale(Number(event.target.value))} /></div>
            <label className="toggleSetting"><span><strong>Swap left / right</strong><small>Reverse eye order without altering the imported files</small></span><input type="checkbox" checked={swapEyes} onChange={(event) => setSwapEyes(event.target.checked)} /></label>
        </div>

        {settingsVisible && <TechniqueControls technique={activeTechnique} settings={draftSettings} setSettings={setDraftSettings} onApply={applyTechniqueSettings} dirty={techniqueDirty} disabled={!pairReady} apiUrl={apiUrl} />}

        {error && <div className="pairEditorError">{error}</div>}

        <div className="downloadPanel">
            <div className="downloadHeading"><div><strong>Imported stereo source</strong><span>Compatible outputs are rendered directly from the original left/right files at full resolution.</span></div><span className="fullResBadge">NO AI REQUIRED</span></div>
            <div className="downloadControls">
                {fixedPng ? <div className="fixedFormat"><span>Format</span><strong>PNG</strong></div> : <label>Format<select value={downloadFormat} onChange={(event) => setDownloadFormat(event.target.value as 'jpeg' | 'png')}><option value="png">PNG</option><option value="jpeg">JPEG</option></select></label>}
                {!fixedPng && downloadFormat === 'jpeg' && <label>JPEG quality<input type="range" min="70" max="100" value={jpegQuality} onChange={(event) => setJpegQuality(Number(event.target.value))} /><strong>{jpegQuality}</strong></label>}
                <div className="eyeDownloads"><button onClick={() => downloadEye('left')} disabled={!pair.left}>Left eye</button><button onClick={() => downloadEye('right')} disabled={!pair.right}>Right eye</button></div>
                <button className="pairToReel" onClick={onSendToViewMaster} disabled={!pairReady}>Add pair to View-Master</button>
            </div>
        </div>
    </div>
}

export default StereoPairEditor
