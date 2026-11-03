/**
 * 设备接口（§1 设备管理模块，契约唯一依据 = docs/FY-Hospital-API-v3.90.md）。
 * 当前范围：§1.2 楼栋 / §1.4 箱柜分页 / §1.5 箱柜计数 / §1.7 设备明细分页 /
 * §1.9 设备名搜索 / §1.10 柜名搜索 / §1.11 测点 / §1.12 健康度五档。
 * 不做（用户拍板）：§1.3/1.6/1.8 配电房级联、§1.13 平均值（4.5）、§1.14-1.16、§1.17 导出。
 * 响应字段只认文档 camelCase，不做大小写/野字段兜底；目录数据页面初始化拉取，
 * 测点等明细由点击触发（按需请求规则）。
 */
import { bzGet, DATA_FETCH_TIMEOUT_MS } from '../../utils/http'
import { KeyedMemoryCache } from '../../utils/cache'
import type { RequestConfig } from '../../utils/http'
import type { BuildingInfo, DeviceDetail, DeviceHealthLevelStats, MeasInfo, SuperDevice } from './types'

/** 测点走 Redis 300 秒缓存（§1.11），客户端同周期缓存一次 */
const MEAS_CLIENT_TTL_MS = 300_000
const measCache = new KeyedMemoryCache<MeasInfo[]>(MEAS_CLIENT_TTL_MS)

function conf(): RequestConfig {
  return { timeout: DATA_FETCH_TIMEOUT_MS, silent: true }
}

/** §1.2 楼栋列表 GET /device/buildings */
export async function fetchBuildingList(): Promise<BuildingInfo[]> {
  const data = await bzGet<BuildingInfo[]>('/device/buildings', undefined, conf())
  return Array.isArray(data) ? data : []
}

/** §1.4 箱柜列表（分页；buildingId 不传 = 全量；服务端排序：有开关优先→ID 升序） */
export async function fetchSuperPage(
  buildingId: number | null,
  page = 1,
  pageSize = 12,
): Promise<{ total: number; rows: SuperDevice[] }> {
  const data = await bzGet<{ total: number; rows: SuperDevice[] }>(
    '/device/super-devices',
    { ...(buildingId != null ? { buildingId } : {}), page, pageSize },
    conf(),
  )
  return { total: Number(data?.total) || 0, rows: Array.isArray(data?.rows) ? data.rows : [] }
}

/** §1.5 箱柜计数（buildingId 不传 = 全量） */
export async function fetchSuperDeviceCount(buildingId?: number): Promise<number> {
  const data = await bzGet<number>(
    '/device/super-devices/count',
    buildingId != null ? { buildingId } : undefined,
    conf(),
  )
  return Number(data) || 0
}

/** §1.7 箱柜下设备明细（分页） */
export async function fetchDevicesBySuper(
  superId: number,
  page = 1,
  pageSize = 50,
): Promise<{ total: number; rows: DeviceDetail[] }> {
  const data = await bzGet<{ total: number; rows: DeviceDetail[] }>(
    `/device/super-devices/${superId}/devices`,
    { page, pageSize },
    conf(),
  )
  return { total: Number(data?.total) || 0, rows: Array.isArray(data?.rows) ? data.rows : [] }
}

/** §1.9 按设备名称模糊检索（分页） */
export async function fetchDeviceSearch(
  deviceName: string,
  page = 1,
  pageSize = 12,
): Promise<{ total: number; rows: DeviceDetail[] }> {
  const q = String(deviceName || '').trim()
  if (!q) return { total: 0, rows: [] }
  const data = await bzGet<{ total: number; rows: DeviceDetail[] }>(
    '/device/search',
    { deviceName: q, page, pageSize },
    conf(),
  )
  return { total: Number(data?.total) || 0, rows: Array.isArray(data?.rows) ? data.rows : [] }
}

/** §1.10 按柜体名称模糊检索（分页，结构同 §1.4） */
export async function fetchSuperSearch(
  superName: string,
  page = 1,
  pageSize = 12,
): Promise<{ total: number; rows: SuperDevice[] }> {
  const q = String(superName || '').trim()
  if (!q) return { total: 0, rows: [] }
  const data = await bzGet<{ total: number; rows: SuperDevice[] }>(
    '/device/super-devices/search',
    { superName: q, page, pageSize },
    conf(),
  )
  return { total: Number(data?.total) || 0, rows: Array.isArray(data?.rows) ? data.rows : [] }
}

/** §1.11 设备测点明细（点击「点位」时按需请求；服务端 Redis 300s + 客户端同周期缓存） */
export async function fetchMeasurements(deviceId: number): Promise<MeasInfo[]> {
  return measCache.load(String(deviceId), async () => {
    const data = await bzGet<MeasInfo[]>(`/device/${deviceId}/measurements`, undefined, conf())
    return Array.isArray(data) ? data : []
  })
}

/** §1.12 健康度五档统计（buildingId 不传 = 全量） */
export async function fetchHealthLevelStats(
  buildingId?: number,
): Promise<DeviceHealthLevelStats> {
  const data = await bzGet<DeviceHealthLevelStats>(
    '/device/health/level-stats',
    buildingId != null ? { buildingId } : undefined,
    conf(),
  )
  const o = (data ?? {}) as Partial<DeviceHealthLevelStats>
  const num = (v: unknown): number => (Number.isFinite(Number(v)) ? Number(v) : 0)
  return {
    excellentCount: num(o.excellentCount),
    goodCount: num(o.goodCount),
    fairCount: num(o.fairCount),
    poorCount: num(o.poorCount),
    terribleCount: num(o.terribleCount),
    totalCount: num(o.totalCount),
  }
}
