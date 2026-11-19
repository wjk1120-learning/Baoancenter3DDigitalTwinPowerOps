/**
 * 楼栋 GLB 加载器（Draco 压缩版，scripts/compress-building-glbs.mjs 产物）：
 * 模块级 Promise 缓存 + 失败删缓存重试（power-room cabinetModels.ts 同款语义），
 * 归一化 = 底面对角归一到 targetFoot（高度同比例保真，南低北高靠建模高差）+ 居中落地。
 * 楼层节点收集：名字匹配新规范（1F/B2F/GF）的节点记进 floors 映射（告警亮灯/下钻用）。
 */
import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js'
import { floorKeyOfNode } from './buildings'
import type { CampusBuildingConfig } from './buildings'

const MODEL_DIR = `${import.meta.env.BASE_URL}models/buildings`
// 带前缀部署（/baozhongTwin/）下域名根绝对路径会 404，与 cabinetModels 同坑同解
const draco = new DRACOLoader()
draco.setDecoderPath(`${import.meta.env.BASE_URL}draco/`)
const gltf = new GLTFLoader()
gltf.setDRACOLoader(draco)

export interface LoadedBuilding {
  /** 归一化后的楼栋根节点（已按 config.pos/yaw 摆位、y=0 落地） */
  object: THREE.Group
  /** 楼层节点映射：契约 floor 字符串 → 该层 Object3D（"3"→3F 节点） */
  floors: Map<string, THREE.Object3D>
  /** 楼层世界盒（摆位后、压扁前算的静态真值）：floorKey → Box3。
   *  引线卡锚点/楼层取景用它——运行时 expandByObject(mesh) 会踩到陈旧父矩阵，
   *  静态盒与楼名标签/聚焦取景同源（都由 normalize 摆位后一次算定，已验证正确）。 */
  floorBoxes: Map<string, THREE.Box3>
  /** 世界包围盒（摆位后，供取景/拾取盒） */
  box: THREE.Box3
}

const cache = new Map<string, Promise<LoadedBuilding | null>>()

/** 加载单栋（多文件：住院/综合建模拆地上地下，files 数组全并到同一株归一；
 *  缓存命中直接复用；失败不缓存下次重试，返回 null 该楼缺席不阻塞其余） */
export function loadBuilding(cfg: CampusBuildingConfig): Promise<LoadedBuilding | null> {
  const key = cfg.files.join('+')
  let p = cache.get(key)
  if (!p) {
    p = Promise.all(cfg.files.map((f) => gltf.loadAsync(`${MODEL_DIR}/${f}.glb`)))
      .then((gs) => {
        const merged = new THREE.Group()
        for (const g of gs) merged.add(g.scene)
        return normalize(merged, cfg)
      })
      .catch((err) => {
        cache.delete(key)
        console.warn(`[CampusScene] 楼栋 ${cfg.name}(${key}) 加载失败，将重试`, err)
        return null
      })
    cache.set(key, p)
  }
  return p
}

function normalize(src: THREE.Object3D, cfg: CampusBuildingConfig): LoadedBuilding {
  // 0) 剔除建模附带物（excludeNodes 子串命中）：必须在取包围盒前，否则悬空件撑大盒把楼算小
  if (cfg.excludeNodes?.length) {
    const doomed: THREE.Object3D[] = []
    src.traverse((o) => {
      if (o.name && cfg.excludeNodes!.some((p) => o.name.includes(p))) doomed.push(o)
    })
    for (const o of doomed) o.removeFromParent()
  }

  // 1) 底面对角归一 + 高度同比例（scale 烘内层：外层留给摆位/动画）
  const raw = new THREE.Box3().setFromObject(src)
  const size = raw.getSize(new THREE.Vector3())
  const diag = Math.hypot(size.x, size.z)
  const scale = diag > 0 ? cfg.targetFoot / diag : 1
  // heightScale：换模版高宽比失真时 y 独立拔高（如宿舍楼新模版偏矮）
  const hs = cfg.heightScale ?? 1
  const inner = new THREE.Group()
  inner.scale.set(scale, scale * hs, scale)
  inner.add(src)

  // 2) 居中 x/z + 落地 y=0（缩放后的世界盒；y 落地除数含 hs）
  const box = new THREE.Box3().setFromObject(inner)
  const center = box.getCenter(new THREE.Vector3())
  src.position.x -= center.x / scale
  src.position.z -= center.z / scale
  src.position.y -= box.min.y / (scale * hs)

  // 3) 摆位外层
  const holder = new THREE.Group()
  holder.position.set(cfg.pos[0], 0, cfg.pos[1])
  holder.rotation.y = cfg.yaw
  holder.add(inner)
  holder.name = `building-${cfg.id}`

  // 阴影与楼层节点收集
  const floors = new Map<string, THREE.Object3D>()
  holder.traverse((o) => {
    const mesh = o as THREE.Mesh
    if (mesh.isMesh) {
      mesh.castShadow = true
      mesh.receiveShadow = true
    }
    if (o.name) {
      const key = floorKeyOfNode(o.name)
      if (key != null && !floors.has(key)) floors.set(key, o)
    }
  })
  // 楼层静态世界盒（摆位后算定）。⚠ 必须先 holder.updateMatrixWorld(true) 刷新整棵
  // 子树：步骤 2 居中改过 src.position，从楼层节点起算 updateWorldMatrix(false,false)
  // 只用旧父矩阵，会带上居中前的偏移（引线卡锚点曾因此整体漂移）。刷新后从节点起算
  // 与从 holder 起算（下面 box）同源同值，引线卡锚点/楼层取景用。
  holder.updateMatrixWorld(true)
  const floorBoxes = new Map<string, THREE.Box3>()
  for (const [key, node] of floors) floorBoxes.set(key, new THREE.Box3().setFromObject(node))
  return { object: holder, floors, floorBoxes, box: new THREE.Box3().setFromObject(holder) }
}
