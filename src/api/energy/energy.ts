/**
 * 能耗接口（§2.1/§2.2/§2.4/§2.9，契约唯一依据 = docs/FY-Hospital-API.md）。
 * 医院总览「能源运营总览」面板：§2.1 今日能耗 + §2.2 昨日能耗（10 分钟轮询，契约口径
 * "原 /ws/energy 推送已取消，前端定时轮询本接口"）；设备详情「电能趋势」= §2.4。
 */
import { bzGet, DATA_FETCH_TIMEOUT_MS } from '../../utils/http'
import type { RequestConfig } from '../../utils/http'
import type {
  DeviceDailyEnergy,
  EnergyDailyStats,
  EnergyTodayStats,
  ParamCurve,
} from './types'

function conf(): RequestConfig {
  return { timeout: DATA_FETCH_TIMEOUT_MS, silent: true } satisfies RequestConfig
}

/** §2.1 今日能耗（分楼栋；Redis 20 分钟刷新，前端定时轮询；含缓存元信息与完整度）。
 *  全院合计 = buildingStats 各楼栋求和（调用方计算）。 */
export async function fetchEnergyToday(): Promise<EnergyTodayStats | null> {
  const data = await bzGet<EnergyTodayStats | null>('/energy/today', undefined, conf())
  return data && typeof data.day === 'string' && data.buildingStats ? data : null
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
