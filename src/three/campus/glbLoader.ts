/**
 * 楼栋 GLB 加载器（Draco 压缩版，scripts/compress-building-glbs.mjs 产物）：
 * 模块级 Promise 缓存 + 失败删缓存重试（power-room cabinetModels.ts 同款语义），
 * 归一化 = 主文件底面对角归一到 targetFoot（高度同比例保真）+ 居中落地；
 * 地下层副文件（综合/住院 _under）x/z 跟随主文件平移保总装对位、y 沉入使
 * 副盒顶贴主文件 1F 底（y=0，三期批A：平时被地面盖住，选层透视才见）。
 * 楼层节点收集：名字匹配新规范（1F/B1F/GF）的节点记进 floors 映射（告警亮灯/下钻用），
 * B1F/B2F/B3F → 契约 '-1'/'-2'/'-3'。
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
  /** 归一化后的楼栋根节点（已按 config.pos/yaw 摆位、主文件 y=0 落地、地下层沉入 y<0） */
  object: THREE.Group
  /** 地上层主文件根（X 光透视时整体透明化的对象；object 含它+地下层） */
  mainObject: THREE.Object3D
  /** 楼层节点映射：契约 floor 字符串 → 该层 Object3D（"3"→3F 节点、"-1"→B1F 节点） */
  floors: Map<string, THREE.Object3D>
  /** 楼层世界盒（摆位后、压扁前算的静态真值）：floorKey → Box3。
   *  引线卡锚点/楼层取景用它——运行时 expandByObject(mesh) 会踩到陈旧父矩阵，
   *  静态盒与楼名标签/聚焦取景同源（都由 normalize 摆位后一次算定，已验证正确）。 */
  floorBoxes: Map<string, THREE.Box3>
  /** 世界包围盒（摆位后，供取景/拾取盒）——只含地上主文件（地下层不算：
   *  全景取景/楼栋聚焦不被不可见的地下层撑大） */
  box: THREE.Box3
}

const cache = new Map<string, Promise<LoadedBuilding | null>>()

/** 加载单栋（多文件：综合/住院拆地上(_on)+地下(_under)，files[0]=地上主文件定归一
 *  基准，其余为地下副文件只做 y 对位拼接沉入 y<0；缓存命中直接复用；失败不缓存
 *  下次重试，返回 null 该楼缺席不阻塞其余） */
export function loadBuilding(cfg: CampusBuildingConfig): Promise<LoadedBuilding | null> {
  const key = cfg.files.join('+')
  let p = cache.get(key)
  if (!p) {
    p = Promise.all(cfg.files.map((f) => gltf.loadAsync(`${MODEL_DIR}/${f}.glb`)))
      .then((gs) => {
        const under = new THREE.Group()
        for (let i = 1; i < gs.length; i++) under.add(gs[i]!.scene)
        return normalize(gs[0]!.scene, under.children.length ? under : null, cfg)
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

function normalize(
  src: THREE.Object3D,
  under: THREE.Object3D | null,
  cfg: CampusBuildingConfig,
): LoadedBuilding {
  // 0) 剔除建模附带物（excludeNodes 子串命中）：必须在取包围盒前，否则悬空件撑大盒
  //    把楼算小；主/副文件都剔（综合楼 under 混入「采光顶」悬空孤岛）
  if (cfg.excludeNodes?.length) {
    const doomed: THREE.Object3D[] = []
    src.traverse((o) => {
      if (o.name && cfg.excludeNodes!.some((p) => o.name.includes(p))) doomed.push(o)
    })
    for (const o of doomed) o.removeFromParent()
    if (under) {
      const doomed2: THREE.Object3D[] = []
      under.traverse((o) => {
        if (o.name && cfg.excludeNodes!.some((p) => o.name.includes(p))) doomed2.push(o)
      })
      for (const o of doomed2) o.removeFromParent()
    }
  }

  // 1) 主文件（地上）底面对角归一 + 高度同比例（scale 烘内层：外层留给摆位/动画）。
  //    归一基准只按主文件算——地下层并入不改缩放，全景视觉与未接入时零差异
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
  holder.updateMatrixWorld(true)
  // 主文件盒（含 yaw、不含地下）——楼名标签/楼栋聚焦/全景取景用，语义与未接入时一致：
  // 地下层平时不可见，取景盒不该被它撑大
  const mainBox = new THREE.Box3().setFromObject(holder)

  // 4) 地下层副文件（三期批A）：x/z 做与主文件相同的平移（同一建模总装导出，
  //    平面对位由此保持），y 整体沉入使副盒顶贴主文件 1F 底（y=0）——地下层沉入
  //    y<0，平时被地面盖住，选层透视才见。只动副文件自身 position，主文件不动
  if (under && under.children.length) {
    under.position.x = src.position.x
    under.position.z = src.position.z
    inner.add(under)
    holder.updateMatrixWorld(true)
    const ubox = new THREE.Box3().setFromObject(under)
    under.position.y -= ubox.max.y / (scale * hs)
    holder.updateMatrixWorld(true)
  }

  // 阴影与楼层节点收集（地下层 BxF 在 inner 内同样被收集）
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
  // 子树：居中/落地/under 对位改过 src/under.position，从楼层节点起算
  // updateWorldMatrix(false,false) 只用旧父矩阵，会带上调整前的偏移（引线卡锚点
  // 曾因此整体漂移）。刷新后从节点起算与从 holder 起算同源同值，引线卡锚点/
  // 楼层取景用——地下层 floorBoxes 是负 y 盒
  holder.updateMatrixWorld(true)
  const floorBoxes = new Map<string, THREE.Box3>()
  for (const [key, node] of floors) floorBoxes.set(key, new THREE.Box3().setFromObject(node))
  return { object: holder, mainObject: src, floors, floorBoxes, box: mainBox }
}
