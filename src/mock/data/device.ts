import { eventRows } from './event'
import type { EventBrief } from '../../api/event/types'
import type { DeviceDetail, DeviceHealthLevelStats, MeasInfo, SuperDevice } from '../../api/device/types'
import { superNameFor } from '../../views/power-room/data/powerRoom'
import config from '../../views/power-room/data/power-rooms.json'

/**
 * 设备目录假数据：从宝中自己的 power-rooms.json（6 房 31 柜，与配电房 3D 页同源）按
 * 文档 §1 契约形状衍生。楼栋命名 = 用户提供的真实楼栋（门诊1号楼/门诊2号楼/综合楼/
 * 住院楼/行政楼），柜→楼栋归属为 mock 分配，联调切真后端后被真实档案覆盖。
 * 告警数据（data/event.ts）的 deviceName 与本目录 superName 精确同名，实现按设备/按柜的告警关联。
 */

// ---- 楼栋（用户提供的真实命名） ----
export const buildings = [
  { id: 1, buildingName: '门诊1号楼' },
  { id: 2, buildingName: '门诊2号楼' },
  { id: 3, buildingName: '综合楼' },
  { id: 4, buildingName: '住院楼' },
  { id: 5, buildingName: '行政楼' },
]

/** 配电房 → 楼栋归属（mock 分配；行政楼暂无配电房柜） */
const ROOM_TO_BUILDING: Record<string, number> = {
  'room-1': 1,
  'room-2': 1,
  'room-3': 2,
  'room-4': 2,
  'room-5': 3,
  'room-6': 4,
}

const MODEL_TO_TYPE: Record<string, string> = {
  jinxian: '低压柜',
  peidiangui: '配电柜',
  dianrongui: '电容柜',
  shuangdianyuan: '双电源切换柜',
}

type CabJson = { code: string; name: string; model: string; devCode?: string }

const rooms = (config as { rooms: { id: string; name: string; rows: CabJson[][] }[] }).rooms

// ---- 箱柜：31 台，superName = 「N#变 + 柜名」（与事件假数据同名关联） ----
export const cabinets: (SuperDevice & { buildingId: number })[] = []
{
  let id = 100
  let idx = 0
  for (const room of rooms) {
    for (const row of room.rows as CabJson[][]) {
      for (const cab of row) {
        idx++
        cabinets.push({
          id: id++,
          superName: superNameFor(room.id, cab.name),
          deviceType: MODEL_TO_TYPE[cab.model] ?? '配电柜',
          deviceNumber: cab.devCode ?? `BZ${700000 + idx}`,
          commissionDate: idx % 3 === 0 ? `2021-0${(idx % 9) + 1}-15` : null,
          // 2 台无开关（演示排序：有开关优先）；其余有开关
          status: idx === 5 || idx === 24 ? 0 : 1,
          // 健康度确定性分布（50~95），覆盖五档展示
          health: Math.min(95, 100 - ((idx * 13) % 50)),
          deviceCount: 3 + (idx % 5),
          buildingId: ROOM_TO_BUILDING[room.id] ?? 1,
        })
      }
    }
  }
}

// ---- 箱柜下设备明细（§1.7）：deviceCount 台，命名「测点 k」；告警数按柜名关联挂 1 号测点 ----
export const devices: DeviceDetail[] = []
for (const cab of cabinets) {
  for (let k = 1; k <= cab.deviceCount; k++) {
    devices.push({
      deviceId: 10000 + cab.id * 10 + k,
      deviceName: `${cab.superName} 测点${k}`,
      superName: cab.superName,
      // 告警按柜名关联（data/event.ts），全部记在 1 号测点头上的口径
      alarmCount: k === 1 ? eventsBySuperName(cab.superName).length : 0,
      // 2 台停用设备（展示停用态）
      enabled: (cab.id === 105 || cab.id === 124) && k === 2 ? 0 : 1,
    })
  }
}

export function eventsBySuperName(superName: string): EventBrief[] {
  return eventRows
    .filter((e) => e.deviceName === superName)
    .map((e) => ({ ...e, locations: e.locations ?? null }))
}

// ---- 查询函数（mock 路由的处理器调用；排序/筛选按文档口径） ----

/** §1.4 箱柜分页：buildingId 可选；排序 = 有开关（status=1）优先 → id 升序 */
export function getSuperPage(query: { buildingId?: string; page?: string; pageSize?: string }) {
  const buildingId = query.buildingId != null && query.buildingId !== '' ? Number(query.buildingId) : null
  const page = Math.max(1, Number(query.page) || 1)
  const pageSize = Math.max(1, Number(query.pageSize) || 12)
  const pool = cabinets
    .filter((c) => buildingId == null || c.buildingId === buildingId)
    .sort((a, b) => b.status - a.status || a.id - b.id)
  return {
    total: pool.length,
    rows: pool.slice((page - 1) * pageSize, page * pageSize),
  }
}

/** §1.5 箱柜计数（buildingId 可选） */
export function getSuperCount(query: { buildingId?: string }) {
  const buildingId = query.buildingId != null && query.buildingId !== '' ? Number(query.buildingId) : null
  return cabinets.filter((c) => buildingId == null || c.buildingId === buildingId).length
}

function superIdOfDevice(d: DeviceDetail): number {
  return cabinets.find((c) => c.superName === d.superName)?.id ?? 0
}

/** §1.7 箱柜下设备明细分页 */
export function getDevicesBySuper(query: { page?: string; pageSize?: string }, superId: number) {
  const page = Math.max(1, Number(query.page) || 1)
  const pageSize = Math.max(1, Number(query.pageSize) || 50)
  const pool = devices.filter((d) => superIdOfDevice(d) === superId)
  return { total: pool.length, rows: pool.slice((page - 1) * pageSize, page * pageSize) }
}

