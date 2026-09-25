import { useEffect, useMemo, useRef, useState } from 'react'
import TechniqueControls from './TechniqueControls'
import { mergeStoredSettings, techniqueInfo, type TechniqueSettings } from './techniques'
import { isCompletePair, type StereoPairDraft } from './studioAssets'
import { renderStereoPairOutput, type PairTechnique } from './stereoPairRender'
import './styles/StereoPairEditor.css'
import UiIcon from './UiIcon'

type ProcessingStage = 'idle' | 'uploading' | 'depth' | 'stereo' | 'technique' | 'full' | 'ready' | 'error'
type DepthPairTechnique = 'chromadepth' | 'wiggle' | 'pulfrich' | 'randomdot' | 'pattern'
type PairStudioTechnique = PairTechnique | DepthPairTechnique
type DepthFit = 'crop' | 'fit' | 'stretch'

type Props = {
    pair: StereoPairDraft
    setProcessingStage: (stage: ProcessingStage) => void
    onSendToViewMaster: () => void
}

const supported = new Set<PairStudioTechnique>([
    'anaglyph', 'parallel', 'cross', 'cardboard', 'stereoscope', 'mirror', 'lenticular',
    'topbottom', 'halfsbs', 'rowinterlaced', 'columninterlaced', 'checkerboard',
    'chromadepth', 'wiggle', 'pulfrich', 'randomdot', 'pattern',
])
const depthTechniques = new Set<DepthPairTechnique>(['chromadepth', 'wiggle', 'pulfrich', 'randomdot', 'pattern'])
const settingsTechniques = new Set<PairStudioTechnique>(['anaglyph', 'cardboard', 'stereoscope', 'mirror', 'lenticular', 'chromadepth', 'wiggle', 'pulfrich', 'randomdot', 'pattern'])
const cloneSettings = (settings: TechniqueSettings): TechniqueSettings => JSON.parse(JSON.stringify(settings))

