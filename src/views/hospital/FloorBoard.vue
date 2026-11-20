<script setup lang="ts">
/**
 * 楼层告警看板（3D 园区二期批3，福永 FloorBoard 同构浅色版）：
 * 选中楼层后出现在楼层选择器右缘（选择器收起时随动左移——transform 过渡，hallmark
 * 底线不动画 left）。头部「楼名 NF · 告警看板」+ 等级徽章（取该层最高等级）；
 * 「当前告警（N）」N=明细条数；明细 = §3.11 未处理列表前端过滤（building+floor 双匹配、
 * level 1/2、时间倒序，floorAlerts 纯函数），3 条/页分页，空态「当前无告警」。
 * 处理按钮 → §3.10 handleEvent（同箱柜级联）→ 乐观移除行（localRemoved 兜住 §3.11
 * 缓存异步刷新窗口）→ emit handled（页面立即重拉收敛亮灯/染色/信息卡计数）。
 * 处理权限 level 0/1：403 由拦截器统一 toast，这里按失败降级提示。
 */
import { computed, ref, watch } from 'vue'
import { floorNodeName } from '../../three/campus/buildings'
import { globalMessage } from '../../utils/message'
import { handleEvent } from '../../api/event/event'
import { floorAlerts } from './floorAlarmState'
import AlertDetailDialog from '../../components/AlertDetailDialog.vue'
import type { AlertItem } from '../../api/hospital/types'

const props = defineProps<{
  buildingId: number
  buildingName: string
  /** 契约楼层键（"3"/"-1"） */
  floor: string
  /** §3.11 全量未处理列表（页面缓存；组件内按本层过滤） */
  alerts: AlertItem[]
  /** 楼层选择器是否收起（看板随动左移） */
  panelCollapsed: boolean
}>()
const emit = defineEmits<{ handled: [] }>()

const PAGE_SIZE = 3
const page = ref(1)
/** 本会话乐观移除的事件 id（立即重拉可能撞上后端缓存未刷的旧行） */
const localRemoved = ref(new Set<string>())
const handling = ref(new Set<string>())

const rows = computed(() =>
  floorAlerts(props.buildingId, props.floor, props.alerts).filter(
    (a) => !localRemoved.value.has(a.id),
  ),
)
const totalPages = computed(() => Math.max(1, Math.ceil(rows.value.length / PAGE_SIZE)))
const pageRows = computed(() =>
  rows.value.slice((page.value - 1) * PAGE_SIZE, page.value * PAGE_SIZE),
)

// 换楼/换层重置分页与乐观集
watch(
  () => [props.buildingId, props.floor] as const,
  () => {
    page.value = 1
    localRemoved.value = new Set()
  },
)
// 数据收缩后页码越界回退
watch(totalPages, (n) => {
  if (page.value > n) page.value = n
})

/** 该层最高等级（数值小=高）：1 紧急 / 2 严重 / 3 无告警 */
const topLevel = computed(() => rows.value.reduce((m, a) => Math.min(m, a.eventLevel ?? 3), 3))
const badge = computed(() =>
  topLevel.value === 1
    ? { text: '紧急告警', cls: 'error' }
    : topLevel.value === 2
      ? { text: '严重告警', cls: 'warn' }
      : { text: '正常', cls: '' },
)

const floorLabel = computed(() => floorNodeName(props.floor) ?? props.floor)
const timeShort = (t: string) => t.slice(5, 16)
const rowLevelText = (a: AlertItem) => (a.eventLevel === 1 ? '紧急' : '严重')

async function handleRow(item: AlertItem) {
  if (handling.value.has(item.id)) return
  handling.value.add(item.id)
  const ok = await handleEvent(item.id).catch(() => false)
  handling.value.delete(item.id)
  if (ok) {
    localRemoved.value = new Set(localRemoved.value).add(item.id)
    globalMessage()?.success('已标记为已处理；同箱柜关联告警已一并处理')
    emit('handled')
  } else {
    globalMessage()?.error('处理失败（可能无权限或事件已不存在）')
  }
}

/** 告警详情弹窗（可复用件；点行展开 EventBrief 全字段） */
const detail = ref<AlertItem | null>(null)
/** 弹窗内处理成功 → 本地乐观移除行 + 通知页面立即重拉（收敛亮灯/染色/计数） */
function onDialogHandled() {
  const id = detail.value?.id
  if (id) localRemoved.value = new Set(localRemoved.value).add(id)
  emit('handled')
}
</script>

