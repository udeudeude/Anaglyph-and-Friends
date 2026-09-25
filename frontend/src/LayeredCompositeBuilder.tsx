import { useEffect, useMemo, useRef, useState } from 'react'
import { mergeStoredSettings } from './techniques'
import './styles/LayeredCompositeBuilder.css'

type ProcessingStage = 'idle' | 'uploading' | 'depth' | 'stereo' | 'technique' | 'full' | 'ready' | 'error'
type OutputMode = 'anaglyph' | 'parallel' | 'cross' | 'left' | 'right'

type Props = {
    isDepthMapReady: boolean
    setProcessingStage: (stage: ProcessingStage) => void
}

type LayerSettings = {
    xPct: number
    yPct: number
    widthPct: number
    rotation: number
    opacity: number
    stereoDepthPct: number
    reliefPct: number
    reverseDepth: boolean
    baseStrength: number
    basePopOut: boolean
}

const defaults: LayerSettings = {
    xPct: 50,
    yPct: 50,
    widthPct: 35,
    rotation: 0,
    opacity: 100,
    stereoDepthPct: 1.2,
    reliefPct: 1.2,
    reverseDepth: false,
    baseStrength: 2,
    basePopOut: false,
}

const makeCanvas = (width: number, height: number) => {
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(width))
    canvas.height = Math.max(1, Math.round(height))
    return canvas
}

const canvasBlob = (canvas: HTMLCanvasElement) => new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('Could not encode composite PNG')), 'image/png')
})

const luminance = (r: number, g: number, b: number) => Math.round(.299 * r + .587 * g + .114 * b)
const colorAmount = (mode: string) => mode === 'full' ? 1 : mode === 'half' ? .5 : mode === 'gray' ? 0 : Math.max(0, Math.min(1, Number(mode) / 100 || 0))
const mix = (gray: number, color: number, amount: number) => Math.round(gray * (1 - amount) + color * amount)
const parseHex = (value: string, fallback: [number, number, number]): [number, number, number] => {
    let text = String(value || '').trim().replace(/^#/, '')
    if (text.length === 3) text = text.split('').map(char => char + char).join('')
    if (!/^[0-9a-f]{6}$/i.test(text)) return fallback
    return [Number.parseInt(text.slice(0, 2), 16), Number.parseInt(text.slice(2, 4), 16), Number.parseInt(text.slice(4, 6), 16)]
}

const renderAnaglyph = (left: HTMLCanvasElement, right: HTMLCanvasElement) => {
    const settings = mergeStoredSettings(localStorage.getItem('aaf-technique-settings'))
    const canvas = makeCanvas(left.width, left.height)
    const context = canvas.getContext('2d')!
    const leftData = left.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height)
    const rightData = right.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height)
    const output = context.createImageData(canvas.width, canvas.height)
    const glasses = settings.anaglyph.glasses
    const standard = glasses === 'red-cyan' || glasses === 'red-green' || glasses === 'red-blue'

    if (!standard) {
        const calibration = settings.anaglyph[settings.anaglyph.target]
        const [lr, lg, lb] = parseHex(calibration.leftColor, [255, 0, 0])
        const [rr, rg, rb] = parseHex(calibration.rightColor, [0, 255, 255])
        const leftGain = Math.max(0, Math.min(1.5, calibration.leftGain / 100))
        const rightGain = Math.max(0, Math.min(1.5, calibration.rightGain / 100))
        for (let index = 0; index < output.data.length; index += 4) {
            const ll = luminance(leftData.data[index], leftData.data[index + 1], leftData.data[index + 2]) / 255
            const rl = luminance(rightData.data[index], rightData.data[index + 1], rightData.data[index + 2]) / 255
            output.data[index] = Math.min(255, Math.round(ll * lr * leftGain + rl * rr * rightGain))
            output.data[index + 1] = Math.min(255, Math.round(ll * lg * leftGain + rl * rg * rightGain))
            output.data[index + 2] = Math.min(255, Math.round(ll * lb * leftGain + rl * rb * rightGain))
            output.data[index + 3] = 255
        }
    } else {
        const amount = colorAmount(settings.anaglyph.colorMode)
        for (let index = 0; index < output.data.length; index += 4) {
            const ll = luminance(leftData.data[index], leftData.data[index + 1], leftData.data[index + 2])
            const rl = luminance(rightData.data[index], rightData.data[index + 1], rightData.data[index + 2])
            output.data[index] = mix(ll, leftData.data[index], amount)
            output.data[index + 1] = glasses === 'red-blue' ? 0 : mix(rl, rightData.data[index + 1], amount)
            output.data[index + 2] = glasses === 'red-green' ? 0 : mix(rl, rightData.data[index + 2], amount)
            output.data[index + 3] = 255
        }
    }
    context.putImageData(output, 0, 0)
    return canvas
}

