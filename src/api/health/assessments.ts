/**
 * §7.1-7.4 健康度评估链路 /health/assessments*。
 * 提交仅 level 0/1（外部人员 403，后端兜底）；提交即生效（事务内落库+回写箱柜 health）。
 * 照搬福永配置中心参考包；适配点：fyGet/fyPost → bzGet/bzPost。
 */
import { bzGet, bzPost } from '../../utils/http'
import type {
  HealthAssessmentDetail,
  HealthAssessmentRecord,
  HealthAssessmentResult,
  HealthAssessmentSubmitBody,
  HealthAssessTemplate,
  HealthGrade,
} from './types'

const options = { silent: true }

function fail(path: string, field: string): never {
  throw new Error(`健康度评估接口响应无效：${path} / ${field}，请刷新核对`)
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
function numOrNull(r: Record<string, unknown>, key: string, path: string): number | null {
  const v = r[key]
  if (v == null) return null
  if (typeof v !== 'number' || !Number.isFinite(v)) fail(path, key)
  return v
}
function str(r: Record<string, unknown>, key: string, path: string): string {
  if (typeof r[key] !== 'string') fail(path, key)
  return r[key] as string
}
function strOrNull(r: Record<string, unknown>, key: string, path: string): string | null {
  const v = r[key]
  if (v == null) return null
  if (typeof v !== 'string') fail(path, key)
  return v
}

const GRADES: HealthGrade[] = ['正常', '注意', '异常', '严重']
function grade(r: Record<string, unknown>, key: string, path: string): HealthGrade {
  const v = r[key]
  if (typeof v !== 'string' || !GRADES.includes(v as HealthGrade)) fail(path, key)
  return v as HealthGrade
}

function normItems(raw: unknown, path: string, field: string) {
  if (!Array.isArray(raw)) fail(path, field)
  return (raw as unknown[]).map((row) => {
    const r = objectOf(row, path, field)
    return {
      code: str(r, 'code', path),
      itemName: str(r, 'itemName', path),
      dimensionNo: num(r, 'dimensionNo', path, 1),
      grade: grade(r, 'grade', path),
      deduction: num(r, 'deduction', path),
      autoCalculated: r.autoCalculated === true,
      autoDetail: strOrNull(r, 'autoDetail', path),
    }
  })
}

/** 7.3 记录行（join 回显；healthValue/assessorName/remark 缺失容忍 null，清剿口径显示「—」） */
function normRecord(value: unknown, path: string): HealthAssessmentRecord {
  const r = objectOf(value, path, '记录')
  return {
    id: num(r, 'id', path, 1),
    cabinetId: num(r, 'cabinetId', path, 1),
    cabinetName: str(r, 'cabinetName', path),
    cabinetNumber: str(r, 'cabinetNumber', path),
    templateCode: str(r, 'templateCode', path),
    deviceTypeName: str(r, 'deviceTypeName', path),
    hiScore: num(r, 'hiScore', path),
    healthValue: numOrNull(r, 'healthValue', path),
    assessorId: str(r, 'assessorId', path),
    assessorName: str(r, 'assessorName', path),
    remark: strOrNull(r, 'remark', path),
    createdAt: str(r, 'createdAt', path),
  }
}

/** 7.1 按箱柜查询评估模板（类型不支持时后端 code=0 带类型名提示，前端展示 msg） */
export function getAssessmentTemplate(cabinetId: number): Promise<HealthAssessTemplate> {
  return bzGet<unknown>('/health/assessments/template', { cabinetId }, options).then((data) => {
    const path = '/health/assessments/template'
    const r = objectOf(data, path, '模板')
    if (!Array.isArray(r.dimensions)) fail(path, 'dimensions')
    const dimensions = (r.dimensions as unknown[]).map((row) => {
      const d = objectOf(row, path, '维度')
      if (!Array.isArray(d.items)) fail(path, 'items')
      return {
        no: num(d, 'no', path, 1),
        name: str(d, 'name', path),
        weightPercent: num(d, 'weightPercent', path),
        items: (d.items as unknown[]).map((row) => {
          const i = objectOf(row, path, '评分项')
          return {
            code: str(i, 'code', path),
            name: str(i, 'name', path),
            subWeight: num(i, 'subWeight', path),
            normal: str(i, 'normal', path),
            attention: str(i, 'attention', path),
            abnormal: str(i, 'abnormal', path),
            severe: str(i, 'severe', path),
            autoCalculated: i.autoCalculated === true,
          }
        }),
      }
    })
    const preview = objectOf(r.autoPreview, path, 'autoPreview')
    return {
      cabinetId: num(r, 'cabinetId', path, 1),
      cabinetName: str(r, 'cabinetName', path),
      cabinetNumber: str(r, 'cabinetNumber', path),
      deviceTypeName: str(r, 'deviceTypeName', path),
      templateCode: str(r, 'templateCode', path),
      templateName: str(r, 'templateName', path),
      dimensions,
      autoPreview: {
        itemCode: str(preview, 'itemCode', path),
        itemName: str(preview, 'itemName', path),
        grade: grade(preview, 'grade', path),
        autoDetail: str(preview, 'autoDetail', path),
      },
    }
  })
}

/** 7.2 提交评估（手工项必须恰好覆盖模板全部手工项；等级非法/缺失后端 code=0） */
export function submitAssessment(body: HealthAssessmentSubmitBody): Promise<HealthAssessmentResult> {
  return bzPost<unknown>('/health/assessments', body, options).then((data) => {
    const path = '/health/assessments'
    const r = objectOf(data, path, '结果')
    if (!Array.isArray(r.dimensions)) fail(path, 'dimensions')
    const dimensions = (r.dimensions as unknown[]).map((row) => {
      const d = objectOf(row, path, '维度得分')
      return {
        no: num(d, 'no', path, 1),
        name: str(d, 'name', path),
        weightPercent: num(d, 'weightPercent', path),
        score: num(d, 'score', path),
      }
    })
    return {
      assessmentId: num(r, 'assessmentId', path, 1),
      cabinetId: num(r, 'cabinetId', path, 1),
      cabinetName: str(r, 'cabinetName', path),
      dimensions,
      items: normItems(r.items, path, 'items'),
      hiScore: num(r, 'hiScore', path),
      healthValue: num(r, 'healthValue', path, 0),
      healthLevel: str(r, 'healthLevel', path),
    }
  })
}

/** 7.3 评估历史分页（按评估时间倒序；cabinetId/deviceTypeId 可叠加筛选） */
export async function fetchAssessmentRecords(params: {
  cabinetId?: number
  deviceTypeId?: number
  page?: number
  pageSize?: number
}): Promise<{ total: number; rows: HealthAssessmentRecord[] }> {
  const query: Record<string, unknown> = {}
  if (params.cabinetId != null) query.cabinetId = params.cabinetId
  if (params.deviceTypeId != null) query.deviceTypeId = params.deviceTypeId
  if (params.page != null) query.page = params.page
  if (params.pageSize != null) query.pageSize = params.pageSize
  const data = objectOf(await bzGet<unknown>('/health/assessments', query, options), '/health/assessments', '分页')
  if (typeof data.total !== 'number' || !Number.isFinite(data.total)) fail('/health/assessments', 'total')
  if (!Array.isArray(data.rows)) fail('/health/assessments', 'rows')
  return {
    total: data.total,
    rows: (data.rows as unknown[]).map((row) => normRecord(row, '/health/assessments')),
  }
}

/** 7.4 评估详情（快照可完整重放计算过程） */
export function fetchAssessmentDetail(id: number): Promise<HealthAssessmentDetail> {
  return bzGet<unknown>(`/health/assessments/${id}`, undefined, options).then((data) => {
    const path = `/health/assessments/${id}`
    const r = objectOf(data, path, '详情')
    const assessment = normRecord(r.assessment, path)
    if (!Array.isArray(r.dimensions)) fail(path, 'dimensions')
    const dimensions = (r.dimensions as unknown[]).map((row) => {
      const d = objectOf(row, path, '维度得分')
      return {
        no: num(d, 'no', path, 1),
        name: str(d, 'name', path),
        weightPercent: num(d, 'weightPercent', path),
        score: num(d, 'score', path),
      }
    })
    if (!Array.isArray(r.items)) fail(path, 'items')
    const items = (r.items as unknown[]).map((row) => {
      const i = objectOf(row, path, '明细行')
      return {
        id: num(i, 'id', path, 1),
        assessmentId: num(i, 'assessmentId', path, 1),
        itemCode: str(i, 'itemCode', path),
        itemName: str(i, 'itemName', path),
        dimensionNo: num(i, 'dimensionNo', path, 1),
        subWeight: num(i, 'subWeight', path),
        grade: grade(i, 'grade', path),
        deduction: num(i, 'deduction', path),
        autoCalculated: i.autoCalculated === true,
        autoDetail: strOrNull(i, 'autoDetail', path),
      }
    })
    return { assessment, dimensions, items }
  })
}
