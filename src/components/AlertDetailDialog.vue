<script setup lang="ts">
/**
 * 告警详情弹窗（可复用件，EventBrief 全字段展示——除 eventId 外全部呈现）：
 * 等级徽章 + 设备名 + 处理状态头，正文 = 发生时间 / 告警内容 / 告警位置
 * （楼名·层 + 原始管理编号 locationNumber，多定位逐行列出，无位置记「—」）。
 * 复用约定：props.alert 传 null 即关闭；任何列表（3D 告警看板/总览告警信息面板）
 * 点条目把它塞进来即可。自定义遮罩（AlertGroupModal 同款交互：点遮罩/Esc/× 关闭），
 * Teleport 到 body——不受父容器 transform/层叠上下文影响。
 */
import { computed, onUnmounted, ref, watch } from 'vue'
import { eventLevelLabel } from '../api/event/mappers'
import { floorNodeName } from '../three/campus/buildings'
import { globalMessage } from '../utils/message'
import { handleEvent } from '../api/event/event'
import { CAMPUS_BUILDINGS } from '../config/campusConfig'
import type { AlertItem } from '../api/hospital/types'

const props = defineProps<{ alert: AlertItem | null }>()
const emit = defineEmits<{
  close: []
  /** 处理成功（父列表自行收敛：移除行/翻状态/重拉统计） */ handled: []
}>()

/** 楼栋编号 → 楼名（campusConfig 单一事实源；未知编号兜「楼栋 N」） */
const BUILDING_NAME = new Map(CAMPUS_BUILDINGS.map((b) => [b.id, b.name]))

const levelText = computed(() => (props.alert ? eventLevelLabel(props.alert.eventLevel ?? 3) : ''))
const tone = computed(() => {
  const lv = props.alert?.eventLevel
  if (lv === 1) return 'error'
  if (lv === 2) return 'warn'
  return 'info'
})
const floorText = (floor: string) => floorNodeName(floor) ?? floor
const locText = (building: number) => BUILDING_NAME.get(building) ?? `楼栋 ${building}`

/** 右下角处理按钮（§3.10，同箱柜级联）：待处理才显示；成功后本地翻状态（父列表经
 *  handled 事件收敛）。换告警重置本地态。 */
const handling = ref(false)
const handledLocal = ref(false)
watch(
  () => props.alert,
  () => {
    handling.value = false
    handledLocal.value = false
  },
)
const effectiveStatus = computed(() => {
  if (handledLocal.value) return 'done'
  return props.alert?.status ?? 'pending'
})

async function handle() {
  if (!props.alert || handling.value) return
  handling.value = true
  const ok = await handleEvent(props.alert.id).catch(() => false)
  handling.value = false
  if (ok) {
    handledLocal.value = true
    globalMessage()?.success('已标记为已处理；同箱柜关联告警已一并处理')
    emit('handled')
  } else {
    globalMessage()?.error('处理失败（可能无权限或事件已不存在）')
  }
}

function onKeydown(ev: KeyboardEvent) {
  if (ev.key === 'Escape') emit('close')
}
watch(
  () => props.alert,
  (v) => {
    if (v) window.addEventListener('keydown', onKeydown)
    else window.removeEventListener('keydown', onKeydown)
  },
)
onUnmounted(() => window.removeEventListener('keydown', onKeydown))
</script>

