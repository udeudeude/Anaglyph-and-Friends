export type CropPosition = { x: number; y: number }
export type EyeImage = { url: string; width: number; height: number }
export type StereoPair = { left: EyeImage; right: EyeImage }

export const CENTER_CROP: CropPosition = { x: 0.5, y: 0.5 }

// Coordinates are measured from the top-left of a frame. Both eyes of a scene
// use the same position, so reframing does not introduce a new stereo offset.
export function coverPlacement(sourceWidth: number, sourceHeight: number, frameWidth: number, frameHeight: number, crop: CropPosition) {
    if (![sourceWidth, sourceHeight, frameWidth, frameHeight].every(value => Number.isFinite(value) && value > 0)) {
        throw new Error('View-Master framing requires images and frames with positive dimensions')
    }
    const scale = Math.max(frameWidth / sourceWidth, frameHeight / sourceHeight)
    const width = sourceWidth * scale
    const height = sourceHeight * scale
    const clamp = (value: number) => Math.min(1, Math.max(0, Number.isFinite(value) ? value : 0.5))
    return { x: clamp(crop.x) === 0 ? 0 : (frameWidth - width) * clamp(crop.x), y: clamp(crop.y) === 0 ? 0 : (frameHeight - height) * clamp(crop.y), width, height }
}
