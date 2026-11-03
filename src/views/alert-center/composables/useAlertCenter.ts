import { ref } from 'vue'
import { fetchEventGrouped, fetchEventStats } from '../../../api/event/event'
import type { DeviceEventGroup, EventStatsResult } from '../../../api/event/types'

/**
 * 告警中心数据逻辑（4.1② 骨架：统计条 + 分组列表；图表/详情抽屉/处理交互随 4.1③ 补）。
 * force 刷新走 fetchEventStats/fetchEventGrouped 的缓存强刷。
 */
export function useAlertCenter() {
  const stats = ref<EventStatsResult | null>(null)
  const groups = ref<DeviceEventGroup[]>([])
  const loading = ref(false)
  const error = ref('')

  async function refresh(force = false): Promise<void> {
    loading.value = true
    error.value = ''
    try {
      const [s, g] = await Promise.all([fetchEventStats(force), fetchEventGrouped(force)])
      stats.value = s
      groups.value = g
    } catch (err) {
      error.value = err instanceof Error ? err.message : String(err)
    } finally {
      loading.value = false
    }
  }

  void refresh()

  return { stats, groups, loading, error, refresh }
}
