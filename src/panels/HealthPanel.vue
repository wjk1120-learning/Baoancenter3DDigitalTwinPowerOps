<script setup lang="ts">
import { computed, onActivated, ref } from 'vue'
import BaseChart from './BaseChart.vue'
import { fetchHealthAverage, fetchHealthLevelStats } from '../api/device/device'
import type { DeviceHealthLevelStats } from '../api/device/types'
import { GRADE_META } from '../config/healthGrades'

/**
 * 医院总览 · 医院整体健康度面板（福永 HealthPanel 同构，宝中重写）：
 * 左 = 全院健康度仪表盘（§1.13 平均值，0–100，颜色随分值）；右 = 五档分布列表（§1.12）。
 * 只渲染内容区，卡片框/标题/「更多」由页面壳负责。进页拉一次（低频数据，不做轮询）。
 */
const score = ref<number | null>(null)
const gradeStats = ref<DeviceHealthLevelStats | null>(null)

// 只挂 onActivated：keep-alive 首次挂载 activated 也会触发，双挂会首屏双发（2026-11-25 联调实测）
onActivated(load)

async function load() {
  const avg = await fetchHealthAverage().catch(() => null)
  score.value = avg
  gradeStats.value = await fetchHealthLevelStats(undefined).catch(() => null)
}

/** 分值文案（福永同款）：≥85 运行状况良好 / ≥70、≥50 一般 / ≥30 较差 / <30 极差 */
const scoreText = computed(() => {
  const s = score.value
  if (s == null) return ''
  if (s >= 85) return '运行状况良好'
  if (s >= 50) return '运行状况一般'
  if (s >= 30) return '运行状况较差'
  return '运行状况极差'
})

/** 健康度仪表盘 · 淡绿主题（福永 HealthPanel 同款：轨道/进度/指针与数值） */
const HEALTH_GREEN = { track: '#E8F6EC', progress: '#8FD4A8', accent: '#3D9B62' }
const WARN_COLOR = '#F5A623'
const DANGER_COLOR = '#C2333A'

const gaugeColor = computed(() => {
  const s = score.value
  if (s == null) return HEALTH_GREEN.track
  if (s >= 70) return HEALTH_GREEN.accent
  if (s >= 50) return WARN_COLOR
  return DANGER_COLOR
})

/** 进度色：正常档用浅→深绿渐变提升质感，警示档纯色 */
const gaugeProgress = computed(() => {
  const s = score.value
  if (s == null) return HEALTH_GREEN.track
  if (s >= 70)
    return {
      type: 'linear',
      x: 0,
      y: 0,
      x2: 1,
      y2: 1,
      colorStops: [
        { offset: 0, color: '#A9E6C1' },
        { offset: 1, color: '#3D9B62' },
      ],
    }
  if (s >= 50) return WARN_COLOR
  return DANGER_COLOR
})

const gaugeOption = computed(() => ({
  series: [
    {
      type: 'gauge',
      startAngle: 210,
      endAngle: -30,
      min: 0,
      max: 100,
      radius: '90%',
      center: ['50%', '60%'],
      progress: {
        show: true,
        width: 8,
        roundCap: true,
        itemStyle: { color: gaugeProgress.value },
      },
      axisLine: { lineStyle: { width: 8, color: [[1, HEALTH_GREEN.track]] } },
      pointer: { show: score.value != null, length: '55%', width: 3, itemStyle: { color: gaugeColor.value } },
      axisTick: { distance: -10, length: 3, lineStyle: { color: '#D6E4F2' } },
      splitLine: { distance: -10, length: 8, lineStyle: { color: '#D6E4F2' } },
      axisLabel: { distance: 14, fontSize: 8, color: '#9AA7B8' },
      title: { show: false },
      detail: {
        valueAnimation: true,
        offsetCenter: [0, '62%'],
        fontSize: 16,
        fontWeight: 800,
        // 平台主字体栈（思源黑体，OFL 可商用；回退微软雅黑）——数字加粗饱满且无版权风险
        fontFamily: "'Source Han Sans SC', '思源黑体', 'Noto Sans CJK SC', 'Microsoft YaHei', sans-serif",
        color: gaugeColor.value,
        formatter: score.value == null ? '--' : '{value}',
      },
      data: [{ value: score.value ?? 0 }],
    },
  ],
}))

/** 五档行：颜色照福永 HealthPanel（优秀绿 / 良好·一般琥珀 / 较差·极差红） */
const gradeRows = computed(() => {
  const colorById: Record<string, string> = {
    excellent: HEALTH_GREEN.accent,
    good: WARN_COLOR,
    fair: WARN_COLOR,
    poor: DANGER_COLOR,
    terrible: DANGER_COLOR,
  }
  return GRADE_META.filter((g) => g.id !== 'all').map((g) => ({
    id: g.id,
    name: g.label,
    hint: g.hint.replace('健康度 ', ''),
    count: gradeStats.value ? gradeStats.value[`${g.id}Count` as keyof DeviceHealthLevelStats] : null,
    color: colorById[g.id],
  }))
})
</script>

<template>
  <div class="health">
    <div class="gauge-col">
      <div class="gauge-box">
        <BaseChart :option="gaugeOption" />
      </div>
      <div class="desc">{{ scoreText || '--' }}</div>
    </div>

    <ul class="grade-list">
      <li v-for="g in gradeRows" :key="g.id">
        <span class="g-dot" :style="{ background: g.color }" />
        <span class="g-name">{{ g.name }}</span>
        <span class="g-hint">{{ g.hint }}</span>
        <span class="g-count">{{ g.count ?? '—' }}</span>
        <span class="g-unit">台</span>
      </li>
    </ul>
  </div>
</template>

<style scoped>
.health {
  height: 100%;
  display: flex;
  align-items: center;
  gap: 18px;
}
.gauge-col {
  flex: none;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  width: 132px;
}
.gauge-box {
  width: 132px;
  height: 118px;
  flex: none;
}
.desc {
  font-size: 13px;
  color: var(--muted);
  text-align: center;
  line-height: 1.3;
  max-width: 132px;
}
.grade-list {
  flex: 1;
  min-width: 0;
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 8px;
}
.grade-list li {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
}
.g-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex: none;
}
.g-name {
  color: var(--title);
  font-weight: 600;
  width: 32px;
}
.g-hint {
  color: var(--muted);
  flex: 1;
  min-width: 0;
  font-size: 12px;
}
.g-count {
  color: var(--title);
  font-weight: 700;
  font-size: 16px;
  line-height: 1;
  font-family: var(--font-mono);
}
.g-unit {
  color: var(--muted);
  font-size: 12px;
}
</style>
