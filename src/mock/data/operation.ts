/**
 * §4.1 巡检记录 / §4.2 缺陷记录（假数据，docs/FY-Hospital-API.md）。
 * mock 台账里只有 P01/T1 进线柜（BZ000021）与 P02/T1 电容柜（BZ000022）带真实 devCode
 * （power-rooms.json），其余柜编号为生成的 BZ7xxxxx —— 维护/缺陷记录只挂这两台真实编号柜，
 * 其余柜走空态；联调切真后被草料落库数据覆盖。
 * 时间用固定字符串（不用 now() 推移），保证单测与「本月」标签可预期。
 * 图片用内联 SVG data URL（无外网依赖，同时让缩略图/抽屉图片区有内容可渲染）。
 */

import type { CaoliaoRecord, InspectDeviceRecord } from '../../api/operation/types'

/** 生成一张占位 SVG 图片（data URL），label 标在图中央 */
function img(label: string): string {
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="160" height="120">` +
    `<rect width="160" height="120" fill="#dcebfa"/>` +
    `<text x="80" y="66" font-size="15" text-anchor="middle" fill="#174e93" font-family="sans-serif">${label}</text></svg>`
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`
}

const IMG_CABINET = img('箱柜巡检照')
const IMG_IR = img('红外测温图')
const IMG_CURRENT = img('最热点电流图')
const IMG_BEFORE = img('整改前')
const IMG_AFTER = img('整改后')

// ---- §4.1 巡检记录（BZ000021 三条：两条本月、一条上月；BZ000022 一条异常） ----
export const inspectionRecords: InspectDeviceRecord[] = [
  {
    recordId: 'L36201',
    superDeviceName: '1#变 P01/T1 进线柜',
    deviceNumber: 'BZ000021',
    deviceImage: `${IMG_CABINET},${IMG_CABINET}`,
    temperature: 38.6,
    temperatureImage: IMG_IR,
    detectCurrent: 76,
    currentImage: IMG_CURRENT,
    dcVoltage: null,
    inspector: '张伟',
    inspectResult: '正常',
    createdAt: '2026-11-03 09:40:00',
  },
  {
    recordId: 'L36188',
    superDeviceName: '1#变 P01/T1 进线柜',
    deviceNumber: 'BZ000021',
    deviceImage: IMG_CABINET,
    temperature: 36.2,
    temperatureImage: IMG_IR,
    detectCurrent: null,
    currentImage: null,
    dcVoltage: null,
    inspector: '李娜',
    inspectResult: '正常',
    createdAt: '2026-10-20 15:05:00',
  },
  {
    recordId: 'L36155',
    superDeviceName: '2#变 P02/T1 电容柜',
    deviceNumber: 'BZ000022',
    deviceImage: IMG_CABINET,
    temperature: 47.8,
    temperatureImage: IMG_IR,
    detectCurrent: 92,
    currentImage: IMG_CURRENT,
    dcVoltage: null,
    inspector: '王强',
    inspectResult: '异常',
    createdAt: '2026-10-08 10:12:00',
  },
]

