/**
 * 配置中心接口（契约唯一依据 = docs/FY-Hospital-API.md；字典/数据类型 CRUD 照搬
 * 福永配置中心参考包，适配点：fyGet/fyPost → bzGet/bzPost）。
 * 4.2④ 测点抽屉「电能参数趋势」用：§5.33 数据类型字典（typeCode ↔ DataID）。
 */
import { bzGet, bzPost, DATA_FETCH_TIMEOUT_MS } from '../../utils/http'
import type { RequestConfig } from '../../utils/http'
import type { CetDataType } from './types'
import { validateConfiguration } from './validation'

export interface DeviceTypeConfig {
  id: number
  name: string
  remark: string | null
}

export interface SwitchingConfig {
  id: number
  switchingName: string
}

export interface BuildingConfig {
  id: number
  buildingName: string
}

/** §5.33 CET 数据类型（类型编码 ↔ DataID 映射，供电能参数曲线 §2.9 校验合法性）；与 types.ts 的 CetDataType 同契约，别名复用 */
export type DataTypeConfig = CetDataType

/** §5.33 查询数据类型列表（全量，按 id 升序）——测点抽屉用的宽松版（坏行过滤不报错） */
export async function fetchCetDataTypes(): Promise<CetDataType[]> {
  const data = await bzGet<CetDataType[] | null>('/configuration/data-types', undefined, {
    timeout: DATA_FETCH_TIMEOUT_MS,
    silent: true,
  } satisfies RequestConfig)
  if (!Array.isArray(data)) return []
  return data.filter((r) => r != null && typeof r.typeCode === 'string')
}

const options = { silent: true }
const prefix = '/configuration'

export async function configGet<T>(path: string, params?: Record<string, unknown>): Promise<T> {
  const result = await bzGet<T>(prefix + path, params, options)
  validateConfiguration(path, result)
  return result
}

export async function configPost<T>(path: string, body?: unknown): Promise<T> {
  const result = await bzPost<T>(prefix + path, body, options)
  validateConfiguration(path, result, true)
  return result
}

export const getDeviceTypes = () => configGet<DeviceTypeConfig[]>('/device-types')
export const getSwitchings = () => configGet<SwitchingConfig[]>('/switchings')
export const getBuildings = () => configGet<BuildingConfig[]>('/buildings')
export const getDataTypes = () => configGet<DataTypeConfig[]>('/data-types')

/** §5.34 新增数据类型（编码/DataID 唯一；备注缺省/空串存 null） */
export function addDataType(body: {
  typeCode: string
  typeName: string
  dataId: number
  remark?: string
}): Promise<DataTypeConfig> {
  return configPost<DataTypeConfig>('/data-types', body)
}

/** §5.35 修改数据类型（字段可缺省保留原值；remark 空串=清除）；注意端点是 POST /data-types/{id}，非 /rename */
export function updateDataType(
  id: number,
  body: Partial<{ typeCode: string; typeName: string; dataId: number; remark: string }>,
): Promise<DataTypeConfig> {
  return configPost<DataTypeConfig>(`/data-types/${id}`, body)
}

/** §5.36 删除数据类型（无引用校验；删除后曲线查询该编码将提示未知数据类型） */
export function deleteDataType(id: number): Promise<void> {
  return deleteConfig(`/data-types/${id}/delete`)
}

/** 通用删除：building-stats 等接口契约要求 body 携带定位字段（如 buildingId），可选传入 */
export async function deleteConfig(path: string, body?: unknown) {
  // BUG-013：§5.36 数据类型删除成功实际返回 data:null（契约标 Boolean），记录确已删除；
  // 其余删除仍要求后端显式确认 true。
  const result = await configPost<boolean | null>(path, body)
  if (result !== true && !(path.startsWith('/data-types/') && result === null)) {
    throw new Error('后端未确认删除成功')
  }
}
