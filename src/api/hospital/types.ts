import type { AlertLocation } from '../event/types'

/** CET 事件等级：1紧急 2严重 3一般 4提醒 */
export type AlertEventLevel = 1 | 2 | 3 | 4

/** 告警粗粒度等级（后端事件等级归并：error=紧急，其余为 warn） */
export type AlertLevel = 'warn' | 'error'

/** 告警条目 */
export interface AlertItem {
  id: string
  time: string
  device: string
  content: string
  /** 粗粒度：error=紧急，其余为 warn（3D/看板兼容） */
  level: AlertLevel
  /** 四级等级，缺省时按 level 回退 */
  eventLevel?: AlertEventLevel
  system: string
  /** 告警处理状态；闭环逻辑未实现，界面需标注 */
  status: 'pending' | 'processing' | 'done'
  /** CET 设备 ID（EventBrief 已无此字段，WS EventInfo 仍可能有） */
  deviceId?: string
  /** 告警位置列表（doc v3.57 起替代 superDeviceName/building/floor；无可解析条目为 null） */
  locations?: AlertLocation[] | null
  /** CET handleStatus：0 未处理 / 1 已处理 */
  handleStatus?: number
}

/** 告警详情附图（预留；当前 CET 告警详情不下发，界面未展示） */
export interface AlertPhoto {
  url: string
  caption: string
  kind?: 'cabinet' | 'infrared'
}

export interface AlertDetail {
  id: string
  recordId: string
  source: string
  updateTime: string
  deviceName: string
  /** CET deviceId */
  deviceId?: string
  alarmTime: string
  reportTime: string
  eventType: string
  eventLevel: '紧急' | '严重' | '一般' | '提醒'
  eventLevelNum?: AlertEventLevel
  description: string
  opinion: string
  status: AlertItem['status']
  /** CET handleStatus：0 未处理 / 1 已处理 */
  handleStatus?: number
  handler: string
  handleTime: string
  imageLink: string
  photos: AlertPhoto[]
  caoliaoRecordId: string
  location?: string
  photoDirect?: boolean
}

export interface HistoryAlertRow {
  id: string
  time: string
  content: string
  level: AlertItem['level']
  status: AlertItem['status']
  eventLevel?: AlertEventLevel
}

/** 变压器三相读数（null = 测点未识别，区别于真实 0 值） */
export interface TransformerPhase {
  phase: 'A' | 'B' | 'C'
  voltage: number | null
  current: number | null
}

export interface TransformerReading {
  id: string
  name: string
  phases: TransformerPhase[]
}

/** 医院总览数据 */
export interface HospitalOverview {
  electricityToday: number
  /** 昨日用电量（kWh），来自 GET /FY/energy/yesterday */
  electricityYesterday: number
  /** 用电量较昨日（环比，%） */
  electricityChange: number
  /** 今日碳排放（kg，CET carbonKg/1000） */
  carbonEmission: number
  /** 昨日碳排放（kg，GET /FY/energy/yesterday / 近7日历史）；碳排环比的唯一对比基数 */
  carbonYesterdayKg: number
  /** 碳排放较昨日（环比，%） */
  carbonEmissionChange: number
  /** 设备总数（GET /FY/device/count；不是能耗有效测点数） */
  totalDevices: number
  /** 总功率（kW） */
  totalPower: number
  /** 总功率较昨日（环比，%） */
  totalPowerChange: number
  pointOnline: { name: string; rate: number }[]
  transformers: TransformerReading[]
  healthScore: number
  healthText: string
  /** 医院整体健康度细分指标（设备/用水/用电/运维） */
  healthDetail: HealthDetail[]
}

/** 医院健康度细分指标 */
export interface HealthDetail {
  name: string
  score: number
  grade: string
}

/** 运维完成情况 */
export interface OpsProgressItem {
  name: string
  status: 'done' | 'processing' | 'pending'
}

export interface OpsProgressData {
  total: number
  done: number
  items: OpsProgressItem[]
}

/** 历史趋势点 */
export interface TrendPoint {
  time: string
  value: number
}

/** 主要设备监测：下拉清单与三相读数均由后端下发，前端不写死 */
export interface PrimaryMonitorDevice {
  deviceId: string
  name: string
}

export interface PrimaryDeviceMonitor {
  deviceId: string
  /** 设备离线/采集无效（CET 返回 ±2^31 哨兵值），读数不可信 */
  offline?: boolean
  phases: TransformerPhase[]
}
