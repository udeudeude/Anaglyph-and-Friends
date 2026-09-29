export type DepthImage = { width: number; height: number; values: Float32Array }

// The active depth map is saved by the backend as a little-endian NumPy float32 array.
export function readDepthNpy(buffer: ArrayBuffer): DepthImage {
    const bytes = new Uint8Array(buffer)
    if (String.fromCharCode(...bytes.slice(0, 6)) !== '\x93NUMPY') throw new Error('The active depth map is not a NumPy image.')
    const major = bytes[6]
    const headerLength = major === 1 ? bytes[8] | (bytes[9] << 8) : major === 2 || major === 3 ? new DataView(buffer).getUint32(8, true) : 0
    if (!headerLength) throw new Error('Unsupported depth-map version.')
    const offset = major === 1 ? 10 : 12
    const header = new TextDecoder().decode(bytes.subarray(offset, offset + headerLength))
    const shape = header.match(/'shape':\s*\(\s*(\d+)\s*,\s*(\d+)\s*\)/)
    if (!shape || !/'descr':\s*['"](?:<f4|=f4)['"]/.test(header) || /'fortran_order':\s*True/.test(header)) throw new Error('Expected a two-dimensional float32 depth map.')
    const height = Number(shape[1]), width = Number(shape[2])
    if (!width || !height || width * height > 60_000_000 || offset + headerLength + width * height * 4 > buffer.byteLength) throw new Error('The depth-map dimensions are invalid.')
    const view = new DataView(buffer, offset + headerLength)
    const values = new Float32Array(width * height)
    for (let i = 0; i < values.length; i += 1) values[i] = view.getFloat32(i * 4, true)
    return { width, height, values }
}

const assignSheet = (value: number, count: number, cutoff: number, reverse: boolean): number => {
    const near = Math.max(0, Math.min(1, reverse ? 1 - (Number.isFinite(value) ? value : 0) : Number.isFinite(value) ? value : 0))
    if (near <= cutoff) return count - 1
    return Math.min(count - 2, Math.floor(((1 - near) / (1 - cutoff)) * (count - 1)))
}

export function sheetForDepth(value: number, count: number, backgroundCutoff: number, reverse = false): number {
    if (!Number.isInteger(count) || count < 2 || count > 10) throw new Error('Choose 2 to 10 sheets.')
    return assignSheet(value, count, Math.max(0, Math.min(.95, backgroundCutoff)), reverse)
}

export function isolateSheet(source: ImageData, depth: DepthImage, index: number, count: number, backgroundCutoff: number, reverse = false): ImageData {
    const { width, height } = source
    if (index < 0 || index >= count) throw new Error('Sheet index is outside the stack.')
    if (!Number.isInteger(count) || count < 2 || count > 10) throw new Error('Choose 2 to 10 sheets.')
    const cutoff = Math.max(0, Math.min(.95, backgroundCutoff))
    const output = new ImageData(width, height)
    for (let y = 0; y < height; y += 1) {
        const depthY = Math.min(depth.height - 1, Math.floor((y + .5) * depth.height / height))
        for (let x = 0; x < width; x += 1) {
            const depthX = Math.min(depth.width - 1, Math.floor((x + .5) * depth.width / width))
            const pixel = (y * width + x) * 4
            if (assignSheet(depth.values[depthY * depth.width + depthX], count, cutoff, reverse) !== index) continue
            output.data.set(source.data.subarray(pixel, pixel + 4), pixel)
        }
    }
    return output
}
