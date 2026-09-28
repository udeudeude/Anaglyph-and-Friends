export type ModelTriangle = {
    a: [number, number, number]
    b: [number, number, number]
    c: [number, number, number]
    color: [number, number, number]
}

export type ModelMesh = {
    name: string
    triangles: ModelTriangle[]
}

export function makePhantogramTestBlock(): ModelMesh {
    const faces: { corners: [number, number, number][]; color: [number, number, number] }[] = [
        { corners: [[-.5, -.5, 1], [.5, -.5, 1], [.5, .5, 1], [-.5, .5, 1]], color: [238, 238, 238] },
        { corners: [[-.5, -.5, 0], [.5, -.5, 0], [.5, -.5, 1], [-.5, -.5, 1]], color: [92, 92, 92] },
        { corners: [[.5, -.5, 0], [.5, .5, 0], [.5, .5, 1], [.5, -.5, 1]], color: [155, 155, 155] },
        { corners: [[.5, .5, 0], [-.5, .5, 0], [-.5, .5, 1], [.5, .5, 1]], color: [112, 112, 112] },
        { corners: [[-.5, .5, 0], [-.5, -.5, 0], [-.5, -.5, 1], [-.5, .5, 1]], color: [175, 175, 175] },
    ]
    const triangles: ModelTriangle[] = []
    for (const { corners: [a, b, c, d], color } of faces) {
        triangles.push({ a, b, c, color }, { a, b: c, c: d, color })
    }
    return { name: 'Geometric print test cube', triangles }
}

export type ModelPhantogramSettings = {
    widthIn: number
    heightIn: number
    dpi: number
    viewDistanceIn: number
    eyeHeightIn: number
    ipdMm: number
    reliefMm: number
    glasses: 'red-cyan' | 'red-green' | 'red-blue'
    rotateX: number
    rotateY: number
    rotateZ: number
    footprintPct: number
}

type Vec3 = [number, number, number]
type Mat4 = number[]
type GlbNode = {
    matrix?: number[]
    translation?: Vec3
    scale?: Vec3
    rotation?: [number, number, number, number]
    mesh?: number
    children?: number[]
}
type GlbDocument = {
    accessors?: { bufferView?: number; componentType: number; type: string; count: number; byteOffset?: number }[]
    bufferViews?: { byteStride?: number; byteOffset?: number }[]
    materials?: { pbrMetallicRoughness?: { baseColorFactor?: number[] } }[]
    scene?: number
    scenes?: { nodes?: number[] }[]
    nodes?: GlbNode[]
    meshes?: { primitives?: { mode?: number; attributes?: { POSITION: number }; indices?: number; material?: number }[] }[]
}

const identity = (): Mat4 => [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]
const multiply = (a: Mat4, b: Mat4): Mat4 => {
    const out = new Array<number>(16).fill(0)
    for (let row = 0; row < 4; row += 1) for (let col = 0; col < 4; col += 1) {
        for (let k = 0; k < 4; k += 1) out[row * 4 + col] += a[row * 4 + k] * b[k * 4 + col]
    }
    return out
}
const transformPoint = (m: Mat4, p: Vec3): Vec3 => {
    const [x, y, z] = p
    return [
        m[0] * x + m[1] * y + m[2] * z + m[3],
        m[4] * x + m[5] * y + m[6] * z + m[7],
        m[8] * x + m[9] * y + m[10] * z + m[11],
    ]
}
const nodeMatrix = (node: GlbNode): Mat4 => {
    if (Array.isArray(node.matrix) && node.matrix.length === 16) {
        const c = node.matrix as number[]
        return [c[0], c[4], c[8], c[12], c[1], c[5], c[9], c[13], c[2], c[6], c[10], c[14], c[3], c[7], c[11], c[15]]
    }
    const [tx, ty, tz] = node.translation || [0, 0, 0]
    const [sx, sy, sz] = node.scale || [1, 1, 1]
    const [qx, qy, qz, qw] = node.rotation || [0, 0, 0, 1]
    const xx = qx * qx, yy = qy * qy, zz = qz * qz
    const xy = qx * qy, xz = qx * qz, yz = qy * qz
    const wx = qw * qx, wy = qw * qy, wz = qw * qz
    return [
        (1 - 2 * (yy + zz)) * sx, (2 * (xy - wz)) * sy, (2 * (xz + wy)) * sz, tx,
        (2 * (xy + wz)) * sx, (1 - 2 * (xx + zz)) * sy, (2 * (yz - wx)) * sz, ty,
        (2 * (xz - wy)) * sx, (2 * (yz + wx)) * sy, (1 - 2 * (xx + yy)) * sz, tz,
        0, 0, 0, 1,
    ]
}

