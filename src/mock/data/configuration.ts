/**
 * §5.33 CET 数据类型字典（假数据，docs/FY-Hospital-API.md）。
 * 与后端内置 8 个 DataID 一致：Ia/Ib/Ic/Pa/Pb/Pc/Pfs/PEsum；
 * typeName 与 §1.11 mock 测点名（MEAS_TEMPLATE）同体系，抽屉按名称匹配实时值。
 */
import type { CetDataType } from '../../api/configuration/types'

export const CET_DATA_TYPES: CetDataType[] = [
  { id: 1, typeCode: 'Ia', typeName: 'A相电流', dataId: 1000001, remark: null },
  { id: 2, typeCode: 'Ib', typeName: 'B相电流', dataId: 1000002, remark: null },
  { id: 3, typeCode: 'Ic', typeName: 'C相电流', dataId: 1000003, remark: null },
  { id: 4, typeCode: 'Pa', typeName: 'A相有功功率', dataId: 2000001, remark: null },
  { id: 5, typeCode: 'Pb', typeName: 'B相有功功率', dataId: 2000002, remark: null },
  { id: 6, typeCode: 'Pc', typeName: 'C相有功功率', dataId: 2000003, remark: null },
  { id: 7, typeCode: 'Pfs', typeName: '功率因数', dataId: 2000016, remark: null },
  { id: 8, typeCode: 'PEsum', typeName: '总有功电能', dataId: 4000016, remark: null },
]

export function getCetDataTypes(): CetDataType[] {
  return CET_DATA_TYPES
}
