<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { DeviceDetail, SuperDevice } from '../../../api/device/types'
import { fetchDevicesBySuper } from '../../../api/device/device'
import { fetchSuperDeviceLevelCounts, toEventLevelStats } from '../../../api/event/event'
import type { EventLevelStats } from '../../../api/event/types'

/**
 * 点位列表弹窗（4.2④，按需请求）：柜内设备明细（§1.7 分页）+ 柜分级统计头（§3.5）。
 * 行内「查看」→ 交给父级开告警抽屉（抽屉自行按需拉 §1.11/§3.3）。结构照福永 PointListDialog。
 */
const props = defineProps<{ cabinet: SuperDevice | null }>()
const emit = defineEmits<{
  close: []
  viewAlarms: [device: DeviceDetail]
}>()

const devices = ref<DeviceDetail[]>([])
const total = ref(0)
const page = ref(1)
const pageSize = 13
const loading = ref(false)
const levelStats = ref<EventLevelStats[]>([])

async function load(pageNo: number) {
  if (!props.cabinet?.id) return
  loading.value = true
  try {
    const [r, stats] = await Promise.all([
      fetchDevicesBySuper(props.cabinet.id, pageNo, pageSize),
      fetchSuperDeviceLevelCounts(props.cabinet.id),
    ])
    devices.value = r.rows
    total.value = r.total
    page.value = pageNo
    levelStats.value = toEventLevelStats(stats)
  } finally {
    loading.value = false
  }
}

watch(
  () => props.cabinet?.id,
  (id) => {
    if (id) void load(1)
  },
  { immediate: true },
)

const totalPages = computed(() => Math.max(1, Math.ceil(total.value / pageSize)))
const LEVEL_LABELS = ['', '紧急', '严重', '一般', '提示'] as const
/** 头部历史告警行：紧急 0 · 严重 26 · 一般 0 · 提示 0（福永同款） */
const levelStatLine = computed(() =>
  ([1, 2, 3, 4] as const)
    .map((lv) => `${LEVEL_LABELS[lv]} ${levelStats.value.find((s) => s.eventLevel === lv)?.count ?? 0}`)
    .join(' · '),
)

// Esc 关闭（福永同款）
watch(
  () => props.cabinet,
  (d) => {
    if (d) window.addEventListener('keydown', onEsc)
    else window.removeEventListener('keydown', onEsc)
  },
)
function onEsc(e: KeyboardEvent) {
  if (e.key === 'Escape') emit('close')
}
</script>

<template>
  <Transition name="pl">
    <div v-if="props.cabinet" class="pl-mask" @click.self="emit('close')">
      <div class="pl-box" role="dialog" aria-modal="true">
        <header class="pl-head">
          <div class="pl-meta">
            <span class="pl-item" :title="props.cabinet.superName">
              <em>箱柜名称：</em>{{ props.cabinet.superName }}
            </span>
            <span class="pl-item">
              <em>设备编号：</em><span class="mono">{{ props.cabinet.deviceNumber || '—' }}</span>
            </span>
            <span class="pl-item">
              <em>测点设备数：</em><span class="mono">{{ total }}</span>
            </span>
            <span class="pl-item">
              <em>箱柜健康度：</em><span class="mono">{{ props.cabinet.health ?? '—' }}</span>
            </span>
            <span class="pl-item">
              <em>历史告警：</em><span class="mono">{{ levelStatLine }}</span>
            </span>
          </div>
          <button class="pl-x" type="button" aria-label="关闭" @click="emit('close')">×</button>
        </header>
        <div class="pl-scroll">
          <table class="pl-table">
            <thead>
              <tr>
                <th class="pl-name">测点设备名称</th>
                <th class="pl-id">设备ID</th>
                <th class="pl-st">启用状态</th>
                <th class="pl-ac">历史告警数</th>
                <th class="pl-act">操作</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="d in devices" :key="d.deviceId">
                <td class="pl-name">{{ d.deviceName }}</td>
                <td class="mono">{{ d.deviceId }}</td>
                <td>
                  <span class="st-pill" :class="d.enabled === 1 ? 'st-done' : 'st-pending'">
                    <i class="dot" />{{ d.enabled === 1 ? '启用' : '停用' }}
                  </span>
                </td>
                <td class="pl-ac mono" :class="{ hot: d.alarmCount > 0 }">{{ d.alarmCount }}</td>
                <td class="pl-act">
                  <button class="ev-btn" type="button" @click="emit('viewAlarms', d)">查看</button>
                </td>
              </tr>
              <tr v-if="!devices.length && !loading">
                <td colspan="5" class="pl-empty">该箱柜暂无测点设备</td>
              </tr>
            </tbody>
          </table>
          <p v-if="loading" class="pl-loading">加载中…</p>
        </div>
        <footer class="pl-foot">
          <span>共 {{ total }} 条</span>
          <div class="pl-pg">
            <button :disabled="page <= 1" @click="load(page - 1)">‹</button>
            <span>{{ page }} / {{ totalPages }}</span>
            <button :disabled="page >= totalPages" @click="load(page + 1)">›</button>
          </div>
        </footer>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
