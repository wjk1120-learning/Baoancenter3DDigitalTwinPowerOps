import { readAuthToken } from '../utils/session'

/** FY-Hospital-API §八：WS 握手校验令牌，浏览器无法携带 Authorization 头，
 *  连接地址追加 query 参数 ?token=<jwt>（token 为认证中心签发的 JWT） */
export function buildWsUrl(path: string): string {
  const proto = location.protocol === 'https:' ? 'wss:' : 'ws:'
  const token = readAuthToken()
  const suffix = token ? `?token=${encodeURIComponent(token)}` : ''
  return `${proto}//${location.host}${path}${suffix}`
}
