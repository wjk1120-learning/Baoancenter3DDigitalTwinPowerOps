/**
 * 配置中心 mock 种子与板块内 CRUD（契约 = docs/FY-Hospital-API.md 第五章 §5.1-5.33 +
 * 第七章 §7.6；照搬福永配置中心交互，接口形状对齐 api/configuration 与 api/health）。
 *
 * 口径（用户拍板「板块内自洽」）：配置中心各板块持有独立数据副本，增删改只在本板块
 * 生效，不联动 device/event 等其它页面的 mock 数据；命名与宝安 mock 现有命名同源
 * （楼栋 = data/device.ts 的真实楼栋、配电房 = 6 房、柜名 = 「n#变 柜名」格式）。
 * 写接口失败路径用 mockFail(msg) 复刻后端 code=0（重名校验/删除有关联项等）。
 *
 * 批次说明：字典三板块（设备类型/配电房/楼栋）写链路本批交付；通道/设备/箱柜/评估/
 * 模板/监控/能耗统计的写链路随批次 2-4 补（见 routes.ts 各段注释）。
 */
import type {
  BuildingConfig,
  DeviceTypeConfig,
  SwitchingConfig,
} from '../../api/configuration/configuration'
import type {
  CabinetConfig,
  ChannelConfig,
  DeviceConfig,
  DeviceFilter,
} from '../../api/configuration/inventory'
import type {
  BuildingStatsDevice,
  FloorStatsGroup,
} from '../../api/configuration/energy'
import type { HealthTemplateTree } from '../../api/health/types'
import type {
  HealthAssessTemplate,
  HealthAssessmentDetail,
  HealthAssessmentRecord,
  HealthAssessmentResult,
  HealthGrade,
} from '../../api/health/types'
import type { CetDataType } from '../../api/configuration/types'
import { mockFail } from '../mockFail'

// ---- §5.33 CET 数据类型字典（原有种子：与后端内置 8 个 DataID 一致，测点抽屉共用） ----
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

// ---- §5.20 楼栋字典（与 data/device.ts buildings 同名同 id；独立副本，板块内自洽） ----
export const buildingRows: BuildingConfig[] = [
  { id: 1, buildingName: '门诊1号楼' },
  { id: 2, buildingName: '门诊2号楼' },
  { id: 3, buildingName: '综合楼' },
  { id: 4, buildingName: '住院楼' },
  { id: 5, buildingName: '行政楼' },
  { id: 6, buildingName: '宿舍楼' },
  // 新建楼栋样板：无箱柜关联，可删（演示 §5.23 成功路径）
  { id: 7, buildingName: '科教楼（在建）' },
]

// ---- §5.1 设备类型字典 ----
export const deviceTypeRows: DeviceTypeConfig[] = [
  { id: 1, name: '低压开关柜', remark: 'P05 系列馈线柜' },
  { id: 2, name: '电容补偿柜', remark: null },
  { id: 3, name: '进线及计量柜', remark: null },
  { id: 4, name: '强电井配电箱', remark: '楼层配电箱，随楼层强电井设置' },
  { id: 5, name: '医用IT隔离电源柜', remark: '手术室/ICU 专用' },
  { id: 6, name: '环网柜', remark: null },
]

// ---- §5.5 配电房字典（宝安 6 房口径） ----
export const switchingRows: SwitchingConfig[] = [
  { id: 1, switchingName: '1#变低压配电房' },
  { id: 2, switchingName: '2#变低压配电房' },
  { id: 3, switchingName: '3#变低压配电房' },
  { id: 4, switchingName: '4#变低压配电房' },
  { id: 5, switchingName: '5#变低压配电房' },
  { id: 6, switchingName: '6#变低压配电房' },
]

// ---- §5.9 通道字典（CET 采集通道） ----
export const channelRows: ChannelConfig[] = [
  { channelId: 1, channelName: '1#变压器回路' },
  { channelId: 2, channelName: '2#变压器回路' },
  { channelId: 3, channelName: '门诊楼回路' },
  { channelId: 4, channelName: '住院楼回路' },
]

// ---- §5.13 设备列表（含 unbound / no-location 样本供三档筛选演示） ----
export const deviceRows: DeviceConfig[] = [
  { channelId: 1, deviceId: 6101, deviceName: 'P05-1 门诊A栋', enabled: 1, superName: '1#变 1AA1进线及计量柜', locationNumbers: ['门诊1号楼G层东井'] },
  { channelId: 1, deviceId: 6102, deviceName: 'P05-2 门诊A栋', enabled: 1, superName: '1#变 1AA1进线及计量柜', locationNumbers: ['门诊1号楼3层西井'] },
  { channelId: 1, deviceId: 6103, deviceName: 'P06-1 综合楼', enabled: 1, superName: '1#变 1AA3馈线柜', locationNumbers: ['综合楼G层配电间'] },
  { channelId: 2, deviceId: 6201, deviceName: 'P07-1 住院楼', enabled: 1, superName: '2#变 2AA1进线及计量柜', locationNumbers: ['住院楼B1层配电间'] },
  { channelId: 2, deviceId: 6202, deviceName: 'P07-2 住院楼', enabled: 0, superName: '2#变 2AA2馈线柜', locationNumbers: ['住院楼5层东井'] },
  { channelId: 3, deviceId: 6301, deviceName: 'P08-1 行政楼', enabled: 1, superName: '3#变 3AA1电容补偿柜', locationNumbers: ['行政楼G层配电间'] },
  { channelId: 3, deviceId: 6302, deviceName: 'P08-2 行政楼', enabled: 1, superName: '3#变 3AA1电容补偿柜', locationNumbers: [] },
  { channelId: 4, deviceId: 6401, deviceName: 'P09-1 宿舍楼', enabled: 1, superName: '4#变 4AA1馈线柜', locationNumbers: ['宿舍楼1层配电间'] },
  { channelId: 4, deviceId: 6402, deviceName: 'UPS-1 手术室', enabled: 1, superName: null, locationNumbers: ['综合楼4层手术室'] },
  { channelId: 2, deviceId: 6203, deviceName: 'P07-3 住院楼', enabled: 1, superName: null, locationNumbers: [] },
  { channelId: 1, deviceId: 6104, deviceName: 'P05-3 门诊A栋', enabled: 1, superName: '1#变 1AA1进线及计量柜', locationNumbers: ['门诊1号楼5层东井'] },
  { channelId: 3, deviceId: 6303, deviceName: 'IT-1 ICU电源', enabled: 1, superName: '3#变 3AA2医用IT柜', locationNumbers: ['综合楼6层ICU'] },
  { channelId: 2, deviceId: 6204, deviceName: 'P07-4 住院楼', enabled: 1, superName: '2#变 2AA3馈线柜', locationNumbers: [] },
  { channelId: 1, deviceId: 6105, deviceName: 'P05-4 门诊B栋', enabled: 1, superName: '1#变 1AA4馈线柜', locationNumbers: ['门诊2号楼2层东井'] },
]

