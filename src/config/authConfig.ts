// TODO(登录移植): 福永用 requiredUrl(VITE_OPERATIONS_URL) 强校验并配套认证中心地址；
// 宝安暂无 .env，先做可缺省读取，登录移植时对齐福永 config/authConfig.ts。
/** 运维平台独立地址（.env VITE_OPERATIONS_URL，未配置 = 空，点击提示未配置） */
export const OPERATIONS_EXTERNAL_URL =
  (import.meta.env.VITE_OPERATIONS_URL as string | undefined)?.trim() ?? ''
