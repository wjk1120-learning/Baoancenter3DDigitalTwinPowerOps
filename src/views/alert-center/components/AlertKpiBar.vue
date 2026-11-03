<script setup lang="ts">
/** 告警中心 KPI 条（福永 ac-kpi 同款：五枚数字卡） */
defineProps<{
  total: number
  today: number
  unhandled: number
  urgent: number
  rate: number
}>()
</script>

<template>
  <div class="ac-kpi glass-panel">
    <div class="kpi-card">
      <span class="kpi-val">{{ total }}</span>
      <span class="kpi-lbl">总告警数</span>
    </div>
    <div class="kpi-card">
      <span class="kpi-val">{{ today }}</span>
      <span class="kpi-lbl">今日告警</span>
    </div>
    <div class="kpi-card">
      <span class="kpi-val warn">{{ unhandled }}</span>
      <span class="kpi-lbl">未处理</span>
    </div>
    <div class="kpi-card">
      <span class="kpi-val danger">{{ urgent }}</span>
      <span class="kpi-lbl">紧急</span>
    </div>
    <div class="kpi-card">
      <span class="kpi-val">{{ rate.toFixed(0) }}%</span>
      <span class="kpi-lbl">处理率</span>
    </div>
  </div>
</template>

<style scoped>
.ac-kpi {
  flex: none;
  display: flex;
  gap: 0;
  padding: 14px 8px;
  border-radius: var(--radius);
  box-shadow: var(--card-shadow);
}
.kpi-card {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  padding: 4px 10px;
  border-right: 1px solid var(--border);
  position: relative;
}
.kpi-card:last-child {
  border-right: none;
}
.kpi-val {
  font-size: 36px;
  font-weight: 700;
  color: var(--primary-700);
  font-family: var(--font-mono);
  line-height: 1;
}
.kpi-val.warn {
  color: var(--warn-text);
}
.kpi-val.danger {
  color: var(--danger-text);
}
.kpi-lbl {
  font-size: 14px;
  color: var(--muted);
  letter-spacing: 0.3px;
}
</style>
