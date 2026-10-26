import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'

export type FacadeStyle = 'brick' | 'fins' | 'wood'
export type SceneRoom = { id: string; floor: number; row: number; col: number; available: boolean }
export type SceneBuilding = { id: string; cols: number; floors: number; style: FacadeStyle; rooms: SceneRoom[] }
type Options = {
  buildings: SceneBuilding[]
  tooltip: HTMLElement
  label: (kind: 'building' | 'room', id: string) => string
  onPickBuilding: (id: string) => void
  onPickRoom: (id: string) => void
  reducedMotion: () => boolean
}
type Info = { floor: number; ceilingOf?: number; roomId?: string; noPick?: boolean }
type RoomPart = { volume: THREE.Mesh; glass: THREE.MeshLambertMaterial; fill: THREE.MeshLambertMaterial; room: SceneRoom; buildingId: string }
type BuildingPart = { group: THREE.Group; hitbox: THREE.Mesh; outline: THREE.LineSegments; overview: THREE.Group; street: THREE.Group; neighbors: THREE.Group[]; site: THREE.Mesh; garage: THREE.Group; width: number; height: number; cut: THREE.Object3D[] }
export type Side = 'front' | 'left' | 'back' | 'right'
type RoomState = 'available' | 'unavailable' | 'hover' | 'selected'

// Metres. Basement: motorbike parking. Floor 1: lobby. Floors 2+: a front row of rooms with balconies on the street
// and a back row with windows, either side of a corridor. Front faces +z.
const FLOOR_H = 3.3
const BAY = 4.2
const ROOM_D = 4.2
const CORRIDOR = 1.5
const BALCONY = 1.3
const WALL = 0.22
const DEPTH = ROOM_D * 2 + CORRIDOR
const FRONT = DEPTH / 2
const SPACING = 28
const INTERIOR = '#f1e4c8'
const GLASS: Record<RoomState, { color: string; emissive: string; intensity: number }> = {
  available: { color: '#c6e3b6', emissive: '#4f8044', intensity: 0.5 },
  unavailable: { color: '#3d4a47', emissive: '#000000', intensity: 0 },
  hover: { color: '#f3d9a2', emissive: '#8a6420', intensity: 0.5 },
  selected: { color: '#e2b765', emissive: '#8a5f1c', intensity: 0.6 },
}
const PLAN: Record<RoomState, string> = { available: '#b9d1b0', unavailable: '#e3dccb', hover: '#dcbb84', selected: '#153d36' }
const easeInOut = (t: number) => t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2

function canvasTexture(size: number, draw: (ctx: CanvasRenderingContext2D) => void) {
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = size
  draw(canvas.getContext('2d')!)
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping
  return texture
}
// Texture tiles: brick 0.5 × 0.6 m (2 bricks, 8 courses), wood slats 0.8 × 1 m, stone 1.2 × 0.6 m.
const TILE = { brick: [0.5, 0.6], wood: [0.8, 1], stone: [1.2, 0.6] } as const
const brickTexture = () => canvasTexture(128, ctx => {
  ctx.fillStyle = '#d8ab8f'
  ctx.fillRect(0, 0, 128, 128)
  for (let row = 0; row < 8; row++) {
    for (let i = -1; i < 2; i++) {
      const shade = 150 + ((row * 7 + i * 13 + 20) % 5) * 8
      ctx.fillStyle = `rgb(${shade + 32}, ${Math.round(shade * 0.62)}, ${Math.round(shade * 0.4)})`
      ctx.fillRect(i * 64 + (row % 2) * 32 + 1, row * 16 + 1, 62, 14)
    }
  }
})
const woodTexture = () => canvasTexture(64, ctx => {
  ctx.fillStyle = '#5a3a22'
  ctx.fillRect(0, 0, 64, 64)
  for (let i = 0; i < 8; i++) {
    ctx.fillStyle = i % 2 ? '#ad7543' : '#9c673a'
    ctx.fillRect(i * 8 + 1, 0, 6, 64)
  }
})
const stoneTexture = () => canvasTexture(64, ctx => {
  ctx.fillStyle = '#c4bba9'
  ctx.fillRect(0, 0, 64, 64)
  for (let row = 0; row < 4; row++) {
    for (let i = -1; i < 3; i++) {
      const tone = 212 + ((row * 5 + i * 3 + 8) % 4) * 6
      ctx.fillStyle = `rgb(${tone}, ${tone - 6}, ${tone - 18})`
      ctx.fillRect(i * 28 + (row % 2) * 14 + 1, row * 16 + 1, 26, 14)
    }
  }
})
const pavingTexture = () => canvasTexture(128, ctx => {
  ctx.fillStyle = '#d9d2c4'
  ctx.fillRect(0, 0, 128, 128)
  ctx.strokeStyle = '#c3baaa'
  ctx.lineWidth = 2
  for (let y = 0; y <= 128; y += 32) {
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(128, y); ctx.stroke()
    for (let x = (y / 32) % 2 ? 0 : 32; x <= 128; x += 64) {
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y + 32); ctx.stroke()
    }
  }
})

