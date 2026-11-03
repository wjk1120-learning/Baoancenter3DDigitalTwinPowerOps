/**
 * 事件接口（§3 事件管理模块，契约唯一依据 = docs/FY-Hospital-API-v3.90.md）。
 * 当前范围：3.1 today 分页 / 3.2 grouped 聚合 / 3.4 stats 统计 / 3.10 handle / 3.9 sync
 * / 今日等级分布（契约无「今日×等级」现成接口，由 3.1 真实计数归并）。
 * 楼栋(3.7/3.8)、箱柜(3.5)、设备级(3.3/3.4) 接口随 4.2~4.5 页面按文档逐条补；
 * 映射纯函数见 ./mappers。实现不参考福永 api 层代码（仅结构对照）。
 */
import { bzGet, bzPost, DATA_FETCH_TIMEOUT_MS } from '../../utils/http'
import { KeyedMemoryCache, MemoryCache } from '../../utils/cache'
import { runWithConcurrency } from '../../utils/concurrency'
import type { AlertEventLevel } from '../hospital/types'
import type {
  DeviceEventGroup,
  EventBrief,
  EventInfo,
  EventLevelStats,
  EventStatsResult,
  EventStatsVo,
  PageResult,
  SuperDeviceAlarmStats,
} from './types'
import { briefToEventInfo, coerceEventBrief, coerceEventInfo, normalizeEventLevel } from './mappers'

const EVENT_CACHE_TTL_MS = 15_000

/** 后端默认 limit=50；需显式传参才能拿全量 */
export const EVENT_LIST_LIMIT = 2000

const statsCache = new MemoryCache<EventStatsResult>(EVENT_CACHE_TTL_MS)
const groupedCache = new KeyedMemoryCache<DeviceEventGroup[]>(EVENT_CACHE_TTL_MS)

/** CET 统一请求：信封解包/GET 闪断重试由 utils/http 拦截器处理；silent 后台拉取失败不弹窗 */
async function eventGet<T>(path: string): Promise<T> {
  return bzGet<T>(path, undefined, { timeout: DATA_FETCH_TIMEOUT_MS, silent: true })
}

/** 3.1 今日告警分页（GET /event/today?page&pageSize） */
export async function fetchTodayEvents(page = 1, pageSize = 50): Promise<PageResult<EventInfo>> {
  const data = await eventGet<PageResult<unknown>>(`/event/today?page=${page}&pageSize=${pageSize}`)
  const rows = (data?.rows ?? [])
    .map((raw) => {
      const brief = coerceEventBrief(raw)
      if (brief) return briefToEventInfo(brief)
      return coerceEventInfo(raw)
    })
    .filter((e): e is EventInfo => e != null)
  return { total: Number(data?.total) || rows.length, rows }
}

function groupedCacheKey(level?: number): string {
  return level != null ? `level:${normalizeEventLevel(level)}` : 'all'
}

async function loadEventGrouped(level?: number): Promise<DeviceEventGroup[]> {
  const path =
    level != null ? `/event/grouped?level=${normalizeEventLevel(level)}` : '/event/grouped'
  return ((await eventGet<unknown[]>(path)) ?? [])
    .map(normalizeDeviceEventGroup)
    .filter((g): g is DeviceEventGroup => g != null)
}

/** 3.2 按设备聚合查询全量告警（可按等级过滤；v3.43 起 3.4 /grouped/level 合并进此处） */
export async function fetchEventGrouped(force = false, level?: number): Promise<DeviceEventGroup[]> {
  return groupedCache.load(groupedCacheKey(level), () => loadEventGrouped(level), force)
}

/** 按事件等级拉取设备聚合列表（= fetchEventGrouped 带 level，语义别名供页面用） */
export async function fetchEventGroupedByLevel(eventLevel: number): Promise<DeviceEventGroup[]> {
  const lv = normalizeEventLevel(eventLevel)
  return groupedCache.load(`level:${lv}`, () => loadEventGrouped(lv), false)
}