const decodeText = (bytes: Uint8Array) => new TextDecoder().decode(bytes).replace(/\0+$/g, '')
const clampByte = (value: number) => Math.max(0, Math.min(255, Math.round(value)))

function parseObj(text: string, name: string): ModelMesh {
    const vertices: Vec3[] = []
    const triangles: ModelTriangle[] = []
    const color: [number, number, number] = [190, 198, 210]
    for (const raw of text.split(/\r?\n/)) {
        const line = raw.trim()
        if (!line || line.startsWith('#')) continue
        const parts = line.split(/\s+/)
        if (parts[0] === 'v' && parts.length >= 4) vertices.push([Number(parts[1]), Number(parts[2]), Number(parts[3])])
        if (parts[0] === 'f' && parts.length >= 4) {
            const indices = parts.slice(1).map(token => {
                const value = Number(token.split('/')[0])
                return value < 0 ? vertices.length + value : value - 1
            })
            for (let i = 1; i < indices.length - 1; i += 1) {
                const a = vertices[indices[0]], b = vertices[indices[i]], c = vertices[indices[i + 1]]
                if (a && b && c) triangles.push({ a: [...a], b: [...b], c: [...c], color })
            }
        }
    }
    if (!triangles.length) throw new Error('OBJ contains no triangle faces')
    return { name, triangles }
}

function parseStl(buffer: ArrayBuffer, name: string): ModelMesh {
    const bytes = new Uint8Array(buffer)
    const view = new DataView(buffer)
    const binaryCount = buffer.byteLength >= 84 ? view.getUint32(80, true) : 0
    const binarySize = 84 + binaryCount * 50
    const color: [number, number, number] = [190, 198, 210]
    const triangles: ModelTriangle[] = []
    if (binaryCount > 0 && binarySize === buffer.byteLength) {
        let offset = 84
        for (let i = 0; i < binaryCount; i += 1) {
            offset += 12
            const read = (): Vec3 => {
                const p: Vec3 = [view.getFloat32(offset, true), view.getFloat32(offset + 4, true), view.getFloat32(offset + 8, true)]
                offset += 12
                return p
            }
            const a = read(), b = read(), c = read()
            offset += 2
            triangles.push({ a, b, c, color })
        }
    } else {
        const text = decodeText(bytes)
        const values = [...text.matchAll(/vertex\s+([-+\deE.]+)\s+([-+\deE.]+)\s+([-+\deE.]+)/gi)].map(match => [Number(match[1]), Number(match[2]), Number(match[3])] as Vec3)
        for (let i = 0; i + 2 < values.length; i += 3) triangles.push({ a: values[i], b: values[i + 1], c: values[i + 2], color })
    }
    if (!triangles.length) throw new Error('STL contains no triangles')
    return { name, triangles }
}

