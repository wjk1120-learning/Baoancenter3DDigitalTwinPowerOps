import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import router from './router'
import { runAuthBootstrap, stripTicketFromUrl } from './bootstrap/authBootstrap'
import { useMock } from './mock'
import { seedMockSessionOnStart } from './mock/authMock'
// 全局样式 = 设计令牌 + reset + body 底色，唯一全局样式入口
import './styles/theme.css'

async function start() {
  // mock 会话先播种；无 ticket 时 runAuthBootstrap 是 no-op，真登录链路 4.0 移植
  if (useMock()) {
    seedMockSessionOnStart()
    console.info('[mock] VITE_USE_MOCK=true：REST/WS 全部走 src/mock，不出网络')
  }
  await runAuthBootstrap()
  createApp(App).use(createPinia()).use(router).mount('#app')
  // 挂载时路由会用初始化捕获的地址覆写 URL（可能含 ticket），就绪后再清一次
  void router.isReady().then(stripTicketFromUrl)
}

void start()
