<script setup lang="ts">
import { computed, onActivated, onMounted, onUnmounted, ref } from 'vue'
import type { AlertEventLevel, AlertItem } from '../../api/hospital/types'
import {
  fetchEventGroupedByLevel,
  fetchEventGrouped,
  fetchEventStats,
  handleEvent,
} from '../../api/event/event'
import { groupLatestTime, mapEventInfoToAlert } from '../../api/event/mappers'
import type { DeviceEventGroup, EventInfo, EventStatsResult } from '../../api/event/types'
import { saveAlertSnapshot } from '../../config/alertDetail'
import { distCount, gradeOf, groupCount } from './composables/groupMeta'
import AlertStatsCharts from './components/AlertStatsCharts.vue'
import AlertDetailDrawer from '../../components/AlertDetailDrawer.vue'
import AlertKpiBar from './components/AlertKpiBar.vue'
import AlertGroupsTable from './components/AlertGroupsTable.vue'
import AlertGroupModal from './components/AlertGroupModal.vue'

// 告警中心（福永 AlertCenterPage 同构；实时 store 接线随 4.5 面板任务补，当前列表/统计直连 api/event）
defineOptions({ name: 'AlertCenterPage' })

const detailAlert = ref<AlertItem | null>(null)
const loading = ref(false)
const filterLevel = ref<'' | '1' | '2' | '3' | '4'>('')
const page = ref(1)
const pageSize = 14
/** 列表数据：3.2 GET /event/grouped；按等级筛选为 grouped?level= */
const listGroups = ref<DeviceEventGroup[]>([])
/** 刷新令牌：每次 loadList 自增，驱动「今日告警分布」饼图重取 §3.1 */
const statsTick = ref(0)
const eventStats = ref<EventStatsResult | null>(null)

async function loadList(force = false) {
  loading.value = true
  page.value = 1
  try {
    if (!filterLevel.value) {
      listGroups.value = await fetchEventGrouped(force)
    } else {
      listGroups.value = await fetchEventGroupedByLevel(Number(filterLevel.value))
    }
    // 统计仍用全量 stats，避免等级筛选时 KPI 失真
    eventStats.value = await fetchEventStats(force || !!filterLevel.value)
  } catch {
    listGroups.value = []
  } finally {
    loading.value = false
    statsTick.value++
  }
}

// keep-alive 组件首次挂载必紧跟 onActivated，统一在 activated 里加载避免首屏双拉
onMounted(() => {
  window.addEventListener('keydown', onEsc)
})
onActivated(() => {
  void loadList(false)
})
onUnmounted(() => window.removeEventListener('keydown', onEsc))

const filtered = computed(() =>
  [...listGroups.value].sort((a, b) => groupLatestTime(b).localeCompare(groupLatestTime(a))),
)

const gradeCounts = computed(() => {
  const counts: Record<AlertEventLevel, number> = { 1: 0, 2: 0, 3: 0, 4: 0 }
  const stats = eventStats.value
  if (stats && !filterLevel.value) {
    const dist = stats.levelDistribution ?? {}
    counts[1] = distCount(dist, 1)
    counts[2] = distCount(dist, 2)
    counts[3] = distCount(dist, 3)
    counts[4] = distCount(dist, 4)
    if (counts[1] + counts[2] + counts[3] + counts[4] > 0) return counts
  }
  for (const g of filtered.value) counts[gradeOf(g)] += groupCount(g) || 1
  return counts
})

const totalPages = computed(() => Math.max(1, Math.ceil(filtered.value.length / pageSize)))
const paged = computed(() =>
  filtered.value.slice((page.value - 1) * pageSize, page.value * pageSize),
)

const unhandled = computed(() => {
  const stats = eventStats.value
  if (stats && !filterLevel.value) return Number(stats.unhandledEvents) || 0
  return 0
})
const urgent = computed(() => {
  const stats = eventStats.value
  if (stats && !filterLevel.value) {
    const dist = stats.levelDistribution ?? {}
    const lv1 = Number(dist['1'] ?? dist[1 as unknown as string] ?? 0)
    if (lv1 > 0) return lv1
  }
  return filtered.value
    .filter((g) => gradeOf(g) === 1)
    .reduce((s, g) => s + (groupCount(g) || 1), 0)
})
const todayAlerts = computed(() => Number(eventStats.value?.todayAlarmCount) || 0)
const totalAlerts = computed(() => {
  const fromStats = Number(eventStats.value?.totalEvents)
  if (fromStats > 0) return fromStats
  return listGroups.value.reduce((s, g) => s + groupCount(g), 0)
})
const handledRate = computed(() => {
  const stats = eventStats.value
  // 后端 v3.15+ 直接返回 handleRate（更准确），优先用；无值时退回本地估算
  if (stats && Number.isFinite(stats.handleRate)) return Number(stats.handleRate)
  const total = Number(stats?.totalEvents) || totalAlerts.value
  const open = Number(stats?.unhandledEvents) || 0
  return total ? ((total - open) / total) * 100 : 0
})

