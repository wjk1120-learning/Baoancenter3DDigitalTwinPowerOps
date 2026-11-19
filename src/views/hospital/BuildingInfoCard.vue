<script setup lang="ts">
/**
 * 楼栋信息卡（医院总览 3D 批2，福永聚焦信息卡同构、浅色玻璃风）：
 * 点楼聚焦时显示——2×2 指标（今日用电/碳排放/当前预警/昨日用电）+ 上下两张 7 日趋势图。
 * 数据链（聚焦瞬间并发 5 请求）：
 *   §2.1 取本楼今日行（碳 t = kg÷1000 前端换算）、§2.2 楼栋昨日、
 *   §3.7 当前预警数、§2.3 近 7 日能耗（蓝面积图）、§3.8 近 7 日告警（橙面积图）。
 * 今日两项复用页面级 §2.1（轻接口双消费先例）；趋势图为历史统计不随 WS 刷新。
 */
import { ref, watch, computed, onUnmounted } from 'vue'
import BaseChart from '../../panels/BaseChart.vue'
import type { EChartsCoreOption } from 'echarts/core'
import { fetchEnergyToday, fetchEnergyYesterday, fetchBuildingEnergyHistory } from '../../api/energy/energy'
import {
  fetchBuildingCurrentAlarmCount,
  fetchBuildingDailyAlarms,
} from '../../api/event/event'
import { eventPushSocket } from '../../ws/eventPushSocket'
import type { EnergyDailyStats } from '../../api/energy/types'
import type { BuildingDailyAlarm } from '../../api/event/types'

const props = defineProps<{ buildingId: number; buildingName: string }>()
defineEmits<{ close: [] }>()

const todayKwh = ref<number | null>(null)
const carbonT = ref<number | null>(null)
const alarmCount = ref<number | null>(null)
const yesterdayKwh = ref<number | null>(null)
const energyTrend = ref<EnergyDailyStats[]>([])
const alarmTrend = ref<BuildingDailyAlarm[]>([])
const loading = ref(false)

/** 防串台：楼栋切换时旧响应不覆盖新选中（同 AlertPanel loadSeq 惯例） */
let seq = 0

watch(
  () => props.buildingId,
  async (id) => {
    if (!id) return
    const s = ++seq
    loading.value = true
    todayKwh.value = carbonT.value = alarmCount.value = yesterdayKwh.value = null
    energyTrend.value = []
    alarmTrend.value = []
    const [today, yest, cnt, hist, alarms] = await Promise.all([
      fetchEnergyToday().catch(() => null),
      fetchEnergyYesterday(id).catch(() => []),
      fetchBuildingCurrentAlarmCount(id).catch(() => 0),
      fetchBuildingEnergyHistory(id).catch(() => []),
      fetchBuildingDailyAlarms(id).catch(() => []),
    ])
    if (s !== seq || props.buildingId !== id) return
    const row = today?.buildingStats?.[props.buildingName]
    todayKwh.value = row ? row.energyKwh : null
    carbonT.value = row ? Math.round((row.carbonKg / 1000) * 100) / 100 : null
    alarmCount.value = cnt
    yesterdayKwh.value = yest[0]?.energyKwh ?? null
    energyTrend.value = hist
    alarmTrend.value = alarms
    loading.value = false
  },
  { immediate: true },
)

/** WS 联动（批3）：event 单条推送且归属本楼 → 只重拉 §3.7 当前预警数（对齐拍板口径）。
 *  mock 模式 WS 不建连，本订阅静默无效。 */
async function reloadAlarmCount() {
  const cnt = await fetchBuildingCurrentAlarmCount(props.buildingId).catch(() => null)
  if (cnt != null) alarmCount.value = cnt
}

const offSingle = eventPushSocket.onSingle((item) => {
  if (item.locations?.some((l) => l.building === props.buildingId)) void reloadAlarmCount()
})

onUnmounted(() => offSingle())

const md = (day: string) => day.slice(5).replace('-', '/')

const energyChart = computed<EChartsCoreOption>(() => ({
  tooltip: {
    trigger: 'axis',
    backgroundColor: 'rgba(255,255,255,0.96)',
    borderColor: 'rgba(90,107,128,0.25)',
    borderWidth: 1,
    padding: [8, 12],
    textStyle: { color: '#1e3a5f', fontSize: 12 },
    axisPointer: { type: 'line', lineStyle: { color: 'rgba(90,107,128,0.35)' } },
  },
  grid: { left: 52, right: 14, top: 18, bottom: 28 },
  xAxis: {
    type: 'category',
    data: energyTrend.value.map((r) => md(r.day)),
    axisLabel: { fontSize: 12, color: '#5a6b80' },
    axisLine: { lineStyle: { color: 'rgba(90,107,128,0.3)' } },
    axisTick: { show: false },
  },
  yAxis: {
    type: 'value',
    axisLabel: { fontSize: 12, color: '#5a6b80' },
    splitLine: { lineStyle: { color: 'rgba(90,107,128,0.12)' } },
  },
  series: [
    {
      type: 'line',
      data: energyTrend.value.map((r) => r.energyKwh),
      smooth: true,
      symbol: 'circle',
      symbolSize: 5,
      lineStyle: { color: '#2b7ce3', width: 2 },
      itemStyle: { color: '#2b7ce3' },
      areaStyle: { color: 'rgba(43,124,227,0.18)' },
    },
  ],
}))