function normalizeDeviceEventGroup(raw: unknown): DeviceEventGroup | null {
  if (!raw || typeof raw !== 'object') return null
  const o = raw as Record<string, unknown>
  const events = Array.isArray(o.events)
    ? o.events
        .map((raw) => {
          const brief = coerceEventBrief(raw)
          if (brief) return briefToEventInfo(brief)
          return coerceEventInfo(raw)
        })
        .filter((e): e is EventInfo => e != null)
    : []
  const latestTimeStr =
    events.reduce((best, e) => ((e.timeStr || '') > best ? e.timeStr : best), '') ||
    formatTsMs(Number(o.latestTsMs ?? 0))
  return {
    deviceName: String(o.deviceName ?? ''),
    deviceId: String(o.deviceId ?? ''),
    count: Number(o.count ?? events.length) || 0,
    latestTsMs: Number(o.latestTsMs ?? 0),
    latestTimeStr,
    highestLevel: Number(o.highestLevel ?? 3),
    events,
  }
}

function formatTsMs(ts: number): string {
  if (!Number.isFinite(ts) || ts <= 0) return ''
  const d = new Date(ts)
  if (Number.isNaN(d.getTime())) return ''
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`
}

/** 3.10 标记事件已处理（POST /event/{eventId}/handle）；成功后清缓存联动统计 */
export async function handleEvent(eventId: string): Promise<boolean> {
  const id = String(eventId || '').trim()
  if (!id) return false
  const data = await bzPost<boolean>(`/event/${encodeURIComponent(id)}/handle`, undefined, {
    timeout: DATA_FETCH_TIMEOUT_MS,
  })
  if (data) clearEventCache()
  return data === true
}

/** 3.9 手动触发事件同步（POST /event/sync）；互斥锁语义：已有同步执行时返回 0 不排队 */
export function syncEvents(): Promise<number> {
  return bzPost<number>('/event/sync', undefined, { timeout: DATA_FETCH_TIMEOUT_MS })
}

/** 强制清空事件模块内存缓存（手动刷新时调用） */
export function clearEventCache() {
  statsCache.clear()
  groupedCache.clear()
}

function normalizeEventStatsVo(raw: unknown): EventStatsVo {
  // §3.6 契约字段（camelCase，handleRate 无告警时为 0.00）；不做大小写兜底
  const o = (raw ?? {}) as Record<string, unknown>
  const num = (key: string): number => {
    const n = Number(o[key])
    return Number.isFinite(n) ? n : 0
  }
  const handleRate = Number(o.handleRate)
  return {
    totalAlarmCount: num('totalAlarmCount'),
    todayAlarmCount: num('todayAlarmCount'),
    unhandledAlarmCount: num('unhandledAlarmCount'),
    handleRate: Number.isFinite(handleRate) ? handleRate : undefined,
    urgentCount: num('urgentCount'),
    criticalCount: num('criticalCount'),
    normalCount: num('normalCount'),
    infoCount: num('infoCount'),
    cacheTs: num('cacheTs') || undefined,
    error: String(o.error ?? '') || undefined,
  }
}

function mapEventStats(vo: EventStatsVo): EventStatsResult {
  return {
    day: new Date().toISOString().slice(0, 10),
    totalEvents: Number(vo.totalAlarmCount) || 0,
    unhandledEvents: Number(vo.unhandledAlarmCount) || 0,
    todayAlarmCount: Number(vo.todayAlarmCount) || 0,
    handleRate: Number.isFinite(vo.handleRate) ? Number(vo.handleRate) : undefined,
    urgentCount: Number(vo.urgentCount) || 0,
    criticalCount: Number(vo.criticalCount) || 0,
    levelDistribution: {
      '1': Number(vo.urgentCount) || 0,
      '2': Number(vo.criticalCount) || 0,
      '3': Number(vo.normalCount) || 0,
      '4': Number(vo.infoCount) || 0,
    },
    typeDistribution: {},
    cacheTs: Number(vo.cacheTs) || undefined,
    error: vo.error ? String(vo.error) : undefined,
  }
}

/** 3.4 分级统计（含 15s TTL 缓存与并发去重） */
export async function fetchEventStats(force = false): Promise<EventStatsResult> {
  return statsCache.load(
    async () => mapEventStats(normalizeEventStatsVo(await eventGet<unknown>('/event/stats'))),
    force,
  )
}

/** §3.3 按设备查询历史告警（GET /event/devices/{deviceId}/events，按时间降序） */
export async function fetchDeviceHistoryEvents(deviceId: number): Promise<EventBrief[]> {
  if (!deviceId) return []
  const data = await eventGet<unknown[]>(`/event/devices/${deviceId}/events`)
  return (data ?? []).map(coerceEventBrief).filter((e): e is EventBrief => e != null)
}

/** §3.4 按设备统计历史告警数（GET /event/devices/{deviceId}/count，全部事件口径） */
export async function fetchDeviceEventCount(deviceId: number): Promise<number> {
  if (!deviceId) return 0
  const data = await eventGet<unknown>(`/event/devices/${deviceId}/count`)
  return Number(data) || 0
}

/** §3.5 箱柜分等级历史告警统计（失败降级全 0，弹窗头不阻断） */
export async function fetchSuperDeviceLevelCounts(superId: number): Promise<SuperDeviceAlarmStats> {
  if (!superId) return normalizeSuperDeviceAlarmStats(null)
  try {
    return normalizeSuperDeviceAlarmStats(
      await eventGet<unknown>(`/event/super-devices/${superId}/level-counts`),
    )
  } catch {
    return normalizeSuperDeviceAlarmStats(null)
  }
}

/** §3.5 五字段归一（total 缺失时回退为四级合计） */
export function normalizeSuperDeviceAlarmStats(raw: unknown): SuperDeviceAlarmStats {
  const o = (raw ?? {}) as Record<string, unknown>
  const num = (key: string): number => {
    const n = Number(o[key])
    return Number.isFinite(n) ? n : 0
  }
  const stats: SuperDeviceAlarmStats = {
    totalAlarmCount: num('totalAlarmCount'),
    urgentCount: num('urgentCount'),
    criticalCount: num('criticalCount'),
    normalCount: num('normalCount'),
    infoCount: num('infoCount'),
  }
  if (!stats.totalAlarmCount) {
    stats.totalAlarmCount =
      stats.urgentCount + stats.criticalCount + stats.normalCount + stats.infoCount
  }
  return stats
}

/** 箱柜分等级统计 → 四级行（固定顺序，缺级补 0） */
export function toEventLevelStats(stats: SuperDeviceAlarmStats): EventLevelStats[] {
  return [
    { eventLevel: 1, count: stats.urgentCount },
    { eventLevel: 2, count: stats.criticalCount },
    { eventLevel: 3, count: stats.normalCount },
    { eventLevel: 4, count: stats.infoCount },
  ]
}

/** 今日告警等级分布（§3.1 真实计数归并） */
export interface TodayLevelDistribution {
  /** 今日告警总条数（实际拉到的行数） */
  total: number
  /** 按契约四级计数：1紧急 2严重 3一般 4提醒 */
  counts: Record<AlertEventLevel, number>
}

const todayDistCache = new MemoryCache<TodayLevelDistribution>(EVENT_CACHE_TTL_MS)

/**
 * 今日等级分布：§3.1 全量分页拉取后按 eventLevel 计数（契约无「今日×等级」现成接口）。
 * 拉取失败返回 null（调用方显示「—」，不假 0）。
 */
export async function fetchTodayLevelDistribution(
  force = false,
): Promise<TodayLevelDistribution | null> {
  try {
    return await todayDistCache.load(
      async () => {
        const pageSize = 100
        const first = await fetchTodayEvents(1, pageSize)
        const rows: EventInfo[] = [...first.rows]
        const total = Number(first.total) || 0
        if (rows.length && rows.length < total) {
          // 首页探测 total，再并发拉剩余页（封顶 20 页）
          const totalPages = Math.min(20, Math.ceil(total / pageSize))
          const restPages = Array.from({ length: totalPages - 1 }, (_, i) => i + 2)
          const rest = await runWithConcurrency(restPages, 4, async (page) => {
            const data = await fetchTodayEvents(page, pageSize).catch(() => ({
              total: 0,
              rows: [] as EventInfo[],
            }))
            return data.rows
          })
          for (const pageRows of rest) rows.push(...pageRows)
        }
        const counts: Record<AlertEventLevel, number> = { 1: 0, 2: 0, 3: 0, 4: 0 }
        for (const r of rows) {
          const lv = Number(r.eventLevel)
          if (lv >= 1 && lv <= 4) counts[lv as AlertEventLevel] += 1
        }
        return { total: rows.length, counts }
      },
      force,
    )
  } catch {
    return null
  }
}
