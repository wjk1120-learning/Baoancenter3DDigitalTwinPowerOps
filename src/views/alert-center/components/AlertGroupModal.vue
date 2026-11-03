<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { NSelect } from 'naive-ui'
import type { DeviceEventGroup, EventInfo } from '../../../api/event/types'
import { eventLevelLabel, normalizeEventLevel } from '../../../api/event/mappers'
import { GRADE_BY_ID, groupCount } from '../composables/groupMeta'
import { chartColors } from '../../../config/chartColors'

/**
 * 组内事件弹窗（福永 ev-box 同款）：设备元信息头 + 事件明细表（状态筛选/标记处理/详情）+ 分页。
 * 自持翻页与状态筛选；打开新组时由 group watch 重置。
 */
const props = defineProps<{
  group: DeviceEventGroup | null
  handlingIds: Record<string, boolean>
}>()

const emit = defineEmits<{
  close: []
  handle: [eventId: string]
  detail: [event: EventInfo]
}>()

const evPage = ref(1)
const evPageSize = 13
const evHandleFilter = ref<'all' | '0' | '1'>('all')
const handleFilterOptions = [
  { label: '全部', value: 'all' },
  { label: '未处理', value: '0' },
  { label: '已处理', value: '1' },
]

watch(
  () => props.group,
  () => {
    evHandleFilter.value = 'all'
    evPage.value = 1
  },
)

const groupEvents = computed(() => {
  let list = [...(props.group?.events ?? [])]
  if (evHandleFilter.value === '0') list = list.filter((e) => e.handleStatus === 0)
  else if (evHandleFilter.value === '1') list = list.filter((e) => e.handleStatus === 1)
  return list.sort((a, b) => String(b.timeStr || '').localeCompare(String(a.timeStr || '')))
})
const evTotalPages = computed(() => Math.max(1, Math.ceil(groupEvents.value.length / evPageSize)))
const pagedGroupEvents = computed(() => {
  const start = (evPage.value - 1) * evPageSize
  return groupEvents.value.slice(start, start + evPageSize)
})

function eventLevelMeta(level: number) {
  const id = normalizeEventLevel(level)
  return GRADE_BY_ID[id] || { label: eventLevelLabel(level), color: chartColors.muted }
}
function handleMeta(status: number) {
  if (status === 1) return { label: '已处理', cls: 'st-done' }
  if (status === 0) return { label: '未处理', cls: 'st-pending' }
  return { label: '—', cls: '' }
}
function eventKey(e: EventInfo, i: number) {
  return e.eventId || `${e.tsMs}-${e.description}-${i}`
}
function levelTag(g: DeviceEventGroup) {
  const meta = GRADE_BY_ID[normalizeEventLevel(g.highestLevel)]
  return meta || { label: eventLevelLabel(g.highestLevel), color: chartColors.muted }
}
</script>

