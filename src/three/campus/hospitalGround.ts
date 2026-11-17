import * as THREE from 'three'
import type { CampusBuildingConfig } from './buildings'
import type { CampusLayout } from '../../config/campusConfig'
import {
  createTiledGroundMaterial,
  getPhotorealAsphaltPbr,
  getPhotorealConcretePbr,
} from './groundPbrTextures'
import { getLawnTexture, getVignetteTexture } from './groundTextures'

const GROUND_SIZE = 1100

const CONCRETE_TILE_M = 3.2
const ROAD_TILE_M = 4

/** 福永原值照搬：地板网格 560/48（宝中无地板网格概念，仅用于虚影 keepout 尺度） */
const FLOOR_GRID_WORLD = 560 / 48
/** 院区外方圆 12 格内禁止虚影（≈140m，虚影城市与广场保持距离） */
const GHOST_CLEAR_GRIDS = 12
const GHOST_CLEAR_M = FLOOR_GRID_WORLD * GHOST_CLEAR_GRIDS

/** 分层高度（间隔 ≥0.08，避免深度缓冲 Z-fighting 闪烁） */
const Y = {
  base: -0.5,
  /** 路面明显高于草坪，避免远距深度精度把沥青“吃掉”只剩草 */
  road: -0.26,
  belt: -0.32,
  curb: -0.28,
  yard: -0.24,
  /** 扁平贴花（车位）；须低于水泥广场 */
  decal: -0.3,
  /** 车道标线底面：紧贴路面上方 */
  mark: -0.25,
  vignette: -0.18,
  shadow: -0.05,
} as const

/** 标线凸起高度（平视时能看到侧棱） */
const MARK_HEIGHT = 0.16
const MARK_EDGE_W = 0.48
const MARK_CENTER_W = 0.45

const ROAD_W = 12
const GREEN_BELT_W = 3.5
const CURB_W = 0.42
const SIDEWALK_W = 4
const CAMPUS_PAD = 4
const OUTER_LAWN_GAP = 1
const GRID_HALF = 520
/** 外圈路离内圈路的间距（福永原值 52×2.5=130m——福永楼群大合适；宝中楼群小，
 *  2026-11-17 用户反馈"路网方块太大很分散"，缩到 28×2.5=70m 让园区紧凑） */
const SEC_SPACING = 28

interface Rect {
  minX: number
  maxX: number
  minZ: number
  maxZ: number
  cx: number
  cz: number
  w: number
  d: number
}

type Pt = [number, number]
type RoadDef = { controls: Pt[]; width: number; divisions: number; centerLine: boolean }

function addGroundPatch(
  group: THREE.Group,
  w: number,
  d: number,
  x: number,
  z: number,
  y: number,
  mat: THREE.Material,
  receiveShadow: boolean,
) {
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, d, 1, 1), mat)
  mesh.rotation.x = -Math.PI / 2
  mesh.position.set(x, y, z)
  mesh.receiveShadow = receiveShadow
  group.add(mesh)
}

/** 楼群包围盒：按各楼 foot（本体世界偏移）合并；无 foot 的楼按 targetFoot/2 方形近似 */
function unionBounds(buildings: CampusBuildingConfig[], ids: readonly number[]): Rect | null {
  let minX = Infinity
  let maxX = -Infinity
  let minZ = Infinity
  let maxZ = -Infinity
  for (const id of ids) {
    const cfg = buildings.find((b) => b.id === id)
    if (!cfg) continue
    const half = cfg.targetFoot / 2
    const fx = cfg.foot?.x ?? [-half, half]
    const fz = cfg.foot?.z ?? [-half, half]
    minX = Math.min(minX, cfg.pos[0] + fx[0])
    maxX = Math.max(maxX, cfg.pos[0] + fx[1])
    minZ = Math.min(minZ, cfg.pos[1] + fz[0])
    maxZ = Math.max(maxZ, cfg.pos[1] + fz[1])
  }
  if (!Number.isFinite(minX)) return null
  return {
    minX,
    maxX,
    minZ,
    maxZ,
    cx: (minX + maxX) / 2,
    cz: (minZ + maxZ) / 2,
    w: maxX - minX,
    d: maxZ - minZ,
  }
}

function expandRect(r: Rect, m: number): Rect {
  return {
    minX: r.minX - m,
    maxX: r.maxX + m,
    minZ: r.minZ - m,
    maxZ: r.maxZ + m,
    cx: r.cx,
    cz: r.cz,
    w: r.w + m * 2,
    d: r.d + m * 2,
  }
}