const activeGroup = ref<DeviceEventGroup | null>(null)

function openGroup(g: DeviceEventGroup) {
  activeGroup.value = g
}
function closeGroup() {
  activeGroup.value = null
}

function onEsc(e: KeyboardEvent) {
  if (e.key !== 'Escape') return
  if (detailAlert.value) {
    e.preventDefault()
    closeDetailDrawer()
    return
  }
  if (!activeGroup.value) return
  e.preventDefault()
  closeGroup()
}

function openEventDetail(e: EventInfo) {
  const group = activeGroup.value
  const item = mapEventInfoToAlert({
    ...e,
    deviceId: e.deviceId || group?.deviceId || '',
    deviceName: e.deviceName || group?.deviceName || '',
  })
  saveAlertSnapshot(item)
  detailAlert.value = item
}

function closeDetailDrawer() {
  detailAlert.value = null
}

const handlingIds = ref<Record<string, boolean>>({})
async function handleOne(eventId: string) {
  const id = String(eventId || '').trim()
  if (!id || handlingIds.value[id]) return
  handlingIds.value = { ...handlingIds.value, [id]: true }
  try {
    const ok = await handleEvent(id)
    if (ok) {
      listGroups.value = listGroups.value.map((g) => ({
        ...g,
        events: (g.events ?? []).map((e) => (e.eventId === id ? { ...e, handleStatus: 1 } : e)),
      }))
      if (activeGroup.value) {
        activeGroup.value = {
          ...activeGroup.value,
          events: (activeGroup.value.events ?? []).map((e) =>
            e.eventId === id ? { ...e, handleStatus: 1 } : e,
          ),
        }
      }
    }
  } finally {
    const next = { ...handlingIds.value }
    delete next[id]
    handlingIds.value = next
  }
}

function onFilterLevelChange() {
  void loadList()
}
</script>

<template>
  <div class="ac-page">
    <div class="dm-bg" aria-hidden="true">
      <div class="dm-bg-grid" />
      <div class="dm-bg-glow a" />
      <div class="dm-bg-glow b" />
    </div>

    <div class="ac-wrap">
      <AlertKpiBar
        :total="totalAlerts"
        :today="todayAlerts"
        :unhandled="unhandled"
        :urgent="urgent"
        :rate="handledRate"
      />

      <div class="ac-body">
        <AlertStatsCharts :grade-counts="gradeCounts" :refresh-token="statsTick" />

        <AlertGroupsTable
          v-model:filter-level="filterLevel"
          :rows="paged"
          :total="filtered.length"
          :page="page"
          :total-pages="totalPages"
          :loading="loading"
          @update:filter-level="onFilterLevelChange"
          @refresh="loadList(true)"
          @open="openGroup"
          @page="page = $event"
        />
      </div>
    </div>

    <AlertGroupModal
      :group="activeGroup"
      :handling-ids="handlingIds"
      @close="closeGroup"
      @handle="handleOne"
      @detail="openEventDetail"
    />

    <AlertDetailDrawer :alert="detailAlert" @close="closeDetailDrawer" />
  </div>
</template>

<style scoped>
.ac-page {
  width: 100%;
  height: 100%;
  overflow: hidden;
  position: relative;
}
.ac-page .dm-bg {
  position: absolute;
  inset: 0;
  z-index: 0;
  background:
    radial-gradient(900px 520px at 12% 6%, rgba(76, 208, 232, 0.11), transparent 58%),
    radial-gradient(780px 480px at 92% 94%, rgba(43, 124, 227, 0.09), transparent 58%),
    linear-gradient(165deg, var(--bg-1), var(--bg-2));
}
.ac-page .dm-bg-grid {
  position: absolute;
  inset: 0;
  opacity: 0.22;
  background-image:
    linear-gradient(rgba(43, 124, 227, 0.05) 1px, transparent 1px),
    linear-gradient(90deg, rgba(43, 124, 227, 0.05) 1px, transparent 1px);
  background-size: 48px 48px;
}
.ac-page .dm-bg-glow {
  position: absolute;
  border-radius: 50%;
  filter: blur(80px);
  opacity: 0.35;
  pointer-events: none;
}
.ac-page .dm-bg-glow.a {
  width: 420px;
  height: 420px;
  top: -120px;
  left: -100px;
  background: var(--primary);
}
.ac-page .dm-bg-glow.b {
  width: 380px;
  height: 380px;
  bottom: -120px;
  right: -100px;
  background: var(--cyan);
}
.ac-wrap {
  position: relative;
  z-index: 5;
  height: 100%;
  display: flex;
  flex-direction: column;
  padding: calc(var(--topbar-height) + 14px) 18px 18px;
  gap: 14px;
}
.ac-body {
  flex: 1;
  min-height: 0;
  display: flex;
  gap: 14px;
}
</style>
