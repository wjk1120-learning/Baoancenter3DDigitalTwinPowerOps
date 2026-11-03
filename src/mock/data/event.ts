import type { EventBrief } from '../../api/event/types'

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
  { eventId: 'BZ-EV-0103', timeStr: ago(47), eventLevel: 3, deviceName: '2#变 P03/T1 进线柜', description: '抽屉单元二次插件接触不良提示', handleStatus: 0, locations: null },
  { eventId: 'BZ-EV-0104', timeStr: ago(65), eventLevel: 2, deviceName: '3#变 P05/T1 配电柜', description: '母线电压波动越限（-7%）', handleStatus: 1, locations: [{ building: 1, floor: '1' }] },
  { eventId: 'BZ-EV-0105', timeStr: ago(90), eventLevel: 4, deviceName: '4#变 P04/T1 配电柜', description: '柜内风机自检提示', handleStatus: 0, locations: null },
  { eventId: 'BZ-EV-0106', timeStr: ago(130), eventLevel: 3, deviceName: '5#变 P01/T1 进线柜', description: '计量回路通讯瞬时中断（已自恢复）', handleStatus: 0, locations: null },
  { eventId: 'BZ-EV-0107', timeStr: ago(240), eventLevel: 2, deviceName: '6#变 P02/T1 电容柜', description: '功率因数低于 0.9（持续 10 分钟）', handleStatus: 0, locations: [{ building: 1, floor: '1' }] },
  { eventId: 'BZ-EV-0108', timeStr: ago(300), eventLevel: 1, deviceName: '1#变 P06/T1 配电柜', description: '馈线回路漏电流越限（紧急）', handleStatus: 1, locations: [{ building: 1, floor: '1' }] },
]
