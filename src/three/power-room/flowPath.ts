/**
 * 聚焦视图的直角光路流光段（光芯 + 流光 glow 双层，照搬 bus.ts 的光芯/流光视觉语言）。
 * flowMats 由调用方持有（tick 驱动 uTime、清场时 dispose），本文件只负责生成段。
 */
import * as THREE from 'three'

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
  float gap = 1.5;
  float x = mod(dist - uTime * 2.2, gap);
  float pulse = exp(-pow(x - 0.28, 2.0) * 18.0);
  vec3 col = vec3(0.34, 0.62, 1.0);
  gl_FragColor = vec4(col, 0.16 + pulse * 0.8);
}
`

/**
 * 加一段流光管（光芯 MeshBasicMaterial 0.05/0.8 + glow ShaderMaterial 加法混合）；
 * 段长 <2cm 跳过（构图解算的 riserUp/riserDown 恒输出，收缩到同一点时为零长度）。
 * registry：调用方持有的流光材质数组（tick 写 uTime、clearSwitches 时 dispose）。
 */
export function addFlowSegment(
  group: THREE.Group,
  from: THREE.Vector3,
  to: THREE.Vector3,
  registry: THREE.ShaderMaterial[],
) {
  const len = from.distanceTo(to)
  if (len < 0.02) return
  const dir = to.clone().sub(from).normalize()
  const mid = from.clone().add(to).multiplyScalar(0.5)
  const up = new THREE.Vector3(0, 1, 0)
  const quat = new THREE.Quaternion().setFromUnitVectors(up, dir)

  const core = new THREE.Mesh(
    new THREE.CylinderGeometry(0.05, 0.05, len, 8),
    new THREE.MeshBasicMaterial({ color: 0x7ec8ff, transparent: true, opacity: 0.8 }),
  )
  core.position.copy(mid)
  core.quaternion.copy(quat)
  group.add(core)

  const glowMat = new THREE.ShaderMaterial({
    vertexShader: FLOW_VERT,
    fragmentShader: FLOW_FRAG,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    uniforms: {
      uTime: { value: 0 },
      uStart: { value: 0 },
      uLen: { value: len },
    },
  })
  const glow = new THREE.Mesh(new THREE.CylinderGeometry(0.066, 0.066, len, 8), glowMat)
  glow.position.copy(mid)
  glow.quaternion.copy(quat)
  group.add(glow)
  registry.push(glowMat)
}
