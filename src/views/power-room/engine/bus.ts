import * as THREE from 'three'
import type { CabinetSlot } from '../power-room/layout'

/**
 * 母线光路（照搬福永 engine/bus.ts 机制）：浅蓝光芯 + 流动光点。
 *
 * 两层贴地圆柱：内芯 MeshBasicMaterial 半透明圆柱画线身；外层同轴更粗的
 * ShaderMaterial 圆柱用加法混合画流光——fragment 里 `mod(dist - uTime * 2.2, 2.6)`
 * 生成沿线匀速前进的高斯光脉冲，uStart 记录本段起点里程，光点跨段连续。
 *
 * 走线规则（福永总览母线同款，宝安所有柜都按一级大柜连）：
 *   进线柜 → 本排母线（柜位线前方 1.675m）→ 横向铺到排两端 → 每柜一条短支线；
 *   多排时右端超出（本排与下一排中更靠右的末柜 0.9m）直角下落到下一排；
 *   下一排有自己的进线柜时，下落段不流光（光从那排自己的进线柜出发）。
 */

const BUS_BLUE = 0x7ec8ff
const CORE_R = 0.03
const GLOW_R = 0.066
/** 光路贴地高度 */
const BUS_Y = 0.04
const CORE_OPACITY = 0.58
/** 排间下落段在末柜右侧的超出量 */
const DROP_X = 0.9
/** 母线在本排柜位线前方的外移量（福永 2026-10-27 实测：低仰角斜视也不被柜体挡） */
const BUS_ROW_OFFSET = 1.675

const FLOW_VERT = /* glsl */ `
varying float vAlong;
void main() {
  vAlong = uv.y;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`

const FLOW_FRAG = /* glsl */ `
varying float vAlong;
uniform float uTime;
uniform float uStart;
uniform float uLen;
void main() {
  float dist = uStart + vAlong * uLen;
  float gap = 2.6;
  float x = mod(dist - uTime * 2.2, gap);
  float pulse = exp(-pow(x - 0.28, 2.0) * 18.0);
  vec3 col = vec3(0.34, 0.62, 1.0);
  gl_FragColor = vec4(col, 0.16 + pulse * 0.8);
}
`

interface BusSegment {
  /** 单位高圆柱（长度靠 scale.y 表达） */
  coreMesh: THREE.Mesh
  glowMesh: THREE.Mesh | null
  glowMat: THREE.ShaderMaterial | null
}

export interface BusHandle {
  group: THREE.Group
  /** 每帧传入毫秒时钟，驱动流光前进 */
  update(nowMs: number): void
  dispose(): void
}

const SEG_UP = new THREE.Vector3(0, 1, 0)
const _dir = new THREE.Vector3()
const _mid = new THREE.Vector3()

/** 把一段单位圆柱摆到 from→to：位置/朝向/长度 */
function orientSegment(seg: BusSegment, from: THREE.Vector3, to: THREE.Vector3) {
  _dir.copy(to).sub(from)
  const len = Math.max(0.02, _dir.length())
  _mid.copy(from).add(to).multiplyScalar(0.5)
  const quat = new THREE.Quaternion().setFromUnitVectors(SEG_UP, _dir.normalize())
  for (const mesh of [seg.coreMesh, seg.glowMesh]) {
    if (!mesh) continue
    mesh.position.copy(_mid)
    mesh.quaternion.copy(quat)
    mesh.scale.set(1, len, 1)
  }
  if (seg.glowMat) seg.glowMat.uniforms.uLen!.value = len
}