// ---- §5.15 箱柜档案（16 条覆盖分页；含 1 条 deviceNumber=null 的 BUG-011 样本） ----
export const cabinetRows: CabinetConfig[] = [
  { id: 1, buildingId: 1, buildingName: '门诊1号楼', superName: '1#变 1AA1进线及计量柜', deviceNumber: 'BZ000001', deviceTypeId: 3, deviceTypeName: '进线及计量柜', commissionDate: '2020-06-30', switchingId: 1, switchingName: '1#变低压配电房', status: 1, health: 92 },
  { id: 2, buildingId: 1, buildingName: '门诊1号楼', superName: '1#变 1AA4馈线柜', deviceNumber: 'BZ000002', deviceTypeId: 1, deviceTypeName: '低压开关柜', commissionDate: '2020-06-30', switchingId: 1, switchingName: '1#变低压配电房', status: 1, health: 88 },
  { id: 3, buildingId: 2, buildingName: '门诊2号楼', superName: '1#变 1AC1无功补偿柜', deviceNumber: 'BZ000003', deviceTypeId: 2, deviceTypeName: '电容补偿柜', commissionDate: '2021-03-15', switchingId: 1, switchingName: '1#变低压配电房', status: 1, health: 76 },
  { id: 4, buildingId: 3, buildingName: '综合楼', superName: '1#变 1AA3馈线柜', deviceNumber: 'BZ000004', deviceTypeId: 1, deviceTypeName: '低压开关柜', commissionDate: '2021-03-15', switchingId: 1, switchingName: '1#变低压配电房', status: 1, health: 81 },
  { id: 5, buildingId: 4, buildingName: '住院楼', superName: '2#变 2AA1进线及计量柜', deviceNumber: 'BZ000005', deviceTypeId: 3, deviceTypeName: '进线及计量柜', commissionDate: '2019-11-20', switchingId: 2, switchingName: '2#变低压配电房', status: 1, health: 95 },
  { id: 6, buildingId: 4, buildingName: '住院楼', superName: '2#变 2AA2馈线柜', deviceNumber: 'BZ000006', deviceTypeId: 1, deviceTypeName: '低压开关柜', commissionDate: '2019-11-20', switchingId: 2, switchingName: '2#变低压配电房', status: 1, health: 64 },
  { id: 7, buildingId: 4, buildingName: '住院楼', superName: '2#变 2AA3馈线柜', deviceNumber: 'BZ000007', deviceTypeId: 1, deviceTypeName: '低压开关柜', commissionDate: '2019-11-20', switchingId: 2, switchingName: '2#变低压配电房', status: 1, health: 58 },
  { id: 8, buildingId: 5, buildingName: '行政楼', superName: '3#变 3AA1电容补偿柜', deviceNumber: 'BZ000008', deviceTypeId: 2, deviceTypeName: '电容补偿柜', commissionDate: '2022-08-01', switchingId: 3, switchingName: '3#变低压配电房', status: 1, health: 90 },
  { id: 9, buildingId: 3, buildingName: '综合楼', superName: '3#变 3AA2医用IT柜', deviceNumber: 'BZ000009', deviceTypeId: 5, deviceTypeName: '医用IT隔离电源柜', commissionDate: '2022-08-01', switchingId: 3, switchingName: '3#变低压配电房', status: 1, health: 97 },
  { id: 10, buildingId: 6, buildingName: '宿舍楼', superName: '4#变 4AA1馈线柜', deviceNumber: 'BZ000010', deviceTypeId: 1, deviceTypeName: '低压开关柜', commissionDate: '2018-05-10', switchingId: 4, switchingName: '4#变低压配电房', status: 1, health: 72 },
  { id: 11, buildingId: 1, buildingName: '门诊1号楼', superName: '门诊1号楼G层强电井配电箱', deviceNumber: null, deviceTypeId: 4, deviceTypeName: '强电井配电箱', commissionDate: null, switchingId: null, switchingName: null, status: 1, health: 85 },
  { id: 12, buildingId: 1, buildingName: '门诊1号楼', superName: '门诊1号楼3层强电井配电箱', deviceNumber: 'BZ000012', deviceTypeId: 4, deviceTypeName: '强电井配电箱', commissionDate: '2020-06-30', switchingId: null, switchingName: null, status: 1, health: 80 },
  { id: 13, buildingId: 2, buildingName: '门诊2号楼', superName: '门诊2号楼2层强电井配电箱', deviceNumber: 'BZ000013', deviceTypeId: 4, deviceTypeName: '强电井配电箱', commissionDate: '2020-06-30', switchingId: null, switchingName: null, status: 1, health: 83 },
  { id: 14, buildingId: 3, buildingName: '综合楼', superName: '综合楼G层强电井配电箱', deviceNumber: 'BZ000014', deviceTypeId: 4, deviceTypeName: '强电井配电箱', commissionDate: '2021-03-15', switchingId: null, switchingName: null, status: 0, health: 100 },
  { id: 15, buildingId: 4, buildingName: '住院楼', superName: '住院楼5层强电井配电箱', deviceNumber: 'BZ000015', deviceTypeId: 4, deviceTypeName: '强电井配电箱', commissionDate: '2019-11-20', switchingId: null, switchingName: null, status: 1, health: 69 },
  { id: 16, buildingId: 5, buildingName: '行政楼', superName: '行政楼G层强电井配电箱', deviceNumber: 'BZ000016', deviceTypeId: 4, deviceTypeName: '强电井配电箱', commissionDate: '2022-08-01', switchingId: null, switchingName: null, status: 0, health: 100 },
]

// ---- §5.24 楼栋能耗统计（buildingId=0 为全院哨兵行；一设备至多一行） ----
export const buildingStatsRows: BuildingStatsDevice[] = [
  { buildingId: 1, buildingName: '门诊1号楼', deviceId: 6101, channelId: 1, coefficient: 1 },
  { buildingId: 1, buildingName: '门诊1号楼', deviceId: 6102, channelId: 1, coefficient: 1 },
  { buildingId: 1, buildingName: '门诊1号楼', deviceId: 6105, channelId: 1, coefficient: 1 },
  { buildingId: 3, buildingName: '综合楼', deviceId: 6103, channelId: 1, coefficient: 1 },
  { buildingId: 3, buildingName: '综合楼', deviceId: 6402, channelId: 2, coefficient: 1 },
  { buildingId: 4, buildingName: '住院楼', deviceId: 6201, channelId: 2, coefficient: 1 },
  { buildingId: 4, buildingName: '住院楼', deviceId: 6203, channelId: 2, coefficient: -1 },
  { buildingId: 5, buildingName: '行政楼', deviceId: 6301, channelId: 3, coefficient: 1 },
  { buildingId: 6, buildingName: '宿舍楼', deviceId: 6401, channelId: 4, coefficient: 1 },
  { buildingId: 0, buildingName: '全院', deviceId: 6303, channelId: 3, coefficient: 1 },
]

// ---- §5.29 楼层能耗统计（floor 口径 G/数字/负数；同楼层多设备带系数） ----
export const floorStatsRows: FloorStatsGroup[] = [
  { buildingId: 1, buildingName: '门诊1号楼', floor: 'G', devices: [{ deviceId: 6101, coefficient: 1 }] },
  { buildingId: 1, buildingName: '门诊1号楼', floor: '3', devices: [{ deviceId: 6102, coefficient: 1 }] },
  { buildingId: 1, buildingName: '门诊1号楼', floor: '5', devices: [{ deviceId: 6104, coefficient: 1 }] },
  { buildingId: 2, buildingName: '门诊2号楼', floor: '2', devices: [{ deviceId: 6105, coefficient: 1 }] },
  { buildingId: 3, buildingName: '综合楼', floor: 'G', devices: [{ deviceId: 6103, coefficient: 1 }] },
  { buildingId: 3, buildingName: '综合楼', floor: '4', devices: [{ deviceId: 6402, coefficient: 1 }] },
  { buildingId: 3, buildingName: '综合楼', floor: '6', devices: [{ deviceId: 6303, coefficient: 1 }] },
  { buildingId: 4, buildingName: '住院楼', floor: '-1', devices: [{ deviceId: 6201, coefficient: 1 }] },
  { buildingId: 4, buildingName: '住院楼', floor: '5', devices: [{ deviceId: 6202, coefficient: 1 }, { deviceId: 6204, coefficient: 1 }] },
]

// ---- §7.6.1/§7.6.2 健康度模板（1 完整树满足强校验 + 1 空壳；列表/树共用一份数据） ----
export const healthTemplateRows: HealthTemplateTree[] = [
  {
    id: 1,
    code: 'TPL-LOWVOLT-01',
    typeName: '低压开关柜',
    designLifeYears: 15,
    createdAt: '2026-10-12 09:30:00',
    dimensionCount: 3,
    itemCount: 5,
    weightSum: 100,
    dimensions: [
      {
        id: 11,
        no: 1,
        name: '外观与安装',
        weightPercent: 30,
        items: [
          { id: 111, code: 'dim1_rust', name: '柜体锈蚀变形', subWeight: 0.5, normal: '柜体表面无锈蚀变形，漆面完好', attention: '轻微锈斑，不影响结构', abnormal: '明显锈蚀，漆面剥落', severe: '柜体变形或锈穿，存在安全隐患', autoCalculated: false },
          { id: 112, code: 'dim1_label', name: '标识与警示齐全', subWeight: 0.5, normal: '标识清晰齐全，与系统一致', attention: '个别标识模糊', abnormal: '多数标识缺失或错误', severe: '无标识，误操作风险高', autoCalculated: false },
        ],
      },
      {
        id: 12,
        no: 2,
        name: '运行状态',
        weightPercent: 40,
        items: [
          { id: 121, code: 'dim2_temp', name: '柜内温度', subWeight: 0.6, normal: '温升在允许范围内', attention: '温升偏高但未超限', abnormal: '温升超限，需查明原因', severe: '温度异常升高，立即停电检查', autoCalculated: false },
          { id: 122, code: 'dim2_noise', name: '运行声响与异味', subWeight: 0.4, normal: '无异常声响和异味', attention: '轻微嗡嗡声', abnormal: '明显放电声或焦味', severe: '剧烈异响冒烟，紧急停机', autoCalculated: false },
        ],
      },
      {
        id: 13,
        no: 3,
        name: '使用寿命',
        weightPercent: 30,
        items: [
          { id: 131, code: 'dim6_service_life', name: '投运年限自动评定', subWeight: 1, normal: '', attention: '', abnormal: '', severe: '', autoCalculated: true },
        ],
      },
    ],
  },
  {
    id: 2,
    code: 'TPL-IT-01',
    typeName: '医用IT隔离电源柜',
    designLifeYears: 10,
    createdAt: null,
    dimensionCount: 0,
    itemCount: 0,
    weightSum: 0,
    dimensions: [],
  },
]

