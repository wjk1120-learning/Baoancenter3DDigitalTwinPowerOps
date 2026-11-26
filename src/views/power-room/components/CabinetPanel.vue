<script setup lang="ts">
import { computed } from 'vue'
import type { MeasInfo } from '../../../api/device/types'
import type { HistoryAlertRow } from '../../../api/hospital/types'

/**
 * 配电房点柜看板（批次 4 用户定稿样式，对齐福永点柜特写左面板）：
 * 全高宽面板：柜名+编号 → 测点数据（§1.11 按选中开关）→ 历史告警（§3.3 全量滚动，
 * 等级 tag 按宝中口径：紧急红/严重橙/一般蓝/提醒灰）→ 「查看柜体详情」按钮。
 * 当前告警模块不保留（用户定稿）。
 * 测点区只展示固定六项指标（2026-11-25 用户定稿：Ia/Ib/Ic/P/Q/COS，缺测默认 0）。
 */

interface SelectedCabinet {
  code: string
  name: string
  devCode?: string
  superId?: number
}

const props = defineProps<{
  cabinet: SelectedCabinet | null
  /** 当前选中开关的名称（§1.8 deviceName），头部标题展示用 */
  selectedSwitchName?: string
  measurements: MeasInfo[]
  measLoading: boolean
  /** 测点加载失败（阶段6）：显示失败文案而非全 0 */
  measError?: boolean
  history: HistoryAlertRow[]
  historyLoading: boolean
  /** 历史告警加载失败（阶段6）：显示失败文案而非「暂无」 */
  historyError?: boolean
}>()

const emit = defineEmits<{
  'view-detail': []
}>()

/** 看板固定六项（2026-11-25 用户定稿，对齐参考稿）：标签含单位；
 *  names = measName 匹配候选——后端两套命名并存（CET 英文代码 / 部分设备中文名），
 *  代码优先、中文名兜底（与抽屉/六仪表面板同口径）；缺测默认 0。
 *  功率因数（2026-11-26 用户补充）：部分设备无 Pfs 只有 Pfsum → Pfs→Pfsum→中文名 */
const PANEL_POINTS: { label: string; names: string[] }[] = [
  { label: 'Ia(A)', names: ['Ia', 'A相电流'] },
  { label: 'Ib(A)', names: ['Ib', 'B相电流'] },
  { label: 'Ic(A)', names: ['Ic', 'C相电流'] },
  { label: 'P(kW)', names: ['Psum', '总有功功率'] },
  { label: 'Q(kvar)', names: ['Qsum', '总无功功率'] },
  { label: 'COS', names: ['Pfs', 'Pfsum', '功率因数'] },
]

/** 六项行：按 names 依次匹配测点值，全部缺测补 0 */
const panelRows = computed(() =>
  PANEL_POINTS.map((p) => {
    let value = 0
    for (const n of p.names) {
      const hit = props.measurements.find((m) => m.measName === n)
      if (hit && Number.isFinite(hit.measVal)) {
        value = hit.measVal
        break
      }
    }
    return { label: p.label, value: formatMeas(value) }
  }),
)

function formatMeas(v: number): string {
  if (!Number.isFinite(v)) return '—'
  // §1.11 实时值统一两位小数（2026-11-26 用户定稿：四舍五入，不再按数值大小省略位数）
  return v.toFixed(2)
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
          <div v-else-if="measError" class="cp-empty cp-error">测点加载失败，重新点该柜重试</div>
          <div v-else class="cp-meas">
            <div v-for="row in panelRows" :key="row.label" class="cp-meas-row">
              <span class="cp-meas-bar" />
              <span class="cp-meas-k">{{ row.label }}</span>
              <span class="cp-meas-v mono">{{ row.value }}</span>
            </div>
          </div>
        </div>
      </div>

      <div class="cp-section cp-grow">
        <div class="cp-sec-title">历史告警（{{ history.length }} 条）</div>
        <div class="cp-scroll">
          <div v-if="historyLoading" class="cp-empty">告警加载中…</div>
          <div v-else-if="historyError" class="cp-empty cp-error">告警加载失败，重新点该柜重试</div>
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
/* 加载失败态（阶段6）：告警色区分于「暂无」 */
.cp-error {
  color: var(--danger-text);
  background: rgba(229, 72, 77, 0.1);
  border-color: rgba(229, 72, 77, 0.35);
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
