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
import { CSS2DObject, CSS2DRenderer } from 'three/addons/renderers/CSS2DRenderer.js'
import { floorKeyOfNode } from './buildings'
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

/** 园区全屏楼层告警引线卡输入（HTML 由页面组装，楼层键为契约 floor 字符串） */
export interface FloorAlarmCalloutInput {
  id: string
  buildingId: number
  floorKey: string
  tone: 'error' | 'warn'
  /** 同屏多枚时卡片垂直错层（px） */
  shift: number
  /** 卡片内部 HTML（dot/leader/card 结构，样式见 src/styles/theme.css .floor-callout） */
  html: string
}

export interface CampusSceneCallbacks {
  /** 加载进度（done 含失败栋） */
  onProgress?: (done: number, total: number) => void
  /** 全部楼栋处理完（含失败）后一次性回调 */
  onReady?: () => void
  /** 点楼/点层/点空白（按下抬起位移 <6px 判点击；空白=kind background；
   *  kind floor=楼栋聚焦态命中当前楼的某层，floor=契约楼层键） */
  onPick?: (pick: { kind: 'building' | 'floor' | 'background'; buildingId?: number; floor?: string }) => void
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

  // CSS2D 覆盖层（全屏告警引线卡，福永 LabelManager 同机制）：three.js 每帧把场景内
  // CSS2DObject 投影到本层——与 canvas 同容器同像素系，App transform:scale 对两者
  // 一体缩放，不存在布局/视觉坐标换算，从根上消灭手动投影对不齐的坑。
  // z=6 在楼名标签层（z5）之上；pointer-events none 不挡交互。
  const css2d = new CSS2DRenderer()
  css2d.setSize(container.clientWidth, container.clientHeight)
  css2d.domElement.style.cssText =
    'position:absolute;top:0;left:0;pointer-events:none;overflow:hidden;z-index:6;'
  container.appendChild(css2d.domElement)

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
  // 取景距离只按核心楼群（与路网 yard 同口径）——行政楼等独立地块参与推距会把相机推到
  // 数百米外的超远景（用户观感"楼都被压缩了"的真根因）；但目标中心按全部楼栋并对齐，
  // 行政楼完整入画（2026-11-19 拍板：镜头西移，最东端天桥允许被右面板遮住一点）
  const campusBounds = boundsFromConfig(buildings.filter((b) => layout.coreIds.includes(b.id)))
  const viewBounds = boundsFromConfig(buildings)
  /** 全景取景盒：初始为配置估算，楼栋就绪后换真实渲染盒（含桥尖等附属悬出） */
  let framedBounds: THREE.Box3 = viewBounds
  fitCameraTo(campusBounds, framedBounds, camera, container)
  controls.target.copy(framedBounds.getCenter(new THREE.Vector3()))
  controls.update()
  // 用户一旦手动转/缩放相机，就绪后的真值对中飞行作废（不打断用户构图）
  let userOrbited = false
  controls.addEventListener('start', () => {
    userOrbited = true
  })

  // ---- 渲染循环 ----
  let raf = 0
  let disposed = false
  // 全屏告警引线卡状态（声明上移：tick 内要用，见下方「全屏告警引线卡」区块）
  let calloutPayload: FloorAlarmCalloutInput[] = []
  let calloutsWanted = false
  let entranceDone = false
  let growStarted = false
  /** 引线卡组（整树显隐——three 0.186 CSS2DRenderer 支持父链 visible 隐藏） */
  const calloutGroup = new THREE.Group()
  calloutGroup.name = 'floor-alarm-callouts'
  scene.add(calloutGroup)
  /** 进场生长动画队列（福永 growBuildings 同款）：全部就绪后逐栋错峰升起 */
  const growQueue: { holder: THREE.Group; startAt: number }[] = []
  /** smootherstep 缓动（福永同款） */
  const smootherstep = (t: number) => t * t * t * (t * (t * 6 - 15) + 10)
  const GROW_DURATION = 650
  const GROW_STAGGER = 90
  /** 地面先出现、定一拍再起楼（2026-11-19：首帧即全景后，楼和地同出会显得动画一闪而过） */
  const GROW_DELAY = 350
  /** 相机飞行（点楼聚焦/返回全景）：每帧插值比例与时长 */
  const FLY_STEP = 0.09

