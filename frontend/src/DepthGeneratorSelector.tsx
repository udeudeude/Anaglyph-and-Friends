import type { DepthGeneratorSelection, DepthRuntime } from './depthGenerators'
import { AUTOMATIC_DEPTH_GENERATOR, DEPTH_GENERATORS, resolveDepthGenerator } from './depthGenerators'
import './styles/DepthGeneratorSelector.css'

type Props = {
    selection: DepthGeneratorSelection
    runtime: DepthRuntime
    disabled: boolean
    onChange: (selection: DepthGeneratorSelection) => void
    context: 'image' | 'reel'
}

export default function DepthGeneratorSelector({ selection, runtime, disabled, onChange, context }: Props) {
    const active = resolveDepthGenerator(selection, runtime)
    return <details className="depthGeneratorSelector">
        <summary>AI depth generator · {selection === AUTOMATIC_DEPTH_GENERATOR ? 'Automatic (recommended)' : active.name}</summary>
        <label>
            <span>Generator</span>
            <select value={selection} disabled={disabled} onChange={event => onChange(event.target.value as DepthGeneratorSelection)}>
                <option value={AUTOMATIC_DEPTH_GENERATOR}>Automatic (recommended)</option>
                {DEPTH_GENERATORS.filter(generator => generator.runtimes.some(candidate => candidate === runtime)).map(generator =>
                    <option key={generator.id} value={generator.id}>{generator.name}</option>
                )}
            </select>
        </label>
        <small>{context === 'reel' ? 'Applies to single-image scenes when you next build the reel.' : 'Choosing a different model regenerates an unedited AI map for the loaded image. Imported or edited maps stay until you use the replace button.'} {selection === AUTOMATIC_DEPTH_GENERATOR ? `Automatic currently uses ${active.name}.` : `${active.name} is selected.`}</small>
        {selection === 'depth-anything-v3-small' && <small>V3 downloads about 105 MB the first time and needs more device memory. If it cannot run here, select Automatic and retry the same image.</small>}
    </details>
}
