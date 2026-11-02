import { ref } from 'vue'

/** 数据源离线标记：CET 或 mock REST 失败即为 true，请求恢复后自动归位（TopBar/告警中心依赖） */
export const sourceOffline = ref(false)
