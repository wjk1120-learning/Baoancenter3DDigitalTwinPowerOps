import { coerceEventInfo, mapEventInfoToAlert } from '../api/event/mappers'
import type { EventInfo } from '../api/event/types'
import type { AlertItem } from '../api/hospital/types'
import { WsHealthWatch } from './wsHealthWatch'
import { buildWsUrl } from './wsUrl'

type ListHandler = (items: AlertItem[]) => void
type SingleHandler = (item: AlertItem) => void

/**
 * 事件 WebSocket（/ws/event，契约 §八 8.1）——医院总览「告警信息」实时数据源。
 * 只认契约三种消息名：today_events（全量替换）/ event（单条新事件，level≤2）/
 * event_handled（单条已处理）；其余消息名一律忽略（不做别名兜底）。
 * 服务端每 1 分钟推心跳 ping（证明通道活着），客户端回 pong；
 * 断线指数退避重连（1s×2^n 封顶 15s），半死连接由 WsHealthWatch stale 检测接管。
 */
class EventPushSocket {
  private ws: WebSocket | null = null
  private listHandlers = new Set<ListHandler>()
  private singleHandlers = new Set<SingleHandler>()
  private handledHandlers = new Set<SingleHandler>()
  private openHandlers = new Set<() => void>()
  private closeHandlers = new Set<() => void>()
  private reconnectTimer: number | null = null
  private reconnectAttempt = 0
  private manuallyClosed = false
  private readonly health = new WsHealthWatch()

  private url() {
    return buildWsUrl('/ws/event')
  }

  /** today_events：今日告警全量推送（服务端权威，消费方整表替换） */
  onTodayList(handler: ListHandler) {
    this.listHandlers.add(handler)
    this.syncActive()
    this.connect()
    return () => {
      this.listHandlers.delete(handler)
      this.syncActive()
      this.maybeDisconnect()
    }
  }

  /** event：单条新事件（消费方防抖触发 §3.1 全量重拉，不做本地插入） */
  onSingle(handler: SingleHandler) {
    this.singleHandlers.add(handler)
    this.syncActive()
    this.connect()
    return () => {
      this.singleHandlers.delete(handler)
      this.syncActive()
      this.maybeDisconnect()
    }
  }

  /** event_handled：单条已处理通知（消费方更新本地对应行状态） */
  onHandled(handler: SingleHandler) {
    this.handledHandlers.add(handler)
    this.syncActive()
    this.connect()
    return () => {
      this.handledHandlers.delete(handler)
      this.syncActive()
      this.maybeDisconnect()
    }
  }

  /** 连接建立（重连成功后消费方重拉 §3.1 补齐断线间隙） */
  onOpen(handler: () => void) {
    this.openHandlers.add(handler)
    return () => this.openHandlers.delete(handler)
  }

  /** 连接断开（消费方标记「重连中」状态） */
  onClose(handler: () => void) {
    this.closeHandlers.add(handler)
    return () => this.closeHandlers.delete(handler)
  }

  /** stale：长时间无消息（半死连接）——消费方标记数据延迟并 REST 兜底 */
  onStale(handler: () => void) {
    return this.health.onStale(handler)
  }

  private syncActive() {
    this.health.setActive(this.listHandlers.size > 0 || this.singleHandlers.size > 0 || this.handledHandlers.size > 0)
  }

  private maybeDisconnect() {
    if (this.listHandlers.size === 0 && this.singleHandlers.size === 0 && this.handledHandlers.size === 0) {
      this.disconnect()
    }
  }

  connect() {
    if (this.ws?.readyState === WebSocket.OPEN || this.ws?.readyState === WebSocket.CONNECTING) return
    this.manuallyClosed = false
    this.ws = new WebSocket(this.url())
    this.ws.onopen = () => {
      this.reconnectAttempt = 0
      this.health.touch()
      for (const h of this.openHandlers) h()
    }
    this.ws.onmessage = (ev) => this.handleMessage(String(ev.data))
    this.ws.onclose = () => {
      this.health.notifyDisconnected()
      for (const h of this.closeHandlers) h()
      this.scheduleReconnect()
    }
    this.ws.onerror = () => this.ws?.close()
  }

  private handleMessage(raw: string) {
    let msg: { type?: string; data?: unknown }
    try {
      msg = JSON.parse(raw)
    } catch {
      return
    }
    if (msg.type === 'ping') {
      this.health.touch()
      this.ws?.send(JSON.stringify({ type: 'pong' }))
      return
    }

    const type = String(msg.type ?? '')
    const payload = msg.data !== undefined ? msg.data : msg

    // today_events 的 data 是数组，必须在单条归一之前分流（否则被单条校验拦截）
    if (type === 'today_events') {
      const list = (Array.isArray(payload) ? payload : [payload])
        .map(coerceEventInfo)
        .filter((e): e is EventInfo => e != null)
        .map(mapEventInfoToAlert)
      this.health.touch()
      for (const h of this.listHandlers) h(list)
      return
    }

    if (type === 'event_handled' || type === 'event') {
      const one = coerceEventInfo(payload)
      if (!one) return
      this.health.touch()
      const item = mapEventInfoToAlert(one)
      if (type === 'event_handled') {
        for (const h of this.handledHandlers) h(item)
      } else {
        for (const h of this.singleHandlers) h(item)
      }
    }
    // 其余消息名一律忽略（契约 §八 只有三种）
    // 其余消息名一律忽略（契约 §八 只有三种）
  }

  private scheduleReconnect() {
    if (this.manuallyClosed) return
    if (this.listHandlers.size === 0 && this.singleHandlers.size === 0 && this.handledHandlers.size === 0) return
    const delay = Math.min(1000 * 2 ** this.reconnectAttempt, 15_000)
    this.reconnectAttempt += 1
    this.reconnectTimer = setTimeout(() => this.connect(), delay)
  }

  disconnect() {
    this.manuallyClosed = true
    if (this.reconnectTimer != null) clearTimeout(this.reconnectTimer)
    this.reconnectTimer = null
    this.ws?.close()
    this.ws = null
  }
}

export const eventPushSocket = new EventPushSocket()
