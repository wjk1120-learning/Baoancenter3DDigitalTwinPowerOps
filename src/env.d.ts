/// <reference types="vite/client" />

declare module '*.vue' {
  import type { DefineComponent } from 'vue'
  const component: DefineComponent<Record<string, never>, Record<string, never>, unknown>
  export default component
}

/** ezuikit-js v9.0.26 官方包未带 TS 类型，按本项目实际用到的面声明（README 示例口径） */
declare module 'ezuikit-js' {
  export interface EZUIKitPlayerOptions {
    /** 容器 DOM 的 id（EZUIKit 按字符串定位，不支持直接传元素） */
    id: string
    url: string
    accessToken: string
    width?: number
    height?: number
    /** 播放模板：pcLive 直播 / pcRec 回放 */
    template?: string
    /** 播放器错误回调（token 失效/设备离线等） */
    handleError?: (err: { type: string; data?: Record<string, unknown> }) => void
  }

  export class EZUIKitPlayer {
    constructor(options: EZUIKitPlayerOptions)
    eventEmitter: {
      on(event: string, cb: (payload?: unknown) => void): void
      off(event: string, cb?: (payload?: unknown) => void): void
    }
    play(): Promise<unknown>
    stop(): Promise<unknown>
    closeSound(): Promise<unknown>
    destroy(): void
    /** 事件名常量表（firstFrameDisplay / play / destroy 等，键名即事件名） */
    static EVENTS: Record<string, string>
  }
}
