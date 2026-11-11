/**
 * 设备接口（§1 设备管理模块，契约唯一依据 = docs/FY-Hospital-API.md）。
 * 当前范围：§1.3 配电房列表 / §1.4 箱柜分页 / §1.6 配电房下箱柜+单柜详情 /
 * §1.7 设备明细分页 / §1.8 设备精简列表 / §1.9 设备名搜索 / §1.10 柜名搜索 /
 * §1.11 测点 / §1.12 健康度五档。
 * 不做（用户拍板）：§1.2 楼栋、§1.5 箱柜计数、§1.13 平均值（4.5）、§1.14-1.16、§1.17 导出。
 * 响应字段只认文档 camelCase，不做大小写/野字段兜底；目录数据页面初始化拉取，
 * 测点等明细由点击触发（按需请求规则）。
 */
import { bzGet, DATA_FETCH_TIMEOUT_MS } from '../../utils/http'
import { KeyedMemoryCache } from '../../utils/cache'
import type { RequestConfig } from '../../utils/http'
import type {
  DeviceBrief,
  DeviceDetail,
  DeviceHealthLevelStats,
  MeasInfo,
  SuperDeviceProfile,
  SuperDeviceRow,
  SwitchingInfo,
  SwitchingSuperBrief,
} from './types'

/** 测点走 Redis 300 秒缓存（§1.11），客户端同周期缓存一次 */
const MEAS_CLIENT_TTL_MS = 300_000
const measCache = new KeyedMemoryCache<MeasInfo[]>(MEAS_CLIENT_TTL_MS)

function conf(): RequestConfig {
  return { timeout: DATA_FETCH_TIMEOUT_MS, silent: true }
}

/** §1.4 箱柜列表（分页；buildingId 不传 = 全量；服务端排序：有开关优先→ID 升序） */
export async function fetchSuperPage(
  buildingId: number | null,
  page = 1,
  pageSize = 12,
): Promise<{ total: number; rows: SuperDeviceRow[] }> {
  const data = await bzGet<{ total: number; rows: SuperDeviceRow[] }>(
    '/device/super-devices',
    { ...(buildingId != null ? { buildingId } : {}), page, pageSize },
    conf(),
  )
  return { total: Number(data?.total) || 0, rows: Array.isArray(data?.rows) ? data.rows : [] }
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

/** §1.8 箱柜下设备列表（精简：仅 deviceId/deviceName，按 id 升序，无分页；下拉/选择器场景） */
export async function fetchDeviceBriefsBySuper(superId: number): Promise<DeviceBrief[]> {
  const data = await bzGet<DeviceBrief[] | null>(
    `/device/super-devices/${superId}/devices/brief`,
    undefined,
    conf(),
  )
  return Array.isArray(data) ? data.filter((d) => d && d.deviceId) : []
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

/** §1.10 按柜体名称模糊检索（分页，结构同 §1.4；buildingId 可选——后端按楼栋过滤，
 *  侧栏选中楼栋时携带，医院级不传。后端需求：用户已与后端确认新增该可选参数） */
export async function fetchSuperSearch(
  superName: string,
  buildingId: number | null = null,
  page = 1,
  pageSize = 12,
): Promise<{ total: number; rows: SuperDeviceRow[] }> {
  const q = String(superName || '').trim()
  if (!q) return { total: 0, rows: [] }
  const data = await bzGet<{ total: number; rows: SuperDeviceRow[] }>(
    '/device/super-devices/search',
    { superName: q, ...(buildingId != null ? { buildingId } : {}), page, pageSize },
    conf(),
  )
  return { total: Number(data?.total) || 0, rows: Array.isArray(data?.rows) ? data.rows : [] }
}

/** §1.3 配电房列表 GET /device/switchings（配电房页房列表 + switchingId 来源） */
export async function fetchSwitchingList(): Promise<SwitchingInfo[]> {
  const data = await bzGet<SwitchingInfo[] | null>('/device/switchings', undefined, conf())
  return Array.isArray(data)
    ? data.filter((s) => s && s.id && typeof s.switchingName === 'string')
    : []
}

/** §1.6 配电房下箱柜（精简；deviceNumber 为摆场绑定键，后端待补下发） */
export async function fetchSwitchingSupers(switchingId: number): Promise<SwitchingSuperBrief[]> {
  if (!switchingId) return []
  const data = await bzGet<SwitchingSuperBrief[] | null>(
    `/device/switchings/${switchingId}/super-devices`,
    undefined,
    conf(),
  )
  return Array.isArray(data) ? data.filter((s) => s && s.id) : []
}

/** 单柜详情（新增接口 GET /device/super-devices/{superId}，字段见 SuperDeviceProfile）；
 *  不存在返回 null。设备详情页基本信息/健康度/楼栋的唯一来源。 */
export async function fetchSuperById(superId: number): Promise<SuperDeviceProfile | null> {
  if (!superId) return null
  const data = await bzGet<SuperDeviceProfile | null>(
    `/device/super-devices/${superId}`,
    undefined,
    conf(),
  )
  return data && data.id ? data : null
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