<template>
  <Transition name="ev">
    <div v-if="props.group" class="ev-mask" @click.self="emit('close')">
      <div class="ev-box" role="dialog" aria-modal="true">
        <header class="ev-head">
          <div class="ev-meta">
            <span class="ev-item" :title="props.group.deviceName || ''">
              <em>设备名称：</em>{{ props.group.deviceName || '—' }}
            </span>
            <span class="ev-item">
              <em>设备ID：</em><span class="mono">{{ props.group.deviceId || '—' }}</span>
            </span>
            <span class="ev-item">
              <em>事件数量：</em><span class="mono">{{ groupCount(props.group) }}</span>
            </span>
            <span class="ev-item">
              <em>最高告警等级：</em>
              <span class="lv-tag" :style="{ '--tag-color': levelTag(props.group).color }">{{
                levelTag(props.group).label
              }}</span>
            </span>
          </div>
          <button class="ev-x" type="button" aria-label="关闭" @click="emit('close')">×</button>
        </header>
        <div class="ev-scroll">
          <table class="ev-table">
            <thead>
              <tr>
                <th class="ev-time">时间</th>
                <th class="ev-lv">等级</th>
                <th class="ev-desc">事件描述</th>
                <th class="ev-st">
                  <span class="ev-st-head">
                    <span class="ev-st-label">状态</span>
                    <NSelect
                      v-model:value="evHandleFilter"
                      :options="handleFilterOptions"
                      size="small"
                      class="ev-st-select"
                      :show-checkmark="false"
                      :consistent-menu-width="false"
                      :menu-props="{ class: 'ev-st-select-menu' }"
                      @update:value="evPage = 1"
                    />
                  </span>
                </th>
                <th class="ev-act">操作</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="(e, i) in pagedGroupEvents"
                :key="eventKey(e, i)"
                :class="{ urgent: normalizeEventLevel(e.eventLevel) === 1 }"
              >
                <td class="mono">{{ e.timeStr || '—' }}</td>
                <td>
                  <span
                    class="lv-tag"
                    :style="{ '--tag-color': eventLevelMeta(e.eventLevel).color }"
                    >{{ eventLevelMeta(e.eventLevel).label }}</span
                  >
                </td>
                <td class="ev-desc" :title="e.description || ''">{{ e.description || '—' }}</td>
                <td class="ev-st">
                  <span class="ev-st-row">
                    <span class="st-pill" :class="handleMeta(e.handleStatus).cls">{{
                      handleMeta(e.handleStatus).label
                    }}</span>
                    <button
                      v-if="e.handleStatus !== 1"
                      class="ev-btn handle"
                      type="button"
                      :disabled="!!props.handlingIds[e.eventId]"
                      @click="emit('handle', e.eventId)"
                    >
                      {{ props.handlingIds[e.eventId] ? '处理中…' : '处理' }}
                    </button>
                  </span>
                </td>
                <td class="ev-act">
                  <button class="ev-btn" type="button" @click="emit('detail', e)">详情</button>
                </td>
              </tr>
              <tr v-if="!groupEvents.length">
                <td colspan="5" class="dempty">
                  {{ evHandleFilter === 'all' ? '该设备暂无事件明细' : '暂无该状态的事件' }}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <div class="ev-foot">
          <span>共 {{ groupEvents.length }} 条</span>
          <div class="pg-btns">
            <button type="button" :disabled="evPage <= 1" @click="evPage--">‹</button>
            <span class="pg-info">{{ evPage }} / {{ evTotalPages }}</span>
            <button type="button" :disabled="evPage >= evTotalPages" @click="evPage++">›</button>
          </div>
        </div>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
