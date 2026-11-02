import { createRouter, createWebHistory } from 'vue-router'
import { navConfig } from '../config/navConfig'

const placeholderPage = () => import('../views/placeholder/PlaceholderPage.vue')

/**
 * 路由表与 navConfig 同源（id=模块名，name=页签标题）；openInNewWindow 项不进路由。
 * 子页面（如 4.3 设备详情 /device-model）落地时在此追加显式路由；
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
        component:
          item.id === 'power-room'
            ? () => import('../views/power-room/PowerRoomPage.vue')
            : placeholderPage,
        meta: { keepAlive: item.id === 'power-room' },
      })),
    { path: '/:pathMatch(.*)*', redirect: '/power-room' },
  ],
})

export default router
