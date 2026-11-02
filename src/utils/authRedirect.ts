import { AUTH_CENTER_LOGIN_URL } from '../config/authConfig'
import { clearAuthSession } from './session'

let redirecting = false

/** 清会话后整页跳运维平台登录页（无本地提示页） */
export function redirectUnauthorized(): void {
  clearAuthSession()
  if (redirecting) return
  // TODO(4.0): remove this guard once VITE_AUTH_LOGIN_URL lands in .env
  if (!AUTH_CENTER_LOGIN_URL) return
  redirecting = true
  window.location.replace(AUTH_CENTER_LOGIN_URL)
}
