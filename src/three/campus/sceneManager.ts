/**
 * 园区场景总控（批1=纯视觉骨架；docs/3D园区一期方案.md）：
 * 渲染循环 / 相机（南向初始机位，落两栏 380px 面板之间）/ OrbitControls（阻尼、禁平移、
 * 不自动旋转——宝中口径）/ 灯光阴影 / 六栋 Draco GLB 串行加载（进度回调）。
 * 环境件照搬福永（用户 2026-11-17 拍板"照搬福永"）：campusSky 着色器穹顶 +
 * hospitalGround 院区地面（草坪/沥青路网/水泥广场/虚影城市/渐晕），光照曝光同福永参数。
 * 生命周期 = createCampusScene 工厂（power-room createPowerRoomScene 同款惯例）：
 * 页面 onDeactivated 调 dispose 彻底释放 WebGL（避免与配电房抢上下文），
 * onActivated 重建——GLB 模板缓存在 glbLoader 模块级持久，重建只重摆位；
 * 因此 dispose 只拆渲染器/监听/场景引用，不动缓存内的几何与材质。
 * 楼栋加载失败：进度照常推进（单栋失败不阻塞其余），该楼缺席。
 */
import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import type { CampusBuildingConfig } from './buildings'
import type { CampusLayout } from '../../config/campusConfig'
import { loadBuilding } from './glbLoader'
import { createCampusSkyDome, CAMPUS_SUN_DIR, CAMPUS_SUN_DIST } from './campusSky'
import { buildHospitalCourtyardGround } from './hospitalGround'
import { initCampusEnvironment } from './environment'

/** 初始视线方向（从南向北看、微俯视）：相机在 +z（园区大门侧），看向 -z 北 */
const CAMPUS_FORWARD = new THREE.Vector3(0, -0.25, -1).normalize()
/** 两侧悬浮面板占位（380px 面板 + 24px 边距 + 余量），构图时楼群让开 */
const SIDE_PANEL_PX = 430
/** 主光位置 = 太阳方向 × 距离（福永 CAMPUS_KEY_LIGHT_POS 同款派生） */
const KEY_LIGHT_POS = CAMPUS_SUN_DIR.clone().multiplyScalar(CAMPUS_SUN_DIST)

export interface CampusSceneCallbacks {
  /** 加载进度（done 含失败栋） */
  onProgress?: (done: number, total: number) => void
  /** 全部楼栋处理完（含失败）后一次性回调 */
  onReady?: () => void
  /** 点楼/点空白（按下抬起位移 <6px 判点击；空白=kind background） */
  onPick?: (pick: { kind: 'building' | 'background'; buildingId?: number }) => void
}

export interface CampusSceneOptions extends CampusSceneCallbacks {
  /** 楼栋清单（医院数据，src/config/campusConfig.ts） */
  buildings: CampusBuildingConfig[]
  /** 布局分组（路网/广场定位语义） */
  layout: CampusLayout
}