/* ================= 查询（板块内副本直读；返回浅拷贝防调用方改种子） ================= */

const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T

export const getDeviceTypes = () => clone(deviceTypeRows)
export const getSwitchings = () => clone(switchingRows)
export const getBuildings = () => clone(buildingRows)
export const getChannels = () => clone(channelRows)

/** §5.13 三档筛选：''=全部 / unbound=未绑定箱柜 / no-location=无管理编号 */
export function getDevices(filter: DeviceFilter = ''): DeviceConfig[] {
  const rows = clone(deviceRows)
  if (filter === 'unbound') return rows.filter((d) => d.superName == null)
  if (filter === 'no-location') return rows.filter((d) => d.locationNumbers.length === 0)
  return rows
}

export const getCabinets = () => clone(cabinetRows)

/** §5.19 箱柜模糊检索（联想下拉用；返回 id + superName；空关键字契约 code=0） */
export function searchCabinets(keyword: string): { id: number; superName: string }[] | ReturnType<typeof mockFail> {
  const kw = keyword.trim()
  if (!kw) return mockFail('检索关键字不能为空')
  return cabinetRows
    .filter((c) => c.superName.includes(kw) || (c.deviceNumber ?? '').includes(kw))
    .map((c) => ({ id: c.id, superName: c.superName }))
}

export function getBuildingStats(buildingId?: number): BuildingStatsDevice[] {
  const rows = clone(buildingStatsRows)
  if (buildingId == null || Number.isNaN(buildingId)) return rows
  return rows.filter((r) => r.buildingId === buildingId)
}

export function getFloorStats(buildingId?: number): FloorStatsGroup[] {
  const rows = clone(floorStatsRows)
  if (buildingId == null || Number.isNaN(buildingId)) return rows
  return rows.filter((r) => r.buildingId === buildingId)
}

/** §7.6.1 模板列表（树投影成 Summary 行） */
export function getHealthTemplateList() {
  return healthTemplateRows.map((t) => ({
    id: t.id,
    code: t.code,
    typeName: t.typeName,
    designLifeYears: t.designLifeYears,
    createdAt: t.createdAt,
    dimensionCount: t.dimensionCount,
    itemCount: t.itemCount,
    weightSum: t.weightSum,
  }))
}

/** §7.6.2 模板整树（不存在返回 null → 前端 normTree 报「整树」无效） */
export function getHealthTemplateTree(id: number): HealthTemplateTree | null {
  const hit = healthTemplateRows.find((t) => t.id === id)
  return hit ? clone(hit) : null
}

/* ================= 字典三板块写链路（本批交付；失败路径复刻后端 code=0） ================= */

function nextId(rows: { id: number }[]): number {
  return rows.reduce((max, r) => Math.max(max, r.id), 0) + 1
}

/** 通用：名称查重（排除自身 id） */
function nameTaken(rows: { id: number; name: string }[], name: string, excludeId?: number) {
  return rows.some((r) => r.id !== excludeId && r.name === name)
}

/** §5.2 新增设备类型（name 唯一，≤64 字符；remark ≤255） */
export function addDeviceType(body: { name?: unknown; remark?: unknown }) {
  const name = typeof body.name === 'string' ? body.name.trim() : ''
  if (!name) return mockFail('设备类型名称不能为空')
  if (name.length > 64) return mockFail('设备类型名称不能超过 64 字符')
  if (nameTaken(deviceTypeRows, name)) return mockFail(`设备类型名称已存在：${name}`)
  const remark = typeof body.remark === 'string' && body.remark.trim() ? body.remark.trim().slice(0, 255) : null
  const row: DeviceTypeConfig = { id: nextId(deviceTypeRows), name, remark }
  deviceTypeRows.push(row)
  return clone(row)
}

/** §5.3 修改设备类型（name 必填；remark 缺省=保留、空串=清除） */
export function renameDeviceType(id: number, body: { name?: unknown; remark?: unknown }) {
  const hit = deviceTypeRows.find((r) => r.id === id)
  if (!hit) return mockFail(`设备类型不存在${id}`)
  const name = typeof body.name === 'string' ? body.name.trim() : ''
  if (!name) return mockFail('设备类型名称不能为空')
  if (nameTaken(deviceTypeRows, name, id)) return mockFail(`设备类型名称已存在：${name}`)
  hit.name = name
  if (typeof body.remark === 'string') hit.remark = body.remark.trim() ? body.remark.trim().slice(0, 255) : null
  return clone(hit)
}

/** §5.4 删除设备类型（有关联箱柜 → code=0）。
 *  ⚠️ 契约附录标注 data:null，但前端 deleteConfig/validation 仅放行 /data-types/ 前缀的
 *  null，要求设备类型/配电房删除显式返回 true（参考包口径如此，疑似附录文档滞后）；
 *  mock 按前端校验口径返回 true，切真后端时以联调实测为准。 */
export function deleteDeviceType(id: number) {
  const hit = deviceTypeRows.find((r) => r.id === id)
  if (!hit) return mockFail(`设备类型不存在${id}`)
  const refCount = cabinetRows.filter((c) => c.deviceTypeId === id).length
  if (refCount > 0) {
    return mockFail(`该设备类型已关联 ${refCount} 个箱柜，不可删除`)
  }
  deviceTypeRows.splice(deviceTypeRows.indexOf(hit), 1)
  return true
}

/** §5.6 新增配电房（switchingName 唯一） */
export function addSwitching(body: { switchingName?: unknown }) {
  const name = typeof body.switchingName === 'string' ? body.switchingName.trim() : ''
  if (!name) return mockFail('配电房名称不能为空')
  if (switchingRows.some((r) => r.switchingName === name)) return mockFail(`配电房名称已存在：${name}`)
  const row: SwitchingConfig = { id: nextId(switchingRows), switchingName: name }
  switchingRows.push(row)
  return clone(row)
}

/** §5.7 修改配电房 */
export function renameSwitching(id: number, body: { switchingName?: unknown }) {
  const hit = switchingRows.find((r) => r.id === id)
  if (!hit) return mockFail(`配电房不存在${id}`)
  const name = typeof body.switchingName === 'string' ? body.switchingName.trim() : ''
  if (!name) return mockFail('配电房名称不能为空')
  if (switchingRows.some((r) => r.id !== id && r.switchingName === name)) {
    return mockFail(`配电房名称已存在：${name}`)
  }
  hit.switchingName = name
  return clone(hit)
}

/** §5.8 删除配电房（有归属箱柜 → code=0；返回 true 口径同 deleteDeviceType 注释） */
export function deleteSwitching(id: number) {
  const hit = switchingRows.find((r) => r.id === id)
  if (!hit) return mockFail(`配电房不存在${id}`)
  const refCount = cabinetRows.filter((c) => c.switchingId === id).length
  if (refCount > 0) {
    return mockFail(`该配电房已关联 ${refCount} 个箱柜，不可删除`)
  }
  switchingRows.splice(switchingRows.indexOf(hit), 1)
  return true
}

/** §5.21 新增楼栋（buildingName 唯一；楼栋是能耗链路唯一事实源） */
export function addBuilding(body: { buildingName?: unknown }) {
  const name = typeof body.buildingName === 'string' ? body.buildingName.trim() : ''
  if (!name) return mockFail('楼栋名称不能为空')
  if (buildingRows.some((r) => r.buildingName === name)) return mockFail(`楼栋名称已存在：${name}`)
  const row: BuildingConfig = { id: nextId(buildingRows), buildingName: name }
  buildingRows.push(row)
  return clone(row)
}

/** §5.22 修改楼栋 */
export function renameBuilding(id: number, body: { buildingName?: unknown }) {
  const hit = buildingRows.find((r) => r.id === id)
  if (!hit) return mockFail(`楼栋不存在${id}`)
  const name = typeof body.buildingName === 'string' ? body.buildingName.trim() : ''
  if (!name) return mockFail('楼栋名称不能为空')
  if (buildingRows.some((r) => r.id !== id && r.buildingName === name)) {
    return mockFail(`楼栋名称已存在：${name}`)
  }
  hit.buildingName = name
  return clone(hit)
}

