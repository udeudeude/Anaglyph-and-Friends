import { useEffect, useMemo, useState } from 'react'
import './styles/PrintCalibrationBuilder.css'

type ProcessingStage = 'idle' | 'uploading' | 'depth' | 'stereo' | 'technique' | 'full' | 'ready' | 'error'
type PagePreset = 'letter' | 'a4' | 'custom'

type Props = {
    setProcessingStage: (stage: ProcessingStage) => void
}

type CalibrationSettings = {
    pagePreset: PagePreset
    widthIn: number
    heightIn: number
    dpi: number
    includeScale: boolean
    includeRegistration: boolean
    includeGray: boolean
    includeColor: boolean
    includeLineTests: boolean
    includeNotes: boolean
}

const DEFAULTS: CalibrationSettings = {
    pagePreset: 'letter',
    widthIn: 8.5,
    heightIn: 11,
    dpi: 300,
    includeScale: true,
    includeRegistration: true,
    includeGray: true,
    includeColor: true,
    includeLineTests: true,
    includeNotes: true,
}

const mm = (value: number, dpi: number) => value / 25.4 * dpi
const pt = (value: number, dpi: number) => value / 72 * dpi

const crc32 = (bytes: Uint8Array) => {
    let crc = 0xffffffff
    for (const byte of bytes) {
        crc ^= byte
        for (let k = 0; k < 8; k += 1) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1))
    }
    return (crc ^ 0xffffffff) >>> 0
}

const writeU32 = (value: number) => new Uint8Array([(value >>> 24) & 255, (value >>> 16) & 255, (value >>> 8) & 255, value & 255])
const concat = (parts: Uint8Array[]) => {
    const out = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0))
    let offset = 0
    for (const part of parts) {
        out.set(part, offset)
        offset += part.length
    }
    return out
}

const pngWithDpi = async (canvas: HTMLCanvasElement, dpi: number) => {
    const raw = await new Promise<Blob>((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('PNG encoding failed')), 'image/png'))
    const bytes = new Uint8Array(await raw.arrayBuffer())
    const signature = bytes.slice(0, 8)
    const ihdrLength = 12 + ((bytes[8] << 24) | (bytes[9] << 16) | (bytes[10] << 8) | bytes[11])
    const insertAt = 8 + ihdrLength
    const ppm = Math.round(dpi / 0.0254)
    const data = concat([writeU32(ppm), writeU32(ppm), new Uint8Array([1])])
    const type = new TextEncoder().encode('pHYs')
    const chunk = concat([writeU32(data.length), type, data, writeU32(crc32(concat([type, data])))])
    return new Blob([signature, bytes.slice(8, insertAt), chunk, bytes.slice(insertAt)], { type: 'image/png' })
}

const downloadBlob = (blob: Blob, filename: string) => {
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = filename
    document.body.appendChild(link)
    link.click()
    link.remove()
    window.setTimeout(() => URL.revokeObjectURL(url), 1200)
}

