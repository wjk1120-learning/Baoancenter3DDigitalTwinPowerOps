import type { LoginVo, TicketVo } from './types'
import { authAnonPost, authPost } from '../../utils/http'

/** 4.4 票据交换：必须走 authAnonHttp（不带 token、401 不整页跳转） */
export function exchangeTicket(ticket: string): Promise<LoginVo> {
  return authAnonPost<LoginVo>('/exchange', { ticket })
}

/** 4.3 签发跳转票据：必须走 authHttp（带当前 token） */
export function issueJumpTicket(): Promise<TicketVo> {
  return authPost<TicketVo>('/tickets')
}

/** 4.2 退出登录 */
export function logoutOnServer(): Promise<void> {
  return authPost<null>('/logout').then(() => undefined)
}
