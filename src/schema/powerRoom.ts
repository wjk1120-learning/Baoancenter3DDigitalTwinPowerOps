/** 配电房图纸配置的类型定义（对应 src/config/power-rooms.json） */

/**
 * 柜体模型枚举（一级大柜，共 4 种）——新医院柜型不同时在此扩展，并同步 check-power-rooms.mjs 的 MODELS。
 * 业务口径（2026-10-29 用户确认）：进线柜、馈线柜、联络柜是三种类型，共用 jinxian 一个模型。
 * 注：kaiguan.glb 不进本枚举——它是挂在大柜下的「二级开关单元」模型（旧项目 smallUnitModel.ts）。
 * 高压柜专用模型建模中：建模完成后在转换脚本加映射行、枚举加新模型名；此前转换遇高压柜警告跳过。
 */
export type CabinetModel =
  | 'jinxian' // 进线柜 / 馈线柜 / 联络柜（三种类型共用）
  | 'shuangdianyuan' // 双电源切换柜
  | 'dianrongui' // 电容(补偿)柜
  | 'peidiangui' // 配电柜（默认）

export interface CabinetConfig {
  /** 柜号，配电房内唯一（如 2AA1） */
  code: string
  name: string
  spec?: string
  /** 柜体选型，显式指定（决策：不用柜名关键词推断） */
  model: CabinetModel
  /** 对接后端的设备编号（两位字母+6位数字；宝安 BZ 前缀），可空=纯档案柜 */
  devCode?: string
  /** 单柜 x 微调（米，负=左），缺省 0 */
  nudgeX?: number
  /** 下挂负载/回路名 */
  feeders?: string[]
}

export interface PowerRoomConfig {
  id: string
  name: string
  diagramTitle?: string
  /** 排 → 每排从左到右的柜子 */
  rows: CabinetConfig[][]
}

export interface PowerRoomsFile {
  /** 柜间距（米），全局默认 */
  pitch: number
  rooms: PowerRoomConfig[]
}
