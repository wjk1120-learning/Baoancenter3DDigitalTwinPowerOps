import * as THREE from 'three'

export interface GroundPbrSet {
  map: THREE.CanvasTexture
  normalMap: THREE.CanvasTexture
  roughnessMap: THREE.CanvasTexture
  aoMap: THREE.CanvasTexture
}

/** 可重复伪随机（贴图生成 deterministic） */
function seededRandom(seed: number) {
  let s = seed >>> 0
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0
    return s / 4294967296
  }
}

function sampleHeightRect(
  heights: Float32Array,
  w: number,
  h: number,
  x: number,
  y: number,
): number {
  const cx = Math.max(0, Math.min(w - 1, x))
  const cy = Math.max(0, Math.min(h - 1, y))
  return heights[cy * w + cx]!
}

function heightsToNormalRect(
  heights: Float32Array,
  w: number,
  h: number,
  strength: number,
): ImageData {
  const out = new Uint8ClampedArray(w * h * 4)
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const l = sampleHeightRect(heights, w, h, x - 1, y)
      const r = sampleHeightRect(heights, w, h, x + 1, y)
      const u = sampleHeightRect(heights, w, h, x, y - 1)
      const d = sampleHeightRect(heights, w, h, x, y + 1)
      let nx = (l - r) * strength
      let ny = (u - d) * strength
      let nz = 1
      const len = Math.hypot(nx, ny, nz)
      nx /= len
      ny /= len
      nz /= len
      const i = (y * w + x) * 4
      out[i] = Math.round((nx * 0.5 + 0.5) * 255)
      out[i + 1] = Math.round((ny * 0.5 + 0.5) * 255)
      out[i + 2] = Math.round((nz * 0.5 + 0.5) * 255)
      out[i + 3] = 255
    }
  }
  return new ImageData(out, w, h)
}

function heightsToRoughnessRect(
  heights: Float32Array,
  w: number,
  h: number,
  base = 0.82,
  contrast = 0.35,
): ImageData {
  const out = new Uint8ClampedArray(w * h * 4)
  for (let i = 0; i < w * h; i += 1) {
    const v = heights[i]!
    const r = Math.max(0.12, Math.min(0.98, base + (v - 0.5) * contrast))
    const byte = Math.round(r * 255)
    const o = i * 4
    out[o] = byte
    out[o + 1] = byte
    out[o + 2] = byte
    out[o + 3] = 255
  }
  return new ImageData(out, w, h)
}

function heightsToAoRect(heights: Float32Array, w: number, h: number, strength = 1.4): ImageData {
  const out = new Uint8ClampedArray(w * h * 4)
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const c = sampleHeightRect(heights, w, h, x, y)
      let shade = 0
      for (let oy = -2; oy <= 2; oy += 1) {
        for (let ox = -2; ox <= 2; ox += 1) {
          if (ox === 0 && oy === 0) continue
          shade += Math.max(0, sampleHeightRect(heights, w, h, x + ox, y + oy) - c)
        }
      }
      const ao = Math.max(0.55, 1 - shade * strength)
      const v = Math.round(ao * 255)
      const i = (y * w + x) * 4
      out[i] = v
      out[i + 1] = v
      out[i + 2] = v
      out[i + 3] = 255
    }
  }
  return new ImageData(out, w, h)
}

