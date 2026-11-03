<script setup lang="ts">
import { NSelect } from 'naive-ui'
import { sourceOffline } from '../../../utils/offline'
import type { DeviceEventGroup } from '../../../api/event/types'
import { groupLatestTime } from '../../../api/event/mappers'
import { GRADE_BY_ID, gradeOf, groupCount } from '../composables/groupMeta'
import { chartColors } from '../../../config/chartColors'

/** 告警主表（福永 ac-main 同款：等级筛选 + 分组表格 + 分页） */
const props = defineProps<{
  rows: DeviceEventGroup[]
  total: number
  page: number
  totalPages: number
  loading: boolean
  filterLevel: '' | '1' | '2' | '3' | '4'
}>()

const emit = defineEmits<{
  'update:filterLevel': [value: '' | '1' | '2' | '3' | '4']
  refresh: []
  open: [group: DeviceEventGroup]
  page: [page: number]
}>()

/** 四级：提醒 / 一般 / 严重 / 紧急（CET 1紧急 2严重 3一般 4提醒） */
const levelOptions = [
  { label: '全部等级', value: '' },
  { label: '紧急', value: '1' },
  { label: '严重', value: '2' },
  { label: '一般', value: '3' },
  { label: '提醒', value: '4' },
]

function levelTag(g: DeviceEventGroup) {
  const meta = GRADE_BY_ID[gradeOf(g)]
  return meta || { label: '一般', color: chartColors.muted }
}

function groupKey(g: DeviceEventGroup) {
  return `${g.deviceId || ''}-${g.deviceName || ''}-${g.latestTsMs || g.latestTimeStr || ''}`
}
</script>

<template>
  <section class="ac-main glass-panel">
    <div class="ac-toolbar">
      <NSelect
        :value="props.filterLevel"
        :options="levelOptions"
        class="ac-select"
        :menu-props="{ class: 'ac-select-menu' }"
        @update:value="(v: '' | '1' | '2' | '3' | '4') => emit('update:filterLevel', v)"
      />
      <button class="ac-refresh" @click="emit('refresh')">刷新</button>
    </div>
    <div class="table-scroll">
      <table class="ac-table">
        <thead>
          <tr>
            <th class="c-time">时间</th>
            <th class="c-lv">最高等级</th>
            <th class="c-id">设备ID</th>
            <th class="c-name">设备名称</th>
            <th class="c-count">事件数量</th>
            <th class="c-act">事件列表</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="g in props.rows"
            :key="groupKey(g)"
            class="ac-row"
          >
            <td class="mono">{{ groupLatestTime(g) || '—' }}</td>
            <td class="c-lv">
              <span class="lv-tag" :style="{ '--tag-color': levelTag(g).color }">{{
                levelTag(g).label
              }}</span>
            </td>
            <td class="mono cell-id">{{ g.deviceId || '—' }}</td>
            <td class="c-name cell-dev">{{ g.deviceName || '—' }}</td>
            <td class="c-count mono">{{ groupCount(g) }}</td>
            <td class="c-act">
              <button class="ev-btn" type="button" @click="emit('open', g)">查看</button>
            </td>
          </tr>
          <tr v-if="!props.rows.length">
            <td colspan="6" class="dempty">
              {{ props.loading ? '加载中…' : sourceOffline ? '后端未连接' : '无告警' }}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
    <div class="ac-foot">
      <span>共 {{ props.total }} 条</span>
      <div class="pg-btns">
        <button :disabled="props.page <= 1" @click="emit('page', props.page - 1)">‹</button>
        <span class="pg-info">{{ props.page }} / {{ props.totalPages }}</span>
        <button :disabled="props.page >= props.totalPages" @click="emit('page', props.page + 1)">
          ›
        </button>
      </div>
    </div>
  </section>
</template>

