/**
 * 能耗接口（§2.1/§2.2/§2.3/§2.4/§2.6-2.8/§2.9，契约唯一依据 = docs/FY-Hospital-API.md）。
 * 医院总览「能源运营总览」面板：§2.1 今日能耗 + §2.2 昨日能耗（10 分钟轮询，契约口径
 * "原 /ws/energy 推送已取消，前端定时轮询本接口"）；设备详情「电能趋势」= §2.4；
 * 3D 楼层下钻（二期）：楼层信息卡 = §2.7 今日/§2.6 昨日/§2.8 近 7 日。
 */
import { bzGet, DATA_FETCH_TIMEOUT_MS } from '../../utils/http'
import type { RequestConfig } from '../../utils/http'
import { MemoryCache } from '../../utils/cache'
import type {
  DeviceDailyEnergy,
  EnergyDailyStats,
  EnergyTodayStats,
  FloorDailyEnergy,
  FloorStats,
  ParamCurve,
} from './types'

function conf(): RequestConfig {
  return { timeout: DATA_FETCH_TIMEOUT_MS, silent: true } satisfies RequestConfig
}

/**
 * §2.1 今日能耗（分楼栋；Redis 20 分钟刷新，前端定时轮询；含缓存元信息与完整度）。
 * 全院合计 = buildingStats 各楼栋求和（调用方计算）。
 * 客户端 10 秒去重缓存（2026-11-25 联调优化，用户拍板）：医院总览开页有 3 个消费方
 * （页面 3D 楼名标签 / 能源面板 KPI / 楼栋信息卡）各自调本函数，10 秒窗口内合并为一次
 * 真实请求；两类轮询均为 10 分钟一轮，远超 TTL 不受影响。失败不缓存（loader 抛错，
 * MemoryCache 只存成功值），错误仍由调用方各自的 catch 兜成 null。
 */
const ENERGY_TODAY_TTL_MS = 10_000
const todayCache = new MemoryCache<EnergyTodayStats>(ENERGY_TODAY_TTL_MS)

export async function fetchEnergyToday(): Promise<EnergyTodayStats | null> {
  return todayCache.load(async () => {
    const data = await bzGet<EnergyTodayStats | null>('/energy/today', undefined, conf())
    if (!data || typeof data.day !== 'string' || !data.buildingStats) {
      throw new Error('今日能耗响应形状无效')
    }
    return data
  })
}

/** §2.2 昨日能耗（buildingId 不传默认 0 = 全院汇总行；昨日无数据返回空列表） */
export async function fetchEnergyYesterday(buildingId?: number): Promise<EnergyDailyStats[]> {
  const data = await bzGet<EnergyDailyStats[] | null>(
    '/energy/yesterday',
    buildingId != null ? { buildingId } : undefined,
    conf(),
  )
  return Array.isArray(data) ? data : []
}

/** §2.3 分楼栋历史能耗（近 7 个完整日，截至昨日；MySQL 持久化。buildingId 非法返回空）。
 *  医院总览 3D 楼栋信息卡「近 7 日能耗趋势」数据源。 */
export async function fetchBuildingEnergyHistory(buildingId: number): Promise<EnergyDailyStats[]> {
  if (!buildingId) return []
  const data = await bzGet<EnergyDailyStats[] | null>(
    '/energy/buildings/history',
    { buildingId },
    conf(),
  )
  return Array.isArray(data) ? data : []
}

/** §2.6 指定楼层设备能耗（昨日；楼层合计为带系数加权和，无设备/无记录合计为 0） */
export async function fetchFloorEnergyYesterday(
  buildingId: number,
  floor: string,
): Promise<FloorStats | null> {
  if (!buildingId || !floor) return null
  return bzGet<FloorStats | null>(
    `/energy/buildings/${buildingId}/floors/${encodeURIComponent(floor)}/device-stats`,
    undefined,
    conf(),
  )
}

/** §2.7 指定楼层设备能耗（今日；全部设备无读数时 energyKwh=null，区分「无设备=0」；
 *  服务端 20 分钟缓存） */
export async function fetchFloorEnergyToday(
  buildingId: number,
  floor: string,
): Promise<FloorStats | null> {
  if (!buildingId || !floor) return null
  return bzGet<FloorStats | null>(
    `/energy/buildings/${buildingId}/floors/${encodeURIComponent(floor)}/today-device-stats`,
    undefined,
    conf(),
  )
}

/** §2.8 指定楼层近 7 天能耗（截至昨日；仅返回有数据日期，不补 null） */
export async function fetchFloorEnergyHistory(
  buildingId: number,
  floor: string,
): Promise<FloorDailyEnergy[]> {
  if (!buildingId || !floor) return []
  const data = await bzGet<FloorDailyEnergy[] | null>(
    `/energy/buildings/${buildingId}/floors/${encodeURIComponent(floor)}/history`,
    undefined,
    conf(),
  )
  return Array.isArray(data) ? data : []
}

/** §2.4 按设备查询近 30 天每日能耗（无读数日 energyKwh/carbonKg 为 null） */
export async function fetchDeviceDailyEnergy(deviceId: number): Promise<DeviceDailyEnergy[]> {
  if (!deviceId) return []
  const data = await bzGet<DeviceDailyEnergy[] | null>(
    `/energy/devices/${deviceId}/daily-stats`,
    undefined,
    { timeout: DATA_FETCH_TIMEOUT_MS, silent: true } satisfies RequestConfig,
  )
  if (!Array.isArray(data)) return []
  return data
    .filter((r) => r != null && typeof r.day === 'string')
    .map((r) => ({
      day: r.day,
      energyKwh: r.energyKwh == null ? null : Number(r.energyKwh),
      carbonKg: r.carbonKg == null ? null : Number(r.carbonKg),
    }))
}

/** §2.9 筛选周期 */
export type ParamCurvePeriod = 'today' | '7d' | '30d'

/** §2.9 设备电能参数曲线（period=today/7d/30d；dataIDs=CET DataID 逗号串，缺省=字典全部） */
export async function fetchDeviceParamCurve(
  deviceId: number,
  period: ParamCurvePeriod,
  dataIDs?: string,
): Promise<ParamCurve | null> {
  if (!deviceId) return null
  const data = await bzGet<ParamCurve | null>(
    `/energy/devices/${deviceId}/param-curve`,
    { period, ...(dataIDs ? { dataIDs } : {}) },
    { timeout: DATA_FETCH_TIMEOUT_MS, silent: true } satisfies RequestConfig,
  )
  if (!data || !Array.isArray(data.resultList)) return null
  return data
}
