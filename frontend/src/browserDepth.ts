const TRANSFORMERS_CDN = 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.7.6/+esm'
const MODEL_ID = 'onnx-community/depth-anything-v2-small'

type Progress = (message: string) => void

export type BrowserDepthFailureKind =
    | 'library-download'
    | 'model-download'
    | 'model-startup'
    | 'inference'
    | 'output'

export type BrowserDepthFailureInfo = {
    kind: BrowserDepthFailureKind
    title: string
    detail: string
    technical: string
}

class BrowserDepthError extends Error {
    kind: BrowserDepthFailureKind
    cause?: unknown

    constructor(kind: BrowserDepthFailureKind, message: string, cause?: unknown) {
        super(message)
        this.name = 'BrowserDepthError'
        this.kind = kind
        this.cause = cause
    }
}

let estimatorPromise: Promise<any> | null = null
let estimatorEngine = ''

const errorText = (error: unknown) => {
    if (error instanceof Error) return error.message || error.name
    if (typeof error === 'string') return error
    try {
        return JSON.stringify(error)
    } catch {
        return String(error)
    }
}

const looksLikeDownloadFailure = (error: unknown) => {
    const text = errorText(error).toLowerCase()
    return [
        'failed to fetch',
        'fetch failed',
        'network',
        'networkerror',
        'load failed',
        'loading chunk',
        'dynamically imported module',
        'status 4',
        'status 5',
        '404',
        '403',
        'cdn.jsdelivr',
        'huggingface',
        'resolve/main',
        'could not locate',
        'could not load',
        'download',
    ].some(fragment => text.includes(fragment))
}

export function describeBrowserDepthError(error: unknown): BrowserDepthFailureInfo {
    const technical = errorText(error)
    const kind: BrowserDepthFailureKind = error instanceof BrowserDepthError
        ? error.kind
        : looksLikeDownloadFailure(error)
            ? 'model-download'
            : 'inference'

    if (kind === 'library-download') {
        return {
            kind,
            title: 'Couldn’t load the browser AI',
            detail: 'The AI code could not be downloaded. Check the connection or a content blocker, then retry.',
            technical,
        }
    }
    if (kind === 'model-download') {
        return {
            kind,
            title: 'Couldn’t download the AI depth model',
            detail: 'The source image is still loaded. A stable connection is especially important the first time this browser loads Depth Anything V2.',
            technical,
        }
    }
    if (kind === 'model-startup') {
        return {
            kind,
            title: 'The AI depth model couldn’t start',
            detail: 'WebGPU and the browser CPU fallback were unable to start the model. Retrying may help; if it repeats, this browser or device may be the issue.',
            technical,
        }
    }
    if (kind === 'output') {
        return {
            kind,
            title: 'Depth was calculated, but its image could not be created',
            detail: 'The model ran, but the browser could not convert its result into a usable depth map. Retry once; if it repeats, the technical details can help diagnose it.',
            technical,
        }
    }
    return {
        kind,
        title: 'The AI model loaded, but depth calculation failed',
        detail: 'This is later than a model-download failure. Retry once; if it repeats on the same image, import a depth map while we diagnose the browser/device issue.',
        technical,
    }
}

