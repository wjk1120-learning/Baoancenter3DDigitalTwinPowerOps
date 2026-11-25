import { issueJumpTicket } from '../api/auth/auth'
import { OPERATIONS_EXTERNAL_URL } from '../config/authConfig'
import { globalMessage } from './message'

/**
 * 已登录跳运维平台（福永同款免登）：先 POST /auth/tickets 用当前会话签发一次性
 * 跳转票据（60 秒有效、单次使用），再拼 ?ticket= 新开窗口——运维平台侧自动换票免登。
 * 未配置地址时仅提示不跳转；签发失败 toast 后端 msg（认证中心 401 会经拦截器整页跳登录）。
 */
export async function openOperationsPlatform(): Promise<void> {
  const base = OPERATIONS_EXTERNAL_URL.trim()
  if (!base) {
    globalMessage()?.warning('运维平台未配置独立地址')
    return
  }
  try {
    const { ticket } = await issueJumpTicket()
    const url = new URL(base)
    url.searchParams.set('ticket', ticket)
    window.open(url.toString(), '_blank')
  } catch (e) {
    const msg = e instanceof Error ? e.message : '签发跳转票据失败'
    globalMessage()?.error(msg)
  }
}
