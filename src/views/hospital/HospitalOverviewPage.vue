<script setup lang="ts">
import { computed, nextTick, onActivated, onDeactivated, onMounted, onUnmounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { fetchEnergyToday } from '../../api/energy/energy'
import { fetchUnhandledEvents } from '../../api/event/event'
import { eventPushSocket } from '../../ws/eventPushSocket'
import EnergyOverviewPanel from '../../panels/EnergyOverviewPanel.vue'
import AlertPanel from '../../panels/AlertPanel.vue'
import HealthPanel from '../../panels/HealthPanel.vue'
import TransformerPanel from '../../panels/TransformerPanel.vue'
import SceneLoadBar from './SceneLoadBar.vue'
import BuildingInfoCard from './BuildingInfoCard.vue'
import FloorPanel from './FloorPanel.vue'
import { summarizeFloorAlarms } from './floorAlarmState'
import type { FloorAlarmSummary } from './floorAlarmState'
import { createCampusScene } from '../../three/campus/sceneManager'
import { CAMPUS_BUILDINGS, CAMPUS_LAYOUT } from '../../config/campusConfig'
import type { AlertItem } from '../../api/hospital/types'

defineOptions({ name: 'HospitalOverviewPage' })

/**
 * 医院总览（4.6，福永 HospitalPage 同构，docs/3D园区二期方案.md）：
 * 中间 3D 园区铺底（Draco GLB 六栋 + 福永式环境），左右毛玻璃面板列悬浮贴边。
 * 园区引擎 = src/three/campus/（医院无关，楼栋/布局数据从 src/config/campusConfig 注入）。
 * 交互：hover 高亮 → 点楼聚焦（相机飞近+其它楼隐藏）→ 信息卡 + 楼层选择器（二期批2）
 * → 点楼层行/3D 楼层下钻（层聚焦蓝光 pop、其余层压暗）→ 一级返回（楼层态直接回全景）。
 * 联动：§2.1 十分钟轮询 → 楼名 kWh 标签；§3.11 全量未处理（5 分钟轮询 + WS 三消息
 * 防抖 2s）→ 告警楼层亮灯（红/琥珀呼吸）+ 楼层选择器行染色 + 看板明细（批3）三视图
 * 共用一份，亮灯/染色/明细口径一致；信息卡 WS 联动见 BuildingInfoCard。
 * 生命周期（DeviceDetailPage 同款，避免与配电房抢 WebGL）：失活彻底 dispose、
 * 激活重建（GLB 模板缓存模块级持久，重建只重摆位）。
 */

// ---- 3D 园区 ----
const sceneEl = ref<HTMLDivElement | null>(null)
const loadProgress = ref(0)
const sceneError = ref(false)
const selectedId = ref<number | null>(null)
const selectedName = ref('')
/** 楼层态（二期批2）：契约楼层键；null = 楼栋聚焦未选层 */
const selectedFloor = ref<string | null>(null)
/** 聚焦楼的楼层清单（引擎 getFloors：GLB 实际节点升序） */
const focusedFloors = ref<string[]>([])
/** §3.11 全量未处理原始列表（亮灯/选择器染色/看板批3 三视图共用一份） */
const unhandledAlerts = ref<AlertItem[]>([])
let scene: {
  dispose(): void
  focusBuilding(id: number): void
  backToCampus(): void
  focusFloor(buildingId: number, floor: string): void
  backToBuilding(): void
  getFloors(buildingId: number): string[]
  setBuildingEnergy(kwhById: Map<number, number>): void
  setBuildingAlarms(alarms: { buildingId: number; floorKey: string; level: number }[]): void
} | null = null

function initScene() {
  if (!sceneEl.value || scene) return
  sceneError.value = false
  loadProgress.value = 0
  try {
    scene = createCampusScene(sceneEl.value, {
      buildings: CAMPUS_BUILDINGS,
      layout: CAMPUS_LAYOUT,
      onProgress: (done, total) => (loadProgress.value = done / total),
      onPick: (pick) => {
        if (pick.kind === 'building' && pick.buildingId != null) {
          const cfg = CAMPUS_BUILDINGS.find((b) => b.id === pick.buildingId)
          if (!cfg) return
          selectedId.value = cfg.id
          selectedName.value = cfg.name
          selectedFloor.value = null
          scene?.focusBuilding(cfg.id)
          focusedFloors.value = scene?.getFloors(cfg.id) ?? []
        } else if (
          pick.kind === 'floor' &&
          pick.buildingId != null &&
          pick.floor != null &&
          pick.buildingId === selectedId.value
        ) {
          // 楼栋聚焦态点 3D 楼层 → 下钻（与选择器行同一入口）
          selectFloor(pick.floor)
        } else {
          clearSelection()
        }
      },
    })
  } catch (err) {
    console.warn('[HospitalOverview] 3D 场景初始化失败', err)
    sceneError.value = true
  }
}

/** 选层（选择器行 / 3D 楼层点击）：相机下钻 + 信息卡切楼层模式（选择器自动收起） */
function selectFloor(floor: string) {
  if (selectedId.value == null) return
  selectedFloor.value = floor
  scene?.focusFloor(selectedId.value, floor)
}

/** 一级返回（楼层态也直接回全景）：楼层卡缩消 + 选择器/楼层视觉还原 + 相机回全景 */
function clearSelection() {
  selectedId.value = null
  selectedFloor.value = null
  selectedName.value = ''
  focusedFloors.value = []
  scene?.backToCampus()
}

const onKeydown = (ev: KeyboardEvent) => {
  if (ev.key === 'Escape' && selectedId.value != null) clearSelection()
}

// ---- 数据联动：楼名 kWh + 告警楼层亮灯/染色 ----
const NAME_TO_ID = new Map(CAMPUS_BUILDINGS.map((b) => [b.name, b.id]))

/** §2.1 → 楼名 kWh（10 分钟轮询；楼名键 → buildingId 映射） */
async function refreshEnergy() {
  if (!scene) return
  const today = await fetchEnergyToday().catch(() => null)
  if (!today) return
  const kwhById = new Map<number, number>()
  for (const [name, stat] of Object.entries(today.buildingStats)) {
    const id = NAME_TO_ID.get(name)
    if (id != null) kwhById.set(id, stat.energyKwh)
  }
  scene.setBuildingEnergy(kwhById)
}

/** §3.11 全量未处理 → 原始列表留 ref（选择器染色/看板明细共用）+ level 1/2 过滤喂 3D
 *  亮灯。驱动：WS 三消息统一防抖 2s 重拉（today_events 整表替换/event 增量/handled 灭灯
 *  都收敛为"全量重建"）+ 5 分钟轮询兜底 + 处理成功立即重拉（批3 接）。
 *  「未处理=活着=亮灯」口径：不限今日，昨日未处理同样亮灯（2026-11-19 拍板）。 */
async function refreshBuildingAlarms() {
  if (!scene) return
  const alerts = await fetchUnhandledEvents().catch(() => [])
  unhandledAlerts.value = alerts
  const alarms: { buildingId: number; floorKey: string; level: number }[] = []
  for (const a of alerts) {
    if (a.status !== 'pending') continue
    const lv = a.eventLevel
    if (lv !== 1 && lv !== 2) continue
    for (const loc of a.locations ?? []) {
      alarms.push({ buildingId: loc.building, floorKey: loc.floor, level: lv })
    }
  }
  scene.setBuildingAlarms(alarms)
}

let energyTimer: number | null = null
let unhandledTimer: number | null = null
let alarmDebounce: number | null = null
let eventPushSocketOff: (() => void)[] = []

/** 定时器与 WS 订阅（幂等）；初始数据拉取在 initScene 之后单独触发 */
function startLinkages() {
  if (energyTimer == null) {
    energyTimer = window.setInterval(() => void refreshEnergy(), 10 * 60 * 1000)
  }
  if (unhandledTimer == null) {
    unhandledTimer = window.setInterval(() => void refreshBuildingAlarms(), 5 * 60 * 1000)
  }
  if (eventPushSocketOff.length === 0) {
    const debounced = () => {
      if (alarmDebounce != null) window.clearTimeout(alarmDebounce)
      alarmDebounce = window.setTimeout(() => void refreshBuildingAlarms(), 2000)
    }
    eventPushSocketOff = [
      eventPushSocket.onTodayList(debounced),
      eventPushSocket.onSingle(debounced),
      eventPushSocket.onHandled(debounced),
    ]
  }
}

function stopLinkages() {
  if (energyTimer != null) {
    window.clearInterval(energyTimer)
    energyTimer = null
  }
  if (unhandledTimer != null) {
    window.clearInterval(unhandledTimer)
    unhandledTimer = null
  }
  if (alarmDebounce != null) {
    window.clearTimeout(alarmDebounce)
    alarmDebounce = null
  }
  for (const off of eventPushSocketOff) off()
  eventPushSocketOff = []
}

function disposeScene() {
  scene?.dispose()
  scene = null
}

/** 场景就绪后的首拉（染色/亮灯）+ 启动轮询与 WS——必须在 initScene 之后 */
async function startSceneLinkages() {
  initScene()
  await nextTick()
  await refreshEnergy()
  await refreshBuildingAlarms()
  startLinkages()
}

onMounted(() => {
  window.addEventListener('keydown', onKeydown)
  void startSceneLinkages()
})
onActivated(() => {
  window.addEventListener('keydown', onKeydown)
  void startSceneLinkages()
})
onDeactivated(() => {
  window.removeEventListener('keydown', onKeydown)
  stopLinkages()
  disposeScene()
})
onUnmounted(() => {
  window.removeEventListener('keydown', onKeydown)
  stopLinkages()
  disposeScene()
})

const router = useRouter()

/** 聚焦态：左右四面板淡出、信息卡淡入（福永聚焦收面板同款形态） */
const focused = computed(() => selectedId.value != null)

/** 聚焦楼的楼层告警分桶（选择器行染色/批3 看板与 3D 亮灯共用一份 §3.11 数据） */
const focusedAlarmMap = computed<Map<string, FloorAlarmSummary>>(() =>
  selectedId.value != null
    ? summarizeFloorAlarms(selectedId.value, unhandledAlerts.value)
    : new Map<string, FloorAlarmSummary>(),
)

/** 面板头图标（福永 PanelContainer registry 同款 path） */
const ICONS = {
  energy: 'M3 3h18v18H3zM3 9h18M9 21V9',
  transformer:
    'M12 9v-3m0 12v-3m3-3h3m-12 0h3M6.34 6.34l2.12 2.12m7.08 7.08 2.12 2.12M17.66 6.34l-2.12 2.12m-7.08 7.08 2.12 2.12M12 12m-3 0a3 3 0 1 0 6 0a3 3 0 1 0-6 0',
  health: 'M22 12h-4l-3 8-4-16-3 8H2',
  alert: 'M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9M13.7 21a2 2 0 0 1-3.4 0',
} as const
</script>

<template>
  <div class="hospital">
    <!-- 3D 园区：canvas 容器铺底（z0），加载进度条与失败遮罩叠在其上 -->
    <div ref="sceneEl" class="scene-host" />
    <SceneLoadBar :progress="loadProgress" />
    <div v-if="sceneError" class="scene-error">
      <p>3D 园区加载失败（WebGL 不可用或模型异常）</p>
      <button type="button" @click="disposeScene(); initScene()">重试</button>
    </div>

    <!-- 楼层选择器（楼栋聚焦态左侧滑入；选层自动收起，× /Esc 一级返回全景） -->
    <Transition name="fp">
      <FloorPanel
        v-if="selectedId != null"
        :building-id="selectedId"
        :building-name="selectedName"
        :floors="focusedFloors"
        :alarms="focusedAlarmMap"
        :selected-floor="selectedFloor"
        @focus-floor="selectFloor"
      />
    </Transition>

    <!-- 楼栋/楼层信息卡：楼栋⇄楼层 out-in 缩放过渡（层间切换同 key 热替换不重播）；
         × 关闭 / Esc 一级返回全景 -->
    <Transition name="bic" mode="out-in">
      <BuildingInfoCard
        v-if="selectedId != null"
        :key="selectedFloor != null ? 'floor' : selectedId"
        :building-id="selectedId"
        :building-name="selectedName"
        :floor="selectedFloor"
        @close="clearSelection"
      />
    </Transition>

    <!-- 中间状态胶囊（福永同款：顶部居中；hud 展开交互随 3D 后补） -->
    <div class="status-tag">
      <span class="pulse-dot" />
      <span>医院环境正常</span>
    </div>

    <!-- 左侧浮动面板列 -->
    <aside class="side left" :class="{ 'side-hidden': focused }">
      <section class="panel-block glass-card" :style="{ flex: 0.7 }">
        <div class="card-head">
          <span class="card-ico">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path :d="ICONS.energy" />
            </svg>
          </span>
          <h3 class="card-title">能源运营总览</h3>
        </div>
        <div class="panel-body">
          <EnergyOverviewPanel />
        </div>
      </section>

      <section class="panel-block glass-card" :style="{ flex: 1.6 }">
        <div class="card-head">
          <span class="card-ico">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path :d="ICONS.transformer" />
            </svg>
          </span>
          <h3 class="card-title">主要设备监测</h3>
        </div>
        <div class="panel-body">
          <TransformerPanel />
        </div>
      </section>
    </aside>

    <!-- 右侧浮动面板列 -->
    <aside class="side right" :class="{ 'side-hidden': focused }">
      <section class="panel-block glass-card" :style="{ flex: 1 }">
        <div class="card-head">
          <span class="card-ico">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path :d="ICONS.health" />
            </svg>
          </span>
          <h3 class="card-title">医院整体健康度</h3>
          <button type="button" class="card-sub" @click="router.push('/device')">更多 &gt;</button>
        </div>
        <div class="panel-body">
          <HealthPanel />
        </div>
      </section>

      <section class="panel-block glass-card" :style="{ flex: 2 }">
        <div class="card-head">
          <span class="card-ico">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path :d="ICONS.alert" />
            </svg>
          </span>
          <h3 class="card-title">告警信息</h3>
        </div>
        <div class="panel-body">
          <AlertPanel />
        </div>
      </section>
    </aside>
  </div>
</template>

<style scoped>
.hospital {
  width: 100%;
  height: 100%;
  overflow: hidden;
  position: relative;
}
/* 3D 园区 canvas 容器：absolute 铺底；3D 初始化前露页面底色过渡 */
.scene-host {
  position: absolute;
  inset: 0;
  z-index: 0;
  background:
    radial-gradient(900px 520px at 50% 30%, rgba(76, 208, 232, 0.08), transparent 60%),
    linear-gradient(165deg, var(--bg-1), var(--bg-2));
}
.scene-error {
  position: absolute;
  left: 50%;
  top: 50%;
  transform: translate(-50%, -50%);
  z-index: 16;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  padding: 18px 26px;
  border-radius: 14px;
  background: rgba(96, 24, 30, 0.72);
  border: 1px solid rgba(229, 72, 77, 0.55);
  color: #ffd9da;
  font-size: 14px;
}
.scene-error button {
  padding: 6px 22px;
  border-radius: 8px;
  border: 1px solid rgba(255, 217, 218, 0.7);
  background: rgba(255, 255, 255, 0.08);
  color: #fff;
  font-size: 14px;
  cursor: pointer;
}

/* 左右浮动面板：毛玻璃浮层，绝对定位避开顶部栏（福永 .side 同款） */
.side {
  position: absolute;
  top: calc(var(--topbar-height) + 16px);
  bottom: 24px;
  width: 380px;
  z-index: 10;
  display: flex;
  flex-direction: column;
  gap: var(--gutter);
}
.side.left {
  left: 24px;
}
/* 聚焦态：面板淡出让位（pointer-events 同步关掉避免挡住信息卡点击） */
.side {
  transition: opacity 0.35s ease;
}
.side-hidden {
  opacity: 0;
  pointer-events: none;
}
.side.right {
  right: 24px;
}
.panel-block {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  padding: 18px var(--panel-padding) 16px;
}
.panel-body {
  flex: 1;
  min-height: 0;
  position: relative;
}

/* 中间状态胶囊（福永 status-tag 同款：顶部居中） */
.status-tag {
  position: absolute;
  top: calc(var(--topbar-height) + 14px);
  left: 50%;
  transform: translateX(-50%);
  z-index: 20;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 18px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.82);
  border: 1px solid rgba(255, 255, 255, 0.95);
  box-shadow: 0 8px 20px rgba(43, 108, 160, 0.12);
  font-size: 14px;
  font-weight: 600;
  color: var(--title);
}
.pulse-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--primary);
  box-shadow: 0 0 0 4px rgba(43, 124, 227, 0.14);
}