function PrintCalibrationBuilder({ setProcessingStage }: Props) {
    const [settings, setSettings] = useState<CalibrationSettings>(() => {
        try {
            const saved = JSON.parse(localStorage.getItem('aaf-print-calibration-settings') || 'null')
            return saved ? { ...DEFAULTS, ...saved } : DEFAULTS
        } catch {
            return DEFAULTS
        }
    })
    const [previewUrl, setPreviewUrl] = useState<string | null>(null)
    const [busy, setBusy] = useState(false)

    useEffect(() => {
        localStorage.setItem('aaf-print-calibration-settings', JSON.stringify(settings))
    }, [settings])

    useEffect(() => () => {
        if (previewUrl) URL.revokeObjectURL(previewUrl)
    }, [previewUrl])

    const pageLabel = useMemo(() => {
        if (settings.pagePreset === 'letter') return 'US Letter · 8.5 × 11 in'
        if (settings.pagePreset === 'a4') return 'A4 · 210 × 297 mm'
        return `Custom · ${settings.widthIn.toFixed(2)} × ${settings.heightIn.toFixed(2)} in`
    }, [settings.pagePreset, settings.widthIn, settings.heightIn])

    const applyPreset = (preset: PagePreset) => {
        if (preset === 'letter') setSettings(current => ({ ...current, pagePreset: preset, widthIn: 8.5, heightIn: 11 }))
        else if (preset === 'a4') setSettings(current => ({ ...current, pagePreset: preset, widthIn: 210 / 25.4, heightIn: 297 / 25.4 }))
        else setSettings(current => ({ ...current, pagePreset: preset }))
    }

    const drawSheet = async (scope: 'preview' | 'full') => {
        const fullWidth = Math.max(600, Math.round(settings.widthIn * settings.dpi))
        const fullHeight = Math.max(800, Math.round(settings.heightIn * settings.dpi))
        const scale = scope === 'preview' ? Math.min(1, 1200 / Math.max(fullWidth, fullHeight)) : 1
        const dpi = settings.dpi * scale
        const width = Math.round(fullWidth * scale)
        const height = Math.round(fullHeight * scale)
        const canvas = document.createElement('canvas')
        canvas.width = width
        canvas.height = height
        const ctx = canvas.getContext('2d')
        if (!ctx) throw new Error('Canvas is unavailable')

        const margin = mm(12, dpi)
        const innerWidth = width - margin * 2
        const text = (value: string, x: number, y: number, sizePt = 8, weight = 500, align: CanvasTextAlign = 'left') => {
            ctx.fillStyle = '#111'
            ctx.font = `${weight} ${Math.max(8, pt(sizePt, dpi))}px system-ui, -apple-system, sans-serif`
            ctx.textAlign = align
            ctx.textBaseline = 'alphabetic'
            ctx.fillText(value, x, y)
        }
        const rule = (y: number) => {
            ctx.strokeStyle = '#c8c8c8'
            ctx.lineWidth = Math.max(1, pt(.35, dpi))
            ctx.beginPath()
            ctx.moveTo(margin, y)
            ctx.lineTo(width - margin, y)
            ctx.stroke()
        }

        ctx.fillStyle = '#fff'
        ctx.fillRect(0, 0, width, height)

        let y = margin
        text('ANAGLYPH & FRIENDS', margin, y, 7, 800)
        y += pt(18, dpi)
        text('Print Calibration Sheet', margin, y, 18, 800)
        text(pageLabel, width - margin, y, 8, 650, 'right')
        y += pt(14, dpi)
        text('Print at 100% / Actual Size. Disable Fit to Page, Shrink, Scale to Fit, and borderless expansion.', margin, y, 7.5, 600)
        y += pt(14, dpi)
        rule(y)
        y += pt(14, dpi)

        if (settings.includeScale) {
            text('1 · PHYSICAL SCALE', margin, y, 9, 800)
            y += pt(11, dpi)
            text('After printing, measure these. The 100 mm ruler should be exactly 100 mm and the inch ruler exactly 4 in.', margin, y, 7, 500)
            y += pt(13, dpi)

            const rulerX = margin
            const rulerY = y
            const rulerW = mm(100, dpi)
            ctx.strokeStyle = '#000'
            ctx.lineWidth = Math.max(1, pt(.5, dpi))
            ctx.beginPath()
            ctx.moveTo(rulerX, rulerY)
            ctx.lineTo(rulerX + rulerW, rulerY)
            for (let i = 0; i <= 100; i += 1) {
                const x = rulerX + mm(i, dpi)
                const h = i % 10 === 0 ? mm(5, dpi) : i % 5 === 0 ? mm(3.5, dpi) : mm(2, dpi)
                ctx.moveTo(x, rulerY)
                ctx.lineTo(x, rulerY + h)
            }
            ctx.stroke()
            for (let i = 0; i <= 100; i += 10) text(String(i), rulerX + mm(i, dpi), rulerY + mm(8, dpi), 6.5, 650, i === 0 ? 'left' : i === 100 ? 'right' : 'center')
            text('millimetres', rulerX + rulerW + mm(5, dpi), rulerY + mm(5, dpi), 7, 650)

            const inchX = margin
            const inchY = rulerY + mm(16, dpi)
            const inchW = 4 * dpi
            ctx.beginPath()
            ctx.moveTo(inchX, inchY)
            ctx.lineTo(inchX + inchW, inchY)
            for (let i = 0; i <= 32; i += 1) {
                const x = inchX + i / 8 * dpi
                const h = i % 8 === 0 ? mm(5, dpi) : i % 4 === 0 ? mm(3.5, dpi) : mm(2, dpi)
                ctx.moveTo(x, inchY)
                ctx.lineTo(x, inchY + h)
            }
            ctx.stroke()
            for (let i = 0; i <= 4; i += 1) text(String(i), inchX + i * dpi, inchY + mm(8, dpi), 6.5, 650, i === 0 ? 'left' : i === 4 ? 'right' : 'center')
            text('inches', inchX + inchW + mm(5, dpi), inchY + mm(5, dpi), 7, 650)

            const boxX = width - margin - mm(50, dpi)
            const boxY = rulerY - mm(2, dpi)
            ctx.strokeRect(boxX, boxY, mm(50, dpi), mm(50, dpi))
            text('50 × 50 mm', boxX + mm(25, dpi), boxY + mm(27, dpi), 7, 700, 'center')
            y = boxY + mm(54, dpi)
            rule(y)
            y += pt(14, dpi)
        }

        if (settings.includeRegistration) {
            text('2 · REGISTRATION', margin, y, 9, 800)
            y += pt(12, dpi)
            const targetY = y + mm(12, dpi)
            const drawTarget = (cx: number, cy: number) => {
                ctx.strokeStyle = '#000'
                ctx.lineWidth = Math.max(1, pt(.4, dpi))
                ctx.beginPath()
                ctx.arc(cx, cy, mm(6, dpi), 0, Math.PI * 2)
                ctx.moveTo(cx - mm(10, dpi), cy)
                ctx.lineTo(cx + mm(10, dpi), cy)
                ctx.moveTo(cx, cy - mm(10, dpi))
                ctx.lineTo(cx, cy + mm(10, dpi))
                ctx.stroke()
                ctx.fillStyle = '#000'
                ctx.fillRect(cx - mm(.5, dpi), cy - mm(.5, dpi), mm(1, dpi), mm(1, dpi))
            }
            for (const x of [margin + mm(12, dpi), width / 2, width - margin - mm(12, dpi)]) drawTarget(x, targetY)
            text('Use these crosses to judge duplex, overlay, or multi-pass registration.', margin, targetY + mm(15, dpi), 7, 500)
            y = targetY + mm(21, dpi)
            rule(y)
            y += pt(14, dpi)
        }

        if (settings.includeGray) {
            text('3 · GRAYSCALE / TONAL RESPONSE', margin, y, 9, 800)
            y += pt(12, dpi)
            const gap = mm(1.5, dpi)
            const cellW = (innerWidth - gap * 10) / 11
            const cellH = mm(11, dpi)
            for (let i = 0; i <= 10; i += 1) {
                const value = 255 - Math.round(i / 10 * 255)
                const x = margin + i * (cellW + gap)
                ctx.fillStyle = `rgb(${value},${value},${value})`
                ctx.fillRect(x, y, cellW, cellH)
                ctx.strokeStyle = '#999'
                ctx.strokeRect(x, y, cellW, cellH)
                const label = `${i * 10}% K`
                text(label, x + cellW / 2, y + cellH + pt(8, dpi), 5.5, 650, 'center')
            }
            y += cellH + pt(15, dpi)
            rule(y)
            y += pt(14, dpi)
        }

        if (settings.includeColor) {
            text('4 · COLOR-FILTER / CMY CHECK', margin, y, 9, 800)
            y += pt(11, dpi)
            text('Use this row to compare actual ink/display color and filter leakage. Record observations rather than assuming nominal colors are exact.', margin, y, 7, 500)
            y += pt(11, dpi)
            const swatches = [
                ['R', '#ff0000'], ['G', '#00ff00'], ['B', '#0000ff'],
                ['C', '#00ffff'], ['M', '#ff00ff'], ['Y', '#ffff00'],
                ['K', '#000000'], ['50% K', '#808080'], ['W', '#ffffff'],
            ] as const
            const gap = mm(1.4, dpi)
            const cellW = (innerWidth - gap * (swatches.length - 1)) / swatches.length
            const cellH = mm(14, dpi)
            swatches.forEach(([label, color], index) => {
                const x = margin + index * (cellW + gap)
                ctx.fillStyle = color
                ctx.fillRect(x, y, cellW, cellH)
                ctx.strokeStyle = '#777'
                ctx.strokeRect(x, y, cellW, cellH)
                text(label, x + cellW / 2, y + cellH + pt(8, dpi), 6, 700, 'center')
            })
            y += cellH + pt(15, dpi)

            const pairs = [
                ['Red / Cyan', '#ff0000', '#00ffff'],
                ['Red / Green', '#ff0000', '#00ff00'],
                ['Red / Blue', '#ff0000', '#0000ff'],
            ] as const
            pairs.forEach(([label, a, b], index) => {
                const rowY = y + index * mm(9, dpi)
                text(label, margin, rowY + mm(5, dpi), 6.5, 700)
                const start = margin + mm(32, dpi)
                const patchW = mm(18, dpi)
                ctx.fillStyle = a
                ctx.fillRect(start, rowY, patchW, mm(7, dpi))
                ctx.fillStyle = b
                ctx.fillRect(start + patchW + mm(2, dpi), rowY, patchW, mm(7, dpi))
                const gradient = ctx.createLinearGradient(start + patchW * 2 + mm(6, dpi), 0, start + patchW * 4 + mm(6, dpi), 0)
                gradient.addColorStop(0, a)
                gradient.addColorStop(1, b)
                ctx.fillStyle = gradient
                ctx.fillRect(start + patchW * 2 + mm(6, dpi), rowY, patchW * 2, mm(7, dpi))
            })
            y += mm(30, dpi)
            rule(y)
            y += pt(14, dpi)
        }

        if (settings.includeLineTests) {
            text('5 · FINE LINE / EDGE TEST', margin, y, 9, 800)
            y += pt(12, dpi)
            const widthsMm = [0.1, 0.2, 0.3, 0.5, 1]
            widthsMm.forEach((lineMm, index) => {
                const yy = y + index * mm(7, dpi)
                text(`${lineMm.toFixed(1)} mm`, margin, yy + mm(2, dpi), 6.5, 650)
                ctx.strokeStyle = '#000'
                ctx.lineWidth = Math.max(.25, mm(lineMm, dpi))
                ctx.beginPath()
                ctx.moveTo(margin + mm(25, dpi), yy)
                ctx.lineTo(width - margin, yy)
                ctx.stroke()
            })
            y += mm(38, dpi)
            const barX = margin
            const barY = y
            const bandH = mm(10, dpi)
            const pitchesMm = [2, 1, .5, .25]
            const bandW = innerWidth / pitchesMm.length
            pitchesMm.forEach((pitch, index) => {
                const x0 = barX + index * bandW
                for (let x = 0; x < bandW; x += mm(pitch, dpi)) {
                    ctx.fillStyle = Math.round(x / mm(pitch, dpi)) % 2 === 0 ? '#000' : '#fff'
                    ctx.fillRect(x0 + x, barY, Math.min(mm(pitch / 2, dpi), bandW - x), bandH)
                }
                ctx.strokeStyle = '#888'
                ctx.strokeRect(x0, barY, bandW, bandH)
                text(`${pitch} mm bars`, x0 + bandW / 2, barY + bandH + pt(8, dpi), 6, 650, 'center')
            })
            y += bandH + pt(15, dpi)
            rule(y)
            y += pt(14, dpi)
        }

        if (settings.includeNotes) {
            text('RECORD AFTER PRINTING', margin, y, 9, 800)
            y += pt(13, dpi)
            const lines = [
                'Printer / model:',
                'Paper / media:',
                'Driver / quality setting:',
                'Measured 100 mm ruler:',
                'Measured 4 in ruler:',
                'Observed registration / color leakage:',
            ]
            for (const label of lines) {
                text(label, margin, y, 7, 650)
                ctx.strokeStyle = '#aaa'
                ctx.lineWidth = Math.max(1, pt(.3, dpi))
                ctx.beginPath()
                ctx.moveTo(margin + mm(42, dpi), y + pt(2, dpi))
                ctx.lineTo(width - margin, y + pt(2, dpi))
                ctx.stroke()
                y += mm(8, dpi)
            }
        }

        text('Generated by Anaglyph & Friends · Do not scale when printing', width / 2, height - mm(7, dpi), 5.5, 600, 'center')

        return scope === 'full'
            ? pngWithDpi(canvas, settings.dpi)
            : new Promise<Blob>((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('Preview encoding failed')), 'image/png'))
    }

    const buildPreview = async () => {
        setBusy(true)
        setProcessingStage('technique')
        try {
            const blob = await drawSheet('preview')
            const url = URL.createObjectURL(blob)
            setPreviewUrl(old => {
                if (old) URL.revokeObjectURL(old)
                return url
            })
            setProcessingStage('ready')
        } catch (error) {
            console.error(error)
            setProcessingStage('error')
        } finally {
            setBusy(false)
        }
    }

    useEffect(() => {
        void buildPreview()
    }, [settings])

    const download = async () => {
        setBusy(true)
        setProcessingStage('full')
        try {
            const blob = await drawSheet('full')
            downloadBlob(blob, `print-calibration-${settings.pagePreset}-${settings.dpi}dpi.png`)
            setProcessingStage('ready')
        } catch (error) {
            console.error(error)
            setProcessingStage('error')
        } finally {
            setBusy(false)
        }
    }

    return <div className="printCalibrationWorkspace">
        <header className="printCalibrationHeader">
            <div><div className="panelLabel">PRINT TOOLS</div><h2>Print calibration sheet</h2><p>One general-purpose sheet for checking physical scale, registration, tonal response, color/filter behavior, and fine detail before trusting a print workflow.</p></div>
            <button className="primaryCalibrationDownload" onClick={() => void download()} disabled={busy}>{busy ? 'Preparing…' : 'Download calibration sheet'}</button>
        </header>

        <div className="printCalibrationQuick">
            <div><strong>Ready-to-use default</strong><span>{pageLabel} · {settings.dpi} DPI</span></div>
            <p>For most users, that is all you need. Print the downloaded PNG at <strong>100% / Actual Size</strong>, with automatic fitting or borderless enlargement turned off.</p>
        </div>

        <div className="printCalibrationPreview">
            {previewUrl ? <img src={previewUrl} alt="Print calibration sheet preview" /> : <div className="emptyStage">Building calibration preview…</div>}
            {busy && <div className="loadingVeil"><div className="largeLoader" /><span>Preparing calibration sheet…</span></div>}
        </div>

        <details className="advancedPrintOptions">
            <summary><span>Advanced print setup</span><small>Page size, resolution, and which tests appear on the sheet</small></summary>
            <div className="advancedPrintBody">
                <div className="advancedPrintGrid">
                    <label><span>Page</span><select value={settings.pagePreset} onChange={(event) => applyPreset(event.target.value as PagePreset)}><option value="letter">US Letter</option><option value="a4">A4</option><option value="custom">Custom</option></select></label>
                    <label><span>Resolution</span><select value={settings.dpi} onChange={(event) => setSettings(current => ({ ...current, dpi: Number(event.target.value) }))}><option value={150}>150 DPI</option><option value={300}>300 DPI</option><option value={600}>600 DPI</option></select></label>
                    {settings.pagePreset === 'custom' && <><label><span>Width</span><input type="number" min="3" max="24" step=".01" value={settings.widthIn} onChange={(event) => setSettings(current => ({ ...current, widthIn: Number(event.target.value) }))} /><small>in</small></label><label><span>Height</span><input type="number" min="3" max="36" step=".01" value={settings.heightIn} onChange={(event) => setSettings(current => ({ ...current, heightIn: Number(event.target.value) }))} /><small>in</small></label></>}
                </div>

                <div className="calibrationSectionToggles">
                    {([
                        ['includeScale', 'Physical scale rulers'],
                        ['includeRegistration', 'Registration targets'],
                        ['includeGray', 'Grayscale ramp'],
                        ['includeColor', 'Color / filter patches'],
                        ['includeLineTests', 'Fine-line tests'],
                        ['includeNotes', 'Measurement notes area'],
                    ] as const).map(([key, label]) => <label key={key}><input type="checkbox" checked={settings[key]} onChange={(event) => setSettings(current => ({ ...current, [key]: event.target.checked }))} /> {label}</label>)}
                </div>

                <button className="resetPrintDefaults" type="button" onClick={() => setSettings(DEFAULTS)}>Reset standard defaults</button>
            </div>
        </details>

        <div className="printCalibrationWhy">
            <strong>Why this is tucked away</strong>
            <span>Normal 3D and print outputs keep their simple defaults. This workspace is for calibration only, so users who just want an image never have to deal with printer measurements or test targets.</span>
        </div>
    </div>
}

export default PrintCalibrationBuilder
