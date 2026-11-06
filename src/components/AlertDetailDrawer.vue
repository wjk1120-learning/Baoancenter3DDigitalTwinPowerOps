<script setup lang="ts">
import { computed, watch } from 'vue'
import type { AlertItem } from '../api/hospital/types'
import { chartColors } from '../config/chartColors'
import { eventLevelLabel, handleStatusLabel } from '../api/event/mappers'
import { formatAlertLocations } from '../config/alertLocation'

const props = defineProps<{
  alert: AlertItem | null
}>()
const emit = defineEmits<{ close: [] }>()

const LEVEL_COLOR: Record<string, string> = {
  紧急: chartColors.danger,
  严重: chartColors.warn,
  一般: chartColors.primary,
  提醒: chartColors.muted,
}

const eventLevelText = computed(() => {
  const a = props.alert
  if (!a) return '—'
  if (a.eventLevel != null) return eventLevelLabel(a.eventLevel)
  return a.level === 'error' ? '紧急' : '一般'
})

const eventLevelColor = computed(() => LEVEL_COLOR[eventLevelText.value] || chartColors.muted)

const handleStatusText = computed(() => {
  const a = props.alert
  if (!a) return '—'
  if (a.handleStatus != null) return handleStatusLabel(a.handleStatus)
  if (a.status === 'done') return '已处理'
  return '未处理'
})

const handleStatusCls = computed(() => {
  const a = props.alert
  if (!a) return ''
  const done = a.handleStatus === 1 || a.status === 'done'
  return done ? 'st-done' : 'st-pending'
})

const rows = computed(() => {
  const a = props.alert
  if (!a) return []
  return [
    { key: '事件ID', value: a.id || '—', mono: true },
    { key: '告警时间', value: a.time || '—', mono: true },
    { key: '设备ID', value: a.deviceId || '—', mono: true },
    { key: '设备名称', value: a.device || '—', mono: false },
    { key: '告警位置', value: formatAlertLocations(a.locations) || '—', mono: false },
    { key: '事件描述', value: a.content || '—', mono: false, block: true },
  ]
})

function onEsc(e: KeyboardEvent) {
  if (e.key === 'Escape') emit('close')
}

watch(
  () => props.alert,
  (a) => {
    if (a) window.addEventListener('keydown', onEsc)
    else window.removeEventListener('keydown', onEsc)
  },
  { immediate: true },
)
</script>

<template>
  <Teleport to="body">
    <Transition name="ad-drawer">
      <div v-if="alert" class="ad-drawer-mask" @click.self="emit('close')">
        <aside class="ad-drawer" role="dialog" aria-modal="true" aria-label="告警信息">
          <header class="ad-drawer-head">
            <div class="card-title">告警信息</div>
            <button type="button" class="ad-x" aria-label="关闭" @click="emit('close')">×</button>
          </header>
          <div class="ad-drawer-body">
            <div class="top-tags">
              <div class="ad-field tag-field">
                <span class="k">事件等级</span>
                <span class="lv-pill" :style="{ '--c': eventLevelColor }">{{
                  eventLevelText
                }}</span>
              </div>
              <div class="ad-field tag-field">
                <span class="k">处理状态</span>
                <span class="st-pill" :class="handleStatusCls">{{ handleStatusText }}</span>
              </div>
            </div>
            <div v-for="row in rows" :key="row.key" class="ad-field" :class="{ block: row.block }">
              <span class="k">{{ row.key }}</span>
              <span class="v" :class="{ mono: row.mono }">{{ row.value }}</span>
            </div>
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
  width: min(440px, 92vw);
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
  margin-bottom: 16px;
  flex: none;
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
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.top-tags {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}
.ad-field {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 12px 14px;
  background: rgba(196, 218, 240, 0.45);
  border-radius: 8px;
}
.ad-field .k {
  font-size: 13px;
  color: var(--muted);
  font-weight: 600;
}
.ad-field .v {
  font-size: 16px;
  font-weight: 600;
  color: var(--title);
  word-break: break-word;
  line-height: 1.45;
}
.ad-field.block .v {
  font-weight: 500;
  color: var(--text);
}
.mono {
  font-family: var(--font-mono);
  font-size: 14px !important;
}
.lv-pill,
.st-pill {
  display: inline-flex;
  align-self: flex-start;
  padding: 4px 12px;
  border-radius: 999px;
  font-size: 15px;
  font-weight: 600;
}
.lv-pill {
  color: var(--c);
  background: color-mix(in srgb, var(--c) 14%, transparent);
}
.st-pill.st-pending {
  color: var(--danger-text);
  background: rgba(239, 68, 68, 0.12);
}
.st-pill.st-done {
  color: var(--ok-text);
  background: rgba(46, 196, 142, 0.12);
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
