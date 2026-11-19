/**
 * 能耗类假数据（docs/FY-Hospital-API.md）。
 * §2.4 按设备查询近 30 天每日能耗：固定近 30 个完整日（截至昨日）按日期升序；
 * 无读数日 energyKwh/carbonKg 为 null（折线断点）。确定性生成：同一天内同一
 * deviceId 生成相同序列，页面刷新不跳变；deviceId % 5 === 0 视为无能耗设备。
 * §2.9 设备电能参数曲线：镜像 CET ReadDatalog 结构，医院负荷形态 + 确定性噪声。
 */

import type {
  EnergyBuildingStat,
  EnergyDailyStats,
  EnergyTodayStats,
  FloorDailyEnergy,
  FloorStats,
  ParamCurve,
} from '../../api/energy/types'
import { buildings } from './device'

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

/** 电网碳排放因子（kg/kWh，契约口径 = 用电量 × 0.635） */
const CARBON_FACTOR = 0.635

// ---- §2.1/§2.2 今日/昨日能耗（医院总览能源面板；数值确定性固定，便于断言与展示稳定） ----

/** 各楼栋今日用电（kWh，固定值）；合计 3045.0（宿舍楼 2026-11-17 随 3D 园区补入） */
const TODAY_BY_BUILDING: Record<string, number> = {
  门诊1号楼: 860.0,
  门诊2号楼: 645.5,
  综合楼: 512.25,
  住院楼: 730.75,
  行政楼: 210.5,
  宿舍楼: 86.0,
}
/** 各楼栋有效测点数（合计 48） */
const DEVICES_BY_BUILDING: Record<string, number> = {
  门诊1号楼: 12,
  门诊2号楼: 9,
  综合楼: 8,
  住院楼: 10,
  行政楼: 5,
  宿舍楼: 4,
}
/** 昨日全院用电（kWh）＝今日合计 × 0.9（环比 ↑11.1%） */
const YESTERDAY_TOTAL_KWH = 2740.5

function round2(v: number): number {
  return Math.round(v * 100) / 100
}

/** §2.1 今日能耗（buildingStats 首键 = 「全院」合计，后接各楼栋——真实返回样例口径；
 *  completeness=1 完整；数值确定性固定） */
export function getEnergyToday(): EnergyTodayStats {
  const buildingStats: Record<string, EnergyBuildingStat> = {}
  let totalKwh = 0
  let totalDevices = 0
  for (const b of buildings) {
    const kwh = TODAY_BY_BUILDING[b.buildingName] ?? 0
    const devices = DEVICES_BY_BUILDING[b.buildingName] ?? 0
    buildingStats[b.buildingName] = {
      energyKwh: kwh,
      carbonKg: round2(kwh * CARBON_FACTOR),
      deviceCount: devices,
    }
    totalKwh += kwh
    totalDevices += devices
  }
  // 「全院」键排首（后端真实返回口径）；碳 = 全院用电 × 0.635 后取整
  const campus: EnergyBuildingStat = {
    energyKwh: round2(totalKwh),
    carbonKg: round2(totalKwh * CARBON_FACTOR),
    deviceCount: totalDevices,
  }
  return {
    day: fmtDay(new Date()),
    buildingStats: { 全院: campus, ...buildingStats },
    cacheTs: Math.floor(Date.now() / 1000),
    error: '',
    deviceTotal: totalDevices,
    deviceSuccess: totalDevices,
    completeness: 1,
  }
}

/** §2.2 昨日能耗（buildingId 不传/0 = 全院汇总行；传楼栋 ID 返回该楼栋行；数值确定性固定） */
export function getEnergyYesterday(query: { buildingId?: string }): EnergyDailyStats[] {
  const bid = query.buildingId != null && query.buildingId !== '' ? Number(query.buildingId) : 0
  const day = fmtDay(new Date(Date.now() - 24 * 3600 * 1000))
  const updatedAt = `${day}T00:30:00`

  if (bid === 0) {
    return [
      {
        day,
        buildingId: 0,
        energyKwh: YESTERDAY_TOTAL_KWH,
        carbonKg: round2(YESTERDAY_TOTAL_KWH * CARBON_FACTOR),
        deviceCount: 44,
        updatedAt,
      },
    ]
  }
  const b = buildings.find((x) => x.id === bid)
  if (!b) return []
  const kwh = round2((TODAY_BY_BUILDING[b.buildingName] ?? 0) * 0.9)
  return [
    {
      day,
      buildingId: bid,
      energyKwh: kwh,
      carbonKg: round2(kwh * CARBON_FACTOR),
      deviceCount: DEVICES_BY_BUILDING[b.buildingName] ?? 0,
      updatedAt,
    },
  ]
}