function makeRect(minX: number, maxX: number, minZ: number, maxZ: number): Rect {
  return {
    minX,
    maxX,
    minZ,
    maxZ,
    cx: (minX + maxX) / 2,
    cz: (minZ + maxZ) / 2,
    w: maxX - minX,
    d: maxZ - minZ,
  }
}

function withPolygonOffset(mat: THREE.MeshStandardMaterial, factor: number) {
  mat.polygonOffset = true
  mat.polygonOffsetFactor = factor
  mat.polygonOffsetUnits = 1
  return mat
}

function lawnMat(rx: number, ry: number) {
  const map = getLawnTexture().clone()
  map.repeat.set(rx, ry)
  map.anisotropy = 16
  map.needsUpdate = true
  return new THREE.MeshLambertMaterial({ map, color: 0xffffff })
}

function concreteMat(w: number, d: number, offset = -4) {
  const mat = createTiledGroundMaterial(
    getPhotorealConcretePbr(),
    w / CONCRETE_TILE_M,
    d / CONCRETE_TILE_M,
    {
      normalScale: 0.45,
      envMapIntensity: 0.05,
    },
  )
  return withPolygonOffset(mat, offset)
}

/**
 * 沥青材质：路带 UV 已按米/瓦片烘焙，贴图 repeat 固定 1。
 * 不用 Standard+aoMap（无 uv2 时易异常）；Lambert 在现有灯光下稳定可见。
 */
function asphaltMat() {
  const map = getPhotorealAsphaltPbr().map.clone()
  map.wrapS = THREE.RepeatWrapping
  map.wrapT = THREE.RepeatWrapping
  map.repeat.set(1, 1)
  map.anisotropy = 16
  map.needsUpdate = true
  return new THREE.MeshLambertMaterial({
    map,
    color: 0xb8bcc4,
    side: THREE.DoubleSide,
    // 拉近深度，远相机也不被草坪盖住
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: 2,
  })
}

function pointInRect(x: number, z: number, r: Rect, pad = 0) {
  return x >= r.minX - pad && x <= r.maxX + pad && z >= r.minZ - pad && z <= r.maxZ + pad
}

function sampleCurve(controls: Pt[], divisions: number): Pt[] {
  if (controls.length < 2) return controls.slice()
  // 两点直线：按长度均分，避免 CatmullRom 在端点外插出弧
  if (controls.length === 2) {
    const [ax, az] = controls[0]!
    const [bx, bz] = controls[1]!
    const n = Math.max(1, divisions)
    const pts: Pt[] = []
    for (let i = 0; i <= n; i += 1) {
      const t = i / n
      pts.push([ax + (bx - ax) * t, az + (bz - az) * t])
    }
    return pts
  }
  const curve = new THREE.CatmullRomCurve3(
    controls.map(([x, z]) => new THREE.Vector3(x, 0, z)),
    false,
    'catmullrom',
    0.18,
  )
  return curve.getSpacedPoints(divisions).map((p) => [p.x, p.z] as Pt)
}

/** 东西干道：水平直线 */
function ewBoulevard(z0: number): Pt[] {
  return [
    [-GRID_HALF, z0],
    [GRID_HALF, z0],
  ]
}

/** 南北干道：竖直直线 */
function nsBoulevard(x0: number): Pt[] {
  return [
    [x0, GRID_HALF],
    [x0, -GRID_HALF],
  ]
}

/** 按广场 keepout 切成连续路段（每段内部不断开） */
function splitPolylineByKeepout(polyline: Pt[], keepout: Rect | null, pad: number): Pt[][] {
  if (!keepout) return [polyline]
  const runs: Pt[][] = []
  let cur: Pt[] = []
  for (const p of polyline) {
    const inside = pointInRect(p[0], p[1], keepout, pad)
    if (inside) {
      if (cur.length >= 2) runs.push(cur)
      cur = []
    } else {
      cur.push(p)
    }
  }
  if (cur.length >= 2) runs.push(cur)
  return runs
}

/** 折线加密，便于按路口半径精确切断标线 */
function densifyPolyline(pts: Pt[], step: number): Pt[] {
  if (pts.length < 2) return pts.slice()
  const out: Pt[] = [pts[0]!]
  for (let i = 0; i < pts.length - 1; i += 1) {
    const [ax, az] = pts[i]!
    const [bx, bz] = pts[i + 1]!
    const len = Math.hypot(bx - ax, bz - az)
    const n = Math.max(1, Math.ceil(len / Math.max(0.5, step)))
    for (let k = 1; k <= n; k += 1) {
      const t = k / n
      out.push([ax + (bx - ax) * t, az + (bz - az) * t])
    }
  }
  return out
}

