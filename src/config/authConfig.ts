// TODO(4.0 登录移植)：对齐福永 requiredUrl 强校验并配套 .env（VITE_AUTH_LOGIN_URL /
// VITE_OPERATIONS_URL）；宝中 .env 未建，此前可缺省读取，缺值时相关功能降级不崩启动。
/** 运维平台独立地址（未配置 = 空，点击提示未配置） */
export const OPERATIONS_EXTERNAL_URL =
  (import.meta.env.VITE_OPERATIONS_URL as string | undefined)?.trim() ?? ''

/** 认证中心登录页（401 跳转目标；未配置时 authRedirect 不做整页跳转） */
export const AUTH_CENTER_LOGIN_URL =
  (import.meta.env.VITE_AUTH_LOGIN_URL as string | undefined)?.trim() ?? ''

/** 会话本地存储键（bz 前缀：与同域部署的福永/运维平台隔离，避免 localStorage 串号） */
export const AUTH_TOKEN_STORAGE_KEY = 'bz_auth_token'
export const AUTH_USER_STORAGE_KEY = 'bz_auth_user'
