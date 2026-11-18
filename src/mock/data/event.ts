import type { BuildingDailyAlarm, EventBrief } from '../../api/event/types'

const now = Date.now()
const ago = (minutes: number): string => {
  const d = new Date(now - minutes * 60_000)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

/**
 * 事件假数据（EventBrief = REST 线上结构，契约见 docs/福永接口契约参考-FY-Hospital-API.md）。
 * 设备名取自宝中 power-rooms.json 的真实柜位；标记处理直接改本数组，
 * /event/stats、/event/grouped 实时重算，处理动作立刻可见。
 */
export const eventRows: EventBrief[] = [
  { eventId: 'BZ-EV-0101', timeStr: ago(3), eventLevel: 1, deviceName: '1#变 P06/T1 配电柜', description: '进线断路器温度告警（75℃，阈值 70℃）', handleStatus: 0, locations: [{ building: 1, floor: '1' }] },
  { eventId: 'BZ-EV-0102', timeStr: ago(18), eventLevel: 2, deviceName: '1#变 P02/T1 电容柜', description: 'C 相电流越限（持续 5 分钟）', handleStatus: 0, locations: [{ building: 1, floor: '1' }] },
  { eventId: 'BZ-EV-0103', timeStr: ago(47), eventLevel: 3, deviceName: '2#变 P08/T2 配电柜', description: '抽屉单元二次插件接触不良提示', handleStatus: 0, locations: null },
  { eventId: 'BZ-EV-0104', timeStr: ago(65), eventLevel: 2, deviceName: '3#变 P06/T3 配电柜', description: '母线电压波动越限（-7%）', handleStatus: 1, locations: [{ building: 1, floor: '1' }] },
  { eventId: 'BZ-EV-0105', timeStr: ago(90), eventLevel: 4, deviceName: '4#变 P04/T4 配电柜', description: '柜内风机自检提示', handleStatus: 0, locations: null },
  { eventId: 'BZ-EV-0106', timeStr: ago(130), eventLevel: 3, deviceName: '5#变 1P03 配电柜', description: '计量回路通讯瞬时中断（已自恢复）', handleStatus: 0, locations: null },
  { eventId: 'BZ-EV-0107', timeStr: ago(240), eventLevel: 2, deviceName: '6#变 2P03 电容柜', description: '功率因数低于 0.9（持续 10 分钟）', handleStatus: 0, locations: [{ building: 1, floor: '1' }] },
  { eventId: 'BZ-EV-0108', timeStr: ago(300), eventLevel: 1, deviceName: '1#变 P06/T1 配电柜', description: '馈线回路漏电流越限（紧急）', handleStatus: 1, locations: [{ building: 1, floor: '1' }] },
]


// ---- §3.7/§3.8 楼栋告警统计（3D 楼栋信息卡；从 eventRows 真实过滤/派生） ----

/** 楼栋当日事件行（locations 无解析条目的事件不归属任何楼栋） */
function eventsOfBuilding(buildingId: number) {
  return eventRows.filter((e) => e.locations?.some((l) => l.building === buildingId))
}

/** §3.7 楼栋当前告警数 = 该楼今日未处理（handleStatus=0）事件数 */
export function getBuildingCurrentAlarmCount(buildingId: number): number {
  return eventsOfBuilding(buildingId).filter((e) => e.handleStatus === 0).length
}

/** §3.8 楼栋近 7 日每日告警数（2026-11-18 后端口径变更：不含今天，截至昨日共 7 个
 *  完整日、升序）。数值 = 种子确定性伪随机（0~4 条），刷新不变。 */
export function getBuildingDailyAlarms(buildingId: number): BuildingDailyAlarm[] {
  const out: BuildingDailyAlarm[] = []
  const now = new Date()
  for (let i = 7; i >= 1; i--) {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i)
    const pad = (n: number) => String(n).padStart(2, '0')
    const day = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
    const count = ((buildingId * 7 + i) * 137) % 5
    out.push({ date: day, alarmCount: count })
  }
  return out
}
