/** 运维管理模块契约类型（docs/FY-Hospital-API.md §4 巡检/缺陷，字段只认文档所载） */

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
  /** 直流电压原图（UPS"直流电压"分组；无则 null；v5.4.2 新增字段） */
  dcVoltageImage: string | null
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

/** §4.3 DefectStats（缺陷处理状态统计；buildingId 选填口径已随契约 v5.4.2 落地，
 *  原 deviceNumber 参数已废：不传=统计全量缺陷表，传入=经箱柜台账圈定该楼栋编号集合，
 *  仅统计「隐患配电柜/箱编号」命中的记录） */
export interface DefectStats {
  /** 缺陷总数（范围内全部记录，含未知流程状态） */
  total: number
  /** 待处理数 */
  pending: number
  /** 处理中数 */
  processing: number
  /** 已完成数 */
  done: number
  /** 无需处理数 */
  skipped: number
}

/** §4.5 箱柜缺陷联合查询参数（全部可选；riskLevel 精确匹配 一般缺陷/严重缺陷/重大缺陷；
 *  startDate/endDate 按缺陷记录时间日期部分闭区间比较，可单传其一；
 *  v5.4.2 行序 = 缺陷数量降序，同数量保持台账序） */
export interface CabinetDefectQuery {
  riskLevel?: string
  startDate?: string
  endDate?: string
  /** 缺陷处理状态精确匹配（待处理/处理中/已完成/无需处理；v5.4.2 新增参数） */
  processState?: string
  /** 楼栋 ID（等值过滤该楼栋箱柜；未关联楼栋的箱柜不命中——契约口径） */
  buildingId?: number
  page?: number
  pageSize?: number
}

/** §4.5 CabinetDefectOverview（箱柜缺陷联合查询行；一行一个箱柜，行序同 §1.4） */
export interface CabinetDefectOverview {
  /** 楼栋名称（箱柜未关联楼栋为 null） */
  buildingName: string | null
  /** 设备编号（箱柜编号，如 BZ000021） */
  deviceNumber: string
  /** 箱柜名称 */
  superName: string
  /** 设备类型 */
  deviceType: string
  /** 有无缺陷（筛选条件下统计，true=有） */
  hasDefect: boolean
  /** 缺陷数量（筛选条件下命中条数） */
  defectCount: number
  /** 最近缺陷发现日期（匹配集合最新 foundDate，yyyy-MM-dd；无匹配为 null） */
  latestDefectDate: string | null
}
