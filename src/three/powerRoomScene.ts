/**
 * 宝安配电房 3D 最小场景：读 power-rooms.json 某间房 → 按布局坐标摆柜体模型。
 *
 * 模型：替身阶段直接复用福永柜体 GLB（public/models/cabinets/，Draco 压缩）。
 * 归一化：每个模型按包围盒统一缩放到标准柜高 2.2m、落地 y=0（福永柜体 GLB
 * 原始尺寸不一，不可直接使用原始大小——对齐福永 fit 思路的简化版）。
 */
import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js'
import { computePowerRoomLayout } from '../power-room/layout'
import type { CabinetModel, PowerRoomConfig } from '../schema/powerRoom'

const CABINET_HEIGHT = 2.2
const MODEL_URL = (m: CabinetModel) => `/models/cabinets/${m}.glb`

export function createPowerRoomScene(container: HTMLElement, room: PowerRoomConfig, pitch: number) {
  const scene = new THREE.Scene()
  scene.background = new THREE.Color(0x0d1420)

  const camera = new THREE.PerspectiveCamera(50, container.clientWidth / container.clientHeight, 0.1, 500)
  camera.position.set(0, 9, 14)

  const renderer = new THREE.WebGLRenderer({ antialias: true })
  renderer.setSize(container.clientWidth, container.clientHeight)
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
  container.appendChild(renderer.domElement)

  const controls = new OrbitControls(camera, renderer.domElement)
  controls.target.set(0, 1, 0)
  controls.enableDamping = true

  scene.add(new THREE.AmbientLight(0xffffff, 1.1))
  const dir = new THREE.DirectionalLight(0xffffff, 1.6)
  dir.position.set(6, 12, 8)
  scene.add(dir)

  const grid = new THREE.GridHelper(Math.max(computePowerRoomLayout(room, pitch).maxW * 2, 20), 40, 0x2a3a55, 0x1a2740)
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
    'position:absolute;top:10px;left:12px;color:#8fb3d9;font:13px/1.6 monospace;pointer-events:none'
  status.textContent = `加载中 0/${cabinets.length} …`
  container.appendChild(status)

  const blockers: Promise<unknown>[] = needed.map((m) =>
    gltf.loadAsync(MODEL_URL(m)).then((g) => {
      const obj = g.scene
      // 归一化：统一柜高、居中 x/z、落地 y=0
      const box = new THREE.Box3().setFromObject(obj)
      const size = box.getSize(new THREE.Vector3())
      const scale = size.y > 0 ? CABINET_HEIGHT / size.y : 1
      obj.scale.setScalar(scale)
      const box2 = new THREE.Box3().setFromObject(obj)
      const center = box2.getCenter(new THREE.Vector3())
      obj.position.x -= center.x
      obj.position.z -= center.z
      obj.position.y -= box2.min.y
      modelCache.set(m, obj)
    }),
  )

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
      mounted += 1
      status.textContent = `已摆放 ${mounted}/${cabinets.length}（${room.name}）`
    })
  })

  function tick() {
    controls.update()
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
      controls.dispose()
      renderer.dispose()
      container.removeChild(renderer.domElement)
      status.remove()
    },
  }
}
