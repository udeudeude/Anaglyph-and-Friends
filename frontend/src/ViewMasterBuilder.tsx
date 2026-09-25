import { useEffect, useMemo, useState } from 'react'
import type { ChangeEvent } from 'react'
import { downloadViewMasterPdf } from './viewMasterPdf'
import { generateBrowserDepth, hostedBrowserDepthEnabled } from './browserDepth'
import type { StudioSource } from './studioAssets'
import './styles/ViewMasterBuilder.css'
import UiIcon from './UiIcon'
import './styles/ViewMasterPairSlots.css'

type ProcessingStage = 'idle' | 'uploading' | 'depth' | 'stereo' | 'technique' | 'full' | 'ready' | 'error'

type Props = {
    setProcessingStage: (stage: ProcessingStage) => void
    incomingSource: StudioSource | null
    onIncomingSourceConsumed: () => void
    onOpenInStudio: (source: StudioSource) => void
}

type ReelSlot = {
    mode: 'single' | 'pair'
    file: File | null
    previewUrl: string | null
    leftFile: File | null
    rightFile: File | null
    leftPreviewUrl: string | null
    rightPreviewUrl: string | null
}

type StereoPair = {
    left: string
    right: string
}

const SLOT_COUNT = 7
const REEL_DIAMETER_MM = 90
const FRAME_WIDTH_MM = 11.75
const FRAME_HEIGHT_MM = 10.5
const FRAME_CENTER_RADIUS_MM = 31.3
const INDEX_RADIUS_MM = 38.5
const MASTER_SIZE_MM = 98
const MASTER_CENTER_MM = MASTER_SIZE_MM / 2
const POSITION_STEP_DEG = 360 / 14
const SCENE_STEP_DEG = 360 / SLOT_COUNT
const VIEWMASTER_HEADERS = { 'X-AAF-Workspace': 'viewmaster' }

const emptySlot = (): ReelSlot => ({ mode: 'single', file: null, previewUrl: null, leftFile: null, rightFile: null, leftPreviewUrl: null, rightPreviewUrl: null })
const emptySlots = (): ReelSlot[] => Array.from({ length: SLOT_COUNT }, emptySlot)
const slotReady = (slot: ReelSlot) => slot.mode === 'single' ? !!slot.file : !!slot.leftFile && !!slot.rightFile

const releaseSlotUrls = (slot: ReelSlot) => {
    ;[slot.previewUrl, slot.leftPreviewUrl, slot.rightPreviewUrl].forEach(url => { if (url) URL.revokeObjectURL(url) })
}

const blobToDataUrl = (blob: Blob) => new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(blob)
})

const pointOnCircle = (radius: number, angleDeg: number) => {
    const radians = angleDeg * Math.PI / 180
    return {
        x: MASTER_CENTER_MM + radius * Math.cos(radians),
        y: MASTER_CENTER_MM + radius * Math.sin(radians),
    }
}

const scenePositions = (scene: number) => {
    const left = (scene * 2) % 14
    return { left, right: (left + 7) % 14 }
}

