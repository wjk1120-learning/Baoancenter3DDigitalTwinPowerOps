/** §7.6 健康度评估模板（四级扣分制：正常 0 / 注意 20 / 异常 50 / 严重 100）——照搬福永配置中心参考包 */

/** §7.6.5 评分项（整树保存请求体不含 id；查询响应含 id） */
export interface HealthTemplateItem {
  id?: number
  /** 评分项编码（模板内唯一，跨维度） */
  code: string
  name: string
  /** 维度内子权重，每维度合计必须为 1 */
  subWeight: number
  normal: string
  attention: string
  abnormal: string
  severe: string
  /** 服务端自动计算项（每模板至多 1 个，编码固定 dim6_service_life） */
  autoCalculated: boolean
}

export interface HealthTemplateDimension {
  id?: number
  /** 维度序号（正整数，仅作排序；数量不限） */
  no: number
  name: string
  /** 维度权重百分数，全部维度合计必须为 100 */
  weightPercent: number
  items: HealthTemplateItem[]
}

/** §7.6.1 模板列表行 */
export interface HealthTemplateSummary {
  id: number
  code: string
  /** 匹配的设备类型名称 */
  typeName: string
  designLifeYears: number
  createdAt: string | null
  dimensionCount: number
  itemCount: number
  weightSum: number
}

/** §7.6.2 模板整树（基本信息 + 维度/评分项） */
export interface HealthTemplateTree extends HealthTemplateSummary {
  dimensions: HealthTemplateDimension[]
}

/** 新增/修改模板基本信息请求体（7.6.3 / 7.6.4 同形） */
export interface HealthTemplateShellBody {
  code: string
  typeName: string
  designLifeYears: number
}

/* ---------- §7.1-7.4 评估链路 ---------- */

/** 四级评定等级（扣分 0/20/50/100）；与 config/healthGrades 的五档 HealthGrade（excellent 等）不同物，各用各的 */
export type HealthGrade = '正常' | '注意' | '异常' | '严重'

/** §7.1 运行年限自动项预计算 */
export interface HealthAutoPreview {
  itemCode: string
  itemName: string
  grade: HealthGrade
  autoDetail: string
}

/** §7.1 按箱柜查询评估模板（维度/评分项无 id，自动项已预计算） */
export interface HealthAssessTemplate {
  cabinetId: number
  cabinetName: string
  cabinetNumber: string
  deviceTypeName: string
  templateCode: string
  templateName: string
  dimensions: HealthTemplateDimension[]
  autoPreview: HealthAutoPreview
}

/** §7.2 提交评估请求体（手工项必须恰好覆盖模板全部参与手工项；自动项不提交） */
export interface HealthAssessmentSubmitBody {
  cabinetId: number
  items: { code: string; grade: HealthGrade }[]
  remark?: string
}

/** §7.2 维度得分 */
export interface HealthAssessmentDimensionScore {
  no: number
  name: string
  weightPercent: number
  score: number
}

/** §7.2 提交响应（提交即生效：回写箱柜 health） */
export interface HealthAssessmentResult {
  assessmentId: number
  cabinetId: number
  cabinetName: string
  dimensions: HealthAssessmentDimensionScore[]
  items: {
    code: string
    itemName: string
    dimensionNo: number
    grade: HealthGrade
    deduction: number
    autoCalculated: boolean
    autoDetail: string | null
  }[]
  hiScore: number
  healthValue: number
  healthLevel: string
}

/** §7.3 评估记录行（按评估时间倒序） */
export interface HealthAssessmentRecord {
  id: number
  cabinetId: number
  cabinetName: string
  cabinetNumber: string
  templateCode: string
  deviceTypeName: string
  hiScore: number
  /** 缺失按 null 显示「—」（清剿口径，不冒充数值） */
  healthValue: number | null
  assessorId: string
  assessorName: string
  remark: string | null
  createdAt: string
}

/** §7.4 评估详情（快照自包含，可完整重放计算过程） */
export interface HealthAssessmentDetail {
  assessment: HealthAssessmentRecord
  dimensions: HealthAssessmentDimensionScore[]
  items: {
    id: number
    assessmentId: number
    itemCode: string
    itemName: string
    dimensionNo: number
    subWeight: number
    grade: HealthGrade
    deduction: number
    autoCalculated: boolean
    autoDetail: string | null
  }[]
}
