/**
 * 宝安配电房 3D 引擎（机制照搬福永 engine/engine.ts + scene.ts 的总览部分）：
 *
 * 为什么之前「不顺畅、视角差」：旧实现每次切房销毁整个场景重建（WebGL 上下文、
 * Draco 解码全部重来），模型一次性摆完（单帧卡顿），相机死死钉在 (0,9,14) 与
 * 房间大小无关。现在对齐福永：
 * - 渲染器/相机/灯光/地面常驻，setRoom 只重建柜体内容；
 * - 模型模板模块级缓存：同类柜整个应用周期只加载+归一化一次，摆柜用 clone；
 * - 分批建柜（每帧 2 台，福永 BUILD_BATCH 同款），建柜期间相机停远景、关投影；
 * - 建完：柜体 scale.y 以 backOut 0.45s 弹出 + 相机从 1.6 倍远景 lerp 飞入，
 * - 机位角度全抄福永 focusLayout：FOV 42、俯仰 17°、偏航 12°，并按柜群包围盒
 *   投影取景（只放大不拉远，放大上限 15%，circuitFitZoom 同款算法）。
 */
import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js'
import { computePowerRoomLayout } from './layout'
import { buildPowerRoomBus, type BusHandle } from './bus'
import type { CabinetModel, PowerRoomConfig } from '../data/powerRoom'

const CABINET_HEIGHT = 2.2
// BASE_URL 前缀跟随 vite base（/baozhongTwin/），域名根绝对路径在带前缀部署下会 404
const MODEL_URL = (m: CabinetModel) => `${import.meta.env.BASE_URL}models/cabinets/${m}.glb`
/** 每帧建柜数（福永 scene.ts BUILD_BATCH 同款，避免单帧卡顿） */
const BUILD_BATCH = 2
/** 名牌离柜顶的高度（福永 addNameTag：min(0.55, h*0.25+0.2)，柜高 2.2 时取 0.55） */
const LABEL_GAP = 0.55

// ---- 机位（福永 engine.ts / focusLayout.ts 同款常量） ----
const PERSP_FOV = 42
const CAM_PITCH = (17 * Math.PI) / 180
const CAM_YAW = (12 * Math.PI) / 180
const CIRCUIT_DIST = Math.hypot((18 / 1.3) * 1.1, (16 / 1.3) * 1.1)
function circuitCam(dist: number) {
  const horiz = dist * Math.cos(CAM_PITCH)
  return new THREE.Vector3(
    horiz * Math.sin(CAM_YAW),
    dist * Math.sin(CAM_PITCH),
    horiz * Math.cos(CAM_YAW),
  )
}
const CAM_END = circuitCam(CIRCUIT_DIST)
const CAM_START = circuitCam(CIRCUIT_DIST * 1.6)
const LOOK_START = new THREE.Vector3(0, 0.4, 0)
/** 取景安全区（自画面中心算的屏幕比例）与初始放大上限（福永同款） */
const FIT_HX = 0.345
const FIT_HY = 0.4
const VIEW_ZOOM_MAX = 1.15

function backOut(p: number): number {
  const c1 = 1.70158
  const c3 = c1 + 1
  return 1 + c3 * Math.pow(p - 1, 3) + c1 * Math.pow(p - 1, 2)
}

/** 柜体上方名称标签（福永 util.ts makeNameLabel 同款：粗体、纯白底+蓝描边、无 mipmap） */
function makeNameLabel(text: string): THREE.Sprite {
  const FONT = "bold 26px 'Microsoft YaHei', sans-serif"
  const LINE_H = 30
  const PAD_X = 12
  const PAD_Y = 6
  const WORLD_SCALE = 0.008

  const measure = document.createElement('canvas').getContext('2d')!
  measure.font = FONT
  const textW = Math.ceil(measure.measureText(String(text)).width)

  const width = Math.ceil(textW + PAD_X * 2)
  const height = Math.ceil(LINE_H + PAD_Y * 2)
  const cv = document.createElement('canvas')
  cv.width = width
  cv.height = height
  const tex = new THREE.CanvasTexture(cv)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.minFilter = THREE.LinearFilter
  tex.magFilter = THREE.LinearFilter
  const ctx = cv.getContext('2d')!
  ctx.fillStyle = '#ffffff'
  ctx.strokeStyle = 'rgba(43,108,160,0.42)'
  ctx.lineWidth = 1.5
  ctx.beginPath()
  ctx.roundRect(1, 1, width - 2, height - 2, 8)
  ctx.fill()
  ctx.stroke()
  ctx.font = FONT
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillStyle = '#0f2438'
  ctx.fillText(String(text), width / 2, PAD_Y + LINE_H / 2)
  tex.needsUpdate = true

  const sp = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: tex,
      transparent: true,
      depthWrite: false,
      alphaTest: 0.05,
    }),
  )
  sp.scale.set(width * WORLD_SCALE, height * WORLD_SCALE, 1)
  return sp
}

