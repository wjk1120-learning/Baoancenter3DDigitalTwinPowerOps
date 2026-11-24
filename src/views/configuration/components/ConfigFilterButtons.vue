<script setup lang="ts" generic="T extends string | number | null">
// 配置中心筛选按钮组（照搬福永配置中心参考包）：active 蓝底白字
defineProps<{
  options: { label: string; value: T }[]
  value: T
  label: string
}>()
defineEmits<{ change: [value: T] }>()
</script>

<template>
  <div class="config-filter-buttons" role="group" :aria-label="label">
    <button
      v-for="option in options"
      :key="String(option.value)"
      type="button"
      class="config-filter-button"
      :class="{ 'config-filter-button--active': option.value === value }"
      :aria-pressed="option.value === value"
      @click="$emit('change', option.value)"
    >{{ option.label }}</button>
  </div>
</template>

<style scoped>
.config-filter-buttons { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
.config-filter-button {
  height: 34px;
  padding: 0 14px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: transparent;
  color: var(--text);
  font: inherit;
  cursor: pointer;
  transition: border-color .2s, background-color .2s, color .2s;
}
.config-filter-button:hover { border-color: var(--primary-400); color: var(--primary-400); }
.config-filter-button--active { border-color: var(--primary); background: var(--primary); color: var(--on-primary); }
.config-filter-button--active:hover { border-color: var(--primary-600); background: var(--primary-600); color: var(--on-primary); }
</style>
