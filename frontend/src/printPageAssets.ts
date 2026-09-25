export type PrintPageSourceMetadata = {
    technique: string
    techniqueLabel: string
    settings: Record<string, unknown>
    suggestedArtworkWidthIn?: number
    sourceDpi?: number
}

export type PrintPageIncomingArtwork = {
    file: File
    source: PrintPageSourceMetadata
}
