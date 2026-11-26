/**
 * HTTP client 分工（必须按表选用，禁止混用 / 禁止再 axios.create）
 *
 * | 导出         | 代理路径     | 用途                          |
 * |--------------|--------------|-------------------------------|
 * | bzHttp       | /bz-hospital | 数据后端：设备/能耗/事件/缺陷 |
 * | authHttp     | /auth        | 认证中心：logout、tickets     |
 * | authAnonHttp | /auth        | 认证中心：仅 exchange（匿名） |
 *
 * 联调切换（2026-11-25）：真实后端经 vite/nginx 代理转发（/bz-hospital → /BZ），
 * 演示期假数据 adapter 已随之退役。
 */
import { createHttpClient, httpGet, httpPost } from './createClient'
import type { RequestConfig } from './types'

// /bz-hospital 由 vite 代理（生产由 nginx）转发宝中数据后端；/auth 转认证中心
export const BZ_BASE = '/bz-hospital'
export const AUTH_BASE = '/auth'
/** 数据接口统一长超时（事件同步/标记处理等慢接口用） */
export const DATA_FETCH_TIMEOUT_MS = 25_000

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
