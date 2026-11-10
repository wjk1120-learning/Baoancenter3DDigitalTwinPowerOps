/**
 * 配电房医院级配置。
 *
 * 复用约定：医院相关变量只允许出现在本文件与 data/power-rooms.json，
 * engine/ 与 components/ 内不出现医院字面量（新医院接入清单见模块根 reuse.md）。
 */

/** 柜体 GLB 模型目录（public/ 下相对路径；运行时拼 BASE_URL，见 engine/scene.ts 的 MODEL_URL） */
export const CABINET_MODEL_DIR = 'models/cabinets'

/**
 * 柜体模型枚举（一级大柜）——新医院柜型不同时在此扩展，并同步 scripts/check-power-rooms.mjs 的 MODELS。
 * 业务口径（2026-10-29 用户确认）：进线柜、馈线柜、联络柜是三种类型，共用 jinxian 一个模型。
 * 注：kaiguan.glb 不进本枚举——它是挂在大柜下的「二级开关单元」模型（engine/scene.ts 内处理）。
 * 高压柜专用模型建模中：建模完成后在转换脚本加映射行、枚举加新模型名；此前转换遇高压柜警告跳过。
 */
export type CabinetModel =
  | 'jinxian' // 进线柜 / 馈线柜 / 联络柜（三种类型共用）
  | 'shuangdianyuan' // 双电源切换柜
  | 'dianrongui' // 电容(补偿)柜
  | 'peidiangui' // 配电柜（默认）
