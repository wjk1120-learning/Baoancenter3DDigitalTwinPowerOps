<script setup lang="ts">
import { ref, watch } from 'vue'
import type { DeviceDetail, MeasInfo } from '../../../api/device/types'
import { fetchMeasurements } from '../../../api/device/device'
import { fetchDeviceHistoryEvents } from '../../../api/event/event'
import type { EventBrief } from '../../../api/event/types'
import { chartColors } from '../../../config/chartColors'
import { eventLevelLabel, normalizeEventLevel } from '../../../api/event/mappers'

/**
 * 点位告警抽屉（4.2④，按需请求）：设备测点实时值（§1.11）+ 历史告警（§3.3）。
 * 外壳/样式照福永 PointAlarmDrawer（蓝条标题、双列测点卡、时间/等级/状态告警表+手风琴），
 * 数据仍由本组件按需自拉，抽屉关闭即清状态。
 */
const props = defineProps<{ device: DeviceDetail | null }>()
const emit = defineEmits<{ close: [] }>()

const meas = ref<MeasInfo[]>([])
const measLoading = ref(false)
const alarms = ref<EventBrief[]>([])
const alarmsLoading = ref(false)

async function load(deviceId: number) {
  measLoading.value = true
  alarmsLoading.value = true
  const [m, a] = await Promise.allSettled([
    fetchMeasurements(deviceId),
    fetchDeviceHistoryEvents(deviceId),
  ])
  meas.value = m.status === 'fulfilled' ? m.value : []
  measLoading.value = false
  alarms.value = a.status === 'fulfilled' ? a.value : []
  alarmsLoading.value = false
}

const LEVEL_COLOR: Record<string, string> = {
  紧急: chartColors.danger,
  严重: chartColors.warn,
  一般: chartColors.primary,
  提醒: chartColors.muted,
}

function levelMeta(level: number) {
  const id = normalizeEventLevel(level)
  const label = eventLevelLabel(id)
  return { label, color: LEVEL_COLOR[label] || chartColors.muted }
}

function handleMeta(status: number) {
  if (status === 1) return { label: '已处理', cls: 'st-done' }
  if (status === 0) return { label: '未处理', cls: 'st-pending' }
  return { label: '—', cls: '' }
}

function measUnit(name: string): string {
  const n = name.trim()
  if (/电压/.test(n) || /^u[abc]\d*$/i.test(n)) return ' V'
  if (/电流/.test(n) || /^i[abc]\d*$/i.test(n)) return ' A'
  if (/温度/.test(n)) return ' ℃'
  if (/湿度/.test(n)) return ' %'
  return ''
}

function formatMeasVal(v: number): string {
  if (!Number.isFinite(v)) return '—'
  const abs = Math.abs(v)
  if (abs >= 100) return v.toFixed(1)
  return String(Number(v.toFixed(2)))
}

function onEsc(e: KeyboardEvent) {
  if (e.key === 'Escape') emit('close')
}

/** 当前展开的告警行（手风琴：同一时间只展开一行）；null = 全部收起 */
const expandedId = ref<string | null>(null)
function toggleRow(id: string) {
  expandedId.value = expandedId.value === id ? null : id
}

watch(
  () => props.device,
  (d) => {
    expandedId.value = null
    if (d) {
      void load(d.deviceId)
      window.addEventListener('keydown', onEsc)
    } else {
      window.removeEventListener('keydown', onEsc)
    }
  },
  { immediate: true },
)
</script>

