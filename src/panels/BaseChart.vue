<script setup lang="ts">
import * as echarts from 'echarts/core'
import { BarChart, GaugeChart, LineChart, PieChart } from 'echarts/charts'
import {
  AxisPointerComponent,
  DataZoomComponent,
  GridComponent,
  LegendComponent,
  TitleComponent,
  TooltipComponent,
} from 'echarts/components'
import { CanvasRenderer } from 'echarts/renderers'
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'

// 按需注册：仅本工程实际用到的图表与组件，避免整包 echarts（gzip 370KB → ~130KB）
echarts.use([
  BarChart,
  GaugeChart,
  LineChart,
  PieChart,
  AxisPointerComponent,
  DataZoomComponent,
  GridComponent,
  LegendComponent,
  TitleComponent,
  TooltipComponent,
  CanvasRenderer,
])

const props = defineProps<{ option: echarts.EChartsCoreOption }>()

/** 透出 dataZoom 事件（拖动缩放条/框选时触发），供页面更新联动 UI；不关心可忽略 */
const emit = defineEmits<{ datazoom: [params: unknown] }>()

const el = ref<HTMLDivElement>()
let chart: echarts.ECharts | null = null
let ro: ResizeObserver | null = null

onMounted(() => {
  if (!el.value) return
  chart = echarts.init(el.value)
  chart.setOption(props.option)
  chart.on('datazoom', (params) => emit('datazoom', params))
  ro = new ResizeObserver(() => chart?.resize())
  ro.observe(el.value)
})

watch(
  () => props.option,
  (o) => chart?.setOption(o, true),
  { deep: true },
)

onBeforeUnmount(() => {
  ro?.disconnect()
  chart?.dispose()
  chart = null
})
</script>

<template>
  <div ref="el" class="base-chart" />
</template>

<style scoped>
.base-chart {
  width: 100%;
  height: 100%;
}
</style>