function nearAnyJunction(x: number, z: number, junctions: Pt[], radius: number) {
  const r2 = radius * radius
  for (const [jx, jz] of junctions) {
    const dx = x - jx
    const dz = z - jz
    if (dx * dx + dz * dz <= r2) return true
  }
  return false
}

/** 路口清空区：标线在此断开，沥青仍连续 */
function splitPolylineByJunctions(polyline: Pt[], junctions: Pt[], radius: number): Pt[][] {
  if (!junctions.length) return [polyline]
  const dense = densifyPolyline(polyline, 2)
  const runs: Pt[][] = []
  let cur: Pt[] = []
  for (const p of dense) {
    if (nearAnyJunction(p[0], p[1], junctions, radius)) {
      if (cur.length >= 2) runs.push(cur)
      cur = []
    } else {
      cur.push(p)
    }
  }
  if (cur.length >= 2) runs.push(cur)
  return runs
}

/** 名义路口（东西干 × 南北干）— 作回退 */
function listRoadJunctions(southCz: number, yard: Rect): Pt[] {
  const northCz = yard.minZ - SIDEWALK_W - GREEN_BELT_W - OUTER_LAWN_GAP - ROAD_W / 2
  const westCx = yard.minX - SIDEWALK_W - GREEN_BELT_W - OUTER_LAWN_GAP - ROAD_W / 2
  const eastCx = yard.maxX + SIDEWALK_W + GREEN_BELT_W + OUTER_LAWN_GAP + ROAD_W / 2
  const outerGap = SEC_SPACING * 2.5
  const ewZs = [southCz, northCz, southCz + outerGap, northCz - outerGap]
  const nsXs = [westCx, eastCx, westCx - outerGap, eastCx + outerGap]
  const out: Pt[] = []
  for (const z of ewZs) {
    for (const x of nsXs) out.push([x, z])
  }
  return out
}

/** 二维线段交点（含端点） */
function segmentIntersection(a: Pt, b: Pt, c: Pt, d: Pt): Pt | null {
  const [x1, y1] = a
  const [x2, y2] = b
  const [x3, y3] = c
  const [x4, y4] = d
  const den = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4)
  if (Math.abs(den) < 1e-9) return null
  const t = ((x1 - x3) * (y3 - y4) - (y1 - y3) * (x3 - x4)) / den
  const u = -((x1 - x2) * (y1 - y3) - (y1 - y2) * (x1 - x3)) / den
  if (t < -1e-6 || t > 1 + 1e-6 || u < -1e-6 || u > 1 + 1e-6) return null
  return [x1 + t * (x2 - x1), y1 + t * (y2 - y1)]
}

/**
 * 从实际路网折线求十字路口中心（与 buildRoadNetwork 顺序一致：
 * 0/1/4/5 东西干，2/3/6/7 南北干）
 */
function findRoadCrossings(roadPolys: Pt[][]): Pt[] {
  const ewIdx = [0, 1, 4, 5]
  const nsIdx = [2, 3, 6, 7]
  const out: Pt[] = []
  for (const ei of ewIdx) {
    const ep = roadPolys[ei]
    if (!ep || ep.length < 2) continue
    for (const ni of nsIdx) {
      const np = roadPolys[ni]
      if (!np || np.length < 2) continue
      let found: Pt | null = null
      for (let i = 0; i < ep.length - 1 && !found; i += 1) {
        for (let j = 0; j < np.length - 1; j += 1) {
          const hit = segmentIntersection(ep[i]!, ep[i + 1]!, np[j]!, np[j + 1]!)
          if (hit) {
            found = hit
            break
          }
        }
      }
      if (found) out.push(found)
    }
  }
  return out
}

function polyLength(pts: Pt[]): number {
  let len = 0
  for (let i = 0; i < pts.length - 1; i += 1) {
    len += Math.hypot(pts[i + 1]![0] - pts[i]![0], pts[i + 1]![1] - pts[i]![1])
  }
  return len
}

