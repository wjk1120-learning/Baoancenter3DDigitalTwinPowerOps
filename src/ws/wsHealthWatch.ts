import { WS_DISCONNECT_GRACE_MS, WS_HEALTH_CHECK_MS, WS_STALE_MS } from '../config/refreshConfig'

/**
 * WebSocket 健康监测：服务端每 1 分钟推心跳 ping 证明通道活着；
 * 超过 staleMs 无任何消息（半死连接：NAT 超时/代理静默丢弃，onclose 不触发）
 * 或断线超过宽限期 → 触发 REST 兜底（按 staleMs 节流，防重连循环刷出请求风暴）。
 */
export class WsHealthWatch {
  private lastMessageAt = 0
  private lastFiredAt = 0
  private graceTimer: number | null = null
  private watchTimer: number | null = null
  private staleHandlers = new Set<() => void>()
  private active = false
  private readonly staleMs: number
  private readonly checkMs: number
  private readonly graceMs: number

  constructor(
    staleMs = WS_STALE_MS,
    checkMs = WS_HEALTH_CHECK_MS,
    graceMs = WS_DISCONNECT_GRACE_MS,
  ) {
    this.staleMs = staleMs
    this.checkMs = checkMs
    this.graceMs = graceMs
  }

  setActive(on: boolean) {
    this.active = on
    if (on) {
      if (!this.lastMessageAt) this.lastMessageAt = Date.now()
      this.startWatch()
    } else {
      this.stopWatch()
      this.clearGrace()
    }
  }

  /** 收到任何消息（心跳/数据）时刷新存活计时 */
  touch() {
    this.lastMessageAt = Date.now()
    this.clearGrace()
  }

  onStale(handler: () => void) {
    this.staleHandlers.add(handler)
    return () => this.staleHandlers.delete(handler)
  }

  /** 断线：宽限期内重连恢复（touch）则不降级；持续断线由节流后的兜底接管 */
  notifyDisconnected() {
    if (this.graceTimer != null) return
    this.graceTimer = setTimeout(() => {
      this.graceTimer = null
      this.fireStale()
    }, this.graceMs)
  }

  destroy() {
    this.stopWatch()
    this.clearGrace()
    this.staleHandlers.clear()
    this.active = false
  }

  private startWatch() {
    if (this.watchTimer != null) return
    this.watchTimer = setInterval(() => {
      if (!this.active || this.staleHandlers.size === 0) return
      if (Date.now() - this.lastMessageAt >= this.staleMs) this.fireStale()
    }, this.checkMs)
  }

  private fireStale() {
    const now = Date.now()
    if (now - this.lastFiredAt < this.staleMs) return
    this.lastFiredAt = now
    for (const h of this.staleHandlers) h()
    this.lastMessageAt = now
  }

  private clearGrace() {
    if (this.graceTimer != null) {
      clearTimeout(this.graceTimer)
      this.graceTimer = null
    }
  }

  private stopWatch() {
    if (this.watchTimer != null) {
      clearInterval(this.watchTimer)
      this.watchTimer = null
    }
  }
}
