/**
 * 宝安配电房 3D 最小场景：读 power-rooms.json 某间房 → 按布局坐标摆柜体模型 + 母线流光。
 *
 * 模型：替身阶段直接复用福永柜体 GLB（public/models/cabinets/，Draco 压缩）。
 * 归一化：每个模型按包围盒统一缩放到标准柜高 2.2m、落地 y=0（福永柜体 GLB
 * 原始尺寸不一，不可直接使用原始大小——对齐福永 fit 思路的简化版）。
 * 渲染态/灯光/地面/母线对齐福永 power-room engine：ACES + 主光投影 + 淡蓝
 * 背景雾 + 科技蓝网格地面 + 流光母线（engine/look.ts、engine/bus.ts 同款参数）。
 */
import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js'
import { computePowerRoomLayout } from '../power-room/layout'
import { buildPowerRoomBus, type BusHandle } from './powerRoomBus'
import type { CabinetModel, PowerRoomConfig } from '../schema/powerRoom'

const CABINET_HEIGHT = 2.2
const MODEL_URL = (m: CabinetModel) => `/models/cabinets/${m}.glb`

/** 白色圆角名字牌（对齐福永样式：白底黑字，浮在柜顶上方） */
function makeNameLabel(text: string): THREE.Sprite {
  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d')!
  const font = '28px "Microsoft YaHei", sans-serif'
  ctx.font = font
  const w = Math.ceil(ctx.measureText(text).width) + 48
  const h = 52
  canvas.width = w
  canvas.height = h
  const r = 12
  ctx.fillStyle = 'rgba(255,255,255,0.94)'
  ctx.beginPath()
  ctx.roundRect(1, 1, w - 2, h - 2, r)
  ctx.fill()
  ctx.font = font
  ctx.fillStyle = '#182635'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(text, w / 2, h / 2 + 1)
  const tex = new THREE.CanvasTexture(canvas)
  tex.colorSpace = THREE.SRGBColorSpace
  const sprite = new THREE.Sprite(
    new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true }),
  )
  // 世界尺寸按画布比例：高 0.34m
  sprite.scale.set((w / h) * 0.34, 0.34, 1)
  sprite.renderOrder = 10
  return sprite
}

export function createPowerRoomScene(container: HTMLElement, room: PowerRoomConfig, pitch: number) {
  const scene = new THREE.Scene()
  scene.background = new THREE.Color(0xeaf3fa)
  scene.fog = new THREE.Fog(0xeaf3fa, 28, 80)

  const camera = new THREE.PerspectiveCamera(50, container.clientWidth / container.clientHeight, 0.1, 500)
  camera.position.set(0, 9, 14)

  const renderer = new THREE.WebGLRenderer({ antialias: true })
  renderer.setSize(container.clientWidth, container.clientHeight)
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
  renderer.toneMapping = THREE.ACESFilmicToneMapping
  renderer.toneMappingExposure = 1.15
  renderer.shadowMap.enabled = true
  renderer.shadowMap.type = THREE.PCFShadowMap
  container.appendChild(renderer.domElement)

  const controls = new OrbitControls(camera, renderer.domElement)
  controls.target.set(0, 1, 0)
  controls.enableDamping = true

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

  const draco = new DRACOLoader()
  draco.setDecoderPath('/draco/')
  const gltf = new GLTFLoader()
  gltf.setDRACOLoader(draco)

  // 模型缓存：同类柜只加载一次，其余 clone
  const modelCache = new Map<CabinetModel, THREE.Group>()

  function normalizeAndClone(model: CabinetModel): THREE.Group | null {
    const cached = modelCache.get(model)
    if (!cached) return null
    const obj = cached.clone()
    // 包围盒在缓存时已归一化过，clone 直接可用
    return obj
  }

  const layout = computePowerRoomLayout(room, pitch)
  const cabinets = room.rows.flat()
  const needed = [...new Set(cabinets.map((c) => c.model))]

  let mounted = 0
  const status = document.createElement('div')
  status.style.cssText =
    'position:absolute;bottom:10px;left:12px;color:#2c4a66;font:13px/1.6 monospace;pointer-events:none'
  status.textContent = `加载中 0/${cabinets.length} …`
  container.appendChild(status)

  const blockers: Promise<unknown>[] = needed.map((m) =>
    gltf.loadAsync(MODEL_URL(m)).then((g) => {
      const obj = g.scene
      // 归一化：统一柜高、居中 x/z、落地 y=0；整个柜投阴影
      const box = new THREE.Box3().setFromObject(obj)
      const size = box.getSize(new THREE.Vector3())
      const scale = size.y > 0 ? CABINET_HEIGHT / size.y : 1
      obj.scale.setScalar(scale)
      const box2 = new THREE.Box3().setFromObject(obj)
      const center = box2.getCenter(new THREE.Vector3())
      obj.position.x -= center.x
      obj.position.z -= center.z
      obj.position.y -= box2.min.y
      obj.traverse((o) => {
        if ((o as THREE.Mesh).isMesh) o.castShadow = true
      })
      modelCache.set(m, obj)
    }),
  )

  let bus: BusHandle | null = null

  Promise.allSettled(blockers).then(() => {
    layout.slots.forEach((slot) => {
      const cab = cabinets.find((c) => c.code === slot.code)
      if (!cab) return
      const obj = normalizeAndClone(cab.model)
      if (!obj) {
        console.warn(`[PowerRoomScene] 模型 ${cab.model} 加载失败，柜 ${cab.code} 未摆放`)
        return
      }
      obj.position.x += slot.x
      obj.position.z += slot.z
      scene.add(obj)
      const label = makeNameLabel(cab.name)
      label.position.set(slot.x, CABINET_HEIGHT + 0.45, slot.z)
      scene.add(label)
      mounted += 1
    })
    // 柜体到位后铺流光母线（进线柜出发，沿各排柜前铺开）
    bus = buildPowerRoomBus(
      layout.slots,
      (code) => cabinets.find((c) => c.code === code)?.name ?? code,
    )
    scene.add(bus.group)
    status.textContent = `已摆放 ${mounted}/${cabinets.length}（${room.name}）`
  })

  function tick() {
    controls.update()
    bus?.update(performance.now())
    renderer.render(scene, camera)
    requestAnimationFrame(tick)
  }
  tick()

  function onResize() {
    camera.aspect = container.clientWidth / container.clientHeight
    camera.updateProjectionMatrix()
    renderer.setSize(container.clientWidth, container.clientHeight)
  }
  window.addEventListener('resize', onResize)

  return {
    dispose() {
      window.removeEventListener('resize', onResize)
      bus?.dispose()
      grid.dispose()
      floor.geometry.dispose()
      ;(floor.material as THREE.Material).dispose()
      controls.dispose()
      renderer.dispose()
      container.removeChild(renderer.domElement)
      status.remove()
    },
  }
}