/** 连续路带几何：左右轮廓挤出，UV 沿路长，消除短段接缝 */
function buildRoadRibbonGeometry(pts: Pt[], width: number): THREE.BufferGeometry | null {
  if (pts.length < 2) return null
  const half = width / 2
  const left: THREE.Vector3[] = []
  const right: THREE.Vector3[] = []
  const dists: number[] = [0]

  for (let i = 0; i < pts.length; i += 1) {
    const [x, z] = pts[i]!
    let tx = 0
    let tz = 0
    if (i === 0) {
      tx = pts[1]![0] - x
      tz = pts[1]![1] - z
    } else if (i === pts.length - 1) {
      tx = x - pts[i - 1]![0]
      tz = z - pts[i - 1]![1]
    } else {
      tx = pts[i + 1]![0] - pts[i - 1]![0]
      tz = pts[i + 1]![1] - pts[i - 1]![1]
    }
    const len = Math.hypot(tx, tz) || 1
    tx /= len
    tz /= len
    // 水平法线（左侧）
    const nx = -tz
    const nz = tx
    left.push(new THREE.Vector3(x + nx * half, Y.road, z + nz * half))
    right.push(new THREE.Vector3(x - nx * half, Y.road, z - nz * half))
    if (i > 0) {
      dists.push(dists[i - 1]! + Math.hypot(x - pts[i - 1]![0], z - pts[i - 1]![1]))
    }
  }

  const total = dists[dists.length - 1] || 1
  const positions: number[] = []
  const normals: number[] = []
  const uvs: number[] = []
  const indices: number[] = []

  for (let i = 0; i < pts.length; i += 1) {
    // 沿路连续 U，勿 % 截断（否则接缝闪；V=0.08~0.92 避开贴图里烘焙的白边）
    const u = dists[i]! / ROAD_TILE_M
    positions.push(left[i]!.x, left[i]!.y, left[i]!.z)
    positions.push(right[i]!.x, right[i]!.y, right[i]!.z)
    normals.push(0, 1, 0, 0, 1, 0)
    uvs.push(u, 0.08, u, 0.92)
  }
  for (let i = 0; i < pts.length - 1; i += 1) {
    const a = i * 2
    const b = a + 1
    const c = a + 2
    const d = a + 3
    // 俯视 CCW：左→右→下一左，法线朝 +Y
    indices.push(a, b, c, b, d, c)
  }

  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3))
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2))
  geo.setIndex(indices)
  geo.computeBoundingSphere()
  void total
  return geo
}

/** 有厚度的标线带：顶面 + 两侧立面，平视仍可见 */
function buildMarkingStripGeometry(
  pts: Pt[],
  width: number,
  y0: number,
  height: number,
): THREE.BufferGeometry | null {
  if (pts.length < 2) return null
  const half = width / 2
  const y1 = y0 + height
  const bl: THREE.Vector3[] = []
  const br: THREE.Vector3[] = []
  const tl: THREE.Vector3[] = []
  const tr: THREE.Vector3[] = []

  for (let i = 0; i < pts.length; i += 1) {
    const [x, z] = pts[i]!
    let tx = 0
    let tz = 0
    if (i === 0) {
      tx = pts[1]![0] - x
      tz = pts[1]![1] - z
    } else if (i === pts.length - 1) {
      tx = x - pts[i - 1]![0]
      tz = z - pts[i - 1]![1]
    } else {
      tx = pts[i + 1]![0] - pts[i - 1]![0]
      tz = pts[i + 1]![1] - pts[i - 1]![1]
    }
    const len = Math.hypot(tx, tz) || 1
    tx /= len
    tz /= len
    const nx = -tz
    const nz = tx
    bl.push(new THREE.Vector3(x + nx * half, y0, z + nz * half))
    br.push(new THREE.Vector3(x - nx * half, y0, z - nz * half))
    tl.push(new THREE.Vector3(x + nx * half, y1, z + nz * half))
    tr.push(new THREE.Vector3(x - nx * half, y1, z - nz * half))
  }

  const positions: number[] = []
  const indices: number[] = []
  const pushV = (v: THREE.Vector3) => {
    positions.push(v.x, v.y, v.z)
  }

  for (let i = 0; i < pts.length; i += 1) {
    pushV(bl[i]!)
    pushV(br[i]!)
    pushV(tr[i]!)
    pushV(tl[i]!)
  }
  for (let i = 0; i < pts.length - 1; i += 1) {
    const a = i * 4
    const b = a + 4
    // top
    indices.push(a + 3, b + 3, a + 2, a + 2, b + 3, b + 2)
    // left
    indices.push(a, b, a + 3, a + 3, b, b + 3)
    // right
    indices.push(a + 1, a + 2, b + 1, a + 2, b + 2, b + 1)
  }

  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geo.setIndex(indices)
  geo.computeVertexNormals()
  return geo
}