function filmMasterSvg(pairs: StereoPair[], imageRotation: number) {
    const images: string[] = []
    const labels: string[] = []

    pairs.forEach((pair, scene) => {
        const positions = scenePositions(scene)
        const rotation = scene * SCENE_STEP_DEG + imageRotation
        ;(['left', 'right'] as const).forEach(eye => {
            const position = positions[eye]
            const centerAngle = 180 + position * POSITION_STEP_DEG
            const center = pointOnCircle(FRAME_CENTER_RADIUS_MM, centerAngle)
            const href = pair[eye]
            images.push(`<image href="${href}" x="${-FRAME_WIDTH_MM / 2}" y="${-FRAME_HEIGHT_MM / 2}" width="${FRAME_WIDTH_MM}" height="${FRAME_HEIGHT_MM}" preserveAspectRatio="xMidYMid slice" transform="translate(${center.x.toFixed(4)} ${center.y.toFixed(4)}) rotate(${rotation.toFixed(4)})"/>`)
            const labelPoint = pointOnCircle(FRAME_CENTER_RADIUS_MM - 8.0, centerAngle)
            labels.push(`<text x="${labelPoint.x.toFixed(3)}" y="${labelPoint.y.toFixed(3)}" text-anchor="middle" dominant-baseline="middle" font-family="Arial, sans-serif" font-size="1.5" fill="#4a4a4a">${scene + 1}${eye === 'left' ? 'L' : 'R'}</text>`)
        })
    })

    const indexGuides = Array.from({ length: 7 }, (_, index) => {
        const angle = -90 + index * (360 / 7)
        const center = pointOnCircle(INDEX_RADIUS_MM, angle)
        return `<rect x="-2.1" y="-3.5" width="4.2" height="7" rx="0.5" fill="none" stroke="#777" stroke-width="0.18" stroke-dasharray="0.8 0.5" transform="translate(${center.x.toFixed(3)} ${center.y.toFixed(3)}) rotate(${(angle + 90).toFixed(3)})"/>`
    }).join('')

    return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${MASTER_SIZE_MM}mm" height="${MASTER_SIZE_MM}mm" viewBox="0 0 ${MASTER_SIZE_MM} ${MASTER_SIZE_MM}">
  <title>Anaglyph &amp; Friends View-Master transparency master</title>
  <desc>Seven stereo pairs arranged as fourteen View-Master frames. Print at 100% / actual size.</desc>
  <defs><clipPath id="reelClip"><circle cx="${MASTER_CENTER_MM}" cy="${MASTER_CENTER_MM}" r="${REEL_DIAMETER_MM / 2}"/></clipPath></defs>
  <g clip-path="url(#reelClip)">${images.join('')}</g>
  <g fill="none" stroke="#777" stroke-width="0.18" stroke-dasharray="1 0.65">
    <circle cx="${MASTER_CENTER_MM}" cy="${MASTER_CENTER_MM}" r="${REEL_DIAMETER_MM / 2}"/>
    <circle cx="${MASTER_CENTER_MM}" cy="${MASTER_CENTER_MM}" r="3.5"/>
  </g>
  ${indexGuides}
  ${labels.join('')}
  <g font-family="Arial, sans-serif" fill="#555" text-anchor="middle">
    <text x="${MASTER_CENTER_MM}" y="3.0" font-size="1.8">VIEW-MASTER TRANSPARENCY MASTER - PRINT 100% / ACTUAL SIZE</text>
    <text x="${MASTER_CENTER_MM}" y="${MASTER_SIZE_MM - 1.7}" font-size="1.35">90 mm reel - 11.75 x 10.5 mm frames - prototype transport cut guides</text>
  </g>
</svg>`
}

function cardTemplateSvg() {
    const windows: string[] = []
    for (let position = 0; position < 14; position += 1) {
        const centerAngle = 180 + position * POSITION_STEP_DEG
        const center = pointOnCircle(FRAME_CENTER_RADIUS_MM, centerAngle)
        const rotation = position * POSITION_STEP_DEG
        windows.push(`<rect x="${-FRAME_WIDTH_MM / 2}" y="${-FRAME_HEIGHT_MM / 2}" width="${FRAME_WIDTH_MM}" height="${FRAME_HEIGHT_MM}" rx="0.45" fill="#111" transform="translate(${center.x.toFixed(4)} ${center.y.toFixed(4)}) rotate(${rotation.toFixed(4)})"/>`)
    }
    const indexHoles = Array.from({ length: 7 }, (_, index) => {
        const angle = -90 + index * (360 / 7)
        const center = pointOnCircle(INDEX_RADIUS_MM, angle)
        return `<rect x="-2.1" y="-3.5" width="4.2" height="7" rx="0.5" fill="#111" transform="translate(${center.x.toFixed(3)} ${center.y.toFixed(3)}) rotate(${(angle + 90).toFixed(3)})"/>`
    }).join('')

    return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${MASTER_SIZE_MM}mm" height="${MASTER_SIZE_MM}mm" viewBox="0 0 ${MASTER_SIZE_MM} ${MASTER_SIZE_MM}">
  <title>Anaglyph &amp; Friends View-Master cardstock template</title>
  <rect width="100%" height="100%" fill="#fff"/>
  <circle cx="${MASTER_CENTER_MM}" cy="${MASTER_CENTER_MM}" r="${REEL_DIAMETER_MM / 2}" fill="#fff" stroke="#111" stroke-width="0.25"/>
  ${windows.join('')}
  ${indexHoles}
  <circle cx="${MASTER_CENTER_MM}" cy="${MASTER_CENTER_MM}" r="3.5" fill="#111"/>
  <g font-family="Arial, sans-serif" fill="#222" text-anchor="middle">
    <text x="${MASTER_CENTER_MM}" y="3.0" font-size="1.8">VIEW-MASTER CARD TEMPLATE - PRINT 100% / ACTUAL SIZE</text>
    <text x="${MASTER_CENTER_MM}" y="${MASTER_SIZE_MM - 1.7}" font-size="1.35">Cut black areas. All reel, frame, center and index dimensions are prototype geometry pending physical verification.</text>
  </g>
</svg>`
}

