<script setup lang="ts">
/** 配电房分类卡片（样式与 props API 对齐福永同名组件，暂无告警状态） */
defineProps<{
  options: { label: string; value: string }[]
  count: number
  selected: string
}>()

const emit = defineEmits<{ select: [value: string] }>()
</script>

<template>
  <aside class="cat-panel" aria-label="配电房分类">
    <div class="cat-head">
      <span class="cat-title">配电房分类</span>
      <span class="cat-count">共 {{ count }} 台</span>
    </div>
    <div class="cat-list">
      <button
        v-for="opt in options"
        :key="opt.value"
        type="button"
        class="cat-item"
        :class="{ active: selected === opt.value }"
        @click="emit('select', opt.value)"
      >
        {{ opt.label }}
      </button>
    </div>
  </aside>
</template>

<style scoped>
.cat-panel {
  position: absolute;
  left: 24px;
  top: calc(var(--topbar-height) + 16px);
  z-index: 12;
  width: max-content;
  max-width: 42vw;
  display: flex;
  flex-direction: column;
  gap: 10px;
  box-sizing: border-box;
  padding: 14px 12px;
  background: linear-gradient(165deg, rgba(255, 255, 255, 0.38), rgba(236, 244, 250, 0.18));
  backdrop-filter: blur(22px) saturate(165%);
  -webkit-backdrop-filter: blur(22px) saturate(165%);
  border: 1px solid rgba(255, 255, 255, 0.58);
  border-radius: 14px;
  box-shadow:
    0 10px 28px rgba(15, 36, 56, 0.12),
    inset 0 1px 0 rgba(255, 255, 255, 0.72);
}
.cat-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
  padding: 0 4px 2px;
}
.cat-title {
  font-size: 16px;
  font-weight: 700;
  color: #182635;
  white-space: nowrap;
}
.cat-count {
  font-size: 13px;
  color: #5a7188;
  white-space: nowrap;
}
.cat-list {
  flex: none;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.cat-item {
  box-sizing: border-box;
  padding: 10px 14px;
  text-align: left;
  border: 1px solid rgba(255, 255, 255, 0.55);
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.42);
  font-size: 15px;
  font-weight: 600;
  font-family: inherit;
  color: #24364a;
  white-space: nowrap;
  cursor: pointer;
  transition:
    background 0.15s,
    color 0.15s,
    border-color 0.15s,
    box-shadow 0.15s;
}
.cat-item:hover {
  background: rgba(82, 149, 232, 0.14);
  color: #2b7ce3;
  border-color: rgba(82, 149, 232, 0.35);
}
.cat-item.active {
  background: #2b7ce3;
  color: #fff;
  border-color: #2b7ce3;
  box-shadow: 0 0 0 3px rgba(43, 124, 227, 0.18);
}
</style>