/** 中心虚线：沿路径按 dash/gap 分段 */
function dashedCenterRuns(pts: Pt[], dash = 8, gap = 6): Pt[][] {
  const dense: Pt[] = []
  for (let i = 0; i < pts.length - 1; i += 1) {
    const [ax, az] = pts[i]!
    const [bx, bz] = pts[i + 1]!
    const len = Math.hypot(bx - ax, bz - az)
    const n = Math.max(1, Math.ceil(len / 1.2))
    for (let k = 0; k < n; k += 1) {
      const t = k / n
      dense.push([ax + (bx - ax) * t, az + (bz - az) * t])
    }
  }
  dense.push(pts[pts.length - 1]!)

  const runs: Pt[][] = []
  let dist = 0
  let cur: Pt[] = []
  let drawing = true
  for (let i = 0; i < dense.length; i += 1) {
    if (i > 0) {
      dist += Math.hypot(dense[i]![0] - dense[i - 1]![0], dense[i]![1] - dense[i - 1]![1])
    }
    const cycle = dist % (dash + gap)
    const nowDrawing = cycle < dash
    if (nowDrawing) {
      if (!drawing) cur = []
      cur.push(dense[i]!)
      drawing = true
    } else {
      if (drawing && cur.length >= 2) runs.push(cur)
      cur = []
      drawing = false
    }
  }
  if (drawing && cur.length >= 2) runs.push(cur)
  return runs
}

function addRoadPolyline(
  group: THREE.Group,
  polyline: Pt[],
  width: number,
  plazaKeepout: Rect | null,
  receiveShadow: boolean,
  withCenterLine: boolean,
  junctions: Pt[],
) {
  const runs = splitPolylineByKeepout(polyline, plazaKeepout, width * 0.25)
  const edgeMat = new THREE.MeshBasicMaterial({
    color: 0xffffff,
    depthWrite: true,
    depthTest: true,
    polygonOffset: true,
    polygonOffsetFactor: -8,
    polygonOffsetUnits: 4,
  })
  const centerMat = new THREE.MeshBasicMaterial({
    color: 0xffe066,
    depthWrite: true,
    depthTest: true,
    polygonOffset: true,
    polygonOffsetFactor: -8,
    polygonOffsetUnits: 4,
  })
  /** 标线在路口清空；略大于半宽，避免虚线穿进交叉区 */
  const junctionClearR = width * 0.78

  for (const run of runs) {
    if (run.length < 2 || polyLength(run) < 8) continue
    const geo = buildRoadRibbonGeometry(run, width)
    if (!geo) continue
    const mesh = new THREE.Mesh(geo, asphaltMat())
    mesh.receiveShadow = receiveShadow
    mesh.renderOrder = 1
    group.add(mesh)

    const markRuns = splitPolylineByJunctions(run, junctions, junctionClearR)
    const edgeW = Math.min(MARK_EDGE_W, Math.max(0.32, width * 0.07))
    const inset = width * 0.5 - edgeW * 0.5 - 0.2

    for (const markRun of markRuns) {
      if (markRun.length < 2 || polyLength(markRun) < 3) continue
      const leftEdge = offsetPolyline(markRun, inset)
      const rightEdge = offsetPolyline(markRun, -inset)
      for (const edge of [leftEdge, rightEdge]) {
        const eg = buildMarkingStripGeometry(edge, edgeW, Y.mark, MARK_HEIGHT)
        if (!eg) continue
        const em = new THREE.Mesh(eg, edgeMat)
        em.raycast = () => {}
        em.renderOrder = 2
        group.add(em)
      }

      if (withCenterLine) {
        for (const dash of dashedCenterRuns(markRun, 9, 5)) {
          const cg = buildMarkingStripGeometry(dash, MARK_CENTER_W, Y.mark, MARK_HEIGHT)
          if (!cg) continue
          const cm = new THREE.Mesh(cg, centerMat)
          cm.raycast = () => {}
          cm.renderOrder = 2
          group.add(cm)
        }
      }
    }
  }
}

function offsetPolyline(pts: Pt[], amount: number): Pt[] {
  const out: Pt[] = []
  for (let i = 0; i < pts.length; i += 1) {
    const [x, z] = pts[i]!
    let tx = 0
    let tz = 0
    if (i === 0) {
      tx = pts[1]![0] - x
      tz = pts[1]![1] - z
    } else if (i === pts.length - 1) {
      tx = x - pts[i - 1]![0]
      tz = z - pts[i - 1]![1]
    } else {
      tx = pts[i + 1]![0] - pts[i - 1]![0]
      tz = pts[i + 1]![1] - pts[i - 1]![1]
    }
    const len = Math.hypot(tx, tz) || 1
    tx /= len
    tz /= len
    out.push([x - tz * amount, z + tx * amount])
  }
  return out
}

/**
 * 路口沥青补块：两条路带十字叠放时四角会空出草地，用圆盘盖住。
 * 半径取半宽×√2，刚好盖住路宽正方形的四角。
 */