function parseGlb(buffer: ArrayBuffer, name: string): ModelMesh {
    const view = new DataView(buffer)
    if (view.getUint32(0, true) !== 0x46546c67 || view.getUint32(4, true) !== 2) throw new Error('Only GLB 2.0 files are supported')
    let offset = 12
    let json: GlbDocument | null = null
    let binary: ArrayBuffer | null = null
    while (offset + 8 <= buffer.byteLength) {
        const length = view.getUint32(offset, true)
        const type = view.getUint32(offset + 4, true)
        const start = offset + 8
        if (type === 0x4e4f534a) json = JSON.parse(decodeText(new Uint8Array(buffer, start, length))) as GlbDocument
        if (type === 0x004e4942) binary = buffer.slice(start, start + length)
        offset = start + length
    }
    if (!json || !binary) throw new Error('GLB must contain embedded JSON and binary chunks')
    const binView = new DataView(binary)
    const componentInfo: Record<number, { bytes: number; read: (offset: number) => number }> = {
        5120: { bytes: 1, read: o => binView.getInt8(o) }, 5121: { bytes: 1, read: o => binView.getUint8(o) },
        5122: { bytes: 2, read: o => binView.getInt16(o, true) }, 5123: { bytes: 2, read: o => binView.getUint16(o, true) },
        5125: { bytes: 4, read: o => binView.getUint32(o, true) }, 5126: { bytes: 4, read: o => binView.getFloat32(o, true) },
    }
    const typeCount: Record<string, number> = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 }
    const accessorValues = (index: number | undefined): number[][] => {
        const accessor = index === undefined ? undefined : json.accessors?.[index]
        if (!accessor || accessor.bufferView === undefined) throw new Error('Sparse or missing GLB accessors are not supported')
        const bufferView = json.bufferViews?.[accessor.bufferView]
        const info = componentInfo[accessor.componentType]
        const components = typeCount[accessor.type]
        if (!bufferView || !info || !components) throw new Error('Unsupported GLB accessor format')
        const stride = bufferView.byteStride || info.bytes * components
        const base = (bufferView.byteOffset || 0) + (accessor.byteOffset || 0)
        return Array.from({ length: accessor.count }, (_, item) => Array.from({ length: components }, (_, component) => info.read(base + item * stride + component * info.bytes)))
    }
    const materials = (json.materials || []).map(material => {
        const f = material.pbrMetallicRoughness?.baseColorFactor || [0.75, 0.78, 0.82, 1]
        return [clampByte(f[0] * 255), clampByte(f[1] * 255), clampByte(f[2] * 255)] as [number, number, number]
    })
    const triangles: ModelTriangle[] = []
    const sceneIndex = json.scene ?? 0
    const roots = json.scenes?.[sceneIndex]?.nodes || json.nodes?.map((_node, index) => index) || []
    const visit = (nodeIndex: number, parent: Mat4) => {
        const node = json.nodes?.[nodeIndex] || {}
        const world = multiply(parent, nodeMatrix(node))
        if (node.mesh !== undefined) {
            const mesh = json.meshes?.[node.mesh]
            for (const primitive of mesh?.primitives || []) {
                if (primitive.mode !== undefined && primitive.mode !== 4) continue
                // glTF is Y-up. The print renderer is Z-up, with the asset's
                // +Z front facing the near edge of the print (negative Y).
                const positions = accessorValues(primitive.attributes?.POSITION).map(v => {
                    const [x, y, z] = transformPoint(world, [v[0], v[1], v[2]])
                    return [x, -z || 0, y] as Vec3
                })
                const indices = primitive.indices !== undefined ? accessorValues(primitive.indices).map(v => v[0]) : positions.map((_v, index) => index)
                const color = materials[primitive.material ?? -1] || [190, 198, 210]
                for (let i = 0; i + 2 < indices.length; i += 3) {
                    const a = positions[indices[i]], b = positions[indices[i + 1]], c = positions[indices[i + 2]]
                    if (a && b && c) triangles.push({ a, b, c, color })
                }
            }
        }
        for (const child of node.children || []) visit(child, world)
    }
    for (const root of roots) visit(root, identity())
    if (!triangles.length) throw new Error('GLB contains no supported triangle meshes')
    return { name, triangles }
}

export async function parseModelFile(file: File): Promise<ModelMesh> {
    const lower = file.name.toLowerCase()
    const buffer = await file.arrayBuffer()
    if (lower.endsWith('.obj')) return parseObj(decodeText(new Uint8Array(buffer)), file.name)
    if (lower.endsWith('.stl')) return parseStl(buffer, file.name)
    if (lower.endsWith('.glb')) return parseGlb(buffer, file.name)
    throw new Error('Supported model formats are .glb, .obj, and .stl')
}

const radians = (degrees: number) => degrees * Math.PI / 180
const rotatePoint = (p: Vec3, rx: number, ry: number, rz: number): Vec3 => {
    let [x, y, z] = p
    const cx = Math.cos(rx), sx = Math.sin(rx), cy = Math.cos(ry), sy = Math.sin(ry), cz = Math.cos(rz), sz = Math.sin(rz)
    ;[y, z] = [y * cx - z * sx, y * sx + z * cx]
    ;[x, z] = [x * cy + z * sy, -x * sy + z * cy]
    ;[x, y] = [x * cz - y * sz, x * sz + y * cz]
    return [x, y, z]
}

