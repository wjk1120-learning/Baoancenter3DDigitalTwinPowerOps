/**
 * 设备详情 3D 场景（单柜特写，福永 DeviceScene.setDeviceFocus 的宝中简版）：
 * - 模型按柜型从 models/cabinets/*.glb 加载；模板模块级缓存 + 归一化 + clone，
 *   机制与配电房 engine/scene.ts 同款（柜高统一 2.2、内层烘缩放、失败不缓存重试）；
 * - 相机机位沿用配电房 focusLayout 角度（FOV 42、俯仰 17°、偏航 12°），按单柜包围盒取景；
 * - 入场：柜体 scale.y backOut 0.45s 弹出 + 相机 1.6 倍远景 lerp 飞入；落定后柜体缓慢
 *   自转（约 80 秒一圈，福永同款；拖动暂停、松手恢复），OrbitControls 可旋转/缩放；
 *   无名牌、无母线、无测点标签（2026-11-06 用户定稿：去名牌 + 加缓慢自动旋转）。
 */
import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js'

const CABINET_HEIGHT = 2.2
// BASE_URL 前缀跟随 vite base（/baozhongTwin/），域名根绝对路径在带前缀部署下会 404
const MODEL_URL = (m: string) => `${import.meta.env.BASE_URL}models/cabinets/${m}.glb`

/** 台账柜型 → 模型文件名（宝中 4+1 类型；与 mock MODEL_TO_TYPE 互为反向，两处改动要同步） */
const TYPE_TO_MODEL: Record<string, string> = {
  低压柜: 'jinxian',
  配电柜: 'peidiangui',
  电容柜: 'dianrongui',
  // 文件名沿用现场素材原名拼写（shaungdianyaun.glb，非笔误）
  双电源切换柜: 'shaungdianyaun',
  高压柜: 'gaoyagui',
}

export function modelOfType(type: string | null | undefined): string {
  return TYPE_TO_MODEL[String(type ?? '').trim()] ?? 'peidiangui'
}

// ---- 机位（配电房 engine/scene.ts 同款常量） ----
const PERSP_FOV = 42
const CAM_PITCH = (17 * Math.PI) / 180
const CAM_YAW = (12 * Math.PI) / 180
/** 单柜取景距离基线（柜宽 ~1m、高 2.2m，6m 距离在 42° FOV 下留足边距） */
const BASE_DIST = 6
const FIT_HX = 0.345
const FIT_HY = 0.4
/** 柜体自转角速度（rad/s，2π/0.0785 ≈ 80 秒一圈——福永 deviceFocus 同款口径） */
const SPIN_RAD_PER_SEC = 0.0785

function camPos(dist: number): THREE.Vector3 {
  const horiz = dist * Math.cos(CAM_PITCH)
  return new THREE.Vector3(
    horiz * Math.sin(CAM_YAW),
    dist * Math.sin(CAM_PITCH),
    horiz * Math.cos(CAM_YAW),
  )
}

function backOut(p: number): number {
  const c1 = 1.70158
  const c3 = c1 + 1
  return 1 + c3 * Math.pow(p - 1, 3) + c1 * Math.pow(p - 1, 2)
}

// ---- 模型模板：模块级缓存（与配电房场景各存一份，互不影响；失败不缓存，下次重试） ----
const draco = new DRACOLoader()
draco.setDecoderPath('/draco/')
const gltf = new GLTFLoader()
gltf.setDRACOLoader(draco)

const protoCache = new Map<string, Promise<THREE.Group | null>>()