function buildPbrSetRect(
  albedoCanvas: HTMLCanvasElement,
  heights: Float32Array,
  w: number,
  h: number,
  normalStrength: number,
  clampV: boolean,
): GroundPbrSet {
  const wrapT = clampV ? THREE.ClampToEdgeWrapping : THREE.RepeatWrapping
  const normalCanvas = canvasFromImageData(heightsToNormalRect(heights, w, h, normalStrength))
  const roughCanvas = canvasFromImageData(heightsToRoughnessRect(heights, w, h))
  const aoCanvas = canvasFromImageData(heightsToAoRect(heights, w, h))
  return {
    map: makeCanvasTexture(albedoCanvas, THREE.RepeatWrapping, wrapT),
    normalMap: makeCanvasTexture(
      normalCanvas,
      THREE.RepeatWrapping,
      wrapT,
      THREE.LinearSRGBColorSpace,
    ),
    roughnessMap: makeCanvasTexture(
      roughCanvas,
      THREE.RepeatWrapping,
      wrapT,
      THREE.LinearSRGBColorSpace,
    ),
    aoMap: makeCanvasTexture(aoCanvas, THREE.RepeatWrapping, wrapT, THREE.LinearSRGBColorSpace),
  }
}

function buildPbrSet(
  albedoCanvas: HTMLCanvasElement,
  heights: Float32Array,
  size: number,
  normalStrength: number,
): GroundPbrSet {
  return buildPbrSetRect(albedoCanvas, heights, size, size, normalStrength, false)
}

function canvasFromImageData(img: ImageData): HTMLCanvasElement {
  const c = document.createElement('canvas')
  c.width = img.width
  c.height = img.height
  c.getContext('2d')!.putImageData(img, 0, 0)
  return c
}

function makeCanvasTexture(
  canvas: HTMLCanvasElement,
  repeatS: THREE.Wrapping,
  repeatT: THREE.Wrapping,
  colorSpace: THREE.ColorSpace = THREE.SRGBColorSpace,
): THREE.CanvasTexture {
  const tex = new THREE.CanvasTexture(canvas)
  tex.wrapS = repeatS
  tex.wrapT = repeatT
  tex.colorSpace = colorSpace
  tex.anisotropy = 16
  tex.minFilter = THREE.LinearMipmapLinearFilter
  tex.magFilter = THREE.LinearFilter
  tex.generateMipmaps = true
  return tex
}

/** 高画质沥青：颗粒感、修补斑、轮迹、车道线 + PBR 法线/粗糙度/AO */
function makePhotorealAsphalt(): GroundPbrSet {
  const W = 1024
  const H = 256
  const rand = seededRandom(0xa5fa11)
  const albedo = document.createElement('canvas')
  albedo.width = W
  albedo.height = H
  const g = albedo.getContext('2d')!

  const grad = g.createLinearGradient(0, 0, 0, H)
  grad.addColorStop(0, '#4a4f57')
  grad.addColorStop(0.5, '#3f444c')
  grad.addColorStop(1, '#383d45')
  g.fillStyle = grad
  g.fillRect(0, 0, W, H)

  const heights = new Float32Array(W * H).fill(0.52)
  for (let i = 0; i < W * H; i += 1) {
    heights[i] = 0.5 + (rand() - 0.5) * 0.08
  }

  for (let i = 0; i < 18000; i += 1) {
    const x = rand() * W
    const y = rand() * H
    const v = 55 + rand() * 55
    const a = 0.04 + rand() * 0.14
    g.fillStyle = `rgba(${v},${v},${v + 8},${a})`
    g.fillRect(x, y, 1 + rand() * 1.5, 1 + rand() * 1.5)
    const hx = Math.floor(x)
    const hy = Math.floor(y)
    if (hx >= 0 && hx < W && hy >= 0 && hy < H) {
      heights[hy * W + hx] = Math.min(0.78, heights[hy * W + hx]! + rand() * 0.06)
    }
  }

  for (let i = 0; i < 360; i += 1) {
    const x = rand() * W
    const y = rand() * H
    const r = 3 + rand() * 12
    g.fillStyle = `rgba(${40 + rand() * 25},${42 + rand() * 25},${48 + rand() * 25},${0.08 + rand() * 0.12})`
    g.beginPath()
    g.arc(x, y, r, 0, Math.PI * 2)
    g.fill()
  }

  for (let i = 0; i < 12; i += 1) {
    const x = rand() * W
    const y = rand() * H
    g.fillStyle = `rgba(28,24,18,${0.06 + rand() * 0.08})`
    g.beginPath()
    g.ellipse(x, y, 8 + rand() * 18, 5 + rand() * 10, rand() * Math.PI, 0, Math.PI * 2)
    g.fill()
  }

  g.fillStyle = 'rgba(255,255,255,0.07)'
  for (let band = 0; band < 6; band += 1) {
    const y0 = H * (0.18 + band * 0.12)
    g.fillRect(0, y0, W, 2 + rand() * 2)
  }

  g.fillStyle = 'rgba(255,255,255,0.88)'
  g.fillRect(0, H / 2 - 2, W / 2, 4)
  g.fillStyle = 'rgba(255,255,255,0.72)'
  g.fillRect(0, 5, W, 3)
  g.fillRect(0, H - 8, W, 3)

  for (let i = 0; i < 8; i += 1) {
    const x0 = rand() * W
    const y0 = rand() * H
    g.strokeStyle = `rgba(25,25,28,${0.15 + rand() * 0.2})`
    g.lineWidth = 0.6 + rand() * 0.8
    g.beginPath()
    g.moveTo(x0, y0)
    for (let s = 0; s < 5; s += 1) {
      g.lineTo(x0 + (rand() - 0.5) * 40, y0 + (rand() - 0.5) * 20)
    }
    g.stroke()
    for (let s = 0; s < 5; s += 1) {
      const cx = Math.floor(x0 + s * 8)
      const cy = Math.floor(y0)
      if (cx >= 0 && cx < W && cy >= 0 && cy < H)
        heights[cy * W + cx] = Math.max(0.2, heights[cy * W + cx]! - 0.08)
    }
  }

  return buildPbrSetRect(albedo, heights, W, H, 3.2, true)
}

