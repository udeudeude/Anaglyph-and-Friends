import './styles/App.css'
import './styles/StudioSourceModes.css'
import ImageUpload from './ImageUpload.tsx'
import { useEffect, useState } from 'react'
import type { CSSProperties, MouseEvent as ReactMouseEvent } from 'react'
import AnaglyphEditor from './AnaglyphEditor.tsx'
import ViewMasterBuilder from './ViewMasterBuilder.tsx'
import PhantogramBuilder from './PhantogramBuilder.tsx'
import PolarizedProjection from './PolarizedProjection.tsx'
import StereoPairUpload from './StereoPairUpload.tsx'
import StereoPairEditor from './StereoPairEditor.tsx'
import type { StereoPairDraft, StudioSource } from './studioAssets.ts'

type ProcessingStage = 'idle' | 'uploading' | 'depth' | 'stereo' | 'technique' | 'full' | 'ready' | 'error'
type WorkspaceMode = 'studio' | 'viewmaster' | 'polarized'
type StudioSurface = 'editor' | 'phantogram'
type StudioInputMode = 'single' | 'pair'

const stageLabels: Record<ProcessingStage, string> = {
    idle: 'Processing locally', uploading: 'Loading original…', depth: 'Estimating depth…', stereo: 'Building stereo views…', technique: 'Rendering selected technique…', full: 'Rendering full resolution…', ready: 'Ready · processing locally', error: 'Processing error',
}

