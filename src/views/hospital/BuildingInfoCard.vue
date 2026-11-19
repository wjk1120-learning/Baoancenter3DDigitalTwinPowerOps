<script setup lang="ts">
/**
 * 楼栋/楼层信息卡（医院总览 3D，福永聚焦信息卡同构、浅色玻璃风）：
 * 点楼聚焦显示楼栋数据；选层后同卡切楼层模式（标题「楼名 · NF」+ tag 楼层详情，
 * out-in 缩放过渡由页面 Transition 驱动；层间切换 props 热替换不重播动画）。
 * 数据链（聚焦/选层瞬间并发 5 请求）：
 *   楼栋：§2.1 取本楼行（碳 t=kg÷1000 前端换算）、§2.2 昨日、§3.7 当前告警、§2.3+§3.8 趋势
 *   楼层：§2.7 今日（全无效=null 显「—」，区分无设备 0）、§2.6 昨日、§3.7?floor、§2.8+§3.8?floor 趋势
 * 今日两项复用页面级 §2.1（轻接口双消费先例）；趋势图为历史统计不随 WS 刷新。
 */
import { ref, watch, computed, onUnmounted } from 'vue'
import BaseChart from '../../panels/BaseChart.vue'
import type { EChartsCoreOption } from 'echarts/core'
import { floorNodeName } from '../../three/campus/buildings'
import {
  fetchEnergyToday,
  fetchEnergyYesterday,
  fetchBuildingEnergyHistory,
  fetchFloorEnergyToday,
  fetchFloorEnergyYesterday,
  fetchFloorEnergyHistory,
} from '../../api/energy/energy'
import {
  fetchBuildingCurrentAlarmCount,
  fetchBuildingDailyAlarms,
} from '../../api/event/event'
import { eventPushSocket } from '../../ws/eventPushSocket'
import type { BuildingDailyAlarm } from '../../api/event/types'

const props = defineProps<{
  buildingId: number
  buildingName: string
  /** 楼层契约键（"3"/"-1"；null/undefined = 楼栋模式） */
  floor?: string | null
}>()
defineEmits<{ close: [] }>()

/** 楼层标签（"3"→3F；宝中无 G 层，地下 -N→B1F） */
const floorLabel = computed(() => (props.floor ? floorNodeName(props.floor) : ''))

const todayKwh = ref<number | null>(null)
const carbonT = ref<number | null>(null)
const alarmCount = ref<number | null>(null)
const yesterdayKwh = ref<number | null>(null)
/** 图表只消费 day/energyKwh 两列（楼层 §2.8 行结构兼容，直接喂） */
const energyTrend = ref<{ day: string; energyKwh: number }[]>([])
const alarmTrend = ref<BuildingDailyAlarm[]>([])
const loading = ref(false)

/** 防串台：楼栋/楼层切换时旧响应不覆盖新选中（同 AlertPanel loadSeq 惯例） */
let seq = 0

watch(
  () => [props.buildingId, props.floor] as const,
  async ([id, floor]) => {
    if (!id) return
    const s = ++seq
    loading.value = true
    todayKwh.value = carbonT.value = alarmCount.value = yesterdayKwh.value = null
    energyTrend.value = []
    alarmTrend.value = []
    if (floor) {
      // 楼层模式：§2.7 今日 + §2.6 昨日 + §3.7?floor + §2.8 能耗趋势 + §3.8?floor 告警趋势
      const [today, yest, cnt, hist, alarms] = await Promise.all([
        fetchFloorEnergyToday(id, floor).catch(() => null),
        fetchFloorEnergyYesterday(id, floor).catch(() => null),
        fetchBuildingCurrentAlarmCount(id, floor).catch(() => 0),
        fetchFloorEnergyHistory(id, floor).catch(() => []),
        fetchBuildingDailyAlarms(id, floor).catch(() => []),
      ])
      if (s !== seq || props.buildingId !== id || props.floor !== floor) return
      // §2.7 全部设备无读数时 energyKwh=null → 显示「—」（区分「无设备=0」）
      todayKwh.value = today?.energyKwh ?? null
      carbonT.value =
        today?.carbonKg != null ? Math.round((today.carbonKg / 1000) * 100) / 100 : null
      alarmCount.value = cnt
      yesterdayKwh.value = yest?.energyKwh ?? null
      energyTrend.value = hist
      alarmTrend.value = alarms
    } else {
      // 楼栋模式：§2.1 全量取本楼行 + §2.2 昨日 + §3.7 + §2.3 + §3.8
      const [today, yest, cnt, hist, alarms] = await Promise.all([
        fetchEnergyToday().catch(() => null),
        fetchEnergyYesterday(id).catch(() => []),
        fetchBuildingCurrentAlarmCount(id).catch(() => 0),
        fetchBuildingEnergyHistory(id).catch(() => []),
        fetchBuildingDailyAlarms(id).catch(() => []),
      ])
      if (s !== seq || props.buildingId !== id || props.floor != null) return
      const row = today?.buildingStats?.[props.buildingName]
      todayKwh.value = row ? row.energyKwh : null
      carbonT.value = row ? Math.round((row.carbonKg / 1000) * 100) / 100 : null
      alarmCount.value = cnt
      yesterdayKwh.value = yest[0]?.energyKwh ?? null
      energyTrend.value = hist
      alarmTrend.value = alarms
    }
    loading.value = false
  },
  { immediate: true },
)

/** WS 联动（批3）：event 单条推送归属本楼（楼层模式再加 floor 双匹配）→ 只重拉 §3.7。
 *  mock 模式 WS 不建连，本订阅静默无效。 */
async function reloadAlarmCount() {
  const cnt = await fetchBuildingCurrentAlarmCount(props.buildingId, props.floor ?? undefined).catch(
    () => null,
  )
  if (cnt != null) alarmCount.value = cnt
}

const offSingle = eventPushSocket.onSingle((item) => {
  if (
    item.locations?.some(
      (l) => l.building === props.buildingId && (props.floor == null || l.floor === props.floor),
    )
  ) {
    void reloadAlarmCount()
  }
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
        <h3 class="bic-name">
          {{ buildingName }}<template v-if="floorLabel"> · {{ floorLabel }}</template>
        </h3>
        <div class="bic-sub">
          <span class="bic-underline" />
          <span v-if="floorLabel" class="bic-tag">楼层详情</span>
        </div>
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
        <span class="bic-lbl">当前告警</span>
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
      <span class="bic-chart-title">近7日每日告警</span>
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
.bic-sub {
  display: flex;
  align-items: center;
  gap: 10px;
}
.bic-tag {
  font-size: 12px;
  font-weight: 600;
  color: var(--primary);
  padding: 2px 10px;
  border-radius: 999px;
  background: rgba(43, 124, 227, 0.1);
  border: 1px solid rgba(43, 124, 227, 0.35);
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
