<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { fetchTodayAlerts } from '../api/event/event'
import { eventLevelLabel, normalizeEventLevel } from '../api/event/mappers'
import type { AlertEventLevel, AlertItem } from '../api/hospital/types'
import { eventPushSocket } from '../ws/eventPushSocket'
import AlertDetailDialog from '../components/AlertDetailDialog.vue'

/**
 * 医院总览 · 今日告警面板（福永 AlertPanel 同构，宝中重写）：
 * 数据链 = 首进 §3.1 全量（v5.9.2 起契约取消分页）→ WS 实时接管：
 * today_events 整表替换 / event 单条→防抖重拉 §3.1 / event_handled→更新本地行；
 * 断线重连成功或 stale（90s 无消息的半死连接）→ 重拉 §3.1 对齐。
 * 无缓存层（用户口径）。
 * 渲染：返回多少展示多少（接口返回即全量），列表内部滚动；条目样式照福永
 * （等级色左边条玻璃小卡 + 四级配色 pill + 短时间格式）。
 */
const alerts = ref<AlertItem[]>([])
const loading = ref(true)
/** §3.1 拉取失败（阶段6）：空态显示「加载失败，点击重试」，不用空数据冒充 */
const loadError = ref(false)
/** WS 连接状态：ok=实时 / reconnecting=断线重连中 / stale=数据可能延迟 */
const connState = ref<'ok' | 'reconnecting' | 'stale'>('ok')

let loadSeq = 0
async function loadAlerts() {
  const seq = ++loadSeq
  loading.value = alerts.value.length === 0
  try {
    const items = await fetchTodayAlerts()
    if (seq !== loadSeq) return
    alerts.value = items
    loadError.value = false
  } catch {
    if (seq !== loadSeq) return
    alerts.value = []
    loadError.value = true
  } finally {
    if (seq === loadSeq) loading.value = false
  }
}

/** event 单条推送 → 防抖 3s 重拉 §3.1（不本地插入，避免两套列表逻辑） */
let singleDebounceTimer: number | null = null
function scheduleReload() {
  if (singleDebounceTimer != null) window.clearTimeout(singleDebounceTimer)
  singleDebounceTimer = window.setTimeout(() => void loadAlerts(), 3000)
}

const offToday = eventPushSocket.onTodayList((items) => (alerts.value = items))
const offSingle = eventPushSocket.onSingle(() => scheduleReload())
const offHandled = eventPushSocket.onHandled((item) => {
  const hit = alerts.value.find((a) => a.id === item.id)
  if (hit) hit.status = item.status
})
const offOpen = eventPushSocket.onOpen(() => {
  connState.value = 'ok'
  void loadAlerts()
})
const offClose = eventPushSocket.onClose(() => (connState.value = 'reconnecting'))
const offStale = eventPushSocket.onStale(() => {
  connState.value = 'stale'
  void loadAlerts()
})

onMounted(() => {
  void loadAlerts()
})
onUnmounted(() => {
  offToday()
  offSingle()
  offHandled()
  offOpen()
  offClose()
  offStale()
  if (singleDebounceTimer != null) window.clearTimeout(singleDebounceTimer)
})

/** 等级：契约四级 1紧急/2严重/3一般/4提醒 */
function gradeOf(a: AlertItem): AlertEventLevel {
  if (a.eventLevel) return normalizeEventLevel(a.eventLevel)
  return a.level === 'error' ? 1 : 3
}
const gradeLabel = (a: AlertItem) => eventLevelLabel(gradeOf(a))

/** 短时间格式（福永同款 MM-DD HH:mm） */
function formatTime(t: string) {
  const m = t.match(/(?:\d{4}-)?(\d{2}-\d{2})[ T](\d{2}:\d{2})(?::\d{2})?/)
  if (m) return `${m[1]} ${m[2]}`
  return t || '—'
}

const statusText: Record<AlertItem['status'], string> = {
  pending: '待处理',
  processing: '处理中',
  done: '已处理',
}

const connText = computed(() => {
  if (connState.value === 'reconnecting') return '实时连接中断，重连中…'
  if (connState.value === 'stale') return '数据可能延迟'
  return ''
})

/** 条目点击 → 告警详情弹窗（可复用件，与 3D 告警看板共用） */
const detail = ref<AlertItem | null>(null)
/** 弹窗内处理成功 → 本地行翻已处理（WS event_handled 亦会收敛，双保险） */
function onDialogHandled() {
  const id = detail.value?.id
  const hit = id ? alerts.value.find((a) => a.id === id) : null
  if (hit) hit.status = 'done'
}
</script>

<template>
  <div class="alert-panel">
    <div v-if="connState !== 'ok'" class="conn-flag" :class="connState">
      {{ connText }}
    </div>

    <div class="scroll-wrap">
      <ul v-if="alerts.length" class="list">
        <li
          v-for="a in alerts"
          :key="a.id"
          class="item"
          :class="`lv-${gradeOf(a)}`"
          role="button"
          tabindex="0"
          @click="detail = a"
          @keydown.enter="detail = a"
        >
          <div class="top">
            <span class="grade" :class="`g-${gradeOf(a)}`">{{ gradeLabel(a) }}</span>
            <span class="device" :title="a.device">{{ a.device || '未知设备' }}</span>
            <span class="st" :class="a.status">{{ statusText[a.status] }}</span>
          </div>
          <div class="content">{{ a.content || '—' }}</div>
          <div class="meta">{{ formatTime(a.time) }}</div>
        </li>
      </ul>
      <div
        v-else
        class="a-empty"
        :class="{ retry: loadError }"
        role="button"
        tabindex="0"
        @click="loadError && loadAlerts()"
        @keydown.enter="loadError && loadAlerts()"
      >
        {{ loading ? '加载中…' : loadError ? '加载失败，点击重试' : '暂无今日告警' }}
      </div>
    </div>

    <div class="alert-foot">
      <span>共 {{ alerts.length }} 条</span>
      <span class="foot-note">今日全部（实时推送）</span>
    </div>

    <AlertDetailDialog :alert="detail" @close="detail = null" @handled="onDialogHandled" />
  </div>