async function createEstimator(progress?: Progress) {
    if (estimatorPromise) return estimatorPromise
    estimatorPromise = (async () => {
        progress?.('Loading browser AI… first use may need a one-time model download')
        const moduleUrl: string = TRANSFORMERS_CDN
        let transformers: any
        try {
            transformers = await import(/* @vite-ignore */ moduleUrl)
        } catch (error) {
            throw new BrowserDepthError('library-download', 'Failed to download the browser AI library', error)
        }

        progress?.('Loading Depth Anything V2 model…')
        const hasWebGpu = typeof navigator !== 'undefined' && 'gpu' in navigator
        let webGpuError: unknown = null
        if (hasWebGpu) {
            try {
                estimatorEngine = 'WebGPU'
                return await transformers.pipeline('depth-estimation', MODEL_ID, {
                    device: 'webgpu',
                    dtype: 'q4f16',
                    progress_callback: (info: any) => {
                        if (info?.status === 'progress' && typeof info.progress === 'number') {
                            progress?.(`Loading AI model… ${Math.round(info.progress)}%`)
                        }
                    },
                })
            } catch (error) {
                webGpuError = error
                console.warn('WebGPU depth model failed; falling back to browser CPU', error)
            }
        }

        estimatorEngine = 'browser CPU'
        progress?.(hasWebGpu ? 'WebGPU unavailable here · trying browser CPU…' : 'Starting browser CPU depth model…')
        try {
            return await transformers.pipeline('depth-estimation', MODEL_ID, {
                progress_callback: (info: any) => {
                    if (info?.status === 'progress' && typeof info.progress === 'number') {
                        progress?.(`Loading AI model… ${Math.round(info.progress)}%`)
                    }
                },
            })
        } catch (error) {
            const combined = webGpuError
                ? `WebGPU: ${errorText(webGpuError)}; CPU: ${errorText(error)}`
                : errorText(error)
            const kind: BrowserDepthFailureKind = looksLikeDownloadFailure(error) || looksLikeDownloadFailure(webGpuError)
                ? 'model-download'
                : 'model-startup'
            throw new BrowserDepthError(kind, combined, error)
        }
    })()

    try {
        return await estimatorPromise
    } catch (error) {
        estimatorPromise = null
        estimatorEngine = ''
        throw error
    }
}

function depthToPng(depth: any): Promise<Blob> {
    const width = Number(depth?.width)
    const height = Number(depth?.height)
    const data = depth?.data as Uint8Array | Uint8ClampedArray | undefined
    if (!width || !height || !data) throw new Error('Browser depth model returned an unreadable depth image')

    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const context = canvas.getContext('2d')
    if (!context) throw new Error('Canvas is unavailable for browser depth estimation')

    const imageData = context.createImageData(width, height)
    const pixels = imageData.data
    const pixelCount = width * height

    if (data.length === pixelCount * 4) {
        pixels.set(data)
    } else if (data.length === pixelCount * 3) {
        for (let i = 0; i < pixelCount; i += 1) {
            pixels[i * 4] = data[i * 3]
            pixels[i * 4 + 1] = data[i * 3 + 1]
            pixels[i * 4 + 2] = data[i * 3 + 2]
            pixels[i * 4 + 3] = 255
        }
    } else {
        for (let i = 0; i < pixelCount; i += 1) {
            const value = data[i] ?? 0
            pixels[i * 4] = value
            pixels[i * 4 + 1] = value
            pixels[i * 4 + 2] = value
            pixels[i * 4 + 3] = 255
        }
    }

    context.putImageData(imageData, 0, 0)
    return new Promise((resolve, reject) => {
        canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('Could not encode browser depth map')), 'image/png')
    })
}

export const hostedBrowserDepthEnabled = () => {
    if (!import.meta.env.PROD || typeof window === 'undefined') return false
    const host = window.location.hostname.toLowerCase()
    return !['localhost', '127.0.0.1', '::1'].includes(host)
}

export async function generateBrowserDepth(file: File, progress?: Progress): Promise<{ file: File; engine: string }> {
    const estimator = await createEstimator(progress)
    progress?.(`Estimating depth on this device (${estimatorEngine})…`)
    const sourceUrl = URL.createObjectURL(file)
    try {
        let result: any
        try {
            result = await estimator(sourceUrl)
        } catch (error) {
            throw new BrowserDepthError('inference', 'Depth inference failed after the model loaded', error)
        }

        let blob: Blob
        try {
            blob = await depthToPng(result.depth)
        } catch (error) {
            throw new BrowserDepthError('output', 'Depth output could not be converted to PNG', error)
        }

        return {
            file: new File([blob], 'browser-depth-anything-v2.png', { type: 'image/png' }),
            engine: estimatorEngine,
        }
    } finally {
        URL.revokeObjectURL(sourceUrl)
    }
}
