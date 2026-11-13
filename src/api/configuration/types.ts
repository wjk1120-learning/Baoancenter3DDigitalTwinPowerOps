/** §5.33 CetDataType（docs/FY-Hospital-API.md 配置中心模块·数据类型字典） */

/** CET 数据类型字典行（typeCode ↔ DataID 映射，供电能参数曲线 §2.9 入参校验/选择） */
export interface CetDataType {
  /** 数据类型 ID（列表按 id 升序返回） */
  id: number
  /** 类型编码（唯一，如 Ia） */
  typeCode: string
  /** 类型名称（如 A相电流；与 §1.11 测点名 measName 同体系） */
  typeName: string
  /** CET 测点 DataID（唯一） */
  dataId: number
  /** 备注（可空） */
  remark: string | null
}