export function createCampusScene(container: HTMLElement, cb: CampusSceneOptions) {
  const { buildings, layout } = cb
  const scene = new THREE.Scene()

  const camera = new THREE.PerspectiveCamera(
    42,
    Math.max(container.clientWidth / Math.max(container.clientHeight, 1), 0.1),
    0.1,
    2000,
  )

  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' })
  renderer.setPixelRatio(1)
  renderer.setSize(container.clientWidth, container.clientHeight)
  renderer.toneMapping = THREE.ACESFilmicToneMapping
  // 福永 campus 亮档曝光（useQualityLighting 无阴影 = 1.12）
  renderer.toneMappingExposure = 1.12
  renderer.shadowMap.enabled = true
  renderer.shadowMap.type = THREE.PCFShadowMap
  container.appendChild(renderer.domElement)
  renderer.domElement.style.display = 'block'

  const controls = new OrbitControls(camera, renderer.domElement)
  controls.enableDamping = true
  controls.enablePan = false
  controls.minDistance = 25
  controls.maxDistance = 520
  controls.maxPolarAngle = 1.45
  controls.addEventListener('start', () => (renderer.domElement.style.cursor = 'grabbing'))
  controls.addEventListener('end', () => (renderer.domElement.style.cursor = 'grab'))
  renderer.domElement.style.cursor = 'grab'

  // PBR 环境贴图（福永同款）：天空 PMREM——楼栋玻璃反射蓝天、全场基础亮度的来源
  const disposeEnvironment = initCampusEnvironment(renderer, scene)

  // 灯光：福永「无阴影亮档」原值（用户截图对齐：图一草地亮黄绿、楼下无投影、整体明亮）
  const ambient = new THREE.AmbientLight(0xffffff, 0.42)
  scene.add(ambient)
  const hemi = new THREE.HemisphereLight(0xcfe4ff, 0x8fa8bc, 0.52)
  scene.add(hemi)
  const key = new THREE.DirectionalLight(0xfff4e8, 1.05)
  key.position.copy(KEY_LIGHT_POS)
  scene.add(key)
  scene.add(key.target)

  // 环境件：着色器天空穹顶 + 福永院区地面（草坪/路网/广场/虚影城市）
  const sky = createCampusSkyDome()
  scene.add(sky)
  const groundGroup = new THREE.Group()
  groundGroup.name = 'campus-ground'
  // 无阴影档：不建阴影 catcher，与福永 receiveShadow=false 分支一致
  buildHospitalCourtyardGround(groundGroup, false, buildings, layout)
  scene.add(groundGroup)

  // ---- 初始机位：按配置预计算的园区包围盒取景（楼栋到货后不重摆相机，构图稳定） ----
  // 取景只含核心楼群（与路网 yard 同口径）——行政楼等独立地块参与取景会把相机推到
  // 数百米外的超远景（用户观感"楼都被压缩了"的真根因）
  const campusBounds = boundsFromConfig(buildings.filter((b) => layout.coreIds.includes(b.id)))
  fitCameraTo(campusBounds, camera, container)
  controls.target.copy(campusBounds.getCenter(new THREE.Vector3()))
  controls.update()

  // ---- 渲染循环 ----
  let raf = 0
  let disposed = false
  /** 进场生长动画队列（福永 growBuildings 同款）：全部就绪后逐栋错峰升起 */
  const growQueue: { holder: THREE.Group; startAt: number }[] = []
  /** smootherstep 缓动（福永同款） */
  const smootherstep = (t: number) => t * t * t * (t * (t * 6 - 15) + 10)
  const GROW_DURATION = 480
  const GROW_STAGGER = 50
  /** 相机飞行（点楼聚焦/返回全景）：每帧插值比例与时长 */
  const FLY_STEP = 0.09

  /** 相机飞行动画状态；active 期间 controls 禁用（福永同款，动画结束恢复） */
  const fly = {
    active: false,
    t: 0,
    fromPos: new THREE.Vector3(),
    toPos: new THREE.Vector3(),
    fromTg: new THREE.Vector3(),
    toTg: new THREE.Vector3(),
  }

  function flyTo(toPos: THREE.Vector3, toTg: THREE.Vector3) {
    fly.fromPos.copy(camera.position)
    fly.toPos.copy(toPos)
    fly.fromTg.copy(controls.target)
    fly.toTg.copy(toTg)
    fly.t = 0
    fly.active = true
    controls.enabled = false
  }

  const tick = () => {
    if (disposed) return
    // 生长动画推进
    const now = performance.now()
    for (let i = growQueue.length - 1; i >= 0; i--) {
      const g = growQueue[i]!
      const t = (now - g.startAt) / GROW_DURATION
      if (t <= 0) continue
      if (t >= 1) {
        g.holder.scale.y = 1
        growQueue.splice(i, 1)
        continue
      }
      g.holder.scale.y = Math.max(smootherstep(t), 0.0001)
    }
    // 相机飞行推进
    if (fly.active) {
      fly.t = Math.min(fly.t + FLY_STEP, 1)
      const p = smootherstep(fly.t)
      camera.position.lerpVectors(fly.fromPos, fly.toPos, p)
      controls.target.lerpVectors(fly.fromTg, fly.toTg, p)
      if (fly.t >= 1) {
        fly.active = false
        controls.enabled = true
      }
    }
    controls.update()
    renderer.render(scene, camera)
    raf = requestAnimationFrame(tick)
  }
  raf = requestAnimationFrame(tick)

  const onResize = () => {
    const w = container.clientWidth
    const h = container.clientHeight
    if (w === 0 || h === 0) return
    camera.aspect = w / h
    camera.updateProjectionMatrix()
    renderer.setSize(w, h)
  }
  const ro = new ResizeObserver(onResize)
  ro.observe(container)

  /** 楼栋注册表：id → 摆位 holder / 世界盒（聚焦取景与拾取用） */
  const buildingRoots = new Map<number, THREE.Group>()
  const buildingBoxes = new Map<number, THREE.Box3>()

  /** 拾取代理：每栋一个隐形盒（colorWrite/depthWrite 全关，渲染零像素、raycast 可命中），
   *  避免对几千个建筑 mesh 逐个求交 */
  // ---- 六栋串行加载（Draco；失败不阻塞，进度含失败栋） ----
  // 楼栋就绪先压扁隐藏，全部就绪后统一错峰生长（福永进场动画同款观感）
  void (async () => {
    let done = 0
    const grown: THREE.Group[] = []
    for (const cfg of buildings) {
      const b = await loadBuilding(cfg)
      if (!disposed && b) {
        b.object.scale.y = 0.0001
        b.object.userData.buildingId = cfg.id
        b.object.userData.targetFoot = cfg.targetFoot
        scene.add(b.object)
        buildingRoots.set(cfg.id, b.object)
        buildingBoxes.set(cfg.id, b.box)
        grown.push(b.object)
      }
      done++
      cb.onProgress?.(done, buildings.length)
    }
    if (disposed) return
    const t0 = performance.now()
    grown.forEach((holder, i) => growQueue.push({ holder, startAt: t0 + i * GROW_STAGGER }))
    cb.onReady?.()
  })()

  /** 只拆渲染器/监听/场景引用；GLB 模板缓存（模块级）不动，激活重建复用 */
  function dispose() {
    if (disposed) return
    disposed = true
    cancelAnimationFrame(raf)
    ro.disconnect()
    renderer.domElement.removeEventListener('pointermove', onPointerMove)
    renderer.domElement.removeEventListener('pointerdown', onPointerDown)
    renderer.domElement.removeEventListener('pointerup', onPointerUp)
    controls.dispose()
    // 环境件释放（天空穹顶着色器材质 / 地面组全部几何与材质；纹理模块级缓存不拆）
    scene.traverse((o) => {
      const mesh = o as THREE.Mesh
      if (!mesh.isMesh) return
      // 楼栋 mesh 的几何/材质归 GLB 模板缓存所有，重建复用——只拆环境件
      if (mesh.name.startsWith('building-') || isInsideBuilding(mesh)) return
      const mat = mesh.material
      if (Array.isArray(mat)) mat.forEach((m) => m.dispose())
      else mat?.dispose()
      mesh.geometry.dispose()
    })
    scene.clear()
    disposeEnvironment()
    renderer.dispose()
    renderer.forceContextLoss?.()
    renderer.domElement.remove()
  }

  /** mesh 是否在某个楼栋子树内（楼栋根 name = building-{id}） */
  function isInsideBuilding(mesh: THREE.Mesh): boolean {
    let p: THREE.Object3D | null = mesh
    while (p) {
      if (p.name.startsWith('building-')) return true
      p = p.parent
    }
    return false
  }

  // ---- 楼栋交互（批2）：hover 高亮 / 点楼聚焦 / 返回全景 ----
  const raycaster = new THREE.Raycaster()
  const pointerNdc = new THREE.Vector2()
  /** hover 节流（三角级 raycast 有成本，100ms 一次足够流畅） */
  let lastHoverAt = 0
  /** hover 高亮色（福永 HOVER_GLOW 同款蓝） */
  const HOVER_EMISSIVE = 0x174e93
  /** hover 原色表：按材质记录（GLB 同一材质常被多个 mesh 共享——按 mesh 记录会在
   *  第二个 mesh 处把已改的 hover 色当原色存下，恢复后材质永久发蓝） */
  const hoverOrig = new Map<THREE.Material, { hex: number; intensity: number }>()
  let hoverId: number | null = null
  let focusedId: number | null = null
  let downX = 0
  let downY = 0

  function setHover(id: number | null) {
    if (hoverId === id) return
    // 恢复上一栋：按材质表还原原色（共享材质只记一次，原色必真）
    if (hoverId != null) {
      for (const [mat, orig] of hoverOrig) {
        const std = mat as THREE.MeshStandardMaterial
        if (std.emissive) std.emissive.setHex(orig.hex)
        std.emissiveIntensity = orig.intensity
      }
      hoverOrig.clear()
    }
    hoverId = id
    if (id != null) {
      const root = buildingRoots.get(id)
      root?.traverse((o) => {
        const mesh = o as THREE.Mesh
        if (!mesh.isMesh) return
        const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
        for (const m of mats) {
          const std = m as THREE.MeshStandardMaterial
          if (!std.emissive || hoverOrig.has(m)) continue
          hoverOrig.set(m, { hex: std.emissive.getHex(), intensity: std.emissiveIntensity })
          std.emissive.setHex(HOVER_EMISSIVE)
          std.emissiveIntensity = 0.25
        }
      })
    }
    renderer.domElement.style.cursor = id != null ? 'pointer' : 'grab'
  }

  /**
   * 拾取 = 屏幕空间最近楼：把每栋楼盒中心投影到屏幕，取与点击点最近（且在
   * 「楼投影半径 + 30px 容差」内）的可见楼。不用 raycast——射线会穿过前排楼的
   * 大拾取盒导致"点门诊2 聚焦门诊1"、远处小楼（行政楼）又点不中，两种误判同源。
   */
  function pickBuildingAt(clientX: number, clientY: number): number | null {
    const rect = renderer.domElement.getBoundingClientRect()
    pointerNdc.set(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      -((clientY - rect.top) / rect.height) * 2 + 1,
    )
    raycaster.setFromCamera(pointerNdc, camera)
    // 三角级精确 raycast：点哪面墙打中哪栋（拾取盒方案会因盒大于楼体互相穿帮——
    // 点门诊2 命中门诊1、远处行政楼点不中，均同源），一次性成本可接受
    const roots = [...buildingRoots.entries()].filter(([, r]) => r.visible).map(([, r]) => r)
    const hits = raycaster.intersectObjects(roots, true)
    for (const h of hits) {
      let p: THREE.Object3D | null = h.object
      while (p && p.userData.buildingId == null) p = p.parent
      if (p && p.userData.buildingId != null) return p.userData.buildingId as number
    }
    return null
  }

  const onPointerMove = (ev: PointerEvent) => {
    if (disposed || focusedId != null) return
    const now = performance.now()
    if (now - lastHoverAt < 100) return
    lastHoverAt = now
    setHover(pickBuildingAt(ev.clientX, ev.clientY))
  }

  const onPointerDown = (ev: PointerEvent) => {
    downX = ev.clientX
    downY = ev.clientY
  }

  const onPointerUp = (ev: PointerEvent) => {
    if (disposed || Math.hypot(ev.clientX - downX, ev.clientY - downY) >= 6) return
    const id = pickBuildingAt(ev.clientX, ev.clientY)
    cb.onPick?.(id != null ? { kind: 'building', buildingId: id } : { kind: 'background' })
  }

  renderer.domElement.addEventListener('pointermove', onPointerMove)
  renderer.domElement.addEventListener('pointerdown', onPointerDown)
  renderer.domElement.addEventListener('pointerup', onPointerUp)

  /** 单楼/园区取景机位：目标居中放大取景（dir = 从相机看向目标的方向，缺省全场南向） */
  function computeFit(box: THREE.Box3, dir: THREE.Vector3): { pos: THREE.Vector3; tg: THREE.Vector3 } {
    const target = box.getCenter(new THREE.Vector3())
    const size = box.getSize(new THREE.Vector3())
    const fovRad = THREE.MathUtils.degToRad(camera.fov)
    const W = Math.max(container.clientWidth, 1)
    const usableW = Math.max(W - SIDE_PANEL_PX * 2, W * 0.3)
    const hFov = 2 * Math.atan(Math.tan(fovRad / 2) * (usableW / W) * camera.aspect)
    const vDist = (Math.max(size.y, size.x * 0.7) / 2 / Math.tan(fovRad / 2)) * 1.35
    const hDist = (size.x / 2 / Math.tan(hFov / 2)) * 1.35
    const dist = Math.max(vDist, hDist, 40)
    const pos = target.clone().addScaledVector(dir, -dist)
    return { pos, tg: target }
  }

  /** 聚焦楼栋：相机飞近 + 其它楼隐藏（信息卡由页面负责显示）。
   *  机位方向按楼可配（focusDir），缺省全场南向——正门不朝南的楼（如行政楼朝东）单独指定 */
  function focusBuilding(id: number) {
    const root = buildingRoots.get(id)
    const box = buildingBoxes.get(id)
    if (!root || !box) return
    focusedId = id
    setHover(null)
    for (const [bid, r] of buildingRoots) r.visible = bid === id
    const cfg = buildings.find((b) => b.id === id)
    const dir = cfg?.focusDir
      ? new THREE.Vector3(...cfg.focusDir).normalize()
      : CAMPUS_FORWARD
    const { pos, tg } = computeFit(box, dir)
    flyTo(pos, tg)
  }

  /** 返回全景：恢复全部楼栋 + 相机飞回初始机位 */
  function backToCampus() {
    focusedId = null
    for (const r of buildingRoots.values()) r.visible = true
    const { pos, tg } = computeFit(campusBounds, CAMPUS_FORWARD)
    flyTo(pos, tg)
  }

  return { dispose, scene, focusBuilding, backToCampus }
}