// ---- §4.2 缺陷记录（BZ000021 一条已完成；BZ000022 两条：重大-处理中、一般-待处理） ----
export const defectRecords: CaoliaoRecord[] = [
  {
    recordId: 'L39371',
    recordTime: '2026-11-01 17:18:06',
    formName: '宝安中心医院电气设备缺陷记录表（安全用能）',
    formNumber: 'D475',
    formType: 'DEFECT',
    inspector: 'guiji',
    result: '',
    processState: '已完成',
    positionRaw: '1#变低压配电房现场巡检码（1）',
    position: '1#变低压配电房',
    webUrl: 'https://qr71.cn/mock/L39371',
    fields: null,
    defectInfo: {
      reporterName: '张伟',
      foundDate: '2026-11-01',
      hazardPosition: 'P01/T1 进线柜柜顶',
      hazardDescription: '母排接头处示温蜡片变色，疑似接触不良发热',
      riskLevel: '一般缺陷',
      rectified: '已整改',
      rectifyMeasure: '停电紧固母排接头并更换蜡片，回路电阻测试合格',
      suggestedMeasure: '建议下次巡检重点复测该接头温度',
      deadline: '2026-11-05',
      responsibleDept: '动力科 张伟',
      standardClause: 'DL/T 596 电力设备预防性试验规程',
      remark: null,
      beforeImageUrls: [IMG_BEFORE],
      duringImageUrls: null,
      afterImageUrls: [IMG_AFTER],
      workImageUrls: null,
      processTime: '2026-11-02 09:30:00',
      hazardDeviceName: '1#变 P01/T1 进线柜',
      hazardDeviceNumber: 'BZ000021',
      hazardDeviceImage: IMG_CABINET,
    },
  },
  {
    recordId: 'L39366',
    recordTime: '2026-10-28 14:02:41',
    formName: '宝安中心医院电气设备缺陷记录表（安全用能）',
    formNumber: 'D475',
    formType: 'DEFECT',
    inspector: 'guiji',
    result: '',
    processState: '处理中',
    positionRaw: '2#变低压配电房现场巡检码（1）',
    position: '2#变低压配电房',
    webUrl: 'https://qr71.cn/mock/L39366',
    fields: null,
    defectInfo: {
      reporterName: '王强',
      foundDate: '2026-10-28',
      hazardPosition: 'P02/T1 电容柜内部',
      hazardDescription: '电容器组 C 相鼓胀漏液，需整组更换',
      riskLevel: '重大缺陷',
      rectified: '未整改',
      rectifyMeasure: null,
      suggestedMeasure: '联系厂家采购同型号电容器组，到货后停电更换',
      deadline: '2026-11-15',
      responsibleDept: '动力科 王强',
      standardClause: 'GB/T 50227 并联电容器装置设计规范',
      remark: '已申请备件，预计 11-10 到货',
      beforeImageUrls: [IMG_BEFORE],
      duringImageUrls: null,
      afterImageUrls: null,
      workImageUrls: null,
      processTime: '2026-10-29 08:45:00',
      hazardDeviceName: '2#变 P02/T1 电容柜',
      hazardDeviceNumber: 'BZ000022',
      hazardDeviceImage: IMG_CABINET,
    },
  },
  {
    recordId: 'L39360',
    recordTime: '2026-10-15 09:20:33',
    formName: '宝安中心医院电气设备缺陷记录表（安全用能）',
    formNumber: 'D475',
    formType: 'DEFECT',
    inspector: 'guiji',
    result: '',
    processState: '待处理',
    positionRaw: '2#变低压配电房现场巡检码（1）',
    position: '2#变低压配电房',
    webUrl: 'https://qr71.cn/mock/L39360',
    fields: null,
    defectInfo: {
      reporterName: '李娜',
      foundDate: '2026-10-15',
      hazardPosition: 'P02/T1 电容柜柜门',
      hazardDescription: '柜门锁扣损坏，无法上锁',
      riskLevel: '一般缺陷',
      rectified: '未整改',
      rectifyMeasure: null,
      suggestedMeasure: '更换柜门锁扣',
      deadline: null,
      responsibleDept: '动力科 李娜',
      standardClause: null,
      remark: null,
      beforeImageUrls: null,
      duringImageUrls: null,
      afterImageUrls: null,
      workImageUrls: null,
      processTime: null,
      hazardDeviceName: '2#变 P02/T1 电容柜',
      hazardDeviceNumber: 'BZ000022',
      hazardDeviceImage: null,
    },
  },
]

/** §4.1 按箱柜编号查询巡检记录（服务端按记录时间倒序，mock 同口径预排序） */
export function getInspectionByDeviceNumber(deviceNumber: string): InspectDeviceRecord[] {
  const num = String(deviceNumber || '').trim()
  return inspectionRecords
    .filter((r) => r.deviceNumber === num)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
}

/** §4.2 按箱柜编号查询缺陷记录（仅新表单记录；按记录时间倒序） */
export function getDefectByDeviceNumber(deviceNumber: string): CaoliaoRecord[] {
  const num = String(deviceNumber || '').trim()
  return defectRecords
    .filter((r) => r.defectInfo.hazardDeviceNumber === num)
    .sort((a, b) => b.recordTime.localeCompare(a.recordTime))
}