export function prepareTriangles(mesh: ModelMesh, settings: ModelPhantogramSettings): ModelTriangle[] {
    const rx = radians(settings.rotateX), ry = radians(settings.rotateY), rz = radians(settings.rotateZ)
    const rotated = mesh.triangles.map(tri => ({ ...tri, a: rotatePoint(tri.a, rx, ry, rz), b: rotatePoint(tri.b, rx, ry, rz), c: rotatePoint(tri.c, rx, ry, rz) }))
    const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity]
    for (const tri of rotated) for (const point of [tri.a, tri.b, tri.c]) {
        for (let axis = 0; axis < 3; axis += 1) {
            if (!Number.isFinite(point[axis])) throw new Error('Model contains non-finite coordinates')
            min[axis] = Math.min(min[axis], point[axis])
            max[axis] = Math.max(max[axis], point[axis])
        }
    }
    if (!rotated.length) throw new Error('Model contains no triangles')
    const [minX, minY, minZ] = min, [maxX, maxY, maxZ] = max
    const pageWidth = settings.widthIn * 25.4, pageHeight = settings.heightIn * 25.4
    const widthMm = pageWidth * settings.footprintPct / 100
    const depthMm = pageHeight * settings.footprintPct / 100
    // A phantogram must depict the *same solid* seen from each eye. Scaling
    // height separately from the footprint turned the unit test cube into a
    // shallow slab even though its two eye projections were mathematically
    // correct. Treat height and footprint as upper bounds on one 3D scale.
    // Zero requested height deliberately flattens the model onto the paper.
    const flat = settings.reliefMm === 0
    const preferredScale = Math.min(
        widthMm / Math.max(1e-9, maxX - minX),
        depthMm / Math.max(1e-9, maxY - minY),
        flat || maxZ === minZ ? Infinity : settings.reliefMm / (maxZ - minZ),
    )
    const cx = (minX + maxX) / 2
    const cy = (minY + maxY) / 2
    const eyeZ = settings.eyeHeightIn * 25.4, eyeY = -settings.viewDistanceIn * 25.4
    if (settings.reliefMm >= eyeZ) throw new Error('Eye height must exceed model height above the print')
    const halfIpd = settings.ipdMm / 2
    const margin = 0.01 * Math.min(pageWidth, pageHeight)

    // Fit the projected *left and right* silhouettes, not just the footprint
    // on z=0. A high object can otherwise be clipped beyond the far paper edge.
    const placement = (scale: number) => {
        let minCx = -Infinity, maxCx = Infinity, minCy = -Infinity, maxCy = Infinity
        for (const tri of rotated) for (const p of [tri.a, tri.b, tri.c]) {
            const z = flat ? 0 : Math.max(0, (p[2] - minZ) * scale)
            const t = eyeZ / (eyeZ - z)
            const dx = (p[0] - cx) * scale, dy = (p[1] - cy) * scale
            const yOffset = (1 - t) * eyeY
            minCy = Math.max(minCy, (margin - yOffset) / t - dy)
            maxCy = Math.min(maxCy, (pageHeight - margin - yOffset) / t - dy)
            for (const eyeX of [-halfIpd, halfIpd]) {
                const xOffset = (1 - t) * eyeX
                minCx = Math.max(minCx, (-pageWidth / 2 + margin - xOffset) / t - dx)
                maxCx = Math.min(maxCx, (pageWidth / 2 - margin - xOffset) / t - dx)
            }
        }
        return minCx <= maxCx && minCy <= maxCy
            ? { x: Math.max(minCx, Math.min(maxCx, 0)), y: Math.max(minCy, Math.min(maxCy, pageHeight / 2)) }
            : null
    }
    let scale = preferredScale
    let center = placement(scale)
    if (!center) {
        let lower = 0, upper = scale
        for (let i = 0; i < 18; i += 1) {
            const middle = (lower + upper) / 2
            if (placement(middle)) lower = middle
            else upper = middle
        }
        scale = lower * 0.999 // Keep projected edges away from rounding at the border.
        center = placement(scale)
    }
    if (!center) throw new Error('Could not fit both eye projections on the print')
    const map = (p: Vec3): Vec3 => [(p[0] - cx) * scale + center.x, (p[1] - cy) * scale + center.y, flat ? 0 : Math.max(0, (p[2] - minZ) * scale)]
    return rotated.map(tri => ({ ...tri, a: map(tri.a), b: map(tri.b), c: map(tri.c) }))
}

