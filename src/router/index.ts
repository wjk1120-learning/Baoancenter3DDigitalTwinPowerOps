import { createRouter, createWebHistory } from 'vue-router'
import type { Component } from 'vue'
import { navConfig } from '../config/navConfig'
import { readAuthToken } from '../utils/session'
import { redirectUnauthorized } from '../utils/authRedirect'

const placeholderPage = () => import('../views/placeholder/PlaceholderPage.vue')

/** 已实装页面（其余 nav 项走占位页）；键 = navConfig.id，页面实装一个登记一处 */
const REAL_PAGES: Record<string, () => Promise<Component>> = {
  'power-room': () => import('../views/power-room/PowerRoomPage.vue'),
  alert: () => import('../views/alert-center/AlertCenterPage.vue'),
  device: () => import('../views/device-management/DeviceManagementPage.vue'),
}

/**
 * 路由表与 navConfig 同源（id=模块名，name=页签标题）；openInNewWindow 项不进路由。
 * 子页面（如 4.3 设备详情 /device-detail）落地时在此追加显式路由；
 * 登录守卫随 4.0 登录移植补充（福永 router.beforeEach 同款）。
 */
const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    // 首页暂落配电房（当前唯一实页）；4.6 医院总览落地后与兜底路由一并改回 '/hospital'
    { path: '/', redirect: '/power-room' },
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
      ? [{ path: '/tests/mock', component: () => import('../tests/MockDebugPage.vue') }]
      : []),
    { path: '/:pathMatch(.*)*', redirect: '/power-room' },
  ],
})

router.beforeEach(() => {
  if (!readAuthToken()) {
    // 无 token 整页跳运维平台登录（福永同款）；mock 模式 authMock 启动已播种，不会走到
    redirectUnauthorized()
    return false
  }
  return true
})

export default router