function addSegment(
  group: THREE.Group,
  uTime: { value: number },
  from: THREE.Vector3,
  to: THREE.Vector3,
  startDist: number,
  withFlow = true,
): number {
  const len = to.clone().sub(from).length()
  if (len < 0.02) return startDist

  const coreMat = new THREE.MeshBasicMaterial({
    color: BUS_BLUE,
    transparent: true,
    opacity: CORE_OPACITY,
    toneMapped: false,
    depthWrite: false,
  })
  const core = new THREE.Mesh(new THREE.CylinderGeometry(CORE_R, CORE_R, 1, 8, 1, true), coreMat)
  group.add(core)

  let glowMat: THREE.ShaderMaterial | null = null
  let glow: THREE.Mesh | null = null
  if (withFlow) {
    glowMat = new THREE.ShaderMaterial({
      uniforms: {
        uTime,
        uStart: { value: startDist },
        uLen: { value: len },
      },
      vertexShader: FLOW_VERT,
      fragmentShader: FLOW_FRAG,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    })
    glow = new THREE.Mesh(new THREE.CylinderGeometry(GLOW_R, GLOW_R, 1, 10, 1, true), glowMat)
    glow.renderOrder = 2
    group.add(glow)
  }

  orientSegment({ coreMesh: core, glowMesh: glow, glowMat }, from, to)
  return startDist + len
}

export function buildPowerRoomBus(
  slots: CabinetSlot[],
  nameOf: (code: string) => string,
): BusHandle {
  const group = new THREE.Group()
  group.name = 'power-room-bus'
  const uTime = { value: 0 }

  const isIncoming = (s: CabinetSlot) => /进线/.test(nameOf(s.code))
  const tip = (s: CabinetSlot) => new THREE.Vector3(s.x, BUS_Y, s.z + 0.4)
  const busPt = (x: number, z: number) => new THREE.Vector3(x, BUS_Y, z)

  const rowIds = [...new Set(slots.map((s) => s.row))].sort((a, b) => a - b)
  const rowSlots = rowIds.map((r) => slots.filter((s) => s.row === r).sort((a, b) => a.x - b.x))
  const rowBusZ = rowSlots.map((rs) => rs[0]!.z + BUS_ROW_OFFSET)

  let incomingFlow = 0
  rowSlots.forEach((pris, ri) => {
    const zBus = rowBusZ[ri]!
    const xL = pris[0]!.x
    const xR = pris[pris.length - 1]!.x
    const src = pris.find(isIncoming) || (ri === 0 ? pris[0] : null)

    let busOrigin = 0
    let originX = xL
    if (src) {
      busOrigin = addSegment(group, uTime, tip(src), busPt(src.x, zBus), 0)
      originX = src.x
      addSegment(group, uTime, busPt(src.x, zBus), busPt(xL, zBus), busOrigin)
      addSegment(group, uTime, busPt(src.x, zBus), busPt(xR, zBus), busOrigin)
    } else {
      busOrigin = incomingFlow
      addSegment(group, uTime, busPt(xL, zBus), busPt(xR, zBus), busOrigin)
    }

    for (const p of pris) {
      const at = busOrigin + Math.abs(p.x - originX)
      if (!src || p !== src) addSegment(group, uTime, busPt(p.x, zBus), tip(p), at)
    }

    const next = rowSlots[ri + 1]
    if (!next) return
    const a = pris[pris.length - 1]!
    const zb = rowBusZ[ri + 1]!
    // 排宽可变（Excel 任意排柜数）：下落点要让「本排+下一排」更靠右的柜体都避开竖线
    const xDrop = Math.max(a.x, next[next.length - 1]!.x) + DROP_X
    const dropStart = src ? busOrigin + Math.abs(xR - originX) : busOrigin + Math.abs(xR - xL)
    const flowDrop = !next.some(isIncoming)
    let d = dropStart
    d = addSegment(group, uTime, busPt(a.x, zBus), busPt(xDrop, zBus), d, flowDrop)
    d = addSegment(group, uTime, busPt(xDrop, zBus), busPt(xDrop, zb), d, flowDrop)
    incomingFlow = addSegment(group, uTime, busPt(xDrop, zb), busPt(next[0]!.x, zb), d, flowDrop)
  })

  return {
    group,
    update(nowMs: number) {
      uTime.value = nowMs * 0.001
    },
    dispose() {
      group.traverse((o) => {
        const mesh = o as THREE.Mesh
        if (mesh.geometry) mesh.geometry.dispose()
        if (mesh.material) {
          const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
          mats.forEach((m) => m.dispose())
        }
      })
      while (group.children.length) group.remove(group.children[0])
    },
  }
}
