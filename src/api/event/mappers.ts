import type { AlertDetail, AlertEventLevel, AlertItem, HistoryAlertRow } from '../hospital/types'
import type { AlertLocation, DeviceEventGroup, EventBrief, EventInfo } from './types'

/**
 * 事件映射纯函数（无网络、无缓存，带单测）：EventBrief/EventInfo ↔ AlertItem/AlertDetail、
 * 等级与处理状态归一。
 * 契约唯一依据 = docs/FY-Hospital-API-v3.90.md（§3 事件 / §5.1 WS 消息）；字段只认文档
 * 所载（camelCase），不做福永式大小写兜底/野字段兜底/已下线字段兼容。
 */

/** 3.1/3.2/3.3 等为 EventBrief；内部仍用 EventInfo 供既有映射复用 */
export function briefToEventInfo(b: EventBrief): EventInfo {
  return {
    eventId: b.eventId,
    tsMs: 0,
    timeStr: b.timeStr,
    eventLevel: b.eventLevel,
    eventType: '',
    alarmKind: '',
    deviceId: '',
    deviceName: b.deviceName,
    stationId: '',
    description: b.description,
    handleStatus: b.handleStatus,
    locations: b.locations ?? null,
  }
}

export function mapEventBriefToAlert(e: EventBrief): AlertItem {
  return mapEventInfoToAlert(briefToEventInfo(e))
}

function formatTsMs(ts: number): string {
  if (!Number.isFinite(ts) || ts <= 0) return ''
  const d = new Date(ts)
  if (Number.isNaN(d.getTime())) return ''
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`
}

/** 分组最新时间：v3.15+ 已去掉 latestTimeStr，用组内事件 timeStr / latestTsMs 回填 */
export function groupLatestTime(g: DeviceEventGroup): string {
  if (g.latestTimeStr) return g.latestTimeStr
  let latest = ''
  for (const e of g.events ?? []) {
    const t = e.timeStr || ''
    if (t > latest) latest = t
  }
  if (latest) return latest
  return formatTsMs(Number(g.latestTsMs) || 0)
}

function eventLevelToAlertLevel(level: number): AlertItem['level'] {
  return level === 1 ? 'error' : 'warn'
}

/** CET：1紧急 2重要/严重 3一般 4提示/提醒 */
export function normalizeEventLevel(level: number | undefined | null): AlertEventLevel {
  if (level === 1 || level === 2 || level === 3 || level === 4) return level
  return 3
}

export function eventLevelLabel(level: number | undefined | null): AlertDetail['eventLevel'] {
  if (level === 1) return '紧急'
  if (level === 2) return '严重'
  if (level === 3) return '一般'
  if (level === 4) return '提醒'
  return '一般'
}

export function handleStatusLabel(status: number | undefined | null): string {
  return status === 1 ? '已处理' : '未处理'
}

function handleStatusToAlertStatus(status: number): AlertItem['status'] {
  return status === 1 ? 'done' : 'pending'
}

function alarmKindToSystem(alarmKind: string, eventType: string): string {
  if (alarmKind || eventType) return `CET-${eventType || alarmKind}`
  return '电力子系统'
}

export function mapEventInfoToAlert(e: EventInfo): AlertItem {
  return {
    id: e.eventId,
    time: e.timeStr,
    device: e.deviceName || e.deviceId,
    content: e.description,
    level: eventLevelToAlertLevel(e.eventLevel),
    eventLevel: normalizeEventLevel(e.eventLevel),
    system: alarmKindToSystem(e.alarmKind, e.eventType),
    status: handleStatusToAlertStatus(e.handleStatus),
    deviceId: e.deviceId || undefined,
    locations: e.locations ?? null,
    handleStatus: Number(e.handleStatus) || 0,
  }
}

/**
 * 解析告警位置数组（doc v3.57 起的事件位置结构）。
 * 兼容 null（设备无定位记录或全部不可解析——后端即如此下发）与多元素数组；
 * 逐条校验 building/floor，不可解析条目剔除，剔除后为空时归一为 null。
 */
export function parseAlertLocations(raw: unknown): AlertLocation[] | null {
  if (raw == null || !Array.isArray(raw)) return null
  const out: AlertLocation[] = []
  for (const it of raw) {
    if (!it || typeof it !== 'object') continue
    const o = it as Record<string, unknown>
    const building = Number(o.building)
    const floor = String(o.floor ?? '').trim()
    if (!Number.isFinite(building) || building <= 0 || !floor) continue
    out.push({ building, floor })
  }
  return out.length ? out : null
}

/** REST EventBrief（§3.1/3.2/3.3）字段归一化（契约字段：eventId/timeStr/eventLevel/deviceName/description/handleStatus/locations） */
export function coerceEventBrief(raw: unknown): EventBrief | null {
  if (!raw || typeof raw !== 'object') return null
  const o = raw as Record<string, unknown>
  const eventId = String(o.eventId ?? '')
  const deviceName = String(o.deviceName ?? '')
  const description = String(o.description ?? '')
  if (!eventId && !deviceName && !description) return null
  return {
    eventId,
    timeStr: String(o.timeStr ?? ''),
    eventLevel: Number(o.eventLevel ?? 3),
    deviceName,
    description,
    handleStatus: Number(o.handleStatus ?? 0),
    locations: parseAlertLocations(o.locations),
  }
}

/** WS EventInfo（§5.1 推送完整结构）字段归一化 */
export function coerceEventInfo(raw: unknown): EventInfo | null {
  if (!raw || typeof raw !== 'object') return null
  const o = raw as Record<string, unknown>
  const eventId = String(o.eventId ?? '')
  const deviceName = String(o.deviceName ?? '')
  const description = String(o.description ?? '')
  const locations = parseAlertLocations(o.locations)
  if (!eventId && !deviceName && !description && !locations?.length) return null
  return {
    eventId,
    tsMs: Number(o.tsMs ?? 0),
    timeStr: String(o.timeStr ?? ''),
    eventLevel: Number(o.eventLevel ?? 3),
    eventType: String(o.eventType ?? ''),
    alarmKind: String(o.alarmKind ?? ''),
    deviceId: String(o.deviceId ?? ''),
    deviceName,
    stationId: String(o.stationId ?? ''),
    description,
    handleStatus: Number(o.handleStatus ?? 0),
    locations,
    updatedAt: o.updatedAt != null ? String(o.updatedAt) : undefined,
  }
}

/** EventBrief → 历史告警行（设备详情页/配电房点柜看板共用；等级→粗粒度、处理状态→字符串） */
export function eventBriefToHistoryRow(e: EventBrief): HistoryAlertRow {
  const eventLevel = normalizeEventLevel(e.eventLevel)
  return {
    id: e.eventId,
    time: e.timeStr,
    content: e.description,
    level: eventLevel === 1 ? 'error' : 'warn',
    status: e.handleStatus === 1 ? 'done' : 'pending',
    eventLevel,
  }
}
