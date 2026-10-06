export type ImagePoint = { x: number; y: number }

// Account for contain/letterboxing. The bounding rectangle includes zoom/pan.
export function pointInContainedImage(
    clientX: number, clientY: number,
    rect: { left: number; top: number; width: number; height: number },
    naturalWidth: number, naturalHeight: number,
): ImagePoint | null {
    if (naturalWidth <= 0 || naturalHeight <= 0 || rect.width <= 0 || rect.height <= 0) return null
    const scale = Math.min(rect.width / naturalWidth, rect.height / naturalHeight)
    const width = naturalWidth * scale, height = naturalHeight * scale
    const x = (clientX - rect.left - (rect.width - width) / 2) / width
    const y = (clientY - rect.top - (rect.height - height) / 2) / height
    return Number.isFinite(x) && Number.isFinite(y) && x >= 0 && x <= 1 && y >= 0 && y <= 1 ? { x, y } : null
}

export function screenDepthParameters(value: number | null): Record<string, string> {
    return value === null ? {} : { screen_depth: String(value) }
}
