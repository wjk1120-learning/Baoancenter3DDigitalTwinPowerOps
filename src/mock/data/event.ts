import type { BuildingDailyAlarm, EventBrief } from '../../api/event/types'

const now = Date.now()
const ago = (minutes: number): string => {
  const d = new Date(now - minutes * 60_000)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}
/** n 天前（§3.11 跨日未处理样本用） */
const agoDays = (days: number, minutes: number): string => ago(days * 24 * 60 + minutes)

/** 本地时区今日 yyyy-MM-dd（§3.1 按它过滤出「今日」行） */
export function mockTodayStr(): string {
  const d = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

/**
 * 事件假数据（EventBrief = REST 线上结构，契约见 docs/FY-Hospital-API.md）。
 * 设备名取自宝中柜位命名（deviceName 即柜名，§3.10 mock 级联按它近似）。
 * 样本覆盖（2026-11-19 二期口径；**宝中楼栋无 G 层**——契约 floor "G" 是福永口径，
 * 宝中位置编号只解析出数字/负数（地下），引擎 GF 支持保留为通用能力）：
 *  - 多楼多层（1~6 号楼各层）+ 多位置一条 + 仅 3/4 级样本（不亮灯不进看板）
 *  - 跨日未处理（0109 昨日 / 0110 前日）——§3.11「未处理=活着=亮灯」核心样本
 *  - 地下层样本（0111，floor "-1"）——_under 未接入：有数据、无节点不亮灯（宁缺勿错）
 *  - 同柜级联样本（0101/0102 同柜名，处理任一条另一条一并置 1）
 *  - 已处理样本（0104/0108）
 * 标记处理直接改本数组；/event/stats、/event/grouped、/event/unhandled 实时重算。
 */
export const eventRows: EventBrief[] = [
  { eventId: 'BZ-EV-0101', timeStr: ago(3), eventLevel: 1, deviceName: '1#变 P06/T1 配电柜', description: '进线断路器温度告警（75℃，阈值 70℃）', handleStatus: 0, locations: [{ building: 1, floor: '1', locationNumber: 'FY-ZK-1F-01' }] },
  { eventId: 'BZ-EV-0102', timeStr: ago(18), eventLevel: 2, deviceName: '1#变 P06/T1 配电柜', description: 'C 相电流越限（持续 5 分钟）', handleStatus: 0, locations: [{ building: 1, floor: '3', locationNumber: 'FY-ZK-3F-02' }] },
  { eventId: 'BZ-EV-0103', timeStr: ago(47), eventLevel: 3, deviceName: '2#变 P08/T2 配电柜', description: '抽屉单元二次插件接触不良提示', handleStatus: 0, locations: [{ building: 2, floor: '2' }] },
  { eventId: 'BZ-EV-0104', timeStr: ago(65), eventLevel: 2, deviceName: '3#变 P06/T3 配电柜', description: '母线电压波动越限（-7%）', handleStatus: 1, locations: [{ building: 1, floor: '1' }] },
  { eventId: 'BZ-EV-0105', timeStr: ago(90), eventLevel: 4, deviceName: '4#变 P04/T4 配电柜', description: '柜内风机自检提示', handleStatus: 0, locations: [{ building: 6, floor: '6' }] },
  { eventId: 'BZ-EV-0106', timeStr: ago(130), eventLevel: 3, deviceName: '5#变 1P03 配电柜', description: '计量回路通讯瞬时中断（已自恢复）', handleStatus: 0, locations: null },
  { eventId: 'BZ-EV-0107', timeStr: ago(240), eventLevel: 2, deviceName: '6#变 2P03 电容柜', description: '功率因数低于 0.9（持续 10 分钟）', handleStatus: 0, locations: [{ building: 6, floor: '2' }] },
  { eventId: 'BZ-EV-0108', timeStr: ago(300), eventLevel: 1, deviceName: '1#变 P06/T1 配电柜', description: '馈线回路漏电流越限（紧急）', handleStatus: 1, locations: [{ building: 1, floor: '1' }] },
  { eventId: 'BZ-EV-0109', timeStr: agoDays(1, 120), eventLevel: 2, deviceName: '3#变 P06/T3 配电柜', description: '母线绝缘监测越限（昨日遗留未处理）', handleStatus: 0, locations: [{ building: 4, floor: '5' }] },
  { eventId: 'BZ-EV-0110', timeStr: agoDays(2, 200), eventLevel: 1, deviceName: '3#变 P01/T3 进线柜', description: '馈线回路漏电流越限（前日遗留未处理）', handleStatus: 0, locations: [{ building: 3, floor: '12' }] },
  { eventId: 'BZ-EV-0111', timeStr: ago(15), eventLevel: 2, deviceName: '1#变 P04/T1 配电柜', description: '地下层强电井温度越限（_under 未接入不亮灯样本）', handleStatus: 0, locations: [{ building: 3, floor: '-1' }] },
  { eventId: 'BZ-EV-0112', timeStr: ago(8), eventLevel: 1, deviceName: '2#变 P10/T2 配电柜', description: '进线柜局放异常（多点定位）', handleStatus: 0, locations: [{ building: 5, floor: '2', locationNumber: 'FY-XZ-2F-01' }, { building: 1, floor: '5', locationNumber: 'FY-ZK-5F-03' }] },
]

// ---- §3.7/§3.8 楼栋告警统计（3D 楼栋/楼层信息卡；从 eventRows 真实过滤/派生） ----

/** 楼栋事件行（locations 无解析条目的事件不归属任何楼栋；floor 可选精确匹配楼层） */
function eventsOfBuilding(buildingId: number, floor?: string) {
  return eventRows.filter((e) =>
    e.locations?.some((l) => l.building === buildingId && (floor == null || l.floor === floor)),
  )
}

/** §3.7 楼栋当前告警数 = 未处理（handleStatus=0）事件数；floor 可选按楼层筛选 */
export function getBuildingCurrentAlarmCount(buildingId: number, floor?: string): number {
  return eventsOfBuilding(buildingId, floor).filter((e) => e.handleStatus === 0).length
}

/** §3.8 楼栋近 7 日每日告警数（2026-11-18 后端口径变更：不含今天，截至昨日共 7 个
 *  完整日、升序）。数值 = 种子确定性伪随机（0~4 条），刷新不变；floor 可选参与种子
 *  （G 层计 0，同楼不同层序列错开）。 */
export function getBuildingDailyAlarms(buildingId: number, floor?: string): BuildingDailyAlarm[] {
  const floorNum = floor == null || floor === '' ? null : floor === 'G' ? 0 : Number(floor) || 0
  const out: BuildingDailyAlarm[] = []
  const now = new Date()
  for (let i = 7; i >= 1; i--) {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i)
    const pad = (n: number) => String(n).padStart(2, '0')
    const day = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
    const salt = floorNum == null ? 0 : floorNum * 13 + 5
    const count = ((buildingId * 7 + salt + i) * 137) % 5
    out.push({ date: day, alarmCount: count })
  }
  return out
}
