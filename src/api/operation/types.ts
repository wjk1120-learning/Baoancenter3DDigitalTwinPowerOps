/** 运维管理模块契约类型（docs/FY-Hospital-API-v3.90.md §4 巡检/缺陷，字段只认文档所载） */

/** §4.1 InspectDeviceRecord（按箱柜编号查询的巡检/维护记录） */
export interface InspectDeviceRecord {
  /** 草料记录 ID */
  recordId: string
  /** 箱柜名称（已按编号回填箱柜名） */
  superDeviceName: string
  /** 设备编号（箱柜编号） */
  deviceNumber: string
  /** 箱柜巡检图片地址（多张逗号拼接；无则 null） */
  deviceImage: string | null
  /** 设备运行温度（℃，红外数据记录；无则 null） */
  temperature: number | null
  /** 红外测温原图地址（无则 null） */
  temperatureImage: string | null
  /** 最高温度接点电流（A；无则 null） */
  detectCurrent: number | null
  /** 最高温度接点电流原图地址（无则 null） */
  currentImage: string | null
  /** 直流电压（UPS 电池组，V；无则 null） */
  dcVoltage: number | null
  /** 巡检人名称（无则 null） */
  inspector: string | null
  /** 巡检结果（草料顶层结果内容，如 正常；无则 null） */
  inspectResult: string | null
  /** 记录时间 yyyy-MM-dd HH:mm:ss */
  createdAt: string
}

/** §4.2 缺陷业务字段结构化（未填写字段为 null） */
export interface DefectInfo {
  /** 报告人 */
  reporterName: string | null
  /** 发现日期 yyyy-MM-dd */
  foundDate: string | null
  /** 隐患位置 */
  hazardPosition: string | null
  /** 隐患描述 */
  hazardDescription: string | null
  /** 风险等级（如 一般缺陷/重大缺陷） */
  riskLevel: string | null
  /** 是否整改（如 未整改/已整改） */
  rectified: string | null
  /** 整改措施 */
  rectifyMeasure: string | null
  /** 建议整改措施 */
  suggestedMeasure: string | null
  /** 整改期限 */
  deadline: string | null
  /** 整改科室及责任人 */
  responsibleDept: string | null
  /** 不符合标准条款内容 */
  standardClause: string | null
  /** 备注 */
  remark: string | null
  /** 整改前图片地址 */
  beforeImageUrls: string[] | null
  /** 整改中图片地址 */
  duringImageUrls: string[] | null
  /** 整改后图片地址 */
  afterImageUrls: string[] | null
  /** 作业图片地址 */
  workImageUrls: string[] | null
  /** 流程最近流转时间 */
  processTime: string | null
  /** 隐患配电柜/箱名称（已按设备编号回填箱柜名，未命中保持草料原值） */
  hazardDeviceName: string | null
  /** 隐患配电柜/箱设备编号（如 BZ000021） */
  hazardDeviceNumber: string | null
  /** 隐患配电柜/箱原图地址 */
  hazardDeviceImage: string | null
}

/** §4.2 CaoliaoRecord（缺陷记录；内容已由 defectInfo 完整承载，fields 恒为 null） */
export interface CaoliaoRecord {
  /** 草料记录 ID */
  recordId: string
  /** 记录时间 yyyy-MM-dd HH:mm:ss */
  recordTime: string
  /** 表单名称（恒为缺陷表名） */
  formName: string
  /** 表单编号（恒为 D475） */
  formNumber: string
  /** 表单类型标识（恒为 DEFECT） */
  formType: string
  /** 填报人 */
  inspector: string
  /** 结果内容（草料顶层 result_content 列） */
  result: string
  /** 流程状态（待处理/处理中/已完成/无需处理） */
  processState: string
  /** 扫码位置原始名 */
  positionRaw: string
  /** 扫码位置清洗后名称 */
  position: string
  /** 记录详情页地址 */
  webUrl: string
  /** 恒为 null（内容已由 defectInfo 完整承载） */
  fields: null
  defectInfo: DefectInfo
}