/** §5.23 删除楼栋（有关联箱柜 → code=0；事务三写级联：楼栋+能耗楼栋映射+楼层映射） */
export function deleteBuilding(id: number) {
  const hit = buildingRows.find((r) => r.id === id)
  if (!hit) return mockFail(`楼栋不存在${id}`)
  const refCount = cabinetRows.filter((c) => c.buildingId === id).length
  if (refCount > 0) {
    return mockFail(`该楼栋已关联 ${refCount} 个箱柜，不可删除`)
  }
  buildingRows.splice(buildingRows.indexOf(hit), 1)
  // 契约级联：同事务删能耗楼栋映射与楼层映射（板块内副本一并清理；历史统计行按契约保留）
  for (let i = buildingStatsRows.length - 1; i >= 0; i--) {
    if (buildingStatsRows[i]!.buildingId === id) buildingStatsRows.splice(i, 1)
  }
  for (let i = floorStatsRows.length - 1; i >= 0; i--) {
    if (floorStatsRows[i]!.buildingId === id) floorStatsRows.splice(i, 1)
  }
  return true
}

/* ================= §5.14 修改设备（批次 2；superId=0 解绑/>0 换绑，全量差量） ================= */

export function changeDevice(id: number, body: Record<string, unknown>) {
  const hit = deviceRows.find((d) => d.deviceId === id)
  if (!hit) return mockFail(`设备不存在${id}`)
  if (body.superId != null) {
    const superId = Number(body.superId)
    if (superId === 0) {
      hit.superName = null
    } else {
      const cabinet = cabinetRows.find((c) => c.id === superId)
      if (!cabinet) return mockFail(`箱柜不存在${superId}`)
      hit.superName = cabinet.superName
    }
  }
  if (Array.isArray(body.locationNumbers)) {
    hit.locationNumbers = [...new Set((body.locationNumbers as unknown[]).map((v) => String(v).trim()).filter(Boolean))].sort()
  }
  if (body.enabled === 0 || body.enabled === 1) hit.enabled = body.enabled
  return clone(hit)
}

/* ================= §5.16-5.18 箱柜建档/修改/删除（批次 2） ================= */

/** §5.16 建档：编号全局唯一；新柜默认无配电房、开关 0、健康度 100（契约口径） */
export function addCabinet(body: Record<string, unknown>) {
  const buildingId = Number(body.buildingId)
  const deviceTypeId = Number(body.deviceTypeId)
  const superName = typeof body.superName === 'string' ? body.superName.trim() : ''
  const deviceNumber = typeof body.deviceNumber === 'string' ? body.deviceNumber.trim() : ''
  const commissionDate = typeof body.commissionDate === 'string' && body.commissionDate.trim() ? body.commissionDate.trim() : null
  const building = buildingRows.find((b) => b.id === buildingId)
  if (!building) return mockFail(`楼栋不存在${body.buildingId ?? ''}`)
  const type = deviceTypeRows.find((t) => t.id === deviceTypeId)
  if (!type) return mockFail(`设备类型不存在${body.deviceTypeId ?? ''}`)
  if (!superName) return mockFail('箱柜名称不能为空')
  if (!deviceNumber) return mockFail('设备编号不能为空')
  if (cabinetRows.some((c) => c.deviceNumber === deviceNumber)) return mockFail(`设备编号已存在：${deviceNumber}`)
  const row: CabinetConfig = {
    id: nextId(cabinetRows),
    buildingId,
    buildingName: building.buildingName,
    superName,
    deviceNumber,
    deviceTypeId,
    deviceTypeName: type.name,
    commissionDate,
    switchingId: null,
    switchingName: null,
    status: 0,
    health: 100,
  }
  cabinetRows.push(row)
  // 契约 §5.16 响应 CabinetAdd：不含 status/health/switching（校验层也不接受伪造）
  return {
    id: row.id,
    buildingId: row.buildingId,
    buildingName: row.buildingName,
    superName: row.superName,
    deviceNumber: row.deviceNumber,
    deviceTypeId: row.deviceTypeId,
    deviceTypeName: row.deviceTypeName,
    commissionDate: row.commissionDate,
  }
}

/** §5.17 修改：六字段缺省=保留；编号换号带 warnings 警示；不触碰 status/health */
export function updateCabinet(id: number, body: Record<string, unknown>) {
  const hit = cabinetRows.find((c) => c.id === id)
  if (!hit) return mockFail(`箱柜不存在${id}`)
  const warnings: string[] = []
  if (body.buildingId != null) {
    const building = buildingRows.find((b) => b.id === Number(body.buildingId))
    if (!building) return mockFail(`楼栋不存在${body.buildingId}`)
    hit.buildingId = building.id
    hit.buildingName = building.buildingName
  }
  if (body.superName != null) {
    const name = String(body.superName).trim()
    if (!name) return mockFail('箱柜名称不能为空')
    hit.superName = name
  }
  if (body.deviceNumber != null) {
    const deviceNumber = String(body.deviceNumber).trim()
    if (!deviceNumber) return mockFail('设备编号不能为空')
    if (cabinetRows.some((c) => c.id !== id && c.deviceNumber === deviceNumber)) {
      return mockFail(`设备编号已存在：${deviceNumber}`)
    }
    if (hit.deviceNumber !== deviceNumber) {
      warnings.push(`设备编号已变更，历史巡检/缺陷记录仍按原编号（${hit.deviceNumber ?? '—'}）关联，按新编号查询将不含变更前记录`)
    }
    hit.deviceNumber = deviceNumber
  }
  if (body.deviceTypeId != null) {
    const type = deviceTypeRows.find((t) => t.id === Number(body.deviceTypeId))
    if (!type) return mockFail(`设备类型不存在${body.deviceTypeId}`)
    hit.deviceTypeId = type.id
    hit.deviceTypeName = type.name
  }
  if (body.commissionDate != null) {
    hit.commissionDate = String(body.commissionDate).trim() || null
  }
  if (body.switchingId != null) {
    const switching = switchingRows.find((s) => s.id === Number(body.switchingId))
    if (!switching) return mockFail(`配电房不存在${body.switchingId}`)
    hit.switchingId = switching.id
    hit.switchingName = switching.switchingName
  }
  return { ...clone(hit), warnings }
}

/** §5.18 删除：箱柜下仍有关联测点设备（板块内按 superName 关联）→ code=0 列出数量 */
export function deleteCabinet(id: number) {
  const hit = cabinetRows.find((c) => c.id === id)
  if (!hit) return mockFail(`箱柜不存在${id}`)
  const refCount = deviceRows.filter((d) => d.superName === hit.superName).length
  if (refCount > 0) return mockFail(`该箱柜下仍有 ${refCount} 台测点设备，不可删除`)
  cabinetRows.splice(cabinetRows.indexOf(hit), 1)
  return true
}

/* ================= §7.1-7.4 健康度评估链路（批次 2） =================
 * 模板按设备类型名称精确匹配；autoPreview 按投运年限/设计寿命比率预计算；
 * 提交计算 HI 并同事务回写箱柜 health + 落历史（种子评估也走同一计算路径，数值自洽）。
 * 约定：模块内校验失败抛 Error(用户文案)，导出函数统一 catch 转成 mockFail 返回
 * （mockAdapter 只认返回值里的 mockFail 标记，throw 会丢文案）。 */

/** 评估历史存储行（契约字段 + 内部快照字段） */
interface AssessmentStoreRow {
  record: HealthAssessmentRecord
  /** 提交时设备类型快照（7.3 按类型筛选用） */
  deviceTypeId: number
  dimensions: HealthAssessmentDetail['dimensions']
  items: HealthAssessmentDetail['items']
}

const assessmentRows: AssessmentStoreRow[] = []
const GRADE_DEDUCTION: Record<HealthGrade, number> = { 正常: 0, 注意: 20, 异常: 50, 严重: 100 }
const GRADES: HealthGrade[] = ['正常', '注意', '异常', '严重']
/** §7.6.4 自动评分项固定编码（与 views/composables/templateTree 的 AUTO_ITEM_CODE 同源约定） */
const AUTO_ITEM_CODE = 'dim6_service_life'

