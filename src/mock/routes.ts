import type { EventBrief } from '../api/event/types'
import {
  eventRows,
  getBuildingCurrentAlarmCount,
  getBuildingDailyAlarms,
  mockTodayStr,
} from './data/event'
import {
  cameraRows,
  getMockCaptureUrl,
  getMockLiveUrl,
  getMockPlaybackUrl,
} from './data/ezviz'
import {
  getBuildingEnergyHistory,
  getDeviceDailyStats,
  getEnergyToday,
  getEnergyYesterday,
  getFloorEnergyHistory,
  getFloorStats,
  getParamCurve,
} from './data/energy'
import { getCetDataTypes } from './data/configuration'
import {
  addBuilding,
  addDeviceType,
  addSwitching,
  getBuildingStats,
  getBuildings,
  getCabinets,
  getChannels,
  getDeviceTypes,
  getDevices,
  getFloorStats as getConfigFloorStats,
  getHealthTemplateList,
  getHealthTemplateTree,
  getSwitchings,
  renameBuilding,
  renameDeviceType,
  renameSwitching,
  searchCabinets,
  deleteBuilding,
  deleteDeviceType,
  deleteSwitching,
} from './data/configuration'
import type { DeviceFilter } from '../api/configuration/inventory'
import {
  getCabinetDefects,
  getDefectByDeviceNumber,
  getDefectStats,
  getInspectionByDeviceNumber,
} from './data/operation'
import {
  buildings,
  getBriefDevicesBySuper,
  getDeviceCount,
  getDevicesBySuper,
  getEventCountByDevice,
  getHealthAverage,
  getEventsByDevice,
  getHealthLevelStats,
  getLevelCountsBySuper,
  getMeasurementsByDeviceId,
  getSuperById,
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

/** POST body 兜底成对象（配置中心写接口 handler 里直接按字段解构） */
function asBody(body: unknown): Record<string, unknown> {
  return body && typeof body === 'object' && !Array.isArray(body)
    ? (body as Record<string, unknown>)
    : {}
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

/**
 * mock 路由表：'方法 路径' → 处理函数。路径段支持 :参数。
 * 未登记的接口 = 页面拿到空信封（见 mockAdapter），缺口随阶段 4 页面逐个补。
 */
const routes: MockRoute[] = [
  // §3.1 今日告警（v5.9.2 起契约取消分页：List<EventBrief> 直返，按时间倒序）。
  // eventRows 含跨日未处理样本（§3.11 用）——今日接口只回今日行（timeStr 日期 = 今天）
  route('GET /event/today', () =>
    [...eventRows]
      .filter((e) => e.timeStr.slice(0, 10) === mockTodayStr())
      .sort((a, b) => b.timeStr.localeCompare(a.timeStr)),
  ),

  // §3.11 未处理事件列表（全量 handle_status=0，不限今日，时间倒序；3D 告警链数据源）
  route('GET /event/unhandled', () =>
    [...eventRows]
      .filter((e) => e.handleStatus === 0)
      .sort((a, b) => b.timeStr.localeCompare(a.timeStr)),
  ),

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
  // §3.7 楼栋当前告警数（3D 楼栋/楼层信息卡；floor 可选按楼层筛选）
  route('GET /event/buildings/:buildingId/current-count', ({ params, query }) =>
    getBuildingCurrentAlarmCount(Number(params.buildingId), query.floor || undefined),
  ),
  // §3.8 楼栋近 7 日每日告警数（3D 信息卡趋势；floor 可选参与种子）
  route('GET /event/buildings/:buildingId/daily-counts', ({ params, query }) =>
    getBuildingDailyAlarms(Number(params.buildingId), query.floor || undefined),
  ),
  // §2.3 分楼栋近 7 日历史能耗（3D 信息卡趋势）
  route('GET /energy/buildings/history', ({ query }) => getBuildingEnergyHistory(query)),
  // §2.6/§2.7/§2.8 楼层能耗（3D 楼层信息卡；6 段参数路由与 3 段 history 字面路由无冲突）
  route('GET /energy/buildings/:buildingId/floors/:floor/device-stats', ({ params }) =>
    getFloorStats(Number(params.buildingId), params.floor ?? '1', false),
  ),
  route('GET /energy/buildings/:buildingId/floors/:floor/today-device-stats', ({ params }) =>
    getFloorStats(Number(params.buildingId), params.floor ?? '1', true),
  ),
  route('GET /energy/buildings/:buildingId/floors/:floor/history', ({ params }) =>
    getFloorEnergyHistory(Number(params.buildingId), params.floor ?? '1'),
  ),
  // §3.6 告警统计：totalAlarmCount=全量、todayAlarmCount=今日（eventRows 含跨日样本，两者分离）
  route('GET /event/stats', () => {
    const today = mockTodayStr()
    const total = eventRows.length
    const todayRows = eventRows.filter((e) => e.timeStr.slice(0, 10) === today)
    const unhandled = eventRows.filter((e) => e.handleStatus === 0).length
    const by = (lv: number) => eventRows.filter((e) => e.eventLevel === lv).length
    return {
      totalAlarmCount: total,
      todayAlarmCount: todayRows.length,
      unhandledAlarmCount: unhandled,
      handleRate: total > 0 ? Math.round(((total - unhandled) / total) * 10000) / 100 : 100,
      urgentCount: by(1),
      criticalCount: by(2),
      normalCount: by(3),
      infoCount: by(4),
    }
  }),

  // §3.10 标记事件已处理（改数据数组，stats/grouped/unhandled 联动）。
  // 级联语义（§3.10 契约：同箱柜全部未处理一并置 1）mock 近似 = 同 deviceName（柜名）
  // 的未处理事件一并翻已处理——切真后以真后端级联结果为准
  route('POST /event/:eventId/handle', ({ params }) => {
    const hit = eventRows.find((e) => e.eventId === params.eventId)
    if (!hit) return false
    for (const e of eventRows) {
      if (e.deviceName === hit.deviceName && e.handleStatus === 0) e.handleStatus = 1
    }
    return true
  }),

  // 3.9 手动触发事件同步（恒返 0 = 互斥跳过语义）
  route('POST /event/sync', () => 0),

  // ── 设备管理（§1；不做 §1.5/§1.14-1.16/导出。§1.2 楼栋 2026-11-12 缺陷管理页恢复调用，§1.13 平均值 2026-11-16 医院总览页启用）──
  // §1.1 查询总设备数（医院总览能源面板 KPI）
  route('GET /device/count', () => getDeviceCount()),
  // §1.2 楼栋列表（全量含 0 柜楼栋；缺陷管理页楼栋树/面包屑）
  route('GET /device/buildings', () => buildings),
  // §1.4 箱柜分页（buildingId 可选；有开关优先→ID 升序）
  route('GET /device/super-devices', ({ query }) => getSuperPage(query)),
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
  // 单柜详情（联调新增接口）。⚠ 必须排在 search 字面路由之后：
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
  // §1.13 全院箱柜健康度平均值（医院总览页）
  route('GET /device/health/average', () => getHealthAverage()),

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

  // ── 能耗/运维（医院总览面板 + 4.3 设备详情页按需请求）──
  // §2.1 今日能耗（分楼栋；10 分钟轮询）
  route('GET /energy/today', () => getEnergyToday()),
  // §2.2 昨日能耗（buildingId 不传 = 全院汇总行 0）
  route('GET /energy/yesterday', ({ query }) => getEnergyYesterday(query)),
  // §2.4 设备近 30 天每日能耗（固定 30 条按日升序；无读数日为 null）
  route('GET /energy/devices/:deviceId/daily-stats', ({ params }) =>
    getDeviceDailyStats(Number(params.deviceId)),
  ),
  // §2.9 设备电能参数曲线（period=today/7d/30d；dataIDs=CET DataID 逗号串，缺省=全部；4.2④ 测点抽屉用）
  route('GET /energy/devices/:deviceId/param-curve', ({ params, query }) =>
    getParamCurve(Number(params.deviceId), String(query.period ?? 'today'), query.dataIDs),
  ),
  // §4.1 按箱柜编号查询巡检记录
  route('GET /operation/inspection-records', ({ query }) =>
    getInspectionByDeviceNumber(query.deviceNumber ?? ''),
  ),
  // §4.2 按箱柜编号查询缺陷记录（仅新表单记录）
  route('GET /operation/defect-records', ({ query }) =>
    getDefectByDeviceNumber(query.deviceNumber ?? ''),
  ),
  // §4.3 缺陷处理状态统计（buildingId 口径已随契约 v5.4.2 落地）
  route('GET /operation/defect-records/stats', ({ query }) => getDefectStats(query)),
  // §4.5 箱柜缺陷联合查询（分页；行序同 §1.4；传任一筛选后仅返回有匹配缺陷的箱柜）
  route('GET /operation/cabinet-defects', ({ query }) => getCabinetDefects(query)),

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

  // ── 配置中心（§5.33 数据类型字典：4.2④ 测点抽屉曲线参数列表用）──
  route('GET /configuration/data-types', () => getCetDataTypes()),

  // ── 配置中心（§5 第五章 + §7.6 模板；写链路分批补：字典三板块本批交付，
  //    通道/设备/箱柜/评估/模板/监控/能耗统计写随批次 2-4）──
  // §5.1/§5.5/§5.20 字典三板块列表（板块内自洽副本）
  route('GET /configuration/device-types', () => getDeviceTypes()),
  route('GET /configuration/switchings', () => getSwitchings()),
  route('GET /configuration/buildings', () => getBuildings()),
  // §5.2/§5.3/§5.4 设备类型增删改（重名 code=0；有关联箱柜不可删）
  route('POST /configuration/device-types', ({ body }) => addDeviceType(asBody(body))),
  route('POST /configuration/device-types/:id/rename', ({ params, body }) =>
    renameDeviceType(Number(params.id), asBody(body)),
  ),
  route('POST /configuration/device-types/:id/delete', ({ params }) =>
    deleteDeviceType(Number(params.id)),
  ),
  // §5.6/§5.7/§5.8 配电房增删改
  route('POST /configuration/switchings', ({ body }) => addSwitching(asBody(body))),
  route('POST /configuration/switchings/:id/rename', ({ params, body }) =>
    renameSwitching(Number(params.id), asBody(body)),
  ),
  route('POST /configuration/switchings/:id/delete', ({ params }) =>
    deleteSwitching(Number(params.id)),
  ),
  // §5.21/§5.22/§5.23 楼栋增删改（删除事务级联清能耗映射）
  route('POST /configuration/buildings', ({ body }) => addBuilding(asBody(body))),
  route('POST /configuration/buildings/:id/rename', ({ params, body }) =>
    renameBuilding(Number(params.id), asBody(body)),
  ),
  route('POST /configuration/buildings/:id/delete', ({ params }) =>
    deleteBuilding(Number(params.id)),
  ),
  // §5.9 通道 / §5.13 设备（?filter= 三档筛选）/ §5.15 箱柜 / §5.19 联想检索（只读，写随批次 2）
  route('GET /configuration/channels', () => getChannels()),
  route('GET /configuration/devices', ({ query }) => getDevices((query.filter ?? '') as DeviceFilter)),
  route('GET /configuration/cabinets', () => getCabinets()),
  route('GET /configuration/cabinets/fuzzy-search', ({ query }) =>
    searchCabinets(query.keyword ?? ''),
  ),
  // §5.24/§5.29 楼栋/楼层能耗统计（只读，写随批次 4；buildingId 空串=全量）
  route('GET /configuration/building-stats', ({ query }) =>
    getBuildingStats(query.buildingId === '' || query.buildingId == null ? undefined : Number(query.buildingId)),
  ),
  route('GET /configuration/building-floor-stats', ({ query }) =>
    getConfigFloorStats(query.buildingId === '' || query.buildingId == null ? undefined : Number(query.buildingId)),
  ),
  // §7.6.1/§7.6.2 健康度模板列表与整树（只读，写随批次 3）
  route('GET /health/templates', () => getHealthTemplateList()),
  route('GET /health/templates/:id', ({ params }) => getHealthTemplateTree(Number(params.id))),
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
