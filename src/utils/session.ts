import type { AuthUserInfo, LoginVo } from '../api/auth/types'
import {
  AUTH_TOKEN_STORAGE_KEY,
  AUTH_USER_STORAGE_KEY,
} from '../config/authConfig'

/** token 写入或清除后发出，WS 用新 token 重连 */
export const AUTH_SESSION_EVENT = 'bz-auth-session'

export function readAuthToken(): string | null {
  const t = localStorage.getItem(AUTH_TOKEN_STORAGE_KEY)
  return t && t.trim() ? t.trim() : null
}

export function readAuthUser(): AuthUserInfo | null {
  const raw = localStorage.getItem(AUTH_USER_STORAGE_KEY)
  if (!raw) return null
  try {
    return JSON.parse(raw) as AuthUserInfo
  } catch {
    return null
  }
}

function emitSessionChange() {
  window.dispatchEvent(new Event(AUTH_SESSION_EVENT))
}

export function writeAuthSession(vo: LoginVo): void {
  localStorage.setItem(AUTH_TOKEN_STORAGE_KEY, vo.token)
  localStorage.setItem(AUTH_USER_STORAGE_KEY, JSON.stringify(vo.user))
  emitSessionChange()
}

export function clearAuthSession(): void {
  localStorage.removeItem(AUTH_TOKEN_STORAGE_KEY)
  localStorage.removeItem(AUTH_USER_STORAGE_KEY)
  emitSessionChange()
}