function StereoPairEditor({ pair, setProcessingStage, onSendToViewMaster }: Props) {
    const apiUrl = import.meta.env.VITE_FLASK_BACKEND_API_URL || 'http://localhost:8000'
    const previewRef = useRef<HTMLDivElement>(null)
    const preparedDepthSourceRef = useRef<File | null>(null)
    const initialSettings = mergeStoredSettings(localStorage.getItem('aaf-technique-settings'))
    const [activeTechnique, setActiveTechnique] = useState<PairStudioTechnique>('anaglyph')
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
    const [depthFit, setDepthFit] = useState<DepthFit>('crop')
    const [depthInvert, setDepthInvert] = useState(false)
    const [depthReady, setDepthReady] = useState(false)
    const depthWorkspace = 'pair-depth'

    const pairReady = isCompletePair(pair)
    const techniqueDirty = JSON.stringify(draftSettings) !== JSON.stringify(appliedSettings)
    const info = techniqueInfo[activeTechnique]
    const fixedPng = activeTechnique === 'stereoscope' || activeTechnique === 'mirror' || activeTechnique === 'lenticular'
    const fixedGif = activeTechnique === 'wiggle' || activeTechnique === 'pulfrich'

    useEffect(() => {
        localStorage.setItem('aaf-technique-settings', JSON.stringify(draftSettings))
    }, [draftSettings])

    useEffect(() => {
        let cancelled = false
        const prepare = async () => {
            if (!pair.left || !pair.depth) {
                setDepthReady(false)
                return
            }
            setDepthReady(false)
            setError('')
            setProcessingStage('depth')
            try {
                if (preparedDepthSourceRef.current !== pair.left) {
                    const sourceForm = new FormData()
                    sourceForm.append('file', pair.left, pair.left.name || 'left-eye.png')
                    const sourceResponse = await fetch(`${apiUrl}/image`, {
                        method: 'POST',
                        body: sourceForm,
                        credentials: 'include',
                        headers: { 'X-AAF-Workspace': depthWorkspace },
                    })
                    if (!sourceResponse.ok) throw new Error(`Could not prepare left-eye depth source: ${sourceResponse.status}`)
                    preparedDepthSourceRef.current = pair.left
                }

                const depthForm = new FormData()
                depthForm.append('file', pair.depth, pair.depth.name || 'depth-map.png')
                depthForm.append('mode', depthFit)
                depthForm.append('invert', String(depthInvert))
                const depthResponse = await fetch(`${apiUrl}/depth-map/import`, {
                    method: 'POST',
                    body: depthForm,
                    credentials: 'include',
                    headers: { 'X-AAF-Workspace': depthWorkspace },
                })
                const info = await depthResponse.json().catch(() => ({}))
                if (!depthResponse.ok) throw new Error(info.error || `Could not prepare pair depth map: ${depthResponse.status}`)
                if (!cancelled) {
                    setDepthReady(true)
                    setProcessingStage('ready')
                }
            } catch (caught) {
                console.error(caught)
                if (!cancelled) {
                    setError(caught instanceof Error ? caught.message : 'Could not prepare optional pair depth map')
                    setProcessingStage('error')
                }
            }
        }
        void prepare()
        return () => { cancelled = true }
    }, [apiUrl, pair.left, pair.depth, depthFit, depthInvert, setProcessingStage])

    const depthSpecialUrl = (technique: DepthPairTechnique, scope: 'preview' | 'full') => {
        const base = { scope, format: downloadFormat, quality: String(jpegQuality) }
        if (technique === 'chromadepth') {
            const s = appliedSettings.chromadepth
            return `${apiUrl}/special/chromadepth?${new URLSearchParams({...base, color_strength: String(s.colorStrength), reverse: String(s.reverse)}).toString()}`
        }
        if (technique === 'wiggle') {
            const s = appliedSettings.wiggle
            return `${apiUrl}/special/wiggle?${new URLSearchParams({...base, frames: String(s.frames), duration: String(s.duration)}).toString()}`
        }
        if (technique === 'pulfrich') {
            const s = appliedSettings.pulfrich
            return `${apiUrl}/special/pulfrich?${new URLSearchParams({...base, frames: String(s.frames), duration: String(s.duration), strength: String(s.strength), dark_eye: s.darkEye}).toString()}`
        }
        const s = appliedSettings.autostereogram
        return `${apiUrl}/special/autostereogram?${new URLSearchParams({...base, style: technique === 'pattern' ? 'pattern' : 'random', separation: String(s.separation), depth_strength: String(s.depthStrength), dot_size: String(s.dotSize), viewing: s.viewing, guides: String(s.guides), color: String(s.color), revision: String(s.patternRevision)}).toString()}`
    }

    const renderPreview = async () => {
        if (!pairReady) {
            setPreviewUrl(old => { if (old) URL.revokeObjectURL(old); return null })
            return
        }
        setLoading(true)
        setError('')
        setProcessingStage('technique')
        try {
            let blob: Blob
            if (depthTechniques.has(activeTechnique as DepthPairTechnique)) {
                if (!pair.depth || !depthReady) {
                    setPreviewUrl(old => { if (old) URL.revokeObjectURL(old); return null })
                    return
                }
                const response = await fetch(depthSpecialUrl(activeTechnique as DepthPairTechnique, 'preview'), {
                    credentials: 'include',
                    headers: { 'X-AAF-Workspace': depthWorkspace },
                })
                if (!response.ok) throw new Error(`Depth-based pair preview failed: ${response.status}`)
                blob = await response.blob()
            } else {
                const rendered = await renderStereoPairOutput(pair, {
                    technique: activeTechnique as PairTechnique,
                    settings: appliedSettings,
                    swapEyes,
                    scope: 'preview',
                    format: 'png',
                    quality: 95,
                })
                blob = rendered.blob
            }
            const nextUrl = URL.createObjectURL(blob)
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
    }, [pair.left, pair.right, pair.depth, activeTechnique, swapEyes, appliedSettings, depthReady])

    useEffect(() => () => { if (previewUrl) URL.revokeObjectURL(previewUrl) }, [previewUrl])

    const applyTechniqueSettings = (settings?: TechniqueSettings) => setAppliedSettings(cloneSettings(settings || draftSettings))

    const downloadCurrent = async () => {
        if (!pairReady || downloading) return
        setDownloading(true)
        setError('')
        setProcessingStage('full')
        try {
            const depthBased = depthTechniques.has(activeTechnique as DepthPairTechnique)
            if (depthBased && !depthReady) throw new Error('Optional depth map is not ready yet.')
            const format = activeTechnique === 'wiggle' || activeTechnique === 'pulfrich' ? 'gif' : fixedPng ? 'png' : downloadFormat
            let blob: Blob
            if (depthBased) {
                const response = await fetch(depthSpecialUrl(activeTechnique as DepthPairTechnique, activeTechnique === 'wiggle' || activeTechnique === 'pulfrich' ? 'preview' : 'full'), {
                    credentials: 'include',
                    headers: { 'X-AAF-Workspace': depthWorkspace },
                })
                if (!response.ok) throw new Error(`Depth-based pair download failed: ${response.status}`)
                blob = await response.blob()
            } else {
                const rendered = await renderStereoPairOutput(pair, {
                    technique: activeTechnique as PairTechnique,
                    settings: appliedSettings,
                    swapEyes,
                    scope: 'full',
                    format: format as 'jpeg' | 'png',
                    quality: jpegQuality,
                })
                blob = rendered.blob
            }
            const url = URL.createObjectURL(blob)
            const link = document.createElement('a')
            link.href = url
            link.download = `imported-pair-${activeTechnique}.${format === 'jpeg' ? 'jpg' : format}`
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

    useEffect(() => {
        const onKeyDown = (event: KeyboardEvent) => {
            if (event.repeat) return
            const target = event.target as HTMLElement | null
            if (target && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))) return
            const key = event.key.toLowerCase()
            const primary = event.metaKey || event.ctrlKey
            if (primary && !event.shiftKey && !event.altKey && key === 's' && previewUrl && pairReady && !downloading) {
                event.preventDefault()
                void downloadCurrent()
            }
        }
        window.addEventListener('keydown', onKeyDown)
        return () => window.removeEventListener('keydown', onKeyDown)
    }, [previewUrl, pairReady, downloading, activeTechnique, appliedSettings, swapEyes, downloadFormat, jpegQuality, depthReady])

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
        if (supported.has(value as PairStudioTechnique)) setActiveTechnique(value as PairStudioTechnique)
    }

    const specialSelected = !['anaglyph', 'parallel', 'cross'].includes(activeTechnique)
    const settingsVisible = settingsTechniques.has(activeTechnique)
    const pairNote = useMemo(() => {
        if (activeTechnique === 'lenticular') return 'Imported pairs use a two-view lenticular interlace. No intermediate viewpoints are invented.'
        if (activeTechnique === 'cardboard') return 'The two imported views are positioned directly for the selected phone-viewer geometry.'
        if (activeTechnique === 'stereoscope') return 'The imported left/right photographs are placed directly on the printable stereograph card.'
        if (activeTechnique === 'mirror') return 'One imported eye is horizontally reversed and placed across a configurable center mirror gap for single-mirror viewing.'
        if (activeTechnique === 'chromadepth') return 'Uses the optional depth map with the LEFT-eye image to encode depth as spectral color.'
        if (activeTechnique === 'wiggle') return 'Uses the optional depth map with the LEFT-eye image to synthesize additional virtual viewpoints.'
        if (activeTechnique === 'pulfrich') return 'Uses the optional depth map with the LEFT-eye image to create depth-dependent horizontal motion for one-eye neutral-density Pulfrich viewing.'
        if (activeTechnique === 'randomdot' || activeTechnique === 'pattern') return 'Uses the optional depth map to generate an autostereogram; the imported right-eye image is not needed for this output.'
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
                <optgroup label={pair.depth ? 'Optional depth map techniques' : 'Add optional depth map to unlock'}><option value="chromadepth" disabled={!pair.depth}>ChromaDepth</option><option value="wiggle" disabled={!pair.depth}>Wiggle-gram multi-view</option><option value="pulfrich" disabled={!pair.depth}>Pulfrich Motion 3D</option><option value="randomdot" disabled={!pair.depth}>Random-Dot Stereogram</option><option value="pattern" disabled={!pair.depth}>Pattern Stereogram</option><option disabled>Phantogram · use single-image Studio</option></optgroup>
            </select>
        </div>

        <div className="techniqueSummary"><strong>{info.label}</strong><span>{pairNote}</span><em>Imported stereo</em></div>

        <div className="pairPreviewFrame" ref={previewRef}>
            {previewUrl ? <img src={previewUrl} alt={info.label} style={{ maxWidth: `${viewScale}%` }} /> : <div className="emptyStage"><div className="stereoGlyph">L · R</div><strong>Load both stereo images</strong><span>The pair will be used directly by compatible techniques.</span></div>}
            {loading && <div className="loadingVeil"><div className="largeLoader" /><span>Rendering {info.label}…</span></div>}
        </div>

        <div className="pairPreviewMeta">
            <div><strong>{info.label}</strong><span>{pairNote}</span></div>
            <div className="previewActions"><button onClick={() => previewRef.current?.requestFullscreen?.()} disabled={!previewUrl}><UiIcon name="expand" /> Fullscreen</button><button className="downloadAction" onClick={() => void downloadCurrent()} disabled={!pairReady || downloading || (depthTechniques.has(activeTechnique as DepthPairTechnique) && !depthReady)}>{downloading ? 'Preparing…' : <><UiIcon name="download" /> Download <kbd>⌘S</kbd></>}</button></div>
        </div>

        <div className="settingsCard pairGenericSettings">
            <div className="settingGroup"><div className="settingTitle"><span>On-screen preview size</span><strong>{viewScale}%</strong></div><input type="range" min="35" max="100" step="1" value={viewScale} onChange={(event) => setViewScale(Number(event.target.value))} /></div>
            <label className="toggleSetting"><span><strong>Swap left / right</strong><small>{depthTechniques.has(activeTechnique as DepthPairTechnique) ? 'Not used by depth-derived outputs' : 'Reverse eye order without altering the imported files'}</small></span><input type="checkbox" checked={swapEyes} disabled={depthTechniques.has(activeTechnique as DepthPairTechnique)} onChange={(event) => setSwapEyes(event.target.checked)} /></label>
            {pair.depth && <div className="pairDepthSettings"><label><span>Depth alignment</span><select value={depthFit} onChange={(event) => setDepthFit(event.target.value as DepthFit)}><option value="crop">Crop to left eye</option><option value="fit">Fit inside left eye</option><option value="stretch">Stretch to left eye</option></select></label><label className="toggleSetting"><span><strong>Invert depth near / far</strong><small>Applies only to the optional pair depth map</small></span><input type="checkbox" checked={depthInvert} onChange={(event) => setDepthInvert(event.target.checked)} /></label><span className={depthReady ? 'pairDepthReady ready' : 'pairDepthReady'}>{depthReady ? 'Optional depth ready' : 'Preparing optional depth…'}</span></div>}
        </div>

        {settingsVisible && <TechniqueControls technique={activeTechnique} settings={draftSettings} setSettings={setDraftSettings} onApply={applyTechniqueSettings} dirty={techniqueDirty} disabled={!pairReady || (depthTechniques.has(activeTechnique as DepthPairTechnique) && !depthReady)} apiUrl={apiUrl} workspace={depthTechniques.has(activeTechnique as DepthPairTechnique) ? depthWorkspace : undefined} />}

        {error && <div className="pairEditorError">{error}</div>}

        <div className="downloadPanel">
            <div className="downloadHeading"><div><strong>Imported stereo source</strong><span>Compatible outputs are rendered directly from the original left/right files at full resolution.</span></div><span className="fullResBadge">NO AI REQUIRED</span></div>
            <div className="downloadControls">
                {fixedGif ? <div className="fixedFormat"><span>Format</span><strong>GIF</strong></div> : fixedPng ? <div className="fixedFormat"><span>Format</span><strong>PNG</strong></div> : <label>Format<select value={downloadFormat} onChange={(event) => setDownloadFormat(event.target.value as 'jpeg' | 'png')}><option value="png">PNG</option><option value="jpeg">JPEG</option></select></label>}
                {!fixedGif && !fixedPng && downloadFormat === 'jpeg' && <label>JPEG quality<input type="range" min="70" max="100" value={jpegQuality} onChange={(event) => setJpegQuality(Number(event.target.value))} /><strong>{jpegQuality}</strong></label>}
                <div className="eyeDownloads"><button onClick={() => downloadEye('left')} disabled={!pair.left}><UiIcon name="download" /> Left eye</button><button onClick={() => downloadEye('right')} disabled={!pair.right}><UiIcon name="download" /> Right eye</button></div>
                <button className="pairToReel" onClick={onSendToViewMaster} disabled={!pairReady}>Add pair to View-Master</button>
            </div>
        </div>
    </div>
}

export default StereoPairEditor
