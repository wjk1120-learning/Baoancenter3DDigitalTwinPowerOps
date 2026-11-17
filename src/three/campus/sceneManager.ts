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
  const campusBounds = boundsFromConfig(buildings)
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

  // ---- 六栋串行加载（Draco；失败不阻塞，进度含失败栋） ----
  // 楼栋就绪先压扁隐藏，全部就绪后统一错峰生长（福永进场动画同款观感）
  void (async () => {
    let done = 0
    const grown: THREE.Group[] = []
    for (const cfg of buildings) {
      const b = await loadBuilding(cfg)
      if (!disposed && b) {
        b.object.scale.y = 0.0001
        scene.add(b.object)
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

  return { dispose, scene }
}

/** 由摆位配置估算园区包围盒（加载前就能取景） */
function boundsFromConfig(buildings: CampusBuildingConfig[]): THREE.Box3 {
  const box = new THREE.Box3()
  for (const cfg of buildings) {
    const r = cfg.targetFoot * 0.62
    box.expandByPoint(new THREE.Vector3(cfg.pos[0] - r, 0, cfg.pos[1] - r))
    box.expandByPoint(new THREE.Vector3(cfg.pos[0] + r, 40, cfg.pos[1] + r))
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