// ---- 模型模板：模块级缓存，切房不重载（归一化只做一次） ----
const draco = new DRACOLoader()
draco.setDecoderPath('/draco/')
const gltf = new GLTFLoader()
gltf.setDRACOLoader(draco)

const protoCache = new Map<CabinetModel, Promise<THREE.Group | null>>()

function loadProto(model: CabinetModel): Promise<THREE.Group | null> {
  let p = protoCache.get(model)
  if (!p) {
    p = gltf
      .loadAsync(MODEL_URL(model))
      .then((g) => {
        const obj = g.scene
        // 归一化：统一柜高、居中 x/z、落地 y=0；整个柜投阴影。
        // 缩放必须烘在内层（福永 bigUnitModel.ts 同款分层）：peidiangui 原始几何
        // 高达 145.8 单位、归一化缩放只有 0.015，入场弹出动画写的是外层 scale.y，
        // 若缩放在克隆根上会被动画覆盖（柜体放大 66 倍跑到地下）。
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
        // 失败不缓存：删掉缓存条目，下次切房重试（福永 bigUnitModel 同款）；
        // 仍返回 null，同房其余柜子继续摆
        protoCache.delete(model)
        console.warn(`[PowerRoomScene] 模型 ${model} 加载失败，切房将重试`, err)
        return null
      })
    protoCache.set(model, p)
  }
  return p
}

/** 释放每房独占资源（名字牌 canvas 贴图）。柜体 clone 与模板共享几何/材质，不能释放。 */
function disposeContent(root: THREE.Object3D) {
  root.traverse((o) => {
    const sprite = o as THREE.Sprite
    if (!sprite.isSprite) return
    sprite.material.map?.dispose()
    sprite.material.dispose()
  })
}