export function createBuildingScene(container: HTMLElement, options: Options) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
  renderer.shadowMap.enabled = true
  renderer.shadowMap.type = THREE.PCFShadowMap
  renderer.shadowMap.autoUpdate = false // the scene is static: shadows are redrawn only when parts show or hide
  container.prepend(renderer.domElement)
  const scene = new THREE.Scene()
  const camera = new THREE.PerspectiveCamera(30, 1, 0.5, 600)
  const controls = new OrbitControls(camera, renderer.domElement)
  Object.assign(controls, { enableDamping: true, dampingFactor: 0.08, enablePan: false, enableZoom: false, minPolarAngle: 0.45, maxPolarAngle: 1.42, rotateSpeed: 0.55 })
  scene.add(new THREE.HemisphereLight('#fff8ec', '#bfb293', 1.9))
  const sun = new THREE.DirectionalLight('#fff0d8', 2.1)
  sun.position.set(34, 52, 44)
  sun.castShadow = true
  sun.shadow.mapSize.set(2048, 2048)
  Object.assign(sun.shadow.camera, { left: -62, right: 62, top: 46, bottom: -46, near: 10, far: 180 })
  sun.shadow.bias = -0.0004
  sun.shadow.normalBias = 0.04
  scene.add(sun)

  const disposables: { dispose: () => void }[] = []
  const keep = <T extends { dispose: () => void }>(item: T) => { disposables.push(item); return item }
  const lambert = (color: string, extra: THREE.MeshLambertMaterialParameters = {}) => keep(new THREE.MeshLambertMaterial({ color, ...extra }))
  const M = {
    body: lambert('#efe5d0'), trim: lambert('#f8f3e8'), corridor: lambert('#ddd5c0'), green: lambert('#1d4a40'),
    brick: lambert('#ffffff', { map: keep(brickTexture()) }), wood: lambert('#ffffff', { map: keep(woodTexture()) }), stone: lambert('#ffffff', { map: keep(stoneTexture()) }),
    lobby: lambert('#e6c58c', { emissive: '#8a6428', emissiveIntensity: 0.45 }), recess: lambert('#86765f'),
    sidewalk: lambert('#ddd6c8'), paving: lambert('#ffffff', { map: keep(pavingTexture()) }), road: lambert('#6e706b'), lane: lambert('#8e8e88'), paint: lambert('#f4efe2'), trunk: lambert('#7a5a3e'), pot: lambert('#d4cab6'),
    leaf: lambert('#5f8045', { flatShading: true }), leafDark: lambert('#3e653e', { flatShading: true }), metal: lambert('#5e6259'), roof: lambert('#99988e'), planter: lambert('#b5a78a'),
    neighborWall: [lambert('#c6c1b1'), lambert('#b9b8aa'), lambert('#d4c7af')], neighborGlass: lambert('#748782'),
    garageFloor: lambert('#9b9b91'), garageWall: lambert('#c8c2b3'), garagePaint: lambert('#f4ead1'), ramp: lambert('#747a73'),
  }
  const shadowCatcher = new THREE.Mesh(keep(new THREE.PlaneGeometry(400, 400)), keep(new THREE.ShadowMaterial({ opacity: 0.16 })))
  shadowCatcher.rotation.x = -Math.PI / 2
  shadowCatcher.position.y = -0.31
  shadowCatcher.receiveShadow = true
  scene.add(shadowCatcher)

  // Box with UVs in metres / tile size, so textures keep their real scale on any box.
  function boxGeometry(w: number, h: number, d: number, tile?: readonly [number, number]) {
    const geometry = keep(new THREE.BoxGeometry(w, h, d))
    if (tile) {
      const uv = geometry.attributes.uv
      for (let i = 0; i < uv.count; i++) {
        const face = Math.floor(i / 4) // +x, -x, +y, -y, +z, -z
        uv.setXY(i, uv.getX(i) * (face < 2 ? d : w) / tile[0], uv.getY(i) * (face === 2 || face === 3 ? d : h) / tile[1])
      }
    }
    return geometry
  }
  const balusterGeometry = keep(new THREE.BoxGeometry(0.035, 1, 0.035)).translate(0, 0.5, 0)
  const potGeometry = keep(new THREE.BoxGeometry(0.42, 0.42, 0.42)).translate(0, 0.21, 0)
  const leafGeometry = keep(new THREE.IcosahedronGeometry(1, 0))
  const at = (x: number, y: number, z: number, sx = 1, sy = 1, sz = 1, turn = 0) =>
    new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, turn, 0)), new THREE.Vector3(sx, sy, sz))

  // Words painted on the ground; redrawn once the page font has loaded.
  function textTexture(text: string, color: string) {
    const canvas = document.createElement('canvas')
    canvas.width = 1024
    canvas.height = 160
    const ctx = canvas.getContext('2d')!
    const texture = keep(new THREE.CanvasTexture(canvas))
    texture.colorSpace = THREE.SRGBColorSpace
    texture.anisotropy = 4
    const draw = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      ctx.fillStyle = color
      ctx.font = '600 92px Manrope, sans-serif'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText(text, canvas.width / 2, canvas.height / 2 + 4)
      texture.needsUpdate = true
    }
    draw()
    document.fonts.load('600 92px Manrope').then(draw, () => {})
    return texture
  }

  // Street around an opened building: main road in front, lanes on the other three sides, trees, side names on the ground.
  function buildStreet(W: number) {
    const street = new THREE.Group()
    const neighbors: THREE.Group[] = []
    const add = (geometry: THREE.BufferGeometry, material: THREE.Material, x: number, y: number, z: number, castShadow = false) => {
      const mesh = new THREE.Mesh(geometry, material)
      mesh.position.set(x, y, z)
      mesh.castShadow = castShadow
      mesh.receiveShadow = true
      mesh.raycast = () => {}
      street.add(mesh)
      return mesh
    }
    const edgeZ = FRONT + BALCONY + 5 // front edge of the building's own sidewalk
    const roadZ = edgeZ + 5 // centre of the 10 m main road
    const sideX = W / 2 + 4
    const backZ = -FRONT - 2
    const lane = 4
    const long = 170
    add(boxGeometry(long, 0.1, 10), M.road, 0, -0.25, roadZ)
    add(boxGeometry(long, 0.3, 3.5), M.sidewalk, 0, -0.15, roadZ + 6.75)
    for (let x = -long / 2 + 3; x < long / 2; x += 6) if (Math.abs(x) > 3) add(boxGeometry(3, 0.02, 0.16), M.paint, x, -0.19, roadZ)
    for (const side of [-1, 1]) add(boxGeometry(long, 0.02, 0.12), M.paint, 0, -0.19, roadZ + side * 4.5)
    for (let k = 0; k < 8; k++) add(boxGeometry(3.2, 0.02, 0.5), M.paint, 0, -0.18, roadZ - 3.5 + k)
    for (const side of [-1, 1]) add(boxGeometry(lane, 0.1, edgeZ - backZ + lane), M.lane, side * (sideX + lane / 2), -0.25, (edgeZ + backZ - lane) / 2)
    add(boxGeometry(2 * (sideX + lane), 0.1, lane), M.lane, 0, -0.25, backZ - lane / 2)
    const trunk = boxGeometry(0.3, 2.2, 0.3)
    const tree = (x: number, z: number) => {
      add(trunk, M.trunk, x, 1.1, z, true)
      add(leafGeometry, M.leaf, x, 3.15, z, true).scale.set(1.55, 1.25, 1.55)
      add(leafGeometry, M.leafDark, x - 0.55, 2.85, z + 0.35, true).scale.set(0.85, 0.82, 0.88)
      add(leafGeometry, M.leaf, x + 0.55, 3.5, z - 0.25, true).scale.set(0.83, 0.8, 0.82)
    }
    for (const x of [-W / 2 - 2.5, W / 2 + 2.5]) tree(x, edgeZ - 1.2)
    for (let x = -40; x <= 40; x += 10) tree(x, roadZ + 6.6)
    const post = boxGeometry(0.1, 3.4, 0.1)
    const arm = boxGeometry(0.8, 0.07, 0.07)
    for (const x of [-W / 2 - 3.2, W / 2 + 3.2]) {
      add(post, M.metal, x, 1.7, edgeZ - 0.5, true)
      add(arm, M.metal, x + 0.35, 3.32, edgeZ - 0.5)
      add(boxGeometry(0.35, 0.08, 0.25), M.paint, x + 0.7, 3.26, edgeZ - 0.5)
    }
    const head = keep(new THREE.SphereGeometry(0.13, 8, 6))
    for (const [x, z, tone] of [[-2.5, edgeZ - 1.25, M.green], [W / 2 + 2.7, -1.5, M.recess]] as const) {
      add(boxGeometry(0.22, 0.8, 0.17), tone, x, 0.9, z, true)
      add(head, M.lobby, x, 1.42, z, true)
      for (const dx of [-0.065, 0.065]) add(boxGeometry(0.055, 0.48, 0.06), M.metal, x + dx, 0.27, z, true)
    }
    const windowGeometry = boxGeometry(1.15, 1.45, 0.08)
    const sites = [
      [-W / 2 - 20, -5, 11, 13, 11], [W / 2 + 20, -3, 12, 16, 10],
      [-17, -FRONT - 22, 10, 12, 9], [1, -FRONT - 22, 13, 18, 10],
      [W / 2 + 18, roadZ + 18, 12, 15, 10],
    ]
    sites.forEach(([x, z, w, h, d], index) => {
      const neighbor = new THREE.Group()
      neighbor.position.set(x, 0, z)
      const wall = new THREE.Mesh(boxGeometry(w, h, d), M.neighborWall[index % M.neighborWall.length])
      wall.position.y = h / 2
      wall.receiveShadow = true
      wall.raycast = () => {}
      neighbor.add(wall)
      const matrices: THREE.Matrix4[] = []
      for (let y = 2.4; y < h - 1; y += FLOOR_H) {
        for (let bx = -w / 2 + 1.5; bx < w / 2 - 0.5; bx += 2.6) {
          matrices.push(at(bx, y, d / 2 + 0.05), at(bx, y, -d / 2 - 0.05))
        }
        for (let bz = -d / 2 + 1.6; bz < d / 2 - 0.5; bz += 2.7) {
          matrices.push(at(w / 2 + 0.05, y, bz, 1, 1, 1, Math.PI / 2), at(-w / 2 - 0.05, y, bz, 1, 1, 1, Math.PI / 2))
        }
      }
      const windows = new THREE.InstancedMesh(windowGeometry, M.neighborGlass, matrices.length)
      matrices.forEach((matrix, i) => windows.setMatrixAt(i, matrix))
      windows.raycast = () => {}
      neighbor.add(windows)
      street.add(neighbor)
      neighbors.push(neighbor)
    })
    const label = (text: string, width: number, x: number, y: number, z: number, turn: number, color: string) => {
      const holder = new THREE.Group()
      holder.position.set(x, y, z)
      holder.rotation.y = turn
      const mesh = new THREE.Mesh(keep(new THREE.PlaneGeometry(width, width * 160 / 1024)), keep(new THREE.MeshBasicMaterial({ map: textTexture(text, color), transparent: true, depthWrite: false })))
      mesh.rotation.x = -Math.PI / 2
      holder.add(mesh)
      street.add(holder)
    }
    const ink = 'rgba(21, 61, 54, 0.92)'
    const white = 'rgba(250, 247, 240, 0.95)'
    label('MẶT TRƯỚC', 11, 0, 0.02, FRONT + BALCONY + 2.6, 0, ink)
    label('MẶT SAU', 9, 0, 0.02, backZ + 1, Math.PI, ink)
    label('MẶT BÊN TRÁI', 10, -W / 2 - 2, 0.02, 0, -Math.PI / 2, ink)
    label('MẶT BÊN PHẢI', 10, W / 2 + 2, 0.02, 0, Math.PI / 2, ink)
    label('ĐƯỜNG LỚN', 13, -14, -0.18, roadZ - 2.3, 0, white)
    label('NGÕ', 5, -sideX - lane / 2, -0.18, -1, -Math.PI / 2, white)
    label('NGÕ', 5, sideX + lane / 2, -0.18, -1, Math.PI / 2, white)
    return { street, neighbors }
  }

  const rooms = new Map<string, RoomPart>()
  const buildings = new Map<string, BuildingPart>()

  function build(building: SceneBuilding, offsetX: number) {
    const group = new THREE.Group()
    group.position.x = offsetX
    const cut: THREE.Object3D[] = []
    const { cols, floors, style } = building
    const W = cols * BAY
    const top = floors * FLOOR_H
    const roof = floors + 1
    const bayX = (i: number) => -W / 2 + BAY * (i + 0.5)
    const edge = (i: number, inset: number) => Math.min(W / 2 - inset, Math.max(-W / 2 + inset, -W / 2 + i * BAY))
    const put = <T extends THREE.Object3D>(object: T, x: number, y: number, z: number, info: Info) => {
      object.position.set(x, y, z)
      Object.assign(object.userData, info)
      object.castShadow = object.receiveShadow = true
      if (info.noPick) object.raycast = () => {}
      group.add(object)
      cut.push(object)
      return object
    }
    const box = (w: number, h: number, d: number, material: THREE.Material, x: number, y: number, z: number, info: Info, tile?: readonly [number, number]) =>
      put(new THREE.Mesh(boxGeometry(w, h, d, tile), material), x, y, z, info)
    const balusters = new Map<number, THREE.Matrix4[]>()
    const pots = new Map<number, THREE.Matrix4[]>()
    const leaves = new Map<number, THREE.Matrix4[]>()
    const push = (map: Map<number, THREE.Matrix4[]>, floor: number, matrix: THREE.Matrix4) => map.set(floor, [...(map.get(floor) ?? []), matrix])
    const railing = (floor: number, x0: number, x1: number, y: number, z: number) => {
      for (let x = x0; x <= x1; x += 0.12) push(balusters, floor, at(x, y, z))
      box(x1 - x0 + 0.06, 0.06, 0.07, M.green, (x0 + x1) / 2, y + 1.03, z, { floor, noPick: true })
      box(x1 - x0 + 0.06, 0.05, 0.05, M.green, (x0 + x1) / 2, y + 0.1, z, { floor, noPick: true })
    }
    const railingAlongZ = (floor: number, x: number, z0: number, z1: number, y: number) => {
      for (let z = z0; z <= z1; z += 0.12) push(balusters, floor, at(x, y, z))
      box(0.07, 0.06, z1 - z0 + 0.06, M.green, x, y + 1.03, (z0 + z1) / 2, { floor, noPick: true })
    }
    const plant = (floor: number, x: number, y: number, z: number, size = 1, hanging = false) => {
      push(pots, floor, at(x, y, z, size, size, size))
      const s = size * 0.42
      push(leaves, floor, at(x, y + 0.42 * size + s * 0.6, z, s, s * 1.15, s, x))
      push(leaves, floor, at(x - s * 0.5, y + 0.42 * size + s * 0.35, z + s * 0.2, s * 0.7, s * 0.8, s * 0.7, z))
      push(leaves, floor, at(x + s * 0.55, y + 0.42 * size + s * 0.45, z - s * 0.1, s * 0.75, s * 0.9, s * 0.75, x + z))
      if (hanging) push(leaves, floor, at(x + 0.1, y - 0.25, z + 0.35, s * 0.5, s * 1.5, s * 0.45, 1))
    }

    // Site: sidewalk all round; a strip of road in the overview, the full street once the building is opened
    const site = box(W + 8, 0.3, DEPTH + BALCONY + 7, M.paving, 0, -0.15, (BALCONY + 3) / 2, { floor: 0, noPick: true }, [1.6, 1.6])
    const overview = new THREE.Group()
    const strip = new THREE.Mesh(boxGeometry(W + 8, 0.1, 5), M.road)
    strip.position.set(0, -0.26, FRONT + BALCONY + 7.5)
    strip.receiveShadow = true
    overview.add(strip)
    const { street, neighbors } = buildStreet(W)
    street.visible = false
    group.add(overview, street)

    // Shell on every floor: side walls; slabs (slab k = ceiling of floor k, reaching the balcony line)
    for (let floor = 1; floor <= floors; floor++) {
      const mid = (floor - 0.5) * FLOOR_H
      box(WALL, FLOOR_H, DEPTH, M.body, -W / 2 + WALL / 2, mid, 0, { floor })
      box(WALL, FLOOR_H, DEPTH, M.body, W / 2 - WALL / 2, mid, 0, { floor })
      const reach = FRONT + BALCONY
      box(W + 0.3, 0.3, DEPTH + BALCONY + 0.1, M.trim, 0, floor * FLOOR_H, (reach - FRONT - 0.1) / 2, { floor, ceilingOf: floor })
      box(W + 0.38, 0.07, 0.24, M.planter, 0, floor * FLOOR_H - 0.12, reach + 0.03, { floor, ceilingOf: floor, noPick: true })
      if (style === 'wood' && floor < floors) box(W + 0.3, 0.42, 0.2, M.trim, 0, floor * FLOOR_H, reach, { floor, ceilingOf: floor })
    }

    // Floor 1: lobby, one design per facade style
    const groundMid = FLOOR_H / 2
    box(W, FLOOR_H, WALL, M.body, 0, groundMid, -FRONT + WALL / 2, { floor: 1 })
    if (style === 'brick') {
      box(BAY - 0.7, FLOOR_H * 0.82, 0.12, M.green, bayX(0), FLOOR_H * 0.41, FRONT - 0.25, { floor: 1 })
      for (let k = 0; k < 7; k++) box(0.05, FLOOR_H * 0.78, 0.04, M.lobby, bayX(0) - 1.35 + k * 0.45, FLOOR_H * 0.41, FRONT - 0.17, { floor: 1 })
      if (cols > 1) box((cols - 1) * BAY - 0.7, FLOOR_H - 0.3, 0.1, M.lobby, (bayX(1) + bayX(cols - 1)) / 2, groundMid, FRONT - 3, { floor: 1 })
      for (let i = 0; i <= cols; i++) {
        box(0.7, FLOOR_H, BALCONY + 0.4, M.brick, edge(i, 0.35), groundMid, FRONT + (BALCONY + 0.4) / 2 - 0.4, { floor: 1 }, TILE.brick)
        box(0.76, 0.55, BALCONY + 0.46, M.stone, edge(i, 0.38), 0.275, FRONT + (BALCONY + 0.4) / 2 - 0.4, { floor: 1 }, TILE.stone)
      }
    }
    if (style === 'fins') {
      const a = Math.min(BAY * 0.85, W * 0.33)
      const archTop = FLOOR_H * 0.86
      const r = 0.9
      const h = FLOOR_H - 0.15
      const shape = new THREE.Shape()
      shape.moveTo(-W / 2, 0)
      shape.lineTo(-a, 0)
      shape.lineTo(-a, archTop - r)
      shape.quadraticCurveTo(-a, archTop, -a + r, archTop)
      shape.lineTo(a - r, archTop)
      shape.quadraticCurveTo(a, archTop, a, archTop - r)
      shape.lineTo(a, 0)
      shape.lineTo(W / 2, 0)
      shape.lineTo(W / 2, h)
      shape.lineTo(-W / 2, h)
      shape.closePath()
      put(new THREE.Mesh(keep(new THREE.ExtrudeGeometry(shape, { depth: 0.4, bevelEnabled: false, curveSegments: 12 })), M.trim), 0, 0, FRONT - 0.4, { floor: 1 })
      box(a * 2, archTop, 0.1, M.lobby, 0, archTop / 2, FRONT - 3.2, { floor: 1 })
      for (const side of [-1, 1]) box(0.9, FLOOR_H * 0.8, 0.08, M.wood, side * (a + 0.8), FLOOR_H * 0.4, FRONT + 0.04, { floor: 1 }, TILE.wood)
    }
    if (style === 'wood') {
      for (const x of [-W / 2 + 0.45, -W / 2 + BAY, W / 2 - 0.45]) box(0.9, FLOOR_H, 0.5, M.stone, x, groundMid, FRONT - 0.05, { floor: 1 }, TILE.stone)
      box(BAY - 1, FLOOR_H - 0.4, 0.1, M.recess, bayX(0), groundMid, FRONT - 3.5, { floor: 1 })
      for (let i = 1; i < cols; i++) {
        box(BAY - 0.9, FLOOR_H, WALL, M.body, bayX(i), groundMid, FRONT - WALL / 2 - 0.02, { floor: 1 })
        if (i === cols - 1) {
          box(1.9, 2.8, 0.05, M.green, bayX(i), 1.4, FRONT + 0.01, { floor: 1 })
          box(1.7, 2.65, 0.06, M.lobby, bayX(i), 1.38, FRONT + 0.04, { floor: 1 })
          for (const side of [-1, 1]) box(0.6, 2.8, 0.08, M.wood, bayX(i) + side * 1.35, 1.4, FRONT + 0.04, { floor: 1 }, TILE.wood)
        }
      }
    }
    const entryX = -W / 2 + 1.55
    box(2.8, 0.035, 2.4, M.ramp, entryX, 0.025, FRONT + BALCONY + 1.1, { floor: 1, noPick: true })
    const entrySign = put(new THREE.Mesh(keep(new THREE.PlaneGeometry(2.8, 0.55)), keep(new THREE.MeshBasicMaterial({ map: textTexture('GARA ↓', 'rgba(249, 241, 221, 1)'), transparent: true, depthWrite: false }))), entryX, 0.05, FRONT + BALCONY + 1.1, { floor: 1, noPick: true })
    entrySign.rotation.x = -Math.PI / 2
    for (const side of [-1, 1]) {
      const x = side * (W / 2 + 2.45)
      box(2.1, 0.35, 1.25, M.planter, x, 0.18, FRONT + BALCONY + 0.7, { floor: 1, noPick: true })
      for (let j = -1; j <= 1; j++) plant(1, x + j * 0.55, 0.35, FRONT + BALCONY + 0.7, 0.75)
    }

    // The basement is exposed only in its own cutaway view. The ramp meets the front edge of the site.
    const garage = new THREE.Group()
    const garageBox = (w: number, h: number, d: number, material: THREE.Material, x: number, y: number, z: number) => {
      const mesh = new THREE.Mesh(boxGeometry(w, h, d), material)
      mesh.position.set(x, y, z)
      mesh.receiveShadow = true
      mesh.raycast = () => {}
      garage.add(mesh)
      return mesh
    }
    garageBox(W, 0.18, DEPTH, M.garageFloor, 0, -3.35, 0)
    garageBox(W, 3.2, WALL, M.garageWall, 0, -1.65, -FRONT + WALL / 2)
    for (const side of [-1, 1]) garageBox(WALL, 0.85, DEPTH, M.garageWall, side * (W / 2 - WALL / 2), -2.91, 0)
    for (const x of [-W / 2 + 0.3, W / 2 - 0.3]) garageBox(0.6, 0.85, 0.6, M.garageWall, x, -2.91, FRONT - 0.3)
    const ramp = new THREE.Group()
    ramp.position.set(entryX, -1.58, 2.6)
    ramp.rotation.x = -Math.atan2(3.15, 11.4)
    for (const [x, w, h, y, material] of [[0, 2.7, 0.16, 0, M.ramp], [-1.3, 0.12, 0.4, 0.25, M.garageWall], [1.3, 0.12, 0.4, 0.25, M.garageWall]] as const) {
      const mesh = new THREE.Mesh(boxGeometry(w, h, 11.4), material)
      mesh.position.set(x, y, 0)
      mesh.raycast = () => {}
      ramp.add(mesh)
    }
    garage.add(ramp)
    const wheelGeometry = keep(new THREE.CylinderGeometry(0.24, 0.24, 0.12, 10))
    const parkedX = W / 6
    for (let i = 0; i < 4; i++) {
      const z = -3.2 + i * 1.85
      garageBox(2.5, 0.025, 0.05, M.garagePaint, parkedX, -3.24, z - 0.85)
      garageBox(0.55, 0.28, 1.2, i % 2 ? M.green : M.lobby, parkedX, -2.79, z)
      garageBox(0.48, 0.12, 0.52, M.recess, parkedX, -2.58, z - 0.12)
      garageBox(0.85, 0.06, 0.08, M.recess, parkedX, -2.45, z + 0.55)
      for (const wheelZ of [-0.5, 0.5]) {
        const wheel = new THREE.Mesh(wheelGeometry, M.recess)
        wheel.rotation.z = Math.PI / 2
        wheel.position.set(parkedX, -3.01, z + wheelZ)
        wheel.raycast = () => {}
        garage.add(wheel)
      }
    }
    const garageSign = new THREE.Mesh(keep(new THREE.PlaneGeometry(4.6, 0.72)), keep(new THREE.MeshBasicMaterial({ map: textTexture('GARA NGẦM', 'rgba(249, 241, 221, 1)'), transparent: true, depthWrite: false })))
    garageSign.position.set(W / 2 - 2.5, -1.15, -FRONT + WALL + 0.04)
    garageSign.raycast = () => {}
    garage.add(garageSign)
    garage.visible = false
    group.add(garage)

    // Floors 2+: corridor, then each room with its own wall, glass and windows; the facade style on top
    for (let floor = 2; floor <= floors; floor++) {
      const base = (floor - 1) * FLOOR_H
      const mid = base + FLOOR_H / 2
      box(W - 2 * WALL, FLOOR_H - 0.3, CORRIDOR, M.corridor, 0, mid, 0, { floor })
      for (let i = 0; i < cols; i++) {
        const left = -W / 2 + i * BAY
        railing(floor, left + 0.45, left + BAY - 0.45, base + 0.15, FRONT + BALCONY - 0.1)
        if (style === 'wood') plant(floor, left + 0.75, base + 0.15, FRONT + BALCONY - 0.45, 1.1, true)
        else if ((floor + i) % 2 === 0) plant(floor, left + 0.8, base + 0.15, FRONT + BALCONY - 0.45, 1)
      }
      if (style === 'brick') for (let i = 0; i <= cols; i++) box(0.7, FLOOR_H, BALCONY + 0.4, M.brick, edge(i, 0.35), mid, FRONT + (BALCONY + 0.4) / 2 - 0.4, { floor }, TILE.brick)
      if (style === 'fins') {
        for (const side of [-1, 1]) box(0.6, FLOOR_H, BALCONY + 0.3, M.trim, side * (W / 2 - 0.3), mid, FRONT + (BALCONY + 0.3) / 2 - 0.3, { floor })
        for (let i = 0; i <= cols; i++) {
          const x = edge(i, 0.95)
          for (let k = -2; k <= 2; k++) box(0.07, FLOOR_H - 0.3, 0.5, M.green, x + k * 0.15, mid, FRONT + 0.3, { floor })
        }
      }
      if (style === 'wood') for (let i = 0; i <= cols; i++) box(0.28, FLOOR_H, BALCONY + 0.2, M.trim, edge(i, 0.14), mid, FRONT + (BALCONY + 0.2) / 2 - 0.2, { floor })
    }
    for (const room of building.rooms) addRoom(room)

    // Roof: stair house, railings, planters
    box(W - 0.5, 0.045, DEPTH + BALCONY - 0.5, M.roof, 0, top + 0.18, BALCONY / 2, { floor: roof, noPick: true })
    box(BAY * 0.8, 2.6, CORRIDOR + 2, M.body, W / 2 - BAY * 0.45, top + 1.45, -FRONT + (CORRIDOR + 2) / 2 + 0.3, { floor: roof })
    box(BAY * 0.85, 0.15, CORRIDOR + 2.15, M.trim, W / 2 - BAY * 0.45, top + 2.83, -FRONT + (CORRIDOR + 2) / 2 + 0.3, { floor: roof, noPick: true })
    for (const x of [-W / 2 + 0.22, W / 2 - 0.22]) box(0.25, 0.55, DEPTH + BALCONY, M.trim, x, top + 0.48, BALCONY / 2, { floor: roof, noPick: true })
    for (const z of [-FRONT + 0.14, FRONT + BALCONY - 0.14]) box(W, 0.55, 0.25, M.trim, 0, top + 0.48, z, { floor: roof, noPick: true })
    for (const [x, z, w] of [[-W / 2 + 1.2, -FRONT + 1.15, 0.9], [-W / 2 + 2.9, -FRONT + 1.15, 1.2], [0, -FRONT + 1.15, 0.85]] as const) {
      box(w, 0.62, 0.85, M.metal, x, top + 0.51, z, { floor: roof, noPick: true })
      box(w + 0.1, 0.08, 0.95, M.trim, x, top + 0.86, z, { floor: roof, noPick: true })
    }
    const roofSign = put(new THREE.Mesh(keep(new THREE.PlaneGeometry(2.5, 0.55)), keep(new THREE.MeshBasicMaterial({ map: textTexture('ROOMS', 'rgba(28, 65, 55, 1)'), transparent: true, depthWrite: false }))), W / 2 - BAY * 0.45, top + 1.8, -FRONT + CORRIDOR + 2.36, { floor: roof, noPick: true })
    roofSign.material.side = THREE.DoubleSide
    railing(roof, -W / 2 + 0.1, W / 2 - 0.1, top + 0.15, FRONT + BALCONY - 0.1)
    for (const side of [-1, 1]) railingAlongZ(roof, side * (W / 2 - 0.1), -FRONT + 0.2, FRONT + BALCONY - 0.15, top + 0.15)
    for (let x = -W / 2 + 0.8; x < W / 2 - 0.6; x += style === 'fins' ? 1.6 : 1.1) plant(roof, x, top + 0.15, FRONT + BALCONY - 0.55, style === 'fins' ? 0.8 : 1.2)

    for (const [map, geometry, material] of [[balusters, balusterGeometry, M.green], [pots, potGeometry, M.pot], [leaves, leafGeometry, M.leaf]] as const) {
      for (const [floor, matrices] of map) {
        const mesh = new THREE.InstancedMesh(geometry, material, matrices.length)
        matrices.forEach((matrix, i) => mesh.setMatrixAt(i, matrix))
        put(mesh, 0, 0, 0, { floor, noPick: true })
      }
    }

    function addRoom(room: SceneRoom) {
      const { floor, row, col } = room
      const x = bayX(col)
      const base = (floor - 1) * FLOOR_H
      const mid = base + FLOOR_H / 2
      const info = { floor, roomId: room.id }
      const glass = lambert(GLASS.unavailable.color)
      const fill = lambert(INTERIOR)
      const volume = box(BAY - 0.3, FLOOR_H - 0.32, ROOM_D - 0.1, fill, x, mid + 0.01, (row === 0 ? 1 : -1) * (CORRIDOR / 2 + ROOM_D / 2), info)
      const pane = (w: number, h: number, px: number, py: number, pz: number, alongZ = false) => {
        box(alongZ ? 0.04 : w + 0.16, h + 0.12, alongZ ? w + 0.16 : 0.04, M.green, px, py, pz, info)
        box(alongZ ? 0.06 : w, h, alongZ ? w : 0.06, glass, px + (alongZ ? Math.sign(px) * 0.02 : 0), py, pz + (alongZ ? 0 : Math.sign(pz) * 0.02), info)
      }
      if (row === 0) {
        box(BAY - 0.02, FLOOR_H - 0.3, WALL, M.body, x, mid, FRONT - WALL / 2, info)
        const w = style === 'wood' ? BAY * 0.5 : BAY * 0.58
        const h = FLOOR_H * 0.74
        const gx = style === 'wood' ? x + BAY * 0.14 : x
        pane(w, h, gx, base + 0.15 + h / 2, FRONT + 0.01)
        box(0.05, h, 0.08, M.green, gx, base + 0.15 + h / 2, FRONT + 0.05, info)
        box(w + 0.14, 0.05, 0.09, M.green, gx, base + 0.15 + h * 0.34, FRONT + 0.06, info)
        box(w * 0.18, h * 0.92, 0.008, M.trim, gx - w * 0.3, base + 0.15 + h / 2, FRONT + 0.105, { floor, roomId: room.id, noPick: true })
        if (style === 'wood') box(BAY * 0.3, FLOOR_H - 0.4, 0.08, M.wood, x - BAY * 0.26, mid - 0.03, FRONT + 0.05, info, TILE.wood)
      } else {
        box(BAY - 0.02, FLOOR_H - 0.3, WALL, M.body, x, mid, -FRONT + WALL / 2, info)
        pane(1.5, 1.7, x, base + 1.85, -FRONT - 0.01)
      }
      const z = (row === 0 ? 1 : -1) * (CORRIDOR / 2 + ROOM_D * 0.55)
      if (col === 0) pane(0.8, 1.7, -W / 2 - 0.01, base + 1.85, z, true)
      if (col === cols - 1) pane(0.8, 1.7, W / 2 + 0.01, base + 1.85, z, true)
      rooms.set(room.id, { volume, glass, fill, room, buildingId: building.id })
    }

    const hitbox = new THREE.Mesh(keep(new THREE.BoxGeometry(W + 1, top + 3, DEPTH + BALCONY + 1)), keep(new THREE.MeshBasicMaterial({ visible: false })))
    hitbox.position.set(0, (top + 3) / 2, BALCONY / 2)
    hitbox.userData.buildingId = building.id
    group.add(hitbox)
    const outline = new THREE.LineSegments(keep(new THREE.EdgesGeometry(keep(new THREE.BoxGeometry(W + 0.9, top + 3.2, DEPTH + BALCONY + 0.9)))), keep(new THREE.LineBasicMaterial({ color: '#aa7d45', depthTest: false, transparent: true })))
    outline.position.copy(hitbox.position)
    outline.renderOrder = 10
    group.add(outline)
    scene.add(group)
    buildings.set(building.id, { group, hitbox, outline, overview, street, neighbors, site, garage, width: W, height: top, cut })
  }
  options.buildings.forEach((building, index) => build(building, (index - (options.buildings.length - 1) / 2) * SPACING))

  // X-ray marks: the room volume shows through the facade while hovered or selected
  function mark(fill: string, line: string, opacity: number) {
    const geometry = keep(new THREE.BoxGeometry(BAY - 0.2, FLOOR_H - 0.2, ROOM_D))
    const mesh = new THREE.Mesh(geometry, keep(new THREE.MeshBasicMaterial({ color: fill, transparent: true, opacity, depthTest: false, depthWrite: false })))
    const edges = new THREE.LineSegments(keep(new THREE.EdgesGeometry(geometry)), keep(new THREE.LineBasicMaterial({ color: line, depthTest: false, transparent: true })))
    mesh.add(edges)
    mesh.renderOrder = edges.renderOrder = 10
    mesh.visible = false
    scene.add(mesh)
    return mesh
  }
  const hoverMark = mark('#dcbb84', '#aa7d45', 0.2)
  const selectMark = mark('#153d36', '#e2b765', 0.3)

  let focusedId: string | null = null
  let floorFilter: number | null = null
  let selectedId: string | null = null
  let hoverRoomId: string | null = null
  let hoverBuildingId: string | null = null

  const position = new THREE.Vector3()
  function place(target: THREE.Mesh, id: string | null) {
    target.visible = !!id
    if (id) target.position.copy(rooms.get(id)!.volume.getWorldPosition(position))
  }
  function paint(layoutChanged = false) {
    for (const { glass, fill, room, buildingId } of rooms.values()) {
      const state: RoomState = room.id === selectedId ? 'selected' : room.id === hoverRoomId ? 'hover' : room.available ? 'available' : 'unavailable'
      glass.color.set(GLASS[state].color)
      glass.emissive.set(GLASS[state].emissive)
      glass.emissiveIntensity = GLASS[state].intensity
      fill.color.set(focusedId === buildingId && floorFilter === room.floor ? PLAN[state] : INTERIOR)
    }
    for (const [id, part] of buildings) {
      part.group.visible = focusedId === null || focusedId === id
      part.outline.visible = !focusedId && hoverBuildingId === id
      part.street.visible = focusedId === id
      part.overview.visible = focusedId !== id
      const basement = focusedId === id && floorFilter === 0
      part.garage.visible = basement
      const cutting = focusedId === id && floorFilter !== null
      for (const object of part.cut) {
        const { floor, ceilingOf } = object.userData as Info
        object.visible = !(cutting && (floor > floorFilter! || (ceilingOf ?? 0) >= floorFilter!))
      }
      part.site.visible = !basement
    }
    // A room cut away by the floor filter keeps no mark floating above the model
    const visible = (id: string | null) => id && rooms.get(id)!.volume.visible ? id : null
    place(hoverMark, hoverRoomId !== selectedId ? visible(hoverRoomId) : null)
    place(selectMark, visible(selectedId))
    if (layoutChanged) renderer.shadowMap.needsUpdate = true
  }

  // Camera moves: tweened over 900 ms, instant with reduced motion.
  let tween: { from: THREE.Vector3; to: THREE.Vector3; fromTarget: THREE.Vector3; toTarget: THREE.Vector3; start: number } | null = null
  function moveCamera(target: THREE.Vector3, direction: THREE.Vector3, distance: number) {
    const to = target.clone().add(direction.clone().normalize().multiplyScalar(distance))
    if (options.reducedMotion()) {
      camera.position.copy(to)
      controls.target.copy(target)
      return
    }
    tween = { from: camera.position.clone(), to, fromTarget: controls.target.clone(), toTarget: target.clone(), start: performance.now() }
    controls.enabled = false
  }
  const fit = (width: number, height: number) => {
    const vertical = THREE.MathUtils.degToRad(camera.fov) / 2
    const horizontal = Math.atan(Math.tan(vertical) * camera.aspect)
    return Math.max(height / 2 / Math.tan(vertical), width / 2 / Math.tan(horizontal)) * 1.2
  }
  function frameView() {
    if (!focusedId) {
      const span = (options.buildings.length - 1) * SPACING + 18
      const tallest = Math.max(...[...buildings.values()].map(part => part.height))
      moveCamera(new THREE.Vector3(0, tallest * 0.42, 1), new THREE.Vector3(0.45, 0.32, 1), fit(span, tallest + 6) + 12)
      return
    }
    frameBuilding('front')
  }
  // Horizontal direction the camera looks from, per side of the building (front faces +z, left is -x seen from the street).
  const SIDES: Record<Side, [number, number]> = { front: [0.6, 1], right: [1, -0.45], back: [-0.6, -1], left: [-1, 0.45] }
  function frameBuilding(side: Side) {
    const part = buildings.get(focusedId!)!
    const [dx, dz] = SIDES[side]
    if (floorFilter === null) {
      moveCamera(new THREE.Vector3(part.group.position.x, part.height * 0.45, 1), new THREE.Vector3(dx, 0.36, dz), fit(part.width + 8, part.height + 4) + 4)
    } else if (floorFilter === 0) {
      moveCamera(new THREE.Vector3(part.group.position.x, -1.8, 0.5), new THREE.Vector3(dx * 0.45, 1.45, dz * 0.8), fit(part.width + 6, 11) * 1.05)
    } else {
      moveCamera(new THREE.Vector3(part.group.position.x, (floorFilter - 0.5) * FLOOR_H, 0.5), new THREE.Vector3(dx * 0.7, 1.05, dz * 0.9), fit(part.width + 10, 18) + 10)
    }
  }
  function frameRoom(id: string) {
    const target = rooms.get(id)!.volume.getWorldPosition(new THREE.Vector3())
    const direction = camera.position.clone().sub(controls.target)
    if (floorFilter === null) direction.z = Math.sign(target.z || 1) * Math.abs(direction.z)
    moveCamera(target, direction, Math.max(26, direction.length() * 0.8))
  }

  // Picking: nearest visible solid under the pointer (railings and plants let the ray through).
  const raycaster = new THREE.Raycaster()
  const pointer = new THREE.Vector2()
  const shown = (object: THREE.Object3D | null): boolean => !object || (object.visible && shown(object.parent))
  function pick(event: PointerEvent) {
    const rect = renderer.domElement.getBoundingClientRect()
    pointer.set(((event.clientX - rect.left) / rect.width) * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1)
    raycaster.setFromCamera(pointer, camera)
    if (!focusedId) {
      const hit = raycaster.intersectObjects([...buildings.values()].map(part => part.hitbox), false)[0]
      return hit ? { kind: 'building' as const, id: hit.object.userData.buildingId as string } : null
    }
    const part = buildings.get(focusedId)!
    const hit = raycaster.intersectObjects(part.cut, false).find(item => item.object instanceof THREE.Mesh && shown(item.object))
    const room = hit && rooms.get(hit.object.userData.roomId as string)
    return room && (floorFilter === null || room.room.floor === floorFilter) ? { kind: 'room' as const, id: room.room.id } : null
  }
  function showTip(text: string | null, event?: PointerEvent) {
    const { tooltip } = options
    tooltip.classList.toggle('is-on', !!text)
    if (!text || !event) return
    const rect = container.getBoundingClientRect()
    tooltip.textContent = text
    tooltip.style.transform = `translate(${Math.min(event.clientX - rect.left + 14, rect.width - tooltip.offsetWidth - 8)}px, ${event.clientY - rect.top + 16}px)`
  }
  let down: { x: number; y: number } | null = null
  const onDown = (event: PointerEvent) => { down = { x: event.clientX, y: event.clientY } }
  const onMove = (event: PointerEvent) => {
    if (event.buttons || event.pointerType !== 'mouse') return
    const hit = pick(event)
    hoverRoomId = hit?.kind === 'room' ? hit.id : null
    hoverBuildingId = hit?.kind === 'building' ? hit.id : null
    renderer.domElement.style.cursor = hit ? 'pointer' : 'grab'
    showTip(hit ? options.label(hit.kind, hit.id) : null, event)
    paint()
  }
  const onUp = (event: PointerEvent) => {
    if (!down || Math.hypot(event.clientX - down.x, event.clientY - down.y) > 6) return
    down = null
    const hit = pick(event)
    if (hit) showTip(null)
    if (hit?.kind === 'building') options.onPickBuilding(hit.id)
    if (hit?.kind === 'room') options.onPickRoom(hit.id)
  }
  const onLeave = () => {
    hoverRoomId = hoverBuildingId = null
    showTip(null)
    paint()
  }
  const canvas = renderer.domElement
  canvas.addEventListener('pointerdown', onDown)
  canvas.addEventListener('pointermove', onMove)
  canvas.addEventListener('pointerup', onUp)
  canvas.addEventListener('pointerleave', onLeave)

  const resize = () => {
    const { width, height } = container.getBoundingClientRect()
    if (!width || !height) return
    renderer.setSize(width, height)
    camera.aspect = width / height
    camera.updateProjectionMatrix()
  }
  const resizeObserver = new ResizeObserver(resize)
  resizeObserver.observe(container)
  resize()
  // Render only while the stage is on screen (the browser already pauses hidden tabs).
  let onScreen = true
  const intersection = new IntersectionObserver(([entry]) => { onScreen = entry.isIntersecting })
  intersection.observe(container)
  let frame = 0
  const tick = (now: number) => {
    frame = requestAnimationFrame(tick)
    if (!onScreen) return
    if (tween) {
      const t = Math.min(1, (now - tween.start) / 900)
      camera.position.lerpVectors(tween.from, tween.to, easeInOut(t))
      controls.target.lerpVectors(tween.fromTarget, tween.toTarget, easeInOut(t))
      if (t === 1) { tween = null; controls.enabled = true }
    }
    controls.update()
    if (focusedId) {
      const part = buildings.get(focusedId)!
      const dx = camera.position.x - part.group.position.x
      const dz = camera.position.z
      for (const neighbor of part.neighbors) neighbor.visible = floorFilter !== 0 && dx * neighbor.position.x + dz * neighbor.position.z < 0
    }
    renderer.render(scene, camera)
  }
  paint(true)
  frameView()
  frame = requestAnimationFrame(tick)

  return {
    focusBuilding(id: string | null) {
      if (id === focusedId) return
      focusedId = id
      floorFilter = selectedId = hoverRoomId = hoverBuildingId = null
      showTip(null)
      paint(true)
      frameView()
    },
    setFloor(floor: number | null) {
      if (floor === floorFilter) return
      floorFilter = floor
      paint(true)
      frameView()
    },
    selectRoom(id: string | null) {
      if (id === selectedId) return
      selectedId = id
      paint()
      if (id) frameRoom(id)
    },
    viewSide(side: Side) {
      if (focusedId) frameBuilding(side)
    },
    previewRoom(id: string | null) {
      hoverRoomId = id
      paint()
    },
    dispose() {
      cancelAnimationFrame(frame)
      resizeObserver.disconnect()
      intersection.disconnect()
      canvas.removeEventListener('pointerdown', onDown)
      canvas.removeEventListener('pointermove', onMove)
      canvas.removeEventListener('pointerup', onUp)
      canvas.removeEventListener('pointerleave', onLeave)
      controls.dispose()
      for (const item of disposables) item.dispose()
      renderer.dispose()
      canvas.remove()
    },
  }
}
