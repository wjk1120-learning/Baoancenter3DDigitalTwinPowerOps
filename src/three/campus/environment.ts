import * as THREE from 'three'
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js'

type EnvEntry = {
  texture: THREE.Texture
  pmrem: THREE.PMREMGenerator
  extra?: { dispose: () => void }
}

const campusEnvByRenderer = new WeakMap<THREE.WebGLRenderer, EnvEntry>()
const powerEnvByRenderer = new WeakMap<THREE.WebGLRenderer, EnvEntry>()
let lastCampusEnv: THREE.Texture | null = null

/** 户外天空环境贴图：玻璃才能映出蓝天/地平线，而不是室内棚灯 */
function makeSkyEquirectTexture(): THREE.CanvasTexture {
  const W = 2048
  const H = 1024
  const c = document.createElement('canvas')
  c.width = W
  c.height = H
  const g = c.getContext('2d')!
  const grad = g.createLinearGradient(0, 0, 0, H)
  grad.addColorStop(0, '#1a4aa6')
  grad.addColorStop(0.28, '#4d8ed4')
  grad.addColorStop(0.48, '#d7e8f6')
  grad.addColorStop(0.5, '#f3eee2')
  grad.addColorStop(0.62, '#cfc9bf')
  grad.addColorStop(1, '#6a6560')
  g.fillStyle = grad
  g.fillRect(0, 0, W, H)

  const sunX = W * 0.38
  const sunY = H * 0.48
  const sun = g.createRadialGradient(sunX, sunY, 8, sunX, sunY, W * 0.28)
  sun.addColorStop(0, 'rgba(255,248,220,0.95)')
  sun.addColorStop(0.18, 'rgba(255,236,180,0.4)')
  sun.addColorStop(0.55, 'rgba(210,230,255,0.1)')
  sun.addColorStop(1, 'rgba(210,230,255,0)')
  g.fillStyle = sun
  g.fillRect(0, 0, W, H)

  const tex = new THREE.CanvasTexture(c)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.mapping = THREE.EquirectangularReflectionMapping
  return tex
}

function bindEnv(scene: THREE.Scene, texture: THREE.Texture, intensity: number) {
  scene.environment = texture
  scene.environmentIntensity = intensity
}

function disposeEntry(
  renderer: THREE.WebGLRenderer,
  map: WeakMap<THREE.WebGLRenderer, EnvEntry>,
  scene: THREE.Scene,
) {
  const entry = map.get(renderer)
  if (!entry) return
  if (scene.environment === entry.texture) scene.environment = null
  if (lastCampusEnv === entry.texture) lastCampusEnv = null
  entry.texture.dispose()
  entry.pmrem.dispose()
  entry.extra?.dispose()
  map.delete(renderer)
}

/** 为 PBR 材质提供环境反射（玻璃/金属质感关键）。贴图绑定当前 renderer，不可跨 WebGL 上下文复用。 */
export function initCampusEnvironment(
  renderer: THREE.WebGLRenderer,
  scene: THREE.Scene,
): () => void {
  let entry = campusEnvByRenderer.get(renderer)
  if (!entry) {
    const pmrem = new THREE.PMREMGenerator(renderer)
    pmrem.compileEquirectangularShader()
    const sky = makeSkyEquirectTexture()
    const rt = pmrem.fromEquirectangular(sky)
    sky.dispose()
    entry = { texture: rt.texture, pmrem }
    campusEnvByRenderer.set(renderer, entry)
  }
  lastCampusEnv = entry.texture
  bindEnv(scene, entry.texture, 1)
  return () => disposeEntry(renderer, campusEnvByRenderer, scene)
}

export function getCampusEnvironment(): THREE.Texture | null {
  return lastCampusEnv
}

/**
 * 配电房室内棚灯 IBL。必须用当前 renderer 生成：
 * 医院总览的 PMREM 不能拿到配电房另一套 WebGL 上，否则金属柜会发灰失色。
 */
export function initPowerRoomEnvironment(
  renderer: THREE.WebGLRenderer,
  scene: THREE.Scene,
): () => void {
  let entry = powerEnvByRenderer.get(renderer)
  if (!entry) {
    const pmrem = new THREE.PMREMGenerator(renderer)
    const studio = new RoomEnvironment()
    const rt = pmrem.fromScene(studio, 0.04)
    studio.dispose()
    entry = { texture: rt.texture, pmrem }
    powerEnvByRenderer.set(renderer, entry)
  }
  bindEnv(scene, entry.texture, 1)
  return () => disposeEntry(renderer, powerEnvByRenderer, scene)
}
