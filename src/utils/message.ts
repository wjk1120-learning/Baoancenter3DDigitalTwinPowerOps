import type { MessageApi } from 'naive-ui'

/**
 * naive UI 全局 message 单例。
 * 由 MessageBridge 组件在 NMessageProvider 内注入（组件外拿不到 provider 上下文）；
 * 请求层等非组件代码通过 globalMessage() 取用，未就绪时静默跳过。
 */
let api: MessageApi | null = null

export function bindGlobalMessage(m: MessageApi) {
  api = m
}

export function globalMessage(): MessageApi | null {
  return api
}
