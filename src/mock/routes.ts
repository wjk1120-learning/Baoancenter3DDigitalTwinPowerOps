import type { EventBrief } from '../api/event/types'
import { eventRows } from './data/event'
import {
  addMockCamera,
  cameraRows,
  deleteMockCamera,
  getMockCaptureUrl,
  getMockLiveUrl,
  getMockPlaybackUrl,
  updateMockCamera,
} from './data/ezviz'
import { getDeviceDailyStats } from './data/energy'
import {
  getDefectByDeviceNumber,
  getInspectionByDeviceNumber,
} from './data/operation'
import {
  buildings,
  getBriefDevicesBySuper,
  getDevicesBySuper,
  getEventCountByDevice,
  getEventsByDevice,
  getHealthLevelStats,
  getLevelCountsBySuper,
  getMeasurementsByDeviceId,
  getSuperById,
  getSuperCount,
  getSuperPage,
  getSwitchingList,
  getSwitchingSupers,
  searchDevices,
  searchSupers,
} from './data/device'

export interface MockCallContext {
  /** :参数 路径段（如 /event/:eventId/handle 的 eventId） */
  params: Record<string, string>
  /** URL search + axios params 合并后的查询串（值均字符串化） */
  query: Record<string, string>
  /** POST body（JSON 已解析） */
  body?: unknown
}

interface MockRoute {
  method: string
  segments: string[]
  handler: (ctx: MockCallContext) => unknown
}

function route(key: string, handler: (ctx: MockCallContext) => unknown): MockRoute {
  const [method, path] = key.split(' ')
  return { method, segments: path.split('/').filter(Boolean), handler }
}

function toInt(v: string | undefined, fallback: number): number {
  const n = Number(v)
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback
}

/**
 * mock 路由表：'方法 路径' → 处理函数。路径段支持 :参数。
 * 未登记的接口 = 页面拿到空信封（见 mockAdapter），缺口随阶段 4 页面逐个补。
 */
