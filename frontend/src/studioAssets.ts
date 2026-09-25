export type StereoPairDraft = {
    left: File | null
    right: File | null
    depth?: File | null
}

export type StereoPairFiles = {
    left: File
    right: File
}

export type StudioSource =
    | { kind: 'single'; file: File }
    | { kind: 'pair'; left: File; right: File }

export const isCompletePair = (pair: StereoPairDraft): pair is StereoPairFiles => !!pair.left && !!pair.right
