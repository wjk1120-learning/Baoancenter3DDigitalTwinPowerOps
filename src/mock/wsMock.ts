import type { AlertItem } from '../api/hospital/types'
import type { EventBrief } from '../api/event/types'
import { eventRows } from './data/event'

type RecentHandler = (items: AlertItem[]) => void
type SingleHandler = (item: AlertItem) => void

/** 推送间隔 8~15s 随机（计划拍板：定时器模拟 WS 推送） */
const PUSH_MIN_MS = 8_000
const PUSH_MAX_MS = 15_000

function toAlertItem(e: EventBrief): AlertItem {
  return {
    id: e.eventId,
    time: e.timeStr,
    device: e.deviceName,
    content: e.description,
    level: e.eventLevel === 1 ? 'error' : 'warn',
    eventLevel: e.eventLevel as AlertItem['eventLevel'],
    system: '配电房',
    status: e.handleStatus === 1 ? 'done' : 'pending',
    deviceId: '',
    locations: e.locations ?? null,
    handleStatus: e.handleStatus,
  }
}

function pad(n: number): string {
  return String(n).padStart(2, '0')
}
function nowStr(): string {
  const d = new Date()
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

/**
 * 与 eventPushSocket 同接口的 mock：
 * - onRecent：订阅即回当前快照；之后每 8~15s 随选一条种子事件生成"新告警"走 onSingle
 * - onStale：永不触发（mock 通道视为常活，REST 兜底不会被拉起）
 * 4.1 落地 eventPushSocket 后，在它的 connect 内按 useMock() 分支换成本对象，消费方零改动。
 */
class WsMock {
  private recent = new Set<RecentHandler>()
  private single = new Set<SingleHandler>()
  private timer: number | null = null

  onRecent(h: RecentHandler): () => void {
    this.recent.add(h)
    h(this.snapshot())
    this.syncTimer()
    return () => {
      this.recent.delete(h)
      this.syncTimer()
    }
  }

  onSingle(h: SingleHandler): () => void {
    this.single.add(h)
    this.syncTimer()
    return () => {
      this.single.delete(h)
      this.syncTimer()
    }
  }

  /** mock 通道视为常活：永不触发 stale，仅保持接口兼容（实现允许比接口少参数） */
  onStale(): () => void {
    return () => {}
  }

  private snapshot(): AlertItem[] {
    return eventRows.map(toAlertItem)
  }

  private syncTimer() {
    const active = this.recent.size > 0 || this.single.size > 0
    if (active && this.timer == null) this.schedule()
    if (!active && this.timer != null) {
      window.clearTimeout(this.timer)
      this.timer = null
    }
  }

  private schedule() {
    this.timer = window.setTimeout(
      () => {
        this.timer = null
        this.pushOnce()
        if (this.recent.size > 0 || this.single.size > 0) this.schedule()
      },
      PUSH_MIN_MS + Math.floor(Math.random() * (PUSH_MAX_MS - PUSH_MIN_MS)),
    )
  }

  private pushOnce() {
    const seed = eventRows[Math.floor(Math.random() * eventRows.length)]!
    const item: AlertItem = {
      ...toAlertItem(seed),
      id: `mock-${Date.now()}`,
      time: nowStr(),
      handleStatus: 0,
      status: 'pending',
    }
    for (const h of this.single) h(item)
  }
}

export const wsMock = new WsMock()
