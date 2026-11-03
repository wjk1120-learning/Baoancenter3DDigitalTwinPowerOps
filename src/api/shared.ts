/** 契约通用结构（docs/FY-Hospital-API-v3.90.md「通用说明」，各模块分页接口共用） */
export interface PageResult<T> {
  /** 总记录数 */
  total: number
  /** 当前页数据 */
  rows: T[]
}