const subtract = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]
const length = (a: Vec3) => Math.hypot(a[0], a[1], a[2])
const normalize = (a: Vec3): Vec3 => { const l = length(a) || 1; return [a[0] / l, a[1] / l, a[2] / l] }
const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]

export function projectPointToPrint(point: Vec3, eye: Vec3): { x: number; y: number; distance: number } | null {
    if (point[2] >= eye[2] || eye[2] <= 0) return null
    const t = eye[2] / (eye[2] - point[2])
    return {
        x: eye[0] + t * (point[0] - eye[0]),
        y: eye[1] + t * (point[1] - eye[1]),
        // Depth along the plane normal; reciprocal depth is linear in the
        // projected triangle's barycentric coordinates.
        distance: eye[2] - point[2],
    }
}

export function printPixelCoordinates(print: { x: number; y: number }, widthMm: number, heightMm: number, pixelWidth: number, pixelHeight: number) {
    // The top of an upright print is the far edge; the bottom is nearest the eyes.
    return { x: (print.x / widthMm + 0.5) * (pixelWidth - 1), y: (1 - print.y / heightMm) * (pixelHeight - 1) }
}

export function renderEye(triangles: ModelTriangle[], eye: Vec3, widthMm: number, heightMm: number, pixelWidth: number, pixelHeight: number): ImageData {
    const pixels = new Uint8ClampedArray(pixelWidth * pixelHeight * 4)
    const depth = new Float32Array(pixelWidth * pixelHeight)
    depth.fill(Number.POSITIVE_INFINITY)
    for (let i = 0; i < pixelWidth * pixelHeight; i += 1) { pixels[i * 4] = 255; pixels[i * 4 + 1] = 255; pixels[i * 4 + 2] = 255; pixels[i * 4 + 3] = 255 }
    const project = (p: Vec3) => {
        const print = projectPointToPrint(p, eye)
        return print && { ...printPixelCoordinates(print, widthMm, heightMm, pixelWidth, pixelHeight), d: print.distance }
    }
    const light = normalize([-0.35, -0.55, 1])
    for (const tri of triangles) {
        if (tri.a[2] >= eye[2] || tri.b[2] >= eye[2] || tri.c[2] >= eye[2]) continue
        const pa = project(tri.a), pb = project(tri.b), pc = project(tri.c)
        if (!pa || !pb || !pc) continue
        const minX = Math.max(0, Math.floor(Math.min(pa.x, pb.x, pc.x))), maxX = Math.min(pixelWidth - 1, Math.ceil(Math.max(pa.x, pb.x, pc.x)))
        const minY = Math.max(0, Math.floor(Math.min(pa.y, pb.y, pc.y))), maxY = Math.min(pixelHeight - 1, Math.ceil(Math.max(pa.y, pb.y, pc.y)))
        const area = (pb.y - pc.y) * (pa.x - pc.x) + (pc.x - pb.x) * (pa.y - pc.y)
        if (Math.abs(area) < 1e-6) continue
        const normal = normalize(cross(subtract(tri.b, tri.a), subtract(tri.c, tri.a)))
        const shade = 0.42 + 0.58 * Math.abs(dot(normal, light))
        const color = tri.color.map(channel => clampByte(channel * shade)) as [number, number, number]
        for (let y = minY; y <= maxY; y += 1) for (let x = minX; x <= maxX; x += 1) {
            const px = x + 0.5, py = y + 0.5
            const w1 = ((pb.y - pc.y) * (px - pc.x) + (pc.x - pb.x) * (py - pc.y)) / area
            const w2 = ((pc.y - pa.y) * (px - pc.x) + (pa.x - pc.x) * (py - pc.y)) / area
            const w3 = 1 - w1 - w2
            if (w1 < -1e-5 || w2 < -1e-5 || w3 < -1e-5) continue
            // Projected barycentric weights require perspective correction.
            const distance = 1 / (w1 / pa.d + w2 / pb.d + w3 / pc.d)
            const index = y * pixelWidth + x
            if (distance >= depth[index]) continue
            depth[index] = distance
            const p = index * 4
            pixels[p] = color[0]; pixels[p + 1] = color[1]; pixels[p + 2] = color[2]
        }
    }
    return new ImageData(pixels, pixelWidth, pixelHeight)
}