/* 信息卡过渡（Transition name=bic 作用在子组件根元素上，mode=out-in）：
   楼栋⇄楼层时原地缩小消失→出现（卡片定位占用 translateY(-50%)，缩放须带基准写）；
   层间切换不换 key 不重播 */
.bic-enter-active {
  transition: opacity 0.28s ease, transform 0.28s ease;
}
.bic-leave-active {
  transition: opacity 0.22s ease, transform 0.22s ease;
}
.bic-enter-from {
  opacity: 0;
  transform: translateY(-50%) scale(0.86);
}
.bic-leave-to {
  opacity: 0;
  transform: translateY(-50%) scale(0.86);
}
/* 楼层选择器从左滑入/滑出 */
.fp-enter-active {
  transition: opacity 0.3s ease, transform 0.3s ease;
}
.fp-leave-active {
  transition: opacity 0.25s ease, transform 0.25s ease;
}
.fp-enter-from,
.fp-leave-to {
  opacity: 0;
  transform: translateX(-24px);
}
/* 动效兜底：系统开启「减少动态效果」时只保留透明度过渡 */
@media (prefers-reduced-motion: reduce) {
  .bic-enter-active,
  .bic-leave-active,
  .fp-enter-active,
  .fp-leave-active {
    transition: opacity 0.2s ease;
  }
  .bic-enter-from,
  .bic-leave-to {
    transform: translateY(-50%);
  }
  .fp-enter-from,
  .fp-leave-to {
    transform: none;
  }
}
</style>
