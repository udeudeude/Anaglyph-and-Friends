import * as ort from 'onnxruntime-web/webgpu'
import { BrowserDepthError } from './browserDepth'
import { v3InputSize, v3NearPixels } from './depthV3Math'

// Pinned ONNX Community export of Apache-2.0 DA3-SMALL. The 100 MB weights
// stay on the model host and download only when V3 is explicitly selected.
const MODEL_BASE = 'https://huggingface.co/onnx-community/depth-anything-v3-small/resolve/7764f5829b7429e7ecfa0a9c908a6e0facb65a24/onnx/'
const MODEL_URL = `${MODEL_BASE}model.onnx`
const EXTERNAL_URL = `${MODEL_BASE}model.onnx_data`
ort.env.wasm.wasmPaths = 'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.23.2/dist/'

type Progress = (message: string) => void
type Engine = 'WebGPU' | 'browser CPU'
let sessionPromise: Promise<{ session: ort.InferenceSession; engine: Engine }> | null = null

function errorText(error: unknown): string {
    return error instanceof Error ? error.message : String(error)
}

async function createSession(progress?: Progress) {
    if (!sessionPromise) sessionPromise = (async () => {
        const options = {
            externalData: [{ path: 'model.onnx_data', data: EXTERNAL_URL }],
        }
        let gpuFailure: unknown
        if (typeof navigator !== 'undefined' && 'gpu' in navigator) {
            progress?.('Loading Depth Anything V3 model (about 105 MB on first use)…')
            try {
                return { session: await ort.InferenceSession.create(MODEL_URL, {
                    ...options, executionProviders: ['webgpu'],
                }), engine: 'WebGPU' as const }
            } catch (error) {
                gpuFailure = error
                console.warn('V3 WebGPU startup failed; trying browser CPU', error)
            }
        }
        progress?.('Starting Depth Anything V3 on browser CPU…')
        try {
            return { session: await ort.InferenceSession.create(MODEL_URL, {
                ...options, executionProviders: ['wasm'],
            }), engine: 'browser CPU' as const }
        } catch (error) {
            const detail = `${gpuFailure ? `WebGPU: ${errorText(gpuFailure)}; ` : ''}CPU: ${errorText(error)}`
            const kind = /fetch|network|download|404|403|external data|failed to load/i.test(detail)
                ? 'model-download' : 'model-startup'
            throw new BrowserDepthError(kind, detail, error)
        }
    })()
    try {
        return await sessionPromise
    } catch (error) {
        sessionPromise = null
        throw error
    }
}

async function imageTensor(file: File, longestSide: number): Promise<{ tensor: ort.Tensor; width: number; height: number }> {
    const bitmap = await createImageBitmap(file)
    try {
        const [width, height] = v3InputSize(bitmap.width, bitmap.height, longestSide)
        const canvas = document.createElement('canvas')
        canvas.width = width
        canvas.height = height
        const context = canvas.getContext('2d', { willReadFrequently: true })
        if (!context) throw new Error('Canvas is unavailable for V3 image preprocessing')
        context.drawImage(bitmap, 0, 0, width, height)
        const rgba = context.getImageData(0, 0, width, height).data
        const count = width * height
        const pixels = new Float32Array(count * 3)
        const mean = [0.485, 0.456, 0.406]
        const std = [0.229, 0.224, 0.225]
        for (let i = 0; i < count; i += 1) {
            for (let channel = 0; channel < 3; channel += 1) {
                pixels[channel * count + i] = (rgba[i * 4 + channel] / 255 - mean[channel]) / std[channel]
            }
        }
        return { tensor: new ort.Tensor('float32', pixels, [1, 1, 3, height, width]), width, height }
    } finally {
        bitmap.close()
    }
}

async function depthPng(values: ArrayLike<number>, width: number, height: number): Promise<Blob> {
    const pixels = v3NearPixels(values, width, height)
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const context = canvas.getContext('2d')
    if (!context) throw new Error('Canvas is unavailable for V3 depth output')
    context.putImageData(new ImageData(pixels, width, height), 0, 0)
    return new Promise((resolve, reject) => canvas.toBlob(
        blob => blob ? resolve(blob) : reject(new Error('Could not encode V3 depth map')), 'image/png'))
}

export async function generateV3Depth(file: File, progress?: Progress, generator = 'Depth Anything V3 Small') {
    const { session, engine } = await createSession(progress)
    progress?.(`Estimating depth on this device (${engine})…`)
    let input: Awaited<ReturnType<typeof imageTensor>>
    try {
        input = await imageTensor(file, engine === 'WebGPU' ? 504 : 252)
    } catch (error) {
        throw new BrowserDepthError('inference', 'V3 could not read the source image', error)
    }
    let result: ort.InferenceSession.OnnxValueMapType
    try {
        result = await session.run({ pixel_values: input.tensor })
    } catch (error) {
        throw new BrowserDepthError('inference', 'V3 inference failed after the model loaded', error)
    } finally {
        input.tensor.dispose()
    }
    try {
        const depth = result.predicted_depth
        if (!depth || depth.dims.join(',') !== `1,1,${input.height},${input.width}`) {
            throw new Error(`Unexpected V3 output dimensions: ${depth?.dims}`)
        }
        const blob = await depthPng(depth.data as Float32Array, input.width, input.height)
        return { file: new File([blob], 'browser-depth-anything-v3.png', { type: 'image/png' }), engine, generator }
    } catch (error) {
        throw new BrowserDepthError('output', 'V3 depth output could not be converted to PNG', error)
    } finally {
        for (const output of Object.values(result)) output.dispose()
    }
}
