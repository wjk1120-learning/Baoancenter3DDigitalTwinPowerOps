<script setup lang="ts">
import type { MeasInfo } from '../../../api/device/types'
import type { HistoryAlertRow } from '../../../api/hospital/types'

/**
 * 配电房点柜看板（批次 4 用户定稿样式，对齐福永点柜特写左面板）：
 * 全高宽面板：柜名+编号 → 测点数据（§1.11 按选中开关）→ 历史告警（§3.3 全量滚动，
 * 等级 tag 按宝中口径：紧急红/严重橙/一般蓝/提醒灰）→ 「查看柜体详情」按钮。
 * 当前告警模块不保留（用户定稿）。
 */

interface SelectedCabinet {
  code: string
  name: string
  devCode?: string
  superId?: number
}

defineProps<{
  cabinet: SelectedCabinet | null
  /** 当前选中开关的名称（§1.8 deviceName），头部标题展示用 */
  selectedSwitchName?: string
  measurements: MeasInfo[]
  measLoading: boolean
  history: HistoryAlertRow[]
  historyLoading: boolean
}>()

const emit = defineEmits<{
  'view-detail': []
}>()

/** 测点单位推断（电压 V / 电流 A / 温度 ℃ / 功率 kW / 功率因数、COS 无单位） */
function measUnit(name: string): string {
  const n = name.trim()
  if (/电压/.test(n) || /^u[abc]\d*$/i.test(n)) return ' V'
  if (/电流/.test(n) || /^i[abc]\d*$/i.test(n)) return ' A'
  if (/温度/.test(n)) return ' ℃'
  if (/有功/.test(n)) return ' kW'
  if (/无功/.test(n)) return ' kvar'
  return ''
}

function formatMeas(v: number): string {
  if (!Number.isFinite(v)) return '—'
  const abs = Math.abs(v)
  if (abs >= 100) return v.toFixed(1)
  return String(Number(v.toFixed(2)))
}

/** 历史告警时间展示：MM-DD HH:mm */
function fmtTime(t: string): string {
  const m = String(t || '').match(/(?:\d{4}-)?(\d{2}-\d{2})[ T](\d{2}:\d{2})/)
  return m ? `${m[1]} ${m[2]}` : t || '—'
}

/** 等级 tag 配色（宝中口径：紧急红/严重橙/一般蓝/提醒灰） */
function levelTag(eventLevel?: number): { text: string; cls: string } {
  if (eventLevel === 1) return { text: '紧急', cls: 'lv-1' }
  if (eventLevel === 2) return { text: '严重', cls: 'lv-2' }
  if (eventLevel === 3) return { text: '一般', cls: 'lv-3' }
  if (eventLevel === 4) return { text: '提醒', cls: 'lv-4' }
  return { text: '一般', cls: 'lv-3' }
}

</script>

<template>
  <aside class="cabinet-panel">
    <template v-if="cabinet">
      <header class="cp-head">
        <div class="cp-name" :title="selectedSwitchName">{{ selectedSwitchName }}</div>
      </header>

      <div class="cp-section cp-grow">
        <div class="cp-sec-title">测点数据</div>
        <div class="cp-scroll">
          <div v-if="measLoading" class="cp-empty">测点加载中…</div>
          <div v-else-if="!measurements.length" class="cp-empty">暂无测点数据</div>
          <div v-else class="cp-meas">
            <div v-for="m in measurements" :key="m.measID" class="cp-meas-row">
              <span class="cp-meas-bar" />
              <span class="cp-meas-k" :title="m.measName">{{ m.measName }}</span>
              <span class="cp-meas-v mono">{{ formatMeas(m.measVal) }}{{ measUnit(m.measName) }}</span>
            </div>
          </div>
        </div>
      </div>

      <div class="cp-section cp-grow">
        <div class="cp-sec-title">历史告警（{{ history.length }} 条）</div>
        <div class="cp-scroll">
          <div v-if="historyLoading" class="cp-empty">告警加载中…</div>
          <div v-else-if="!history.length" class="cp-empty">暂无历史告警</div>
          <div v-else class="cp-hist">
            <div v-for="row in history" :key="row.id" class="cp-hist-row">
              <div class="cp-hist-top">
                <span class="cp-lv" :class="levelTag(row.eventLevel).cls">{{
                  levelTag(row.eventLevel).text
                }}</span>
                <span class="cp-hist-content" :title="row.content">{{ row.content || '—' }}</span>
              </div>
              <div class="cp-hist-time mono">{{ fmtTime(row.time) }}</div>
            </div>
          </div>
        </div>
      </div>

      <button
        type="button"
        class="cp-detail-btn"
        :disabled="!cabinet.superId"
        :title="cabinet.superId ? '' : '该柜未接入设备台账'"
        @click="emit('view-detail')"
      >
        查看柜体详情
      </button>
    </template>
  </aside>
</template>