</template>

<style scoped>
.alert-panel {
  height: 100%;
  display: flex;
  flex-direction: column;
  gap: 8px;
  position: relative;
}
.conn-flag {
  flex: none;
  font-size: 12px;
  font-weight: 600;
  padding: 4px 10px;
  border-radius: 8px;
  text-align: center;
}
.conn-flag.reconnecting {
  color: var(--danger-text);
  background: rgba(229, 72, 77, 0.1);
}
.conn-flag.stale {
  color: var(--warn-text);
  background: rgba(245, 166, 35, 0.1);
}

/* 福永 AlertPanel 同款滚动容器 */
.scroll-wrap {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  overflow-x: hidden;
  scrollbar-width: thin;
  scrollbar-color: rgba(43, 124, 227, 0.35) transparent;
  padding-right: 2px;
}
.scroll-wrap::-webkit-scrollbar {
  width: 5px;
}
.scroll-wrap::-webkit-scrollbar-thumb {
  background: rgba(43, 124, 227, 0.35);
  border-radius: 3px;
}
.list {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

/* 单条告警：福永同款玻璃小卡（等级色左边条 + 渐变玻璃底 + 内外阴影） */
.item {
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: 6px;
  box-sizing: border-box;
  padding: 9px 10px 8px 12px;
  border-radius: 10px;
  background: linear-gradient(150deg, rgba(255, 255, 255, 0.6), rgba(255, 255, 255, 0.16));
  border: 1px solid rgba(255, 255, 255, 0.65);
  border-left: 3px solid var(--primary-300);
  box-shadow:
    inset 0 1px 1px rgba(255, 255, 255, 0.85),
    inset 0 -6px 14px rgba(82, 149, 232, 0.05),
    0 2px 6px rgba(43, 108, 160, 0.06);
  cursor: pointer;
}
.item.lv-1 {
  border-left-color: var(--danger);
}
.item.lv-2 {
  border-left-color: var(--warn);
}
.item.lv-3 {
  border-left-color: var(--primary);
}
.item.lv-4 {
  border-left-color: var(--teal);
}

.top {
  display: flex;
  align-items: center;
  gap: 6px;
  flex: none;
  min-width: 0;
  line-height: 1.25;
}
.grade {
  flex: none;
  min-width: 44px;
  padding: 2px 8px;
  border-radius: 999px;
  font-size: 13px;
  font-weight: 800;
  text-align: center;
  line-height: 1.35;
  border: 1px solid transparent;
}
.g-1 {
  color: #9b1c22;
  background: rgba(229, 72, 77, 0.22);
  border-color: rgba(229, 72, 77, 0.45);
}
.g-2 {
  color: #8a5a00;
  background: rgba(245, 166, 35, 0.28);
  border-color: rgba(245, 166, 35, 0.55);
}
.g-3 {
  color: var(--ok-text);
  background: var(--primary-50);
  border-color: var(--primary-200);
}
.g-4 {
  color: var(--cyan-deep);
  background: rgba(23, 162, 184, 0.16);
  border-color: rgba(23, 162, 184, 0.4);
}
.device {
  flex: 1;
  min-width: 0;
  font-size: 15px;
  font-weight: 700;
  color: var(--title);
  line-height: 1.3;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.st {
  flex: none;
  font-size: 13px;
  font-weight: 800;
  padding: 3px 10px;
  border-radius: 999px;
  line-height: 1.35;
  letter-spacing: 0.02em;
  border: 1px solid transparent;
}
.st.pending {
  color: #7a4e00;
  background: rgba(245, 166, 35, 0.38);
  border-color: rgba(245, 166, 35, 0.75);
  box-shadow: 0 0 0 1px rgba(245, 166, 35, 0.18);
}
.st.processing {
  color: #1458a8;
  background: rgba(43, 124, 227, 0.22);
  border-color: rgba(43, 124, 227, 0.55);
  box-shadow: 0 0 0 1px rgba(43, 124, 227, 0.12);
}
.st.done {
  color: #1b6b3a;
  background: rgba(46, 160, 90, 0.28);
  border-color: rgba(46, 160, 90, 0.65);
  box-shadow: 0 0 0 1px rgba(46, 160, 90, 0.14);
}
.content {
  flex: none;
  min-width: 0;
  font-size: 14px;
  color: var(--text);
  line-height: 1.45;
  white-space: pre-wrap;
  word-break: break-word;
}
.meta {
  flex: none;
  font-size: 13px;
  color: var(--muted);
  line-height: 1.35;
  white-space: nowrap;
}

.a-empty {
  color: var(--muted);
  font-size: 13px;
  padding: 8px;
  text-align: center;
}
/* 失败重试态：可点击 + 告警色提示 */
.a-empty.retry {
  color: var(--danger-text);
  cursor: pointer;
}

.alert-foot {
  flex: none;
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 12px;
  color: var(--muted);
}
</style>
