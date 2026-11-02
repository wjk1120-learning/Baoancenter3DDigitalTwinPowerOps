import type { AxiosRequestConfig } from 'axios'

/** 后端统一信封：成败看 code，不是 HTTP 状态（401/403 除外） */
export interface BaseResult<T> {
  code: number
  msg?: unknown
  data: T
}

/** silent：后台/可降级请求失败不 toast、不标离线 */
export type RequestConfig = AxiosRequestConfig & { silent?: boolean }

export interface HttpClientOptions {
  baseURL: string
  timeout?: number
  /** 读 session 写 Authorization。authAnon 必须 false */
  withAuth: boolean
  /** HTTP 401 时清 session 并跳认证中心。authAnon 必须 false，避免交换失败连环跳 */
  redirectOn401: boolean
  /** 仅 GET + 5xx/网络闪断重试一次（FY 开，auth 关） */
  retryGetOn5xx: boolean
  /** 非 silent 失败时打 sourceOffline（FY 开，auth 关） */
  trackOffline: boolean
}
