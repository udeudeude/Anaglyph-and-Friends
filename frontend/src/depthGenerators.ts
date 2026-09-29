// Automatic remains on the established V2 adapter. Optional models are explicit.
export const AUTOMATIC_DEPTH_GENERATOR = 'automatic' as const

export const DEPTH_GENERATORS = [
    {
        id: 'depth-anything-v2-small',
        name: 'Depth Anything V2 Small',
        runtimes: ['browser', 'local'],
        depthConvention: 'near-is-high',
    },
    {
        id: 'depth-anything-v3-small',
        name: 'Depth Anything V3 Small',
        runtimes: ['browser'],
        depthConvention: 'near-is-high',
    },
] as const

export type DepthGenerator = (typeof DEPTH_GENERATORS)[number]
export type DepthGeneratorId = DepthGenerator['id']
export type DepthGeneratorSelection = typeof AUTOMATIC_DEPTH_GENERATOR | DepthGeneratorId
export type DepthRuntime = DepthGenerator['runtimes'][number]

const RECOMMENDED_GENERATOR: DepthGeneratorId = 'depth-anything-v2-small'

export function resolveDepthGenerator(selection: DepthGeneratorSelection, runtime: DepthRuntime): DepthGenerator {
    const id = selection === AUTOMATIC_DEPTH_GENERATOR ? RECOMMENDED_GENERATOR : selection
    const generator = DEPTH_GENERATORS.find(candidate => candidate.id === id)
    if (!generator || !generator.runtimes.some(candidate => candidate === runtime)) {
        throw new Error(`Depth generator ${selection} is unavailable in the ${runtime} edition`)
    }
    return generator
}

export function generatorDiffersFromActive(selection: DepthGeneratorSelection, activeSelection: DepthGeneratorSelection, runtime: DepthRuntime): boolean {
    return resolveDepthGenerator(selection, runtime).id !== resolveDepthGenerator(activeSelection, runtime).id
}

export function activeDepthMapPath(selection: DepthGeneratorSelection, runtime: DepthRuntime): string {
    resolveDepthGenerator(selection, runtime)
    // Browser inference has already imported its output into the session.
    // The server's generator query only understands local adapters.
    return runtime === 'browser' ? '/depth-map' : `/depth-map?generator=${selection}`
}
