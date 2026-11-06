<script setup lang="ts">
import {
  computed,
  nextTick,
  onActivated,
  onBeforeUnmount,
  onDeactivated,
  onMounted,
  ref,
  watch,
} from 'vue'
import { useRoute, useRouter } from 'vue-router'
import type { EChartsOption } from 'echarts'
import { createDeviceScene, modelOfType, type DeviceScene } from './engine/deviceScene'
import type { AlertItem, HistoryAlertRow } from '../../api/hospital/types'
import type { DeviceBrief, SuperDevice } from '../../api/device/types'
import type { EventBrief } from '../../api/event/types'
import type { CaoliaoRecord, InspectDeviceRecord } from '../../api/operation/types'
import { fetchDeviceBriefsBySuper } from '../../api/device/device'
import { fetchDeviceHistoryEvents } from '../../api/event/event'
import { normalizeEventLevel } from '../../api/event/mappers'
import {
  fetchDefectRecordsByDeviceNumber,
  fetchInspectionRecordsByDeviceNumber,
} from '../../api/operation/operation'
import { chartColors } from '../../config/chartColors'
import { healthGrade } from '../../config/healthGrades'
import { useDeviceCatalogStore } from '../../store/deviceCatalog'
import { usePageTabsStore } from '../../store/pageTabs'
import DeviceInfoCard from './components/DeviceInfoCard.vue'
import HealthCard from './components/HealthCard.vue'
import HistoryAlertCard from './components/HistoryAlertCard.vue'
import MaintCard from './components/MaintCard.vue'
import DefectCard from './components/DefectCard.vue'
import EnergyTrendPanel from './components/EnergyTrendPanel.vue'
import AlertDetailDrawer from '../../components/AlertDetailDrawer.vue'
import DefectDetailDrawer from '../../components/DefectDetailDrawer.vue'

defineOptions({ name: 'DeviceDetailPage' })

const catalog = useDeviceCatalogStore()
const pageTabs = usePageTabsStore()
const route = useRoute()
const router = useRouter()

const superIdQuery = computed(() => {
  const raw = route.query.superId
  const n = Number(Array.isArray(raw) ? raw[0] : raw)
  return Number.isFinite(n) && n > 0 ? n : 0
})
/** 从配电房点柜进入（query.from=power），返回按钮回配电房 */
const fromPowerRoom = computed(() => route.query.from === 'power')
const backLabel = computed(() => (fromPowerRoom.value ? '返回配电房' : '返回设备管理'))

/** 目录箱柜（store 内带 mock 补充的 buildingId，真实后端无此字段） */
type CatalogCabinet = SuperDevice & { buildingId?: number }

const currentCabinet = computed<CatalogCabinet | null>(() => {
  const sid = superIdQuery.value
  if (!sid) return null
  return (catalog.cabinets as CatalogCabinet[]).find((c) => c.id === sid) ?? null
})
const displayName = computed(() => currentCabinet.value?.superName || '—')
const currentBuilding = computed(
  () => catalog.buildings.find((b) => b.id === currentCabinet.value?.buildingId)?.buildingName || '—',
)

/** §1.8 箱柜下设备列表（精简，页面拉一次供电能趋势下拉用；2026-11-06 用户拍板弃 §1.7） */
const cabDevices = ref<DeviceBrief[]>([])

const pageReady = ref(false)
const catalogError = ref('')
async function ensureCatalog() {
  if (catalog.cabinets.length) return
  catalogError.value = ''
  await catalog.load()
  catalogError.value = catalog.error
}

// ---- 告警记录：卡内自带开关下拉，与电能趋势解耦（2026-11-06 用户拍板）——
// 选中只驱动 §3.3 一个请求；电能趋势选中只驱动 §2.4 ----
const alertDeviceId = ref<number | null>(null)

const historyAlerts = ref<HistoryAlertRow[]>([])
const historyLoading = ref(false)

function briefToHistoryRow(e: EventBrief): HistoryAlertRow {
  const lv = normalizeEventLevel(e.eventLevel)
  return {
    id: e.eventId,
    time: e.timeStr,
    content: e.description,
    level: lv === 1 ? 'error' : 'warn',
    status: e.handleStatus === 1 ? 'done' : 'pending',
    eventLevel: lv,
  }
}

async function loadHistory() {
  const id = alertDeviceId.value
  if (id == null) {
    historyAlerts.value = []
    return
  }
  historyLoading.value = true
  try {
    const events = await fetchDeviceHistoryEvents(id).catch(() => [] as EventBrief[])
    historyAlerts.value = events.map(briefToHistoryRow)
  } finally {
    historyLoading.value = false
  }
}

