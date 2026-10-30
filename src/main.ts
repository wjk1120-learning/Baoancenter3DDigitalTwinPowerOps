import { createApp } from 'vue'
import App from './App.vue'
// 全局样式 = 用户自福永搬来的 theme.css（设计令牌 + reset + body 底色，唯一全局样式入口）
import './styles/theme.css'

createApp(App).mount('#app')