export function createPowerRoomScene(
  container: HTMLElement,
  pitch: number,
  /** debug: true 时返回内部状态供 src/tests 下的调试页排查，生产代码不传 */
  opts: {
    debug?: boolean
    /** 点柜跳设备详情（4.3）：命中柜体/名牌时回调（点击判定 = 按下抬起位移 <6px） */
    onCabinetClick?: (cab: { code: string; name: string }) => void
  } = {},
) {
  const scene = new THREE.Scene()
  scene.background = new THREE.Color(0xeaf3fa)
  scene.fog = new THREE.Fog(0xeaf3fa, 28, 80)

  const camera = new THREE.PerspectiveCamera(
    PERSP_FOV,
    container.clientWidth / container.clientHeight,
    0.1,
    2000,
  )
  camera.position.copy(CAM_START)

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
  controls.minDistance = 0.8
  controls.maxDistance = 600
  controls.maxPolarAngle = 1.45
  controls.enabled = false
  controls.addEventListener('start', () => {
    animating = false
    renderer.domElement.style.cursor = 'grabbing'
  })
  controls.addEventListener('end', () => {
    renderer.domElement.style.cursor = 'grab'
  })
  renderer.domElement.style.cursor = 'grab'

  // 灯光：福永配电房三灯组（半球环境 + 暖色主光带投影 + 冷色补光）
  scene.add(new THREE.HemisphereLight(0xdcecf4, 0x202b2e, 2.1))
  const key = new THREE.DirectionalLight(0xfff0d6, 4)
  key.position.set(3.5, 6, 4)
  key.castShadow = true
  key.shadow.mapSize.set(2048, 2048)
  key.shadow.camera.left = key.shadow.camera.bottom = -15
  key.shadow.camera.right = key.shadow.camera.top = 15
  key.shadow.camera.far = 40
  scene.add(key)
  const fill = new THREE.DirectionalLight(0x9cc5e3, 2.2)
  fill.position.set(-5, 3, 2)
  scene.add(fill)

  // 地面：科技蓝半透明底板 + 亮蓝网格（福永 look.ts buildPowerRoomFloor 同款）
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(200, 200),
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
  const grid = new THREE.GridHelper(200, 100, 0x5ec8ff, 0x2f7ab8)
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

  /** 柜体内容层：切房只清这一层，渲染器/灯光/地面常驻 */
  const content = new THREE.Group()
  scene.add(content)

  const status = document.createElement('div')
  status.style.cssText =
    'position:absolute;bottom:10px;left:12px;color:#2c4a66;font:13px/1.6 monospace;pointer-events:none'
  container.appendChild(status)

  // ---- 建柜编排状态 ----
  let buildGen = 0
  let bus: BusHandle | null = null
  /** 本房柜体（入场弹出用，scale.y 0→1） */
  let entrants: THREE.Group[] = []
  let entranceAt = 0
  let animating = false
  const targetPos = CAM_START.clone()
  const targetLook = LOOK_START.clone()

  /**
   * 初始（总览）视角取景：把柜群包围盒（含名牌余量）投到屏幕上量占用，
   * 取「尽量放大但不超安全区」的机位距离，上限 15% 放大、只放大不拉远
   * （福永 engine.ts circuitFitZoom 同款算法）。
   */
  function fitCamera(slots: { x: number; z: number }[]) {
    if (!slots.length) {
      targetPos.copy(CAM_END)
      targetLook.set(0, 0, 0)
      return
    }
    const dir = CAM_END.clone().normalize()
    const cam = new THREE.PerspectiveCamera(PERSP_FOV, camera.aspect, 0.1, 2000)
    const p = new THREE.Vector3()
    cam.position.copy(dir).multiplyScalar(CIRCUIT_DIST)
    cam.lookAt(0, 0, 0)
    cam.updateMatrixWorld(true)
    let hx = 0
    let hy = 0
    for (const s of slots) {
      for (const y of [0, CABINET_HEIGHT + LABEL_GAP + 0.15]) {
        p.set(s.x, y, s.z).project(cam)
        hx = Math.max(hx, Math.abs(p.x) / 2)
        hy = Math.max(hy, Math.abs(p.y) / 2)
      }
    }
    const k = Math.max(hx / FIT_HX, hy / FIT_HY)
    const d = Math.max(CIRCUIT_DIST / VIEW_ZOOM_MAX, Math.min(CIRCUIT_DIST, CIRCUIT_DIST * k))
    targetPos.copy(dir).multiplyScalar(d)
    targetLook.set(0, 0, 0)
  }

  function clearContent() {
    bus?.dispose()
    bus = null
    entrants = []
    entranceAt = 0
    for (const child of [...content.children]) {
      content.remove(child)
      disposeContent(child)
    }
  }

  /** 切房：清内容 → 相机停远景关投影 → 模板就绪后分批建柜 → 飞入 + 弹出 */
  function setRoom(room: PowerRoomConfig) {
    buildGen += 1
    const gen = buildGen
    clearContent()
    animating = false
    camera.position.copy(CAM_START)
    controls.target.copy(LOOK_START)
    targetPos.copy(CAM_START)
    targetLook.copy(LOOK_START)
    controls.enabled = false
    key.castShadow = false

    const layout = computePowerRoomLayout(room, pitch)
    const cabinets = room.rows.flat()
    const mounted = { n: 0 }
    status.textContent = `加载中 0/${cabinets.length} …`

    // 模板全部就绪（二次切房走缓存秒回）后开始分批建柜
    Promise.all([...new Set(cabinets.map((c) => c.model))].map((m) => loadProto(m))).then(
      (list) => {
        if (gen !== buildGen) return
        const protoOf = new Map<CabinetModel, THREE.Group | null>()
          ;[...new Set(cabinets.map((c) => c.model))].forEach((m, i) => protoOf.set(m, list[i] ?? null))

        let cursor = 0
        function buildBatch() {
          if (gen !== buildGen) return
          let n = BUILD_BATCH
          while (n > 0 && cursor < layout.slots.length) {
            const slot = layout.slots[cursor]!
            cursor += 1
            const cab = cabinets.find((c) => c.code === slot.code)
            if (!cab) continue
            const proto = protoOf.get(cab.model)
            if (!proto) {
              console.warn(`[PowerRoomScene] 模型 ${cab.model} 加载失败，柜 ${cab.code} 未摆放`)
              continue
            }
            const obj = proto.clone()
            obj.position.x += slot.x
            obj.position.z += slot.z
            obj.scale.y = 0 // 入场从 0 弹出（beginEntrance 后 backOut 0.45s）
            obj.userData = { code: cab.code, name: cab.name }
            content.add(obj)
            entrants.push(obj)
            const label = makeNameLabel(cab.name)
            label.position.set(slot.x, CABINET_HEIGHT + LABEL_GAP, slot.z)
            label.userData = { code: cab.code, name: cab.name }
            content.add(label)
            mounted.n += 1
            n -= 1
          }
          status.textContent = `加载中 ${mounted.n}/${cabinets.length} …`
          if (cursor < layout.slots.length) {
            // setTimeout 而非 rAF：标签在后台时 rAF 停摆会饿死建柜链（实测踩坑）
            setTimeout(buildBatch, 0)
            return
          }
          // 柜体到位：铺母线、开投影、飞入 + 弹出（福永 onSceneBuildReady 同款顺序）
          bus = buildPowerRoomBus(
            layout.slots,
            (code) => cabinets.find((c) => c.code === code)?.name ?? code,
          )
          content.add(bus.group)
          status.textContent = `已摆放 ${mounted.n}/${cabinets.length}（${room.name}）`
          key.castShadow = true
          fitCamera(layout.slots)
          entranceAt = performance.now()
          animating = true
        }
        buildBatch()
      },
    )
  }

  let raf = 0

  // ---- 点柜拾取：射线命中柜体/名牌 → 回调；悬停变手型（4.3 点柜跳详情） ----
  const raycaster = new THREE.Raycaster()
  const pointer = new THREE.Vector2()
  let downX = 0
  let downY = 0

  function cabinetAt(e: PointerEvent): { code: string; name: string } | null {
    const rect = renderer.domElement.getBoundingClientRect()
    pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1
    pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1
    raycaster.setFromCamera(pointer, camera)
    const hits = raycaster.intersectObjects(content.children, true)
    for (const hit of hits) {
      let o: THREE.Object3D | null = hit.object
      while (o && o !== content) {
        const cab = o.userData as { code?: string; name?: string } | undefined
        if (cab?.code) return { code: cab.code, name: cab.name ?? cab.code }
        o = o.parent
      }
    }
    return null
  }

  function onPointerDown(e: PointerEvent) {
    downX = e.clientX
    downY = e.clientY
  }
  function onPointerUp(e: PointerEvent) {
    if (!opts.onCabinetClick) return
    // 拖拽旋转不算点击（位移阈值 6px）
    if (Math.hypot(e.clientX - downX, e.clientY - downY) > 6) return
    const cab = cabinetAt(e)
    if (cab) opts.onCabinetClick(cab)
  }
  function onPointerMove(e: PointerEvent) {
    if (!opts.onCabinetClick) return
    renderer.domElement.style.cursor = cabinetAt(e) ? 'pointer' : 'grab'
  }
  renderer.domElement.addEventListener('pointerdown', onPointerDown)
  renderer.domElement.addEventListener('pointerup', onPointerUp)
  renderer.domElement.addEventListener('pointermove', onPointerMove)

  function tick() {
    raf = requestAnimationFrame(tick)
    // 入场弹出：全部柜同一时刻 scale.y 0→1（backOut 0.45s，福永 updateVisual 同款）
    if (entranceAt > 0) {
      const p = Math.min(1, (performance.now() - entranceAt) / 450)
      const sy = backOut(p)
      for (const obj of entrants) obj.scale.y = sy
      if (p >= 1) entranceAt = 0
    }
    if (animating) {
      camera.position.lerp(targetPos, 0.1)
      controls.target.lerp(targetLook, 0.1)
      if (camera.position.distanceTo(targetPos) < 0.35) {
        animating = false
        controls.enabled = true
      }
    }
    controls.update()
    bus?.update(performance.now())
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
    setRoom,
    // 仅供 src/tests 调试页读取（opts.debug 才有）
    ...(opts.debug
      ? {
        debug: {
          content,
          camera,
          controls,
          state: () => ({
            busBuilt: !!bus,
            entrants: entrants.length,
            entranceAt,
            animating,
            buildGen,
          }),
        },
      }
      : {}),
    dispose() {
      buildGen += 1
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', onResize)
      renderer.domElement.removeEventListener('pointerdown', onPointerDown)
      renderer.domElement.removeEventListener('pointerup', onPointerUp)
      renderer.domElement.removeEventListener('pointermove', onPointerMove)
      clearContent()
      floor.geometry.dispose()
        ; (floor.material as THREE.Material).dispose()
      grid.dispose()
      controls.dispose()
      renderer.dispose()
      container.removeChild(renderer.domElement)
      status.remove()
    },
  }
}
