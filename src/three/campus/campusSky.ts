import * as THREE from 'three'

/** 太阳相对园区中心：西北、中低仰角，影子朝向镜头前的草坪/道路 */
export const CAMPUS_SUN_DIR = new THREE.Vector3(-0.36, 0.48, -1).normalize()
export const CAMPUS_SUN_DIST = 300

const SKY_VERT = /* glsl */ `
varying vec3 vDir;
void main() {
  vec4 world = modelMatrix * vec4(position, 1.0);
  vDir = world.xyz;
  gl_Position = projectionMatrix * viewMatrix * world;
}
`

const SKY_FRAG = /* glsl */ `
varying vec3 vDir;
uniform vec3 uSun;
void main() {
  vec3 d = normalize(vDir);
  float h = d.y;
  vec3 zenith = vec3(0.106, 0.306, 0.678);
  vec3 mid = vec3(0.38, 0.62, 0.88);
  vec3 horizon = vec3(0.992, 0.976, 0.91);
  vec3 sunCol = vec3(1.0, 0.95, 0.78);
  vec3 col = mix(horizon, mid, smoothstep(-0.08, 0.22, h));
  col = mix(col, zenith, smoothstep(0.18, 0.92, h));
  vec3 sun = normalize(uSun);
  float disc = pow(max(0.0, dot(d, sun)), 48.0);
  float halo = pow(max(0.0, dot(d, sun)), 6.0);
  float hz = smoothstep(0.35, -0.02, h);
  col = mix(col, sunCol, halo * 0.22 * hz);
  col += sunCol * disc * 0.85;
  gl_FragColor = vec4(col, 1.0);
}
`

/** 大半径天空穹顶：随相机转动，天顶深蓝、地平线暖白、太阳方向有光晕 */
export function createCampusSkyDome(): THREE.Mesh {
  const geo = new THREE.SphereGeometry(1400, 48, 24)
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    toneMapped: false,
    uniforms: {
      uSun: { value: CAMPUS_SUN_DIR.clone() },
    },
    vertexShader: SKY_VERT,
    fragmentShader: SKY_FRAG,
  })
  const mesh = new THREE.Mesh(geo, mat)
  mesh.name = '__campusSky'
  mesh.frustumCulled = false
  mesh.renderOrder = -2000
  mesh.raycast = () => {}
  return mesh
}

export function updateCampusSkySun(group: THREE.Object3D, dir: THREE.Vector3) {
  const sky = group.getObjectByName('__campusSky')
  if (!(sky instanceof THREE.Mesh)) return
  const mat = sky.material
  if (mat instanceof THREE.ShaderMaterial && mat.uniforms.uSun) {
    ;(mat.uniforms.uSun.value as THREE.Vector3).copy(dir).normalize()
  }
}
