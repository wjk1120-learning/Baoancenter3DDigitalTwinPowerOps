/**
 * 健康度模板整树的客户端预校验（契约 §7.6 五规则 + 2026-11-17 客户端加严，报错文案对齐后端定位格式）。
 * 照搬福永配置中心参考包。加严项：手工评分项四档判定文案必填——评估抽屉常显每档标准
 * （怎么样算正常/注意…），缺档无法评估；后端不强制该条，自动项（服务端预计算）豁免。
 * 不过预校验不发请求——后端任一规则不满足会整体拒收并零写库。
 */
import type { HealthTemplateDimension, HealthTemplateItem } from '../../../api/health/types'

/** 服务端自动评分项的固定编码（每模板至多 1 个） */
export const AUTO_ITEM_CODE = 'dim6_service_life'

export function emptyItem(): HealthTemplateItem {
  return {
    code: '',
    name: '',
    subWeight: 0,
    normal: '',
    attention: '',
    abnormal: '',
    severe: '',
    autoCalculated: false,
  }
}

function round(n: number): string {
  return String(Number(n.toFixed(4)))
}

/** 返回首个命中的错误文案；全部通过返回空串 */
export function validateTemplateTreeDraft(dimensions: HealthTemplateDimension[]): string {
  if (!dimensions.length) return '模板配置数据异常：至少需要配置 1 个维度'
  const seenNo = new Set<number>()
  const seenCode = new Set<string>()
  let autoCount = 0
  let weightSum = 0
  for (const dim of dimensions) {
    const dimName = dim.name.trim() || `维度${dim.no}`
    if (!Number.isSafeInteger(dim.no) || dim.no < 1) return `维度「${dimName}」的序号必须为正整数`
    if (seenNo.has(dim.no)) return `维度序号重复：${dim.no}`
    seenNo.add(dim.no)
    if (!dim.name.trim()) return `维度「${dimName}」的名称不能为空`
    if (!dim.items.length) return `维度「${dimName}」至少需要配置 1 个评分项`
    weightSum += dim.weightPercent
    let subSum = 0
    for (const item of dim.items) {
      const code = item.code.trim()
      if (!code) return `维度「${dimName}」存在未填写编码的评分项`
      if (seenCode.has(code)) return `评分项编码重复：${code}`
      seenCode.add(code)
      if (!item.name.trim()) return `维度「${dimName}」存在未填写名称的评分项`
      if (!(item.subWeight > 0)) return `维度「${dimName}」评分项「${item.name.trim()}」的子权重必须大于 0`
      if (item.autoCalculated) {
        autoCount++
        if (code !== AUTO_ITEM_CODE) return `自动评分项编码固定为 ${AUTO_ITEM_CODE}`
      } else {
        const gradeTexts: [string, string][] = [
          ['正常', item.normal],
          ['注意', item.attention],
          ['异常', item.abnormal],
          ['严重', item.severe],
        ]
        for (const [label, text] of gradeTexts) {
          if (!text || !text.trim()) {
            return `维度「${dimName}」评分项「${item.name.trim()}」的「${label}」判定文案不能为空`
          }
        }
      }
      subSum += item.subWeight
    }
    if (Math.abs(subSum - 1) > 1e-6) {
      return `维度「${dimName}」的评分项权重之和必须等于 1，实际为 ${round(subSum)}，不允许保存`
    }
  }
  if (autoCount > 1) return '自动评分项每模板至多 1 个'
  if (Math.abs(weightSum - 100) > 1e-6) {
    return `维度权重之和必须等于 100，实际为 ${round(weightSum)}，不允许保存`
  }
  return ''
}

/** 提交前整形成 7.6.5 请求体（去 id/去首尾空格/数值化） */
export function toTreeSaveBody(dimensions: HealthTemplateDimension[]): HealthTemplateDimension[] {
  return dimensions.map((d) => ({
    no: d.no,
    name: d.name.trim(),
    weightPercent: Number(d.weightPercent),
    items: d.items.map((i) => ({
      code: i.code.trim(),
      name: i.name.trim(),
      subWeight: Number(i.subWeight),
      normal: i.normal,
      attention: i.attention,
      abnormal: i.abnormal,
      severe: i.severe,
      autoCalculated: i.autoCalculated,
    })),
  }))
}
