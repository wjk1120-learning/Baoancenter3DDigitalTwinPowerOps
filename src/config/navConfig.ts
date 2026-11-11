export interface NavItemConfig {
  id: string
  name: string
  /** 视图路径（暂无 router，对应 App.vue 的视图表） */
  route: string
  /** 为 true 时不进本工程视图：有 OPERATIONS_EXTERNAL_URL 则新开窗口，否则提示未配置 */
  openInNewWindow?: boolean
}

/** 运维平台外链项（不进本工程路由），与福永 navConfig 同款占位路由 */
export const OPERATIONS_NAV_ROUTE = '__operations__'

/**
 * 顶部导航：医院总览 / 设备管理 / 配电房 / 告警中心 / 缺陷管理 / 环境监控 / 培训平台 / 运维平台。
 * 除实页（见 router REAL_PAGES）外均为占位页；「运维平台」按内部人员显隐（utils/operationsAccess）。
 */
export const navConfig: NavItemConfig[] = [
  { id: 'overview', name: '医院总览', route: '/hospital' },
  { id: 'device', name: '设备管理', route: '/device' },
  { id: 'power-room', name: '配电房', route: '/power-room' },
  { id: 'alert', name: '告警中心', route: '/alert' },
  { id: 'defect', name: '缺陷管理', route: '/defect' },
  { id: 'monitor', name: '环境监控', route: '/monitor' },
  { id: 'training', name: '培训平台', route: '/training' },
  {
    id: 'operations',
    name: '运维平台',
    route: OPERATIONS_NAV_ROUTE,
    openInNewWindow: true,
  },
]