function addJunctionAsphaltPads(
  group: THREE.Group,
  junctions: Pt[],
  width: number,
  receiveShadow: boolean,
) {
  const radius = width * 0.5 * Math.SQRT2 * 1.06
  const mat = asphaltMat()
  for (const [x, z] of junctions) {
    const mesh = new THREE.Mesh(new THREE.CircleGeometry(radius, 40), mat)
    mesh.rotation.x = -Math.PI / 2
    mesh.position.set(x, Y.road + 0.012, z)
    mesh.receiveShadow = receiveShadow
    mesh.renderOrder = 1
    mesh.raycast = () => {}
    group.add(mesh)
  }
}

function addParkingBay(group: THREE.Group, cx: number, cz: number, bayW: number, bayD: number) {
  const lineMat = new THREE.MeshBasicMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 0.78,
    depthWrite: false,
  })
  const mk = (lw: number, ld: number, ox: number, oz: number) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(lw, ld), lineMat)
    m.rotation.x = -Math.PI / 2
    m.position.set(cx + ox, Y.decal, cz + oz)
    group.add(m)
  }
  const hw = bayW / 2
  const hd = bayD / 2
  mk(bayW, 0.14, 0, -hd)
  mk(bayW, 0.14, 0, hd)
  mk(0.14, bayD, -hw, 0)
  mk(0.14, bayD, hw, 0)
}

function addGhostBuilding(
  group: THREE.Group,
  x: number,
  z: number,
  w: number,
  d: number,
  h: number,
  opacity: number,
  color: number,
  variant: number,
) {
  const mat = new THREE.MeshLambertMaterial({
    color,
    transparent: true,
    opacity,
    depthWrite: true,
  })
  const root = new THREE.Group()
  root.position.set(x, 0, z)
  root.raycast = () => {}

  const main = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat)
  main.position.y = h / 2
  main.castShadow = false
  main.receiveShadow = false
  main.raycast = () => {}
  root.add(main)

  if (variant % 3 === 1) {
    const wing = new THREE.Mesh(new THREE.BoxGeometry(w * 0.45, h * 0.7, d * 0.55), mat.clone())
    wing.position.set(w * 0.32, (h * 0.7) / 2, -d * 0.2)
    wing.raycast = () => {}
    root.add(wing)
  } else if (variant % 3 === 2 && h > 18) {
    const tower = new THREE.Mesh(new THREE.BoxGeometry(w * 0.35, h * 1.2, d * 0.35), mat.clone())
    tower.position.set(-w * 0.2, (h * 1.2) / 2, d * 0.15)
    tower.raycast = () => {}
    root.add(tower)
  }

  const rim = new THREE.Mesh(
    new THREE.BoxGeometry(w * 1.05, Math.max(0.5, h * 0.035), d * 1.05),
    new THREE.MeshBasicMaterial({
      color: 0xa8b8c8,
      transparent: true,
      opacity: Math.min(0.75, opacity + 0.1),
      depthWrite: false,
    }),
  )
  rim.position.y = h + 0.2
  rim.raycast = () => {}
  root.add(rim)
  group.add(root)
}

function minDistToPolylines(x: number, z: number, polys: Pt[][]): number {
  let best = Infinity
  for (const poly of polys) {
    for (let i = 0; i < poly.length - 1; i += 1) {
      const [ax, az] = poly[i]!
      const [bx, bz] = poly[i + 1]!
      const abx = bx - ax
      const abz = bz - az
      const len2 = abx * abx + abz * abz
      if (len2 < 1e-6) continue
      let t = ((x - ax) * abx + (z - az) * abz) / len2
      t = Math.max(0, Math.min(1, t))
      best = Math.min(best, Math.hypot(x - (ax + abx * t), z - (az + abz * t)))
    }
  }
  return best
}