function formatNow(): string {
  const d = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

function mockAssessor(): { id: string; name: string } {
  try {
    const raw = localStorage.getItem('bz_auth_user')
    const user = raw ? (JSON.parse(raw) as { id?: number; name?: string; account?: string }) : null
    return { id: user?.id != null ? String(user.id) : '0', name: user?.name || user?.account || '评估人' }
  } catch {
    return { id: '0', name: '评估人' }
  }
}

function healthLevelOf(value: number): string {
  return value >= 85 ? '优秀' : value >= 70 ? '良好' : value >= 50 ? '一般' : value >= 30 ? '较差' : '极差'
}

/** 按箱柜类型精确匹配模板；空壳模板按契约防御口径报「至少需要配置 1 个维度」 */
function findTemplateForCabinet(cabinet: CabinetConfig): HealthTemplateTree | null {
  const template = healthTemplateRows.find((t) => t.typeName === cabinet.deviceTypeName) ?? null
  if (template && !template.dimensions.length) {
    throw new Error('模板配置数据异常：至少需要配置 1 个维度')
  }
  return template
}

function yearsUsedSince(dateStr: string | null): number | null {
  if (!dateStr) return null
  const then = new Date(`${dateStr}T00:00:00`)
  if (Number.isNaN(then.getTime())) return null
  return (Date.now() - then.getTime()) / (365.25 * 24 * 3600 * 1000)
}

/** §7.1 运行年限自动项预计算（比率 <50% 正常 / <80% 注意 / <100% 异常 / ≥100% 严重）；无自动项返回 null */
function computeAutoPreview(cabinet: CabinetConfig, template: HealthTemplateTree) {
  const autoItem = template.dimensions
    .flatMap((d) => d.items)
    .find((item) => item.autoCalculated)
  if (!autoItem) return null
  const years = yearsUsedSince(cabinet.commissionDate)
  let grade: HealthGrade = '正常'
  let autoDetail: string
  if (years == null) {
    autoDetail = '投运日期未维护，自动项按正常评定'
  } else {
    const ratio = years / template.designLifeYears
    grade = ratio < 0.5 ? '正常' : ratio < 0.8 ? '注意' : ratio < 1 ? '异常' : '严重'
    autoDetail = `投运 ${cabinet.commissionDate}，已使用 ${years.toFixed(1)} 年 / 设计寿命 ${template.designLifeYears} 年 = ${(ratio * 100).toFixed(1)}%，评定：${grade}`
  }
  return { itemCode: autoItem.code, itemName: autoItem.name, grade, autoDetail }
}

function stripTemplateTree(template: HealthTemplateTree) {
  return template.dimensions.map((d) => ({
    no: d.no,
    name: d.name,
    weightPercent: d.weightPercent,
    items: d.items.map((i) => ({
      code: i.code,
      name: i.name,
      subWeight: i.subWeight,
      normal: i.normal,
      attention: i.attention,
      abnormal: i.abnormal,
      severe: i.severe,
      autoCalculated: i.autoCalculated,
    })),
  }))
}

/** §7.1 按箱柜查询评估模板（类型不支持/箱柜不存在 → code=0 文案） */
export function getAssessmentTemplate(cabinetId: number): HealthAssessTemplate | ReturnType<typeof mockFail> {
  try {
    const cabinet = cabinetRows.find((c) => c.id === cabinetId)
    if (!cabinet) return mockFail(`箱柜不存在${cabinetId}`)
    const template = findTemplateForCabinet(cabinet)
    if (!template) return mockFail(`设备类型「${cabinet.deviceTypeName ?? '未知'}」未配置评估模板`)
    const autoPreview = computeAutoPreview(cabinet, template)
    if (!autoPreview) return mockFail('模板缺少自动评分项，无法评估')
    return {
      cabinetId: cabinet.id,
      cabinetName: cabinet.superName,
      cabinetNumber: cabinet.deviceNumber ?? '',
      deviceTypeName: cabinet.deviceTypeName ?? '',
      templateCode: template.code,
      templateName: template.typeName,
      dimensions: stripTemplateTree(template),
      autoPreview,
    }
  } catch (e) {
    return mockFail(e instanceof Error ? e.message : '评估模板查询失败')
  }
}

/**
 * 评估核心：校验 + 计算 + 回写 + 落历史（正式提交与种子记录共用此路径）。
 * 手工项必须恰好覆盖模板全部手工项；自动项不可提交；等级白名单。失败抛 Error。
 */
function runAssessment(
  cabinet: CabinetConfig,
  template: HealthTemplateTree,
  submitted: { code?: unknown; grade?: unknown }[],
  remark: string | null,
  meta: { id: number; createdAt: string; assessorId: string; assessorName: string },
): AssessmentStoreRow {
  const autoPreview = computeAutoPreview(cabinet, template)
  if (!autoPreview) throw new Error('模板缺少自动评分项，无法评估')
  const seen = new Set<string>()
  const gradeByCode = new Map<string, HealthGrade>()
  for (const item of submitted) {
    const code = typeof item.code === 'string' ? item.code.trim() : ''
    if (!code) throw new Error('评估项为空')
    if (code === AUTO_ITEM_CODE) throw new Error(`评分项 ${code} 为自动计算项，无需提交`)
    const templateItem = template.dimensions.flatMap((d) => d.items).find((i) => i.code === code)
    if (!templateItem) throw new Error(`评分项 ${code} 不在模板内`)
    if (seen.has(code)) throw new Error(`评分项 ${code} 重复提交`)
    seen.add(code)
    if (typeof item.grade !== 'string' || !GRADES.includes(item.grade as HealthGrade)) {
      throw new Error(`评分项 ${code} 的评定等级非法`)
    }
    gradeByCode.set(code, item.grade as HealthGrade)
  }
  for (const dimension of template.dimensions) {
    for (const item of dimension.items) {
      if (item.autoCalculated) continue
      if (!gradeByCode.has(item.code)) throw new Error(`缺少评分项 ${item.code} 的评定`)
    }
  }

  // 计算：维度得分 = Σ(子权重×扣分)；HI = 100 − Σ(维度权重%×维度得分)；healthValue 取整
  const dimensionsResult: HealthAssessmentDetail['dimensions'] = []
  const itemsResult: HealthAssessmentDetail['items'] = []
  let deductionSum = 0
  let itemId = meta.id * 100
  for (const dimension of [...template.dimensions].sort((a, b) => a.no - b.no)) {
    let dimensionScore = 0
    for (const item of dimension.items) {
      const auto = item.autoCalculated
      const grade = auto ? autoPreview.grade : gradeByCode.get(item.code)!
      const deduction = GRADE_DEDUCTION[grade]
      dimensionScore += item.subWeight * deduction
      itemId += 1
      itemsResult.push({
        id: itemId,
        assessmentId: meta.id,
        itemCode: item.code,
        itemName: item.name,
        dimensionNo: dimension.no,
        subWeight: item.subWeight,
        grade,
        deduction,
        autoCalculated: auto,
        autoDetail: auto ? autoPreview.autoDetail : null,
      })
    }
    dimensionsResult.push({
      no: dimension.no,
      name: dimension.name,
      weightPercent: dimension.weightPercent,
      score: Number(dimensionScore.toFixed(1)),
    })
    deductionSum += (dimension.weightPercent / 100) * dimensionScore
  }
  const hiScore = Number((100 - deductionSum).toFixed(1))
  const healthValue = Math.round(hiScore)

  // 提交即生效：同事务回写箱柜 health（契约 §7.2）+ 落历史
  cabinet.health = healthValue
  const record: HealthAssessmentRecord = {
    id: meta.id,
    cabinetId: cabinet.id,
    cabinetName: cabinet.superName,
    cabinetNumber: cabinet.deviceNumber ?? '',
    templateCode: template.code,
    deviceTypeName: cabinet.deviceTypeName ?? '',
    hiScore,
    healthValue,
    assessorId: meta.assessorId,
    assessorName: meta.assessorName,
    remark,
    createdAt: meta.createdAt,
  }
  const row: AssessmentStoreRow = {
    record,
    deviceTypeId: cabinet.deviceTypeId ?? 0,
    dimensions: dimensionsResult,
    items: itemsResult,
  }
  assessmentRows.push(row)
  return row
}

/** §7.2 提交评估 */
export function submitAssessment(body: Record<string, unknown>): HealthAssessmentResult | ReturnType<typeof mockFail> {
  try {
    const cabinetId = Number(body.cabinetId)
    const cabinet = cabinetRows.find((c) => c.id === cabinetId)
    if (!cabinet) return mockFail(`箱柜不存在${body.cabinetId ?? ''}`)
    const template = findTemplateForCabinet(cabinet)
    if (!template) return mockFail(`设备类型「${cabinet.deviceTypeName ?? '未知'}」未配置评估模板`)
    const submitted = Array.isArray(body.items) ? (body.items as { code?: unknown; grade?: unknown }[]) : []
    const remark = typeof body.remark === 'string' && body.remark.trim() ? body.remark.trim() : null
    const assessor = mockAssessor()
    const nextId = assessmentRows.reduce((max, r) => Math.max(max, r.record.id), 0) + 1
    const { record, dimensions, items } = runAssessment(cabinet, template, submitted, remark, {
      id: nextId,
      createdAt: formatNow(),
      assessorId: assessor.id,
      assessorName: assessor.name,
    })
    return {
      assessmentId: record.id,
      cabinetId: record.cabinetId,
      cabinetName: record.cabinetName,
      dimensions: dimensions.map(({ no, name, weightPercent, score }) => ({ no, name, weightPercent, score })),
      items: items.map(({ itemCode, itemName, dimensionNo, grade, deduction, autoCalculated, autoDetail }) => ({
        code: itemCode,
        itemName,
        dimensionNo,
        grade,
        deduction,
        autoCalculated,
        autoDetail,
      })),
      hiScore: record.hiScore,
      // runAssessment 写入的必为数字（7.3 契约的 null 容忍仅针对 join 缺失场景）
      healthValue: record.healthValue!,
      healthLevel: healthLevelOf(record.healthValue!),
    }
  } catch (e) {
    return mockFail(e instanceof Error ? e.message : '评估提交失败')
  }
}

/** §7.3 评估历史分页（评估时间倒序；cabinetId/deviceTypeId 可叠加筛选） */
export function fetchAssessmentRecords(query: Record<string, string>): { total: number; rows: HealthAssessmentRecord[] } {
  const cabinetId = query.cabinetId ? Number(query.cabinetId) : null
  const deviceTypeId = query.deviceTypeId ? Number(query.deviceTypeId) : null
  const page = query.page ? Number(query.page) : 1
  const pageSize = query.pageSize ? Number(query.pageSize) : 12
  const filtered = [...assessmentRows]
    .filter((row) => (cabinetId == null || row.record.cabinetId === cabinetId)
      && (deviceTypeId == null || row.deviceTypeId === deviceTypeId))
    .sort((a, b) => b.record.createdAt.localeCompare(a.record.createdAt))
  const start = (page - 1) * pageSize
  return { total: filtered.length, rows: filtered.slice(start, start + pageSize).map((row) => clone(row.record)) }
}

/** §7.4 评估详情（提交时整表快照，可完整重放） */
export function fetchAssessmentDetail(id: number): HealthAssessmentDetail | ReturnType<typeof mockFail> {
  const row = assessmentRows.find((r) => r.record.id === id)
  if (!row) return mockFail(`评估记录不存在${id}`)
  return { assessment: clone(row.record), dimensions: clone(row.dimensions), items: clone(row.items) }
}

// ---- 种子评估历史（走 runAssessment 同一计算路径；提交即回写箱柜 health，种子自洽） ----
function seedAssessment(id: number, cabinetId: number, grades: Record<string, string>, remark: string | null, createdAt: string) {
  const cabinet = cabinetRows.find((c) => c.id === cabinetId)
  const template = cabinet ? findTemplateForCabinet(cabinet) : null
  if (!cabinet || !template) return
  runAssessment(cabinet, template, Object.entries(grades).map(([code, grade]) => ({ code, grade })), remark, {
    id,
    createdAt,
    assessorId: '1',
    assessorName: '宝安运维员',
  })
}
// 箱柜 2（1#变 1AA4馈线柜）：柜温异常档 → HI 88.0
seedAssessment(1, 2, { dim1_rust: '正常', dim1_label: '正常', dim2_temp: '异常', dim2_noise: '正常' }, '季度评估', '2026-11-20 10:15:00')
// 箱柜 6（2#变 2AA2馈线柜）：锈蚀严重档 → HI 62.3
seedAssessment(2, 6, { dim1_rust: '严重', dim1_label: '异常', dim2_temp: '异常', dim2_noise: '注意' }, null, '2026-11-22 16:40:00')

/* ================= §7.6.3-7.6.6 健康度模板 CRUD（批次 3） =================
 * 编码与设备类型名称库内唯一；整树保存按五规则强校验（失败 code=0 带实际值定位，
 * 任一不满足整体拒收）；自动项四档文案可留空（与客户端预检豁免口径一致）。
 * 约定同评估链路：内部抛 Error(用户文案)，导出函数 catch 转 mockFail 返回。 */

function str2(v: unknown): string {
  return typeof v === 'string' ? v.trim() : ''
}

function throwIf(bool: boolean, message: string) {
  if (bool) throw new Error(message)
}

/** §7.6.5 整树强校验（规则与文案对齐契约表 + 带实际值定位）；校验过的维度原样返回（落库前再补 id） */
function validateTreeDimensions(raw: unknown): HealthTemplateTree['dimensions'] {
  if (!Array.isArray(raw)) throw new Error('模板配置数据异常：维度数据必须是数组')
  if (!raw.length) throw new Error('模板配置数据异常：至少需要配置 1 个维度')
  const dims: HealthTemplateTree['dimensions'] = []
  const seenNo = new Set<number>()
  const seenCode = new Set<string>()
  let autoCount = 0
  let weightSum = 0
  for (const rawDim of raw) {
    const d = (rawDim ?? {}) as Record<string, unknown>
    const no = Number(d.no)
    const name = str2(d.name)
    const weightPercent = Number(d.weightPercent)
    const dimName = name || `维度${no}`
    throwIf(!Number.isSafeInteger(no) || no < 1, `维度序号必须为正整数：${d.no ?? '缺省'}`)
    throwIf(seenNo.has(no), `维度序号重复：${no}`)
    seenNo.add(no)
    throwIf(!name, `维度「${dimName}」的名称不能为空`)
    throwIf(name.length > 64, `维度「${dimName}」的名称不能超过 64 字符`)
    throwIf(!Number.isFinite(weightPercent) || weightPercent < 0, `维度「${dimName}」的权重必须为非负数字`)
    if (!Array.isArray(d.items) || !d.items.length) throw new Error(`维度「${dimName}」至少需要配置 1 个评分项`)
    const items: HealthTemplateTree['dimensions'][number]['items'] = []
    let subSum = 0
    for (const rawItem of d.items as Record<string, unknown>[]) {
      const i = (rawItem ?? {}) as Record<string, unknown>
      const code = str2(i.code)
      const itemName = str2(i.name)
      const subWeight = Number(i.subWeight)
      const auto = i.autoCalculated === true
      throwIf(!code, `维度「${dimName}」存在未填写编码的评分项`)
      throwIf(code.length > 32, `评分项编码「${code}」不能超过 32 字符`)
      throwIf(seenCode.has(code), `评分项编码重复：${code}`)
      seenCode.add(code)
      throwIf(!itemName, `维度「${dimName}」评分项「${itemName || code}」的名称不能为空`)
      throwIf(itemName.length > 64, `评分项「${itemName}」的名称不能超过 64 字符`)
      throwIf(!Number.isFinite(subWeight) || subWeight <= 0, `维度「${dimName}」评分项「${itemName}」的子权重必须大于 0`)
      if (auto) {
        autoCount += 1
        throwIf(autoCount > 1, '自动评分项每模板至多 1 个')
        throwIf(code !== AUTO_ITEM_CODE, `自动评分项编码固定为 ${AUTO_ITEM_CODE}`)
      } else {
        // 四档判定文案：手工项必填（≤255）；自动项豁免可留空
        for (const [label, key] of [['正常', 'normal'], ['注意', 'attention'], ['异常', 'abnormal'], ['严重', 'severe']] as const) {
          const text = typeof i[key] === 'string' ? (i[key] as string).trim() : ''
          throwIf(!text, `维度「${dimName}」评分项「${itemName}」的「${label}」判定文案不能为空`)
          throwIf(text.length > 255, `评分项「${itemName}」的「${label}」判定文案不能超过 255 字符`)
        }
      }
      subSum += subWeight
      items.push({
        code,
        name: itemName,
        subWeight,
        normal: str2(i.normal),
        attention: str2(i.attention),
        abnormal: str2(i.abnormal),
        severe: str2(i.severe),
        autoCalculated: auto,
      })
    }
    throwIf(Math.abs(subSum - 1) > 1e-6, `维度「${dimName}」的评分项权重之和必须等于 1，实际为 ${Number(subSum.toFixed(4))}，不允许保存`)
    weightSum += weightPercent
    dims.push({ no, name, weightPercent, items })
  }
  throwIf(Math.abs(weightSum - 100) > 1e-6, `维度权重之和必须等于 100，实际为 ${Number(weightSum.toFixed(2))}，不允许保存`)
  return dims
}

/** §7.6.3 新增模板壳（编码/设备类型名称库内唯一）；返回整树（空壳 dimensions=[]，汇总由前端推导） */
export function addHealthTemplateRow(body: Record<string, unknown>): HealthTemplateTree | ReturnType<typeof mockFail> {
  try {
    const code = str2(body.code)
    const typeName = str2(body.typeName)
    const life = Number(body.designLifeYears)
    throwIf(!code, '请输入模板编码')
    throwIf(!typeName, '请输入匹配的设备类型名称')
    throwIf(!Number.isSafeInteger(life) || life < 1, '设计寿命必须为 ≥1 的整数（年）')
    throwIf(healthTemplateRows.some((t) => t.code === code), `模板编码已存在：${code}`)
    throwIf(healthTemplateRows.some((t) => t.typeName === typeName), `设备类型「${typeName}」已配置模板`)
    const row: HealthTemplateTree = {
      id: healthTemplateRows.reduce((max, t) => Math.max(max, t.id), 0) + 1,
      code,
      typeName,
      designLifeYears: life,
      createdAt: formatNow(),
      dimensionCount: 0,
      itemCount: 0,
      weightSum: 0,
      dimensions: [],
    }
    healthTemplateRows.push(row)
    return clone(row)
  } catch (e) {
    return mockFail(e instanceof Error ? e.message : '模板创建失败')
  }
}

/** §7.6.4 修改壳（唯一性排除自身），返回整树 */
export function updateHealthTemplateRow(id: number, body: Record<string, unknown>): HealthTemplateTree | ReturnType<typeof mockFail> {
  try {
    const hit = healthTemplateRows.find((t) => t.id === id)
    if (!hit) return mockFail(`模板不存在${id}`)
    const code = str2(body.code)
    const typeName = str2(body.typeName)
    const life = Number(body.designLifeYears)
    throwIf(!code, '请输入模板编码')
    throwIf(!typeName, '请输入匹配的设备类型名称')
    throwIf(!Number.isSafeInteger(life) || life < 1, '设计寿命必须为 ≥1 的整数（年）')
    throwIf(healthTemplateRows.some((t) => t.id !== id && t.code === code), `模板编码已存在：${code}`)
    throwIf(healthTemplateRows.some((t) => t.id !== id && t.typeName === typeName), `设备类型「${typeName}」已配置模板`)
    hit.code = code
    hit.typeName = typeName
    hit.designLifeYears = life
    return clone(hit)
  } catch (e) {
    return mockFail(e instanceof Error ? e.message : '模板保存失败')
  }
}

/** §7.6.5 整树保存（全量替换；保存体无 id，落库补 id；强校验不过整体拒收零写库） */
export function saveHealthTemplateTreeRow(id: number, body: Record<string, unknown>): HealthTemplateTree | ReturnType<typeof mockFail> {
  try {
    const hit = healthTemplateRows.find((t) => t.id === id)
    if (!hit) return mockFail(`模板不存在${id}`)
    const dimensions = validateTreeDimensions(body.dimensions)
    // 全量替换 + 补 id（维度/评分项；评估历史靠明细快照自包含，不受替换影响）
    let itemId = id * 1000
    hit.dimensions = dimensions.map((d) => ({
      id: d.no * 10 + id,
      no: d.no,
      name: d.name,
      weightPercent: d.weightPercent,
      items: d.items.map((i) => ({ ...i, id: (itemId += 1) })),
    }))
    hit.dimensionCount = hit.dimensions.length
    hit.itemCount = hit.dimensions.reduce((sum, d) => sum + d.items.length, 0)
    hit.weightSum = Number(hit.dimensions.reduce((sum, d) => sum + d.weightPercent, 0).toFixed(2))
    return clone(hit)
  } catch (e) {
    return mockFail(e instanceof Error ? e.message : '模板保存失败')
  }
}

/** §7.6.6 删除模板（级联删维度与评分项；评估历史靠快照自包含不受影响） */
export function deleteHealthTemplateRow(id: number): boolean | ReturnType<typeof mockFail> {
  const hit = healthTemplateRows.find((t) => t.id === id)
  if (!hit) return mockFail(`模板不存在${id}`)
  healthTemplateRows.splice(healthTemplateRows.indexOf(hit), 1)
  return true
}

/* ================= §5.25-5.28 楼栋能耗统计写链路（随 5.26/5.27 契约变更提前实现，2026-11-24） =================
 * 契约变更：§5.26/§5.27 body 的 buildingId 变必填（缺省 code=0「楼栋ID不能为空」）；
 * 设备唯一性从「全院一设备一行」改为「一楼栋一设备一行」，重复文案「该设备在该楼栋已存在」。 */
import { isMockFail } from '../mockFail'

const sentinelBuildingName = '全院'

function parseRequiredBuildingId(body: Record<string, unknown>): number | ReturnType<typeof mockFail> {
  const raw = body.buildingId
  if (raw === undefined || raw === null || raw === '') return mockFail('楼栋ID不能为空')
  const buildingId = Number(raw)
  if (!Number.isSafeInteger(buildingId) || buildingId < 0) return mockFail(`楼栋ID不合法：${String(raw)}`)
  return buildingId
}

function resolveStatsDevice(body: Record<string, unknown>, buildingId: number, buildingName: string): BuildingStatsDevice | ReturnType<typeof mockFail> {
  const deviceId = Number(body.deviceId)
  // 文案口径（2026-11-24 用户拍板）：不存在设备id为{用户输入}的设备
  if (!Number.isSafeInteger(deviceId) || deviceId <= 0) return mockFail(`不存在设备id为${String(body.deviceId ?? '')}的设备`)
  const device = deviceRows.find((d) => d.deviceId === deviceId)
  if (!device) return mockFail(`不存在设备id为${deviceId}的设备`)
  // 返回完整行形状（coefficient/buildingId 由调用方覆盖），避免部分形状混入成功响应
  return { buildingId, buildingName, deviceId, channelId: device.channelId, coefficient: 1 }
}

function parseCoefficient(body: Record<string, unknown>): 1 | -1 | ReturnType<typeof mockFail> {
  const coefficient = Number(body.coefficient)
  if (coefficient !== 1 && coefficient !== -1) return mockFail('统计方式非法（仅累加 1 / 扣减 -1）')
  return coefficient
}

/** §5.25 新增楼栋统计映射（通道自动填充；同楼栋内设备唯一） */
export function addBuildingStatsRow(body: Record<string, unknown>): BuildingStatsDevice | ReturnType<typeof mockFail> {
  const buildingId = Number(body.buildingId)
  if (!Number.isSafeInteger(buildingId) || buildingId <= 0) return mockFail(`楼栋不存在${body.buildingId ?? ''}`)
  const building = buildingRows.find((b) => b.id === buildingId)
  if (!building) return mockFail(`楼栋不存在${buildingId}`)
  const row = resolveStatsDevice(body, buildingId, building.buildingName)
  if (isMockFail(row)) return row
  const coefficient = parseCoefficient(body)
  if (isMockFail(coefficient)) return coefficient
  if (buildingStatsRows.some((r) => r.buildingId === buildingId && r.deviceId === row.deviceId)) {
    return mockFail('该设备在该楼栋已存在')
  }
  row.coefficient = coefficient
  buildingStatsRows.push(row)
  return clone(row)
}

/** §5.28 新增全院哨兵行（buildingId=0 固定；哨兵行内设备唯一） */
export function addSentinelStatsRow(body: Record<string, unknown>): BuildingStatsDevice | ReturnType<typeof mockFail> {
  const row = resolveStatsDevice(body, 0, sentinelBuildingName)
  if (isMockFail(row)) return row
  const coefficient = parseCoefficient(body)
  if (isMockFail(coefficient)) return coefficient
  if (buildingStatsRows.some((r) => r.buildingId === 0 && r.deviceId === row.deviceId)) {
    return mockFail('该设备在全院统计已存在')
  }
  row.coefficient = coefficient
  buildingStatsRows.push(row)
  return clone(row)
}

/** §5.26 修改统计方式（body buildingId 必填；按 楼栋+设备 定位映射行，仅 coefficient 可改） */
export function updateBuildingStatsRow(deviceId: number, body: Record<string, unknown>): BuildingStatsDevice | ReturnType<typeof mockFail> {
  const buildingId = parseRequiredBuildingId(body)
  if (isMockFail(buildingId)) return buildingId
  const coefficient = parseCoefficient(body)
  if (isMockFail(coefficient)) return coefficient
  const hit = buildingStatsRows.find((r) => r.deviceId === deviceId && r.buildingId === buildingId)
  if (!hit) return mockFail('该设备在该楼栋不存在统计映射')
  hit.coefficient = coefficient
  return clone(hit)
}

/** §5.27 删除映射（body buildingId 必填；按 楼栋+设备 定位） */
export function deleteBuildingStatsRow(deviceId: number, body: Record<string, unknown>): boolean | ReturnType<typeof mockFail> {
  const buildingId = parseRequiredBuildingId(body)
  if (isMockFail(buildingId)) return buildingId
  const idx = buildingStatsRows.findIndex((r) => r.deviceId === deviceId && r.buildingId === buildingId)
  if (idx === -1) return mockFail('该设备在该楼栋不存在统计映射')
  buildingStatsRows.splice(idx, 1)
  return true
}

/* ================= §5.29-5.32 楼层统计写链路（批次 4） =================
 * (楼栋,楼层) 唯一；§5.31 devices 空数组=清空；§5.32 两步删除——须先 §5.31 清空才允许删。
 * 楼层口径 G/数字/负数；楼栋须为维度表真实楼栋（不支持 0 全院）。 */

function normalizeFloor(floorRaw: unknown): string {
  return String(floorRaw ?? '').trim().toUpperCase()
}

function isLegalFloor(floor: string): boolean {
  return /^(G|-?\d+)$/.test(floor)
}

function findFloorGroup(buildingId: number, floor: string): FloorStatsGroup | null {
  return floorStatsRows.find((r) => r.buildingId === buildingId && r.floor === floor) ?? null
}

function parseFloorDevices(raw: unknown): FloorStatsGroup['devices'] | ReturnType<typeof mockFail> {
  if (!Array.isArray(raw)) return mockFail('测点组数据必须是数组')
  const devices: FloorStatsGroup['devices'] = []
  const seen = new Set<number>()
  for (const item of raw as Record<string, unknown>[]) {
    const deviceId = Number(item.deviceId)
    const coefficient = Number(item.coefficient)
    if (!Number.isSafeInteger(deviceId) || deviceId <= 0) return mockFail('测点 ID 必须为正整数')
    if (seen.has(deviceId)) return mockFail(`测点 ${deviceId} 在同一组内重复`)
    if (coefficient !== 1 && coefficient !== -1) return mockFail(`测点 ${deviceId} 的统计方式非法`)
    seen.add(deviceId)
    devices.push({ deviceId, coefficient: coefficient as 1 | -1 })
  }
  return devices
}

/** §5.30 新增测点组（(楼栋,楼层) 唯一；至少 1 个测点） */
export function addFloorStatsRow(body: Record<string, unknown>): FloorStatsGroup | ReturnType<typeof mockFail> {
  const buildingId = Number(body.buildingId)
  if (!Number.isSafeInteger(buildingId) || buildingId <= 0) return mockFail(`楼栋不存在${body.buildingId ?? ''}`)
  const building = buildingRows.find((b) => b.id === buildingId)
  if (!building) return mockFail(`楼栋不存在${buildingId}`)
  const floor = normalizeFloor(body.floor)
  if (!isLegalFloor(floor)) return mockFail(`楼层格式不合法：${String(body.floor ?? '')}（应为 G、数字或负数）`)
  if (findFloorGroup(buildingId, floor)) return mockFail(`${building.buildingName} ${floor} 层已存在测点组`)
  const devices = parseFloorDevices(body.devices)
  if (isMockFail(devices)) return devices
  if (!devices.length) return mockFail('测点组至少需要 1 个测点')
  const row: FloorStatsGroup = { buildingId, buildingName: building.buildingName, floor, devices }
  floorStatsRows.push(row)
  return clone(row)
}

/** §5.31 修改测点组（devices 全量差量）。
 * 宝安口径（2026-11-24 用户拍板）：数据库不允许空测点组存在，空数组=清空即整组删除
 * （返回被删组形状 devices=[]）；§5.32 由此成为摆设，前端不再调用，仅保留契约对齐。 */
export function updateFloorStatsRow(buildingId: number, floorRaw: unknown, body: Record<string, unknown>): FloorStatsGroup | ReturnType<typeof mockFail> {
  const floor = normalizeFloor(floorRaw)
  const hit = findFloorGroup(buildingId, floor)
  if (!hit) return mockFail(`${buildingId} ${floor} 层不存在测点组`)
  const devices = parseFloorDevices(body.devices)
  if (isMockFail(devices)) return devices
  if (!devices.length) {
    // 清空即整组删除（数据库不允许空测点组）
    floorStatsRows.splice(floorStatsRows.indexOf(hit), 1)
    return clone({ ...hit, devices: [] })
  }
  hit.devices = devices
  return clone(hit)
}

/** §5.32 删除测点组——前端已改为一步清空删除（见 §5.31 空数组口径），本接口仅保留
 * 契约对齐、不再被前端调用；语义维持两步协议：组内仍有测点 → code=0。 */
export function deleteFloorStatsRow(buildingId: number, floorRaw: unknown): boolean | ReturnType<typeof mockFail> {
  const floor = normalizeFloor(floorRaw)
  const hit = findFloorGroup(buildingId, floor)
  if (!hit) return mockFail(`${buildingId} ${floor} 层不存在测点组`)
  if (hit.devices.length) return mockFail('测点组尚未清空，请先执行清空操作')
  floorStatsRows.splice(floorStatsRows.indexOf(hit), 1)
  return true
}

/* ================= §5.34-5.36 数据类型写链路（批次 4） =================
 * typeCode/dataId 唯一；§5.35 端点为 POST /data-types/{id}（非 /rename），字段缺省=保留、
 * remark 空串=清除；§5.36 删除成功返回 data:null（复刻 BUG-013，api 层 deleteConfig 已放行）。 */

/** §5.34 新增数据类型 */
export function addDataTypeRow(body: Record<string, unknown>): CetDataType | ReturnType<typeof mockFail> {
  try {
    const typeCode = str2(body.typeCode)
    const typeName = str2(body.typeName)
    const dataId = Number(body.dataId)
    const remark = str2(body.remark)
    throwIf(!typeCode, '类型编码不能为空')
    throwIf(typeCode.length > 32, '类型编码不能超过 32 字符')
    throwIf(CET_DATA_TYPES.some((t) => t.typeCode === typeCode), `类型编码已存在：${typeCode}`)
    throwIf(!typeName, '类型名称不能为空')
    throwIf(typeName.length > 64, '类型名称不能超过 64 字符')
    throwIf(!Number.isSafeInteger(dataId) || dataId < 1, 'DataID 必须为正整数')
    throwIf(CET_DATA_TYPES.some((t) => t.dataId === dataId), `DataID 已存在：${dataId}`)
    throwIf(remark.length > 255, '备注不能超过 255 字符')
    const row: CetDataType = {
      id: CET_DATA_TYPES.reduce((max, t) => Math.max(max, t.id), 0) + 1,
      typeCode,
      typeName,
      dataId,
      remark: remark || null,
    }
    CET_DATA_TYPES.push(row)
    return clone(row)
  } catch (e) {
    return mockFail(e instanceof Error ? e.message : '数据类型创建失败')
  }
}

/** §5.35 修改数据类型（字段缺省=保留原值；remark 空串=清除；唯一性排除自身） */
export function updateDataTypeRow(id: number, body: Record<string, unknown>): CetDataType | ReturnType<typeof mockFail> {
  try {
    const hit = CET_DATA_TYPES.find((t) => t.id === id)
    if (!hit) return mockFail(`数据类型不存在${id}`)
    if (body.typeCode !== undefined) {
      const typeCode = str2(body.typeCode)
      throwIf(!typeCode, '类型编码不能为空')
      throwIf(typeCode.length > 32, '类型编码不能超过 32 字符')
      throwIf(CET_DATA_TYPES.some((t) => t.id !== id && t.typeCode === typeCode), `类型编码已存在：${typeCode}`)
      hit.typeCode = typeCode
    }
    if (body.typeName !== undefined) {
      const typeName = str2(body.typeName)
      throwIf(!typeName, '类型名称不能为空')
      throwIf(typeName.length > 64, '类型名称不能超过 64 字符')
      hit.typeName = typeName
    }
    if (body.dataId !== undefined) {
      const dataId = Number(body.dataId)
      throwIf(!Number.isSafeInteger(dataId) || dataId < 1, 'DataID 必须为正整数')
      throwIf(CET_DATA_TYPES.some((t) => t.id !== id && t.dataId === dataId), `DataID 已存在：${dataId}`)
      hit.dataId = dataId
    }
    if (body.remark !== undefined) hit.remark = str2(body.remark) || null
    return clone(hit)
  } catch (e) {
    return mockFail(e instanceof Error ? e.message : '数据类型保存失败')
  }
}

/** §5.36 删除数据类型（无引用校验；成功返回 null 复刻 BUG-013） */
export function deleteDataTypeRow(id: number): null | ReturnType<typeof mockFail> {
  const hit = CET_DATA_TYPES.find((t) => t.id === id)
  if (!hit) return mockFail(`数据类型不存在${id}`)
  CET_DATA_TYPES.splice(CET_DATA_TYPES.indexOf(hit), 1)
  return null
}
