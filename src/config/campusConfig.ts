/**
 * 园区楼栋配置（医院数据，换医院/换模型只改本文件）：
 * 楼栋清单（GLB 文件/世界坐标/归一尺寸/朝向）+ 本体偏移 + 路网布局分组。
 * 引擎本体在 src/three/campus/（医院无关，参数注入）；楼层名解析纯函数也在引擎侧。
 * 坐标系：x 右正=东、z 南正（园区大门侧），单位≈米。
 * 摆位按 2026-11-17 用户手绘布局图（上北下南、西侧南北路、南端东西路为园区大门）：
 *   路东从北到南 = 住院楼 → 宿舍楼 → 门诊2/门诊1 同排；综合楼贴东侧纵贯、南天桥跨路；
 *   行政楼独立在道路西侧。
 *
 * ⚠ id 口径（2026-11-25 联调认门拍板，用户确认）：id = 后端 bz_hospital_building.id
 * （§1.2 /device/buildings 返回，后端维度表为唯一事实源）。3D 六栋与后端对齐为：
 *   1=门诊1号楼  2=门诊2号楼  3=住院楼  4=综合楼  5=行政楼  7=宿舍楼
 * 后端另有 办公副楼(6)/饭堂(8)/居民楼(9)——用户拍板暂不做 3D 建模，不出现在本清单；
 * 告警定位/能耗键均按后端 id 与楼名直接命中，不再经过旧 mock 时代的错位映射
 * （旧配置 3=综合/4=住院/6=宿舍 已随联调切换重排；换医院时重新认门再改）。
 */
import type { CampusBuildingConfig } from '../three/campus/buildings'

/** 楼栋世界坐标（米）。注释记录逐轮校准依据，改动前先读。 */
const POS: Record<number, [number, number]> = {
  1: [-30, 60], // 门诊1：南排右（放大后 z=56 保持南大路从天桥主跨两支柱间穿过）
  2: [-100, 68], // 门诊2：南排左，与门诊1 同行（放大 1.3 倍后拉开，楼体间隙 ~10m）
  4: [70, 54], // 综合：主跨支柱世界 z≈93.9/107.3 卡路两缘、桥板横跨路面
  3: [-52, -45], // 住院：最北排（南北向拉开纵深）
  5: [-180, 10], // 行政：道路（westCx≈-114）西侧独立地块，不参与路网定位
  7: [-70, 15], // 宿舍：门诊排（两楼总宽度中心）正后方（随门诊排与放大联动）
}

/** 底面朝向微调（弧度）。综合 = 0：GLB 节点名「南向通道」表明建模原始朝向桥已朝南。
 *  行政 = π/2 转竖（手绘图竖长条）。 */
const YAW: Record<number, number> = {
  4: 0,
  5: Math.PI / 2,
}

/** 底面对角归一目标（米）＝ GLB 实测对角 × 视觉系数（2026-11-17 用户逐栋校准：
 *  综合 200/住院 92 满意；门诊/行政/宿舍 1:1 观感偏小，放大 ~1.3 倍与高层协调）。
 *  建模基本 1:1 米制（楼层高与层数吻合）。 */
const FOOT: Record<number, number> = {
  1: 80, // 门诊1 高于门诊2（2026-11-17 用户：门诊1 要比门诊2 高）
  2: 73,
  4: 200,
  3: 92,
  5: 110, // 行政 2026-11-17 用户：还不够大，放大到 ~110（2.29 倍）
  7: 57,
}

/** 各楼本体包围盒相对 pos 的世界偏移范围（x/z 各 [min,max]，米）＝ GLB 实测 × 归一
 *  scale（FOOT/实测对角）。路网定位用它——综合楼含桥整体盒中心 ≠ 本体中心（本体偏
 *  盒北半、桥向南伸 ~55m），pos±半深的方形近似会把综合楼南缘多算 30m、把路推到桥板外。 */
const REAL_FOOT: Record<number, { x: [number, number]; z: [number, number] }> = {
  1: { x: [-30.9, 30.9], z: [-25.5, 25.5] }, // 80/55.6 = 1.439
  2: { x: [-32.6, 32.6], z: [-17, 17] }, // 73/56 = 1.304
  4: { x: [-64.8, 60.4], z: [-76.3, 8.2] }, // 200/182 = 1.098；本体偏整体盒北半（桥向南伸）
  3: { x: [-28, 28], z: [-15, 15] }, // 92/92 = 1
  5: { x: [-48.3, 48.3], z: [-22.7, 22.7] }, // 110/48 = 2.292
  7: { x: [-25.6, 25.6], z: [-12.5, 12.5] }, // 57/42.81 = 1.3315；2026-11-19 新模型实测（剔俯视标注）
}

