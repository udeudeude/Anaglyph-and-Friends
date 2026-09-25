import { useEffect, useRef, useState } from 'react'
import type { ChangeEvent } from 'react'
import type { StereoPairDraft } from './studioAssets'
import './styles/StereoPairUpload.css'
import UiIcon from './UiIcon'

type Props = {
    pair: StereoPairDraft
    onChange: (pair: StereoPairDraft) => void
}

const useObjectUrl = (file: File | null) => {
    const [url, setUrl] = useState<string | null>(null)
    useEffect(() => {
        if (!file) {
            setUrl(null)
            return
        }
        const next = URL.createObjectURL(file)
        setUrl(next)
        return () => URL.revokeObjectURL(next)
    }, [file])
    return url
}

function StereoPairUpload({ pair, onChange }: Props) {
    const leftInput = useRef<HTMLInputElement>(null)
    const rightInput = useRef<HTMLInputElement>(null)
    const depthInput = useRef<HTMLInputElement>(null)
    const leftUrl = useObjectUrl(pair.left)
    const rightUrl = useObjectUrl(pair.right)

    const choose = (eye: 'left' | 'right', event: ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0]
        event.currentTarget.value = ''
        if (!file || !file.type.startsWith('image/')) return
        onChange({ ...pair, [eye]: file })
    }

    const chooseDepth = (event: ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0]
        event.currentTarget.value = ''
        if (!file) return
        const supported = file.name.toLowerCase().endsWith('.npy') || file.type.startsWith('image/')
        if (!supported) return
        onChange({ ...pair, depth: file })
    }

    const swap = () => onChange({ ...pair, left: pair.right, right: pair.left })

    return <div className="stereoPairSourcePanel">
        <div className="panelLabel">SOURCE</div>
        <div className="pairSourceHeading">
            <strong>Imported stereo pair</strong>
            <span>Use photographs or rendered left/right views directly. No AI depth generation is applied.</span>
        </div>

        <div className="pairSourceGrid">
            <button className={pair.left ? 'pairSourceCard ready' : 'pairSourceCard'} onClick={() => leftInput.current?.click()}>
                {leftUrl ? <img src={leftUrl} alt="Left eye source" /> : <div className="pairEmpty"><strong>L</strong><span>Choose left image</span></div>}
                <em>LEFT EYE</em>
            </button>
            <button className={pair.right ? 'pairSourceCard ready' : 'pairSourceCard'} onClick={() => rightInput.current?.click()}>
                {rightUrl ? <img src={rightUrl} alt="Right eye source" /> : <div className="pairEmpty"><strong>R</strong><span>Choose right image</span></div>}
                <em>RIGHT EYE</em>
            </button>
        </div>
        <input ref={leftInput} className="hiddenInput" type="file" accept="image/jpeg,image/jpg,image/png,image/webp,image/tiff" onChange={(event) => choose('left', event)} />
        <input ref={rightInput} className="hiddenInput" type="file" accept="image/jpeg,image/jpg,image/png,image/webp,image/tiff" onChange={(event) => choose('right', event)} />
        <input ref={depthInput} className="hiddenInput" type="file" accept=".npy,image/png,image/jpeg,image/jpg,image/webp,image/tiff" onChange={chooseDepth} />

        <div className="pairSourceActions">
            <button onClick={() => leftInput.current?.click()}><UiIcon name="upload" /> {pair.left ? 'Replace left' : 'Choose left'}</button>
            <button onClick={() => rightInput.current?.click()}><UiIcon name="upload" /> {pair.right ? 'Replace right' : 'Choose right'}</button>
            <button onClick={swap} disabled={!pair.left && !pair.right}>Swap L / R</button>
        </div>

        <div className="pairSourceStatus">
            <strong>{pair.left && pair.right ? 'Stereo pair ready' : 'Two images required'}</strong>
            <span>{pair.left?.name || 'Left not loaded'} · {pair.right?.name || 'Right not loaded'}</span>
        </div>

        <div className={pair.depth ? 'pairDepthSource ready' : 'pairDepthSource'}>
            <div><strong>Optional depth map</strong><span>{pair.depth ? pair.depth.name : 'Add a map aligned to the LEFT eye to unlock depth-dependent techniques.'}</span></div>
            <div><button onClick={() => depthInput.current?.click()}><UiIcon name="upload" /> {pair.depth ? 'Replace depth' : 'Choose depth'}</button>{pair.depth && <button onClick={() => onChange({ ...pair, depth: null })}><UiIcon name="close" /> Remove</button>}</div>
        </div>

        <div className="localNote"><strong>Original pair retained</strong><span>The imported files stay at their original resolution. Ordinary stereo formats use the two images directly. An optional PNG/JPEG/TIFF/WebP or float32 .npy depth map can drive ChromaDepth, wiggle and autostereogram techniques from the left-eye image.</span></div>
    </div>
}

export default StereoPairUpload