const alarmChart = computed<EChartsCoreOption>(() => ({
  tooltip: {
    trigger: 'axis',
    backgroundColor: 'rgba(255,255,255,0.96)',
    borderColor: 'rgba(90,107,128,0.25)',
    borderWidth: 1,
    padding: [8, 12],
    textStyle: { color: '#1e3a5f', fontSize: 12 },
    axisPointer: { type: 'line', lineStyle: { color: 'rgba(90,107,128,0.35)' } },
  },
  grid: { left: 36, right: 14, top: 18, bottom: 28 },
  xAxis: {
    type: 'category',
    data: alarmTrend.value.map((r) => md(r.date)),
    axisLabel: { fontSize: 12, color: '#5a6b80' },
    axisLine: { lineStyle: { color: 'rgba(90,107,128,0.3)' } },
    axisTick: { show: false },
  },
  yAxis: {
    type: 'value',
    minInterval: 1,
    axisLabel: { fontSize: 12, color: '#5a6b80' },
    splitLine: { lineStyle: { color: 'rgba(90,107,128,0.12)' } },
  },
  series: [
    {
      type: 'line',
      data: alarmTrend.value.map((r) => r.alarmCount),
      smooth: true,
      symbol: 'circle',
      symbolSize: 5,
      lineStyle: { color: '#e8a33d', width: 2 },
      itemStyle: { color: '#e8a33d' },
      areaStyle: { color: 'rgba(232,163,61,0.22)' },
    },
  ],
}))

const fmt = (v: number | null) => (v == null ? '—' : v.toLocaleString('zh-CN'))
</script>

<template>
  <div class="b-info-card glass-card">
    <header class="bic-head">
      <div class="bic-name-wrap">
        <h3 class="bic-name">{{ buildingName }}</h3>
        <span class="bic-underline" />
      </div>
      <button type="button" class="bic-close" aria-label="返回全景" @click="$emit('close')">×</button>
    </header>

    <div class="bic-metrics">
      <div class="bic-metric">
        <span class="bic-lbl">今日用电量</span>
        <span class="bic-val">{{ fmt(todayKwh) }}<i class="bic-unit">kWh</i></span>
      </div>
      <div class="bic-metric">
        <span class="bic-lbl">碳排放量</span>
        <span class="bic-val">{{ fmt(carbonT) }}<i class="bic-unit">t</i></span>
      </div>
      <div class="bic-metric">
        <span class="bic-lbl">当前预警</span>
        <span class="bic-val bic-warn">{{ fmt(alarmCount) }}<i class="bic-unit">条</i></span>
      </div>
      <div class="bic-metric">
        <span class="bic-lbl">昨日用电量</span>
        <span class="bic-val">{{ fmt(yesterdayKwh) }}<i class="bic-unit">kWh</i></span>
      </div>
    </div>

    <div class="bic-chart">
      <span class="bic-chart-title">近7日能耗趋势</span>
      <BaseChart v-if="energyTrend.length" :option="energyChart" class="bic-base" />
      <div v-else class="bic-empty">{{ loading ? '加载中…' : '—' }}</div>
    </div>

    <div class="bic-chart">
      <span class="bic-chart-title">近7日每日预警</span>
      <BaseChart v-if="alarmTrend.length" :option="alarmChart" class="bic-base" />
      <div v-else class="bic-empty">{{ loading ? '加载中…' : '—' }}</div>
    </div>
  </div>
</template>

<style scoped>
.b-info-card {
  position: absolute;
  right: 24px;
  top: 50%;
  transform: translateY(-50%);
  width: 420px;
  z-index: 30;
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding: 20px 24px 18px;
  /* 淡入（页面 Transition 驱动 opacity；transform 由定位占用，入场只用透明度） */
  transition: transform 0.35s ease;
}
.bic-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
}
.bic-name-wrap {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.bic-name {
  margin: 0;
  font-size: 26px;
  font-weight: 700;
  color: var(--title);
  letter-spacing: 1px;
}
.bic-underline {
  width: 42px;
  height: 3px;
  border-radius: 2px;
  background: var(--primary);
}
.bic-close {
  width: 32px;
  height: 32px;
  border-radius: 8px;
  border: 1px solid rgba(90, 107, 128, 0.35);
  background: rgba(255, 255, 255, 0.6);
  color: var(--title);
  font-size: 18px;
  line-height: 1;
  cursor: pointer;
}
.bic-close:hover {
  background: rgba(43, 124, 227, 0.12);
}
.bic-metrics {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 14px 18px;
}
.bic-metric {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.bic-lbl {
  font-size: 14px;
  color: var(--muted);
}
.bic-val {
  font-size: 30px;
  font-weight: 700;
  color: var(--title);
  font-family: var(--font-mono);
  line-height: 1.2;
}
.bic-warn {
  color: #d98a1f;
}
.bic-unit {
  margin-left: 5px;
  font-size: 14px;
  font-style: normal;
  font-weight: 400;
  color: var(--muted);
}
.bic-chart {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.bic-chart-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--muted);
}
.bic-base {
  height: 175px;
}
.bic-empty {
  height: 175px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--muted);
  font-size: 13px;
}
</style>
