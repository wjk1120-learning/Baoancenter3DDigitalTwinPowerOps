import type { AxiosResponse, InternalAxiosRequestConfig } from 'axios'
import { matchRoute } from './routes'

/** 假延迟：让页面 loading 态可见，也更接近真实链路 */
const MOCK_LATENCY_MS = 120

function envelope(data: unknown): { code: number; msg: string; data: unknown } {
  return { code: 1, msg: 'ok', data }
}

/**
 * axios 官方 adapter 位拦截（挂点在 utils/http/clients.ts）：
 * 请求仍走 utils/http 完整拦截器（信封解包/401/重试），只是不出网络。
 * 命中 routes 返回数据；未命中 console.warn + 空信封，页面拿空数据继续渲染，
 * 缺口对照 mock/README.md 随阶段 4 页面补路由。
 */
export function mockAdapter(config: InternalAxiosRequestConfig): Promise<AxiosResponse> {
  const method = (config.method ?? 'get').toUpperCase()
  const [rawPath, search = ''] = (config.url ?? '').split('?')
  const query: Record<string, string> = { ...Object.fromEntries(new URLSearchParams(search)) }
  for (const [k, v] of Object.entries((config.params ?? {}) as Record<string, unknown>)) {
    query[k] = String(v)
  }
  let body: unknown
  if (typeof config.data === 'string' && config.data) {
    try {
      body = JSON.parse(config.data)
    } catch {
      body = config.data
    }
  } else if (config.data != null) {
    body = config.data
  }

  const hit = matchRoute(method, rawPath)
  return new Promise((resolve) => {
    setTimeout(() => {
      let data: { code: number; msg: string; data: unknown }
      if (hit) {
        data = envelope(hit.handler({ params: hit.params, query, body }))
      } else {
        console.warn(`[mock] 未命中路由: ${method} ${rawPath}（去 src/mock/routes.ts 补）`)
        data = envelope(null)
      }
      resolve({ data, status: 200, statusText: 'OK', headers: {}, config })
    }, MOCK_LATENCY_MS)
  })
}
