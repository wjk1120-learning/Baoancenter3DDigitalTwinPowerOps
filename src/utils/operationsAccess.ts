// TODO(登录移植): 福永此处入参是 api/auth/types 的 AuthUserInfo；登录移植后把
// NavUser 换回 AuthUserInfo 并在 TopBar 传 readAuthUser() 的会话用户。
/** 登录前的最小用户形状：只有权限判定需要的字段 */
export interface NavUser {
  /** 认证中心用户等级：0=管理员、1=普通员工、2=外部人员 */
  userLevel?: number
}

/** 外部人员等级（认证中心 4.1 UserInfo.userLevel） */
export const EXTERNAL_USER_LEVEL = 2

/**
 * 运维平台入口权限：外部人员没有运维平台权限，顶部下拉不展示「运维平台」。
 * 管理员 / 普通员工、以及用户信息缺失时保持可见（福永 operationsAccess.ts 同款规则）。
 */
export function canAccessOperationsPlatform(user: NavUser | null): boolean {
  return user?.userLevel !== EXTERNAL_USER_LEVEL
}
