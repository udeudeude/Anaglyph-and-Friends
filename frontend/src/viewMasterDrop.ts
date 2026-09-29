export type DropEye = 'left' | 'right'

export function assignViewMasterDrop(files: File[], mode: 'single' | 'pair', eye: DropEye) {
    if (!files.length) return null
    if (files.some(file => !file.type.startsWith('image/'))) throw new Error('Drop image files only.')
    if (mode === 'single') {
        if (files.length !== 1) throw new Error('Drop one image per scene. Switch to L + R to import two eye images.')
        return { mode: 'single' as const, file: files[0] }
    }
    if (files.length > 2) throw new Error('Drop one eye image or two images (left first, right second).')
    return files.length === 2
        ? { mode: 'pair' as const, left: files[0], right: files[1] }
        : { mode: 'pair' as const, [eye]: files[0] }
}