function downloadSvg(svg: string, filename: string) {
    const blob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = filename
    document.body.appendChild(link)
    link.click()
    link.remove()
    window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}

function ViewMasterBuilder({ setProcessingStage, incomingSource, onIncomingSourceConsumed, onOpenInStudio }: Props) {
    const apiUrl = import.meta.env.VITE_FLASK_BACKEND_API_URL || 'http://localhost:8000'
    const useBrowserDepth = hostedBrowserDepthEnabled()
    const [slots, setSlots] = useState<ReelSlot[]>(emptySlots)
    const [strength, setStrength] = useState(2)
    const [popOut, setPopOut] = useState(false)
    const [imageRotation, setImageRotation] = useState(0)
    const [building, setBuilding] = useState(false)
    const [progress, setProgress] = useState('')
    const [error, setError] = useState('')
    const [masterSvg, setMasterSvg] = useState('')
    const [masterPairs, setMasterPairs] = useState<StereoPair[] | null>(null)

    const readyCount = useMemo(() => slots.filter(slotReady).length, [slots])
    const generatedCount = useMemo(() => slots.filter(slot => slot.mode === 'single' && !!slot.file).length, [slots])
    const importedPairCount = useMemo(() => slots.filter(slot => slot.mode === 'pair' && !!slot.leftFile && !!slot.rightFile).length, [slots])
    const masterUrl = useMemo(() => masterSvg ? URL.createObjectURL(new Blob([masterSvg], { type: 'image/svg+xml' })) : '', [masterSvg])

    const invalidateMaster = () => {
        setMasterSvg('')
        setMasterPairs(null)
    }

    const replaceSlot = (index: number, replacement: ReelSlot) => {
        invalidateMaster()
        setError('')
        setSlots(current => current.map((slot, slotIndex) => {
            if (slotIndex !== index) return slot
            releaseSlotUrls(slot)
            return replacement
        }))
    }

    const slotFromSource = (source: StudioSource): ReelSlot => source.kind === 'single'
        ? { ...emptySlot(), mode: 'single', file: source.file, previewUrl: URL.createObjectURL(source.file) }
        : { ...emptySlot(), mode: 'pair', leftFile: source.left, rightFile: source.right, leftPreviewUrl: URL.createObjectURL(source.left), rightPreviewUrl: URL.createObjectURL(source.right) }

    useEffect(() => {
        if (!incomingSource) return
        const index = slots.findIndex(slot => !slotReady(slot))
        if (index < 0) setError('All seven View-Master scenes are already occupied. Clear or replace a scene before sending another Studio source.')
        else replaceSlot(index, slotFromSource(incomingSource))
        onIncomingSourceConsumed()
    }, [incomingSource])

    const setMode = (index: number, mode: 'single' | 'pair') => replaceSlot(index, { ...emptySlot(), mode })

    const chooseSingle = (index: number, event: ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0]
        event.currentTarget.value = ''
        if (!file || !file.type.startsWith('image/')) return
        replaceSlot(index, { ...emptySlot(), mode: 'single', file, previewUrl: URL.createObjectURL(file) })
    }

    const choosePairEye = (index: number, eye: 'left' | 'right', event: ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0]
        event.currentTarget.value = ''
        if (!file || !file.type.startsWith('image/')) return
        invalidateMaster()
        setError('')
        setSlots(current => current.map((slot, slotIndex) => {
            if (slotIndex !== index) return slot
            const previousUrl = eye === 'left' ? slot.leftPreviewUrl : slot.rightPreviewUrl
            if (previousUrl) URL.revokeObjectURL(previousUrl)
            return eye === 'left'
                ? { ...slot, mode: 'pair', leftFile: file, leftPreviewUrl: URL.createObjectURL(file), file: null, previewUrl: null }
                : { ...slot, mode: 'pair', rightFile: file, rightPreviewUrl: URL.createObjectURL(file), file: null, previewUrl: null }
        }))
    }

    const sourceForSlot = (slot: ReelSlot): StudioSource | null => {
        if (slot.mode === 'single' && slot.file) return { kind: 'single', file: slot.file }
        if (slot.mode === 'pair' && slot.leftFile && slot.rightFile) return { kind: 'pair', left: slot.leftFile, right: slot.rightFile }
        return null
    }

    const reset = () => {
        slots.forEach(releaseSlotUrls)
        if (masterUrl) URL.revokeObjectURL(masterUrl)
        setSlots(emptySlots())
        invalidateMaster()
        setProgress('')
        setError('')
        setProcessingStage('idle')
    }

    const fetchPair = async (file: File, scene: number): Promise<StereoPair> => {
        setProgress(`Scene ${scene + 1} of 7: loading original…`)
        setProcessingStage('uploading')
        const form = new FormData()
        form.append('file', file, file.name || `view-master-${scene + 1}.png`)
        const upload = await fetch(`${apiUrl}/image`, { method: 'POST', body: form, credentials: 'include', headers: VIEWMASTER_HEADERS })
        if (!upload.ok) throw new Error(`Scene ${scene + 1}: source upload failed`)

        setProgress(`Scene ${scene + 1} of 7: estimating depth…`)
        setProcessingStage('depth')
        if (useBrowserDepth) {
            const generated = await generateBrowserDepth(file, message => setProgress(`Scene ${scene + 1} of 7: ${message}`))
            const depthForm = new FormData()
            depthForm.append('file', generated.file, generated.file.name)
            const depth = await fetch(`${apiUrl}/depth-map/ai-import`, { method: 'POST', body: depthForm, credentials: 'include', headers: VIEWMASTER_HEADERS })
            if (!depth.ok) {
                const body = await depth.json().catch(() => ({}))
                throw new Error(body.error || `Scene ${scene + 1}: browser depth import failed`)
            }
        } else {
            const depth = await fetch(`${apiUrl}/depth-map`, { credentials: 'include', headers: VIEWMASTER_HEADERS })
            if (!depth.ok) {
                const body = await depth.json().catch(() => ({}))
                throw new Error(body.error || `Scene ${scene + 1}: depth estimation failed`)
            }
        }

        setProgress(`Scene ${scene + 1} of 7: building stereo pair…`)
        setProcessingStage('stereo')
        const renderParams = new URLSearchParams({ pop_out: String(popOut), max_disparity_percentage: String(strength) })
        const render = await fetch(`${apiUrl}/render?${renderParams.toString()}`, { credentials: 'include', headers: VIEWMASTER_HEADERS })
        if (!render.ok) throw new Error(`Scene ${scene + 1}: stereo render failed`)

        const outputParams = new URLSearchParams({
            scope: 'preview', format: 'png', quality: '100', pop_out: String(popOut),
            max_disparity_percentage: String(strength), swap_eyes: 'false',
        })
        const [leftResponse, rightResponse] = await Promise.all([
            fetch(`${apiUrl}/output/left?${outputParams.toString()}`, { credentials: 'include', headers: VIEWMASTER_HEADERS }),
            fetch(`${apiUrl}/output/right?${outputParams.toString()}`, { credentials: 'include', headers: VIEWMASTER_HEADERS }),
        ])
        if (!leftResponse.ok || !rightResponse.ok) throw new Error(`Scene ${scene + 1}: eye-image export failed`)
        return {
            left: await blobToDataUrl(await leftResponse.blob()),
            right: await blobToDataUrl(await rightResponse.blob()),
        }
    }

    const build = async () => {
        if (slots.some(slot => !slotReady(slot))) return
        setBuilding(true)
        setError('')
        invalidateMaster()
        try {
            const pairs: StereoPair[] = []
            for (let scene = 0; scene < SLOT_COUNT; scene += 1) {
                const slot = slots[scene]
                if (slot.mode === 'pair' && slot.leftFile && slot.rightFile) {
                    setProgress(`Scene ${scene + 1} of 7: using imported stereo pair…`)
                    pairs.push({ left: await blobToDataUrl(slot.leftFile), right: await blobToDataUrl(slot.rightFile) })
                } else if (slot.file) pairs.push(await fetchPair(slot.file, scene))
                else throw new Error(`Scene ${scene + 1} is incomplete`)
            }
            setProgress('Laying out fourteen reel frames…')
            setProcessingStage('technique')
            setMasterPairs(pairs)
            setMasterSvg(filmMasterSvg(pairs, imageRotation))
            setProgress('Reel master ready')
            setProcessingStage('ready')
        } catch (caught) {
            console.error(caught)
            setError(caught instanceof Error ? caught.message : 'View-Master reel generation failed')
            setProgress('')
            setProcessingStage('error')
        } finally {
            setBuilding(false)
        }
    }

    const downloadPdf = async () => {
        if (!masterPairs) return
        try {
            setError('')
            await downloadViewMasterPdf(masterPairs, imageRotation)
        } catch (caught) {
            console.error(caught)
            setError(caught instanceof Error ? caught.message : 'View-Master PDF export failed')
        }
    }

    return (
        <main className="viewMasterMain">
            <section className="viewMasterWorkspace">
                <div className="vmHeader">
                    <div><div className="panelLabel">SEVEN-SCENE PRINT WORKSPACE</div><h2>View-Master Reel Builder</h2></div>
                    <div className="vmGeometry">90 mm reel · 14 stereo frames · actual-size print master</div>
                </div>

                <div className="vmNotice">
                    <strong>Each scene can start either way.</strong>
                    <span>Use one image and let Anaglyph &amp; Friends generate its stereo pair, or import your own left/right photographs. A reel may mix both source types. Current physical reel geometry remains prototype pending verification.</span>
                </div>

                <div className="vmSlotGrid">
                    {slots.map((slot, index) => {
                        const ready = slotReady(slot)
                        const source = sourceForSlot(slot)
                        return <div className={ready ? 'vmSlot ready' : 'vmSlot'} key={index}>
                            <span className="vmSlotNumber">{index + 1}</span>
                            <div className="vmSlotModeSwitch"><button className={slot.mode === 'single' ? 'active' : ''} onClick={() => setMode(index, 'single')} disabled={building}>1 image</button><button className={slot.mode === 'pair' ? 'active' : ''} onClick={() => setMode(index, 'pair')} disabled={building}>L + R</button></div>
                            <div className={slot.mode === 'pair' ? 'vmSlotPreview vmPairPreview' : 'vmSlotPreview'}>
                                {slot.mode === 'single' ? (slot.previewUrl ? <img src={slot.previewUrl} alt={`Scene ${index + 1}`} /> : <span className="vmEmptySlot">Choose source image</span>) : <>
                                    {slot.leftPreviewUrl ? <img src={slot.leftPreviewUrl} alt={`Scene ${index + 1} left`} /> : <span className="vmEyePlaceholder">L</span>}
                                    {slot.rightPreviewUrl ? <img src={slot.rightPreviewUrl} alt={`Scene ${index + 1} right`} /> : <span className="vmEyePlaceholder">R</span>}
                                </>}
                            </div>
                            <div className="vmSlotPicks">
                                {slot.mode === 'single' ? <label className="vmSlotPick"><input type="file" accept="image/jpeg,image/jpg,image/png,image/webp,image/tiff" onChange={(event) => chooseSingle(index, event)} disabled={building} /><UiIcon name="upload" /> {slot.file ? 'Replace image' : 'Choose image'}</label> : <><label className="vmSlotPick"><input type="file" accept="image/jpeg,image/jpg,image/png,image/webp,image/tiff" onChange={(event) => choosePairEye(index, 'left', event)} disabled={building} /><UiIcon name="upload" /> {slot.leftFile ? 'Replace L' : 'Choose L'}</label><label className="vmSlotPick"><input type="file" accept="image/jpeg,image/jpg,image/png,image/webp,image/tiff" onChange={(event) => choosePairEye(index, 'right', event)} disabled={building} /><UiIcon name="upload" /> {slot.rightFile ? 'Replace R' : 'Choose R'}</label></>}
                            </div>
                            <button className="vmOpenStudio" disabled={!source || building} onClick={() => source && onOpenInStudio(source)}>Open in 3D Studio</button>
                        </div>
                    })}
                </div>

                <div className="vmControls">
                    <div className="vmRange">
                        <div><strong>Generated-scene 3D strength</strong><span>{strength.toFixed(1)}%</span></div>
                        <input type="range" min="0" max="6" step="0.1" value={strength} onChange={(event) => { setStrength(Number(event.target.value)); invalidateMaster() }} disabled={building} />
                        <small>Applied only to single-image scenes. Imported L/R pairs are kept exactly as supplied.</small>
                    </div>
                    <label className="vmCheck"><span><strong>Pop out</strong><small>Generated single-image scenes only</small></span><input type="checkbox" checked={popOut} onChange={(event) => { setPopOut(event.target.checked); invalidateMaster() }} disabled={building} /></label>
                    <label className="vmRotation"><span>Image rotation</span><select value={imageRotation} onChange={(event) => { setImageRotation(Number(event.target.value)); invalidateMaster() }} disabled={building}><option value={0}>0° · upright at 3/9 o'clock</option><option value={90}>90°</option><option value={180}>180°</option><option value={270}>270°</option></select><small>Rotation advances once per scene around the reel; both eyes of each stereo pair always share the same orientation.</small></label>
                </div>

                <div className="vmBuildBar">
                    <div><strong>{readyCount}/7 scenes loaded · {generatedCount} generated · {importedPairCount} imported pairs</strong><span>{progress || 'Single-image scenes generate depth/stereo when you build. Imported pairs skip AI processing.'}</span></div>
                    <div className="vmBuildActions"><button className="vmReset" onClick={reset} disabled={building || readyCount === 0}><UiIcon name="reset" /> Reset</button><button className="vmBuild" onClick={() => void build()} disabled={building || readyCount !== 7}>{building ? 'Building reel…' : 'Build View-Master reel'}</button></div>
                </div>
                {error && <div className="vmError">{error}</div>}

                {masterSvg && masterPairs && <div className="vmResult">
                    <div className="vmResultHeader"><div><div className="panelLabel">PRINT MASTER</div><strong>Reel layout ready</strong><span>PDF is the primary print-ready export: raster eye images are embedded directly and the current prototype reel/transport geometry remains vector at 1:1 physical scale. Print at 100% / Actual Size with fit-to-page scaling disabled.</span></div><div className="vmDownloadActions"><button onClick={() => void downloadPdf()}><UiIcon name="download" /> Download PDF print master</button><button onClick={() => downloadSvg(masterSvg, 'view-master-transparency-master.svg')}><UiIcon name="download" /> Download SVG (secondary)</button><button onClick={() => downloadSvg(cardTemplateSvg(), 'view-master-card-template.svg')}><UiIcon name="download" /> Download cardstock template</button></div></div>
                    <div className="vmReelPreview"><img src={masterUrl} alt="Generated View-Master reel master" /></div>
                    <div className="vmPrintFacts"><span><strong>Prototype reel:</strong> 90 mm diameter</span><span><strong>Prototype frame:</strong> 11.75 × 10.5 mm</span><span><strong>Prototype pair spacing:</strong> 62.6 mm</span><span><strong>Imported pairs:</strong> original raster retained before reel cropping</span></div>
                </div>}
            </section>
        </main>
    )
}

export default ViewMasterBuilder