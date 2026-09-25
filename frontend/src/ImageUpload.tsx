import { useEffect, useRef, useState } from "react";
import type { ChangeEvent, DragEvent as ReactDragEvent, PointerEvent as ReactPointerEvent } from "react";
import "./styles/ImageUpload.css";
import { generateBrowserDepth, hostedBrowserDepthEnabled } from "./browserDepth";

type Props = {
    setIsDepthMapReadyStateLifter: (ready: boolean) => void;
    isChangeAllowed: boolean;
    setIsChangeAllowed: (allowed: boolean) => void;
    setProcessingStage: (stage: 'idle' | 'uploading' | 'depth' | 'stereo' | 'full' | 'ready' | 'error') => void;
    onSourceFile?: (file: File) => void;
    incomingSourceFile?: File | null;
    onIncomingSourceConsumed?: () => void;
};

type DepthSource = 'ai' | 'imported';
type DepthFit = 'crop' | 'fit' | 'stretch';

function ImageUpload({ setIsDepthMapReadyStateLifter, isChangeAllowed, setIsChangeAllowed, setProcessingStage, onSourceFile, incomingSourceFile, onIncomingSourceConsumed }: Props) {
    const imageInputRef = useRef<HTMLInputElement>(null);
    const depthInputRef = useRef<HTMLInputElement>(null);
    const [imageUrl, setImageUrl] = useState<string | null>(null);
    const [depthMapUrl, setDepthMapUrl] = useState<string | null>(null);
    const [depthMapIsLoading, setDepthMapIsLoading] = useState<boolean>(false);
    const [isDragging, setIsDragging] = useState(false);
    const [inspect, setInspect] = useState<{url: string; label: string} | null>(null);
    const [sourceMeta, setSourceMeta] = useState<string>("");
    const [pasteMessage, setPasteMessage] = useState<string>("");
    const [depthSource, setDepthSource] = useState<DepthSource>('ai');
    const [hasImportedDepth, setHasImportedDepth] = useState(false);
    const [depthFit, setDepthFit] = useState<DepthFit>('crop');
    const [depthInvert, setDepthInvert] = useState(false);
    const [depthSourceMeta, setDepthSourceMeta] = useState('');
    const [depthEditing, setDepthEditing] = useState(false);
    const [brushDirection, setBrushDirection] = useState<'lighter' | 'darker'>('lighter');
    const [brushSize, setBrushSize] = useState(5);
    const [brushStrength, setBrushStrength] = useState(30);
    const [editBlack, setEditBlack] = useState(0);
    const [editWhite, setEditWhite] = useState(100);
    const [editGamma, setEditGamma] = useState(1);
    const [editBlur, setEditBlur] = useState(0);
    const [canUndoDepth, setCanUndoDepth] = useState(false);
    const [canRedoDepth, setCanRedoDepth] = useState(false);
    const [depthHistoryPosition, setDepthHistoryPosition] = useState(0);
    const [depthHistoryCount, setDepthHistoryCount] = useState(0);
    const strokePointsRef = useRef<Array<{x: number; y: number}>>([]);
    const apiUrl = import.meta.env.VITE_FLASK_BACKEND_API_URL || "http://localhost:8000";
    const useBrowserDepth = hostedBrowserDepthEnabled();

    const replaceObjectUrl = (setter: (value: string | null) => void, oldUrl: string | null, blob: Blob | null) => {
        if (oldUrl) URL.revokeObjectURL(oldUrl);
        setter(blob ? URL.createObjectURL(blob) : null);
    };

    const fetchDepthMap = async () => {
        setDepthMapIsLoading(true);
        setProcessingStage('depth');
        try {
            const response = await fetch(`${apiUrl}/depth-map`, { method: "GET", credentials: "include" });
            if (!response.ok) throw new Error(response.statusText);
            const blob = await response.blob();
            if (!blob.size) throw new Error("Depth map is empty");
            replaceObjectUrl(setDepthMapUrl, depthMapUrl, blob);
            setIsDepthMapReadyStateLifter(true);
            setProcessingStage('stereo');
        } catch (error) {
            console.error("Failed to fetch depth map", error);
            setProcessingStage('error');
            setIsChangeAllowed(true);
        } finally {
            setDepthMapIsLoading(false);
        }
    };

    const generateHostedAiDepth = async (file: File, invert = depthInvert) => {
        setDepthMapIsLoading(true);
        setProcessingStage('depth');
        setDepthSourceMeta('Loading Depth Anything V2 into this browser…');
        try {
            const generated = await generateBrowserDepth(file, setDepthSourceMeta);
            const form = new FormData();
            form.append('file', generated.file, generated.file.name);
            form.append('invert', String(invert));
            const response = await fetch(`${apiUrl}/depth-map/ai-import`, { method: 'POST', body: form, credentials: 'include' });
            const info = await response.json().catch(() => ({}));
            if (!response.ok) throw new Error(info.error || `Browser AI depth import failed: ${response.status}`);
            setDepthSource('ai');
            setDepthSourceMeta(`Depth Anything V2 · ${generated.engine} · runs on this device`);
            await fetchDepthMap();
        } catch (error) {
            console.error('Browser depth estimation failed', error);
            setDepthSourceMeta('Browser AI depth failed · import a depth map or stereo pair instead');
            setProcessingStage('error');
            setIsChangeAllowed(true);
        } finally {
            setDepthMapIsLoading(false);
        }
    };

    const activateDepthSource = async (source: DepthSource, mode = depthFit, invert = depthInvert) => {
        if (!imageUrl) return;
        if (source === 'imported' && !hasImportedDepth) {
            depthInputRef.current?.click();
            return;
        }
        setIsChangeAllowed(false);
        setIsDepthMapReadyStateLifter(false);
        setDepthMapIsLoading(true);
        setProcessingStage('depth');
        try {
            const response = await fetch(`${apiUrl}/depth-map/source`, {
                method: 'POST',
                credentials: 'include',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({ source, mode, invert }),
            });
            if (!response.ok) {
                const body = await response.json().catch(() => ({}));
                throw new Error(body.error || `Depth source failed: ${response.status}`);
            }
            setDepthSource(source);
            setDepthSourceMeta(source === 'ai' ? 'Depth Anything V2 estimation' : `Imported map · ${mode === 'crop' ? 'crop to fill' : mode === 'fit' ? 'fit inside' : 'stretch to image'}`);
            await fetchDepthMap();
        } catch (error) {
            console.error(error);
            setProcessingStage('error');
            setIsChangeAllowed(true);
        } finally {
            setDepthMapIsLoading(false);
        }
    };

    const handleDepthImport = async (event: ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file || !imageUrl) return;
        setIsChangeAllowed(false);
        setIsDepthMapReadyStateLifter(false);
        setDepthMapIsLoading(true);
        setProcessingStage('depth');
        const form = new FormData();
        form.append('file', file, file.name || 'depth-map.png');
        form.append('mode', depthFit);
        form.append('invert', String(depthInvert));
        try {
            const response = await fetch(`${apiUrl}/depth-map/import`, { method: 'POST', body: form, credentials: 'include' });
            const info = await response.json().catch(() => ({}));
            if (!response.ok) throw new Error(info.error || `Depth import failed: ${response.status}`);
            setHasImportedDepth(true);
            setDepthSource('imported');
            setDepthSourceMeta(`${info.depth_width} × ${info.depth_height} imported → ${info.source_width} × ${info.source_height} source · ${depthFit === 'crop' ? 'crop to fill' : depthFit === 'fit' ? 'fit inside' : 'stretch'}`);
            await fetchDepthMap();
        } catch (error) {
            console.error(error);
            setProcessingStage('error');
            setIsChangeAllowed(true);
        } finally {
            setDepthMapIsLoading(false);
        }
    };

    const refreshEditedDepth = async () => {
        setIsDepthMapReadyStateLifter(false);
        await fetchDepthMap();
    };

    const postDepthEdit = async (payload: Record<string, unknown>) => {
        setIsChangeAllowed(false);
        setProcessingStage('depth');
        try {
            const response = await fetch(`${apiUrl}/depth-map/edit`, {
                method: 'POST',
                credentials: 'include',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify(payload),
            });
            const info = await response.json().catch(() => ({}));
            if (!response.ok) throw new Error(info.error || `Depth edit failed: ${response.status}`);
            setCanUndoDepth(Boolean(info.can_undo));
            setCanRedoDepth(Boolean(info.can_redo));
            setDepthHistoryPosition(Number(info.history_position) || 0);
            setDepthHistoryCount(Number(info.history_count) || 0);
            await refreshEditedDepth();
        } catch (error) {
            console.error(error);
            setProcessingStage('error');
        } finally {
            setIsChangeAllowed(true);
        }
    };

    const fetchDepthEditStatus = async () => {
        try {
            const response = await fetch(`${apiUrl}/depth-map/edit`, {
                method: 'POST',
                credentials: 'include',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({ operation: 'status' }),
            });
            const info = await response.json().catch(() => ({}));
            if (!response.ok) throw new Error(info.error || `Depth edit status failed: ${response.status}`);
            setCanUndoDepth(Boolean(info.can_undo));
            setCanRedoDepth(Boolean(info.can_redo));
            setDepthHistoryPosition(Number(info.history_position) || 0);
            setDepthHistoryCount(Number(info.history_count) || 0);
        } catch (error) {
            console.error(error);
        }
    };

    useEffect(() => {
        if (depthEditing && depthMapUrl) void fetchDepthEditStatus();
    }, [depthEditing, depthMapUrl]);

    const normalizedPointer = (event: ReactPointerEvent<HTMLElement>) => {
        const rect = event.currentTarget.getBoundingClientRect();
        return {
            x: Math.max(0, Math.min(1, (event.clientX - rect.left) / Math.max(1, rect.width))),
            y: Math.max(0, Math.min(1, (event.clientY - rect.top) / Math.max(1, rect.height))),
        };
    };

    const beginDepthStroke = (event: ReactPointerEvent<HTMLButtonElement>) => {
        if (!depthEditing || !depthMapUrl || !isChangeAllowed) return;
        event.preventDefault();
        event.currentTarget.setPointerCapture(event.pointerId);
        strokePointsRef.current = [normalizedPointer(event)];
    };

    const continueDepthStroke = (event: ReactPointerEvent<HTMLButtonElement>) => {
        if (!depthEditing || !event.currentTarget.hasPointerCapture(event.pointerId)) return;
        event.preventDefault();
        const next = normalizedPointer(event);
        const previous = strokePointsRef.current[strokePointsRef.current.length - 1];
        if (!previous || Math.hypot(next.x - previous.x, next.y - previous.y) > 0.003) strokePointsRef.current.push(next);
    };

    const finishDepthStroke = (event: ReactPointerEvent<HTMLButtonElement>) => {
        if (!depthEditing || !event.currentTarget.hasPointerCapture(event.pointerId)) return;
        event.preventDefault();
        event.currentTarget.releasePointerCapture(event.pointerId);
        const points = strokePointsRef.current;
        strokePointsRef.current = [];
        if (!points.length) return;
        const delta = (brushDirection === 'lighter' ? 1 : -1) * (brushStrength / 100) * 0.25;
        void postDepthEdit({ operation: 'brush', points, radius: brushSize / 100, delta });
    };

    const applyDepthAdjustments = () => void postDepthEdit({
        operation: 'adjust',
        black: editBlack / 100,
        white: editWhite / 100,
        gamma: editGamma,
        blur: editBlur,
    });

    const resetDepthEdits = () => {
        setEditBlack(0);
        setEditWhite(100);
        setEditGamma(1);
        setEditBlur(0);
        void postDepthEdit({ operation: 'reset' });
    };

    const normalizePastedFile = (file: File) => {
        if (file.name && file.name.includes('.')) return file;
        const extension = file.type === 'image/jpeg' ? 'jpg' : file.type === 'image/webp' ? 'webp' : 'png';
        return new File([file], `pasted-image.${extension}`, { type: file.type || `image/${extension}` });
    };

    const handleImageFile = async (incomingFile: File) => {
        if (!incomingFile.type.startsWith('image/')) return;
        const file = normalizePastedFile(incomingFile);
        if (!isChangeAllowed && imageUrl) return;

        setPasteMessage("");
        setIsChangeAllowed(false);
        setIsDepthMapReadyStateLifter(false);
        setProcessingStage('uploading');
        replaceObjectUrl(setDepthMapUrl, depthMapUrl, null);
        replaceObjectUrl(setImageUrl, imageUrl, file);
        setDepthSource('ai');
        setHasImportedDepth(false);
        setDepthFit('crop');
        setDepthInvert(false);
        setDepthSourceMeta('Depth Anything V2 estimation');
        setDepthEditing(false);
        setEditBlack(0);
        setEditWhite(100);
        setEditGamma(1);
        setEditBlur(0);
        setCanUndoDepth(false);
        setCanRedoDepth(false);
        setDepthHistoryPosition(0);
        setDepthHistoryCount(0);

        const megabytes = file.size / (1024 * 1024);
        setSourceMeta(`${megabytes.toFixed(megabytes >= 10 ? 0 : 1)} MB · original retained`);

        const formData = new FormData();
        formData.append("file", file, file.name || "image.png");
        try {
            const response = await fetch(`${apiUrl}/image`, {
                method: "POST",
                body: formData,
                credentials: "include",
            });
            if (!response.ok) {
                const body = await response.json().catch(() => ({}));
                throw new Error(body.error || `Upload failed: ${response.status}`);
            }
            onSourceFile?.(file);
            const info = await response.json();
            if (info.width && info.height) {
                setSourceMeta(`${info.width} × ${info.height} · ${megabytes.toFixed(megabytes >= 10 ? 0 : 1)} MB · full resolution`);
            }
            if (useBrowserDepth) await generateHostedAiDepth(file, false);
            else await fetchDepthMap();
        } catch (error) {
            console.error("Failed to upload image", error);
            setProcessingStage('error');
            setIsChangeAllowed(true);
        }
    };

    const handleImageChange = async (event: ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (file) await handleImageFile(file);
    };

    const handleDrop = async (event: ReactDragEvent<HTMLDivElement>) => {
        event.preventDefault();
        setIsDragging(false);
        const file = Array.from(event.dataTransfer.files).find(candidate => candidate.type.startsWith('image/'));
        if (file) await handleImageFile(file);
    };

    useEffect(() => {
        if (!incomingSourceFile) return;
        let cancelled = false;
        const loadIncoming = async () => {
            await handleImageFile(incomingSourceFile);
            if (!cancelled) onIncomingSourceConsumed?.();
        };
        void loadIncoming();
        return () => { cancelled = true; };
    }, [incomingSourceFile]);

    const pasteFromClipboard = async () => {
        try {
            const clipboard = navigator.clipboard as any;
            if (!clipboard?.read) throw new Error("Clipboard image reading is unavailable in this browser");
            const items = await clipboard.read();
            for (const item of items) {
                const imageType = item.types.find((type: string) => type.startsWith('image/'));
                if (imageType) {
                    const blob = await item.getType(imageType);
                    const extension = imageType === 'image/jpeg' ? 'jpg' : imageType === 'image/webp' ? 'webp' : 'png';
                    await handleImageFile(new File([blob], `pasted-image.${extension}`, { type: imageType }));
                    return;
                }
            }
            setPasteMessage("Clipboard does not contain an image.");
        } catch (error) {
            console.warn(error);
            setPasteMessage("Use ⌘V after copying an image.");
        }
    };

    useEffect(() => {
        const onPaste = (event: ClipboardEvent) => {
            if (!isChangeAllowed && imageUrl) return;
            const item = Array.from(event.clipboardData?.items || []).find(candidate => candidate.type.startsWith('image/'));
            const file = item?.getAsFile();
            if (file) {
                event.preventDefault();
                void handleImageFile(file);
            }
        };
        const onKeyDown = (event: KeyboardEvent) => {
            if (event.metaKey || event.ctrlKey || event.altKey || event.shiftKey || event.repeat) return;
            const target = event.target as HTMLElement | null;
            if (target && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))) return;
            if (event.key.toLowerCase() === 'u' && isChangeAllowed) {
                event.preventDefault();
                imageInputRef.current?.click();
            }
        };
        window.addEventListener('paste', onPaste);
        window.addEventListener('keydown', onKeyDown);
        return () => {
            window.removeEventListener('paste', onPaste);
            window.removeEventListener('keydown', onKeyDown);
        };
    }, [isChangeAllowed, imageUrl, depthMapUrl]);

    const triggerDepthDownload = (kind: 'gray16' | 'color' | 'npy') => {
        const link = document.createElement('a');
        link.href = `${apiUrl}/depth-map/download?kind=${kind}`;
        document.body.appendChild(link);
        link.click();
        link.remove();
    };

    return (
        <div
            className={`sourcePanel ${isDragging ? 'dragActive' : ''}`}
            onDragEnter={(event) => { event.preventDefault(); setIsDragging(true); }}
            onDragOver={(event) => { event.preventDefault(); event.dataTransfer.dropEffect = 'copy'; setIsDragging(true); }}
            onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setIsDragging(false); }}
            onDrop={handleDrop}
        >
            <div className="panelLabel">SOURCE</div>
            <button className="primaryAction" onClick={() => imageInputRef.current?.click()} disabled={!isChangeAllowed && !!imageUrl}>
                <span className="buttonIcon">＋</span> Choose image <kbd>U</kbd>
            </button>
            <button className="secondaryAction" onClick={pasteFromClipboard} disabled={!isChangeAllowed && !!imageUrl}>Paste image <kbd>⌘V</kbd></button>
            <input type="file" accept="image/jpeg,image/jpg,image/png,image/webp,image/tiff" ref={imageInputRef} className="hiddenInput" onClick={(e) => { e.currentTarget.value = ""; }} onChange={handleImageChange} />
            <input type="file" accept=".npy,image/png,image/jpeg,image/jpg,image/webp,image/tiff" ref={depthInputRef} className="hiddenInput" onClick={(e) => { e.currentTarget.value = ""; }} onChange={handleDepthImport} />
            {pasteMessage && <div className="pasteMessage">{pasteMessage}</div>}

            <button className="sourcePreview inspectButton" onClick={() => imageUrl && setInspect({url: imageUrl, label: 'Original source'})} disabled={!imageUrl} title={imageUrl ? 'Click to inspect original' : undefined}>
                {imageUrl ? <img src={imageUrl} alt="Source" /> : <div className="emptyPreview"><strong>Drop an image anywhere here</strong><span>or choose, paste, or press U</span></div>}
            </button>
            {sourceMeta && <div className="sourceMeta">{sourceMeta}</div>}

            <div className="depthHeader"><span>{depthSource === 'ai' ? 'AI depth map' : 'Imported depth map'}</span>{depthMapIsLoading && <span className="miniLoader" />}</div>
            <button
                className={`depthPreview inspectButton ${depthEditing ? 'editing' : ''}`}
                onClick={() => !depthEditing && depthMapUrl && setInspect({url: depthMapUrl, label: depthSource === 'ai' ? 'AI depth map' : 'Imported depth map'})}
                onPointerDown={beginDepthStroke}
                onPointerMove={continueDepthStroke}
                onPointerUp={finishDepthStroke}
                onPointerCancel={(event) => { if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId); strokePointsRef.current = []; }}
                disabled={!depthMapUrl}
                title={depthMapUrl ? (depthEditing ? 'Paint directly on the active depth map' : 'Click to inspect depth map') : undefined}
            >
                {depthMapUrl ? <img src={depthMapUrl} alt="Depth map" draggable={false} /> : <div className="depthPlaceholder">{depthMapIsLoading ? (depthSourceMeta || 'Estimating depth…') : (depthSourceMeta || 'Depth estimation appears here')}</div>}
            </button>

            {depthMapUrl && <div className="depthEditorControls">
                <button className={depthEditing ? 'depthEditToggle active' : 'depthEditToggle'} onClick={() => setDepthEditing(value => !value)} disabled={!isChangeAllowed}>{depthEditing ? 'Finish painting depth' : 'Edit depth map'}</button>
                {depthEditing && <>
                    <div className="depthBrushRow">
                        <label><span>Brush</span><select value={brushDirection} onChange={(e) => setBrushDirection(e.target.value as typeof brushDirection)}><option value="lighter">Raise depth value</option><option value="darker">Lower depth value</option></select></label>
                        <label><span>Brush size</span><input type="range" min="1" max="20" value={brushSize} onChange={(e) => setBrushSize(Number(e.target.value))} /><strong>{brushSize}%</strong></label>
                        <label><span>Brush strength</span><input type="range" min="5" max="100" value={brushStrength} onChange={(e) => setBrushStrength(Number(e.target.value))} /><strong>{brushStrength}%</strong></label>
                    </div>
                    <p>Drag directly over the colored depth preview. The editor changes the underlying float32 depth map, not an 8-bit screenshot.</p>
                </>}
                <div className="depthAdjustGrid">
                    <label><span>Black point</span><input type="number" min="0" max="99" value={editBlack} onChange={(e) => setEditBlack(Number(e.target.value))} /><small>%</small></label>
                    <label><span>White point</span><input type="number" min="1" max="100" value={editWhite} onChange={(e) => setEditWhite(Number(e.target.value))} /><small>%</small></label>
                    <label><span>Gamma</span><input type="number" min="0.1" max="5" step="0.05" value={editGamma} onChange={(e) => setEditGamma(Number(e.target.value))} /></label>
                    <label><span>Blur</span><input type="number" min="0" max="100" step="0.5" value={editBlur} onChange={(e) => setEditBlur(Number(e.target.value))} /><small>px</small></label>
                </div>
                {depthEditing && <div className="depthHistoryActions"><button onClick={() => void postDepthEdit({ operation: 'undo' })} disabled={!isChangeAllowed || !canUndoDepth}>Undo</button><button onClick={() => void postDepthEdit({ operation: 'redo' })} disabled={!isChangeAllowed || !canRedoDepth}>Redo</button><span>{depthHistoryCount ? `${depthHistoryPosition} / ${depthHistoryCount} edits` : 'No edits yet'}</span></div>}
                <div className="depthEditActions"><button onClick={applyDepthAdjustments} disabled={!isChangeAllowed || editWhite <= editBlack}>Apply levels / blur</button><button onClick={resetDepthEdits} disabled={!isChangeAllowed || (!canUndoDepth && depthHistoryPosition === 0)}>Reset depth edits</button></div>
            </div>}

            {imageUrl && <div className="depthSourceControls">
                <label><span>Depth source</span><select value={depthSource} disabled={!isChangeAllowed} onChange={(e) => void activateDepthSource(e.target.value as DepthSource)}><option value="ai">AI generated</option><option value="imported">Imported depth map</option></select></label>
                <button className="depthImportAction" onClick={() => depthInputRef.current?.click()} disabled={!isChangeAllowed}>{hasImportedDepth ? 'Replace imported map' : 'Import depth map'}</button>
                {depthSource === 'imported' && <label><span>Aspect matching</span><select value={depthFit} disabled={!isChangeAllowed} onChange={(e) => { const next = e.target.value as DepthFit; setDepthFit(next); void activateDepthSource('imported', next, depthInvert); }}><option value="crop">Crop to fill</option><option value="fit">Fit inside</option><option value="stretch">Stretch to image</option></select></label>}
                <label className="depthCheck"><input type="checkbox" checked={depthInvert} disabled={!isChangeAllowed} onChange={(e) => { const next = e.target.checked; setDepthInvert(next); void activateDepthSource(depthSource, depthFit, next); }} /> Invert near / far</label>
                <p>Imported maps may have different dimensions or aspect ratios. PNG/JPEG/TIFF and float32 .npy are accepted.</p>
                {depthSourceMeta && <div className="depthSourceMeta">{depthSourceMeta}</div>}
            </div>}

            <div className="depthDownloads">
                <button onClick={() => triggerDepthDownload('gray16')} disabled={!depthMapUrl}>16-bit depth PNG</button>
                <button onClick={() => triggerDepthDownload('npy')} disabled={!depthMapUrl}>Raw float32</button>
                <button onClick={() => triggerDepthDownload('color')} disabled={!depthMapUrl}>Color map</button>
            </div>

            <div className="localNote"><strong>{depthSource === 'ai' ? 'Depth Anything V2' : 'Custom depth source'}</strong><span>The original image stays at full resolution. The active depth map drives every 3D technique and can be replaced independently of the visible image.</span></div>

            {isDragging && <div className="dropOverlay"><strong>Drop image</strong><span>Full-resolution original will be retained</span></div>}
            {inspect && <div className="inspectOverlay" role="dialog" aria-label={inspect.label} onClick={() => setInspect(null)}>
                <button className="closeInspect" onClick={() => setInspect(null)}>Close</button>
                <div className="inspectLabel">{inspect.label}</div>
                <img src={inspect.url} alt={inspect.label} onClick={(event) => event.stopPropagation()} />
            </div>}
        </div>
    );
}

export default ImageUpload;