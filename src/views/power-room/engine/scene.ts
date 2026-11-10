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
 *
 * 分层：模型模板加载/归一化在 cabinetModels.ts，流光光路在 flowPath.ts，
 * 聚焦构图解算在 focusLayout.ts——本文件是场景编排（建柜/聚焦切换/清场/拾取）。
 * 行数 ~700 超 400 守则：编排密度高（建柜批次/聚焦状态机/动画驱动互相咬合），
 * 再拆收益递减、搬家风险大，经评审到此为止（AlertGroupModal 同例）。
 */
import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { computePowerRoomLayout, type CabinetSlot } from './layout'
import { buildPowerRoomBus, type BusHandle } from './bus'
import type { PowerRoomConfig } from '../data/powerRoom'
import { CABINET_HEIGHT, loadProto, loadKaiguanProto } from './cabinetModels'
import { addFlowSegment } from './flowPath'
import {
  computeFocusLayout,
  BAND_TOP_FY,
  BAND_BOTTOM_Y,
  VIEW_K,
  SELECT_PUSH_IN,
  type FocusFrame,
  type FocusPoint3,
} from './focusLayout'

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

/**
 * 柜体上方名称标签（福永 util.ts makeNameLabel 原版照搬：粗体、纯白底+蓝描边、无 mipmap、
 * ≤13 字单行 / 超长在中点附近找空格折两行、多行居中）。
 */
function makeNameLabel(text: string): THREE.Sprite {
  const FONT = "bold 26px 'Microsoft YaHei', sans-serif"
  const LINE_H = 30
  const PAD_X = 12
  const PAD_Y = 6
  const WORLD_SCALE = 0.008

  const wrapLines = (t: string, maxChars = 13) => {
    const s = String(t || '—')
    if (s.length <= maxChars) return [s]
    // 宝中名形状「{柜名} 测点N」：断在最后一个空格（柜名一行、测点一行，不劈编号）；
    // 无空格（福永式长名）退回福永原版的中点硬断
    const lastSpace = s.lastIndexOf(' ')
    if (lastSpace >= 4) return [s.slice(0, lastSpace).trim(), s.slice(lastSpace).trim()]
    const mid = Math.min(maxChars, Math.ceil(s.length / 2))
    let breakAt = s.lastIndexOf(' ', mid)
    if (breakAt < 4) breakAt = mid
    return [s.slice(0, breakAt).trim(), s.slice(breakAt).trim()].filter(Boolean)
  }

  const measure = document.createElement('canvas').getContext('2d')!
  measure.font = FONT

  const lines = wrapLines(text)
  let textW = 0
  for (const line of lines) textW = Math.max(textW, measure.measureText(line).width)
  const width = Math.ceil(textW + PAD_X * 2)
  const height = Math.ceil(lines.length * LINE_H + PAD_Y * 2)

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
  const startY = PAD_Y + LINE_H / 2
  lines.forEach((line, i) => ctx.fillText(line, width / 2, startY + i * LINE_H))
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
  // 出厂尺寸存 userData：聚焦态名牌缩放（×0.62/选中放大）按它反推（福永 makeNameLabel 同款）
  const baseScale = new THREE.Vector2(sp.scale.x, sp.scale.y)
  ;(sp.userData as { baseScale: THREE.Vector2 }).baseScale = baseScale
  return sp
}

