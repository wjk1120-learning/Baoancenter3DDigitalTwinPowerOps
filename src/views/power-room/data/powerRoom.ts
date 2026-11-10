/** 配电房图纸配置的类型定义（对应 data/power-rooms.json；校验 scripts/check-power-rooms.mjs） */
import type { CabinetModel } from '../config'

export interface CabinetConfig {
  /** 柜号，配电房内唯一（如 2AA1） */
  code: string
  name: string
  /** 柜体选型，显式指定（决策：不用柜名关键词推断）；枚举见 ../config */
  model: CabinetModel
  /** 对接后端的设备编号（两位字母+6位数字；宝安 BZ 前缀），可空=纯档案柜 */
  devCode?: string
  /** 单柜 x 微调（米，负=左），缺省 0 */
  nudgeX?: number
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
