import { ref } from 'vue'

/** 数据源离线标记：非 silent 的 bzHttp 请求失败即为 true，请求恢复后自动归位（告警中心「后端未连接」依赖） */
export const sourceOffline = ref(false)
