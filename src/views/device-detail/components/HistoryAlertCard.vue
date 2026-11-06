<script setup lang="ts">
import { eventLevelLabel, normalizeEventLevel } from '../../../api/event/mappers'
import type { HistoryAlertRow } from '../../../api/hospital/types'

/**
 * 告警记录卡（历史告警，§3.3 按设备查询）。
 * 顶部只读设备框与「电能趋势」的开关下拉同步（告警跟随所选开关查询，不自筛）。
 * 等级配色按宝中口径：紧急红 / 严重琥珀 / 一般主题蓝 / 提醒灰。
 */
defineProps<{
  alerts: HistoryAlertRow[]
  loading: boolean
  /** 电能趋势当前选中的开关名（只读展示） */
  deviceName?: string
}>()

const emit = defineEmits<{ open: [row: HistoryAlertRow] }>()

function gradeOf(a: HistoryAlertRow) {
  if (a.eventLevel) return normalizeEventLevel(a.eventLevel)
  return a.level === 'error' ? 1 : 3
}

function formatHistTime(t: string) {
  const m = t.match(/(?:\d{4}-)?(\d{2}-\d{2})[ T](\d{2}:\d{2})(?::\d{2})?/)
  if (m) return `${m[1]} ${m[2]}`
  return t || '—'
}
</script>

<template>
  <div class="info-card glass-panel hist-card">
    <div class="hist-head">
      <div class="card-title">告警记录</div>
      <!-- 设备框：只做展示，与「电能趋势」的开关下拉同步；此处不可筛选 -->
      <div class="hist-device" :title="deviceName || '—'">{{ deviceName || '—' }}</div>
    </div>
    <div class="hist-scroll">
      <button
        v-for="it in alerts"
        :key="it.id"
        type="button"
        class="hist-item"
        :class="`lv-${gradeOf(it)}`"
        @click="emit('open', it)"
      >
        <div class="top">
          <span class="grade" :class="`g-${gradeOf(it)}`">{{
            eventLevelLabel(normalizeEventLevel(gradeOf(it) as 1 | 2 | 3 | 4))
          }}</span>
          <span class="st" :class="it.status">{{
            it.status === 'done' ? '已处理' : '未处理'
          }}</span>
        </div>
        <div class="content">{{ it.content || '—' }}</div>
        <div class="meta num">{{ formatHistTime(it.time) }}</div>
      </button>
      <div v-if="!loading && !alerts.length" class="hist-empty">
        <svg
          class="he-icon"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="1.6"
          stroke-linecap="round"
          stroke-linejoin="round"
          aria-hidden="true"
        >
          <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.7 21a2 2 0 0 1-3.4 0" />
        </svg>
        <span class="he-main">暂无告警记录</span>
      </div>
      <div v-else-if="loading && !alerts.length" class="hist-loading">加载中…</div>
    </div>
  </div>
</template>

<style scoped>
.hist-card {
  /* 卡片基底（福永页面级 .info-card 同款）：glass-panel 只提供底色边框 */
  padding: 16px 18px;
  border-radius: var(--radius);
  box-shadow: var(--card-shadow);
  /* 与底部「电能趋势」面板等高（共用页面级 --trend-panel-h）：两块底边同贴页面底部、顶边对齐 */
  flex: none;
  height: var(--trend-panel-h, 317.6px);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
.card-title {
  font-size: 18px;
  font-weight: 700;
  color: var(--title);
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
/* 标题 + 右侧只读设备框：样式对齐「电能趋势」的开关下拉（28px 高、#B9CEE9 边框、8px 圆角） */
.hist-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 10px;
  flex: none;
}
.hist-device {
  flex: 0 1 140px;
  min-width: 0;
  height: 28px;
  box-sizing: border-box;
  padding: 0 12px;
  display: flex;
  align-items: center;
  border: 1px solid #b9cee9;
  border-radius: 8px;
  background: #fff;
  font-size: 14px;
  color: #33485f;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  cursor: default;
  user-select: text;
}
/* 空态：图标 + 主文案，居中撑满卡片 */
.hist-empty {
  flex: 1;
  min-height: 140px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  color: var(--muted);
}
.he-icon {
  width: 38px;
  height: 38px;
  color: #b9cee9;
}
.he-main {
  font-size: 15px;
}
.hist-loading {
  font-size: 15px;
  color: var(--muted);
  text-align: center;
  padding: 18px;
}
.hist-scroll {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 6px;
  scrollbar-width: thin;
  scrollbar-color: rgba(43, 124, 227, 0.35) transparent;
}
.hist-item {
  display: flex;
  flex-direction: column;
  gap: 4px;
  width: 100%;
  text-align: left;
  padding: 8px 10px 8px 12px;
  border-radius: 10px;
  background: linear-gradient(150deg, rgba(255, 255, 255, 0.6), rgba(255, 255, 255, 0.16));
  border: 1px solid rgba(255, 255, 255, 0.65);
  border-left: 3px solid var(--primary-300);
  box-shadow:
    inset 0 1px 1px rgba(255, 255, 255, 0.85),
    0 2px 6px rgba(43, 108, 160, 0.06);
  cursor: pointer;
  font: inherit;
  color: inherit;
}
/* 等级左侧色条：紧急红 / 严重琥珀 / 一般主题蓝 / 提醒灰（宝中口径，提醒=muted） */
.hist-item.lv-1 {
  border-left-color: var(--danger);
}
.hist-item.lv-2 {
  border-left-color: var(--warn);
}
.hist-item.lv-3 {
  border-left-color: var(--primary);
}
.hist-item.lv-4 {
  border-left-color: var(--muted);
}
.hist-item:hover {
  background: linear-gradient(150deg, rgba(255, 255, 255, 0.8), rgba(255, 255, 255, 0.34));
}
.hist-item .top {
  display: flex;
  align-items: center;
  gap: 8px;
}
.hist-item .grade {
  font-size: 12px;
  font-weight: 700;
  padding: 2px 8px;
  border-radius: 999px;
}
.hist-item .grade.g-1 {
  color: var(--danger-text);
  background: rgba(229, 72, 77, 0.14);
}
.hist-item .grade.g-2 {
  color: var(--warn-text);
  background: rgba(245, 166, 35, 0.16);
}
.hist-item .grade.g-3 {
  color: var(--primary-700);
  background: var(--primary-50);
}
.hist-item .grade.g-4 {
  color: var(--muted);
  background: rgba(93, 113, 137, 0.12);
}
.hist-item .st {
  margin-left: auto;
  font-size: 12px;
  color: var(--muted);
}
.hist-item .st.done {
  color: var(--ok-text);
}
.hist-item .st.pending {
  color: var(--danger-text);
}
.hist-item .content {
  font-size: 15px;
  color: var(--text);
  line-height: 1.4;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.hist-item .meta {
  font-size: 13px;
  color: var(--muted);
}
</style>