/** 高画质水泥/混凝土：骨料、抹平纹、伸缩缝、水渍 + PBR */
function makePhotorealConcrete(): GroundPbrSet {
  const S = 1024
  const rand = seededRandom(0xc0ee01)
  const albedo = document.createElement('canvas')
  albedo.width = S
  albedo.height = S
  const g = albedo.getContext('2d')!

  const grad = g.createLinearGradient(0, 0, S, S)
  grad.addColorStop(0, '#c8c4bc')
  grad.addColorStop(0.5, '#bdb9b1')
  grad.addColorStop(1, '#b5b1a9')
  g.fillStyle = grad
  g.fillRect(0, 0, S, S)

  const heights = new Float32Array(S * S).fill(0.5)
  for (let i = 0; i < S * S; i += 1) {
    heights[i] = 0.5 + (rand() - 0.5) * 0.05
  }

  for (let i = 0; i < 14000; i += 1) {
    const x = rand() * S
    const y = rand() * S
    const v = 150 + rand() * 60
    const a = 0.03 + rand() * 0.09
    g.fillStyle = `rgba(${v},${v - 6},${v - 12},${a})`
    g.fillRect(x, y, 1 + rand() * 2, 1 + rand() * 2)
    const hx = Math.floor(x)
    const hy = Math.floor(y)
    if (hx < S && hy < S)
      heights[hy * S + hx] = Math.min(0.72, heights[hy * S + hx]! + rand() * 0.04)
  }

  for (let i = 0; i < 1200; i += 1) {
    const x = rand() * S
    const y = rand() * S
    const len = 12 + rand() * 36
    const ang = rand() * Math.PI
    g.strokeStyle = `rgba(170,166,158,${0.04 + rand() * 0.06})`
    g.lineWidth = 1 + rand() * 2
    g.beginPath()
    g.moveTo(x, y)
    g.lineTo(x + Math.cos(ang) * len, y + Math.sin(ang) * len)
    g.stroke()
  }

  const joint = 128
  g.strokeStyle = 'rgba(72,68,62,0.55)'
  g.lineWidth = 4
  for (let x = joint; x < S; x += joint) {
    g.beginPath()
    g.moveTo(x, 0)
    g.lineTo(x, S)
    g.stroke()
    for (let y = 0; y < S; y += 1) {
      for (let dx = -2; dx <= 2; dx += 1) {
        const px = x + dx
        if (px >= 0 && px < S) heights[y * S + px] = Math.max(0.18, heights[y * S + px]! - 0.12)
      }
    }
  }
  for (let y = joint; y < S; y += joint) {
    g.beginPath()
    g.moveTo(0, y)
    g.lineTo(S, y)
    g.stroke()
    for (let x = 0; x < S; x += 1) {
      for (let dy = -2; dy <= 2; dy += 1) {
        const py = y + dy
        if (py >= 0 && py < S) heights[py * S + x] = Math.max(0.18, heights[py * S + x]! - 0.12)
      }
    }
  }

  for (let i = 0; i < 16; i += 1) {
    const x = rand() * S
    const y = rand() * S
    g.fillStyle = `rgba(95,90,82,${0.04 + rand() * 0.07})`
    g.beginPath()
    g.ellipse(x, y, 20 + rand() * 40, 12 + rand() * 24, rand() * Math.PI, 0, Math.PI * 2)
    g.fill()
  }

  for (let i = 0; i < 6; i += 1) {
    let x = rand() * S
    let y = rand() * S
    g.strokeStyle = `rgba(88,84,78,${0.2 + rand() * 0.25})`
    g.lineWidth = 0.8
    g.beginPath()
    g.moveTo(x, y)
    for (let s = 0; s < 8; s += 1) {
      x += (rand() - 0.5) * 50
      y += (rand() - 0.5) * 50
      g.lineTo(x, y)
      const hx = Math.floor(x) % S
      const hy = Math.floor(y) % S
      if (hx >= 0 && hy >= 0) heights[hy * S + hx] = Math.max(0.22, heights[hy * S + hx]! - 0.1)
    }
    g.stroke()
  }

  return buildPbrSet(albedo, heights, S, 2.8)
}