// 告警卡切换开关 → §3.3（null = 无开关，直接清空）
watch(alertDeviceId, () => void loadHistory())

// ---- 维护记录（§4.1）/ 缺陷记录（§4.2）+ 缺陷详情抽屉 ----
const maintenanceRecords = ref<InspectDeviceRecord[]>([])
const maintLoading = ref(false)
async function loadMaintenance() {
  const num = currentCabinet.value?.deviceNumber || ''
  maintLoading.value = true
  try {
    maintenanceRecords.value = num ? await fetchInspectionRecordsByDeviceNumber(num) : []
  } catch {
    maintenanceRecords.value = []
  } finally {
    maintLoading.value = false
  }
}

const defectRecords = ref<CaoliaoRecord[]>([])
const defectLoading = ref(false)
const defectDrawerShow = ref(false)
const activeDefect = ref<CaoliaoRecord | null>(null)
async function loadDefects() {
  const num = currentCabinet.value?.deviceNumber || ''
  defectLoading.value = true
  try {
    defectRecords.value = num ? await fetchDefectRecordsByDeviceNumber(num) : []
  } catch {
    defectRecords.value = []
  } finally {
    defectLoading.value = false
  }
}
function openDefect(rec: CaoliaoRecord) {
  activeDefect.value = rec
  defectDrawerShow.value = true
}

// ---- 健康度（柜表 pill 同口径：优/良主题蓝、一般琥珀、较差/极差红——待用户确认） ----
const healthScore = computed(() => {
  const h = currentCabinet.value?.health
  if (h == null || !Number.isFinite(h)) return null
  return Math.round(h)
})
const GRADE_LABEL: Record<string, string> = {
  excellent: '优秀',
  good: '良好',
  fair: '一般',
  poor: '较差',
  terrible: '极差',
}
function gradeColor(score: number): string {
  if (score >= 70) return chartColors.primary
  if (score >= 50) return chartColors.warn
  return chartColors.danger
}
const healthStatus = computed(() => {
  const h = healthScore.value
  const g = healthGrade(h)
  if (h == null || !g) return { text: '—', color: 'var(--muted)' }
  return { text: GRADE_LABEL[g] ?? '—', color: gradeColor(h) }
})
const healthGaugeOption = computed<EChartsOption>(() => {
  const h = healthScore.value ?? 0
  const color = gradeColor(h)
  return {
    series: [
      {
        type: 'gauge',
        startAngle: 210,
        endAngle: -30,
        min: 0,
        max: 100,
        center: ['50%', '58%'],
        radius: '92%',
        progress: { show: true, width: 14, roundCap: true, itemStyle: { color } },
        axisLine: { lineStyle: { width: 14, color: [[1, '#e6edf3']] } },
        pointer: { show: false },
        axisTick: { show: false },
        splitLine: { show: false },
        axisLabel: { show: false },
        title: { show: false },
        detail: { show: false },
        data: [{ value: h }],
      },
    ],
  }
})

// ---- 告警详情抽屉（与告警中心共用组件；行点击弹出） ----
const detailAlert = ref<AlertItem | null>(null)
function openHistAlert(row: HistoryAlertRow) {
  const item: AlertItem = {
    id: row.id,
    time: row.time,
    device: displayName.value,
    content: row.content,
    level: row.level,
    eventLevel: row.eventLevel ?? (row.level === 'error' ? 1 : 3),
    system: '设备详情',
    status: row.status,
  }
  detailAlert.value = item
}

// ---- 3D 单柜场景（keep-alive：离开销毁释放 WebGL，回来重建） ----
const sceneEl = ref<HTMLElement>()
let sceneManager: DeviceScene | null = null
const sceneError = ref<string | null>(null)

async function initScene() {
  const cab = currentCabinet.value
  if (!sceneEl.value || !cab) return
  const w = sceneEl.value.clientWidth
  const h = sceneEl.value.clientHeight
  if (!w || !h) {
    requestAnimationFrame(() => void initScene())
    return
  }
  sceneManager?.dispose()
  sceneManager = null
  const scene = createDeviceScene(sceneEl.value, { model: modelOfType(cab.deviceType) })
  sceneManager = scene
  try {
    await scene.ready
    if (sceneManager === scene) sceneError.value = null
  } catch (err) {
    if (sceneManager === scene) {
      sceneManager.dispose()
      sceneManager = null
      sceneError.value = (err as { message?: string })?.message || '3D 场景初始化失败'
    }
  }
}

