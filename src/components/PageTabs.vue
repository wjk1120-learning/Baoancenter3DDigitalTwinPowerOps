<script setup lang="ts">
import { navConfig } from '../config/navConfig'
import { usePageTabs } from '../store/pageTabs'

/** 页内标签条（样式与行为照搬福永 PageTabs；无 router，点击只切 store 状态） */
const { tabs, activePath, open, close } = usePageTabs()

function go(path: string) {
  if (path === activePath.value) return
  const item = navConfig.find((i) => i.route === path)
  if (item) open(item.route, item.name, item.id)
}

function closeTab(path: string, event: MouseEvent) {
  event.stopPropagation()
  close(path)
  // 关空时回首页标签（福永关闭兜底推 /hospital 同款逻辑）
  if (tabs.value.length === 0) {
    const home = navConfig[0]!
    open(home.route, home.name, home.id)
  }
}
</script>

<template>
  <div class="page-tabs" :class="{ empty: tabs.length === 0 }">
    <div
      v-for="tab in tabs"
      :key="tab.path"
      class="tab-item"
      :class="{ active: tab.path === activePath }"
      @click="go(tab.path)"
    >
      <span class="tab-title">{{ tab.title }}</span>
      <button class="tab-close" title="关闭" @click="closeTab(tab.path, $event)">
        <svg viewBox="0 0 24 24" fill="currentColor" width="12" height="12">
          <path
            d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"
          />
        </svg>
      </button>
    </div>
  </div>
</template>

<style scoped>
.page-tabs {
  display: flex;
  align-items: center;
  gap: 6px;
  overflow-x: auto;
  flex: 1;
  min-width: 0;
}
.page-tabs.empty {
  visibility: hidden;
}
.tab-item {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 32px;
  padding: 0 10px 0 14px;
  border: 1px solid rgba(214, 228, 245, 0.8);
  border-radius: 6px;
  background: rgba(255, 255, 255, 0.6);
  color: var(--muted);
  font-size: 13px;
  cursor: pointer;
  user-select: none;
  transition: all 0.2s;
  flex: none;
}
.tab-item:hover {
  color: var(--primary);
  background: rgba(255, 255, 255, 0.9);
}
.tab-item.active {
  color: var(--primary);
  font-weight: 600;
  background: #fff;
  border-color: rgba(82, 149, 232, 0.35);
  box-shadow: 0 2px 8px rgba(43, 108, 160, 0.12);
}
.tab-close {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  padding: 0;
  border: none;
  border-radius: 50%;
  background: transparent;
  color: var(--muted);
  cursor: pointer;
  transition: all 0.2s;
}
.tab-close:hover {
  background: var(--primary-50);
  color: var(--primary);
}
</style>
