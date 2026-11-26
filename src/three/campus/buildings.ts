/**
 * 园区楼栋类型 + 楼层名解析（docs/3D园区一期方案.md）。
 * 本文件是引擎通用件：只有类型与纯函数，不含具体医院数据——
 * 某家医院的楼栋清单/坐标/尺寸在 src/config/campusConfig.ts（换医院只改那里）。
 * three 世界系：x 右正=东、z 南正（相机侧）；y 上正，楼层节点落地 y=0。
 */

export interface CampusBuildingConfig {
  /** buildingId（= 后端 §1.2 /device/buildings 的楼栋 id） */
  id: number
  /** 楼名（信息卡/楼名标签显示） */
  name: string
  /** GLB 文件名列表（public/models/buildings/ 下，不含扩展名）。
   *  同一栋拆地上(_on)/地下(_under)多文件时全部列入，加载器合并归一。 */
  files: string[]
  /** 世界坐标 [x, z] */
  pos: [number, number]
  /** 底面对角归一目标（米）：整体盒（含桥/附属）对角缩放到该值，高度同比例 */
  targetFoot: number
  /** 朝向微调（弧度，可选） */
  yaw: number
  /** 聚焦机位方向（可选，[x,y,z] 从相机看向楼的方向向量，缺省全场统一南向微俯）。
   *  正门不朝南的楼单独指定（如行政楼正门朝东：[-1, -0.25, 0] 从东看向西）。 */
  focusDir?: [number, number, number]
  /** 楼名标签相对楼顶的抬升（米，可选，缺省 8；个别楼标签偏高时下调） */
  labelLift?: number
  /** 本体包围盒相对 pos 的世界偏移（x/z 各 [min,max]，米，含归一 scale）。
   *  路网/广场定位用本体真实占地；含桥等附属的楼（本体偏整体盒一侧）必须填，
   *  否则按 targetFoot/2 方形近似会算偏（如综合楼南缘多算 30m 把路推到桥板外）。 */
  foot?: { x: [number, number]; z: [number, number] }
  /** 加载时剔除的节点名子串（不渲染、不进归一包围盒）。
   *  建模附带物不需要进 3D 场景时配（如宿舍楼悬空俯视标注）。 */
  excludeNodes?: string[]
  /** 高度独立缩放（可选，y 方向乘子，缺省 1）。模型高宽比失真（换模版后偏矮/偏高）
   *  且不想动 footprint 归一时用——只拔高不扩底。 */
  heightScale?: number
}

// ---- 楼层名解析（契约 floor 字符串 ↔ GLB 节点名，纯公式） ----
// 建模规范：地上 "1F/2F…"、地下 "B1F/B2F…"、G 层 "GF"。
// 只认精确格式，不做旧前缀兜底（F01_Mesh / F01_CENTER_* 等子件会被 ^F\d+ 误匹配）。
const FLOOR_NODE_RE = /^(\d+)F$/
const BASEMENT_NODE_RE = /^B(\d+)F$/

/** 楼层节点名 → 契约 floor 字符串（"3F"→"3"、"B2F"→"-2"、"GF"→"G"）；非楼层节点返回 null */
export function floorKeyOfNode(name: string): string | null {
  let m = FLOOR_NODE_RE.exec(name)
  if (m) return String(Number(m[1]))
  m = BASEMENT_NODE_RE.exec(name)
  if (m) return String(-Number(m[1]))
  if (name === 'GF') return 'G'
  return null
}

/** 契约 floor 字符串 → 楼层节点名（"3"→"3F"、"-2"→"B2F"、"G"→"GF"）；非法格式返回 null（不亮灯不猜） */
export function floorNodeName(floor: string): string | null {
  if (floor === 'G') return 'GF'
  if (/^-?\d+$/.test(floor)) {
    const n = Number(floor)
    if (n >= 1) return `${n}F`
    if (n <= -1) return `B${-n}F`
  }
  return null
}