/** 原始 GLB 实测对角（归一系数 = FOOT/此值），留档备查。 */
const RAW_DIAG: Record<number, number> = {
  1: 56,
  2: 56,
  4: 182,
  3: 92,
  5: 48,
  7: 42.81, // 2026-11-19 新模型（1F~6F 本体，剔俯视标注）scripts/measure-building-glb.mjs 实测
}

/** 六栋楼（id = 后端楼栋 id，见文件头 ⚠ id 口径；楼名与后端 buildingName 逐字一致）。
 *  住院/综合建模拆为地上(_on)+地下(_under)——三期批A（2026-11-23 拍板）接入地下：
 *  files[0]=地上主文件定归一基准（全景视觉不变），_under 沉入 y<0 选层透视才见；
 *  综合楼 under 混入「采光顶」悬空孤岛（比 B3F 还低 14m），excludeNodes 剔除。 */
export const CAMPUS_BUILDINGS: CampusBuildingConfig[] = [
  {
    id: 1,
    name: '门诊1号楼',
    files: ['1menzhen'],
    pos: POS[1]!,
    targetFoot: FOOT[1]!,
    yaw: YAW[1] ?? 0,
    foot: REAL_FOOT[1],
    labelLift: 3, // 标签往下移（2026-11-18 用户：门诊1 标签太高）
  },
  {
    id: 2,
    name: '门诊2号楼',
    files: ['2'],
    pos: POS[2]!,
    targetFoot: FOOT[2]!,
    yaw: YAW[2] ?? 0,
    foot: REAL_FOOT[2],
  },
  {
    id: 4,
    name: '综合楼',
    files: ['zonhe_on', 'zonhe_under'],
    pos: POS[4]!,
    targetFoot: FOOT[4]!,
    yaw: YAW[4] ?? 0,
    foot: REAL_FOOT[4],
    excludeNodes: ['采光顶'], // under 混入的「采光顶｜放射肋」悬空孤岛（B3F 底还低 14m）
  },
  {
    id: 3,
    name: '住院楼',
    files: ['zhuyuan_on', 'zhuyuan_under'],
    pos: POS[3]!,
    targetFoot: FOOT[3]!,
    yaw: YAW[3] ?? 0,
    foot: REAL_FOOT[3],
  },
  {
    id: 5,
    name: '行政楼',
    files: ['xingzhen'],
    pos: POS[5]!,
    targetFoot: FOOT[5]!,
    yaw: YAW[5] ?? 0,
    foot: REAL_FOOT[5],
    focusDir: [-1, -0.25, 0], // 正门朝东（2026-11-18 用户）：聚焦从东看向西，拍到正门立面
  },
  {
    id: 7,
    name: '宿舍楼',
    files: ['sushe'],
    pos: POS[7]!,
    targetFoot: FOOT[7]!,
    yaw: YAW[7] ?? 0,
    foot: REAL_FOOT[7],
    excludeNodes: ['俯视标注'], // 建模悬空俯视标注剔除；立面繁体字「華景樓」保留（2026-11-19 拍板）
    heightScale: 1.74, // 新模版偏矮（归一后 25.6m vs 门诊1 42.1m）拔高到 ~44.5m（2026-11-19：宿舍要比门诊1/2 高）
  },
]

/** 园区布局分组（路网/广场定位语义）：
 *  coreIds 参与路网定位；行政楼等独立地块楼栋不计入（否则路被撑到它脚下）。
 *  southRow/northRow 用于南缘绿化带与停车湾定位。
 *  （数组保持旧配置的建筑顺序：门诊1→门诊2→综合→住院→宿舍，仅 id 按后端重排。） */
export interface CampusLayout {
  coreIds: number[]
  southRowIds: number[]
  northRowIds: number[]
}

export const CAMPUS_LAYOUT: CampusLayout = {
  coreIds: [1, 2, 4, 3, 7], // 行政(5) 独立路西地块
  southRowIds: [1, 2],
  northRowIds: [4, 3, 7], // 宿舍占中带
}

export { RAW_DIAG }
