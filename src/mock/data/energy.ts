/**
 * 能耗类假数据（docs/FY-Hospital-API.md）。
 * §2.4 按设备查询近 30 天每日能耗：固定近 30 个完整日（截至昨日）按日期升序；
 * 无读数日 energyKwh/carbonKg 为 null（折线断点）。确定性生成：同一天内同一
 * deviceId 生成相同序列，页面刷新不跳变；deviceId % 5 === 0 视为无能耗设备。
 * §2.9 设备电能参数曲线：镜像 CET ReadDatalog 结构，医院负荷形态 + 确定性噪声。
 */

import type { ParamCurve } from '../../api/energy/types'

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

/* ── §2.9 设备电能参数曲线 ── */

/** 各 DataID 曲线基线：base + amp × 医院负荷形态（PEsum 累计值单独算） */
const CURVE_SHAPE: Record<number, { base: number; amp: number; digits: number }> = {
  1000001: { base: 58, amp: 28, digits: 2 }, // Ia
  1000002: { base: 56, amp: 26, digits: 2 }, // Ib
  1000003: { base: 57, amp: 27, digits: 2 }, // Ic
  2000001: { base: 15, amp: 14, digits: 2 }, // Pa
  2000002: { base: 14, amp: 13, digits: 2 }, // Pb
  2000003: { base: 14, amp: 13, digits: 2 }, // Pc
  2000016: { base: 0.86, amp: 0.09, digits: 3 }, // Pfs
}

/** PEsum 起始读数与日增量（kWh，与 §1.11 mock 实时值同一量级），曲线恒单调升 */
const PESUM_BASE = 33_600
const PESUM_DAILY = 318

/** 医院负荷形态：夜间低谷 0.15、清晨爬坡、白天高位、晚间回落（h = 当日小时数） */
function loadShape(h: number): number {
  const s = Math.sin((Math.PI * (h - 5.5)) / 15)
  return Math.max(0.15, Math.min(1, s))
}

/** 本地时区 OffsetDateTime（契约示例为 +08:00；逐字段拼接避开 UTC 偏移） */
function fmtLogTime(d: Date): string {
  const p = (n: number, w = 2) => String(n).padStart(w, '0')
  return (
    `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}` +
    `T${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}+08:00`
  )
}

/**
 * §2.9 param-curve（确定性：同一时刻同一设备同一 DataID 值相同）。
 * 步长：today 15 分钟（契约定时记录粒度）；7d/30d 放宽到 1h/2h 控制返回体量。
 */
export function getParamCurve(deviceId: number, period: string, dataIDs?: string): ParamCurve {
  const wanted = (dataIDs ?? '')
    .split(',')
    .map((s) => Number(s.trim()))
    .filter((n) => Number.isFinite(n) && n > 0)
  const ids = (wanted.length ? wanted : [1000001, 1000002, 1000003, 2000001, 2000002, 2000003, 2000016, 4000016]).sort(
    (a, b) => a - b,
  )

  const now = new Date()
  const stepMs = period === 'today' ? 15 * 60_000 : period === '7d' ? 3_600_000 : 2 * 3_600_000
  const start =
    period === 'today'
      ? new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
      : now.getTime() - (period === '7d' ? 7 : 30) * 86_400_000

  const resultList: ParamCurve['resultList'] = []
  for (const id of ids) {
    for (let t = Math.ceil(start / stepMs) * stepMs; t <= now.getTime(); t += stepMs) {
      const d = new Date(t)
      const h = d.getHours() + d.getMinutes() / 60
      // 确定性噪声：±6% 缓慢摆动，随 DataID/设备错相位
      const wobble = Math.sin(t / 5_400_000 + id * 7 + deviceId) * 0.06
      let value: number
      if (id === 4000016) {
        const days = (t - start) / 86_400_000
        value = PESUM_BASE + days * PESUM_DAILY
      } else {
        const shape = CURVE_SHAPE[id] ?? CURVE_SHAPE[2000001]!
        value = (shape.base + shape.amp * loadShape(h)) * (1 + wobble)
      }
      const digits = id === 4000016 ? 1 : (CURVE_SHAPE[id] ?? CURVE_SHAPE[2000001]!).digits
      resultList.push({
        LogTime: fmtLogTime(d),
        DataTypeID: 1,
        ParaType: 1,
        LoopID: 1,
        DataID: id,
        DeviceID: deviceId,
        Value: Number(value.toFixed(digits)),
      })
    }
  }

  return {
    success: true,
    statusCode: 0,
    errorMessage: '',
    totalCounts: resultList.length,
    resultList,
    cacheTs: Math.floor(now.getTime() / 1000),
    error: '',
  }
}