.pl-mask {
  position: absolute;
  inset: 0;
  z-index: 40;
  background: rgba(43, 124, 227, 0.14);
  backdrop-filter: blur(6px);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: calc(var(--topbar-height) + 18px) 24px 24px;
}
.pl-box {
  width: min(1100px, 100%);
  max-height: min(780px, 96%);
  display: flex;
  flex-direction: column;
  border-radius: var(--radius);
  border: 1px solid var(--border);
  background: rgba(255, 255, 255, 0.88);
  box-shadow: var(--card-shadow);
  overflow: hidden;
}
.pl-enter-active,
.pl-leave-active {
  transition: opacity 0.2s ease;
}
.pl-enter-from,
.pl-leave-to {
  opacity: 0;
}
.pl-head {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 12px 18px;
  background: var(--primary-50);
  border-bottom: 1px solid var(--border);
  flex: none;
}
.pl-meta {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-wrap: wrap;
  gap: 8px 40px;
}
.pl-item {
  font-size: 15px;
  color: var(--primary-700);
  font-weight: 600;
}
.pl-item em {
  font-style: normal;
  color: var(--title);
  font-weight: 700;
  margin-right: 2px;
}
.pl-x {
  width: 34px;
  height: 34px;
  border: 1px solid transparent;
  border-radius: var(--radius-sm);
  background: rgba(255, 255, 255, 0.85);
  font-size: 24px;
  color: var(--muted);
  cursor: pointer;
  line-height: 1;
}
.pl-x:hover {
  background: #fff;
  color: var(--primary);
}
.pl-scroll {
  flex: 1;
  min-height: 0;
  overflow: auto;
  padding: 0 18px;
}
.pl-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 15px;
}
.pl-table th,
.pl-table td {
  padding: 8px 10px;
  border-bottom: 1px solid var(--border);
  text-align: center;
}
.pl-table th {
  background: var(--primary-50);
  color: var(--title);
  font-weight: 700;
  position: sticky;
  top: 0;
}
.pl-name {
  width: 30%;
  text-align: left;
  color: var(--title);
  font-weight: 500;
}
.pl-id {
  width: 14%;
}
.pl-st {
  width: 14%;
}
.pl-ac {
  width: 16%;
  font-weight: 700;
  color: var(--title);
}
.pl-ac.hot {
  color: var(--warn-text);
}
.pl-act {
  width: 12%;
}
.st-pill {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 3px 10px;
  border-radius: 999px;
  font-size: 13px;
  font-weight: 600;
}
.dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: currentColor;
}
.st-pill.st-done {
  color: var(--ok-text);
  background: rgba(46, 196, 142, 0.12);
}
.st-pill.st-pending {
  color: var(--danger-text);
  background: rgba(239, 68, 68, 0.12);
}
.ev-btn {
  padding: 3px 12px;
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
}
.pl-empty {
  text-align: center;
  color: var(--muted);
  padding: 32px !important;
}
.pl-loading {
  text-align: center;
  color: var(--muted);
  font-size: 13px;
  padding: 8px;
}
.pl-foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 18px;
  border-top: 1px solid var(--border);
  font-size: 14px;
  color: var(--muted);
  flex: none;
}
.pl-pg {
  display: flex;
  align-items: center;
  gap: 8px;
}
.pl-pg button {
  min-width: 30px;
  height: 30px;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: rgba(255, 255, 255, 0.85);
  cursor: pointer;
  color: var(--text);
}
.pl-pg button:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
</style>
