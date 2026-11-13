/** §2.4 DeviceDailyEnergy（docs/FY-Hospital-API.md 能耗管理模块） */

/** 按设备查询近 30 天每日能耗行（固定 30 条按日升序；无读数日为 null） */
export interface DeviceDailyEnergy {
  /** 统计日期 yyyy-MM-dd */
  day: string
  /** 当日用电量（kWh）；null = 无读数（前端作趋势图断点） */
  energyKwh: number | null
  /** 当日碳排放（kg）；null = 无读数 */
  carbonKg: number | null
}

/** §2.9 Datalog（CET 定时记录行，字段名镜像 CET 原样 PascalCase） */
export interface Datalog {
  /** 定时记录时间（OffsetDateTime，如 2026-11-13T08:00:00+08:00） */
  LogTime: string
  /** 定时记录类型 */
  DataTypeID: number
  /** 参数类型 */
  ParaType: number
  /** 回路号 */
  LoopID: number
  /** 测点字典 DataID */
  DataID: number
  /** 设备 ID */
  DeviceID: number
  /** 值（无效值已由后端剔除） */
  Value: number
}

/** §2.9 设备电能参数曲线响应（结构镜像 CET ReadDatalog + 缓存元信息） */
export interface ParamCurve {
  success: boolean
  /** 错误码（0=成功） */
  statusCode: number
  errorMessage: string
  /** 结果集行数（剔除无效值后） */
  totalCounts: number
  resultList: Datalog[]
  /** 计算/缓存时刻（epoch 秒） */
  cacheTs: number
  error: string
}
