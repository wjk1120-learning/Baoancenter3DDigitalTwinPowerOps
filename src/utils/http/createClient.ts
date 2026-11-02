import axios from 'axios'
import type { AxiosInstance } from 'axios'
import { sourceOffline } from '../offline'
import { globalMessage } from '../message'
import { readAuthToken } from '../session'
import { redirectUnauthorized } from '../authRedirect'
import type { BaseResult, HttpClientOptions, RequestConfig } from './types'

export const DEFAULT_TIMEOUT_MS = 8_000
const RETRY_DELAY_MS = 1_200

function isBaseResult(body: unknown): body is BaseResult<unknown> {
  return !!body && typeof body === 'object' && 'code' in body && 'data' in body
}

function resultMsg(body: unknown): string {
  if (isBaseResult(body) && typeof body.msg === 'string' && body.msg.trim()) return body.msg.trim()
  return ''
}

function extractMsg(err: unknown): string {
  const e = err as { response?: { data?: unknown }; message?: string } | undefined
  const msg = resultMsg(e?.response?.data)
  if (msg) return msg
  return e?.message || '网络请求失败，请检查服务是否可达'
}

let lastToastAt = 0
function toastOnce(msg: string) {
  const now = Date.now()
  if (now - lastToastAt < 1000) return
  lastToastAt = now
  globalMessage()?.error(msg)
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

function isRetryable(
  retryGetOn5xx: boolean,
  err: {
    config?: RequestConfig & { _retried?: boolean }
    code?: string
    response?: { status: number }
  },
): boolean {
  if (!retryGetOn5xx) return false
  if ((err.config?.method ?? 'get').toLowerCase() !== 'get') return false
  if (err.config?._retried) return false
  if (err.code === 'ECONNABORTED') return false
  if (err.response) return err.response.status >= 500
  return true
}

/** 三个业务 client 的唯一拦截器实现。不要在 api 层再 axios.create。 */
export function createHttpClient(options: HttpClientOptions): AxiosInstance {
  const instance = axios.create({
    baseURL: options.baseURL,
    timeout: options.timeout ?? DEFAULT_TIMEOUT_MS,
  })

  instance.interceptors.request.use((config) => {
    if (options.withAuth) {
      const token = readAuthToken()
      if (token) {
        config.headers = config.headers ?? {}
        config.headers.Authorization = `Bearer ${token}`
      }
    }
    return config
  })

  instance.interceptors.response.use(
    (res) => {
      if (options.trackOffline) sourceOffline.value = false
      const body = res.data
      if (isBaseResult(body)) {
        if (body.code === 1) return body.data
        const msg = resultMsg(body) || '请求失败'
        if (!(res.config as RequestConfig).silent) toastOnce(msg)
        return Promise.reject(new Error(msg))
      }
      return body
    },
    async (err) => {
      const cfg: RequestConfig & { _retried?: boolean } = err.config ?? {}
      const status = err.response?.status as number | undefined

      if (status === 401) {
        if (options.redirectOn401) redirectUnauthorized()
        return Promise.reject(new Error(resultMsg(err.response?.data) || '未登录或令牌已失效'))
      }

      // FY-Hospital-API：403 只提示，不跳登录
      if (status === 403) {
        const msg = extractMsg(err) || '无权限执行该操作'
        if (!cfg.silent) toastOnce(msg)
        return Promise.reject(new Error(msg))
      }

      if (isRetryable(options.retryGetOn5xx, err)) {
        cfg._retried = true
        await sleep(RETRY_DELAY_MS)
        return instance(cfg)
      }

      if (options.trackOffline && !cfg.silent) sourceOffline.value = true
      const msg = extractMsg(err)
      if (!cfg.silent) toastOnce(msg)
      return Promise.reject(new Error(msg))
    },
  )

  return instance
}

export function httpGet<T>(
  client: AxiosInstance,
  url: string,
  params?: Record<string, unknown>,
  config?: RequestConfig,
): Promise<T> {
  return client.get(url, { ...config, ...(params ? { params } : undefined) }) as Promise<T>
}

export function httpPost<T>(
  client: AxiosInstance,
  url: string,
  body?: unknown,
  config?: RequestConfig,
): Promise<T> {
  return client.post(url, body, config) as Promise<T>
}
