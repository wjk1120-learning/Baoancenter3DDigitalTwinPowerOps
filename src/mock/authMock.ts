import { AUTH_TOKEN_STORAGE_KEY } from '../config/authConfig'
import { writeAuthSession } from '../utils/session'
import type { AuthUserInfo, LoginVo } from '../api/auth/types'

const MOCK_USER: AuthUserInfo = {
  id: 1,
  name: '宝安运维员',
  account: 'baoan-ops',
  phone: '13800000000',
  postId: 1,
  postName: '运维值班',
  dutyStatus: 1,
  responsibleArea: '全院',
  userLevel: 1,
}

/**
 * mock 会话播种：userLevel=1 内部人员（运维平台入口可见；外部人员=2 隐藏，4.0 验收项）。
 * 已有会话不覆盖；真登录链路 4.0 登录移植后替代本文件。
 */
export function seedMockSession(): void {
  if (localStorage.getItem(AUTH_TOKEN_STORAGE_KEY)) return
  const vo: LoginVo = {
    token: 'mock-token-baoan',
    tokenType: 'Bearer',
    expiresAt: '2099-12-31 23:59:59',
    user: MOCK_USER,
  }
  writeAuthSession(vo)
  console.info('[mock] 已播种假会话（userLevel=1）')
}
