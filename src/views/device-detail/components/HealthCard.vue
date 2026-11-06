<script setup lang="ts">
import type { EChartsOption } from 'echarts'
import BaseChart from '../../../panels/BaseChart.vue'

defineProps<{
  option: EChartsOption
  score: number | null
  status: { text: string; color: string }
}>()
</script>

<template>
  <div class="info-card glass-panel health-card">
    <div class="card-title">健康度</div>
    <div class="health-chart">
      <BaseChart :option="option" />
      <div class="health-center-num">{{ score ?? '--' }}</div>
    </div>
    <div class="health-status" :style="{ color: status.color }">
      {{ status.text }}
    </div>
  </div>
</template>

<style scoped>
.health-card {
  /* 卡片基底（福永页面级 .info-card 同款）：glass-panel 只提供底色边框 */
  padding: 16px 18px;
  border-radius: var(--radius);
  box-shadow: var(--card-shadow);
  overflow: hidden;
  flex: none;
}
.card-title {
  font-size: 18px;
  font-weight: 700;
  color: var(--title);
  margin-bottom: 14px;
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
.health-chart {
  position: relative;
  height: 168px;
}
.health-center-num {
  position: absolute;
  left: 50%;
  top: 54%;
  transform: translate(-50%, -50%);
  font-size: 36px;
  font-weight: 700;
  line-height: 1;
  font-family: var(--font-mono);
  color: var(--title);
  pointer-events: none;
}
.health-status {
  text-align: center;
  font-size: 16px;
  font-weight: 700;
  margin-top: -10px;
}
</style>