// ---- 二级开关的显示口径（模型模板本体在 cabinetModels.ts；福永原值） ----
/** 选中小开关放大倍数（福永 ZOOM_GROW）与小开关名牌缩比（福永 SMALL_LABEL_SCALE） */
const ZOOM_GROW = 1.3
const SMALL_LABEL_SCALE = 0.62

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
    /** 点柜交互：命中大柜/名牌/二级开关时回调（点击判定 = 按下抬起位移 <6px） */
    onCabinetClick?: (hit: {
      kind: 'cabinet' | 'switch'
      code: string
      name: string
      deviceId?: number
      deviceName?: string
    }) => void
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

  // ---- 二级开关层与选中态（批次 4 后端驱动：点大柜 → §1.8 开关摆在大柜前方） ----
  const switchLayer = new THREE.Group()
  scene.add(switchLayer)
  /** 柜号 → 机位（摆二级开关用） */
  const slotByCode = new Map<string, CabinetSlot>()
  /** 聚焦态：当前特写的大柜柜号（隐藏其他对象，右上「返回配电房」复原） */
  let focusedCode: string | null = null
  /** 聚焦摆场统一弹出时刻（tick 按 userData.popT 逐台驱动 backOut 0.55s，福永 POP_DUR 同款） */
  let popAt = 0
  /** 聚焦态选中的开关 deviceId（页面点选同步；强调缩放由 tick 按 emph 缓动，福永同款） */
  let selectedDeviceId: number | null = null
  /** 聚焦态开关行上方的大号柜名标签 */
  let focusLabel: THREE.Sprite | null = null
  /** 最近一次布局机位（unfocus 回总览机位用） */
  let lastSlots: CabinetSlot[] = []
  /** 总览机位（聚焦相机的基准：FY 同款 restDir/restDist 拉近到对位点） */
  const restPos = CAM_START.clone()
  const restLook = LOOK_START.clone()
  /** 聚焦相机距 pivot 的**绝对世界距离** 14.9。福永实际 = 其总览机位(23.65，房间大)×0.63
   *  ≈ 14.9；宝中房间小总览机位仅 17.7，若按同比例 0.63 聚焦相机落在 11.2，屏上开关/
   *  名牌比福永小 ~40%（用户截图对比）。改用与福永相同的绝对距离，构图带 BAND_* 亦为
   *  福永原值，则聚焦态数值与福永完全一致（f.scale≈0.83、行距≈0.97、列距≈1.11）。 */
  const FOCUS_DIST = 14.9
  /** 聚焦对位点高度（福永 FOCUS_LOOK_Y 同款） */
  const FOCUS_LOOK_Y = 1.15
  /** 聚焦构图解算器（福永 makeFocusFrame 同款：屏幕比例 → 世界点） */
  function makeFocusFrame(eye: THREE.Vector3, look: THREE.Vector3, aspect: number): FocusFrame {
    const cam = new THREE.PerspectiveCamera(PERSP_FOV, aspect, 0.1, 2000)
    cam.position.copy(eye)
    cam.lookAt(look)
    cam.updateMatrixWorld(true)
    const right = new THREE.Vector3().setFromMatrixColumn(cam.matrixWorld, 0)
    right.y = 0
    right.normalize()
    const fwd = look.clone().sub(eye).normalize()
    const fwdH = new THREE.Vector3(fwd.x, 0, fwd.z).normalize()
    const planeDist = eye.distanceTo(look)
    const hDist = Math.hypot(look.x - eye.x, look.z - eye.z)
    const tmp = new THREE.Vector3()
    const wall = (fx: number, fy: number) => {
      tmp.set(fx * 2 - 1, 1 - fy * 2, 0.5).unproject(cam)
      tmp.sub(cam.position)
      const denom = tmp.x * fwdH.x + tmp.z * fwdH.z
      const t = denom > 1e-6 ? hDist / denom : planeDist
      return { x: eye.x + tmp.x * t, y: eye.y + tmp.y * t, z: eye.z + tmp.z * t }
    }
    return {
      wall,
      ground(fx: number, fy: number) {
        tmp.set(fx * 2 - 1, 1 - fy * 2, 0.5).unproject(cam)
        tmp.sub(cam.position)
        const t = tmp.y !== 0 ? -cam.position.y / tmp.y : 0
        tmp.multiplyScalar(Math.max(1, t)).add(cam.position)
        return { x: tmp.x, z: tmp.z }
      },
      dist: (x: number, y: number, z: number) => Math.hypot(x - eye.x, y - eye.y, z - eye.z),
      planeDist,
      aspect,
      rightH: { x: right.x, z: right.z },
      fwdY: fwd.y,
    }
  }

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
      restPos.copy(targetPos)
      restLook.copy(targetLook)
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
    // 记住总览机位：聚焦相机 = 总览机位方向、距对位点 FOCUS_DIST（福永 restPos 同款语义）
    restPos.copy(targetPos)
    restLook.copy(targetLook)
  }

  function clearContent() {
    bus?.dispose()
    bus = null
    entrants = []
    entranceAt = 0
    focusedCode = null
    removeFocusLabel()
    clearSwitches()
    for (const child of [...content.children]) {
      content.remove(child)
      disposeContent(child)
    }
  }

  /** 清空二级开关层（切房/退出聚焦时；克隆体与模板共享材质，无需释放） */
  function clearSwitches() {
    disposeContent(switchLayer) // 释放开关名标签的 canvas 贴图
    for (const m of flowMats) m.dispose()
    flowMats.length = 0
    selectedDeviceId = null
    for (const child of [...switchLayer.children]) switchLayer.remove(child)
  }

  /**
   * 聚焦摆场（福永 scene.toFocus 同款构图，frame 由 focusCabinet 按聚焦机位解算给出）：
   * 大柜搬到画面右侧放大（layout.big）；二级开关悬浮在左侧竖直墙上，纵向优先排布
   * （一列最多 4 个，满列向右加列）；直角光路（出线横段→竖排母线→每排支线）流光连接。
   * 开关 userData 挂 deviceId（点开关 → 看板查 §1.11/§3.3）；返回时 unfocus 复原大柜。
   */
  async function selectCabinet(
    code: string,
    frame: FocusFrame | null,
    switches: { deviceId: number; deviceName: string }[],
  ) {
    const slot = slotByCode.get(code)
    if (!frame || !slot || focusedCode !== code) return
    clearSwitches()
    const gen = buildGen
    const proto = switches.length ? await loadKaiguanProto() : null
    if (switches.length && !proto) return
    if (gen !== buildGen || focusedCode !== code) return

    // 构图解算：viewK 向画面中心缩一档；页面定稿「默认选中第一个开关」恒有选中态，
    // 按福永选中态取 VIEW_K × SELECT_PUSH_IN 推近、默认列滑到画面中央。
    const viewK = VIEW_K * SELECT_PUSH_IN
    const layout = computeFocusLayout({
      count: switches.length,
      ground: (fx, fy) =>
        frame.ground(0.5 + (fx - 0.5) * viewK, 0.5 + (fy - 0.5) * viewK),
      wall: (fx, fy) =>
        frame.wall(0.5 + (fx - 0.5) * viewK, 0.5 + (fy - 0.5) * viewK),
      dist: frame.dist,
      planeDist: frame.planeDist,
      aspect: frame.aspect,
      rightH: frame.rightH,
      fwdY: frame.fwdY,
      viewK,
      focusCol: 0,
      bandBottomY: BAND_BOTTOM_Y,
      bandTopY: frame.wall(0.5, 0.5 + (BAND_TOP_FY - 0.5) * viewK).y,
      unit: proto ? { w: proto.box.w, h: proto.box.h } : undefined,
    })

    // 大柜搬到特写位并放大（必须按被点的柜号精确匹配；记录原位/原缩放，unfocus 复原）
    const cabObj = content.children.find((o) => {
      const ud = o.userData as { code?: string; kind?: string } | undefined
      return ud?.code === code && !ud.kind
    })
    if (cabObj) {
      const ud = cabObj.userData as { code?: string; origX?: number; origZ?: number }
      ud.origX = slot.x
      ud.origZ = slot.z
      cabObj.position.set(layout.big.x, 0, layout.big.z)
      cabObj.scale.setScalar(layout.big.scale)
    }
    if (focusLabel) {
      focusLabel.position.set(
        layout.big.x,
        CABINET_HEIGHT * layout.big.scale + LABEL_GAP,
        layout.big.z,
      )
      // 名牌随柜体等比放大（setScalar 会把「宽≫高」的标签压成正方形，文字挤成一团）
      focusLabel.scale.multiplyScalar(layout.big.scale)
      focusLabel.visible = true
    }

    // 二级开关摆上悬浮墙（克隆根缩放 = 构图缩放；名牌挂在开关组内一起缩放；
    // 缩放动画（入场弹出 + 选中强调缓动）统一由 tick 驱动）。
    // 注意不能乘模板归一化系数 unitScale：setScalar 会覆盖克隆根的归一化缩放，
    // 福永正是如此（toScale: p.scale）——整体渲染为 unitH/unitScale，名牌相对行距
    // 才有福永的余量；宝中曾多乘 unitScale(≈1.17) 使名牌冒出 17% 压到上一行开关。
    if (proto) {
      popAt = performance.now()
      switches.forEach((sw, i) => {
        const f = layout.feeders[i]
        if (!f) return
        const obj = proto.object.clone()
        obj.position.set(f.x, f.y, f.z)
        obj.scale.setScalar(0.001) // 入场从 0 弹出（tick 统一驱动）
        const label = makeNameLabel(sw.deviceName)
        // 福永同款：出厂宽 × SMALL_LABEL_SCALE；baseScale 供 tick 的选中放大 1.08 使用
        label.scale.multiplyScalar(SMALL_LABEL_SCALE)
        ;(label.userData as { baseScale?: { x: number; y: number } }).baseScale = {
          x: label.scale.x,
          y: label.scale.y,
        }
        obj.userData = {
          kind: 'switch',
          deviceId: sw.deviceId,
          deviceName: sw.deviceName,
          popBase: f.scale,
          popT: popAt,
          label,
        }
        switchLayer.add(obj)
        label.position.set(0, proto.box.h + Math.min(0.55, proto.box.h * 0.25 + 0.2), 0)
        obj.add(label)
      })

      // 直角光路：大柜出线口 → 横段 → 竖排母线（上/下两段）→ 每排支线，全部流光
      const P = (p: FocusPoint3) => new THREE.Vector3(p.x, p.y, p.z)
      addFlowSegment(switchLayer, P(layout.trunk[0]), P(layout.trunk[1]), flowMats)
      addFlowSegment(switchLayer, P(layout.riserUp[0]), P(layout.riserUp[1]), flowMats)
      addFlowSegment(switchLayer, P(layout.riserDown[0]), P(layout.riserDown[1]), flowMats)
      for (const s of layout.stubs) addFlowSegment(switchLayer, P(s.from), P(s.to), flowMats)
    }
  }

  /** 聚焦态选中开关（页面点选同步）：强调缩放的过渡由 tick 按 emph 缓动统一驱动（福永同款） */
  function markSelectedSwitch(deviceId: number | null) {
    selectedDeviceId = deviceId
  }

  // ---- 聚焦视图（用户定稿样式，对齐福永点柜特写）：左=开关面板，中=开关建模+名，右=大柜建模+名 ----

  /** 移除聚焦态大号柜名标签 */
  function removeFocusLabel() {
    if (!focusLabel) return
    disposeContent(focusLabel)
    content.remove(focusLabel)
    focusLabel = null
  }

  /**
   * 进入聚焦（福永 engine.setFocus 同款机位）：相机对准被点大柜的总览位（对位点
   * y=FOCUS_LOOK_Y），距离 = FOCUS_DIST（福永实际聚焦相机距离）；隐藏其余柜体/名牌/母线，
   * 大柜搬运到特写位与开关摆场由 selectCabinet 按同一 frame 解算（构图落点才准）。
   * 返回构图解算器 frame。
   */
  function focusCabinet(code: string, cabName: string): FocusFrame | null {
    const slot = slotByCode.get(code)
    if (!slot) return null
    focusedCode = code
    if (bus) {
      bus.group.visible = false
      for (const child of content.children) {
        if (child === bus.group) continue // 总览母线的可见性已单独设置
        const ud = child.userData as { code?: string; kind?: string } | undefined
        if (ud?.kind === 'label') {
          child.visible = false
          continue
        }
        child.visible = ud?.code === code
      }
    }
    // 柜名大标签：等 selectCabinet 解算出大柜特写位后再落位显示
    removeFocusLabel()
    const label = makeNameLabel(cabName)
    label.material.opacity = 0.9
    label.material.transparent = true
    label.visible = false
    content.add(label)
    focusLabel = label
    // 聚焦相机：总览机位方向、距对位点 FOCUS_DIST（福永实际距离，见常量注释）
    const pivot = new THREE.Vector3(slot.x, FOCUS_LOOK_Y, slot.z)
    const dir = restPos.clone().sub(restLook).normalize()
    targetPos.copy(pivot).addScaledVector(dir, FOCUS_DIST)
    targetLook.copy(pivot)
    const frame = makeFocusFrame(targetPos, targetLook, camera.aspect)
    animating = true
    controls.enabled = false
    return frame
  }

  /** 返回总览：柜体回原位/原缩放、复原隐藏对象、移除大标签、相机飞回总览机位 */
  function unfocus() {
    if (!focusedCode) return
    focusedCode = null
    removeFocusLabel()
    for (const child of content.children) {
      const ud = child.userData as { code?: string; origX?: number; origZ?: number } | undefined
      child.visible = true
      if (ud?.code && ud.origX != null && ud.origZ != null) {
        // 聚焦时被搬运的柜体回原位（只回一次，防止 userData 残留重复搬运）
        child.position.set(ud.origX, 0, ud.origZ)
        child.scale.setScalar(1)
        delete ud.origX
        delete ud.origZ
      }
    }
    if (bus) bus.group.visible = true
    clearSwitches()
    fitCamera(lastSlots)
    animating = true
    controls.enabled = false
  }

  /**
   * 切房：清内容 → 相机停远景关投影 → 模板就绪后分批建柜 → 飞入 + 弹出。
   * （柜体与后端的 superId 绑定由页面侧解析：点击回传柜号/柜名，页面查 §1.6 绑定映射。）
   */
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
    slotByCode.clear()
    lastSlots = layout.slots
    for (const s of layout.slots) slotByCode.set(s.code, s)
    const cabinets = room.rows.flat()
    const mounted = { n: 0 }
    status.textContent = `加载中 0/${cabinets.length} …`

    // 模板全部就绪（二次切房走缓存秒回）后开始分批建柜
    Promise.all([...new Set(cabinets.map((c) => c.model))].map((m) => loadProto(m))).then(
      (list) => {
        if (gen !== buildGen) return
        const protoOf = new Map<string, THREE.Group | null>()
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
            label.userData = { kind: 'label', code: cab.code, name: cab.name }
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

  // ---- 点柜拾取：射线命中大柜/名牌/二级开关 → 回调；悬停变手型 ----
  const raycaster = new THREE.Raycaster()
  const pointer = new THREE.Vector2()
  let downX = 0
  let downY = 0

  interface PickHit {
    kind: 'cabinet' | 'switch'
    code: string
    name: string
    deviceId?: number
    deviceName?: string
  }

  function pickAt(e: PointerEvent): PickHit | null {
    const rect = renderer.domElement.getBoundingClientRect()
    pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1
    pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1
    raycaster.setFromCamera(pointer, camera)
    // content=大柜/名牌/母线；switchLayer=二级开关（scene 直属，须一并参与拾取）
    const hits = raycaster.intersectObjects([...content.children, ...switchLayer.children], true)
    for (const hit of hits) {
      let o: THREE.Object3D | null = hit.object
      while (o && o !== content) {
        // 聚焦态被隐藏的柜体仍会被射线命中（raycast 不查 visible），沿父链发现隐藏即跳过
        if (!o.visible) break
        const ud = o.userData as
          | {
              code?: string
              name?: string
              deviceId?: number
              deviceName?: string
              kind?: string
            }
          | undefined
        if (ud?.kind === 'switch' && ud.deviceId != null) {
          return {
            kind: 'switch',
            code: '',
            name: ud.deviceName ?? '',
            deviceId: ud.deviceId,
            deviceName: ud.deviceName,
          }
        }
        if (ud?.code) {
          return { kind: 'cabinet', code: ud.code, name: ud.name ?? ud.code }
        }
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
    const hit = pickAt(e)
    if (hit) opts.onCabinetClick(hit)
  }
  function onPointerMove(e: PointerEvent) {
    if (!opts.onCabinetClick) return
    renderer.domElement.style.cursor = pickAt(e) ? 'pointer' : 'grab'
  }
  renderer.domElement.addEventListener('pointerdown', onPointerDown)
  renderer.domElement.addEventListener('pointerup', onPointerUp)
  renderer.domElement.addEventListener('pointermove', onPointerMove)

  /** 聚焦态「柜体 → 开关列」流转线的流光材质（tick 驱动 uTime；清场时 dispose，段生成见 flowPath.ts） */
  const flowMats: THREE.ShaderMaterial[] = []

  function tick() {
    raf = requestAnimationFrame(tick)
    const nowS = performance.now() / 1000
    for (const m of flowMats) m.uniforms.uTime.value = nowS
    // 入场弹出：全部柜同一时刻 scale.y 0→1（backOut 0.45s，福永 updateVisual 同款）
    if (entranceAt > 0) {
      const p = Math.min(1, (performance.now() - entranceAt) / 450)
      const sy = backOut(p)
      for (const obj of entrants) obj.scale.y = sy
      if (p >= 1) entranceAt = 0
    }
    // 聚焦开关（福永 updateVisual 同款机制）：选中强调按 emph 每帧 0.16 缓动到目标
    // （切换开关时平滑放大/缩小，不跳变）；入场弹出叠加 backOut 0.55s（福永 POP_DUR 同款）；
    // 名牌高亮同步缓动：选中的全亮且放大 1.08 倍，未选中的压暗半透明（福永 0.9-0.35 同口径）
    for (const child of switchLayer.children) {
      const ud = child.userData as
        | {
            kind?: string
            deviceId?: number
            popBase?: number
            popT?: number
            emph?: number
            label?: THREE.Sprite
          }
        | undefined
      if (ud?.kind !== 'switch' || ud.popBase == null) continue
      const picked = selectedDeviceId != null && ud.deviceId === selectedDeviceId
      ud.emph = (ud.emph ?? 0) + ((picked ? 1 : 0) - (ud.emph ?? 0)) * 0.16
      let s = ud.popBase * (1 + (ZOOM_GROW - 1) * ud.emph)
      if (ud.popT != null) {
        const p = Math.min(1, (performance.now() - ud.popT) / 550)
        s *= Math.max(0.001, backOut(p))
        if (p >= 1) ud.popT = undefined
      }
      child.scale.setScalar(s)
      const label = ud.label
      if (label) {
        const mat = label.material as THREE.SpriteMaterial
        const base = (label.userData as { baseScale?: { x: number; y: number } }).baseScale
        mat.opacity += ((picked ? 1 : 0.55) - mat.opacity) * 0.16
        if (base) {
          const f = 1 + 0.08 * ud.emph
          label.scale.set(base.x * f, base.y * f, 1)
        }
        // 选中名牌置顶渲染：放大后压住相邻名牌但自己绝不被遮（福永观感）
        label.renderOrder = picked ? 10 : 0
      }
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
    /** 进入聚焦视图（隐藏其他对象+相机特写，返回构图 frame）；unfocus 返回总览 */
    focusCabinet,
    unfocus,
    /** 聚焦摆场：大柜搬特写位 + 二级开关悬浮墙排布 + 直角光路（§1.8 结果由页面传入） */
    selectCabinet,
    /** 聚焦态选中开关同步（那台放大 ZOOM_GROW 倍） */
    markSelectedSwitch,
    clearSwitches,
    // 仅供 src/tests 调试页读取（opts.debug 才有）
    ...(opts.debug
      ? {
        debug: {
          content,
          camera,
          controls,
          switchLayer,
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
      clearSwitches()
      scene.remove(switchLayer)
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