/** §1.8 箱柜下设备列表（精简：仅 id+名称，按 id 升序，无分页） */
export function getBriefDevicesBySuper(superId: number) {
  return devices
    .filter((d) => superIdOfDevice(d) === superId)
    .sort((a, b) => a.deviceId - b.deviceId)
    .map((d) => ({ deviceId: d.deviceId, deviceName: d.deviceName }))
}

/** §1.9 设备名模糊检索（LIKE %q%） */
export function searchDevices(query: { deviceName?: string; page?: string; pageSize?: string }) {
  const q = (query.deviceName ?? '').trim()
  const page = Math.max(1, Number(query.page) || 1)
  const pageSize = Math.max(1, Number(query.pageSize) || 12)
  const pool = devices.filter((d) => d.deviceName.includes(q))
  return { total: pool.length, rows: pool.slice((page - 1) * pageSize, page * pageSize) }
}

/** §1.10 柜名模糊检索（结构同 §1.4，排序同） */
export function searchSupers(query: { superName?: string; page?: string; pageSize?: string }) {
  const q = (query.superName ?? '').trim()
  const page = Math.max(1, Number(query.page) || 1)
  const pageSize = Math.max(1, Number(query.pageSize) || 12)
  const pool = cabinets
    .filter((c) => c.superName.includes(q))
    .sort((a, b) => b.status - a.status || a.id - b.id)
  return { total: pool.length, rows: pool.slice((page - 1) * pageSize, page * pageSize) }
}

/** §1.11 测点：按柜型衍生（mock；真实测点来自 CET） */
const MEAS_TEMPLATE: Record<string, { name: string; type: number; base: number }[]> = {
  低压柜: [
    { name: 'A相电压', type: 0, base: 221 },
    { name: 'B相电压', type: 0, base: 219 },
    { name: 'C相电压', type: 0, base: 222 },
    { name: 'A相电流', type: 0, base: 86 },
    { name: '有功功率', type: 0, base: 48 },
  ],
  电容柜: [
    { name: '功率因数', type: 0, base: 0.93 },
    { name: '电容器电流', type: 0, base: 42 },
    { name: '柜内温度', type: 1, base: 31 },
  ],
  配电柜: [
    { name: '回路电流', type: 0, base: 34 },
    { name: '柜内温度', type: 1, base: 29 },
  ],
  双电源切换柜: [
    { name: '直流电压', type: 0, base: 221 },
    { name: '电池温度', type: 1, base: 27 },
  ],
}

export function getMeasurementsByDeviceId(deviceId: number): MeasInfo[] {
  const dev = devices.find((d) => d.deviceId === deviceId)
  return getMeasurements(dev?.superName ?? '')
}

export function getMeasurements(superName: string): MeasInfo[] {
  const cab = cabinets.find((c) => c.superName === superName)
  if (!cab) return []
  const tpl = MEAS_TEMPLATE[cab.deviceType] ?? MEAS_TEMPLATE['配电柜']
  const wobble = Math.sin(Date.now() / 60_000 + cab.id) * 0.03 // ±3% 缓慢漂移
  return tpl.map((t, i) => ({
    measID: 4000000 + cab.id * 10 + i,
    measName: t.name,
    measType: t.type,
    measVal: Math.round(t.base * (1 + wobble) * 100) / 100,
  }))
}

/** §1.12 健康度五档（buildingId 可选；阈值：≥85/[70,85)/[50,70)/[30,50)/<30） */
export function getHealthLevelStats(query: { buildingId?: string }): DeviceHealthLevelStats {
  const buildingId = query.buildingId != null && query.buildingId !== '' ? Number(query.buildingId) : null
  const pool = cabinets.filter((c) => buildingId == null || c.buildingId === buildingId)
  const h = pool.map((c) => c.health ?? 100)
  const inRange = (v: number, lo: number, hi: number) => v >= lo && v < hi
  return {
    excellentCount: h.filter((v) => v >= 85).length,
    goodCount: h.filter((v) => inRange(v, 70, 85)).length,
    fairCount: h.filter((v) => inRange(v, 50, 70)).length,
    poorCount: h.filter((v) => inRange(v, 30, 50)).length,
    terribleCount: h.filter((v) => v < 30).length,
    totalCount: h.length,
  }
}

/** §3.3 设备历史告警（deviceId → 所属柜 → 柜名同名事件，按时间降序） */
export function getEventsByDevice(deviceId: number): EventBrief[] {
  const dev = devices.find((d) => d.deviceId === deviceId)
  if (!dev?.superName) return []
  return eventsBySuperName(dev.superName).sort((a, b) => b.timeStr.localeCompare(a.timeStr))
}

/** §3.4 设备历史告警计数 */
export function getEventCountByDevice(deviceId: number): number {
  return getEventsByDevice(deviceId).length
}

/** §3.5 箱柜分等级统计（全部事件口径） */
export function getLevelCountsBySuper(superId: number) {
  const cab = cabinets.find((c) => c.id === superId)
  const events = cab ? eventsBySuperName(cab.superName) : []
  const by = (lv: number) => events.filter((e) => e.eventLevel === lv).length
  return {
    totalAlarmCount: events.length,
    urgentCount: by(1),
    criticalCount: by(2),
    normalCount: by(3),
    infoCount: by(4),
  }
}

/** mock 自洽性对账：告警数据的设备名是否都在目录中（测试断言用） */
export function eventNamesMissingInCatalog(): string[] {
  const names = new Set(cabinets.map((c) => c.superName))
  const seen: string[] = []
  for (const e of eventRows) {
    if (!names.has(e.deviceName) && !seen.includes(e.deviceName)) seen.push(e.deviceName)
  }
  return seen
}