/** 由摆位配置估算园区包围盒（加载前就能取景）。
 *  必须用本体 foot 偏移——targetFoot 粗估半径对含桥综合楼（200）会把取景盒撑到
 *  500m 外，相机超远、观感"楼都被压缩"（与 hospitalGround 的 yard 同型坑）。 */
function boundsFromConfig(buildings: CampusBuildingConfig[]): THREE.Box3 {
  const box = new THREE.Box3()
  for (const cfg of buildings) {
    const fx = cfg.foot?.x ?? [-cfg.targetFoot / 2, cfg.targetFoot / 2]
    const fz = cfg.foot?.z ?? [-cfg.targetFoot / 2, cfg.targetFoot / 2]
    box.expandByPoint(new THREE.Vector3(cfg.pos[0] + fx[0], 0, cfg.pos[1] + fz[0]))
    box.expandByPoint(new THREE.Vector3(cfg.pos[0] + fx[1], 60, cfg.pos[1] + fz[1]))
  }
  return box
}

/** 取景：楼群落在两侧面板之间的中央带（safeHalf 思路，福永 viewSafeHalf 简化版） */
function fitCameraTo(box: THREE.Box3, camera: THREE.PerspectiveCamera, container: HTMLElement) {
  const target = box.getCenter(new THREE.Vector3())
  const size = box.getSize(new THREE.Vector3())
  const fovRad = THREE.MathUtils.degToRad(camera.fov)
  // 有效横向视场：画面宽减去两侧面板占位后再算水平 fov
  const W = Math.max(container.clientWidth, 1)
  const usableW = Math.max(W - SIDE_PANEL_PX * 2, W * 0.3)
  const hFov = 2 * Math.atan(Math.tan(fovRad / 2) * (usableW / W) * camera.aspect)
  const vDist = (Math.max(size.y, size.x * 0.7) / 2 / Math.tan(fovRad / 2)) * 1.35
  const hDist = (size.x / 2 / Math.tan(hFov / 2)) * 1.35
  const dist = Math.max(vDist, hDist, 60)
  camera.position.copy(target).addScaledVector(CAMPUS_FORWARD, -dist)
  camera.lookAt(target)
}
