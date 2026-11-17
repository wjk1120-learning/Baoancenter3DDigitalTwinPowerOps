/**
 * 地面纹理（照搬福永 src/three/textures.ts 的 makeLawn/makeVignette 两个函数，
 * 模块级缓存同款；其余纹理函数宝中用不到未搬）。
 */
import * as THREE from 'three'

function makeLawn(): THREE.CanvasTexture {
  const S = 1024
  const c = document.createElement('canvas')
  c.width = c.height = S
  const g = c.getContext('2d')!
  const img = g.createImageData(S, S)
  const data = img.data
  const hash2 = (x: number, y: number) => {
    let n = Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263)
    n = Math.imul(n ^ (n >>> 13), 1274126177)
    return ((n ^ (n >>> 16)) >>> 0) / 4294967296
  }
  const vnoise = (x: number, y: number) => {
    const ix = Math.floor(x)
    const iy = Math.floor(y)
    const fx = x - ix
    const fy = y - iy
    const ux = fx * fx * (3 - 2 * fx)
    const uy = fy * fy * (3 - 2 * fy)
    const a = hash2(ix, iy)
    const b = hash2(ix + 1, iy)
    const c2 = hash2(ix, iy + 1)
    const d = hash2(ix + 1, iy + 1)
    return a + (b - a) * ux + (c2 - a) * uy + (a - b - c2 + d) * ux * uy
  }
  for (let y = 0; y < S; y += 1) {
    for (let x = 0; x < S; x += 1) {
      const patch = vnoise(x / 42, y / 42) * 0.62 + vnoise(x / 11, y / 11) * 0.38
      const blade = hash2(x * 3 + (y % 5), y * 7)
      const grain = hash2(x, y * 4)
      const t = Math.min(1, Math.max(0, patch * 0.72 + blade * 0.18 + grain * 0.1))
      const i = (y * S + x) * 4
      data[i] = Math.round(48 + t * 128 + (grain - 0.5) * 22)
      data[i + 1] = Math.round(92 + t * 118 + (grain - 0.5) * 16)
      data[i + 2] = Math.round(18 + t * 32)
      data[i + 3] = 255
    }
  }
  g.putImageData(img, 0, 0)
  g.lineWidth = 1
  for (let i = 0; i < 28000; i += 1) {
    const x = Math.random() * S
    const y = Math.random() * S
    const h = 2 + Math.random() * 5
    const lime = Math.random() > 0.45
    g.strokeStyle = lime ? 'rgba(168,210,62,0.55)' : 'rgba(46,92,24,0.5)'
    g.beginPath()
    g.moveTo(x, y)
    g.lineTo(x + (Math.random() - 0.5) * 1.6, y - h)
    g.stroke()
  }
  const tex = new THREE.CanvasTexture(c)
  tex.wrapS = THREE.RepeatWrapping
  tex.wrapT = THREE.RepeatWrapping
  tex.colorSpace = THREE.SRGBColorSpace
  tex.anisotropy = 16
  tex.minFilter = THREE.LinearMipmapLinearFilter
  tex.magFilter = THREE.LinearFilter
  tex.generateMipmaps = true
  return tex
}

/** 边缘渐晕贴图：透明中心 → 四周淡蓝灰，让地面边缘融入天空薄雾 */
function makeVignette(): THREE.CanvasTexture {
  const S = 256
  const c = document.createElement('canvas')
  c.width = c.height = S
  const g = c.getContext('2d')!
  const grad = g.createRadialGradient(S / 2, S / 2, S * 0.3, S / 2, S / 2, S / 2)
  grad.addColorStop(0, 'rgba(0,0,0,0)')
  grad.addColorStop(0.85, 'rgba(0,0,0,0)')
  grad.addColorStop(1, 'rgba(150,178,205,0.30)')
  g.fillStyle = grad
  g.fillRect(0, 0, S, S)
  const tex = new THREE.CanvasTexture(c)
  tex.colorSpace = THREE.SRGBColorSpace
  return tex
}

const lawnTex = makeLawn()
const vignetteTex = makeVignette()

export function getLawnTexture(): THREE.CanvasTexture {
  return lawnTex
}
export function getVignetteTexture(): THREE.CanvasTexture {
  return vignetteTex
}