/** §2.3 分楼栋近 7 日历史能耗（截至昨日 7 个完整日，升序；楼栋不存在返回空数组）。
 *  数值确定性：今日值 × 伪随机日系数（种子=楼栋 id×10+日序），波动 ±35% 有涨跌观感。 */
export function getBuildingEnergyHistory(query: { buildingId?: string }): EnergyDailyStats[] {
  const bid = query.buildingId != null && query.buildingId !== '' ? Number(query.buildingId) : 0
  const b = buildings.find((x) => x.id === bid)
  if (!b) return []
  const base = TODAY_BY_BUILDING[b.buildingName] ?? 0
  if (!base) return []
  const out: EnergyDailyStats[] = []
  const today = new Date()
  for (let i = 7; i >= 1; i--) {
    const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() - i)
    // 确定性伪随机：楼栋 id 与日序共同决定波动系数（0.65~1.35），同一天刷新不变
    const wobble = 0.65 + (((bid * 10 + i) * 9301 + 49297) % 233) / 233 / 1.8
    const kwh = round2(base * wobble)
    out.push({
      day: fmtDay(d),
      buildingId: bid,
      energyKwh: kwh,
      carbonKg: round2(kwh * CARBON_FACTOR),
      deviceCount: DEVICES_BY_BUILDING[b.buildingName] ?? 0,
      updatedAt: `${fmtDay(d)}T00:30:00`,
    } as EnergyDailyStats)
  }
  return out
}

/** 楼层确定性伪随机（同楼同层同盐刷新不变，0~232） */
function floorSeed(bid: number, floorNum: number, salt: number): number {
  return ((bid * 131 + floorNum * 17 + salt * 7) * 9301 + 49297) % 233
}

/**
 * §2.6/§2.7 楼层能耗合计（3D 楼层信息卡；today=false 昨日 / true 今日）。
 * 样本设计（mock 口径演示契约特殊值）：
 *  - 行政楼 4 层（5/4）：无设备 → 合计 0、deviceTotal=0（「无设备=0」）
 *  - 宿舍楼 5 层（6/5）仅今日：全部设备无读数 → energyKwh=null（§2.7 区分「无设备=0」）
 *  - 其余楼层：楼栋值 × 楼层权重（低层高、高层低）× 确定性波动；部分层 deviceValid<deviceTotal
 */
export function getFloorStats(buildingId: number, floor: string, today: boolean): FloorStats {
  const b = buildings.find((x) => x.id === buildingId)
  const floorNum = floor === 'G' ? 0 : Number(floor) || 0
  const noDevice = buildingId === 5 && floor === '4'
  const allInvalid = today && buildingId === 6 && floor === '5'
  const deviceTotal = noDevice ? 0 : 1 + (floorSeed(buildingId, floorNum, 1) % 4)
  const base = (b ? TODAY_BY_BUILDING[b.buildingName] ?? 0 : 0) * (today ? 1 : 0.9)
  const wobble = 0.06 + floorSeed(buildingId, floorNum, today ? 2 : 3) / 233 / 2
  const kwh: number | null = noDevice ? 0 : allInvalid ? null : round2(base * wobble)
  const deviceValid = noDevice
    ? 0
    : allInvalid
      ? 0
      : Math.max(0, deviceTotal - (floorSeed(buildingId, floorNum, 4) % 2))
  return {
    buildingId,
    floor,
    energyKwh: kwh,
    carbonKg: kwh == null ? null : round2(kwh * CARBON_FACTOR),
    deviceTotal,
    deviceValid,
  }
}

/** §2.8 楼层近 7 日能耗（截至昨日 7 个完整日升序；仅返回有数据日期——无设备层返回空数组） */
export function getFloorEnergyHistory(buildingId: number, floor: string): FloorDailyEnergy[] {
  const b = buildings.find((x) => x.id === buildingId)
  const floorNum = floor === 'G' ? 0 : Number(floor) || 0
  if (!b || (buildingId === 5 && floor === '4')) return []
  const base = (TODAY_BY_BUILDING[b.buildingName] ?? 0) * 0.9
  const deviceTotal = 1 + (floorSeed(buildingId, floorNum, 1) % 4)
  const out: FloorDailyEnergy[] = []
  const today = new Date()
  for (let i = 7; i >= 1; i--) {
    const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() - i)
    const wobble = 0.06 + floorSeed(buildingId, floorNum, i) / 233 / 2
    const kwh = round2(base * wobble)
    out.push({
      day: fmtDay(d),
      buildingId,
      floor,
      energyKwh: kwh,
      carbonKg: round2(kwh * CARBON_FACTOR),
      deviceCount: deviceTotal,
      deviceTotal,
    })
  }
  return out
}

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
