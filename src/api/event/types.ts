/** CET 事件接口类型（/FY/event/*，见 docs/newapi/FY-Hospital-API(3).md） */

/**
 * 告警位置（doc v3.57 起，由告警事件定位表 fy_hospital_alert_event_location 提供）。
 * 一个设备可关联多条位置编号，全量返回；无可解析条目时整个 locations 为 null（不是空数组）。
 */
export interface AlertLocation {
  /** 楼栋编号（1.2 楼栋 ID：1=1号楼 2=2号楼 3=3号楼 4=家属楼 5=5号楼） */
  building: number
  /** 楼层，取值如 "G" / "2" / "3A" */
  floor: string
}

/** REST 告警查询返回的精简事件结构（3.1 today / 3.2 grouped 组内 / 3.3 按设备 通用） */
export interface EventBrief {
  eventId: string
  /** 事件发生时间 yyyy-MM-dd HH:mm:ss */
  timeStr: string
  /** 事件等级：1=紧急 2=严重 3=一般 4=提示 */
  eventLevel: number
  deviceName: string
  description: string
  /** 处理状态：0=未处理 1=已处理 */
  handleStatus: number
  /** 告警位置列表（v3.57 起替代 superDeviceName/building/floor；无可解析条目为 null） */
  locations?: AlertLocation[] | null
}

export interface EventInfo {
  eventId: string
  tsMs: number
  timeStr: string
  eventLevel: number
  eventType: string
  alarmKind: string
  deviceId: string
  deviceName: string
  stationId: string
  description: string
  handleStatus: number
  /** 告警位置列表（v3.57 起替代 superDeviceName/building/floor；无可解析条目为 null） */
  locations?: AlertLocation[] | null
  updatedAt?: string
  cacheTs?: number
  error?: string
}

export interface EventStatsVo {
  totalAlarmCount: number
  todayAlarmCount: number
  unhandledAlarmCount: number
  /** 处理率（已处理/总数，百分比保留两位小数，如 2.54 表示 2.54%）；v3.15 新增 */
  handleRate?: number
  urgentCount: number
  criticalCount: number
  normalCount: number
  infoCount: number
  /** 缓存写入时间（epoch 秒）；v3.x 缓存元信息 */
  cacheTs?: number
  /** 最近一次刷新失败信息（空串表示正常） */
  error?: string
}

export interface EventStatsResult {
  day: string
  totalEvents: number
  unhandledEvents: number
  todayAlarmCount: number
  /** 处理率（百分比，0~100）；后端 v3.15+ 直接返回，无值时由前端估算回填 */
  handleRate?: number
  urgentCount: number
  criticalCount: number
  levelDistribution: Record<string, number>
  typeDistribution: Record<string, number>
  cacheTs?: number
  error?: string
}

export interface PageResult<T> {
  total: number
  rows: T[]
}

export interface DeviceEventGroup {
  deviceName: string
  deviceId: string
  count: number
  latestTsMs: number
  /** v3.15+ 分组响应已移除，前端用组内事件 timeStr 回填 */
  latestTimeStr?: string
  highestLevel: number
  events: EventInfo[]
}

/** 分等级告警统计（测点弹窗头展示用，由 v3.65 §3.5 箱柜分等级统计归一而来） */
export interface EventLevelStats {
  eventLevel: number
  count: number
}

/** v3.65 §3.5 箱柜分等级历史告警统计 GET /FY/event/super-devices/{superId}/level-counts */
export interface SuperDeviceAlarmStats {
  /** 历史告警总数（全部事件口径，不区分处理状态） */
  totalAlarmCount: number
  /** 紧急（level=1） */
  urgentCount: number
  /** 严重（level=2） */
  criticalCount: number
  /** 一般（level=3） */
  normalCount: number
  /** 提示（level=4） */
  infoCount: number
}

/** v3.65 §3.8 楼栋近 7 日每日告警数 GET /FY/event/buildings/{buildingId}/daily-counts */
export interface BuildingDailyAlarm {
  date: string
  alarmCount: number
}