let lastBootKey = ''
async function bootScene() {
  const key = String(superIdQuery.value)
  if (key === lastBootKey) return
  lastBootKey = key
  historyAlerts.value = []
  maintenanceRecords.value = []
  defectRecords.value = []
  cabDevices.value = []
  alertDeviceId.value = null // 换柜先清空，避免旧柜开关 id 在新列表里碰巧存在串台
  void loadMaintenance()
  void loadDefects()
  const sid = superIdQuery.value
  cabDevices.value = sid
    ? await fetchDeviceBriefsBySuper(sid).catch(() => [])
    : []
  // 告警卡默认选中首个开关 → watch 触发 §3.3；电能趋势面板自行选首个只发 §2.4
  alertDeviceId.value = cabDevices.value[0]?.deviceId ?? null
  nextTick(() => void initScene())
}

watch(superIdQuery, () => {
  if (pageReady.value) void bootScene()
})

onMounted(async () => {
  window.addEventListener('keydown', onKeydown, true)
  await ensureCatalog()
  pageReady.value = true
  await bootScene()
})
onActivated(() => {
  if (pageReady.value && !sceneManager) nextTick(() => void initScene())
})
onDeactivated(() => {
  // 释放 WebGL，避免与配电房/总览抢上下文失色
  sceneManager?.dispose()
  sceneManager = null
})
onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeydown, true)
  sceneManager?.dispose()
  sceneManager = null
})

function back() {
  if (fromPowerRoom.value) {
    pageTabs.open('/power-room', '配电房', 'power-room')
    router.push('/power-room')
    return
  }
  pageTabs.open('/device', '设备管理', 'device')
  router.push('/device')
}
function onKeydown(e: KeyboardEvent) {
  if (e.key !== 'Escape') return
  // 缺陷详情抽屉打开时 ESC 只关抽屉（naive 自带），不触发返回（福永同款守卫）；
  // 告警抽屉是自绘的，ESC 在这里代为关闭；
  // NSelect 下拉菜单开着时同理只关菜单，关完再按一次 Esc 才返回
  if (defectDrawerShow.value) return
  if (document.querySelector('.n-base-select-menu')) return
  if (detailAlert.value) {
    detailAlert.value = null
    return
  }
  back()
}
</script>

<template>
  <div class="dm-model-page">
    <div ref="sceneEl" class="scene" />

    <!-- 3D 初始化失败兜底遮罩 -->
    <div v-if="sceneError" class="scene-error-mask">
      <div class="load-box">
        <div class="load-title">3D 场景加载失败</div>
        <div class="load-hint">{{ sceneError }}</div>
        <button type="button" class="load-retry" @click="initScene">重试</button>
      </div>
    </div>

    <div v-if="!pageReady" class="model-load-overlay">
      <div class="load-box">
        <template v-if="catalogError">
          <div class="load-title">设备档案加载失败</div>
          <div class="load-hint">{{ catalogError }}</div>
          <button type="button" class="load-retry" @click="ensureCatalog">重试</button>
        </template>
        <div v-else class="load-hint">正在加载设备档案…</div>
      </div>
    </div>

    <template v-else>
      <div v-if="!currentCabinet" class="model-load-overlay">
        <div class="load-box">
          <div class="load-hint">未找到该箱柜（superId={{ superIdQuery || '—' }}），请从设备管理或配电房重新进入。</div>
        </div>
      </div>
      <template v-else>
        <div class="status-tag">
          <span class="pulse-dot live" />
          <span>设备详情 · {{ currentBuilding }}</span>
        </div>
        <button class="back-btn" @click="back">← {{ backLabel }}</button>

        <aside class="side left">
          <DeviceInfoCard
            :name="displayName"
            :device-number="currentCabinet.deviceNumber"
            :device-type="currentCabinet.deviceType"
            :commission-date="currentCabinet.commissionDate || ''"
          />
          <DefectCard :records="defectRecords" :loading="defectLoading" @open="openDefect" />
          <HistoryAlertCard
            v-model:selected="alertDeviceId"
            :alerts="historyAlerts"
            :loading="historyLoading"
            :devices="cabDevices"
            @open="openHistAlert"
          />
        </aside>

        <aside class="side right">
          <HealthCard :option="healthGaugeOption" :score="healthScore" :status="healthStatus" />
          <MaintCard
            :records="maintenanceRecords"
            :loading="maintLoading"
            :cabinet-name="displayName"
          />
        </aside>

        <EnergyTrendPanel :super-id="currentCabinet.id" :devices="cabDevices" />

        <DefectDetailDrawer v-model:show="defectDrawerShow" :record="activeDefect" />
        <AlertDetailDrawer :alert="detailAlert" @close="detailAlert = null" />
      </template>
    </template>
  </div>
