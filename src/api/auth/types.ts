export interface AuthUserInfo {
  id: number
  name: string
  account: string
  phone: string
  postId: number
  postName: string
  dutyStatus: number
  responsibleArea: string
  userLevel: number
}

/** 与 4.1 登录 / 4.4 票据交换同构 */
export interface LoginVo {
  token: string
  tokenType: string
  expiresAt: string
  user: AuthUserInfo
}

export interface TicketVo {
  ticket: string
  expiresIn: number
}
