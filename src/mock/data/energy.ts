/**
 * §2.4 按设备查询近 30 天每日能耗（假数据，docs/FY-Hospital-API.md）。
 * 固定近 30 个完整日（截至昨日）按日期升序；无读数日 energyKwh/carbonKg 为 null（折线断点）。
 * 确定性生成：同一天内同一 deviceId 生成相同序列，页面刷新不跳变；
 * deviceId % 5 === 0 视为无能耗设备（契约：此类设备全部日期为 null）。
 */

export interface MockEnergyDay {
  day: string
  energyKwh: number | null
  carbonKg: number | null
}

/** 本地时区 yyyy-MM-dd（逐字段拼接，避开 toISOString 的 UTC 偏移） */
function fmtDay(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/** 电网碳排放因子（kg/kWh，mock 取 0.635 附近的固定值） */
const CARBON_FACTOR = 0.635

export function getDeviceDailyStats(deviceId: number): MockEnergyDay[] {
  const out: MockEnergyDay[] = []
  const today = new Date()
  const base = 8 + (deviceId % 23)
  const silent = deviceId % 5 === 0
  // 个别设备缺 2 个固定日（演示 §2.4「无读数日 = 折线断点」口径）；
  // 普通设备 30 天连续——真实后端有零点基线回填，电表类设备读数基本不缺
  const sparse = deviceId % 7 === 1
  for (let i = 29; i >= 0; i--) {
    const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() - i)
    const k = i + deviceId
    const has = !silent && !(sparse && (i === 9 || i === 20))
    const energyKwh = has ? Math.round((base + (k % 5) * 1.7) * 100) / 100 : null
    out.push({
      day: fmtDay(d),
      energyKwh,
      carbonKg: energyKwh == null ? null : Math.round(energyKwh * CARBON_FACTOR * 100) / 100,
    })
  }
  return out
}