</template>

<style scoped>
.dm-model-page {
  width: 100%;
  height: 100%;
  overflow: hidden;
  position: relative;
  /* 侧栏/趋势图区域用页面底色，不被 3D 底色渗入 */
  background: linear-gradient(160deg, var(--bg-1), var(--bg-2));
  /* 底部「电能趋势」面板高度：舞台固定 1920×1080 → 32% × 1080 − 28px = 317.6px。
     左栏「告警记录」卡取同一变量等高，顶/底边对齐（福永同款）。必须写像素值——
     百分比在左栏（flex 列）与页面两个容器里解析结果不同 */
  --trend-panel-h: 317.6px;
}
.model-load-overlay {
  position: absolute;
  inset: 0;
  z-index: 30;
  background: rgba(245, 250, 255, 0.72);
  backdrop-filter: blur(8px);
  display: flex;
  align-items: center;
  justify-content: center;
}
.load-box {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  padding: 26px 34px;
  border-radius: var(--radius);
  background: rgba(255, 255, 255, 0.92);
  box-shadow: var(--card-shadow);
}
.load-title {
  font-size: 17px;
  font-weight: 700;
  color: var(--title);
}
.load-hint {
  font-size: 14px;
  color: var(--muted);
  max-width: 420px;
  text-align: center;
  line-height: 1.5;
}
.load-retry {
  padding: 6px 22px;
  border: none;
  border-radius: 8px;
  background: var(--primary);
  color: var(--on-primary, #fff);
  font-size: 15px;
  font-weight: 600;
  cursor: pointer;
}
.load-retry:hover {
  filter: brightness(1.06);
}
/* 建模画布只占中间建模区，不铺到左右侧栏与底部趋势图下面 */
.scene {
  position: absolute;
  top: calc(var(--topbar-height) + 8px);
  left: 440px;
  right: 440px;
  bottom: calc(32% + 8px);
  z-index: 0;
  border-radius: 14px;
  overflow: hidden;
  background: #eef4fb;
  border: 1px solid rgba(255, 255, 255, 0.85);
  box-shadow: var(--card-shadow);
}
.scene :deep(canvas) {
  display: block;
  width: 100% !important;
  height: 100% !important;
}

/* 3D 初始化失败兜底：覆盖在场景层之上，居中提示并支持重试 */
.scene-error-mask {
  position: absolute;
  top: calc(var(--topbar-height) + 8px);
  left: 440px;
  right: 440px;
  bottom: calc(32% + 8px);
  z-index: 5;
  background: rgba(8, 18, 32, 0.55);
  backdrop-filter: blur(2px);
  display: flex;
  align-items: center;
  justify-content: center;
}

.status-tag {
  position: absolute;
  top: calc(var(--topbar-height) + 14px);
  left: 50%;
  transform: translateX(-50%);
  z-index: 20;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 7px 16px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.72);
  backdrop-filter: blur(14px);
  -webkit-backdrop-filter: blur(14px);
  border: 1px solid rgba(255, 255, 255, 0.95);
  box-shadow: 0 6px 16px rgba(43, 108, 160, 0.1);
  font-size: 17px;
  font-weight: 600;
  color: var(--title);
  max-width: 50vw;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.pulse-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--muted);
  flex: none;
}
.pulse-dot.live {
  background: var(--primary);
  box-shadow: 0 0 0 4px rgba(43, 124, 227, 0.14);
  animation: pulse-blue 2s infinite;
}
@keyframes pulse-blue {
  0%,
  100% {
    box-shadow: 0 0 0 4px rgba(43, 124, 227, 0.14);
  }
  50% {
    box-shadow: 0 0 0 7px rgba(43, 124, 227, 0.06);
  }
}
.back-btn {
  position: absolute;
  top: calc(var(--topbar-height) + 20px);
  right: calc(440px + 22px);
  z-index: 20;
}

.side {
  position: absolute;
  top: calc(var(--topbar-height) + 16px);
  bottom: 16px;
  width: 400px;
  z-index: 10;
  display: flex;
  flex-direction: column;
  gap: 14px;
  overflow: hidden;
}
.side.left {
  left: 24px;
}
.side.right {
  right: 24px;
}
</style>