let asphaltPbr: GroundPbrSet | null = null
let concretePbr: GroundPbrSet | null = null

export function getPhotorealAsphaltPbr(): GroundPbrSet {
  if (!asphaltPbr) asphaltPbr = makePhotorealAsphalt()
  return asphaltPbr
}

export function getPhotorealConcretePbr(): GroundPbrSet {
  if (!concretePbr) concretePbr = makePhotorealConcrete()
  return concretePbr
}

function cloneTiled(
  tex: THREE.CanvasTexture,
  rx: number,
  ry: number,
  clampV = false,
): THREE.CanvasTexture {
  const t = tex.clone()
  t.repeat.set(rx, ry)
  t.wrapT = clampV ? THREE.ClampToEdgeWrapping : THREE.RepeatWrapping
  t.anisotropy = 16
  t.needsUpdate = true
  return t
}

/** 带法线/粗糙度/AO 的地面 PBR 材质 */
export function createTiledGroundMaterial(
  pbr: GroundPbrSet,
  repeatX: number,
  repeatY: number,
  opts?: { metalness?: number; normalScale?: number; clampV?: boolean; envMapIntensity?: number },
): THREE.MeshStandardMaterial {
  const clampV = opts?.clampV ?? false
  return new THREE.MeshStandardMaterial({
    map: cloneTiled(pbr.map, repeatX, repeatY, clampV),
    normalMap: cloneTiled(pbr.normalMap, repeatX, repeatY, clampV),
    roughnessMap: cloneTiled(pbr.roughnessMap, repeatX, repeatY, clampV),
    aoMap: cloneTiled(pbr.aoMap, repeatX, repeatY, clampV),
    metalness: opts?.metalness ?? 0.02,
    roughness: 1,
    normalScale: new THREE.Vector2(opts?.normalScale ?? 0.85, opts?.normalScale ?? 0.85),
    envMapIntensity: opts?.envMapIntensity ?? 0.65,
  })
}
