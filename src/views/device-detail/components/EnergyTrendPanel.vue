<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { NSelect } from 'naive-ui'
import type { EChartsOption } from 'echarts'
import BaseChart from '../../../panels/BaseChart.vue'
import { fetchDeviceDailyEnergy } from '../../../api/energy/energy'
import type { DeviceDailyEnergy } from '../../../api/energy/types'
import type { DeviceBrief } from '../../../api/device/types'
import { chartColors, withAlpha } from '../../../config/chartColors'

/**
 * 电能趋势面板（设备详情底部中区，§2.4）。
 * 下拉：该箱柜下的开关（页面按 §1.8 精简列表拉好后经 props 传入）；
 * 折线图 = 所选开关近 30 天逐日电量（固定近 30 个完整日、截至昨日；
 * 无读数日为 null → 折线断点，不折算成 0）。全部日无读数时画 0 值水平线占位。
 * 选中只驱动 §2.4 一个请求（2026-11-06 用户拍板：与告警卡下拉解耦，各自独立）。
 */
const props = defineProps<{
  superId: number | null
  /** 箱柜下开关列表（页面按 §1.8 精简接口拉取后传入，避免同柜重复请求） */
  devices: DeviceBrief[]
}>()

const deviceId = ref<number | null>(null)
const days = ref<DeviceDailyEnergy[]>([])
const loading = ref(false)

const deviceOptions = computed(() =>
  props.devices.map((d) => ({ label: d.deviceName, value: d.deviceId })),
)

/** 下拉菜单固定 180px、超出滚动（naive 官方通道 InternalSelectMenu.height——虚拟列表/滚动条随该值正确计算；CSS 压外层盒子虚拟列表不认账） */
const menuTheme = { peers: { InternalSelectMenu: { height: '180px' } } }

async function loadEnergy() {
  if (deviceId.value == null) {
    days.value = []
    return
  }
  loading.value = true
  try {
    days.value = await fetchDeviceDailyEnergy(deviceId.value)
  } finally {
    loading.value = false
  }
}

watch(
  () => [props.superId, props.devices] as const,
  () => {
    // 换柜先清空选中，避免旧柜的开关 id 在新列表里「碰巧存在」时串台
    deviceId.value = null
    if (!props.devices.some((d) => d.deviceId === deviceId.value)) {
      deviceId.value = props.devices[0]?.deviceId ?? null
    }
    void loadEnergy()
  },
  { immediate: true },
)
watch(deviceId, () => void loadEnergy())

/** 有任一天有读数即视为有数据 */
const hasData = computed(() => days.value.some((d) => d.energyKwh != null))
const chartEmpty = computed(() => !loading.value && !hasData.value)

/** X 轴标签：接口返回的 30 天（M/D，按日升序） */
const xLabels = computed(() =>
  days.value.map((d) => {
    const [, m, day] = d.day.split('-')
    return `${Number(m)}/${Number(day)}`
  }),
)

/** 序列：有读数画值，null 留断点；整体无数据时 0 值平线占位 */
const seriesValues = computed<(number | null)[]>(() => {
  if (!days.value.length || !hasData.value) return xLabels.value.map(() => 0)
  return days.value.map((d) => (d.energyKwh == null ? null : Math.round(d.energyKwh * 100) / 100))
})

/** 折线图：X 轴近 30 天，Y 轴电量 kWh（单位跟随标题同行展示） */
const option = computed<EChartsOption>(() => ({
  // 占位平线不提供 tooltip，避免读出「0 kWh」被当成真实读数；
  // 有数据时 null 日（断点）显示「无读数」
  tooltip: hasData.value
    ? {
        trigger: 'axis',
        valueFormatter: (v) => (v == null ? '无读数' : `${v} kWh`),
      }
    : { show: false },
  grid: { left: 48, right: 20, top: 18, bottom: 26 },
  xAxis: {
    type: 'category',
    data: xLabels.value,
    boundaryGap: false,
    axisLine: { lineStyle: { color: chartColors.borderStrong } },
    axisLabel: { color: chartColors.muted, fontSize: 11, interval: 3 },
  },
  yAxis: {
    type: 'value',
    min: 0,
    // 占位态给固定量程，平线（0 值）在刻度底部可见；有数据时按实际自动缩放
    max: hasData.value ? undefined : 10,
    axisLabel: { color: chartColors.muted, fontSize: 11 },
    splitLine: { lineStyle: { color: chartColors.border } },
  },
  series: [
    {
      type: 'line',
      smooth: true,
      symbol: 'circle',
      symbolSize: 5,
      connectNulls: false,
      data: seriesValues.value,
      itemStyle: { color: chartColors.primary },
      lineStyle: { color: chartColors.primary, width: 2.5 },
      areaStyle: { color: withAlpha(chartColors.primary, 0.12) },
    },
  ],
}))
</script>

<template>
  <section class="center-trend glass-panel">
    <div class="trend-head">
      <div class="card-title">电能趋势<span class="title-unit">kWh</span></div>
      <div class="trend-filters">
        <NSelect
          :value="deviceId"
          :options="deviceOptions"
          size="small"
          class="device-select"
          :show-checkmark="false"
          placeholder="选择开关"
          :theme-overrides="menuTheme"
          @update:value="(v: number | null) => (deviceId = v)"
        />
      </div>
    </div>
    <div class="trend-chart">
      <BaseChart :option="option" />
      <div v-if="chartEmpty" class="trend-empty">
        {{ deviceId == null ? '该设备下暂无开关' : '暂无能耗数据' }}
      </div>
    </div>
  </section>
</template>

<style scoped>
.center-trend {
  position: absolute;
  left: 440px;
  right: 440px;
  bottom: 16px;
  /* 高度与左栏「告警记录」卡共用同一变量（页面级 --trend-panel-h） */
  height: var(--trend-panel-h, calc(32% - 28px));
  z-index: 10;
  padding: 12px 18px 8px;
  border-radius: var(--radius);
  box-shadow: var(--card-shadow);
  display: flex;
  flex-direction: column;
  min-height: 0;
}
.trend-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 2px;
}
.card-title {
  font-size: 18px;
  font-weight: 700;
  color: var(--title);
  margin-bottom: 0;
  position: relative;
  padding-left: 12px;
}
.card-title::before {
  content: '';
  position: absolute;
  left: 0;
  top: 50%;
  transform: translateY(-50%);
  width: 3px;
  height: 16px;
  background: var(--primary);
  border-radius: 2px;
}
/* kWh 单位跟随标题同行展示 */
.title-unit {
  margin-left: 6px;
  font-size: 12px;
  font-weight: 500;
  color: var(--muted);
  letter-spacing: 0.4px;
}
.trend-filters {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: none;
}
/* 开关名称较长：给更宽的下拉 */
.device-select {
  width: 180px;
}
.trend-chart {
  flex: 1;
  min-height: 0;
  position: relative;
}
.trend-empty {
  position: absolute;
  top: 40px;
  right: 18px;
  bottom: 32px;
  left: 44px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 14px;
  color: var(--muted);
  letter-spacing: 2px;
  pointer-events: none;
}
</style>