/** 虚影：地板外 keepout 之外；近大远小 */
function scatterGhostCity(
  group: THREE.Group,
  originX: number,
  originZ: number,
  ghostKeepout: Rect,
  roadPolys: Pt[][],
) {
  const colors = [0x5f738a, 0x6a7f96, 0x73899f, 0x566a80, 0x7a90a6]
  const edgeR = Math.max(ghostKeepout.w, ghostKeepout.d) * 0.5

  type Band = {
    minR: number
    maxR: number
    step: number
    h0: number
    h1: number
    op0: number
    op1: number
    scale: number
  }
  const bands: Band[] = [
    { minR: edgeR, maxR: edgeR + 85, step: 26, h0: 30, h1: 48, op0: 0.5, op1: 0.62, scale: 1 },
    {
      minR: edgeR + 85,
      maxR: edgeR + 175,
      step: 32,
      h0: 16,
      h1: 28,
      op0: 0.34,
      op1: 0.46,
      scale: 0.7,
    },
    {
      minR: edgeR + 175,
      maxR: edgeR + 290,
      step: 42,
      h0: 8,
      h1: 15,
      op0: 0.24,
      op1: 0.32,
      scale: 0.48,
    },
    { minR: edgeR + 290, maxR: 470, step: 56, h0: 4, h1: 9, op0: 0.15, op1: 0.22, scale: 0.3 },
  ]

  for (const band of bands) {
    for (let x = originX - band.maxR; x <= originX + band.maxR; x += band.step) {
      for (let z = originZ - band.maxR; z <= originZ + band.maxR; z += band.step) {
        const dist = Math.hypot(x - originX, z - originZ)
        if (dist < band.minR || dist > band.maxR) continue
        const jx = x + Math.sin(x * 0.15 + z * 0.09) * band.step * 0.22
        const jz = z + Math.cos(x * 0.11 - z * 0.14) * band.step * 0.22
        // 南部（z>0，园区大门/门诊排/天桥一侧）净空：虚影只留北半天际线
        // （2026-11-17 用户：南部虚拟建筑删掉、其他地方保留）
        if (jz > 0) continue
        if (pointInRect(jx, jz, ghostKeepout, 2)) continue
        if (minDistToPolylines(jx, jz, roadPolys) < 10) continue

        const cell = Math.floor(jx / 17) + Math.floor(jz / 19) * 3
        if (band.minR > edgeR + 160 && cell % 2 !== 0) continue
        if (band.minR > edgeR + 280 && cell % 3 !== 0) continue

        const t = (dist - band.minR) / Math.max(1, band.maxR - band.minR)
        const h = band.h0 + (1 - t) * (band.h1 - band.h0) + (cell % 4) * 1.1
        const op = band.op0 + (1 - t) * (band.op1 - band.op0)
        const footprint = (11 + (1 - t) * 17) * band.scale
        const w = footprint * (0.85 + (cell % 4) * 0.07)
        const d = footprint * (0.7 + ((cell + 2) % 4) * 0.07)
        addGhostBuilding(group, jx, jz, w, d, h, op, colors[Math.abs(cell) % colors.length]!, cell)

        if (band.minR < edgeR + 50 && cell % 5 === 0) {
          addGhostBuilding(
            group,
            jx + w * 0.65,
            jz - d * 0.3,
            w * 0.5,
            d * 0.55,
            h * 0.6,
            op * 0.9,
            colors[(Math.abs(cell) + 1) % colors.length]!,
            cell + 1,
          )
        }
      }
    }
  }
}

/**
 * 只保留 8 条主干道：院区围合 4 条 + 外圈平行 4 条。
 * 不再铺次干/支路。（2026-11-17 曾加"桥下南北干道"被用户否决——桥跨的是南侧东西大路）
 */
function buildRoadNetwork(southCz: number, yard: Rect): RoadDef[] {
  const northCz = yard.minZ - SIDEWALK_W - GREEN_BELT_W - OUTER_LAWN_GAP - ROAD_W / 2
  const westCx = yard.minX - SIDEWALK_W - GREEN_BELT_W - OUTER_LAWN_GAP - ROAD_W / 2
  const eastCx = yard.maxX + SIDEWALK_W + GREEN_BELT_W + OUTER_LAWN_GAP + ROAD_W / 2
  const outerGap = SEC_SPACING * 2.5

  return [
    // 内圈四边（直线）
    { controls: ewBoulevard(southCz), width: ROAD_W, divisions: 64, centerLine: true },
    { controls: ewBoulevard(northCz), width: ROAD_W, divisions: 64, centerLine: true },
    { controls: nsBoulevard(westCx), width: ROAD_W, divisions: 60, centerLine: true },
    { controls: nsBoulevard(eastCx), width: ROAD_W, divisions: 60, centerLine: true },
    // 外圈四边（直线）
    { controls: ewBoulevard(southCz + outerGap), width: ROAD_W, divisions: 56, centerLine: true },
    { controls: ewBoulevard(northCz - outerGap), width: ROAD_W, divisions: 56, centerLine: true },
    { controls: nsBoulevard(westCx - outerGap), width: ROAD_W, divisions: 52, centerLine: true },
    { controls: nsBoulevard(eastCx + outerGap), width: ROAD_W, divisions: 52, centerLine: true },
  ]
}

