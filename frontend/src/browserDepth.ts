const TRANSFORMERS_CDN = 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.7.6/+esm'
const MODEL_ID = 'onnx-community/depth-anything-v2-small'

type Progress = (message: string) => void

let estimatorPromise: Promise<any> | null = null
let estimatorEngine = ''

async function createEstimator(progress?: Progress) {
    if (estimatorPromise) return estimatorPromise
    estimatorPromise = (async () => {
        progress?.('Loading Depth Anything V2 into this browser…')
        const moduleUrl: string = TRANSFORMERS_CDN
        const transformers: any = await import(/* @vite-ignore */ moduleUrl)
        const hasWebGpu = typeof navigator !== 'undefined' && 'gpu' in navigator
        if (hasWebGpu) {
            try {
                estimatorEngine = 'WebGPU'
                return await transformers.pipeline('depth-estimation', MODEL_ID, {
                    device: 'webgpu',
                    dtype: 'q4f16',
                    progress_callback: (info: any) => {
                        if (info?.status === 'progress' && typeof info.progress === 'number') {
                            progress?.(`Loading browser AI… ${Math.round(info.progress)}%`)
                        }
                    },
                })
            } catch (error) {
                console.warn('WebGPU depth model failed; falling back to browser CPU', error)
                estimatorPromise = null
            }
        }
        estimatorEngine = 'browser CPU'
        return transformers.pipeline('depth-estimation', MODEL_ID, {
            progress_callback: (info: any) => {
                if (info?.status === 'progress' && typeof info.progress === 'number') {
                    progress?.(`Loading browser AI… ${Math.round(info.progress)}%`)
                }
            },
        })
    })()
    try {
        return await estimatorPromise
    } catch (error) {
        estimatorPromise = null
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

export const hostedBrowserDepthEnabled = () => import.meta.env.PROD && import.meta.env.VITE_FLASK_BACKEND_API_URL === '.'

export async function generateBrowserDepth(file: File, progress?: Progress): Promise<{ file: File; engine: string }> {
    const estimator = await createEstimator(progress)
    progress?.(`Estimating depth on this device (${estimatorEngine})…`)
    const sourceUrl = URL.createObjectURL(file)
    try {
        const result = await estimator(sourceUrl)
        const blob = await depthToPng(result.depth)
        return {
            file: new File([blob], 'browser-depth-anything-v2.png', { type: 'image/png' }),
            engine: estimatorEngine,
        }
    } finally {
        URL.revokeObjectURL(sourceUrl)
    }
}
