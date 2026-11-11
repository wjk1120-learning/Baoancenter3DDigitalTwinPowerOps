import { AUTH_TOKEN_STORAGE_KEY } from '../config/authConfig'
import { writeAuthSession } from '../utils/session'
import type { AuthUserInfo, LoginVo } from '../api/auth/types'

function buildUser(level: 1 | 2): AuthUserInfo {
  return {
    id: 1,
    name: level === 2 ? '外部检修单位' : '宝安运维员',
    account: level === 2 ? 'external-vendor' : 'baoan-ops',
    phone: '13800000000',
    postId: 1,
    postName: level === 2 ? '外部维保' : '运维值班',
    dutyStatus: 1,
    responsibleArea: '全院',
    userLevel: level,
  }
}

/**
 * mock 会话播种：level 1=内部（运维平台入口可见）/ 2=外部（隐藏，4.0 验收项）。
 * 已有会话不覆盖；force=true 强制重播种（调试页切换身份用）。
 * 真登录链路 4.0 下半接入后替代本文件。
 */
export function seedMockSession(level: 1 | 2 = 1, force = false): void {
  if (!force && localStorage.getItem(AUTH_TOKEN_STORAGE_KEY)) return
  const vo: LoginVo = {
    token: `mock-token-baoan-${level}`,
    tokenType: 'Bearer',
    expiresAt: '2099-12-31 23:59:59',
    user: buildUser(level),
  }
  writeAuthSession(vo)
  console.info(`[mock] 已播种假会话（userLevel=${level}）`)
}

/** 调试页切身份标记（sessionStorage：同 tab 跨刷新保留，关 tab 即散，互不串扰） */
const MOCK_LEVEL_FLAG = 'bz_mock_level'

/** 调试页切换身份时记录所选等级，startup 播种据此保留调试态 */
export function setMockLevelFlag(level: 1 | 2): void {
  sessionStorage.setItem(MOCK_LEVEL_FLAG, String(level))
}

/**
 * mock 启动播种（main.ts 专用）：默认强制回到内部人员；仅当调试页标记过外部身份时
 * 才按标记播种——历史残留的外部会话不再把默认态带歪（用户拍板：默认内部）。
 */
export function seedMockSessionOnStart(): void {
  const flag = sessionStorage.getItem(MOCK_LEVEL_FLAG)
  seedMockSession(flag === '2' ? 2 : 1, true)
}
