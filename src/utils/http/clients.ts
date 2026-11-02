// BAOAN NOTE: contract aligned with Fuyong FY API v3.x; backend hosts TBD at integration stage.

/**
 * HTTP client 分工（必须按表选用，禁止混用 / 禁止再 axios.create）
 *
 * | 导出          | 代理路径     | 后端                  | 带 token | 401 跳认证中心 | 用途                         |
 * |---------------|--------------|-----------------------|----------|----------------|------------------------------|
 * | bzHttp        | /bz-hospital | :8080（139.196.16.252）| 是      | 是             | 设备/能耗/事件/运维全模块    |
 * | authHttp      | /auth        | :8088 认证中心        | 是       | 是             | 4.2 logout、4.3 tickets      |
 * | authAnonHttp  | /auth        | :8088 认证中心        | 否       | 否             | 仅 4.4 exchange（启动时匿名）|
 *
 * 2026-10-14：数据后端迁移至 139.196.16.252:8080（FY API v3.53），缺陷 4.3/4.4/4.5
 * 已并入同一 FY 后端 → 原 opsHttp（/FY → 8088 运维平台）整链移除。
 * 风险兜底：exchange 走 authAnonHttp，失败只抛错，不会把整页踢去认证中心。
 */
import { createHttpClient, httpGet, httpPost } from './createClient'
import type { RequestConfig } from './types'

// 不用 /FY 是因为它已被同机部署的运维平台占用（nginx /FY → 8088）；
// /bz-hospital 由 nginx（或开发代理）重写回 /FY 再转 8080 的 FY 医院后端
export const BZ_BASE = '/bz-hospital'
export const AUTH_BASE = '/auth'
export const CET_FETCH_TIMEOUT_MS = 25_000

export const bzHttp = createHttpClient({
  baseURL: BZ_BASE,
  withAuth: true,
  redirectOn401: true,
  retryGetOn5xx: true,
  trackOffline: true,
})

export const authHttp = createHttpClient({
  baseURL: AUTH_BASE,
  timeout: 15_000,
  withAuth: true,
  redirectOn401: true,
  retryGetOn5xx: false,
  trackOffline: false,
})

export const authAnonHttp = createHttpClient({
  baseURL: AUTH_BASE,
  timeout: 15_000,
  withAuth: false,
  redirectOn401: false,
  retryGetOn5xx: false,
  trackOffline: false,
})

export function bzGet<T>(
  url: string,
  params?: Record<string, unknown>,
  config?: RequestConfig,
): Promise<T> {
  return httpGet<T>(bzHttp, url, params, config)
}

export function bzPost<T>(url: string, body?: unknown, config?: RequestConfig): Promise<T> {
  return httpPost<T>(bzHttp, url, body, config)
}

export function authPost<T>(url: string, body?: unknown, config?: RequestConfig): Promise<T> {
  return httpPost<T>(authHttp, url, body, config)
}

export function authAnonPost<T>(url: string, body?: unknown, config?: RequestConfig): Promise<T> {
  return httpPost<T>(authAnonHttp, url, body, config)
}
