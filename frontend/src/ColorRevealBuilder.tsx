import { useEffect, useMemo, useRef, useState } from 'react'
import './styles/ColorRevealBuilder.css'
import UiIcon from './UiIcon'

type ProcessingStage = 'idle' | 'uploading' | 'depth' | 'stereo' | 'technique' | 'full' | 'ready' | 'error'

type Props = { setProcessingStage: (stage: ProcessingStage) => void }
type LayerKey = 'cyan' | 'magenta' | 'yellow'
type LayerState = { file: File | null; url: string | null; strength: number }
type PreviewMode = 'composite' | 'red' | 'green' | 'blue'

const emptyLayer = (): LayerState => ({ file: null, url: null, strength: 100 })
const PREVIEW_MAX = 1400
const loadBitmap = (file: File) => createImageBitmap(file)
const makeCanvas = (width: number, height: number) => {
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(width))
    canvas.height = Math.max(1, Math.round(height))
    return canvas
}
const canvasBlob = (canvas: HTMLCanvasElement) => new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('Could not encode PNG')), 'image/png')
})
const luminance = (r: number, g: number, b: number) => (.299 * r + .587 * g + .114 * b) / 255

function ColorRevealBuilder({ setProcessingStage }: Props) {
    const [layers, setLayers] = useState<Record<LayerKey, LayerState>>({ cyan: emptyLayer(), magenta: emptyLayer(), yellow: emptyLayer() })
    const [invert, setInvert] = useState(false)
    const [mode, setMode] = useState<PreviewMode>('composite')
    const [previewUrl, setPreviewUrl] = useState<string | null>(null)
    const [error, setError] = useState('')
    const [rendering, setRendering] = useState(false)
    const previewRef = useRef<HTMLDivElement>(null)
    const ready = !!layers.cyan.file && !!layers.magenta.file && !!layers.yellow.file

    const replaceLayer = (key: LayerKey, file: File | null) => {
        setLayers(current => {
            const old = current[key]
            if (old.url) URL.revokeObjectURL(old.url)
            return { ...current, [key]: { ...old, file, url: file ? URL.createObjectURL(file) : null } }
        })
    }

    useEffect(() => () => {
        Object.values(layers).forEach(layer => { if (layer.url) URL.revokeObjectURL(layer.url) })
        if (previewUrl) URL.revokeObjectURL(previewUrl)
    }, [])

    const dimensions = useMemo(() => {
        const file = layers.cyan.file || layers.magenta.file || layers.yellow.file
        return file ? file.name : ''
    }, [layers])

    const render = async (scope: 'preview' | 'full', requestedMode = mode) => {
        if (!ready) throw new Error('Add cyan, magenta, and yellow source layers first.')
        setRendering(true)
        setError('')
        setProcessingStage('technique')
        let bitmaps: ImageBitmap[] = []
        try {
            bitmaps = await Promise.all([loadBitmap(layers.cyan.file!), loadBitmap(layers.magenta.file!), loadBitmap(layers.yellow.file!)])
            const width = Math.max(...bitmaps.map(image => image.width))
            const height = Math.max(...bitmaps.map(image => image.height))
            const scale = scope === 'full' ? 1 : Math.min(1, PREVIEW_MAX / Math.max(width, height))
            const outWidth = Math.max(1, Math.round(width * scale))
            const outHeight = Math.max(1, Math.round(height * scale))
            const layerData = bitmaps.map(bitmap => {
                const canvas = makeCanvas(outWidth, outHeight)
                const context = canvas.getContext('2d')!
                context.fillStyle = '#fff'
                context.fillRect(0, 0, outWidth, outHeight)
                const imageScale = Math.max(outWidth / bitmap.width, outHeight / bitmap.height)
                const sw = outWidth / imageScale
                const sh = outHeight / imageScale
                context.drawImage(bitmap, (bitmap.width - sw) / 2, (bitmap.height - sh) / 2, sw, sh, 0, 0, outWidth, outHeight)
                return context.getImageData(0, 0, outWidth, outHeight)
            })
            const canvas = makeCanvas(outWidth, outHeight)
            const context = canvas.getContext('2d')!
            const output = context.createImageData(outWidth, outHeight)
            const gains = [layers.cyan.strength / 100, layers.magenta.strength / 100, layers.yellow.strength / 100]
            for (let index = 0; index < output.data.length; index += 4) {
                const amounts = layerData.map((data, layerIndex) => {
                    const value = luminance(data.data[index], data.data[index + 1], data.data[index + 2])
                    const ink = invert ? value : 1 - value
                    return Math.max(0, Math.min(1, ink * gains[layerIndex]))
                })
                const [cyan, magenta, yellow] = amounts
                if (requestedMode === 'red') {
                    const gray = Math.round((1 - cyan) * 255)
                    output.data[index] = gray; output.data[index + 1] = gray; output.data[index + 2] = gray
                } else if (requestedMode === 'green') {
                    const gray = Math.round((1 - magenta) * 255)
                    output.data[index] = gray; output.data[index + 1] = gray; output.data[index + 2] = gray
                } else if (requestedMode === 'blue') {
                    const gray = Math.round((1 - yellow) * 255)
                    output.data[index] = gray; output.data[index + 1] = gray; output.data[index + 2] = gray
                } else {
                    output.data[index] = Math.round((1 - cyan) * 255)
                    output.data[index + 1] = Math.round((1 - magenta) * 255)
                    output.data[index + 2] = Math.round((1 - yellow) * 255)
                }
                output.data[index + 3] = 255
            }
            context.putImageData(output, 0, 0)
            setProcessingStage('ready')
            return await canvasBlob(canvas)
        } catch (caught) {
            console.error(caught)
            setProcessingStage('error')
            throw caught
        } finally {
            bitmaps.forEach(bitmap => bitmap.close())
            setRendering(false)
        }
    }

    const refreshPreview = async () => {
        if (!ready) {
            setPreviewUrl(old => { if (old) URL.revokeObjectURL(old); return null })
            return
        }
        try {
            const blob = await render('preview')
            const url = URL.createObjectURL(blob)
            setPreviewUrl(old => { if (old) URL.revokeObjectURL(old); return url })
        } catch (caught) {
            setError(caught instanceof Error ? caught.message : 'Could not render CMY composite.')
        }
    }

    useEffect(() => { void refreshPreview() }, [
        layers.cyan.file, layers.magenta.file, layers.yellow.file,
        layers.cyan.strength, layers.magenta.strength, layers.yellow.strength,
        invert, mode,
    ])

    const download = async (requestedMode: PreviewMode, filename: string) => {
        try {
            setProcessingStage('full')
            const blob = await render('full', requestedMode)
            const url = URL.createObjectURL(blob)
            const link = document.createElement('a')
            link.href = url
            link.download = filename
            document.body.appendChild(link)
            link.click()
            link.remove()
            window.setTimeout(() => URL.revokeObjectURL(url), 1000)
        } catch (caught) {
            setError(caught instanceof Error ? caught.message : 'Could not create download.')
        }
    }

    const layerCard = (key: LayerKey, label: string, viewer: string) => {
        const layer = layers[key]
        return <div className="colorRevealLayer">
            <div><strong>{label} ink layer</strong><span>Revealed most strongly through {viewer}</span></div>
            <label className="colorRevealFile">
                {layer.url ? <img src={layer.url} alt={label + ' layer'} /> : <span>No image</span>}
                <input type="file" accept="image/*" onChange={e => replaceLayer(key, e.target.files?.[0] || null)} />
                <button type="button" onClick={e => (e.currentTarget.parentElement?.querySelector('input') as HTMLInputElement | null)?.click()}><UiIcon name="upload" /> {layer.file ? 'Replace' : 'Choose image'}</button>
            </label>
            <label><span>Ink strength</span><input type="range" min="0" max="150" value={layer.strength} onChange={e => setLayers(current => ({ ...current, [key]: { ...current[key], strength: Number(e.target.value) } }))} /><strong>{layer.strength}%</strong></label>
        </div>
    }

    return <main className="colorRevealWorkspace">
        <section className="colorRevealIntro">
            <div><div className="panelLabel">COLOR-FILTER PRINTING</div><h2>RGB Reveal / CMY Layers</h2><p>Combine three images as cyan, magenta, and yellow ink separations. A red filter emphasizes the cyan-coded layer, green emphasizes magenta, and blue emphasizes yellow.</p></div>
            <div className="phantogramBadge">3-LAYER FILTER ART</div>
        </section>
        <div className="colorRevealNotice"><strong>This is not stereo.</strong><span>It is a separate color-filter technique for layered print/screen artwork in the Carnovsky family. The RGB filter mapping is complementary to CMY inks.</span></div>

        <section className="colorRevealLayers">
            {layerCard('cyan', 'Cyan', 'a red filter')}
            {layerCard('magenta', 'Magenta', 'a green filter')}
            {layerCard('yellow', 'Yellow', 'a blue filter')}
        </section>

        <div className="colorRevealControls">
            <label><input type="checkbox" checked={invert} onChange={e => setInvert(e.target.checked)} /> Treat light pixels as ink instead of dark pixels</label>
            <div className="colorRevealModes">
                <button className={mode === 'composite' ? 'active' : ''} onClick={() => setMode('composite')}>Composite</button>
                <button className={mode === 'red' ? 'active' : ''} onClick={() => setMode('red')}>Red-filter simulation</button>
                <button className={mode === 'green' ? 'active' : ''} onClick={() => setMode('green')}>Green-filter simulation</button>
                <button className={mode === 'blue' ? 'active' : ''} onClick={() => setMode('blue')}>Blue-filter simulation</button>
            </div>
        </div>

        <div className="colorRevealPreview" ref={previewRef}>
            {previewUrl ? <img src={previewUrl} alt="CMY color-filter preview" /> : <div><strong>Add three source layers</strong><span>Cyan + Magenta + Yellow</span></div>}
            {previewUrl && <button onClick={() => previewRef.current?.requestFullscreen?.()}><UiIcon name="expand" /> Fullscreen preview</button>}
            {rendering && <span className="colorRevealBusy">Rendering…</span>}
        </div>

        {error && <div className="phantogramError">{error}</div>}
        {dimensions && <p className="colorRevealFine">Each layer is center-cropped to the largest source dimensions. For precise registration, prepare all three source files at the same pixel dimensions.</p>}

        <div className="colorRevealDownloads">
            <button disabled={!ready || rendering} onClick={() => void download('composite', 'cmy-rgb-reveal-composite.png')}><UiIcon name="download" /> Download full-resolution CMY composite</button>
            <button disabled={!ready || rendering} onClick={() => void download('red', 'cyan-layer-red-filter-proof.png')}><UiIcon name="download" /> Download cyan separation proof</button>
            <button disabled={!ready || rendering} onClick={() => void download('green', 'magenta-layer-green-filter-proof.png')}><UiIcon name="download" /> Download magenta separation proof</button>
            <button disabled={!ready || rendering} onClick={() => void download('blue', 'yellow-layer-blue-filter-proof.png')}><UiIcon name="download" /> Download yellow separation proof</button>
        </div>
        <p className="colorRevealFine">The on-screen composite is an RGB approximation of subtractive CMY printing. Final physical results depend on printer, inks, paper, illumination, and the spectral transmission of the actual red/green/blue filters, so physical print calibration remains necessary.</p>
    </main>
}

export default ColorRevealBuilder
