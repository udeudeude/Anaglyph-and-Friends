import { useEffect, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import "./styles/AnaglyphEditor.css";
import TechniqueControls from './TechniqueControls';
import UiIcon from './UiIcon';
import {
    mergeStoredSettings,
    stereoBasedTechniques,
    techniqueInfo,
    type TechniqueId,
    type TechniqueSettings,
} from './techniques';

type ProcessingStage = 'idle' | 'uploading' | 'depth' | 'stereo' | 'technique' | 'full' | 'ready' | 'error';

type Props = {
    isDepthMapReady: boolean;
    isChangeAllowed: boolean;
    setIsChangeAllowed: (value: boolean) => void;
    setProcessingStage: (stage: ProcessingStage) => void;
    onOpenPhantogram: () => void;
    onOpenColorReveal: () => void;
    onOpenLayered: () => void;
    onOpenPrintCalibration: () => void;
};

const coreTechniques = new Set<TechniqueId>(['anaglyph', 'parallel', 'cross']);
const compatibilityTechniques = new Set<TechniqueId>(['topbottom', 'halfsbs', 'rowinterlaced', 'columninterlaced', 'checkerboard']);
const directOutputTechniques = new Set<TechniqueId>([...coreTechniques, ...compatibilityTechniques]);
const allTechniques = new Set<TechniqueId>([
    ...directOutputTechniques,
    'chromadepth', 'cardboard', 'stereoscope', 'mirror', 'wiggle', 'pulfrich', 'randomdot', 'pattern', 'lenticular',
]);
const eyeOrderTechniques = new Set<TechniqueId>([
    ...directOutputTechniques,
    'cardboard', 'stereoscope', 'mirror', 'lenticular',
]);

const readNumber = (key: string, fallback: number) => {
    const raw = localStorage.getItem(key);
    if (raw === null || raw.trim() === '') return fallback;
    const value = Number(raw);
    return Number.isFinite(value) ? value : fallback;
};

const cloneSettings = (settings: TechniqueSettings): TechniqueSettings => JSON.parse(JSON.stringify(settings));

function AnaglyphEditor({ isDepthMapReady, isChangeAllowed, setIsChangeAllowed, setProcessingStage, onOpenPhantogram, onOpenColorReveal, onOpenLayered, onOpenPrintCalibration }: Props) {
    const apiUrl = import.meta.env.VITE_FLASK_BACKEND_API_URL || "http://localhost:8000";
    const previewRef = useRef<HTMLDivElement>(null);
    const dragRef = useRef<{x: number; y: number; panX: number; panY: number} | null>(null);

    const [activeTechnique, setActiveTechnique] = useState<TechniqueId>(() => {
        const saved = localStorage.getItem('aaf-technique') as TechniqueId | null;
        return saved && allTechniques.has(saved) ? saved : 'anaglyph';
    });
    const [compatibilityMenuOpen, setCompatibilityMenuOpen] = useState(() => {
        const saved = localStorage.getItem('aaf-technique') as TechniqueId | null;
        return !!saved && compatibilityTechniques.has(saved);
    });
    const initialSettings = mergeStoredSettings(localStorage.getItem('aaf-technique-settings'));
    const [draftSettings, setDraftSettings] = useState<TechniqueSettings>(() => cloneSettings(initialSettings));
    const [appliedSettings, setAppliedSettings] = useState<TechniqueSettings>(() => cloneSettings(initialSettings));
    const [previewUrl, setPreviewUrl] = useState<string | null>(null);
    const [outputsAreLoading, setOutputsAreLoading] = useState(false);
    const [fullPreparing, setFullPreparing] = useState(false);
    const [hasRendered, setHasRendered] = useState(false);
    const [popOut, setPopOut] = useState(() => localStorage.getItem('aaf-pop-out') === 'true');
    const [swapEyes, setSwapEyes] = useState(() => localStorage.getItem('aaf-swap-eyes') === 'true');
    const [appliedStrength, setAppliedStrength] = useState(() => readNumber('aaf-strength', 2));
    const [sliderValue, setSliderValue] = useState(() => readNumber('aaf-strength', 2));
    const [optimiseRRAnaglyph, setOptimiseRRAnaglyph] = useState(() => localStorage.getItem('aaf-retinal-rivalry') === 'true');
    const [viewScale, setViewScale] = useState(() => readNumber('aaf-view-scale', 100));
    const [downloadFormat, setDownloadFormat] = useState<'jpeg' | 'png'>(() => localStorage.getItem('aaf-download-format') === 'png' ? 'png' : 'jpeg');
    const [jpegQuality, setJpegQuality] = useState(() => readNumber('aaf-jpeg-quality', 95));
    const [zoom, setZoom] = useState(1);
    const [pan, setPan] = useState({x: 0, y: 0});

    const techniqueDirty = JSON.stringify(draftSettings) !== JSON.stringify(appliedSettings);
    const renderParams = () => `pop_out=${popOut}&max_disparity_percentage=${appliedStrength}`;

    const specialUrl = (technique: TechniqueId, scope: 'preview' | 'full') => {
        const base: Record<string, string> = {
            scope,
            pop_out: String(popOut),
            max_disparity_percentage: String(appliedStrength),
            swap_eyes: String(swapEyes),
            format: downloadFormat,
            quality: String(jpegQuality),
        };
        if (technique === 'chromadepth') {
            const s = appliedSettings.chromadepth;
            return `${apiUrl}/special/chromadepth?${new URLSearchParams({...base, color_strength: String(s.colorStrength), reverse: String(s.reverse)}).toString()}`;
        }
        if (technique === 'cardboard') {
            const s = appliedSettings.cardboard;
            return `${apiUrl}/special/cardboard?${new URLSearchParams({...base, width: String(s.width), height: String(s.height), screen_width_mm: String(s.screenWidthMm), lens_separation_mm: String(s.lensSeparationMm), image_scale: String(s.imageScale)}).toString()}`;
        }
        if (technique === 'stereoscope') {
            const s = appliedSettings.stereoscope;
            return `${apiUrl}/special/stereoscope?${new URLSearchParams({...base, dpi: String(s.dpi), card_width: String(s.cardWidth), card_height: String(s.cardHeight), image_width: String(s.imageWidth), image_height: String(s.imageHeight), gap: String(s.gap), arch: String(s.arch), title: s.title, caption: s.caption, publisher: s.publisher, card_tone: s.cardTone}).toString()}`;
        }
        if (technique === 'mirror') {
            const s = appliedSettings.mirror;
            return `${apiUrl}/special/mirror-stereoscope?${new URLSearchParams({...base, dpi: String(s.dpi), card_width: String(s.cardWidth), card_height: String(s.cardHeight), image_width: String(s.imageWidth), image_height: String(s.imageHeight), mirror_gap: String(s.mirrorGap), reflected_eye: s.reflectedEye, show_guide: String(s.showGuide)}).toString()}`;
        }
        if (technique === 'wiggle') {
            const s = appliedSettings.wiggle;
            return `${apiUrl}/special/wiggle?${new URLSearchParams({...base, frames: String(s.frames), duration: String(s.duration)}).toString()}`;
        }
        if (technique === 'pulfrich') {
            const s = appliedSettings.pulfrich;
            return `${apiUrl}/special/pulfrich?${new URLSearchParams({...base, frames: String(s.frames), duration: String(s.duration), strength: String(s.strength), dark_eye: s.darkEye}).toString()}`;
        }
        if (technique === 'randomdot' || technique === 'pattern') {
            const s = appliedSettings.autostereogram;
            return `${apiUrl}/special/autostereogram?${new URLSearchParams({...base, style: technique === 'pattern' ? 'pattern' : 'random', separation: String(s.separation), depth_strength: String(s.depthStrength), dot_size: String(s.dotSize), viewing: s.viewing, guides: String(s.guides), color: String(s.color), revision: String(s.patternRevision)}).toString()}`;
        }
        if (technique === 'lenticular') {
            const s = appliedSettings.lenticular;
            return `${apiUrl}/special/lenticular?${new URLSearchParams({...base, dpi: String(s.dpi), lpi: String(s.lpi), width_in: String(s.widthIn), height_in: String(s.heightIn), views: String(s.views), slant: String(s.slant)}).toString()}`;
        }
        throw new Error(`No special renderer for ${technique}`);
    };

    const directUrl = (technique: TechniqueId, scope: 'preview' | 'full') => {
        const calibration = appliedSettings.anaglyph[appliedSettings.anaglyph.target];
        const params = new URLSearchParams({
            scope,
            format: downloadFormat,
            quality: String(jpegQuality),
            pop_out: String(popOut),
            max_disparity_percentage: String(appliedStrength),
            swap_eyes: String(swapEyes),
            optimised_RR_anaglyph: String(optimiseRRAnaglyph),
            anaglyph_type: appliedSettings.anaglyph.glasses,
            anaglyph_color: appliedSettings.anaglyph.colorMode,
            anaglyph_target: appliedSettings.anaglyph.target,
            anaglyph_left_color: calibration.leftColor,
            anaglyph_right_color: calibration.rightColor,
            anaglyph_left_gain: String(calibration.leftGain),
            anaglyph_right_gain: String(calibration.rightGain),
        });
        return `${apiUrl}/output/${technique}?${params.toString()}`;
    };

    const renderActivePreview = async () => {
        if (!isDepthMapReady) return;
        setOutputsAreLoading(true);
        setIsChangeAllowed(false);
        setProcessingStage(directOutputTechniques.has(activeTechnique) ? 'stereo' : 'technique');
        try {
            let url: string;
            if (directOutputTechniques.has(activeTechnique)) {
                const renderResponse = await fetch(`${apiUrl}/render?${renderParams()}`, { method: 'GET', credentials: 'include' });
                if (!renderResponse.ok) throw new Error(`Stereo render failed with status ${renderResponse.status}`);
                url = directUrl(activeTechnique, 'preview');
            } else {
                url = specialUrl(activeTechnique, 'preview');
            }
            const response = await fetch(url, { method: 'GET', credentials: 'include' });
            if (!response.ok) throw new Error(`Technique preview failed with status ${response.status}`);
            const blob = await response.blob();
            const nextUrl = URL.createObjectURL(blob);
            setPreviewUrl(old => { if (old) URL.revokeObjectURL(old); return nextUrl; });
            setHasRendered(true);
            setProcessingStage('ready');
        } catch (error) {
            console.error('Failed to render selected technique', error);
            setProcessingStage('error');
        } finally {
            setOutputsAreLoading(false);
            setIsChangeAllowed(true);
        }
    };

    useEffect(() => { if (isDepthMapReady) void renderActivePreview(); }, [isDepthMapReady, activeTechnique, popOut, swapEyes, appliedStrength, optimiseRRAnaglyph, appliedSettings]);
    useEffect(() => {
        if (!isDepthMapReady) {
            setHasRendered(false);
            setPreviewUrl(old => { if (old) URL.revokeObjectURL(old); return null; });
        }
    }, [isDepthMapReady]);

    useEffect(() => { localStorage.setItem('aaf-technique', activeTechnique); setZoom(1); setPan({x: 0, y: 0}); }, [activeTechnique]);
    useEffect(() => { localStorage.setItem('aaf-pop-out', String(popOut)); }, [popOut]);
    useEffect(() => { localStorage.setItem('aaf-swap-eyes', String(swapEyes)); }, [swapEyes]);
    useEffect(() => { localStorage.setItem('aaf-strength', String(appliedStrength)); }, [appliedStrength]);
    useEffect(() => { localStorage.setItem('aaf-retinal-rivalry', String(optimiseRRAnaglyph)); }, [optimiseRRAnaglyph]);
    useEffect(() => { localStorage.setItem('aaf-view-scale', String(viewScale)); }, [viewScale]);
    useEffect(() => { localStorage.setItem('aaf-download-format', downloadFormat); }, [downloadFormat]);
    useEffect(() => { localStorage.setItem('aaf-jpeg-quality', String(jpegQuality)); }, [jpegQuality]);
    useEffect(() => { localStorage.setItem('aaf-technique-settings', JSON.stringify(draftSettings)); }, [draftSettings]);

    const applyTechniqueSettings = (settings?: TechniqueSettings) => setAppliedSettings(cloneSettings(settings || draftSettings));
    const fullscreen = () => previewRef.current?.requestFullscreen?.();

    const selectCoreTechnique = (technique: TechniqueId) => {
        setCompatibilityMenuOpen(false);
        setActiveTechnique(technique);
    };

    const selectMoreTechnique = (value: string) => {
        if (value === '__phantogram__') {
            onOpenPhantogram();
            return;
        }
        if (value === '__color_reveal__') {
            onOpenColorReveal();
            return;
        }
        if (value === '__layered__') {
            onOpenLayered();
            return;
        }
        if (value === '__print_calibration__') {
            onOpenPrintCalibration();
            return;
        }
        if (value === '__compatibility__') {
            setCompatibilityMenuOpen(true);
            return;
        }
        setCompatibilityMenuOpen(false);
        setActiveTechnique(value as TechniqueId);
    };

    const triggerBlobDownload = (blob: Blob, filename: string) => {
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        link.remove();
        window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    };

    const currentFilename = () => {
        const ext = activeTechnique === 'wiggle' || activeTechnique === 'pulfrich' ? 'gif' : (activeTechnique === 'stereoscope' || activeTechnique === 'mirror' || activeTechnique === 'lenticular' ? 'png' : downloadFormat === 'png' ? 'png' : 'jpg');
        const names: Record<TechniqueId, string> = {
            anaglyph: `${appliedSettings.anaglyph.glasses}-anaglyph`,
            parallel: 'parallel-stereo',
            cross: 'cross-eyed-stereo',
            chromadepth: 'chromadepth',
            cardboard: 'cardboard-stereo',
            stereoscope: 'stereoscope-card',
            mirror: 'single-mirror-stereoscope',
            wiggle: 'wiggle-gram',
            pulfrich: 'pulfrich-motion-3d',
            randomdot: 'random-dot-stereogram',
            pattern: 'pattern-stereogram',
            lenticular: 'lenticular-interlaced',
            topbottom: 'top-bottom-stereo',
            halfsbs: 'half-width-side-by-side',
            rowinterlaced: 'row-interlaced-stereo',
            columninterlaced: 'column-interlaced-stereo',
            checkerboard: 'checkerboard-stereo',
        };
        return `${names[activeTechnique]}.${ext}`;
    };

    const downloadCurrent = async () => {
        if (!isDepthMapReady || fullPreparing) return;
        setFullPreparing(true);
        setIsChangeAllowed(false);
        setProcessingStage('full');
        try {
            let url: string;
            if (directOutputTechniques.has(activeTechnique)) {
                const prepare = await fetch(`${apiUrl}/prepare-full?${renderParams()}`, { method: 'GET', credentials: 'include' });
                if (!prepare.ok) throw new Error(`Full-resolution stereo render failed: ${prepare.status}`);
                url = directUrl(activeTechnique, 'full');
            } else {
                url = specialUrl(activeTechnique, activeTechnique === 'wiggle' || activeTechnique === 'pulfrich' ? 'preview' : 'full');
            }
            const response = await fetch(url, { method: 'GET', credentials: 'include' });
            if (!response.ok) throw new Error(`Final output failed: ${response.status}`);
            triggerBlobDownload(await response.blob(), currentFilename());
            setProcessingStage('ready');
        } catch (error) {
            console.error('Failed to create final download', error);
            setProcessingStage('error');
        } finally {
            setFullPreparing(false);
            setIsChangeAllowed(true);
        }
    };

    const downloadEye = async (kind: 'left' | 'right') => {
        if (!isDepthMapReady || fullPreparing) return;
        setFullPreparing(true);
        setProcessingStage('full');
        try {
            const prepare = await fetch(`${apiUrl}/prepare-full?${renderParams()}`, { method: 'GET', credentials: 'include' });
            if (!prepare.ok) throw new Error(`Full-resolution stereo render failed: ${prepare.status}`);
            const params = new URLSearchParams({
                scope: 'full', format: downloadFormat, quality: String(jpegQuality),
                pop_out: String(popOut), max_disparity_percentage: String(appliedStrength), swap_eyes: String(swapEyes),
            });
            const response = await fetch(`${apiUrl}/output/${kind}?${params.toString()}`, { credentials: 'include' });
            if (!response.ok) throw new Error(`Eye download failed: ${response.status}`);
            triggerBlobDownload(await response.blob(), `${kind}-eye.${downloadFormat === 'png' ? 'png' : 'jpg'}`);
            setProcessingStage('ready');
        } catch (error) {
            console.error(error);
            setProcessingStage('error');
        } finally {
            setFullPreparing(false);
        }
    };

    useEffect(() => {
        const onKeyDown = (event: KeyboardEvent) => {
            if (event.repeat) return;
            const target = event.target as HTMLElement | null;
            if (target && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))) return;
            const key = event.key.toLowerCase();
            const primary = event.metaKey || event.ctrlKey;
            if (primary && !event.shiftKey && !event.altKey && key === 's' && previewUrl) {
                event.preventDefault();
                void downloadCurrent();
                return;
            }
            if (event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) return;
            if (key === 'r') { event.preventDefault(); selectCoreTechnique('anaglyph'); }
            else if (key === 'v') { event.preventDefault(); selectCoreTechnique('parallel'); }
            else if (key === 'x') { event.preventDefault(); selectCoreTechnique('cross'); }
            else if (key === 'f' && previewUrl) { event.preventDefault(); fullscreen(); }
            else if (key === 'd' && previewUrl) { event.preventDefault(); void downloadCurrent(); }
        };
        window.addEventListener('keydown', onKeyDown);
        return () => window.removeEventListener('keydown', onKeyDown);
    }, [activeTechnique, previewUrl, isDepthMapReady, fullPreparing, downloadFormat, jpegQuality, popOut, swapEyes, appliedStrength, optimiseRRAnaglyph, appliedSettings]);

    const zoomBy = (amount: number) => {
        const next = Math.max(1, Math.min(4, Number((zoom + amount).toFixed(2))));
        setZoom(next);
        if (next === 1) setPan({x: 0, y: 0});
    };
    const resetZoom = () => { setZoom(1); setPan({x: 0, y: 0}); };
    const beginPan = (event: ReactPointerEvent<HTMLDivElement>) => {
        if (zoom <= 1) return;
        dragRef.current = {x: event.clientX, y: event.clientY, panX: pan.x, panY: pan.y};
        event.currentTarget.setPointerCapture(event.pointerId);
    };
    const movePan = (event: ReactPointerEvent<HTMLDivElement>) => {
        if (!dragRef.current) return;
        setPan({x: dragRef.current.panX + event.clientX - dragRef.current.x, y: dragRef.current.panY + event.clientY - dragRef.current.y});
    };
    const endPan = () => { dragRef.current = null; };

    const usesStereo = stereoBasedTechniques.has(activeTechnique);
    const usesEyeOrder = eyeOrderTechniques.has(activeTechnique);
    const fixedFormat = activeTechnique === 'wiggle' || activeTechnique === 'pulfrich' ? 'GIF' : activeTechnique === 'stereoscope' || activeTechnique === 'mirror' || activeTechnique === 'lenticular' ? 'PNG' : null;
    const info = techniqueInfo[activeTechnique];
    const compatibilitySelected = compatibilityTechniques.has(activeTechnique);
    const specialSelected = !coreTechniques.has(activeTechnique) && !compatibilitySelected;
    const showTechniqueSettings = activeTechnique === 'anaglyph' || specialSelected;
    const showRetinalRivalry = activeTechnique === 'anaglyph' && appliedSettings.anaglyph.glasses === 'red-cyan' && appliedSettings.anaglyph.colorMode === 'full' && appliedSettings.anaglyph.target === 'screen';

    const genericSettings = (fullscreenMode = false) => <div className={`settingsCard ${usesStereo ? '' : 'nonStereo'} ${fullscreenMode ? 'fullscreenSettingsCard' : ''}`}>
        {usesStereo && <div className="settingGroup">
            <div className="settingTitle"><span>3D strength</span><strong>{sliderValue.toFixed(1)}%</strong></div>
            <input type="range" min="0" max="6" step="0.1" value={sliderValue} disabled={!isChangeAllowed} onChange={(e) => setSliderValue(parseFloat(e.target.value))} onPointerUp={() => isChangeAllowed && setAppliedStrength(sliderValue)} onKeyUp={() => isChangeAllowed && setAppliedStrength(sliderValue)} />
            <div className="rangeLabels"><span>Subtle</span><span>{sliderValue !== appliedStrength ? 'Release to apply' : 'Strong'}</span></div>
        </div>}
        <div className="settingGroup">
            <div className="settingTitle"><span>On-screen preview size</span><strong>{viewScale}%</strong></div>
            <input type="range" min="35" max="100" step="1" value={viewScale} onChange={(e) => setViewScale(parseInt(e.target.value))} />
            <div className="rangeLabels"><span>Smaller</span><span>Fill stage</span></div>
        </div>
        {usesStereo && <label className="toggleSetting"><span><strong>Pop out</strong><small>Place depth in front of screen</small></span><input type="checkbox" checked={popOut} disabled={!isChangeAllowed} onChange={(e) => setPopOut(e.target.checked)} /></label>}
        {usesEyeOrder && <label className="toggleSetting"><span><strong>Swap left / right</strong><small>Reverse eye order without regenerating depth</small></span><input type="checkbox" checked={swapEyes} disabled={!isChangeAllowed} onChange={(e) => setSwapEyes(e.target.checked)} /></label>}
        {showRetinalRivalry && <label className="toggleSetting"><span><strong>Reduce retinal rivalry</strong><small>Optimized full-color red/cyan only</small></span><input type="checkbox" checked={optimiseRRAnaglyph} disabled={!isChangeAllowed} onChange={(e) => setOptimiseRRAnaglyph(e.target.checked)} /></label>}
    </div>;

    return (
        <div className="editorWorkspace">
            <div className="editorHeader">
                <div><div className="panelLabel">OUTPUT</div><h2>3D Technique Studio</h2></div>
                <div className="generationState">{fullPreparing ? "Preparing final output…" : outputsAreLoading ? <><span className="miniLoader" /> Rendering {info.label}</> : isDepthMapReady ? "Ready" : "Waiting for image"}</div>
            </div>

            <div className="techniqueChooser">
                <div className="outputTabs">
                    <button className={activeTechnique === 'anaglyph' ? 'outputTab active' : 'outputTab'} onClick={() => selectCoreTechnique('anaglyph')}>Anaglyph <kbd>R</kbd></button>
                    <button className={activeTechnique === 'parallel' ? 'outputTab active' : 'outputTab'} onClick={() => selectCoreTechnique('parallel')}>Parallel <kbd>V</kbd></button>
                    <button className={activeTechnique === 'cross' ? 'outputTab active' : 'outputTab'} onClick={() => selectCoreTechnique('cross')}>Cross-Eyed <kbd>X</kbd></button>
                </div>
                <select className={specialSelected ? 'moreTechniques active' : 'moreTechniques'} value={specialSelected ? activeTechnique : ''} onChange={(e) => selectMoreTechnique(e.target.value)}>
                    <option value="" disabled>More techniques…</option>
                    <optgroup label="Glasses"><option value="chromadepth">ChromaDepth</option></optgroup>
                    <optgroup label="Viewers"><option value="cardboard">Cardboard / Phone Viewer</option><option value="stereoscope">Traditional Stereoscope Card</option><option value="mirror">Single-Mirror Stereoscope</option></optgroup>
                    <optgroup label="Animation"><option value="wiggle">Wiggle-gram</option><option value="pulfrich">Pulfrich Motion 3D</option></optgroup>
                    <optgroup label="Autostereograms"><option value="randomdot">Random-Dot Stereogram</option><option value="pattern">Pattern Stereogram</option></optgroup>
                    <optgroup label="Print"><option value="lenticular">Lenticular 3D</option><option value="__phantogram__">Phantogram</option><option value="__color_reveal__">RGB Reveal / CMY Layers</option></optgroup>
                    <optgroup label="Compositing"><option value="__layered__">Layered 3D Composite</option></optgroup>
                    <optgroup label="Advanced tools"><option value="__print_calibration__">Print calibration & setup…</option></optgroup>
                    <option className="techniqueMenuDivider" value="__divider__" disabled>────────────</option>
                    <option value="__compatibility__">Even more techniques…</option>
                </select>
                {(compatibilityMenuOpen || compatibilitySelected) && <select className={compatibilitySelected ? 'compatibilityTechniques active' : 'compatibilityTechniques'} value={compatibilitySelected ? activeTechnique : ''} onChange={(e) => setActiveTechnique(e.target.value as TechniqueId)}>
                    <option value="" disabled>Display & compatibility…</option>
                    <option value="halfsbs">Half-Width Side-by-Side</option>
                    <option value="topbottom">Top / Bottom Stereo</option>
                    <option value="rowinterlaced">Row-Interlaced</option>
                    <option value="columninterlaced">Column-Interlaced</option>
                    <option value="checkerboard">Checkerboard Stereo</option>
                </select>}
            </div>
            <div className="techniqueSummary"><strong>{info.label}</strong><span>{info.description}</span><em>{info.family}</em></div>

            <div className={`previewFrame ${zoom > 1 ? 'zoomed' : ''}`} ref={previewRef} onPointerDown={beginPan} onPointerMove={movePan} onPointerUp={endPan} onPointerCancel={endPan} onDoubleClick={resetZoom}>
                {previewUrl ? <img src={previewUrl} alt={info.label} draggable={false} style={{maxWidth: `${viewScale}%`, transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`}} /> : (
                    <div className="emptyStage"><div className="stereoGlyph">◉ ◉</div><strong>Your 3D result will appear here</strong><span>Drop, choose, or paste an image in the source panel.</span></div>
                )}
                {outputsAreLoading && <div className="loadingVeil"><div className="largeLoader" /><span>Rendering {info.label}…</span></div>}
                <div className="fullscreenHotZone" aria-hidden="true" />
                <div className="fullscreenDock" onPointerDown={(e) => e.stopPropagation()} onDoubleClick={(e) => e.stopPropagation()}>
                    <div className="fullscreenDockHeader">
                        <div><strong>{info.label}</strong><span>Move the pointer above this panel to hide it.</span></div>
                        <button className="downloadAction" onClick={() => void downloadCurrent()} disabled={!previewUrl || fullPreparing}>{fullPreparing ? <><span className="buttonLoader" /> Preparing…</> : <><UiIcon name="download" /> Download <kbd>D / ⌘S</kbd></>}</button>
                    </div>
                    {genericSettings(true)}
                    {showTechniqueSettings && <TechniqueControls technique={activeTechnique} settings={draftSettings} setSettings={setDraftSettings} onApply={applyTechniqueSettings} dirty={techniqueDirty} disabled={!isChangeAllowed} apiUrl={apiUrl} />}
                </div>
            </div>

            <div className="previewMeta">
                <div><strong>{info.label}</strong><span>{info.description}</span></div>
                <div className="previewActions">
                    <div className="zoomControls"><button onClick={() => zoomBy(-0.25)} disabled={zoom <= 1}>−</button><button onClick={resetZoom}>{Math.round(zoom * 100)}%</button><button onClick={() => zoomBy(0.25)} disabled={zoom >= 4}>＋</button></div>
                    <button onClick={fullscreen} disabled={!previewUrl}><UiIcon name="expand" /> Fullscreen <kbd>F</kbd></button>
                    <button className="downloadAction" onClick={() => void downloadCurrent()} disabled={!previewUrl || fullPreparing}>{fullPreparing ? <><span className="buttonLoader" /> Preparing…</> : <><UiIcon name="download" /> Download <kbd>D / ⌘S</kbd></>}</button>
                </div>
            </div>

            {genericSettings()}

            {showTechniqueSettings && <TechniqueControls technique={activeTechnique} settings={draftSettings} setSettings={setDraftSettings} onApply={applyTechniqueSettings} dirty={techniqueDirty} disabled={!isChangeAllowed} apiUrl={apiUrl} />}

            <div className="downloadPanel">
                <div className="downloadHeading"><div><strong>Final output</strong><span>{activeTechnique === 'wiggle' || activeTechnique === 'pulfrich' ? 'Animated GIFs are exported at a playback-optimized raster size so the saved file can maintain its requested speed.' : 'Static techniques render from the full-resolution source. Print-specific formats use their selected physical dimensions and DPI.'}</span></div><span className="fullResBadge">FULL QUALITY</span></div>
                <div className="downloadControls">
                    {fixedFormat ? <div className="fixedFormat"><span>Format</span><strong>{fixedFormat}</strong></div> : <label>Format<select value={downloadFormat} onChange={(e) => setDownloadFormat(e.target.value as 'jpeg' | 'png')}><option value="jpeg">JPEG</option><option value="png">PNG</option></select></label>}
                    {!fixedFormat && downloadFormat === 'jpeg' && <label>JPEG quality<input type="range" min="70" max="100" step="1" value={jpegQuality} onChange={(e) => setJpegQuality(parseInt(e.target.value))} /><strong>{jpegQuality}</strong></label>}
                    {usesStereo && <div className="eyeDownloads"><button onClick={() => void downloadEye('left')} disabled={!hasRendered || fullPreparing}><UiIcon name="download" /> Left eye</button><button onClick={() => void downloadEye('right')} disabled={!hasRendered || fullPreparing}><UiIcon name="download" /> Right eye</button></div>}
                </div>
            </div>
        </div>
    );
}

export default AnaglyphEditor;