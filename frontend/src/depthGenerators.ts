// Only generators with a verified adapter belong here. Candidates under
// investigation are documented in the roadmap, not offered as working options.
export const AUTOMATIC_DEPTH_GENERATOR = 'automatic' as const

export const DEPTH_GENERATORS = [
    {
        id: 'depth-anything-v2-small',
        name: 'Depth Anything V2 Small',
        runtimes: ['browser', 'local'],
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
