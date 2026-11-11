/**
 * 能耗接口（§2.4，契约唯一依据 = docs/FY-Hospital-API.md）。
 * 4.3 设备详情页「电能趋势」面板用：按设备查近 30 个完整日（截至昨日）逐日电量。
 */
import { bzGet, DATA_FETCH_TIMEOUT_MS } from '../../utils/http'
import type { RequestConfig } from '../../utils/http'
import type { DeviceDailyEnergy } from './types'

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