.ev-mask {
  position: absolute;
  inset: 0;
  z-index: 40;
  background: rgba(43, 124, 227, 0.14);
  backdrop-filter: blur(6px);
  -webkit-backdrop-filter: blur(6px);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: calc(var(--topbar-height) + 18px) 24px 24px;
}
.ev-box {
  width: min(1298px, 100%);
  height: auto;
  max-height: min(792px, 97%);
  display: flex;
  flex-direction: column;
  padding: 0;
  border-radius: var(--radius);
  border: 1px solid var(--border);
  background: rgba(255, 255, 255, 0.86);
  box-shadow: var(--card-shadow);
  overflow: hidden;
}
.ev-enter-active,
.ev-leave-active {
  transition: opacity 0.2s ease;
}
.ev-enter-active .ev-box,
.ev-leave-active .ev-box {
  transition:
    transform 0.22s ease,
    opacity 0.2s ease;
}
.ev-enter-from,
.ev-leave-to {
  opacity: 0;
}
.ev-enter-from .ev-box {
  transform: translateY(12px) scale(0.98);
  opacity: 0;
}
.ev-leave-to .ev-box {
  transform: translateY(8px) scale(0.99);
  opacity: 0;
}
/* 头部白底（用户定稿：浅蓝色带只留给表头，头部与表头分层） */
.ev-head {
  display: flex;
  align-items: center;
  gap: 12px;
  margin: 0;
  padding: 14px 18px;
  background: #fff;
  border-bottom: 1px solid var(--border);
  flex: none;
}
.ev-meta {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px 48px;
}
.ev-item {
  font-size: 17px;
  color: var(--primary-700);
  font-weight: 700;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.ev-item em {
  font-style: normal;
  font-weight: 700;
  color: var(--title);
  margin-right: 2px;
}
.ev-x {
  width: 36px;
  height: 36px;
  border: 1px solid transparent;
  border-radius: var(--radius-sm);
  background: rgba(93, 113, 137, 0.1);
  font-size: 26px;
  color: var(--muted);
  cursor: pointer;
  line-height: 1;
  flex: none;
}
.ev-x:hover {
  background: rgba(93, 113, 137, 0.18);
  color: var(--title);
}
.ev-scroll {
  flex: 0 1 auto;
  min-height: 0;
  overflow: auto;
}
.ev-scroll::-webkit-scrollbar {
  width: 8px;
  height: 8px;
}
.ev-scroll::-webkit-scrollbar-thumb {
  background: rgba(82, 149, 232, 0.25);
  border-radius: 4px;
}
.ev-table {
  width: 100%;
  table-layout: fixed;
  border-collapse: collapse;
  font-size: 16px;
}
.ev-table th,
.ev-table td {
  padding: 10px 10px;
  text-align: center;
  border-bottom: 1px solid var(--border);
  color: var(--text);
}
.ev-table th {
  color: var(--title);
  font-weight: 700;
  background: var(--primary-50);
  position: sticky;
  top: 0;
  z-index: 1;
  font-size: 16px;
  letter-spacing: 0.2px;
  padding: 8px 10px;
  line-height: 1.3;
}
.ev-table tbody tr:last-child td {
  border-bottom: none;
}
.ev-table tbody tr:hover {
  background: var(--primary-50);
}
.ev-time {
  width: 22%;
}
.ev-lv {
  width: 12%;
}
.ev-st {
  width: 20%;
}
.ev-table th.ev-st,
.ev-table td.ev-st {
  text-align: left;
}
.ev-act {
  width: 12%;
}
.ev-st-head,
.ev-st-row {
  display: grid;
  grid-template-columns: 4.5em auto;
  align-items: center;
  justify-content: start;
  column-gap: 8px;
  white-space: nowrap;
}
.ev-st-label,
.ev-table td.ev-st .st-pill {
  min-width: 4.5em;
  justify-content: center;
  box-sizing: border-box;
}
.ev-st-label {
  display: inline-flex;
  align-items: center;
  justify-content: center;
}
.st-pill,
.ev-btn {
  white-space: nowrap;
}
/* 基础按钮样式（福永 ev-btn 同款，白底描边；拆组件时曾丢失） */
.ev-btn {
  padding: 4px 14px;
  border-radius: var(--radius-sm);
  border: 1px solid var(--border);
  background: rgba(255, 255, 255, 0.9);
  font-size: 15px;
  font-weight: 600;
  color: var(--primary);
  cursor: pointer;
}
.ev-btn:hover {
  background: var(--primary-50);
  border-color: var(--primary-300);
}
.ev-st-select {
  width: 92px;
}
.ev-btn.handle {
  color: #fff;
  background: var(--primary);
  border-color: var(--primary);
}
.ev-btn.handle:hover:not(:disabled) {
  filter: brightness(1.05);
}
.ev-btn.handle:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}
.ev-table th.ev-desc,
.ev-table td.ev-desc {
  text-align: left;
  padding-left: 60px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--text);
}
.ev-foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin: 0;
  padding: 8px 18px;
  border-top: 1px solid var(--border);
  font-size: 15px;
  color: var(--muted);
  flex: none;
}
.pg-btns {
  display: flex;
  align-items: center;
  gap: 8px;
}
.pg-btns button {
  min-width: 34px;
  height: 34px;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: rgba(255, 255, 255, 0.85);
  cursor: pointer;
  font-size: 18px;
  color: var(--text);
}
.pg-btns button:hover:not(:disabled) {
  border-color: var(--primary);
  color: var(--primary);
  background: var(--primary-50);
}
.pg-btns button:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
.pg-info {
  font-family: var(--font-mono);
  font-size: 15px;
  padding: 0 6px;
}
.mono {
  font-family: var(--font-mono);
  font-size: 15px;
}
.lv-tag {
  display: inline-block;
  padding: 3px 10px;
  border-radius: 4px;
  font-size: 15px;
  font-weight: 600;
  color: var(--tag-color, var(--muted));
  background: color-mix(in srgb, var(--tag-color, #5d7189) 14%, transparent);
}
.st-pill {
  display: inline-flex;
  align-items: center;
  padding: 3px 10px;
  border-radius: 999px;
  font-size: 15px;
  font-weight: 600;
}
.st-pill.st-pending {
  color: var(--danger-text);
  background: rgba(239, 68, 68, 0.12);
}
.st-pill.st-done {
  color: var(--ok-text);
  background: rgba(46, 196, 142, 0.12);
}
.dempty {
  text-align: center;
  color: var(--muted);
  padding: 32px !important;
  font-size: 16px;
}
</style>

<style>
.ev-st-select-menu.n-base-select-menu {
  min-width: 108px !important;
}
.ev-st-select-menu .n-base-select-option {
  font-size: 14px !important;
  padding: 0 12px !important;
  min-height: 32px !important;
  height: 32px !important;
  line-height: 32px !important;
}
</style>
