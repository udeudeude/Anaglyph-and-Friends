import type { DepthGeneratorSelection } from './depthGenerators';
import type { OutputRecipe } from './techniqueOutput';
import type { ZipEntry } from './batchZip';

export type BatchDepthSettings = { generator: DepthGeneratorSelection; invert: boolean };
export type BatchRecipe = OutputRecipe & { depth: BatchDepthSettings; capturedAt: string };
export type BatchInput = { file: File; path: string };

// Match the still-image formats accepted by the backend, rather than image/*
// (which also admits unsupported HEIC, SVG, and animated GIF files).
const imageExtension = /\.(bmp|dib|jpe?g|jpe|jp2|png|webp|pbm|pgm|ppm|pxm|pnm|sr|ras|tiff?|exr|hdr|pic)$/i;
export const batchImageAccept = '.jpg,.jpeg,.png,.webp,.tif,.tiff,.bmp,.jp2';
export const isBatchImage = (path: string) => imageExtension.test(path);

export function cleanRelativePath(path: string) {
    return path.split(/[\\/]/).filter(part => part && part !== '.' && part !== '..')
        .map(part => Array.from(part).map(char => char.charCodeAt(0) < 32 || ':*?"<>|'.includes(char) ? '_' : char).join('')).join('/') || 'image';
}

export function uniqueOutputPath(source: string, suffix: string, used: Set<string>) {
    const clean = cleanRelativePath(source).replace(/\.[^/.]+$/, '');
    const extension = suffix.slice(suffix.lastIndexOf('.'));
    const stem = `${clean}--${suffix.slice(0, -extension.length)}`;
    let result = stem + extension;
    let count = 2;
    while (used.has(result.toLowerCase())) result = `${stem}-${count++}${extension}`;
    used.add(result.toLowerCase());
    return result;
}

export function selectBatchInputs(inputs: BatchInput[]) {
    let skipped = 0;
    const images = inputs.filter(({ path }) => {
        const hidden = path.split('/').some(part => part.startsWith('.') || part === '__MACOSX');
        if (hidden || !isBatchImage(path)) { skipped++; return false; }
        return true;
    }).sort((a, b) => a.path.localeCompare(b.path, undefined, { numeric: true, sensitivity: 'base' }));
    return { images, skipped };
}

type DropEntry = {
    name: string;
    isFile: boolean;
    isDirectory: boolean;
    file: (success: (file: File) => void, error: (error: DOMException) => void) => void;
    createReader: () => { readEntries: (success: (entries: DropEntry[]) => void, error: (error: DOMException) => void) => void };
};

export async function collectDroppedImages(transfer: DataTransfer): Promise<BatchInput[]> {
    // Read entries synchronously: browsers invalidate DataTransfer after the drop
    // handler returns. Directory readers return chunks, sometimes only 100 files.
    const entries = Array.from(transfer.items || []).filter(item => item.kind === 'file')
        .map(item => item.webkitGetAsEntry?.() as DropEntry | null);
    const fallback = Array.from(transfer.files).map(file => ({ file, path: file.webkitRelativePath || file.name }));
    if (!entries.length || entries.some(entry => !entry)) return fallback;
    const files: BatchInput[] = [];
    async function visit(entry: DropEntry, parent: string) {
        if (entry.name.startsWith('.') || entry.name === '__MACOSX') return;
        const path = parent + entry.name;
        if (entry.isFile) {
            const file = await new Promise<File>((resolve, reject) => entry.file(resolve, reject));
            files.push({ file, path });
        } else if (entry.isDirectory) {
            const reader = entry.createReader();
            while (true) {
                const chunk = await new Promise<DropEntry[]>((resolve, reject) => reader.readEntries(resolve, reject));
                if (!chunk.length) break;
                for (const child of chunk) await visit(child, path + '/');
            }
        }
    }
    for (const entry of entries) await visit(entry!, '');
    return files;
}

export async function batchRequest(url: string, workspace: string, options: RequestInit = {}) {
    const response = await fetch(url, {
        ...options, credentials: 'include', headers: { ...options.headers, 'X-AAF-Workspace': workspace },
    });
    if (!response.ok) {
        const message = await response.json().catch(() => null);
        throw new Error(message?.error || `The app returned ${response.status}. Retry this photo.`);
    }
    return response;
}

export type BatchStatus = 'queued' | 'working' | 'done' | 'error';
export type BatchItem = BatchInput & {
    id: number;
    outputPath: string;
    status: BatchStatus;
    message: string;
    output?: Blob;
    depthMap?: Blob;
};

export function batchArchiveEntries(items: BatchItem[], recipe: BatchRecipe, includeDepthMaps: boolean): ZipEntry[] {
    const complete = items.filter(item => item.status === 'done' && item.output);
    const entries = complete.map(item => ({ name: `photos/${item.outputPath}`, blob: item.output! }));
    const depthPath = (item: BatchItem) => `depth-maps/${item.outputPath.replace(/\.[^/.]+$/, '--depth.png')}`;
    if (includeDepthMaps) for (const item of complete) {
        if (!item.depthMap) throw new Error(`The depth map for ${item.file.name} is missing. Retry this photo before including depth maps.`);
        entries.push({ name: depthPath(item), blob: item.depthMap });
    }
    const manifest = { application: 'Anaglyph & Friends', recipe, includeDepthMaps,
        results: items.map(item => ({ source: item.path, output: item.status === 'done' ? `photos/${item.outputPath}` : null,
            depthMap: includeDepthMaps && item.status === 'done' ? depthPath(item) : null,
            status: item.status, error: item.status === 'error' ? item.message : undefined })) };
    entries.push({ name: 'batch-settings.json', blob: new Blob([JSON.stringify(manifest, null, 2)], { type: 'application/json' }) });
    return entries;
}

// Pure queue coordinator: a failure belongs to its photo, and pause never
// abandons an in-flight image or repeats already completed work on resume.
export async function runBatchQueue(
    items: BatchItem[],
    process: (item: BatchItem) => Promise<Blob>,
    shouldPause: () => boolean,
    update: (item: BatchItem) => void,
) {
    for (const item of items) {
        if (shouldPause()) break;
        if (item.status !== 'queued') continue;
        item.status = 'working'; item.message = 'Loading photo…'; update(item);
        try {
            item.output = await process(item);
            item.status = 'done'; item.message = 'Ready to download';
        } catch (error) {
            item.status = 'error'; item.message = error instanceof Error ? error.message : 'Could not process this photo.';
        }
        update(item);
    }
}
