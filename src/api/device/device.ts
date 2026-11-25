/**
 * 设备接口（§1 设备管理模块，契约唯一依据 = docs/FY-Hospital-API.md）。
 * 当前范围：§1.1 总设备数（医院总览页用）/ §1.2 楼栋列表（缺陷管理页用）/ §1.3 配电房列表 /
 * §1.4 箱柜分页 / §1.6 配电房下箱柜+单柜详情 / §1.7 设备明细分页 / §1.8 设备精简列表 /
 * §1.9 设备名搜索 / §1.10 柜名搜索 / §1.11 测点 / §1.12 健康度五档 /
 * §1.13 全院健康度平均值（医院总览页用）。
 * 不做（用户拍板）：§1.5 箱柜计数、§1.14-1.16、§1.17 导出。
 * 响应字段只认文档 camelCase，不做大小写/野字段兜底；目录数据页面初始化拉取，
 * 测点等明细由点击触发（按需请求规则）。
 */
import { bzGet, DATA_FETCH_TIMEOUT_MS } from '../../utils/http'
import type { RequestConfig } from '../../utils/http'
import type {
  BuildingInfo,
  DeviceBrief,
  DeviceDetail,
  DeviceHealthLevelStats,
  MeasInfo,
  SuperDeviceProfile,
  SuperDeviceRow,
  SwitchingInfo,
  SwitchingSuperBrief,
} from './types'

function conf(): RequestConfig {
  return { timeout: DATA_FETCH_TIMEOUT_MS, silent: true }
}

/** §1.1 查询总设备数（医院总览页能源面板 KPI） */
export async function fetchDeviceCount(): Promise<number | null> {
  const data = await bzGet<number | null>('/device/count', undefined, conf())
  return typeof data === 'number' && Number.isFinite(data) ? data : null
}

/** §1.2 楼栋列表（全量返回含 0 柜楼栋；缺陷管理页楼栋树/面包屑，进页一次） */
export async function fetchBuildingList(): Promise<BuildingInfo[]> {
  const data = await bzGet<BuildingInfo[] | null>('/device/buildings', undefined, conf())
  return Array.isArray(data)
    ? data.filter((b) => b && b.id && typeof b.buildingName === 'string')
    : []
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

/** §1.11 设备测点明细（点击「点位」时按需请求）。新鲜度由服务端 Redis 300s 缓存兜，
 *  前端不再叠加缓存（2026-11-25 用户拍板：后端已缓存，前端再缓存会让 Network 看不到
 *  请求、最坏新鲜度叠到 10 分钟，联调与排查都受干扰）。 */
export async function fetchMeasurements(deviceId: number): Promise<MeasInfo[]> {
  const data = await bzGet<MeasInfo[]>(`/device/${deviceId}/measurements`, undefined, conf())
  return Array.isArray(data) ? data : []
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

/** §1.13 全院箱柜健康度平均值（两位小数；基于存量 health 值，医院总览页用）。
 *  无有效值（异常/0）返回 null——调用方勿用 0 冒充健康度。 */
export async function fetchHealthAverage(): Promise<number | null> {
  const data = await bzGet<number | null>('/device/health/average', undefined, conf())
  return typeof data === 'number' && Number.isFinite(data) && data > 0 ? data : null
}

/**
 * §1.17 设备列表导出 xlsx：GET /device/export，无参数，全量含停用设备
 * （后端生成文件，楼栋→箱柜→设备排序）。2026-11-25 联调接入（照搬福永 exportDeviceExcel）。
 * 响应是二进制文件流、非 BaseResult 信封——拦截器对 Blob 原样透传；导出失败时后端返回
 * HTTP 200 + JSON BaseResult(code=0)，契约要求按 Content-Type（blob.type 含 json）区分
 * 成败并抛出后端 msg。JWT 拦截器只认 Authorization 头，必须 AJAX blob 下载
 * （window.open/<a> 直链会 401）。权限：仅 level 0/1，外部人员 403（按钮侧隐藏）。
 */
export async function exportDeviceExcel(): Promise<Blob> {
  const blob = await bzGet<Blob>('/device/export', undefined, { responseType: 'blob' })
  if (blob && typeof blob === 'object' && typeof blob.type === 'string' && blob.type.includes('json')) {
    const text = await blob.text()
    let msg = '导出失败'
    try {
      const parsed = JSON.parse(text) as { msg?: unknown }
      if (parsed && typeof parsed.msg === 'string' && parsed.msg.trim()) msg = parsed.msg.trim()
    } catch {
      // JSON 解析失败按兜底文案抛出
    }
    throw new Error(msg)
  }
  return blob
}
