/**
 * §7.6 健康度评估模板配置（配置中心板块）/health/templates*。
 * 前缀是 /health 而非 /configuration，不走 configGet/configPost；
 * 写操作仅 level 0/1（后端 403 兜底），保存即生效（评估链路实时读库）。
 * 照搬福永配置中心参考包；适配点：fyGet/fyPost → bzGet/bzPost。
 */
import { bzGet, bzPost } from '../../utils/http'
import type {
  HealthTemplateDimension,
  HealthTemplateShellBody,
  HealthTemplateSummary,
  HealthTemplateTree,
} from './types'

const options = { silent: true }

function fail(path: string, field: string): never {
  throw new Error(`健康度模板接口响应无效：${path} / ${field}，请刷新核对`)
}
function objectOf(v: unknown, path: string, field: string): Record<string, unknown> {
  if (!v || typeof v !== 'object' || Array.isArray(v)) fail(path, field)
  return v as Record<string, unknown>
}
function num(r: Record<string, unknown>, key: string, path: string, min = 0): number {
  const v = r[key]
  if (typeof v !== 'number' || !Number.isFinite(v) || v < min) fail(path, key)
  return v
}
function str(r: Record<string, unknown>, key: string, path: string): string {
  if (typeof r[key] !== 'string') fail(path, key)
  return r[key] as string
}

/** 7.6.1 列表行；空壳模板 dimensionCount=0 / weightSum=0 合法 */
function normSummary(value: unknown, path: string): HealthTemplateSummary {
  const r = objectOf(value, path, '记录')
  const createdAt = r.createdAt == null ? null : str(r, 'createdAt', path)
  return {
    id: num(r, 'id', path, 1),
    code: str(r, 'code', path),
    typeName: str(r, 'typeName', path),
    designLifeYears: num(r, 'designLifeYears', path, 1),
    createdAt,
    dimensionCount: num(r, 'dimensionCount', path),
    itemCount: num(r, 'itemCount', path),
    weightSum: num(r, 'weightSum', path),
  }
}

function normItems(raw: unknown, path: string): HealthTemplateDimension['items'] {
  if (!Array.isArray(raw)) fail(path, 'items')
  return raw.map((row) => {
    const r = objectOf(row, path, '评分项')
    const id = r.id == null ? undefined : num(r, 'id', path, 1)
    return {
      ...(id != null ? { id } : {}),
      code: str(r, 'code', path),
      name: str(r, 'name', path),
      subWeight: num(r, 'subWeight', path),
      normal: str(r, 'normal', path),
      attention: str(r, 'attention', path),
      abnormal: str(r, 'abnormal', path),
      severe: str(r, 'severe', path),
      autoCalculated: r.autoCalculated === true,
    }
  })
}

/** 7.6.2/7.6.3/7.6.4/7.6.5 响应整树。
 *  ⚠️ 2026-11-16 实测：7.6.2/7.6.3 整树响应**不含** dimensionCount/itemCount/weightSum
 *  （只有 7.6.1 列表含）。三者纯属对 dimensions 的汇总，缺失时按维度推导，不视为坏形状。 */
function normTree(value: unknown, path: string): HealthTemplateTree {
  const r = objectOf(value, path, '整树')
  const createdAt = r.createdAt == null ? null : str(r, 'createdAt', path)
  if (!Array.isArray(r.dimensions)) fail(path, 'dimensions')
  const dimensions = (r.dimensions as unknown[]).map((row) => {
    const d = objectOf(row, path, '维度')
    const id = d.id == null ? undefined : num(d, 'id', path, 1)
    return {
      ...(id != null ? { id } : {}),
      no: num(d, 'no', path, 1),
      name: str(d, 'name', path),
      weightPercent: num(d, 'weightPercent', path),
      items: normItems(d.items, path),
    }
  })
  const has = (key: string) => typeof r[key] === 'number' && Number.isFinite(r[key])
  return {
    id: num(r, 'id', path, 1),
    code: str(r, 'code', path),
    typeName: str(r, 'typeName', path),
    designLifeYears: num(r, 'designLifeYears', path, 1),
    createdAt,
    dimensionCount: has('dimensionCount') ? (r.dimensionCount as number) : dimensions.length,
    itemCount: has('itemCount')
      ? (r.itemCount as number)
      : dimensions.reduce((sum, d) => sum + d.items.length, 0),
    weightSum: has('weightSum')
      ? (r.weightSum as number)
      : Number(dimensions.reduce((sum, d) => sum + d.weightPercent, 0).toFixed(2)),
    dimensions,
  }
}

/** 7.6.1 模板列表 */
export async function getHealthTemplates(): Promise<HealthTemplateSummary[]> {
  const data = await bzGet<unknown>('/health/templates', undefined, options)
  if (!Array.isArray(data)) fail('/templates', '列表')
  return (data as unknown[]).map((row) => normSummary(row, '/templates'))
}

/** 7.6.2 模板整树详情 */
export function getHealthTemplateTree(id: number): Promise<HealthTemplateTree> {
  return bzGet<unknown>(`/health/templates/${id}`, undefined, options).then((t) => normTree(t, `/templates/${id}`))
}

/** 7.6.3 新增模板基本信息（仅壳；维度结构经 7.6.5 整树保存维护） */
export function addHealthTemplate(body: HealthTemplateShellBody): Promise<HealthTemplateTree> {
  return bzPost<unknown>('/health/templates', body, options).then((t) => normTree(t, '/templates'))
}

/** 7.6.4 修改模板基本信息（唯一性校验排除自身），返回整树 */
export function updateHealthTemplate(id: number, body: HealthTemplateShellBody): Promise<HealthTemplateTree> {
  return bzPost<unknown>(`/health/templates/${id}/update`, body, options).then((t) => {
    const tree = normTree(t, `/templates/${id}/update`)
    if (tree.id !== id) fail(`/templates/${id}/update`, '返回 ID 与请求不一致')
    return tree
  })
}

/** 7.6.5 整树保存（全量替换维度与评分项，任一校验不满足后端整体拒收），返回保存后整树 */
export function saveHealthTemplateTree(
  id: number,
  dimensions: HealthTemplateDimension[],
): Promise<HealthTemplateTree> {
  return bzPost<unknown>(`/health/templates/${id}/tree/save`, { dimensions }, options).then((t) => {
    const tree = normTree(t, `/templates/${id}/tree/save`)
    if (tree.id !== id) fail(`/templates/${id}/tree/save`, '返回 ID 与请求不一致')
    return tree
  })
}

/** 7.6.6 删除模板（级联删除维度与评分项；评估历史靠明细快照自包含不受影响） */
export async function deleteHealthTemplate(id: number): Promise<void> {
  const result = await bzPost<boolean>(`/health/templates/${id}/delete`, undefined, options)
  if (result !== true) throw new Error('后端未确认删除成功')
}
