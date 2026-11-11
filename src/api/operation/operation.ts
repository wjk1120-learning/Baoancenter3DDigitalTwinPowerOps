/**
 * 运维管理接口（§4.1/§4.2，契约唯一依据 = docs/FY-Hospital-API.md）。
 * 4.3 设备详情页「维护记录/缺陷记录」卡片按需请求；4.4 缺陷管理复用本模块。
 */
import { bzGet, DATA_FETCH_TIMEOUT_MS } from '../../utils/http'
import type { RequestConfig } from '../../utils/http'
import type { CaoliaoRecord, InspectDeviceRecord } from './types'

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