/** 院区广场/路网/虚影（数据由 layout+buildings 注入，本函数医院无关） */
export function buildHospitalCourtyardGround(
  group: THREE.Group,
  receiveShadow: boolean,
  buildings: CampusBuildingConfig[],
  layout: CampusLayout,
) {
  // 路网定位只围核心楼群——独立地块楼栋（如行政楼）不计入，
  // 否则 westCx 等会被它撑着移动、路跑到该楼脚下（与南侧综合楼同理）
  const campus = unionBounds(buildings, layout.coreIds)
  if (!campus) return

  const southRow = unionBounds(buildings, layout.southRowIds)
  // 中带楼栋算进北排让其占住中带 → 停车湾区域不足 10m 自动跳过，不画在中带楼下
  const northRow = unionBounds(buildings, layout.northRowIds)

  addGroundPatch(
    group,
    GROUND_SIZE,
    GROUND_SIZE,
    0,
    0,
    Y.base,
    lawnMat(GROUND_SIZE / 4, GROUND_SIZE / 4),
    receiveShadow,
  )

  const yard = expandRect(campus, CAMPUS_PAD)
  const yardW = yard.w + SIDEWALK_W * 2
  const yardD = yard.d + SIDEWALK_W * 2
  const plaza = makeRect(
    yard.cx - yardW / 2,
    yard.cx + yardW / 2,
    yard.cz - yardD / 2,
    yard.cz + yardD / 2,
  )
  /** 虚影：地板外方圆 12 格 */
  const ghostKeepout = expandRect(plaza, GHOST_CLEAR_M)

  const southInnerEdge = yard.maxZ + SIDEWALK_W + GREEN_BELT_W + CURB_W + OUTER_LAWN_GAP
  const southCz = southInnerEdge + ROAD_W / 2

  addGroundPatch(
    group,
    Math.min(yard.w + 80, 160),
    GREEN_BELT_W,
    yard.cx,
    southInnerEdge - CURB_W - GREEN_BELT_W / 2,
    Y.belt,
    lawnMat(12, 1),
    receiveShadow,
  )
  {
    const curbMat = withPolygonOffset(concreteMat(4, 1, -5), -5)
    curbMat.color = new THREE.Color(0x8c8880)
    addGroundPatch(
      group,
      Math.min(yard.w + 80, 160),
      CURB_W,
      yard.cx,
      southInnerEdge - CURB_W / 2,
      Y.curb,
      curbMat,
      receiveShadow,
    )
  }

  const network = buildRoadNetwork(southCz, yard)
  const roadPolys: Pt[][] = []
  for (let i = 0; i < network.length; i += 1) {
    roadPolys.push(sampleCurve(network[i]!.controls, network[i]!.divisions))
  }
  const crossings = findRoadCrossings(roadPolys)
  const junctions = crossings.length > 0 ? crossings : listRoadJunctions(southCz, yard)
  for (let i = 0; i < network.length; i += 1) {
    const road = network[i]!
    // punch=null：宝中无整片广场可切，路全程连贯（桥下干道曾被 punch 切断）
    addRoadPolyline(
      group,
      roadPolys[i]!,
      road.width,
      null,
      receiveShadow,
      road.centerLine,
      junctions,
    )
  }
  addJunctionAsphaltPads(group, junctions, ROAD_W, receiveShadow)

  // 楼脚水泥基座已撤（2026-11-17 用户"先别给我加地板"——楼直接立草地上；
  // concreteMat 仍被路缘石使用，勿删 import）

  if (southRow && northRow) {
    const midZ = (southRow.minZ + northRow.maxZ) / 2
    const midD = southRow.minZ - northRow.maxZ - 6
    if (midD > 10) {
      const bays = 5
      const bayW = (yardW * 0.6) / bays
      for (let i = 0; i < bays; i += 1) {
        const bx = yard.cx - (yardW * 0.6) / 2 + bayW * (i + 0.5)
        addParkingBay(group, bx, midZ, bayW * 0.88, midD * 0.55)
      }
    }
  }

  scatterGhostCity(group, plaza.cx, plaza.cz, ghostKeepout, roadPolys)

  const vignette = new THREE.Mesh(
    new THREE.PlaneGeometry(GROUND_SIZE, GROUND_SIZE),
    new THREE.MeshBasicMaterial({
      map: getVignetteTexture(),
      transparent: true,
      depthWrite: false,
    }),
  )
  vignette.rotation.x = -Math.PI / 2
  vignette.position.y = Y.vignette
  vignette.renderOrder = 1
  group.add(vignette)

  if (receiveShadow) {
    const catcher = new THREE.Mesh(
      new THREE.PlaneGeometry(GROUND_SIZE, GROUND_SIZE),
      new THREE.ShadowMaterial({ opacity: 0.34, transparent: true, depthWrite: false }),
    )
    catcher.rotation.x = -Math.PI / 2
    catcher.position.y = Y.shadow
    catcher.receiveShadow = true
    catcher.renderOrder = 6
    catcher.raycast = () => {}
    group.add(catcher)
  }
}
