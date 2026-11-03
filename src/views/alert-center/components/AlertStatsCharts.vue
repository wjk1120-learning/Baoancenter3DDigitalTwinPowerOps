<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import BaseChart from '../../../panels/BaseChart.vue'
import type { EChartsOption } from 'echarts'
import type { AlertEventLevel } from '../../../api/hospital/types'
import { fetchTodayLevelDistribution } from '../../../api/event/event'
import { chartColors } from '../../../config/chartColors'
import { GRADE_META } from '../composables/groupMeta'

const props = defineProps<{
  gradeCounts: Record<AlertEventLevel, number>
  /** 父级刷新令牌：告警中心 15s 节流刷新 / 手动「刷新」后自增，触发今日分布重取 */
  refreshToken?: number
}>()

const gradeTotal = computed(() => Object.values(props.gradeCounts).reduce((s, v) => s + v, 0))

// ============ 今日告警分布（§3.1 GET /FY/event/today 真实计数；无告警画空态，不造假扇区） ============

/** 契约四级（1紧急 2严重 3一般 4提醒）；提醒级用 teal 补色，其余沿用告警色板 */
const TODAY_LEVEL_META: { id: AlertEventLevel; label: string; color: string }[] = [
  { id: 1, label: '紧急', color: chartColors.danger },
  { id: 2, label: '严重', color: chartColors.warn },
  { id: 3, label: '一般', color: chartColors.primary },
  { id: 4, label: '提醒', color: chartColors.teal },
]

const todayDist = ref<Awaited<ReturnType<typeof fetchTodayLevelDistribution>>>(null)
const todayLoading = ref(false)

async function loadToday() {
  todayLoading.value = true
  try {
    todayDist.value = await fetchTodayLevelDistribution()
  } finally {
    todayLoading.value = false
  }
}

onMounted(loadToday)
watch(
  () => props.refreshToken,
  () => void loadToday(),
)

const todayOpt = computed<EChartsOption | null>(() => {
  const dist = todayDist.value
  if (!dist || !dist.total) return null
  const slices = TODAY_LEVEL_META.map((m) => ({
    name: m.label,
    value: dist.counts[m.id],
    itemStyle: { color: m.color },
  })).filter((s) => s.value > 0)
  return {
    tooltip: { trigger: 'item' },
    legend: {
      bottom: 0,
      left: 'center',
      itemWidth: 8,
      itemHeight: 8,
      itemGap: 6,
      textStyle: { color: chartColors.muted, fontSize: 12 },
      formatter: (name: string) => {
        const m = TODAY_LEVEL_META.find((x) => x.label === name)
        return `${name} ${m ? dist.counts[m.id] : 0}`
      },
    },
    series: [
      {
        type: 'pie',
        radius: ['38%', '58%'],
        center: ['50%', '40%'],
        label: { show: false },
        data: slices,
      },
    ],
    graphic: [
      {
        type: 'text',
        left: 'center',
        top: '34%',
        style: {
          text: String(dist.total),
          fill: chartColors.title,
          fontSize: 22,
          fontWeight: 600,
          textAlign: 'center',
        },
      },
    ],
  }
})

const levelOpt = computed<EChartsOption>(() => {
  const counts = GRADE_META.map((g) => ({
    name: g.label,
    value: props.gradeCounts[g.id],
    itemStyle: { color: g.color },
  }))
  const hasData = counts.some((c) => c.value > 0)
  const pieData = hasData ? counts : counts.map((c) => ({ ...c, value: 1 }))
  const byName = Object.fromEntries(counts.map((c) => [c.name, c.value]))
  return {
    tooltip: { trigger: 'item' },
    legend: {
      bottom: 0,
      left: 'center',
      itemWidth: 8,
      itemHeight: 8,
      itemGap: 6,
      textStyle: { color: chartColors.muted, fontSize: 12 },
      formatter: (name: string) => `${name} ${byName[name] ?? 0}`,
    },
    series: [
      {
        type: 'pie',
        radius: ['38%', '58%'],
        center: ['50%', '40%'],
        label: { show: false },
        data: pieData,
      },
    ],
    graphic: [
      {
        type: 'text',
        left: 'center',
        top: '34%',
        style: {
          text: String(gradeTotal.value),
          fill: chartColors.title,
          fontSize: 22,
          fontWeight: 600,
          textAlign: 'center',
        },
      },
    ],
  }
})

// 类型统计：四个类型横条
const typeOpt = computed<EChartsOption>(() => {
  const rows = [...GRADE_META].reverse()
  return {
    grid: { left: 8, right: 28, top: 8, bottom: 4, containLabel: true },
    xAxis: { type: 'value', show: false },
    yAxis: {
      type: 'category',
      data: rows.map((g) => g.label),
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: { color: chartColors.muted, fontSize: 13 },
    },
    tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
    series: [
      {
        type: 'bar',
        data: rows.map((g) => ({
          value: props.gradeCounts[g.id],
          itemStyle: { color: g.color, borderRadius: [0, 4, 4, 0] },
        })),
        barWidth: 12,
        label: { show: true, position: 'right', color: chartColors.muted, fontSize: 13 },
      },
    ],
  }
})
</script>

<template>
  <aside class="ac-stats">
    <div class="ac-card glass-panel">
      <div class="card-title">等级分布</div>
      <div class="chart-box"><BaseChart :option="levelOpt" /></div>
    </div>
    <div class="ac-card glass-panel">
      <div class="card-title">类型统计</div>
      <div class="chart-box"><BaseChart :option="typeOpt" /></div>
    </div>
    <div class="ac-card glass-panel">
      <div class="card-title">今日告警分布</div>
      <div v-if="todayLoading" class="chart-empty">加载中…</div>
      <div v-else-if="todayDist == null" class="chart-empty">暂无数据</div>
      <div v-else-if="!todayOpt" class="chart-empty">今日无告警</div>
      <div v-else class="chart-box">
        <BaseChart v-if="todayOpt" :option="todayOpt" />
      </div>
    </div>
  </aside>
</template>

<style scoped>
.ac-stats {
  flex: none;
  width: 320px;
  display: flex;
  flex-direction: column;
  gap: 14px;
}
.ac-card {
  flex: 1;
  padding: 14px 16px 10px;
  border-radius: var(--radius);
  box-shadow: var(--card-shadow);
  display: flex;
  flex-direction: column;
  min-height: 0;
}
.card-title {
  font-size: 16px;
  font-weight: 700;
  color: var(--title);
  margin-bottom: 8px;
  position: relative;
  padding-left: 11px;
}
.card-title::before {
  content: '';
  position: absolute;
  left: 0;
  top: 50%;
  transform: translateY(-50%);
  width: 3px;
  height: 15px;
  background: var(--primary);
  border-radius: 2px;
}
.chart-box {
  flex: 1;
  min-height: 80px;
}
.chart-empty {
  flex: 1;
  min-height: 80px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--muted);
  font-size: 13px;
}
</style>