  const v3 = new THREE.Vector3()
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
    // 告警楼层呼吸闪烁（红/琥珀按 level，强度 sin 波动）
    if (alarmMeshes.size) {
      const breath = 0.55 + 0.45 * Math.abs(Math.sin(now / 400))
      for (const info of alarmMeshes.values()) {
        const cloned = info.cloned as THREE.MeshStandardMaterial
        if (cloned.emissive) cloned.emissiveIntensity = breath
      }
    }
    // 楼层聚焦蓝脉冲（选中层克隆材质，主题蓝呼吸）
    if (floorFocusMats.size) {
      const breath = 0.3 + 0.3 * Math.abs(Math.sin(now / 500))
      for (const info of floorFocusMats.values()) {
        const std = info.cloned as THREE.MeshStandardMaterial
        if (std.emissive) std.emissiveIntensity = breath
      }
    }
    // 楼名标签跟随投影
    for (const id of labelEls.keys()) projectTop(id)
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
    // 进场生长播完（growStarted 后队列清空）→ 引线卡此刻才挂：锚点 side 按就位
    // 真机位算，且生长中的压扁楼不该顶着一堆卡
    if (growStarted && !entranceDone && growQueue.length === 0) {
      entranceDone = true
      rebuildFloorAlarmCallouts()
    }
    controls.update()
    renderer.render(scene, camera)
    css2d.render(scene, camera)
    raf = requestAnimationFrame(tick)
  }
  // 渲染循环不在此启动：等楼栋全部加载、相机按真实包围盒就位后再开（见加载 IIFE 尾部）——
  // 首帧即最终构图，消灭「加载完镜头再挪一帧」的跳变（2026-11-19 用户拍板）

  const onResize = () => {
    const w = container.clientWidth
    const h = container.clientHeight
    if (w === 0 || h === 0) return
    camera.aspect = w / h
    camera.updateProjectionMatrix()
    renderer.setSize(w, h)
    css2d.setSize(w, h)
  }
  const ro = new ResizeObserver(onResize)
  ro.observe(container)

  /** 楼名标签层：绝对定位覆盖层（pointer-events none），每帧按楼顶投影摆位 */
  const labelHost = document.createElement('div')
  labelHost.style.cssText =
    'position:absolute;inset:0;pointer-events:none;overflow:hidden;z-index:5;'
  container.appendChild(labelHost)

  const makeLabel = (id: number, name: string) => {
    const el = document.createElement('div')
    // 福永楼名标签同款：白玻璃圆角卡，楼名大字 + kWh 小字两行居中
    el.style.cssText = [
      'position:absolute',
      'transform:translate(-50%,-100%)',
      'padding:6px 18px',
      'border-radius:10px',
      'background:rgba(255,255,255,0.85)',
      'border:1px solid rgba(255,255,255,0.95)',
      'box-shadow:0 4px 14px rgba(43,108,160,0.18)',
      'text-align:center',
      'white-space:nowrap',
      'pointer-events:none',
    ].join(';')
    el.innerHTML =
      `<div style="font-size:15px;font-weight:700;color:#2b7ce3;line-height:1.5">${name}</div>` +
      `<div class="kwh" style="font-size:13px;color:#2b7ce3;line-height:1.4">—</div>`
    labelHost.appendChild(el)
    labelEls.set(id, el)
  }

  const projectTop = (id: number) => {
    const box = buildingBoxes.get(id)
    const root = buildingRoots.get(id)
    const el = labelEls.get(id)
    if (!box || !root || !el) return
    if (!root.visible) {
      el.style.display = 'none'
      return
    }
    const center = box.getCenter(new THREE.Vector3())
    center.y = box.max.y + (root.userData.labelLift as number ?? 8)
    v3.copy(center).project(camera)
    if (v3.z > 1) {
      el.style.display = 'none'
      return
    }
    // 楼层聚焦态隐藏全部楼名标签（楼名卡挡下钻视线；退回全景/楼栋态自动恢复）
    if (focusedFloor != null) {
      el.style.display = 'none'
      return
    }
    // 标签挂在 container（labelHost）内——必须用 container 的布局尺寸换算，
    // 不能用 getBoundingClientRect（App 外层 transform:scale 会把两者差出一个缩放因子，
    // 标签整体偏移——2026-11-18 用户截图实锤）
    el.style.display = 'block'
    el.style.left = `${(v3.x * 0.5 + 0.5) * container.clientWidth}px`
    el.style.top = `${(-v3.y * 0.5 + 0.5) * container.clientHeight}px`
  }

  /** 楼栋注册表：id → 摆位 holder / 世界盒 / 楼层节点映射（亮灯用） */
  const buildingRoots = new Map<number, THREE.Group>()
  const buildingBoxes = new Map<number, THREE.Box3>()
  const buildingFloors = new Map<number, Map<string, THREE.Object3D>>()
  /** 楼层静态世界盒：buildingId → floorKey → Box3（加载摆位后算定，与楼名标签/
   *  聚焦取景同源；引线卡锚点用） */
  const floorWorldBoxes = new Map<number, Map<string, THREE.Box3>>()
  /** 最近一次告警集合（§3.1 首拉可能先于楼栋加载完成，加载后回放亮灯） */
  let pendingAlarms: { buildingId: number; floorKey: string; level: number }[] | null = null
  /** 最近一次染色数据（§2.1 可能先于楼栋加载完成，标签创建时回填 kWh）。
   *  用包装对象避开 TS 对闭包 let 的 null 收窄误报 */
  const pendingKwh: { data: Map<number, number> | null } = { data: null }

  // ---- 数据联动状态（批3）：告警楼层亮灯 / 楼名标签 ----
  /** 告警楼层：mesh → 克隆材质+等级（灭灯还原共享材质） */
  const alarmMeshes = new Map<THREE.Mesh, { level: number; orig: THREE.Material; cloned: THREE.Material }>()
  /** 楼名标签 DOM（楼名 + 今日 kWh，屏幕投影自绘） */
  const labelEls = new Map<number, HTMLDivElement>()

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
        b.object.userData.labelLift = cfg.labelLift ?? 8
        scene.add(b.object)
        buildingRoots.set(cfg.id, b.object)
        buildingBoxes.set(cfg.id, b.box)
        buildingFloors.set(cfg.id, b.floors)
        floorWorldBoxes.set(cfg.id, b.floorBoxes)
        grown.push(b.object)
      }
      done++
      cb.onProgress?.(done, buildings.length)
    }
    if (disposed) return
    // 楼名标签（建好即回填 kWh 时序差：§2.1 可能先于加载完成到达）
    for (const cfg of buildings) {
      if (buildingRoots.has(cfg.id)) {
        makeLabel(cfg.id, cfg.name)
        const cached = pendingKwh.data?.get(cfg.id)
        if (cached) {
          const kwhEl = labelEls.get(cfg.id)?.querySelector('.kwh')
          if (kwhEl) kwhEl.textContent = `${cached.toLocaleString('zh-CN')} kWh`
        }
      }
    }
    // 告警亮灯回放（§3.1 首拉可能先于楼栋加载完成）
    if (pendingAlarms) applyAlarms(pendingAlarms)
    // 真值对中：配置估算盒量不到附属悬出（综合楼桥尖东伸 ~25m，画面中心偏西、
    // 左右留空不对称）——按真实渲染盒一次就位。此刻尚未开渲染循环，用户看到的
    // 一直是进度条+底色，不存在任何画面跳变；用户已手动转相机则不摆（userOrbited）
    const trueBounds = new THREE.Box3()
    for (const b of buildingBoxes.values()) trueBounds.union(b)
    if (!trueBounds.isEmpty()) {
      framedBounds = trueBounds
      if (!userOrbited) {
        const { pos, tg } = computeFit(campusBounds, trueBounds, CAMPUS_FORWARD)
        camera.position.copy(pos)
        controls.target.copy(tg)
        camera.lookAt(tg)
      }
    }
    // 预编译着色器：渲染循环延迟启动后，首帧编译可达数百毫秒，若落在生长动画
    // 计时内会把动画"吃掉"（编译返回时 t 已过半、楼近乎直接满高出现）。
    // 先编译再起表，生长从 t=0 完整播放
    renderer.compile(scene, camera)
    const t0 = performance.now()
    grown.forEach((holder, i) => growQueue.push({ holder, startAt: t0 + GROW_DELAY + i * GROW_STAGGER }))
    // 相机就位后才开渲染循环：首帧即最终构图
    raf = requestAnimationFrame(tick)
    growStarted = true
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
    clearFloorFocusVisual()
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
    css2d.domElement.remove()
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
        // 告警亮灯层的克隆材质不参与 hover（保持红/琥珀呼吸不被蓝光覆盖）
        if (!mesh.isMesh || alarmMeshes.has(mesh)) return
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
    // 楼栋聚焦态先试楼层拾取（命中当前楼的某层 → 楼层点击）；未命中层再走楼/空白
    if (focusedId != null) {
      const fl = pickFloorAt(ev.clientX, ev.clientY)
      if (fl) {
        cb.onPick?.({ kind: 'floor', buildingId: fl.buildingId, floor: fl.floor })
        return
      }
    }
    const id = pickBuildingAt(ev.clientX, ev.clientY)
    cb.onPick?.(id != null ? { kind: 'building', buildingId: id } : { kind: 'background' })
  }

  renderer.domElement.addEventListener('pointermove', onPointerMove)
  renderer.domElement.addEventListener('pointerdown', onPointerDown)
  renderer.domElement.addEventListener('pointerup', onPointerUp)

  /** 取景机位：距离按 distBox 算（聚焦=单楼、全景=核心楼群，独立地块不推远相机），
   *  目标中心与最小带宽按 targetBox（全景传全部楼栋：行政楼完整入画，带宽不足按
   *  10% 余量补距离，最东端附属允许被面板遮挡）。dir = 从相机看向目标的方向 */
  function computeFit(distBox: THREE.Box3, targetBox: THREE.Box3, dir: THREE.Vector3): { pos: THREE.Vector3; tg: THREE.Vector3 } {
    const target = targetBox.getCenter(new THREE.Vector3())
    const size = distBox.getSize(new THREE.Vector3())
    const fovRad = THREE.MathUtils.degToRad(camera.fov)
    const W = Math.max(container.clientWidth, 1)
    const usableW = Math.max(W - SIDE_PANEL_PX * 2, W * 0.3)
    const hFov = 2 * Math.atan(Math.tan(fovRad / 2) * (usableW / W) * camera.aspect)
    const vDist = (Math.max(size.y, size.x * 0.7) / 2 / Math.tan(fovRad / 2)) * 1.35
    const hDist = (size.x / 2 / Math.tan(hFov / 2)) * 1.35
    const dist = Math.max(
      vDist,
      hDist,
      40,
      (targetBox.getSize(new THREE.Vector3()).x / 2 / Math.tan(hFov / 2)) * 1.1,
    )
    const pos = target.clone().addScaledVector(dir, -dist)
    return { pos, tg: target }
  }

  /** 聚焦楼栋：相机飞近 + 其它楼隐藏（信息卡由页面负责显示）。
   *  机位方向按楼可配（focusDir），缺省全场南向——正门不朝南的楼（如行政楼朝东）单独指定 */
  function focusBuilding(id: number) {
    const root = buildingRoots.get(id)
    const box = buildingBoxes.get(id)
    if (!root || !box) return
    clearFloorFocusVisual()
    focusedFloor = null
    focusedId = id
    setHover(null)
    for (const [bid, r] of buildingRoots) r.visible = bid === id
    const cfg = buildings.find((b) => b.id === id)
    const dir = cfg?.focusDir
      ? new THREE.Vector3(...cfg.focusDir).normalize()
      : CAMPUS_FORWARD
    const { pos, tg } = computeFit(box, box, dir)
    flyTo(pos, tg)
  }

  /** 返回全景：恢复全部楼栋 + 相机飞回初始机位 */
  function backToCampus() {
    clearFloorFocusVisual()
    focusedFloor = null
    focusedId = null
    for (const r of buildingRoots.values()) r.visible = true
    const { pos, tg } = computeFit(campusBounds, framedBounds, CAMPUS_FORWARD)
    flyTo(pos, tg)
  }

  // ---- 楼层交互（二期批1）：楼层清单 / 楼层聚焦（下钻）/ 楼层拾取 ----

  /** 楼层聚焦视觉参数：pop 横向放大系数 / 其余层压暗系数 / 选中层主题蓝 */
  const FLOOR_POP_SCALE = 1.06
  const FLOOR_DIM = 0.42
  const FLOOR_FOCUS_EMISSIVE = 0x2b7ce3
  /** 选中层克隆材质（mesh → 原材质），退出时还原+dispose 克隆 */
  const floorFocusMats = new Map<THREE.Mesh, { orig: THREE.Material; cloned: THREE.Material }>()
  /** 压暗原色表（按材质记录——GLB 共享材质坑同 hover：按 mesh 记会把改色当原色） */
  const dimmedOrig = new Map<THREE.Material, { color: number; emissive: number; intensity: number }>()
  /** pop 前 scale（退出还原） */
  const popOrig = new Map<THREE.Object3D, THREE.Vector3>()
  /** 告警楼层表："{buildingId}|{floorKey}" → level（同层多条取更高=数值更小）。
   *  引线卡锚点按同表楼层取静态盒（getCalloutFloorBox） */
  const alarmFloorLevels = new Map<string, number>()
  /** 当前聚焦楼层（契约键；null = 楼栋聚焦态未选层） */
  let focusedFloor: string | null = null

  /** 楼层键清单（升序 B<G<正数；来自 GLB 楼层节点解析，无节点层不出现——
   *  六栋无 GF，floor "G" 不在列；地下层等 _under 接入后自然出现） */
  function getFloors(buildingId: number): string[] {
    const m = buildingFloors.get(buildingId)
    if (!m) return []
    const order = (f: string) => (f === 'G' ? 0 : Number(f))
    return [...m.keys()].sort((a, b) => order(a) - order(b))
  }

  /** 还原楼层聚焦的全部视觉（克隆材质/压暗色/pop scale） */
  function clearFloorFocusVisual() {
    for (const [mesh, info] of floorFocusMats) {
      mesh.material = info.orig
      info.cloned.dispose()
    }
    floorFocusMats.clear()
    for (const [mat, orig] of dimmedOrig) {
      const std = mat as THREE.MeshStandardMaterial
      std.color.setHex(orig.color)
      std.emissive.setHex(orig.emissive)
      std.emissiveIntensity = orig.intensity
    }
    dimmedOrig.clear()
    for (const [obj, s] of popOrig) obj.scale.copy(s)
    popOrig.clear()
  }

  /** 压暗整楼非选中层（幂等：已记录材质跳过；告警层克隆材质不压——保持红橙呼吸）。
   *  applyAlarms 在聚焦期间刷新后，新亮告警层的体色已按原色表还原，无需重压。 */
  function dimBuildingExcept(selected: THREE.Object3D) {
    const root = focusedId != null ? buildingRoots.get(focusedId) : null
    if (!root) return
    const inSelected = (o: THREE.Object3D) => {
      let p: THREE.Object3D | null = o
      while (p) {
        if (p === selected) return true
        p = p.parent
      }
      return false
    }
    root.traverse((o) => {
      const mesh = o as THREE.Mesh
      if (!mesh.isMesh || inSelected(mesh) || alarmMeshes.has(mesh)) return
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
      for (const m of mats) {
        const std = m as THREE.MeshStandardMaterial
        if (!std.emissive || dimmedOrig.has(m)) continue
        dimmedOrig.set(m, {
          color: std.color.getHex(),
          emissive: std.emissive.getHex(),
          intensity: std.emissiveIntensity,
        })
        std.color.multiplyScalar(FLOOR_DIM)
        std.emissive.setHex(0x000000)
        std.emissiveIntensity = 0
      }
    })
  }

  /** 楼层聚焦视觉三件套：选中层克隆材质蓝脉冲 + 横向 pop（y 锁死）+ 其余层压暗 */
  function applyFloorFocus(node: THREE.Object3D) {
    clearFloorFocusVisual()
    popOrig.set(node, node.scale.clone())
    node.scale.x *= FLOOR_POP_SCALE
    node.scale.z *= FLOOR_POP_SCALE
    node.traverse((o) => {
      const mesh = o as THREE.Mesh
      // 告警亮灯层的克隆材质不参与（红/橙呼吸不被蓝光覆盖）
      if (!mesh.isMesh || alarmMeshes.has(mesh)) return
      const orig = mesh.material as THREE.Material
      const cloned = orig.clone()
      mesh.material = cloned
      floorFocusMats.set(mesh, { orig, cloned })
      const std = cloned as THREE.MeshStandardMaterial
      if (std.emissive) {
        std.emissive.setHex(FLOOR_FOCUS_EMISSIVE)
        std.emissiveIntensity = 0.5
      }
    })
    dimBuildingExcept(node)
  }

  /** 聚焦楼层（楼栋聚焦态的子状态）：相机飞至该层包围盒 + 楼层聚焦视觉。
   *  机位方向继承楼栋 focusDir（行政楼正门朝东——楼层聚焦与楼栋聚焦同机位方向），
   *  缺省全场南向。楼层行清单来自 getFloors（GLB 实际节点）；页面负责信息卡/看板切换。 */
  function focusFloor(buildingId: number, floorKey: string) {
    const node = buildingFloors.get(buildingId)?.get(floorKey)
    if (!node) return
    focusedId = buildingId
    focusedFloor = floorKey
    setHover(null)
    for (const [bid, r] of buildingRoots) r.visible = bid === buildingId
    applyFloorFocus(node)
    const box = new THREE.Box3().setFromObject(node)
    const cfg = buildings.find((b) => b.id === buildingId)
    const dir = cfg?.focusDir ? new THREE.Vector3(...cfg.focusDir).normalize() : CAMPUS_FORWARD
    const { pos, tg } = computeFit(box, box, dir)
    flyTo(pos, tg)
  }

  /** 退出楼层聚焦回楼栋聚焦：还原楼层视觉 + 相机飞回楼栋机位（楼层态的一级返回
   *  直接回全景走 backToCampus，本方法供「层间对比」等中间态使用） */
  function backToBuilding() {
    if (focusedFloor == null || focusedId == null) return
    clearFloorFocusVisual()
    focusedFloor = null
    const box = buildingBoxes.get(focusedId)
    if (!box) return
    const cfg = buildings.find((b) => b.id === focusedId)
    const dir = cfg?.focusDir ? new THREE.Vector3(...cfg.focusDir).normalize() : CAMPUS_FORWARD
    const { pos, tg } = computeFit(box, box, dir)
    flyTo(pos, tg)
  }

  /** 楼层拾取（楼栋聚焦态专用）：三角级 raycast 命中后沿父链找楼层节点名。
   *  命中楼但无楼层节点（屋顶/附属/非层 mesh）返回 null——调用方按整楼处理。 */
  function pickFloorAt(clientX: number, clientY: number): { buildingId: number; floor: string } | null {
    const rect = renderer.domElement.getBoundingClientRect()
    pointerNdc.set(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      -((clientY - rect.top) / rect.height) * 2 + 1,
    )
    raycaster.setFromCamera(pointerNdc, camera)
    const roots = [...buildingRoots.entries()].filter(([, r]) => r.visible).map(([, r]) => r)
    const hits = raycaster.intersectObjects(roots, true)
    for (const h of hits) {
      let floorKey: string | null = null
      let p: THREE.Object3D | null = h.object
      while (p) {
        if (floorKey == null && p.name) {
          const k = floorKeyOfNode(p.name)
          if (k != null) floorKey = k
        }
        if (p.userData.buildingId != null) {
          return floorKey != null
            ? { buildingId: p.userData.buildingId as number, floor: floorKey }
            : null
        }
        p = p.parent
      }
    }
    return null
  }

  // ---- 全屏告警引线卡（福永 floorCallouts 同机制，宝中重写）：
  //  场景内挂 CSS2DObject，投影由 CSS2DRenderer 每帧自算——圆点就是它挂在楼立面上的
  //  世界锚点，与 canvas 同容器同像素系，没有手动屏幕坐标换算这一环。页面只在数据/
  //  全屏态变化时整组重建（不逐帧轮询）；进场生长播完才挂（福永 campusEntranceDone
  //  同款——锚点 side 按就位真机位算）。福永不做遮挡剔除，同口径从简。

  /** 全量替换引线卡（空数组 = 清掉） */
  function setFloorAlarmCallouts(items: FloorAlarmCalloutInput[]) {
    calloutPayload = items
    calloutsWanted = items.length > 0
    rebuildFloorAlarmCallouts()
  }

  function rebuildFloorAlarmCallouts() {
    for (const child of [...calloutGroup.children]) child.removeFromParent()
    calloutGroup.visible = false
    if (!calloutsWanted || !entranceDone) return
    calloutGroup.visible = true
    camera.updateMatrixWorld()
    for (const it of calloutPayload) {
      const bb = getCalloutFloorBox(it.buildingId, it.floorKey)
      if (!bb) continue
      const side = screenSideOfBox(bb)
      const pos = getFloorFacadePointFromBox(bb, side === 'left' ? 0.32 : 0.68, 0.98)
      if (!pos) continue
      const el = document.createElement('div')
      el.className = `floor-callout is-${side} tone-${it.tone}`
      el.style.setProperty('--callout-shift', `${it.shift}px`)
      el.innerHTML = it.html
      const obj = new CSS2DObject(el)
      obj.position.copy(pos)
      calloutGroup.add(obj)
    }
  }

  /** 引线卡锚点用楼层盒：XZ 取楼层静态盒与楼体真盒交集（防附属件撑大盒），y 用楼层盒 */
  function getCalloutFloorBox(buildingId: number, floorKey: string) {
    const fb = floorWorldBoxes.get(buildingId)?.get(floorKey)
    const fp = buildingBoxes.get(buildingId)
    if (!fb || !fp) return null
    const minX = Math.max(fb.min.x, fp.min.x)
    const maxX = Math.min(fb.max.x, fp.max.x)
    const minZ = Math.max(fb.min.z, fp.min.z)
    const maxZ = Math.min(fb.max.z, fp.max.z)
    if (maxX - minX <= 0 || maxZ - minZ <= 0) return null
    return { minX, maxX, minZ, maxZ, minY: fb.min.y, maxY: fb.max.y }
  }

  /** 盒中心投 NDC 判屏幕左右半（卡片往外侧伸，避免遮楼） */
  function screenSideOfBox(bb: {
    minX: number
    maxX: number
    minY: number
    maxY: number
    minZ: number
    maxZ: number
  }): 'left' | 'right' {
    v3.set((bb.minX + bb.maxX) / 2, (bb.minY + bb.maxY) / 2, (bb.minZ + bb.maxZ) / 2).project(camera)
    return v3.x >= 0 ? 'right' : 'left'
  }

  /** 朝相机的立面锚点（福永 getFloorFacadePointFromBox 同款）：edgeU 沿立面横向 0..1，
   *  faceScale 沿视线比例（0.98=贴立面微内收） */
  function getFloorFacadePointFromBox(
    bb: { minX: number; maxX: number; minY: number; maxY: number; minZ: number; maxZ: number },
    edgeU: number,
    faceScale: number,
  ): THREE.Vector3 {
    const cy = (bb.minY + bb.maxY) / 2
    const center = new THREE.Vector3((bb.minX + bb.maxX) * 0.5, cy, (bb.minZ + bb.maxZ) * 0.5)
    const dir = new THREE.Vector3().subVectors(camera.position, center)
    dir.y = 0
    if (dir.lengthSq() < 1e-8) dir.set(0, 0, 1)
    else dir.normalize()
    const halfX = (bb.maxX - bb.minX) * 0.5
    const halfZ = (bb.maxZ - bb.minZ) * 0.5
    const tX = Math.abs(dir.x) > 1e-6 ? halfX / Math.abs(dir.x) : Number.POSITIVE_INFINITY
    const tZ = Math.abs(dir.z) > 1e-6 ? halfZ / Math.abs(dir.z) : Number.POSITIVE_INFINITY
    const onFace = center.addScaledVector(dir, Math.min(tX, tZ) * faceScale)
    const perp = new THREE.Vector3(-dir.z, 0, dir.x)
    const halfLat = (tX < tZ ? halfZ : halfX) * 0.72
    onFace.addScaledVector(perp, (THREE.MathUtils.clamp(edgeU, 0, 1) - 0.5) * 2 * halfLat)
    onFace.x = THREE.MathUtils.clamp(onFace.x, bb.minX + halfX * 0.06, bb.maxX - halfX * 0.06)
    onFace.y = cy
    onFace.z = THREE.MathUtils.clamp(onFace.z, bb.minZ + halfZ * 0.06, bb.maxZ - halfZ * 0.06)
    return onFace
  }

  // ---- 数据联动（批3）：楼名标签 kWh + 告警楼层亮灯 ----

  /** 楼名标签 kWh 更新（§2.1 轮询数据；2026-11-18 用户拍板：删整楼染色，只保留
   *  告警楼层亮灯——楼体 emissive 不做能耗染色） */
  function setBuildingEnergy(kwhById: Map<number, number>) {
    pendingKwh.data = kwhById
    for (const [id, kwh] of kwhById) {
      const el = labelEls.get(id)
      const kwhEl = el?.querySelector('.kwh')
      if (kwhEl) kwhEl.textContent = `${kwh.toLocaleString('zh-CN')} kWh`
    }
  }

  /** 告警楼层亮灯（全量替换）：level 1 紧急红 / 2 严重琥珀，呼吸闪烁；
   *  亮灯层用克隆材质（快照当前染色+告警色），灭灯还原共享材质。
   *  alarms 会缓存（pendingAlarms）——§3.1 首拉可能先于楼栋加载完成，加载后自动回放。 */
  function setBuildingAlarms(alarms: { buildingId: number; floorKey: string; level: number }[]) {
    pendingAlarms = alarms
    applyAlarms(alarms)
  }

  function applyAlarms(alarms: { buildingId: number; floorKey: string; level: number }[]) {
    // 全灭：还原共享材质
    for (const [mesh, info] of alarmMeshes) {
      mesh.material = info.orig
      info.cloned.dispose()
    }
    alarmMeshes.clear()
    alarmFloorLevels.clear()
    for (const a of alarms) {
      const key = `${a.buildingId}|${a.floorKey}`
      const prev = alarmFloorLevels.get(key)
      if (prev != null) {
        alarmFloorLevels.set(key, Math.min(prev, a.level))
        continue
      }
      const node = buildingFloors.get(a.buildingId)?.get(a.floorKey)
      if (!node) continue
      node.traverse((o) => {
        const mesh = o as THREE.Mesh
        if (!mesh.isMesh || alarmMeshes.has(mesh)) return
        const orig = mesh.material as THREE.Material
        const cloned = orig.clone()
        mesh.material = cloned
        alarmMeshes.set(mesh, { level: a.level, orig, cloned })
        const std = cloned as THREE.MeshStandardMaterial
        if (std.emissive) {
          std.emissive.setHex(a.level === 1 ? 0xe53e3e : 0xed8936)
          std.emissiveIntensity = 0.6
        }
        // 楼层聚焦压暗后新亮的告警层：克隆继承的是压暗体色，按原色表还原
        const o2 = dimmedOrig.get(orig)
        if (o2) std.color.setHex(o2.color)
      })
      alarmFloorLevels.set(key, a.level)
    }
  }

  return {
    dispose,
    scene,
    focusBuilding,
    backToCampus,
    /** 楼层能力（二期批1） */
    getFloors,
    focusFloor,
    backToBuilding,
    setFloorAlarmCallouts,
    setBuildingEnergy,
    setBuildingAlarms,
  }
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

