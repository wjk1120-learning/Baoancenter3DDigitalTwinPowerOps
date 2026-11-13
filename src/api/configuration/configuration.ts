/**
 * 配置中心接口（契约唯一依据 = docs/FY-Hospital-API.md）。
 * 4.2④ 测点抽屉「电能参数趋势」用：§5.33 数据类型字典（typeCode ↔ DataID）。
 */
import { bzGet, DATA_FETCH_TIMEOUT_MS } from '../../utils/http'
import type { RequestConfig } from '../../utils/http'
import type { CetDataType } from './types'

/** §5.33 查询数据类型列表（全量，按 id 升序） */
export async function fetchCetDataTypes(): Promise<CetDataType[]> {
  const data = await bzGet<CetDataType[] | null>('/configuration/data-types', undefined, {
    timeout: DATA_FETCH_TIMEOUT_MS,
    silent: true,
  } satisfies RequestConfig)
  if (!Array.isArray(data)) return []
  return data.filter((r) => r != null && typeof r.typeCode === 'string')
}