function App() {
    const [workspaceMode, setWorkspaceMode] = useState<WorkspaceMode>('studio')
    const [studioSurface, setStudioSurface] = useState<StudioSurface>('editor')
    const [studioInputMode, setStudioInputMode] = useState<StudioInputMode>('single')
    const [singleSourceFile, setSingleSourceFile] = useState<File | null>(null)
    const [incomingSingleFile, setIncomingSingleFile] = useState<File | null>(null)
    const [stereoPair, setStereoPair] = useState<StereoPairDraft>({ left: null, right: null })
    const [viewMasterIncoming, setViewMasterIncoming] = useState<StudioSource | null>(null)
    const [isDepthMapReady, setIsDepthMapReady] = useState<boolean>(false)
    const [isChangeAllowed, setIsChangeAllowed] = useState<boolean>(true)
    const [processingStage, setProcessingStage] = useState<ProcessingStage>('idle')
    const [sidebarWidth, setSidebarWidth] = useState<number>(() => Number(localStorage.getItem('aaf-sidebar-width')) || 280)
    const [sidebarCollapsed, setSidebarCollapsed] = useState<boolean>(() => localStorage.getItem('aaf-sidebar-collapsed') === 'true')
    const pairReady = !!stereoPair.left && !!stereoPair.right
    const currentStudioSource: StudioSource | null = studioInputMode === 'single' ? (singleSourceFile ? { kind: 'single', file: singleSourceFile } : null) : (pairReady ? { kind: 'pair', left: stereoPair.left as File, right: stereoPair.right as File } : null)

    useEffect(() => { localStorage.setItem('aaf-sidebar-collapsed', String(sidebarCollapsed)) }, [sidebarCollapsed])
    const switchWorkspace = (mode: WorkspaceMode) => { setWorkspaceMode(mode); if (mode !== 'studio') setProcessingStage('idle'); else if (studioInputMode === 'single') setProcessingStage(isDepthMapReady ? 'ready' : 'idle'); else setProcessingStage(pairReady ? 'ready' : 'idle') }
    const switchInputMode = (mode: StudioInputMode) => { setStudioInputMode(mode); setStudioSurface('editor'); setProcessingStage(mode === 'single' ? (isDepthMapReady ? 'ready' : 'idle') : (pairReady ? 'ready' : 'idle')) }
    const sendToViewMaster = (source: StudioSource | null = currentStudioSource) => { if (!source) return; setViewMasterIncoming(source); switchWorkspace('viewmaster') }
    const openInStudio = (source: StudioSource) => { setStudioSurface('editor'); if (source.kind === 'single') { setStudioInputMode('single'); setSingleSourceFile(source.file); setIncomingSingleFile(source.file); setIsDepthMapReady(false); setProcessingStage('uploading') } else { setStudioInputMode('pair'); setStereoPair({ left: source.left, right: source.right }); setProcessingStage('ready') } setWorkspaceMode('studio') }
    const beginResize = (event: ReactMouseEvent<HTMLDivElement>) => { if (sidebarCollapsed) return; event.preventDefault(); const startX = event.clientX, startWidth = sidebarWidth; const move = (moveEvent: MouseEvent) => { const next = Math.max(220, Math.min(430, startWidth + moveEvent.clientX - startX)); setSidebarWidth(next); localStorage.setItem('aaf-sidebar-width', String(next)) }; const stop = () => { document.removeEventListener('mousemove', move); document.removeEventListener('mouseup', stop); document.body.classList.remove('resizingRail') }; document.body.classList.add('resizingRail'); document.addEventListener('mousemove', move); document.addEventListener('mouseup', stop) }
    const workspaceStyle = { '--sidebar-width': `${sidebarWidth}px` } as CSSProperties

    return <div className="appShell">
        <header className="topBar"><div><div className="brandEyebrow">LOCAL AI STEREO WORKSPACE</div><h1 className="brandTitle">Anaglyph &amp; Friends</h1></div><div className="topBarActions"><nav className="workspaceModeNav" aria-label="Workspace"><button className={workspaceMode === 'studio' ? 'active' : ''} onClick={() => switchWorkspace('studio')}>3D Studio</button><button className={workspaceMode === 'viewmaster' ? 'active' : ''} onClick={() => switchWorkspace('viewmaster')}>View-Master Reel</button><button className={workspaceMode === 'polarized' ? 'active' : ''} onClick={() => switchWorkspace('polarized')}>Polarized Projection</button></nav><div className={`localBadge stage-${processingStage}`}><span className="statusDot" /> {stageLabels[processingStage]}</div></div></header>
        <div hidden={workspaceMode !== 'studio'}><main className={`workspace ${sidebarCollapsed ? 'railCollapsed' : ''}`} style={workspaceStyle}><aside className="controlRail"><button className="collapseRail" onClick={() => setSidebarCollapsed(true)} title="Collapse source panel" aria-label="Collapse source panel">‹</button><div className="sourceModeSwitch" aria-label="Source type"><button className={studioInputMode === 'single' ? 'active' : ''} onClick={() => switchInputMode('single')}>Single image</button><button className={studioInputMode === 'pair' ? 'active' : ''} onClick={() => switchInputMode('pair')}>Stereo pair</button></div>{studioInputMode === 'single' ? <ImageUpload setIsDepthMapReadyStateLifter={setIsDepthMapReady} isChangeAllowed={isChangeAllowed} setIsChangeAllowed={setIsChangeAllowed} setProcessingStage={setProcessingStage} onSourceFile={setSingleSourceFile} incomingSourceFile={incomingSingleFile} onIncomingSourceConsumed={() => setIncomingSingleFile(null)} /> : <StereoPairUpload pair={stereoPair} onChange={(next) => { setStereoPair(next); setProcessingStage(next.left && next.right ? 'ready' : 'idle') }} />}<button className="sourceTransferAction" disabled={!currentStudioSource} onClick={() => sendToViewMaster()}>{studioInputMode === 'pair' ? 'Add current pair to View-Master' : 'Add current image to View-Master'}</button></aside><div className="railResizer" onMouseDown={beginResize} title="Drag to resize source panel" /><section className="stagePanel">{sidebarCollapsed && <button className="expandRail" onClick={() => setSidebarCollapsed(false)} title="Show source panel">› Source</button>}{studioInputMode === 'pair' ? <StereoPairEditor pair={stereoPair} setProcessingStage={setProcessingStage} onSendToViewMaster={() => sendToViewMaster()} /> : studioSurface === 'phantogram' ? <div className="embeddedTechniqueSurface"><button className="returnToTechniques" onClick={() => setStudioSurface('editor')}>‹ Back to 3D techniques</button><PhantogramBuilder isDepthMapReady={isDepthMapReady} setProcessingStage={setProcessingStage} /></div> : <AnaglyphEditor isDepthMapReady={isDepthMapReady} isChangeAllowed={isChangeAllowed} setIsChangeAllowed={setIsChangeAllowed} setProcessingStage={setProcessingStage} onOpenPhantogram={() => setStudioSurface('phantogram')} />}</section></main></div>
        <div hidden={workspaceMode !== 'viewmaster'}><ViewMasterBuilder setProcessingStage={setProcessingStage} incomingSource={viewMasterIncoming} onIncomingSourceConsumed={() => setViewMasterIncoming(null)} onOpenInStudio={openInStudio} /></div>
        <div hidden={workspaceMode !== 'polarized'}><PolarizedProjection pair={studioInputMode === 'pair' ? stereoPair : null} generatedPairAvailable={studioInputMode === 'single' && isDepthMapReady} setProcessingStage={setProcessingStage} /></div>
    </div>
}
export default App
