/**
 * 园区楼栋配置（医院数据，换医院/换模型只改本文件）：
 * 楼栋清单（GLB 文件/世界坐标/归一尺寸/朝向）+ 本体偏移 + 路网布局分组。
 * 引擎本体在 src/three/campus/（医院无关，参数注入）；楼层名解析纯函数也在引擎侧。
 * 坐标系：x 右正=东、z 南正（园区大门侧），单位≈米。
 * 摆位按 2026-11-17 用户手绘布局图（上北下南、西侧南北路、南端东西路为园区大门）：
 *   路东从北到南 = 住院楼 → 宿舍楼 → 门诊2/门诊1 同排；综合楼贴东侧纵贯、南天桥跨路；
 *   行政楼独立在道路西侧。
 */
import type { CampusBuildingConfig } from '../three/campus/buildings'

/** 楼栋世界坐标（米）。注释记录逐轮校准依据，改动前先读。 */
const POS: Record<number, [number, number]> = {
  1: [-30, 60], // 门诊1：南排右（放大后 z=56 保持南大路从天桥主跨两支柱间穿过）
  2: [-100, 68], // 门诊2：南排左，与门诊1 同行（放大 1.3 倍后拉开，楼体间隙 ~10m）
  3: [70, 54], // 综合：主跨支柱世界 z≈93.9/107.3 卡路两缘、桥板横跨路面
  4: [-52, -45], // 住院：最北排（南北向拉开纵深）
  5: [-180, 10], // 行政：道路（westCx≈-114）西侧独立地块，不参与路网定位
  6: [-70, 15], // 宿舍：门诊排（两楼总宽度中心）正后方（随门诊排与放大联动）
}

/** 底面朝向微调（弧度）。综合 = 0：GLB 节点名「南向通道」表明建模原始朝向桥已朝南。
 *  行政 = π/2 转竖（手绘图竖长条）。 */
const YAW: Record<number, number> = {
  3: 0,
  5: Math.PI / 2,
}

/** 底面对角归一目标（米）＝ GLB 实测对角 × 视觉系数（2026-11-17 用户逐栋校准：
 *  综合 200/住院 92 满意；门诊/行政/宿舍 1:1 观感偏小，放大 ~1.3 倍与高层协调）。
 *  建模基本 1:1 米制（楼层高与层数吻合）。 */
const FOOT: Record<number, number> = {
  1: 80, // 门诊1 高于门诊2（2026-11-17 用户：门诊1 要比门诊2 高）
  2: 73,
  3: 200,
  4: 92,
  5: 110, // 行政 2026-11-17 用户：还不够大，放大到 ~110（2.29 倍）
  6: 57,
}

/** 各楼本体包围盒相对 pos 的世界偏移范围（x/z 各 [min,max]，米）＝ GLB 实测 × 归一
 *  scale（FOOT/实测对角）。路网定位用它——综合楼含桥整体盒中心 ≠ 本体中心（本体偏
 *  盒北半、桥向南伸 ~55m），pos±半深的方形近似会把综合楼南缘多算 30m、把路推到桥板外。 */
const REAL_FOOT: Record<number, { x: [number, number]; z: [number, number] }> = {
  1: { x: [-30.9, 30.9], z: [-25.5, 25.5] }, // 80/55.6 = 1.439
  2: { x: [-32.6, 32.6], z: [-17, 17] }, // 73/56 = 1.304
  3: { x: [-64.8, 60.4], z: [-76.3, 8.2] }, // 200/182 = 1.098；本体偏整体盒北半（桥向南伸）
  4: { x: [-28, 28], z: [-15, 15] }, // 92/92 = 1
  5: { x: [-48.3, 48.3], z: [-22.7, 22.7] }, // 110/48 = 2.292
  6: { x: [-24, 24], z: [-15.5, 15.5] }, // 57/44 = 1.295
}

/** 原始 GLB 实测对角（归一系数 = FOOT/此值），留档备查。 */
const RAW_DIAG: Record<number, number> = {
  1: 56,
  2: 56,
  3: 182,
  4: 92,
  5: 48,
  6: 44,
}

/** 六栋楼（文件名/楼名与 mock §1.2 对齐）。
 *  住院/综合建模拆为地上(_on)+地下(_under)——2026-11-17 用户拍板：地下先不做，
 *  files 只引地上版；以后做地下把对应 _under 加进数组即可（加载器自动合并归一）。 */
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
    id: 3,
    name: '综合楼',
    files: ['zonhe_on'],
    pos: POS[3]!,
    targetFoot: FOOT[3]!,
    yaw: YAW[3] ?? 0,
    foot: REAL_FOOT[3],
  },
  {
    id: 4,
    name: '住院楼',
    files: ['zhuyuan_on'],
    pos: POS[4]!,
    targetFoot: FOOT[4]!,
    yaw: YAW[4] ?? 0,
    foot: REAL_FOOT[4],
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
    id: 6,
    name: '宿舍楼',
    files: ['sushe'],
    pos: POS[6]!,
    targetFoot: FOOT[6]!,
    yaw: YAW[6] ?? 0,
    foot: REAL_FOOT[6],
  },
]

/** 园区布局分组（路网/广场定位语义）：
 *  coreIds 参与路网定位；行政楼等独立地块楼栋不计入（否则路被撑到它脚下）。
 *  southRow/northRow 用于南缘绿化带与停车湾定位。 */
export interface CampusLayout {
  coreIds: number[]
  southRowIds: number[]
  northRowIds: number[]
}

export const CAMPUS_LAYOUT: CampusLayout = {
  coreIds: [1, 2, 3, 4, 6], // 行政(5) 独立路西地块
  southRowIds: [1, 2],
  northRowIds: [3, 4, 6], // 宿舍占中带
}

export { RAW_DIAG }