const sideBySide = (left: HTMLCanvasElement, right: HTMLCanvasElement, cross: boolean) => {
    const canvas = makeCanvas(left.width * 2, left.height)
    const context = canvas.getContext('2d')!
    context.drawImage(cross ? right : left, 0, 0)
    context.drawImage(cross ? left : right, left.width, 0)
    return canvas
}

const transformLayer = (
    foreground: ImageBitmap,
    depth: ImageBitmap | null,
    width: number,
    height: number,
    settings: LayerSettings,
    eye: 'left' | 'right',
) => {
    const source = makeCanvas(width, height)
    const sourceContext = source.getContext('2d')!
    const depthCanvas = makeCanvas(width, height)
    const depthContext = depthCanvas.getContext('2d')!
    const layerWidth = Math.max(1, width * settings.widthPct / 100)
    const layerHeight = layerWidth * foreground.height / Math.max(1, foreground.width)
    const cx = width * settings.xPct / 100
    const cy = height * settings.yPct / 100
    const angle = settings.rotation * Math.PI / 180

    sourceContext.save()
    sourceContext.translate(cx, cy)
    sourceContext.rotate(angle)
    sourceContext.drawImage(foreground, -layerWidth / 2, -layerHeight / 2, layerWidth, layerHeight)
    sourceContext.restore()

    depthContext.save()
    depthContext.translate(cx, cy)
    depthContext.rotate(angle)
    if (depth) depthContext.drawImage(depth, -layerWidth / 2, -layerHeight / 2, layerWidth, layerHeight)
    else {
        depthContext.fillStyle = '#808080'
        depthContext.fillRect(-layerWidth / 2, -layerHeight / 2, layerWidth, layerHeight)
    }
    depthContext.restore()

    const sourceData = sourceContext.getImageData(0, 0, width, height)
    const depthData = depthContext.getImageData(0, 0, width, height)
    const output = sourceContext.createImageData(width, height)
    const zbuffer = new Float32Array(width * height)
    zbuffer.fill(Number.NEGATIVE_INFINITY)
    const eyeSign = eye === 'left' ? 1 : -1

    for (let y = 0; y < height; y += 1) {
        for (let x = 0; x < width; x += 1) {
            const sourceIndex = (y * width + x) * 4
            const alpha = sourceData.data[sourceIndex + 3]
            if (alpha === 0) continue
            let depthValue = depth
                ? luminance(depthData.data[sourceIndex], depthData.data[sourceIndex + 1], depthData.data[sourceIndex + 2]) / 255
                : .5
            if (settings.reverseDepth) depthValue = 1 - depthValue
            const relief = depth ? (depthValue - .5) * 2 * settings.reliefPct : 0
            const disparityPct = settings.stereoDepthPct + relief
            const shiftedX = Math.round(x + eyeSign * disparityPct * width / 200)
            if (shiftedX < 0 || shiftedX >= width) continue
            const pixel = y * width + shiftedX
            if (disparityPct < zbuffer[pixel]) continue
            zbuffer[pixel] = disparityPct
            const targetIndex = pixel * 4
            output.data[targetIndex] = sourceData.data[sourceIndex]
            output.data[targetIndex + 1] = sourceData.data[sourceIndex + 1]
            output.data[targetIndex + 2] = sourceData.data[sourceIndex + 2]
            output.data[targetIndex + 3] = alpha
        }
    }

    const canvas = makeCanvas(width, height)
    canvas.getContext('2d')!.putImageData(output, 0, 0)
    return canvas
}

