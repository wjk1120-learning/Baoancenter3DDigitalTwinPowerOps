/** docs/FY-Hospital-API.md 能耗管理模块（§2.1/§2.2/§2.4/§2.9） */

/** §2.1 BuildingStat（分楼栋统计值） */
export interface EnergyBuildingStat {
  /** 该楼栋用电量（kWh） */
  energyKwh: number
  /** 该楼栋碳排放（kg） */
  carbonKg: number
  /** 该楼栋有效测点数 */
  deviceCount: number
}

/** §2.1 EnergyTodayStats（今日能耗：分楼栋 + 缓存元信息与数据完整度） */
export interface EnergyTodayStats {
  /** 统计日期 yyyy-MM-dd */
  day: string
  /** 分楼栋统计：楼栋名 → 统计 */
  buildingStats: Record<string, EnergyBuildingStat>
  /** 缓存写入时间（epoch 秒） */
  cacheTs: number
  /** 最近一次刷新失败信息（空串表示正常） */
  error: string
  /** 参与统计的设备总数 */
  deviceTotal: number
  /** 拉取+兜底后读数可用的设备数 */
  deviceSuccess: number
  /** 数据完整度 = deviceSuccess / deviceTotal（0.0~1.0） */
  completeness: number
}

/** §2.2 EnergyDailyStats（逐日能耗统计行；buildingId 0 = 全院汇总行） */
export interface EnergyDailyStats {
  /** 统计日期 yyyy-MM-dd */
  day: string
  /** 楼栋 ID（0=全院汇总，其余见配置中心楼栋维度表） */
  buildingId: number
  /** 当日用电量（kWh） */
  energyKwh: number
  /** 当日碳排放（kg） */
  carbonKg: number
  /** 有效测点数 */
  deviceCount: number
  /** 更新时间 */
  updatedAt: string
}

/** §2.4 DeviceDailyEnergy（按设备查询近 30 天每日能耗行） */

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
