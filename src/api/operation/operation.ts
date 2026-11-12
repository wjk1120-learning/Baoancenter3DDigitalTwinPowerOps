/**
 * 运维管理接口（§4.1/§4.2/§4.3/§4.5，契约唯一依据 = docs/FY-Hospital-API.md）。
 * 巡检/缺陷明细按需请求（设备详情页卡片、缺陷管理页「查看」弹窗）；
 * 缺陷管理页主列表 = §4.5 分页、统计卡 = §4.3（buildingId 参数为新约定，见类型注释）。
 */
import { bzGet, DATA_FETCH_TIMEOUT_MS } from '../../utils/http'
import type { RequestConfig } from '../../utils/http'
import type {
  CabinetDefectOverview,
  CabinetDefectQuery,
  CaoliaoRecord,
  DefectStats,
  InspectDeviceRecord,
} from './types'

function conf(): RequestConfig {
  return { timeout: DATA_FETCH_TIMEOUT_MS, silent: true }
}

/** §4.1 按箱柜编号查询巡检记录（服务端按记录时间倒序；无匹配返回空列表） */
export async function fetchInspectionRecordsByDeviceNumber(
  deviceNumber: string,
): Promise<InspectDeviceRecord[]> {
  const num = String(deviceNumber || '').trim()
  if (!num) return []
  const data = await bzGet<InspectDeviceRecord[] | null>(
    '/operation/inspection-records',
    { deviceNumber: num },
    conf(),
  )
  return Array.isArray(data) ? data.filter((r) => r && r.recordId) : []
}

/** §4.2 按箱柜编号查询缺陷记录（仅新表单记录；服务端按记录时间倒序；无匹配返回空列表） */
export async function fetchDefectRecordsByDeviceNumber(
  deviceNumber: string,
): Promise<CaoliaoRecord[]> {
  const num = String(deviceNumber || '').trim()
  if (!num) return []
  const data = await bzGet<CaoliaoRecord[] | null>(
    '/operation/defect-records',
    { deviceNumber: num },
    conf(),
  )
  return Array.isArray(data) ? data.filter((r) => r && r.recordId) : []
}

/** §4.3 缺陷处理状态统计（buildingId 不传 = 全量）。
 *  ⚠ 参数与契约 v5.2 原文不同：用户 2026-11-11 与后端约定由 deviceNumber 改 buildingId，契约待后端更新；
 *  切真前需后端先改，否则真后端会忽略该参数恒返全量。 */
export async function fetchDefectStats(buildingId?: number): Promise<DefectStats | null> {
  const data = await bzGet<DefectStats | null>(
    '/operation/defect-records/stats',
    buildingId != null ? { buildingId } : undefined,
    conf(),
  )
  return data && typeof data === 'object' ? data : null
}

/** §4.5 箱柜缺陷联合查询（分页单页；行序同 §1.4 有开关优先→ID 升序；
 *  传任一筛选（riskLevel/startDate/endDate）后仅返回存在匹配缺陷记录的箱柜） */
export async function fetchCabinetDefectPage(
  query: CabinetDefectQuery,
): Promise<{ total: number; rows: CabinetDefectOverview[] }> {
  const params: Record<string, string | number> = {
    page: query.page ?? 1,
    pageSize: query.pageSize ?? 12,
  }
  if (query.riskLevel) params.riskLevel = query.riskLevel
  if (query.startDate) params.startDate = query.startDate
  if (query.endDate) params.endDate = query.endDate
  if (query.buildingId != null) params.buildingId = query.buildingId
  const data = await bzGet<{ total: number; rows: CabinetDefectOverview[] } | null>(
    '/operation/cabinet-defects',
    params,
    conf(),
  )
  const rows = Array.isArray(data?.rows) ? data.rows : []
  // 无设备编号无法归属箱柜（契约必返字段，此处仅防御空行）
  return {
    total: typeof data?.total === 'number' ? data.total : rows.length,
    rows: rows.filter((r) => r && r.deviceNumber),
  }
}
