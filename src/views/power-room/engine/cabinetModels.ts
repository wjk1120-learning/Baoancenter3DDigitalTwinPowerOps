/**
 * 配电房柜体模型模板（模块级缓存，切房不重载，归一化只做一次）：
 *   - loadProto：一级大柜（GLB 按柜名选型，见 ../config.ts CabinetModel），统一柜高 2.2；
 *   - loadKaiguanProto：二级开关单元（kaiguan.glb，照福永 smallUnitModel 三步处理：
 *     丢影棚底板 → 按材质合并 → 宽 ≤1.0 / 进深 ≤0.9 居中落地）。
 * 模板加载失败不缓存（删缓存条目，下次切房/点击重试），调用方按 null 兜过该柜继续摆。
 */
import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import { CABINET_MODEL_DIR } from '../config'

/** 一级大柜统一柜高（米）；总览取景/名牌/聚焦构图都以它为基准 */
export const CABINET_HEIGHT = 2.2

// BASE_URL 前缀跟随 vite base（/baozhongTwin/），域名根绝对路径在带前缀部署下会 404
const MODEL_URL = (m: string) => `${import.meta.env.BASE_URL}${CABINET_MODEL_DIR}/${m}.glb`

const draco = new DRACOLoader()
draco.setDecoderPath('/draco/')
const gltf = new GLTFLoader()
gltf.setDRACOLoader(draco)

const protoCache = new Map<string, Promise<THREE.Group | null>>()

/** 一级大柜模板：归一化统一柜高、居中 x/z、落地 y=0、整体投阴影 */
export function loadProto(model: string): Promise<THREE.Group | null> {
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

// ---- 二级开关模型（kaiguan.glb） ----
/** 开关归一化槽位：宽 ≤1.0m、进深 ≤0.9m（福永 GCK_SIZE.w / GCK_SIZE.d×1.25 同款） */
const SWITCH_UNIT_W = 1.0
const SWITCH_UNIT_D_MAX = 0.9

/** kaiguan.glb 导出自带影棚底板（Studio 材质/命名，200×200 暗色平面）——不丢掉会盖住整个场景 */
function isStudioMaterial(mat: THREE.Material | THREE.Material[]) {
  const list = Array.isArray(mat) ? mat : [mat]
  return list.some((m) => /studio/i.test(m?.name ?? ''))
}

/** 按材质合并几何（福永 flattenByMaterial 同款）：525 个 mesh → 十几个，开关行不卡顿 */
function flattenByMaterial(root: THREE.Object3D): THREE.Group {
  root.updateMatrixWorld(true)
  const groups = new Map<string, { mat: THREE.Material; geos: THREE.BufferGeometry[] }>()
  root.traverse((o) => {
    const mesh = o as THREE.Mesh
    if (!mesh.isMesh) return
    if (isStudioMaterial(mesh.material) || /studio/i.test(mesh.name)) return
    const multi = Array.isArray(mesh.material) && mesh.material.length > 1
    const mat = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material
    if (!mat) return
    const geo = mesh.geometry.clone()
    if (multi) geo.clearGroups()
    geo.applyMatrix4(mesh.matrixWorld)
    const key = `${mat.uuid}|${Object.keys(geo.attributes).sort().join(',')}`
    const entry = groups.get(key)
    if (entry) entry.geos.push(geo)
    else groups.set(key, { mat, geos: [geo] })
  })
  const out = new THREE.Group()
  for (const { mat, geos } of groups.values()) {
    if (geos.length === 1) {
      out.add(new THREE.Mesh(geos[0]!, mat))
      continue
    }
    const merged = mergeGeometries(geos, false)
    if (merged) {
      out.add(new THREE.Mesh(merged, mat))
      geos.forEach((g) => g.dispose())
    } else {
      // 合并不了（属性不一致）就逐个挂上，至少不丢件
      for (const g of geos) out.add(new THREE.Mesh(g, mat))
    }
  }
  out.traverse((o) => {
    const mesh = o as THREE.Mesh
    if (mesh.isMesh) {
      mesh.castShadow = true
      mesh.receiveShadow = true
    }
  })
  return out
}

/** kaiguan 模板（福永 SmallUnitProto 同款：克隆源 + 归一化后实际尺寸，构图按 box 算行距列距） */
export interface KaiguanProto {
  object: THREE.Group
  box: { w: number; h: number; d: number }
}

/** kaiguan 模板缓存（模块级，切房不重载；福永 smallUnitModel protoPromise 同款） */
let kaiguanProtoPromise: Promise<KaiguanProto | null> | null = null

/** 归一化：丢影棚底板 → 按材质合并 → 宽 ≤1.0 / 进深 ≤0.9、居中落地；失败不缓存重试 */
export function loadKaiguanProto(): Promise<KaiguanProto | null> {
  if (!kaiguanProtoPromise) {
    kaiguanProtoPromise = gltf
      .loadAsync(MODEL_URL('kaiguan'))
      .then((g) => {
        const flat = flattenByMaterial(g.scene)
        const box = new THREE.Box3().setFromObject(flat)
        const size = box.getSize(new THREE.Vector3())
        if (!Number.isFinite(size.x) || size.x <= 0 || size.y <= 0) {
          throw new Error('kaiguan 模型包围盒异常')
        }
        const center = box.getCenter(new THREE.Vector3())
        flat.position.set(-center.x, -box.min.y, -center.z)
        const holder = new THREE.Group()
        holder.scale.setScalar(Math.min(SWITCH_UNIT_W / size.x, SWITCH_UNIT_D_MAX / size.z))
        holder.add(flat)
        const scale = holder.scale.x
        return {
          object: holder,
          box: { w: size.x * scale, h: size.y * scale, d: size.z * scale },
        }
      })
      .catch((err) => {
        kaiguanProtoPromise = null
        console.warn('[PowerRoomScene] kaiguan 模型加载失败，点击将重试', err)
        return null
      })
  }
  return kaiguanProtoPromise
}