<template>
  <aside class="fbd glass-card" :class="{ 'fbd--near': panelCollapsed }">
    <header class="fbd-head">
      <h3 class="fbd-title">{{ buildingName }} {{ floorLabel }} · 告警看板</h3>
      <span v-if="rows.length" class="fbd-badge" :class="badge.cls">{{ badge.text }}</span>
    </header>
    <div class="fbd-sub">当前告警（{{ rows.length }}）</div>
    <div v-if="rows.length" class="fbd-rows">
      <div
        v-for="a in pageRows"
        :key="a.id"
        class="fbd-row"
        role="button"
        tabindex="0"
        @click="detail = a"
        @keydown.enter="detail = a"
      >
        <div class="fbd-row-main">
          <div class="fbd-row-head">
            <span class="fbd-row-device" :title="a.device">{{ a.device }}</span>
            <span class="fbd-row-lv" :class="a.eventLevel === 1 ? 'error' : 'warn'">
              {{ rowLevelText(a) }}
            </span>
            <span class="fbd-row-time">{{ timeShort(a.time) }}</span>
          </div>
          <div class="fbd-row-desc" :title="a.content">{{ a.content }}</div>
        </div>
        <button
          type="button"
          class="fbd-handle"
          :disabled="handling.has(a.id)"
          @click.stop="handleRow(a)"
        >
          {{ handling.has(a.id) ? '处理中…' : '处理' }}
        </button>
      </div>
    </div>
    <div v-else class="fbd-empty">当前无告警</div>
    <div v-if="rows.length > PAGE_SIZE" class="fbd-pager">
      <button type="button" aria-label="上一页" :disabled="page <= 1" @click="page--">‹</button>
      <span>{{ page }} / {{ totalPages }}</span>
      <button type="button" aria-label="下一页" :disabled="page >= totalPages" @click="page++">›</button>
    </div>
    <AlertDetailDialog :alert="detail" @close="detail = null" @handled="onDialogHandled" />
  </aside>
</template>

<style scoped>
.fbd {
  position: absolute;
  /* 锚在收起窄条右缘（24+76+12=112px）；选择器展开时 transform 右移 284px 让位
     （360-76 宽差，transform 过渡——hallmark 底线不动画 left） */
  left: 112px;
  top: calc(var(--topbar-height) + 16px);
  width: 360px;
  max-height: calc(100vh - var(--topbar-height) - 100px);
  z-index: 20;
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 18px 16px 14px;
  transform: translateX(284px);
  transition: transform 0.25s ease;
}
.fbd--near {
  transform: translateX(0);
}
.fbd-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}
.fbd-title {
  margin: 0;
  font-size: 17px;
  font-weight: 700;
  color: var(--title);
}
.fbd-badge {
  flex: none;
  font-size: 12px;
  font-weight: 600;
  padding: 2px 10px;
  border-radius: 999px;
  border: 1px solid rgba(90, 107, 128, 0.25);
  color: var(--muted);
  background: rgba(255, 255, 255, 0.6);
}
.fbd-badge.error {
  color: #d64545;
  border-color: rgba(229, 62, 62, 0.5);
  background: rgba(229, 62, 62, 0.1);
}
.fbd-badge.warn {
  color: #d98a1f;
  border-color: rgba(232, 163, 61, 0.55);
  background: rgba(237, 137, 54, 0.12);
}
.fbd-sub {
  font-size: 13px;
  font-weight: 600;
  color: var(--muted);
}
.fbd-rows {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding-right: 4px;
}
.fbd-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 10px;
  border-radius: 10px;
  border: 1px solid rgba(90, 107, 128, 0.2);
  background: rgba(255, 255, 255, 0.55);
  cursor: pointer;
  transition: background 0.15s ease, border-color 0.15s ease;
}
.fbd-row:hover {
  background: rgba(43, 124, 227, 0.08);
}
.fbd-row:focus-visible {
  outline: 2px solid var(--primary);
  outline-offset: 1px;
}
.fbd-row-main {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 3px;
}
/* 第一行 = 设备名（哪个柜，核心）+ 等级 + 时间 */
.fbd-row-head {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}
.fbd-row-device {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 13px;
  font-weight: 600;
  color: var(--title);
}
.fbd-row-lv {
  flex: none;
  font-size: 12px;
  font-weight: 600;
}
.fbd-row-lv.error {
  color: #d64545;
}
.fbd-row-lv.warn {
  color: #d98a1f;
}
.fbd-row-time {
  flex: none;
  margin-left: auto;
  font-size: 11px;
  color: var(--muted);
  font-family: var(--font-mono);
}
/* 第二行 = 事件描述（两行截断，悬浮看全文） */
.fbd-row-desc {
  font-size: 12px;
  color: var(--muted);
  line-height: 1.5;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.fbd-handle {
  flex: none;
  padding: 5px 14px;
  border-radius: 8px;
  border: 1px solid var(--primary);
  background: rgba(43, 124, 227, 0.1);
  color: var(--primary);
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.15s ease;
}
.fbd-handle:hover {
  background: rgba(43, 124, 227, 0.2);
}
.fbd-handle:disabled {
  opacity: 0.55;
  cursor: wait;
}
.fbd-empty {
  padding: 24px 0;
  text-align: center;
  font-size: 13px;
  color: var(--muted);
}
.fbd-pager {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
  font-size: 13px;
  color: var(--title);
}
.fbd-pager button {
  width: 28px;
  height: 28px;
  border-radius: 8px;
  border: 1px solid rgba(90, 107, 128, 0.3);
  background: rgba(255, 255, 255, 0.6);
  color: var(--title);
  font-size: 15px;
  line-height: 1;
  cursor: pointer;
}
.fbd-pager button:disabled {
  opacity: 0.4;
  cursor: default;
}
.fbd-pager button:not(:disabled):hover {
  background: rgba(43, 124, 227, 0.12);
}
.fbd-handle:focus-visible,
.fbd-pager button:focus-visible {
  outline: 2px solid var(--primary);
  outline-offset: 1px;
}
</style>