<style scoped>
.ac-main {
  flex: 1;
  min-width: 0;
  padding: 16px 18px;
  border-radius: var(--radius);
  box-shadow: var(--card-shadow);
  display: flex;
  flex-direction: column;
}
.ac-toolbar {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 0;
  padding-bottom: 8px;
  border-bottom: 1px solid var(--border);
}
.ac-select {
  width: 249px;
}
:deep(.ac-select .n-base-selection) {
  --n-border-radius: 8px;
  font-size: 15px !important;
}
:deep(.ac-select .n-base-selection .n-base-selection-label) {
  height: 40px !important;
  font-size: 15px !important;
}
:deep(.ac-select .n-base-selection-input) {
  font-size: 15px !important;
}
:deep(.ac-select .n-base-selection__border) {
  border: 1px solid var(--border) !important;
}
:deep(.ac-select:hover .n-base-selection__border) {
  border-color: var(--primary-300) !important;
}
:deep(.ac-select.n-base-selection--focus .n-base-selection__border) {
  border-color: var(--primary) !important;
  box-shadow: 0 0 0 3px rgba(82, 149, 232, 0.15) !important;
}
.ac-refresh {
  margin-left: auto;
  padding: 7px 16px;
  border-radius: var(--radius-sm);
  border: 1px solid var(--border);
  background: rgba(255, 255, 255, 0.85);
  font-size: 15px;
  color: var(--primary);
  cursor: pointer;
  font-weight: 600;
}
.ac-refresh:hover {
  background: var(--primary-50);
}
.table-scroll {
  flex: 1;
  overflow: hidden;
  min-height: 0;
  container-type: size;
}
.table-scroll::-webkit-scrollbar {
  width: 8px;
  height: 8px;
}
.table-scroll::-webkit-scrollbar-thumb {
  background: rgba(82, 149, 232, 0.25);
  border-radius: 4px;
}
.ac-table {
  width: 100%;
  height: auto;
  table-layout: fixed;
  border-collapse: collapse;
  font-size: 15px;
}
.ac-table th,
.ac-table td {
  padding: 0 10px;
  text-align: center;
  border-bottom: 1px solid var(--border);
  vertical-align: middle;
}
.ac-table th {
  color: var(--title);
  font-weight: 700;
  background: var(--primary-50);
  position: sticky;
  top: 0;
  z-index: 1;
  font-size: 15px;
  letter-spacing: 0.2px;
  height: 36px;
  box-sizing: border-box;
}
.ac-table tbody tr {
  height: calc((100cqh - 36px) / 14);
  box-sizing: border-box;
}
.ac-row {
  transition: background 0.15s;
}
.ac-row:hover {
  background: var(--primary-50);
}
.c-time {
  width: 18%;
}
.c-lv {
  width: 12%;
}
.c-id {
  width: 12%;
}
.ac-table th.c-name,
.ac-table td.cell-dev {
  width: 32%;
  text-align: left;
  padding-left: 50px;
}
.ac-table th.c-count,
.ac-table td.c-count {
  width: 10%;
  padding-left: 12px;
  padding-right: 12px;
}
.ac-table th.c-act,
.ac-table td.c-act {
  width: 16%;
}
.ev-btn {
  padding: 4px 14px;
  border-radius: var(--radius-sm);
  border: 1px solid var(--border);
  background: rgba(255, 255, 255, 0.9);
  font-size: 13px;
  font-weight: 600;
  color: var(--primary);
  cursor: pointer;
}
.ev-btn:hover {
  background: var(--primary-50);
  border-color: var(--primary-300);
}
.cell-id {
  color: var(--text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.cell-dev {
  color: var(--primary-700);
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.mono {
  font-family: var(--font-mono);
  font-size: 14px;
}
.lv-tag {
  display: inline-block;
  padding: 3px 10px;
  border-radius: 4px;
  font-size: 13px;
  font-weight: 600;
  color: var(--tag-color, var(--muted));
  background: color-mix(in srgb, var(--tag-color, #5d7189) 14%, transparent);
}
.dempty {
  text-align: center;
  color: var(--muted);
  padding: 32px !important;
  font-size: 16px;
}
.ac-foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: 0;
  padding-top: 8px;
  border-top: 1px solid var(--border);
  font-size: 14px;
  color: var(--muted);
  flex: none;
}
.pg-btns {
  display: flex;
  align-items: center;
  gap: 8px;
}
.pg-btns button {
  min-width: 32px;
  height: 32px;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: rgba(255, 255, 255, 0.85);
  cursor: pointer;
  font-size: 14px;
  color: var(--text);
  transition: all 0.15s;
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
  font-size: 14px;
  color: var(--muted);
  padding: 0 6px;
  font-family: var(--font-mono);
}
</style>

<style>
/* NSelect 下拉面板 teleport 到 body，需用全局样式（对齐福永：宽 249px / 选项 15px） */
.ac-select-menu.n-base-select-menu {
  min-width: 249px !important;
}
.ac-select-menu .n-base-select-option {
  font-size: 15px !important;
  padding: 0 14px !important;
  min-height: 36px !important;
  height: 36px !important;
  line-height: 36px !important;
}
.ac-select-menu .n-base-select-option .n-base-select-option__content {
  font-size: 15px !important;
}
</style>
