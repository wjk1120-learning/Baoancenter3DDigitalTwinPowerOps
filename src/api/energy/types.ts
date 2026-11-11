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
