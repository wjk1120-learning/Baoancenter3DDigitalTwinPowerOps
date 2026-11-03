<script setup lang="ts">
import { GRADE_META, type HealthGrade } from '../config/healthGrades'

defineProps<{
  counts: Record<HealthGrade, number>
  selected: HealthGrade
}>()

const emit = defineEmits<{ select: [grade: HealthGrade] }>()
</script>

<template>
  <aside class="health-aside">
    <button
      v-for="g in GRADE_META"
      :key="g.id"
      type="button"
      class="health-card glass-panel"
      :class="[g.id, { active: selected === g.id }]"
      @click="emit('select', g.id)"
    >
      <div class="hc-head">
        <span class="hc-label">{{ g.label }}</span>
        <span class="hc-hint">{{ g.hint }}</span>
      </div>
      <div class="hc-num num">{{ counts[g.id] }}</div>
      <div class="hc-unit">台设备</div>
    </button>
  </aside>
</template>

<style scoped>
/* 右侧健康度分级卡（1.20 五档，配色与医院总览健康度面板一致） */
.health-aside {
  flex: none;
  width: 200px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.health-card {
  position: relative;
  overflow: hidden;
  text-align: left;
  padding: 12px 16px 10px;
  border-radius: var(--radius);
  border: 1px solid var(--border);
  box-shadow: var(--card-shadow);
  cursor: pointer;
  transition:
    transform 0.18s,
    box-shadow 0.18s,
    border-color 0.18s;
}
.health-card::before {
  content: '';
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  width: 4px;
}
.health-card.all::before {
  background: var(--cyan);
}
/* 仅「优秀」用主题蓝（用户设计定稿）；良好/一般=琥珀、较差/极差=红 */
.health-card.excellent::before {
  background: var(--primary);
}
.health-card.good::before,
.health-card.fair::before {
  background: var(--warn);
}
.health-card.poor::before,
.health-card.terrible::before {
  background: var(--danger);
}
.health-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 6px 16px rgba(43, 108, 160, 0.14);
}
.health-card.active {
  border-color: transparent;
  box-shadow: 0 6px 18px rgba(43, 108, 160, 0.16);
}
.health-card.all.active {
  background: rgba(23, 162, 184, 0.1);
}
.health-card.excellent.active {
  background: rgba(43, 124, 227, 0.1);
}
.health-card.good.active,
.health-card.fair.active {
  background: rgba(245, 166, 35, 0.1);
}
.health-card.poor.active,
.health-card.terrible.active {
  background: rgba(229, 72, 77, 0.08);
}
.hc-head {
  display: flex;
  flex-direction: column;
  gap: 2px;
  margin-bottom: 6px;
}
.hc-label {
  font-size: 15px;
  font-weight: 700;
  color: var(--title);
}
.hc-hint {
  font-size: 12px;
  color: var(--muted);
}
.hc-num {
  font-size: 30px;
  font-weight: 700;
  line-height: 1;
  font-family: var(--font-mono);
}
.health-card.all .hc-num {
  color: var(--cyan-deep, #17a2b8);
}
.health-card.excellent .hc-num {
  color: var(--primary-700);
}
.health-card.good .hc-num,
.health-card.fair .hc-num {
  color: var(--warn-text);
}
.health-card.poor .hc-num,
.health-card.terrible .hc-num {
  color: var(--danger);
}
.hc-unit {
  margin-top: 3px;
  font-size: 13px;
  color: var(--muted);
}
</style>
