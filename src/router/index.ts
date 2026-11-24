import { createRouter, createWebHistory } from 'vue-router'
import type { Component } from 'vue'
import { navConfig } from '../config/navConfig'
import { readAuthToken, readAuthUser } from '../utils/session'
import { canAccessConfigurationCenter } from '../utils/operationsAccess'
import { redirectUnauthorized } from '../utils/authRedirect'

const placeholderPage = () => import('../views/placeholder/PlaceholderPage.vue')

/** 已实装页面（其余 nav 项走占位页）；键 = navConfig.id，页面实装一个登记一处 */
const REAL_PAGES: Record<string, () => Promise<Component>> = {
  overview: () => import('../views/hospital/HospitalOverviewPage.vue'),
  'power-room': () => import('../views/power-room/PowerRoomPage.vue'),
  alert: () => import('../views/alert-center/AlertCenterPage.vue'),
  device: () => import('../views/device-management/DeviceManagementPage.vue'),
  defect: () => import('../views/defect-management/DefectManagementPage.vue'),
  monitor: () => import('../views/environment-monitor/EnvironmentMonitorPage.vue'),
  configuration: () => import('../views/configuration/ConfigurationPage.vue'),
}

/**
 * 路由表与 navConfig 同源（id=模块名，name=页签标题）；openInNewWindow 项不进路由。
 * 子页面（如 4.3 设备详情 /device-detail）落地时在此追加显式路由；
 * 登录守卫随 4.0 登录移植补充（福永 router.beforeEach 同款）。
 */
const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    // 医院总览已落地，首页/兜底回归 '/hospital'（导航同源）
    { path: '/', redirect: '/hospital' },
    ...navConfig
      .filter((item) => !item.openInNewWindow)
      .map((item) => ({
        path: item.route,
        component: REAL_PAGES[item.id] ?? placeholderPage,
        meta: { keepAlive: item.id in REAL_PAGES },
      })),
    // 设备详情：柜行「详情」/配电房点柜跳转目标（用户定名 /device-detail，功能同福永 /device-model）
    {
      path: '/device-detail',
      component: () => import('../views/device-detail/DeviceDetailPage.vue'),
      meta: { keepAlive: true },
    },
    // 调试页仅 dev 注册（import.meta.env.DEV 构建期替换，生产不含此 chunk）
    ...(import.meta.env.DEV
      ? [
          { path: '/tests/mock', component: () => import('../tests/MockDebugPage.vue') },
          {
            path: '/tests/power-room',
            component: () => import('../tests/PowerRoomDebugPage.vue'),
          },
          { path: '/tests/camera', component: () => import('../tests/CameraDebugPage.vue') },
        ]
      : []),
    { path: '/:pathMatch(.*)*', redirect: '/hospital' },
  ],
})

router.beforeEach((to) => {
  if (!readAuthToken()) {
    // 无 token 整页跳运维平台登录（福永同款）；mock 模式 authMock 启动已播种，不会走到
    redirectUnauthorized()
    return false
  }
  // 配置中心仅内部人员：外部人员(userLevel=2)直接输 URL 进来时兜底回总览（福永同款；
  // 入口可见性见 TopBar navOptions 过滤，mock 模式 authMock 播种的内部用户不会走到）
  if (to.path.startsWith('/configuration') && !canAccessConfigurationCenter(readAuthUser())) {
    return '/hospital'
  }
  return true
})

export default router
