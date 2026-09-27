// V3 predicts distance, while the stereo pipeline expects nearer pixels brighter.
export function v3InputSize(width: number, height: number, longestSide: number): [number, number] {
    if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
        throw new Error('Image dimensions are invalid')
    }
    const scale = longestSide / Math.max(width, height)
    const divisible = (size: number) => Math.max(14, Math.round(Math.round(size * scale) / 14) * 14)
    return [divisible(width), divisible(height)]
}

export function v3NearPixels(depth: ArrayLike<number>, width: number, height: number): Uint8ClampedArray {
    if (depth.length !== width * height || !width || !height) throw new Error('V3 returned an unexpected depth shape')
    let min = Infinity
    let max = -Infinity
    for (let i = 0; i < depth.length; i += 1) {
        const value = depth[i]
        if (!Number.isFinite(value)) throw new Error('V3 returned non-finite depth values')
        min = Math.min(min, value)
        max = Math.max(max, value)
    }
    const pixels = new Uint8ClampedArray(depth.length * 4)
    const range = max - min
    for (let i = 0; i < depth.length; i += 1) {
        const near = range > 1e-8 ? 255 * (max - depth[i]) / range : 128
        pixels[i * 4] = near
        pixels[i * 4 + 1] = near
        pixels[i * 4 + 2] = near
        pixels[i * 4 + 3] = 255
    }
    return pixels
}
