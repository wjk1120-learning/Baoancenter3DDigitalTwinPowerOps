<script setup lang="ts">
// 配置中心行操作胶囊按钮（照搬福永配置中心参考包）：tone=primary 蓝系 / danger 红系
withDefaults(defineProps<{ tone?: 'primary' | 'danger' }>(), { tone: 'primary' })
defineEmits<{ click: [event: MouseEvent] }>()
</script>

<template>
  <button
    type="button"
    class="config-action-button"
    :class="`config-action-button--${tone}`"
    @click="$emit('click', $event)"
  ><slot /></button>
</template>

<style scoped>
.config-action-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  height: 28px;
  padding: 0 12px;
  border: 1px solid transparent;
  border-radius: 8px;
  font: inherit;
  font-size: 13px;
  line-height: 1;
  white-space: nowrap;
  cursor: pointer;
  transition: background-color .2s, border-color .2s, color .2s;
}
.config-action-button--primary {
  color: var(--primary-600);
  background: var(--primary-50);
  border-color: var(--primary-100);
}
.config-action-button--primary:hover {
  color: var(--primary-700);
  background: var(--primary-100);
  border-color: var(--primary-200);
}
.config-action-button--danger {
  color: var(--danger-text);
  background: #fdf2f2;
  border-color: #f7dcdd;
}
.config-action-button--danger:hover {
  color: #a92a30;
  background: #fbe6e7;
  border-color: #f2c4c6;
}
</style>