function combineAnaglyph(left: ImageData, right: ImageData, glasses: ModelPhantogramSettings['glasses']): ImageData {
    const out = new Uint8ClampedArray(left.data.length)
    for (let i = 0; i < left.data.length; i += 4) {
        const ll = 0.299 * left.data[i] + 0.587 * left.data[i + 1] + 0.114 * left.data[i + 2]
        const rr = 0.299 * right.data[i] + 0.587 * right.data[i + 1] + 0.114 * right.data[i + 2]
        out[i] = clampByte(ll)
        out[i + 1] = glasses === 'red-blue' ? 0 : clampByte(rr)
        out[i + 2] = glasses === 'red-green' ? 0 : clampByte(rr)
        out[i + 3] = 255
    }
    return new ImageData(out, left.width, left.height)
}

function crc32(bytes: Uint8Array): number {
    let crc = 0xffffffff
    for (const byte of bytes) {
        crc ^= byte
        for (let k = 0; k < 8; k += 1) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1))
    }
    return (crc ^ 0xffffffff) >>> 0
}
const writeU32 = (value: number) => new Uint8Array([(value >>> 24) & 255, (value >>> 16) & 255, (value >>> 8) & 255, value & 255])
const concat = (parts: Uint8Array[]) => { const out = new Uint8Array(parts.reduce((sum, p) => sum + p.length, 0)); let offset = 0; for (const p of parts) { out.set(p, offset); offset += p.length } return out }

async function pngWithDpi(canvas: HTMLCanvasElement, dpi: number): Promise<Blob> {
    const raw = await new Promise<Blob>((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('PNG encoding failed')), 'image/png'))
    const bytes = new Uint8Array(await raw.arrayBuffer())
    const signature = bytes.slice(0, 8)
    const ihdrLength = 12 + ((bytes[8] << 24) | (bytes[9] << 16) | (bytes[10] << 8) | bytes[11])
    const insertAt = 8 + ihdrLength
    const ppm = Math.round(dpi / 0.0254)
    const data = concat([writeU32(ppm), writeU32(ppm), new Uint8Array([1])])
    const type = new TextEncoder().encode('pHYs')
    const chunk = concat([writeU32(data.length), type, data, writeU32(crc32(concat([type, data])))])
    return new Blob([signature, bytes.slice(8, insertAt), chunk, bytes.slice(insertAt)], { type: 'image/png' })
}

export async function renderModelPhantogram(mesh: ModelMesh, settings: ModelPhantogramSettings, scope: 'preview' | 'full'): Promise<{ blob: Blob; width: number; height: number }> {
    if (settings.eyeHeightIn * 25.4 <= settings.reliefMm) throw new Error('Eye height must exceed model height above the print')
    const fullWidth = Math.max(300, Math.round(settings.widthIn * settings.dpi))
    const fullHeight = Math.max(300, Math.round(settings.heightIn * settings.dpi))
    const scale = scope === 'preview' ? Math.min(1, 1100 / Math.max(fullWidth, fullHeight)) : 1
    const width = Math.max(240, Math.round(fullWidth * scale)), height = Math.max(240, Math.round(fullHeight * scale))
    const triangles = prepareTriangles(mesh, settings)
    const widthMm = settings.widthIn * 25.4, heightMm = settings.heightIn * 25.4
    const eyeY = -settings.viewDistanceIn * 25.4, eyeZ = settings.eyeHeightIn * 25.4
    const halfIpd = settings.ipdMm / 2
    const left = renderEye(triangles, [-halfIpd, eyeY, eyeZ], widthMm, heightMm, width, height)
    const right = renderEye(triangles, [halfIpd, eyeY, eyeZ], widthMm, heightMm, width, height)
    const output = combineAnaglyph(left, right, settings.glasses)
    const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height
    const context = canvas.getContext('2d'); if (!context) throw new Error('Canvas is unavailable')
    context.putImageData(output, 0, 0)
    const blob = scope === 'full' ? await pngWithDpi(canvas, settings.dpi) : await new Promise<Blob>((resolve, reject) => canvas.toBlob(value => value ? resolve(value) : reject(new Error('Preview encoding failed')), 'image/png'))
    return { blob, width, height }
}