function loadProto(model: string): Promise<THREE.Group | null> {
  let p = protoCache.get(model)
  if (!p) {
    p = gltf
      .loadAsync(MODEL_URL(model))
      .then((g) => {
        const obj = g.scene
        // 归一化：统一柜高、居中 x/z、落地 y=0；缩放烘在内层（入场动画写外层 scale.y，
        // 缩放在克隆根上会被动画覆盖——配电房 engine/scene.ts 同款分层）
        const box = new THREE.Box3().setFromObject(obj)
        const size = box.getSize(new THREE.Vector3())
        const scale = size.y > 0 ? CABINET_HEIGHT / size.y : 1
        const center = box.getCenter(new THREE.Vector3())
        obj.position.x -= center.x
        obj.position.z -= center.z
        obj.position.y -= box.min.y
        obj.traverse((o) => {
          if ((o as THREE.Mesh).isMesh) o.castShadow = true
        })
        const inner = new THREE.Group()
        inner.scale.setScalar(scale)
        inner.add(obj)
        const holder = new THREE.Group()
        holder.add(inner)
        return holder
      })
      .catch((err) => {
        protoCache.delete(model)
        console.warn(`[DeviceScene] 模型 ${model} 加载失败`, err)
        return null
      })
    protoCache.set(model, p)
  }
  return p
}

export interface DeviceScene {
  /** 模型就绪（柜体已加入场景并开始入场）；加载失败 reject */
  ready: Promise<void>
  dispose(): void
}

