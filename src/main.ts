import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import router from './router'
// 全局样式 = 设计令牌 + reset + body 底色，唯一全局样式入口
import './styles/theme.css'

createApp(App).use(createPinia()).use(router).mount('#app')