/** 初始全景机位（与 computeFit 同规则，直接摆位不飞行）：距离按核心楼群、
 *  中心对齐全部楼栋并保证全部楼栋主体入画（带宽 10% 余量） */
function fitCameraTo(distBox: THREE.Box3, targetBox: THREE.Box3, camera: THREE.PerspectiveCamera, container: HTMLElement) {
  const target = targetBox.getCenter(new THREE.Vector3())
  const size = distBox.getSize(new THREE.Vector3())
  const fovRad = THREE.MathUtils.degToRad(camera.fov)
  // 有效横向视场：画面宽减去两侧面板占位后再算水平 fov
  const W = Math.max(container.clientWidth, 1)
  const usableW = Math.max(W - SIDE_PANEL_PX * 2, W * 0.3)
  const hFov = 2 * Math.atan(Math.tan(fovRad / 2) * (usableW / W) * camera.aspect)
  const vDist = (Math.max(size.y, size.x * 0.7) / 2 / Math.tan(fovRad / 2)) * 1.35
  const hDist = (size.x / 2 / Math.tan(hFov / 2)) * 1.35
  const dist = Math.max(
    vDist,
    hDist,
    60,
    (targetBox.getSize(new THREE.Vector3()).x / 2 / Math.tan(hFov / 2)) * 1.1,
  )
  camera.position.copy(target).addScaledVector(CAMPUS_FORWARD, -dist)
  camera.lookAt(target)
}