const routes: MockRoute[] = [
  // 3.1 今日告警分页（GET /event/today?page&pageSize，按时间倒序）
  route('GET /event/today', ({ query }) => {
    const page = toInt(query.page, 1)
    const pageSize = toInt(query.pageSize, 2000)
    const rows = [...eventRows].sort((a, b) => b.timeStr.localeCompare(a.timeStr))
    return { total: rows.length, rows: rows.slice((page - 1) * pageSize, page * pageSize) }
  }),

  // 3.2 按设备聚合（?level= 过滤，缺省全量；组内 events 即 EventBrief 列表）
  route('GET /event/grouped', ({ query }) => {
    const level = query.level != null && query.level !== '' ? Number(query.level) : null
    const pool = eventRows.filter((e) => level == null || e.eventLevel === level)
    const byDevice = new Map<string, EventBrief[]>()
    for (const e of pool) {
      const list = byDevice.get(e.deviceName) ?? []
      list.push(e)
      byDevice.set(e.deviceName, list)
    }
    return [...byDevice.entries()].map(([deviceName, list]) => ({
      deviceName,
      deviceId: '',
      count: list.length,
      latestTsMs: Date.parse(list[0]!.timeStr.replace(/-/g, '/')) || 0,
      highestLevel: Math.min(...list.map((e) => e.eventLevel)),
      events: list,
    }))
  }),

  // 3.4 分级统计（从同一份数据实时汇总）
  route('GET /event/stats', () => {
    const total = eventRows.length
    const unhandled = eventRows.filter((e) => e.handleStatus === 0).length
    const by = (lv: number) => eventRows.filter((e) => e.eventLevel === lv).length
    return {
      totalAlarmCount: total,
      todayAlarmCount: total,
      unhandledAlarmCount: unhandled,
      handleRate: total > 0 ? Math.round(((total - unhandled) / total) * 10000) / 100 : 100,
      urgentCount: by(1),
      criticalCount: by(2),
      normalCount: by(3),
      infoCount: by(4),
    }
  }),

  // 3.10 标记事件已处理（改数据数组，stats/grouped 联动）。
  // 文档语义：真实后端会级联处理同箱柜全部未处理事件（§3.10）；mock 数据无箱柜关联字段，
  // 仅翻当前事件——联调切真后以真后端级联结果为准
  route('POST /event/:eventId/handle', ({ params }) => {
    const hit = eventRows.find((e) => e.eventId === params.eventId)
    if (!hit) return false
    hit.handleStatus = 1
    return true
  }),

  // 3.9 手动触发事件同步（恒返 0 = 互斥跳过语义）
  route('POST /event/sync', () => 0),

  // ── 设备管理（§1，用户拍板范围：无配电房级联/无 1.14-1.16/无导出）──
  // §1.2 楼栋列表
  route('GET /device/buildings', () => buildings),
  // §1.4 箱柜分页（buildingId 可选；有开关优先→ID 升序）
  route('GET /device/super-devices', ({ query }) => getSuperPage(query)),
  // §1.5 箱柜计数
  route('GET /device/super-devices/count', ({ query }) => getSuperCount(query)),
  // §1.7 箱柜下设备明细分页
  route('GET /device/super-devices/:superId/devices', ({ params, query }) =>
    getDevicesBySuper(query, Number(params.superId)),
  ),
  // §1.8 箱柜下设备列表（精简：仅 id+名称；4.3 设备详情趋势下拉用）
  route('GET /device/super-devices/:superId/devices/brief', ({ params }) =>
    getBriefDevicesBySuper(Number(params.superId)),
  ),
  // §1.9 设备名模糊检索
  route('GET /device/search', ({ query }) => searchDevices(query)),
  // §1.10 柜名模糊检索
  route('GET /device/super-devices/search', ({ query }) => searchSupers(query)),
  // 单柜详情（联调新增接口）。⚠ 必须排在 count/search 字面路由之后：
  // 3 段参数路由 :superId 会吞掉同段数的字面段（mock 匹配器按登记顺序）
  route('GET /device/super-devices/:superId', ({ params }) => getSuperById(Number(params.superId))),
  // §1.3 配电房列表
  route('GET /device/switchings', () => getSwitchingList()),
  // §1.6 配电房下箱柜（精简，含摆场绑定键 deviceNumber）
  route('GET /device/switchings/:switchingId/super-devices', ({ params }) =>
    getSwitchingSupers(Number(params.switchingId)),
  ),
  // §1.11 测点明细（按需请求：点位弹窗点击时才发）
  route('GET /device/:deviceId/measurements', ({ params }) =>
    getMeasurementsByDeviceId(Number(params.deviceId)),
  ),
  // §1.12 健康度五档统计
  route('GET /device/health/level-stats', ({ query }) => getHealthLevelStats(query)),

  // ── 事件侧按设备/按柜查询（4.2④ 点位告警抽屉按需请求）──
  // §3.3 设备历史告警
  route('GET /event/devices/:deviceId/events', ({ params }) =>
    getEventsByDevice(Number(params.deviceId)),
  ),
  // §3.4 设备告警计数
  route('GET /event/devices/:deviceId/count', ({ params }) =>
    getEventCountByDevice(Number(params.deviceId)),
  ),
  // §3.5 箱柜分等级统计
  route('GET /event/super-devices/:superId/level-counts', ({ params }) =>
    getLevelCountsBySuper(Number(params.superId)),
  ),

  // ── 能耗/运维（4.3 设备详情页按需请求）──
  // §2.4 设备近 30 天每日能耗（固定 30 条按日升序；无读数日为 null）
  route('GET /energy/devices/:deviceId/daily-stats', ({ params }) =>
    getDeviceDailyStats(Number(params.deviceId)),
  ),
  // §4.1 按箱柜编号查询巡检记录
  route('GET /operation/inspection-records', ({ query }) =>
    getInspectionByDeviceNumber(query.deviceNumber ?? ''),
  ),
  // §4.2 按箱柜编号查询缺陷记录（仅新表单记录）
  route('GET /operation/defect-records', ({ query }) =>
    getDefectByDeviceNumber(query.deviceNumber ?? ''),
  ),

  // ── 萤石视频监控（§6，环境监控页）──
  // §6.1 摄像头台账列表
  route('GET /ezviz/cameras', () => cameraRows),
  // §6.5 直播取流（假 ezopen 地址 + 假 accessToken，真播放器播不了按「无画面隐藏」消隐）
  route('GET /ezviz/cameras/:id/live-url', ({ params }) => getMockLiveUrl(Number(params.id))),
  // §6.6 回放取流
  route('GET /ezviz/cameras/:id/playback-url', ({ params }) =>
    getMockPlaybackUrl(Number(params.id)),
  ),
  // §6.7 抓拍当前画面
  route('POST /ezviz/cameras/:id/capture', ({ params }) => getMockCaptureUrl(Number(params.id))),
  // §6.2 新增台账（改数据数组，台账抽屉/视频墙联动）
  route('POST /ezviz/cameras', ({ body }) => addMockCamera(body ?? {})),
  // §6.3/6.4 修改/删除台账（4 段参数路由与上面 2 段字面路由段数不同，无吞并问题）
  route('POST /ezviz/cameras/:id/update', ({ params, body }) =>
    updateMockCamera(Number(params.id), body ?? {}),
  ),
  route('POST /ezviz/cameras/:id/delete', ({ params }) => deleteMockCamera(Number(params.id))),
]

/** 纯函数匹配（带单测 mockAdapter.spec.ts）：方法一致 + 段数一致 + 字面段相等/:参数捕获 */
export function matchRoute(
  method: string,
  path: string,
): { handler: (ctx: MockCallContext) => unknown; params: Record<string, string> } | null {
  const segs = path.split('/').filter(Boolean)
  for (const r of routes) {
    if (r.method !== method || r.segments.length !== segs.length) continue
    const params: Record<string, string> = {}
    let hit = true
    for (let i = 0; i < segs.length; i++) {
      const pat = r.segments[i]!
      const seg = segs[i]!
      if (pat.startsWith(':')) {
        params[pat.slice(1)] = decodeURIComponent(seg)
      } else if (pat !== seg) {
        hit = false
        break
      }
    }
    if (hit) return { handler: r.handler, params }
  }
  return null
}