export function createDeviceScene(container: HTMLElement, opts: { model: string }): DeviceScene {
  const scene = new THREE.Scene()
  scene.background = new THREE.Color(0xeaf3fa)

  const camera = new THREE.PerspectiveCamera(
    PERSP_FOV,
    container.clientWidth / container.clientHeight,
    0.1,
    2000,
  )
  camera.position.copy(camPos(BASE_DIST * 1.6))

  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' })
  renderer.setPixelRatio(1)
  renderer.setSize(container.clientWidth, container.clientHeight)
  renderer.toneMapping = THREE.ACESFilmicToneMapping
  renderer.toneMappingExposure = 1.15
  renderer.shadowMap.enabled = true
  renderer.shadowMap.type = THREE.PCFShadowMap
  container.appendChild(renderer.domElement)

  const controls = new OrbitControls(camera, renderer.domElement)
  controls.enableDamping = true
  controls.enablePan = false
  controls.minDistance = 1.2
  controls.maxDistance = 40
  controls.maxPolarAngle = 1.45
  controls.target.set(0, CABINET_HEIGHT / 2, 0)
  controls.enabled = false
  controls.addEventListener('start', () => {
    animating = false
    spinPaused = true
    renderer.domElement.style.cursor = 'grabbing'
  })
  controls.addEventListener('end', () => {
    spinPaused = false
    renderer.domElement.style.cursor = 'grab'
  })
  renderer.domElement.style.cursor = 'grab'

  // 灯光：配电房三灯组（半球环境 + 暖色主光带投影 + 冷色补光）
  scene.add(new THREE.HemisphereLight(0xdcecf4, 0x202b2e, 2.1))
  const key = new THREE.DirectionalLight(0xfff0d6, 4)
  key.position.set(3.5, 6, 4)
  key.castShadow = true
  key.shadow.mapSize.set(2048, 2048)
  key.shadow.camera.left = key.shadow.camera.bottom = -8
  key.shadow.camera.right = key.shadow.camera.top = 8
  key.shadow.camera.far = 40
  scene.add(key)
  const fill = new THREE.DirectionalLight(0x9cc5e3, 2.2)
  fill.position.set(-5, 3, 2)
  scene.add(fill)

  // 地面：科技蓝半透明底板 + 亮蓝网格（配电房同款，尺寸缩到单柜尺度）
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(60, 60),
    new THREE.MeshStandardMaterial({
      color: 0x0e2a4a,
      roughness: 0.55,
      metalness: 0.22,
      transparent: true,
      opacity: 0.72,
      side: THREE.DoubleSide,
    }),
  )
  floor.rotation.x = -Math.PI / 2
  floor.position.y = -0.02
  floor.receiveShadow = true
  scene.add(floor)
  const grid = new THREE.GridHelper(60, 30, 0x5ec8ff, 0x2f7ab8)
  grid.position.y = 0.008
  grid.traverse((o) => {
    const mat = (o as THREE.LineSegments).material
    if (mat && !Array.isArray(mat)) {
      mat.transparent = true
      mat.opacity = 0.7
      mat.depthWrite = false
    }
  })
  scene.add(grid)

  let cabinet: THREE.Group | null = null
  let entranceAt = 0
  let animating = false
  /** 用户拖动中暂停自转（福永 deviceSpinPaused 同款），松手恢复 */
  let spinPaused = false
  const targetPos = camPos(BASE_DIST)
  const targetLook = new THREE.Vector3(0, CABINET_HEIGHT / 2, 0)

  /** 单柜取景：把柜体角点投到屏幕量占用，只放大不拉远（上限 15%） */
  function fitCamera() {
    const dir = targetPos.clone().normalize()
    const cam = new THREE.PerspectiveCamera(PERSP_FOV, camera.aspect, 0.1, 2000)
    cam.position.copy(dir).multiplyScalar(BASE_DIST)
    cam.lookAt(targetLook)
    cam.updateMatrixWorld(true)
    const p = new THREE.Vector3()
    let hx = 0
    let hy = 0
    for (const x of [-0.6, 0.6]) {
      for (const z of [-0.6, 0.6]) {
        for (const y of [0, CABINET_HEIGHT + 0.15]) {
          p.set(x, y, z).project(cam)
          hx = Math.max(hx, Math.abs(p.x) / 2)
          hy = Math.max(hy, Math.abs(p.y) / 2)
        }
      }
    }
    const k = Math.max(hx / FIT_HX, hy / FIT_HY)
    const d = Math.max(BASE_DIST / 1.15, Math.min(BASE_DIST, BASE_DIST * k))
    targetPos.copy(dir).multiplyScalar(d)
  }

  let disposed = false
  let raf = 0

  const ready = loadProto(opts.model).then((proto) => {
    if (!proto) throw new Error(`柜体模型 ${opts.model} 加载失败`)
    if (disposed) return
    cabinet = proto.clone()
    cabinet.scale.y = 0 // 入场从 0 弹出（backOut 0.45s）
    scene.add(cabinet)
    fitCamera()
    camera.position.copy(camPos(BASE_DIST * 1.6))
    entranceAt = performance.now()
    animating = true
  })

  let lastT = performance.now()
  function tick() {
    if (disposed) return
    raf = requestAnimationFrame(tick)
    const now = performance.now()
    const dt = Math.min(0.05, (now - lastT) / 1000) // 帧率无关（后台回来限止单帧步长）
    lastT = now
    if (entranceAt > 0) {
      const p = Math.min(1, (now - entranceAt) / 450)
      const sy = backOut(p)
      if (cabinet) cabinet.scale.y = sy
      if (p >= 1) entranceAt = 0
    }
    if (animating) {
      camera.position.lerp(targetPos, 0.1)
      controls.target.lerp(targetLook, 0.1)
      if (camera.position.distanceTo(targetPos) < 0.2) {
        animating = false
        controls.enabled = true
      }
    }
    // 柜体缓慢自转（福永 deviceFocus 同款：约 80 秒一圈；飞入/入场结束后才转，拖动暂停）
    if (cabinet && !animating && entranceAt === 0 && !spinPaused) {
      cabinet.rotation.y += SPIN_RAD_PER_SEC * dt
    }
    controls.update()
    renderer.render(scene, camera)
  }
  tick()

  function onResize() {
    camera.aspect = container.clientWidth / container.clientHeight
    camera.updateProjectionMatrix()
    renderer.setSize(container.clientWidth, container.clientHeight)
  }
  window.addEventListener('resize', onResize)

  return {
    ready,
    dispose() {
      disposed = true
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', onResize)
      controls.dispose()
      floor.geometry.dispose()
      ;(floor.material as THREE.Material).dispose()
      grid.dispose()
      renderer.dispose()
      if (renderer.domElement.parentElement === container) {
        container.removeChild(renderer.domElement)
      }
    },
  }
}