<template>
  <Teleport to="body">
    <Transition name="ad-drawer">
      <div v-if="props.device" class="ad-drawer-mask" @click.self="emit('close')">
        <aside
          class="ad-drawer"
          role="dialog"
          aria-modal="true"
          :aria-label="`${props.device.deviceName} 测点详情`"
        >
          <header class="ad-drawer-head">
            <div class="card-title">{{ props.device.deviceName }} 测点详情</div>
            <button type="button" class="ad-x" aria-label="关闭" @click="emit('close')">×</button>
          </header>
          <div class="ad-drawer-body">
            <section class="pane">
              <div class="alarm-sec-title">实时测点</div>
              <div v-if="measLoading" class="alarm-empty">测点加载中…</div>
              <div v-else-if="!meas.length" class="alarm-empty">暂无读数</div>
              <div v-else class="meas-scroll">
                <div class="meas-grid">
                  <div v-for="m in meas" :key="m.measID" class="meas-cell">
                    <span class="meas-k" :title="m.measName">{{ m.measName }}</span>
                    <span class="meas-v mono"
                      >{{ formatMeasVal(m.measVal) }}{{ measUnit(m.measName) }}</span
                    >
                  </div>
                </div>
              </div>
            </section>
            <section class="pane">
              <div class="alarm-sec-title">
                历史告警
                <span v-if="!alarmsLoading" class="alarm-sec-count">（{{ alarms.length }}）</span>
              </div>
              <div v-if="alarmsLoading" class="alarm-empty">告警加载中…</div>
              <div v-else-if="!alarms.length" class="alarm-empty">该测点设备暂无历史告警</div>
              <div v-else class="alarm-table-scroll">
                <table class="alarm-table">
                  <thead>
                    <tr>
                      <th class="a-time">时间</th>
                      <th class="a-lv">等级</th>
                      <th class="a-st">状态</th>
                    </tr>
                  </thead>
                  <tbody>
                    <template v-for="a in alarms" :key="a.eventId">
                      <tr
                        :class="{
                          urgent: normalizeEventLevel(a.eventLevel) === 1,
                          expanded: expandedId === a.eventId,
                        }"
                        class="alarm-row"
                        :title="a.description ? '点击查看详情' : ''"
                        @click="toggleRow(a.eventId)"
                      >
                        <td class="a-time mono">{{ a.timeStr || '—' }}</td>
                        <td class="a-lv">
                          <span
                            class="lv-tag"
                            :style="{ '--tag-color': levelMeta(a.eventLevel).color }"
                            >{{ levelMeta(a.eventLevel).label }}</span
                          >
                        </td>
                        <td class="a-st">
                          <span class="st-pill sm" :class="handleMeta(a.handleStatus).cls">{{
                            handleMeta(a.handleStatus).label
                          }}</span>
                        </td>
                      </tr>
                      <tr v-if="expandedId === a.eventId" class="alarm-detail-row">
                        <td colspan="3" class="alarm-detail-cell">
                          <div class="alarm-detail">
                            <span class="alarm-desc-text" :title="a.description || ''">{{
                              a.description || '—'
                            }}</span>
                          </div>
                        </td>
                      </tr>
                    </template>
                  </tbody>
                </table>
              </div>
            </section>
          </div>
        </aside>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.ad-drawer-mask {
  position: fixed;
  inset: 0;
  z-index: 12000;
  background: rgba(15, 36, 56, 0.28);
  backdrop-filter: blur(2px);
}
.ad-drawer {
  position: absolute;
  top: 0;
  right: 0;
  bottom: 0;
  width: min(520px, 92vw);
  background: linear-gradient(165deg, rgba(255, 255, 255, 0.96), rgba(245, 250, 255, 0.94));
  border-left: 1px solid rgba(255, 255, 255, 0.95);
  box-shadow: -12px 0 40px rgba(43, 108, 160, 0.18);
  display: flex;
  flex-direction: column;
  padding: 18px 20px 24px;
}
.ad-drawer-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
  flex: none;
}
.card-title {
  font-size: 18px;
  font-weight: 700;
  color: var(--title);
  position: relative;
  padding-left: 12px;
  flex: 1;
  min-width: 0;
  line-height: 1.35;
  word-break: break-word;
}
.card-title::before {
  content: '';
  position: absolute;
  left: 0;
  top: 0.35em;
  transform: none;
  width: 3px;
  height: 16px;
  background: var(--primary);
  border-radius: 2px;
}
.ad-x {
  width: 32px;
  height: 32px;
  border: none;
  border-radius: 8px;
  background: rgba(93, 113, 137, 0.1);
  color: var(--muted);
  font-size: 22px;
  line-height: 1;
  cursor: pointer;
}
.ad-x:hover {
  color: var(--title);
  background: rgba(93, 113, 137, 0.18);
}
.ad-drawer-body {
  flex: 1;
  min-height: 0;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  gap: 14px;
}
.pane {
  flex: 1 1 50%;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.alarm-sec-title {
  font-size: 15px;
  font-weight: 700;
  color: var(--title);
  padding-left: 12px;
  position: relative;
  flex: none;
}
.alarm-sec-title::before {
  content: '';
  position: absolute;
  left: 0;
  top: 50%;
  transform: translateY(-50%);
  width: 3px;
  height: 14px;
  background: var(--primary);
  border-radius: 2px;
}
.alarm-sec-count {
  color: var(--muted);
  font-weight: 500;
}
.meas-scroll {
  flex: 1;
  min-height: 0;
  overflow: auto;
  padding-right: 2px;
}
.meas-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
}
.meas-cell {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 8px;
  min-width: 0;
  padding: 8px 10px;
  background: rgba(196, 218, 240, 0.38);
  border-radius: 8px;
}
.meas-k {
  flex: 1;
  min-width: 0;
  font-size: 12px;
  font-weight: 600;
  color: var(--muted);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.meas-v {
  flex: none;
  font-size: 14px;
  font-weight: 700;
  color: var(--title);
}
.mono {
  font-family: var(--font-mono);
  font-size: 14px !important;
}
.st-pill {
  display: inline-flex;
  align-self: flex-start;
  padding: 4px 12px;
  border-radius: 999px;
  font-size: 15px;
  font-weight: 600;
}
.st-pill.sm {
  padding: 2px 8px;
  font-size: 12px;
}
.st-pill.st-pending {
  color: var(--danger-text);
  background: rgba(239, 68, 68, 0.12);
}
.st-pill.st-done {
  color: var(--ok-text);
  background: rgba(46, 196, 142, 0.12);
}
.alarm-empty {
  padding: 24px 14px;
  text-align: center;
  font-size: 14px;
  color: var(--muted);
  background: rgba(196, 218, 240, 0.3);
  border-radius: 8px;
}
.alarm-table-scroll {
  flex: 1;
  min-height: 0;
  overflow: auto;
  background: rgba(255, 255, 255, 0.7);
  border-radius: 8px;
  border: 1px solid var(--border);
}
.alarm-table {
  width: 100%;
  table-layout: fixed;
  border-collapse: collapse;
  font-size: 13px;
}
.alarm-table th,
.alarm-table td {
  padding: 6px 8px;
  border-bottom: 1px solid var(--border);
  color: var(--text);
}
.alarm-table th {
  color: var(--title);
  font-weight: 700;
  background: var(--primary-50);
  font-size: 13px;
  position: sticky;
  top: 0;
  z-index: 1;
}
.alarm-table tbody tr.urgent {
  background: rgba(239, 68, 68, 0.05);
}
.alarm-table tbody tr.alarm-row {
  cursor: pointer;
  transition: background 0.15s ease;
}
.alarm-table tbody tr.alarm-row:hover {
  background: rgba(43, 124, 227, 0.06);
}
.alarm-table tbody tr.alarm-row.expanded {
  background: rgba(43, 124, 227, 0.1);
}
.alarm-table tbody tr.alarm-row.expanded td {
  border-bottom: none;
}
.alarm-table tbody tr:last-child td {
  border-bottom: none;
}
.a-time {
  width: 50%;
  text-align: left;
}
.a-lv {
  width: 26%;
  text-align: left;
}
.a-st {
  width: 24%;
  text-align: left;
}
.lv-tag {
  display: inline-block;
  padding: 2px 8px;
  border-radius: 4px;
  font-size: 12px;
  font-weight: 600;
  color: var(--tag-color, var(--muted));
  background: color-mix(in srgb, var(--tag-color, #5d7189) 14%, transparent);
}

/* 展开行：详情直接显示在所点击行下方 */
.alarm-detail-row {
  background: rgba(43, 124, 227, 0.04);
}
.alarm-detail-cell {
  padding: 0 !important;
  border-bottom: 1px solid var(--border) !important;
}
.alarm-detail {
  padding: 8px 12px 10px;
  font-size: 13px;
  line-height: 1.5;
}
.alarm-desc-text {
  flex: 1;
  min-width: 0;
  color: var(--text);
  word-break: break-word;
}

.ad-drawer-enter-active,
.ad-drawer-leave-active {
  transition: opacity 0.22s ease;
}
.ad-drawer-enter-active .ad-drawer,
.ad-drawer-leave-active .ad-drawer {
  transition: transform 0.28s cubic-bezier(0.22, 0.82, 0.28, 1);
}
.ad-drawer-enter-from,
.ad-drawer-leave-to {
  opacity: 0;
}
.ad-drawer-enter-from .ad-drawer,
.ad-drawer-leave-to .ad-drawer {
  transform: translateX(100%);
}
</style>