function LayeredCompositeBuilder({ isDepthMapReady, setProcessingStage }: Props) {
    const apiUrl = import.meta.env.VITE_FLASK_BACKEND_API_URL || 'http://localhost:8000'
    const foregroundInput = useRef<HTMLInputElement>(null)
    const depthInput = useRef<HTMLInputElement>(null)
    const previewRef = useRef<HTMLDivElement>(null)
    const [foreground, setForeground] = useState<File | null>(null)
    const [layerDepth, setLayerDepth] = useState<File | null>(null)
    const [settings, setSettings] = useState<LayerSettings>(() => {
        try { return { ...defaults, ...JSON.parse(localStorage.getItem('aaf-layered-settings') || '{}') } }
        catch { return defaults }
    })
    const [mode, setMode] = useState<OutputMode>('anaglyph')
    const [previewUrl, setPreviewUrl] = useState<string | null>(null)
    const [loading, setLoading] = useState(false)
    const [downloading, setDownloading] = useState(false)
    const [error, setError] = useState('')

    const foregroundUrl = useMemo(() => foreground ? URL.createObjectURL(foreground) : null, [foreground])
    useEffect(() => () => { if (foregroundUrl) URL.revokeObjectURL(foregroundUrl) }, [foregroundUrl])
    useEffect(() => { localStorage.setItem('aaf-layered-settings', JSON.stringify(settings)) }, [settings])

    const patch = (values: Partial<LayerSettings>) => setSettings(current => ({ ...current, ...values }))

    const fetchBasePair = async (scope: 'preview' | 'full') => {
        const params = new URLSearchParams({
            pop_out: String(settings.basePopOut),
            max_disparity_percentage: String(settings.baseStrength),
        })
        const prepareUrl = scope === 'full' ? `${apiUrl}/prepare-full?${params}` : `${apiUrl}/render?${params}`
        const prepare = await fetch(prepareUrl, { credentials: 'include' })
        if (!prepare.ok) throw new Error(`Could not prepare base stereo pair: ${prepare.status}`)
        const outputParams = new URLSearchParams({ scope, format: 'png', quality: '100', ...Object.fromEntries(params) })
        const [leftResponse, rightResponse] = await Promise.all([
            fetch(`${apiUrl}/output/left?${outputParams}`, { credentials: 'include' }),
            fetch(`${apiUrl}/output/right?${outputParams}`, { credentials: 'include' }),
        ])
        if (!leftResponse.ok || !rightResponse.ok) throw new Error('Could not retrieve base left/right stereo views.')
        return Promise.all([createImageBitmap(await leftResponse.blob()), createImageBitmap(await rightResponse.blob())])
    }

    const render = async (scope: 'preview' | 'full') => {
        if (!isDepthMapReady) throw new Error('Load a single source image and depth map in 3D Studio first.')
        const [baseLeft, baseRight] = await fetchBasePair(scope)
        let foregroundBitmap: ImageBitmap | null = null
        let depthBitmap: ImageBitmap | null = null
        try {
            const width = baseLeft.width
            const height = baseLeft.height
            const left = makeCanvas(width, height)
            const right = makeCanvas(width, height)
            left.getContext('2d')!.drawImage(baseLeft, 0, 0, width, height)
            right.getContext('2d')!.drawImage(baseRight, 0, 0, width, height)

            if (foreground) {
                foregroundBitmap = await createImageBitmap(foreground)
                if (layerDepth) depthBitmap = await createImageBitmap(layerDepth)
                const leftLayer = transformLayer(foregroundBitmap, depthBitmap, width, height, settings, 'left')
                const rightLayer = transformLayer(foregroundBitmap, depthBitmap, width, height, settings, 'right')
                const alpha = Math.max(0, Math.min(1, settings.opacity / 100))
                const leftContext = left.getContext('2d')!
                const rightContext = right.getContext('2d')!
                leftContext.globalAlpha = alpha
                rightContext.globalAlpha = alpha
                leftContext.drawImage(leftLayer, 0, 0)
                rightContext.drawImage(rightLayer, 0, 0)
                leftContext.globalAlpha = 1
                rightContext.globalAlpha = 1
            }

            if (mode === 'left') return left
            if (mode === 'right') return right
            if (mode === 'parallel') return sideBySide(left, right, false)
            if (mode === 'cross') return sideBySide(left, right, true)
            return renderAnaglyph(left, right)
        } finally {
            baseLeft.close()
            baseRight.close()
            foregroundBitmap?.close()
            depthBitmap?.close()
        }
    }

    useEffect(() => {
        if (!isDepthMapReady) {
            setPreviewUrl(old => { if (old) URL.revokeObjectURL(old); return null })
            return
        }
        const timer = window.setTimeout(async () => {
            setLoading(true)
            setError('')
            setProcessingStage('technique')
            try {
                const canvas = await render('preview')
                const blob = await canvasBlob(canvas)
                const next = URL.createObjectURL(blob)
                setPreviewUrl(old => { if (old) URL.revokeObjectURL(old); return next })
                setProcessingStage('ready')
            } catch (caught) {
                console.error(caught)
                setError(caught instanceof Error ? caught.message : 'Could not render layered composite.')
                setProcessingStage('error')
            } finally {
                setLoading(false)
            }
        }, 180)
        return () => window.clearTimeout(timer)
    }, [isDepthMapReady, foreground, layerDepth, settings, mode])

    const download = async () => {
        if (!isDepthMapReady || downloading) return
        setDownloading(true)
        setError('')
        setProcessingStage('full')
        try {
            const canvas = await render('full')
            const blob = await canvasBlob(canvas)
            const url = URL.createObjectURL(blob)
            const link = document.createElement('a')
            link.href = url
            link.download = `layered-3d-${mode}.png`
            document.body.appendChild(link)
            link.click()
            link.remove()
            window.setTimeout(() => URL.revokeObjectURL(url), 1000)
            setProcessingStage('ready')
        } catch (caught) {
            console.error(caught)
            setError(caught instanceof Error ? caught.message : 'Could not create full-resolution layered composite.')
            setProcessingStage('error')
        } finally {
            setDownloading(false)
        }
    }

    const chooseForeground = (file: File | undefined) => {
        if (!file || !file.type.startsWith('image/')) return
        setForeground(file)
    }
    const chooseDepth = (file: File | undefined) => {
        if (!file || !file.type.startsWith('image/')) return
        setLayerDepth(file)
    }

    return <main className="layeredWorkspace">
        <section className="layeredIntro"><div><div className="panelLabel">COMPOSITING</div><h2>Layered 3D Composite</h2><p>Place a transparent foreground object over the current image, give it an independent stereo position, and optionally use a grayscale depth map to give the object internal relief.</p></div><div className="layeredBadge">ONE FOREGROUND LAYER</div></section>

        {!isDepthMapReady && <div className="layeredNotice"><strong>No base scene ready.</strong><span>Load a single image in 3D Studio first. The current source and active depth map generate the base stereo pair.</span></div>}

        <div className="layeredGrid">
            <section className="layeredControls">
                <div className="layeredFiles">
                    <div><strong>Foreground object</strong><span>{foreground?.name || 'Transparent PNG/WebP recommended'}</span><button onClick={() => foregroundInput.current?.click()}>{foreground ? 'Replace foreground' : 'Choose foreground'}</button>{foreground && <button onClick={() => setForeground(null)}>Remove</button>}</div>
                    <div><strong>Optional object depth</strong><span>{layerDepth?.name || 'Grayscale image aligned to foreground'}</span><button onClick={() => depthInput.current?.click()}>{layerDepth ? 'Replace object depth' : 'Choose object depth'}</button>{layerDepth && <button onClick={() => setLayerDepth(null)}>Remove</button>}</div>
                    <input ref={foregroundInput} type="file" accept="image/png,image/webp,image/jpeg" onChange={event => { chooseForeground(event.target.files?.[0]); event.currentTarget.value = '' }} />
                    <input ref={depthInput} type="file" accept="image/png,image/webp,image/jpeg,image/tiff" onChange={event => { chooseDepth(event.target.files?.[0]); event.currentTarget.value = '' }} />
                </div>

                {foregroundUrl && <div className="layeredObjectPreview"><img src={foregroundUrl} alt="Foreground object"/></div>}

                <div className="layeredSection"><strong>Object placement</strong><div className="layeredFields">
                    <label><span>Horizontal position</span><input type="range" min="-20" max="120" step="1" value={settings.xPct} onChange={e => patch({xPct:Number(e.target.value)})}/><em>{settings.xPct}%</em></label>
                    <label><span>Vertical position</span><input type="range" min="-20" max="120" step="1" value={settings.yPct} onChange={e => patch({yPct:Number(e.target.value)})}/><em>{settings.yPct}%</em></label>
                    <label><span>Object width</span><input type="range" min="5" max="150" step="1" value={settings.widthPct} onChange={e => patch({widthPct:Number(e.target.value)})}/><em>{settings.widthPct}%</em></label>
                    <label><span>Rotation</span><input type="range" min="-180" max="180" step="1" value={settings.rotation} onChange={e => patch({rotation:Number(e.target.value)})}/><em>{settings.rotation}°</em></label>
                    <label><span>Opacity</span><input type="range" min="0" max="100" step="1" value={settings.opacity} onChange={e => patch({opacity:Number(e.target.value)})}/><em>{settings.opacity}%</em></label>
                </div></div>

                <div className="layeredSection"><strong>Object stereo depth</strong><div className="layeredFields">
                    <label><span>Depth position</span><input type="range" min="-6" max="6" step=".1" value={settings.stereoDepthPct} onChange={e => patch({stereoDepthPct:Number(e.target.value)})}/><em>{settings.stereoDepthPct.toFixed(1)}%</em><small>Positive moves toward the viewer; negative moves behind the base plane.</small></label>
                    <label><span>Internal relief</span><input type="range" min="0" max="5" step=".1" value={settings.reliefPct} disabled={!layerDepth} onChange={e => patch({reliefPct:Number(e.target.value)})}/><em>{settings.reliefPct.toFixed(1)}%</em><small>Uses the optional object depth map. Higher/lighter depth values move toward the viewer.</small></label>
                    <label className="layeredCheck"><input type="checkbox" checked={settings.reverseDepth} disabled={!layerDepth} onChange={e => patch({reverseDepth:e.target.checked})}/><span>Reverse object depth near / far</span></label>
                </div></div>

                <div className="layeredSection"><strong>Base scene stereo</strong><div className="layeredFields">
                    <label><span>Base 3D strength</span><input type="range" min="0" max="6" step=".1" value={settings.baseStrength} onChange={e => patch({baseStrength:Number(e.target.value)})}/><em>{settings.baseStrength.toFixed(1)}%</em></label>
                    <label className="layeredCheck"><input type="checkbox" checked={settings.basePopOut} onChange={e => patch({basePopOut:e.target.checked})}/><span>Pop Out base scene</span></label>
                </div></div>
            </section>

            <section className="layeredOutput">
                <div className="layeredOutputHeader"><div><span className="panelLabel">OUTPUT</span><strong>{mode === 'anaglyph' ? 'Anaglyph · current glasses profile' : mode === 'parallel' ? 'Parallel stereo' : mode === 'cross' ? 'Cross-eyed stereo' : mode === 'left' ? 'Left eye' : 'Right eye'}</strong></div><span>{loading ? 'Rendering…' : isDepthMapReady ? 'Ready' : 'Waiting'}</span></div>
                <div className="layeredModes"><button className={mode==='anaglyph'?'active':''} onClick={()=>setMode('anaglyph')}>Anaglyph</button><button className={mode==='parallel'?'active':''} onClick={()=>setMode('parallel')}>Parallel</button><button className={mode==='cross'?'active':''} onClick={()=>setMode('cross')}>Cross-Eyed</button><button className={mode==='left'?'active':''} onClick={()=>setMode('left')}>Left</button><button className={mode==='right'?'active':''} onClick={()=>setMode('right')}>Right</button></div>
                <div className="layeredPreview" ref={previewRef}>{previewUrl ? <img src={previewUrl} alt="Layered 3D composite"/> : <div><strong>Layered composite preview</strong><span>The current base stereo scene appears here. Add a foreground object when ready.</span></div>}{loading && <div className="layeredBusy">Rendering…</div>}</div>
                <div className="layeredActions"><button onClick={() => previewRef.current?.requestFullscreen?.()} disabled={!previewUrl}>Fullscreen</button><button onClick={() => void download()} disabled={!isDepthMapReady || downloading}>{downloading ? 'Preparing full resolution…' : 'Download full-resolution PNG'}</button></div>
                {error && <div className="layeredError">{error}</div>}
                <p className="layeredFine">Foreground alpha is preserved while the object is synthesized separately for each eye. A layer depth map is optional; without one, the object remains a flat stereo card at the selected depth position. This first compositor supports one independent foreground layer.</p>
            </section>
        </div>
    </main>
}

export default LayeredCompositeBuilder