<style scoped>
.cabinet-panel {
  position: absolute;
  left: 24px;
  top: calc(var(--topbar-height) + 16px);
  bottom: 16px;
  width: 400px;
  z-index: 12;
  /* 半透明玻璃（福永 InspectBoard 同款原值）：背后 3D 场景透出、行卡片用更淡的白玻璃 */
  background: linear-gradient(165deg, rgba(255, 255, 255, 0.38), rgba(236, 244, 250, 0.18));
  backdrop-filter: blur(22px) saturate(165%);
  -webkit-backdrop-filter: blur(22px) saturate(165%);
  border: 1px solid rgba(255, 255, 255, 0.58);
  border-radius: 14px;
  box-shadow:
    0 10px 28px rgba(15, 36, 56, 0.12),
    inset 0 1px 0 rgba(255, 255, 255, 0.72);
  padding: 18px 20px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  overflow: hidden;
}
.cp-head {
  display: flex;
  align-items: center;
  gap: 10px;
  flex: none;
  flex-wrap: wrap;
}
.cp-name {
  font-size: 18px;
  font-weight: 700;
  color: var(--title);
  line-height: 1.35;
  word-break: break-all;
}
.cp-section {
  display: flex;
  flex-direction: column;
  gap: 8px;
  flex: none;
}
.cp-section.cp-grow {
  flex: 1 1 50%;
  min-height: 120px;
}
.cp-sec-title {
  font-size: 14px;
  font-weight: 700;
  color: var(--title);
}
.cp-scroll {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  scrollbar-width: thin;
  scrollbar-color: rgba(43, 124, 227, 0.35) transparent;
}
.cp-empty {
  font-size: 13px;
  color: var(--muted);
  text-align: center;
  padding: 18px 8px;
  background: rgba(255, 255, 255, 0.22);
  border: 1px solid rgba(255, 255, 255, 0.32);
  border-radius: 10px;
}

/* 测点数据：彩条行（名称左、数值右，福永点柜面板同款） */
.cp-meas {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.cp-meas-row {
  display: flex;
  align-items: center;
  gap: 10px;
  min-height: 38px;
  padding: 6px 12px 6px 10px;
  background: rgba(255, 255, 255, 0.28);
  border: 1px solid rgba(255, 255, 255, 0.35);
  border-radius: 8px;
}
.cp-meas-row:nth-child(even) {
  background: rgba(255, 255, 255, 0.16);
}
.cp-meas-bar {
  flex: none;
  width: 4px;
  height: 18px;
  border-radius: 2px;
  background: var(--primary);
}
.cp-meas-k {
  flex: 1;
  font-size: 14px;
  color: var(--text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.cp-meas-v {
  flex: none;
  font-size: 14px;
  font-weight: 700;
  color: var(--title);
}
.mono {
  font-family: var(--font-mono);
}

/* 历史告警：等级 tag + 内容 + 时间，全量滚动 */
.cp-hist {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.cp-hist-row {
  padding: 8px 12px;
  background: rgba(255, 255, 255, 0.22);
  border: 1px solid rgba(255, 255, 255, 0.32);
  border-radius: 8px;
}
.cp-hist-top {
  display: flex;
  align-items: center;
  gap: 8px;
}
.cp-lv {
  flex: none;
  font-size: 12px;
  font-weight: 700;
  padding: 1px 8px;
  border-radius: 4px;
}
.cp-lv.lv-1 {
  color: var(--danger-text);
  background: rgba(239, 68, 68, 0.14);
}
.cp-lv.lv-2 {
  color: var(--warn-text);
  background: rgba(245, 166, 35, 0.16);
}
.cp-lv.lv-3 {
  color: var(--primary-700);
  background: var(--primary-50);
}
.cp-lv.lv-4 {
  color: var(--muted);
  background: rgba(93, 113, 137, 0.12);
}
.cp-hist-content {
  flex: 1;
  font-size: 13px;
  color: var(--text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.cp-hist-time {
  margin-top: 2px;
  padding-left: 2px;
  font-size: 12px;
  color: var(--muted);
}

/* 查看柜体详情按钮（福永同款：半透明实蓝 + 微模糊） */
.cp-detail-btn {
  flex: none;
  align-self: flex-end;
  min-width: 180px;
  padding: 10px 0;
  border: none;
  border-radius: 10px;
  background: rgba(43, 124, 227, 0.92);
  color: #fff;
  font-size: 15px;
  font-weight: 700;
  cursor: pointer;
  box-shadow: 0 8px 18px rgba(43, 124, 227, 0.28);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
}
.cp-detail-btn:hover:not(:disabled) {
  filter: brightness(1.06);
}
.cp-detail-btn:disabled {
  background: rgba(93, 113, 137, 0.25);
  color: rgba(255, 255, 255, 0.75);
  cursor: not-allowed;
  box-shadow: none;
}
</style>