<template>
  <Teleport to="body">
    <Transition name="add">
      <div v-if="alert" class="add-mask" @click.self="emit('close')">
        <div class="add-card" role="dialog" aria-modal="true">
          <header class="add-head">
            <span class="add-lv" :class="tone">{{ levelText }}</span>
            <h3 class="add-device" :title="alert.device">{{ alert.device || '未知设备' }}</h3>
            <span class="add-st" :class="effectiveStatus">
              {{ effectiveStatus === 'pending' ? '待处理' : '已处理' }}
            </span>
            <button class="add-x" type="button" aria-label="关闭" @click="emit('close')">×</button>
          </header>
          <dl class="add-body">
            <div class="add-row">
              <dt>发生时间</dt>
              <dd class="mono">{{ alert.time }}</dd>
            </div>
            <div class="add-row">
              <dt>告警内容</dt>
              <dd class="add-content">{{ alert.content || '—' }}</dd>
            </div>
            <div class="add-row">
              <dt>告警位置</dt>
              <dd>
                <template v-if="alert.locations?.length">
                  <div v-for="(l, i) in alert.locations" :key="i" class="add-loc">
                    <span>{{ locText(l.building) }} · {{ floorText(l.floor) }}</span>
                    <span v-if="l.locationNumber" class="add-locnum" :title="l.locationNumber">
                      {{ l.locationNumber }}
                    </span>
                  </div>
                </template>
                <span v-else class="add-dim">—（无位置记录）</span>
              </dd>
            </div>
          </dl>
          <footer v-if="effectiveStatus === 'pending'" class="add-foot">
            <button type="button" class="add-handle" :disabled="handling" @click="handle">
              {{ handling ? '处理中…' : '处理' }}
            </button>
          </footer>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.add-mask {
  position: fixed;
  inset: 0;
  z-index: 100;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(30, 45, 60, 0.35);
  backdrop-filter: blur(2px);
}
.add-card {
  width: 440px;
  max-width: calc(100vw - 48px);
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.96);
  border: 1px solid rgba(255, 255, 255, 0.95);
  box-shadow: 0 20px 48px rgba(30, 45, 60, 0.28);
  padding: 18px 20px 16px;
}
.add-head {
  display: flex;
  align-items: center;
  gap: 10px;
}
.add-lv {
  flex: none;
  font-size: 12px;
  font-weight: 700;
  padding: 3px 10px;
  border-radius: 999px;
  color: #fff;
}
.add-lv.error {
  background: #e53e3e;
}
.add-lv.warn {
  background: #ed8936;
}
.add-lv.info {
  background: #5a6b80;
}
.add-device {
  flex: 1;
  min-width: 0;
  margin: 0;
  font-size: 17px;
  font-weight: 700;
  color: var(--title);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.add-st {
  flex: none;
  font-size: 12px;
  font-weight: 600;
  padding: 2px 10px;
  border-radius: 999px;
  border: 1px solid rgba(90, 107, 128, 0.3);
  color: var(--muted);
}
.add-st.pending {
  color: #d98a1f;
  border-color: rgba(232, 163, 61, 0.55);
  background: rgba(237, 137, 54, 0.1);
}
.add-st.done {
  color: #3d9b62;
  border-color: rgba(61, 155, 98, 0.45);
  background: rgba(61, 155, 98, 0.1);
}
.add-x {
  flex: none;
  width: 28px;
  height: 28px;
  border-radius: 8px;
  border: 1px solid rgba(90, 107, 128, 0.35);
  background: rgba(255, 255, 255, 0.6);
  color: var(--title);
  font-size: 16px;
  line-height: 1;
  cursor: pointer;
}
.add-x:hover {
  background: rgba(43, 124, 227, 0.12);
}
.add-body {
  margin: 14px 0 0;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.add-row {
  display: flex;
  gap: 12px;
}
.add-row dt {
  flex: none;
  width: 68px;
  font-size: 13px;
  color: var(--muted);
}
.add-row dd {
  margin: 0;
  flex: 1;
  min-width: 0;
  font-size: 13px;
  color: var(--title);
}
.mono {
  font-family: var(--font-mono);
}
.add-content {
  line-height: 1.6;
  overflow-wrap: anywhere;
}
.add-loc {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 2px 0;
}
.add-locnum {
  font-size: 12px;
  color: var(--muted);
  font-family: var(--font-mono);
  background: rgba(90, 107, 128, 0.08);
  border-radius: 6px;
  padding: 1px 8px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.add-dim {
  color: var(--muted);
}
/* 右下角处理按钮（待处理才出现） */
.add-foot {
  display: flex;
  justify-content: flex-end;
  margin-top: 16px;
}
.add-handle {
  padding: 8px 22px;
  border-radius: 10px;
  border: none;
  background: var(--primary);
  color: #fff;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition:
    filter 0.15s ease,
    transform 0.15s ease;
}
.add-handle:hover {
  filter: brightness(1.08);
  transform: translateY(-1px);
}
.add-handle:disabled {
  opacity: 0.55;
  cursor: wait;
  transform: none;
}
.add-handle:focus-visible {
  outline: 2px solid var(--primary);
  outline-offset: 2px;
}
/* 遮罩淡入 + 卡片缩放入场（transform/opacity only；系统减少动效降级为纯淡入） */
.add-enter-active,
.add-leave-active {
  transition: opacity 0.22s ease;
}
.add-enter-active .add-card,
.add-leave-active .add-card {
  transition: transform 0.22s ease;
}
.add-enter-from,
.add-leave-to {
  opacity: 0;
}
.add-enter-from .add-card {
  transform: scale(0.94);
}
.add-leave-to .add-card {
  transform: scale(0.96);
}
@media (prefers-reduced-motion: reduce) {
  .add-enter-active .add-card,
  .add-leave-active .add-card {
    transition: none;
  }
}
.add-x:focus-visible {
  outline: 2px solid var(--primary);
  outline-offset: 1px;
}
</style>
