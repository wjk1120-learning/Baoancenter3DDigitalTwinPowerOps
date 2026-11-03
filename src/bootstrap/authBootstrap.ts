import { exchangeTicket } from '../api/auth/auth'
import { writeAuthSession, clearAuthSession, readAuthToken } from '../utils/session'

/** 路由初始化会用创建时捕获的地址（含 ticket）覆写 URL，故需导出供挂载后再清一次 */
export function stripTicketFromUrl(): void {
  const params = new URLSearchParams(window.location.search)
  if (!params.has('ticket')) return
  params.delete('ticket')
  const q = params.toString()
  const clean = window.location.pathname + (q ? `?${q}` : '') + window.location.hash
  history.replaceState(null, '', clean)
}

/**
 * 正常途径：URL 带 ticket → 4.4 交换成功才有会话。
 * 失败或无 ticket：不进业务页，由路由守卫整页跳运维登录页。
 */
export async function runAuthBootstrap(): Promise<void> {
  const params = new URLSearchParams(window.location.search)
  const ticket = params.get('ticket')?.trim()
  if (!ticket) return

  try {
    const data = await exchangeTicket(ticket)
    writeAuthSession(data)
  } catch {
    // ticket 一次性且 60 秒有效，重复打开同一跳转链接必失败；
    // 票据失败不代表本地会话失效，已有 token 时保留，由业务请求 401 兜底清除
    if (!readAuthToken()) clearAuthSession()
  }
  stripTicketFromUrl()
}
