<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import CategoryPanel from './components/CategoryPanel.vue'
import CabinetPanel from './components/CabinetPanel.vue'
import { createPowerRoomScene } from './engine/scene'
import type { PowerRoomsFile } from './data/powerRoom'
import config from './data/power-rooms.json'
import { usePageTabsStore } from '../../store/pageTabs'
import { globalMessage } from '../../utils/message'
import {
  fetchDeviceBriefsBySuper,
  fetchMeasurements,
  fetchSwitchingList,
  fetchSwitchingSupers,
} from '../../api/device/device'
import { fetchDeviceHistoryEvents } from '../../api/event/event'
import { eventBriefToHistoryRow } from '../../api/event/mappers'
import type { MeasInfo, SwitchingSuperBrief } from '../../api/device/types'
import type { HistoryAlertRow } from '../../api/hospital/types'

// keep-alive include 按组件名匹配（福永同款）
defineOptions({ name: 'PowerRoomPage' })

// JSON 导入的 model 字段是宽泛 string，断言成 schema 类型（校验由 npm run check 兜底）
const { pitch, rooms } = config as PowerRoomsFile

const containerRef = ref<HTMLElement | null>(null)
const currentId = ref('room-1')
let scene: ReturnType<typeof createPowerRoomScene> | null = null

const pageTabs = usePageTabsStore()
const router = useRouter()

const options = rooms.map((r) => ({ label: r.name, value: r.id }))
const totalCount = rooms.reduce((n, r) => n + r.rows.flat().length, 0)
const currentName = computed(() => rooms.find((r) => r.id === currentId.value)?.name ?? '')

// ---- §1.3 房名 → switchingId；§1.6 按房缓存（每房仅首次发请求，失败不缓存可重试） ----
const switchingIdByRoom = ref(new Map<string, number>())
const supersCache = new Map<number, Promise<SwitchingSuperBrief[]>>()

const roomName = (roomId: string) => rooms.find((r) => r.id === roomId)?.name ?? roomId

async function loadSwitchings() {
  try {
    const list = await fetchSwitchingList()
    const map = new Map<string, number>()
    for (const s of list) {
      const room = rooms.find((r) => r.name === s.switchingName)
      if (room) map.set(room.id, s.id)
    }
    switchingIdByRoom.value = map
  } catch {
    switchingIdByRoom.value = new Map()
    globalMessage()?.error('配电房列表数据加载失败')
    return
  }
  // 进房即拉 §1.6（福永 roomSource 同款时机），默认房预热
  await loadSupers(currentId.value)?.catch(() => {})
}

/** §1.6 按房取用（缓存 Promise 防并发重复请求；失败 toast 并删除缓存条目，下次点击现场重试） */
function loadSupers(roomId: string): Promise<SwitchingSuperBrief[]> | null {
  const switchingId = switchingIdByRoom.value.get(roomId)
  if (!switchingId) return null
  let p = supersCache.get(switchingId)
  if (!p) {
    p = fetchSwitchingSupers(switchingId).catch((err) => {
      supersCache.delete(switchingId)
      globalMessage()?.error(`${roomName(roomId)}下的柜体信息加载失败`)
      throw err
    })
    supersCache.set(switchingId, p)
  }
  return p
}

// ---- 点柜看板状态 ----
const selectedCabinet = ref<{ code: string; name: string; devCode?: string; superId?: number } | null>(null)
const focused = ref(false)
const switches = ref<{ deviceId: number; deviceName: string }[]>([])
const selectedSwitchName = ref('')
const measurements = ref<MeasInfo[]>([])
const measLoading = ref(false)
const history = ref<HistoryAlertRow[]>([])
const historyLoading = ref(false)

function clearPanel() {
  selectedCabinet.value = null
  switches.value = []
  selectedSwitchName.value = ''
  measurements.value = []
  history.value = []
}

function mountRoom(id: string) {
  const room = rooms.find((r) => r.id === id)
  if (!room || !scene) return
  scene.setRoom(room)
  currentId.value = id
  clearPanel()
  // 进房即预热 §1.6（每房仅首次；福永 roomSource 同款时机）
  void loadSupers(id)?.catch(() => {})
}

function viewDetail() {
  const superId = selectedCabinet.value?.superId
  if (!superId) return
  pageTabs.open('/device-detail?superId=' + superId, '设备详情', 'device-detail')
  void router.push({
    path: '/device-detail',
    query: { superId: String(superId), from: 'power' },
  })
}

/** 点大柜：devCode ↔ §1.6 deviceNumber 唯一精确匹配拿 superId（不做模糊匹配），
 *  未绑定柜提示「未接入台账」；已绑定 → §1.8 拉开关并默认选中第一个 */
async function onCabinetClick(hit: {
  kind: 'cabinet' | 'switch'
  code: string
  name: string
  deviceId?: number
  deviceName?: string
}) {
  if (hit.kind === 'switch') {
    if (hit.deviceId != null) await selectSwitch(hit.deviceId, hit.deviceName)
    return
  }
  // 已在聚焦视图重复点同一个柜：不重拉不重置选中
  if (focused.value && hit.code === selectedCabinet.value?.code) return
  const room = rooms.find((r) => r.id === currentId.value)
  const cab = room?.rows.flat().find((c) => c.code === hit.code)
  const devCode = cab?.devCode
  // §1.6 绑定数据：预热未回或刚失败时点击现场重拉（失败 toast 已在 loadSupers 内）
  const supersP = switchingIdByRoom.value.get(currentId.value) ? loadSupers(currentId.value) : null
  if (!supersP) {
    // 拿不到 switchingId（§1.3 未回/失败/房名不匹配）：不能误报「未接入」
    globalMessage()?.error('配电房列表数据加载失败')
    return
  }
  let supers: SwitchingSuperBrief[]
  try {
    supers = await supersP
  } catch {
    return // 失败 toast 已在 loadSupers 内弹过
  }
  const bound = devCode ? supers.find((s) => s.deviceNumber === devCode) : undefined
  if (!bound) {
    globalMessage()?.warning(`柜「${hit.name}」未接入设备台账，无法查看开关与数据`)
    return
  }
  selectedCabinet.value = { code: hit.code, name: hit.name, devCode, superId: bound.id }
  focused.value = true
  try {
    switches.value = await fetchDeviceBriefsBySuper(bound.id)
  } catch {
    switches.value = []
    globalMessage()?.error('当前柜体下的开关设备数据加载失败')
  }
  // 引擎：进入聚焦视图（隐藏其他对象+相机特写），并按同一构图 frame 摆场
  const frame = scene?.focusCabinet(hit.code, hit.name) ?? null
  scene?.selectCabinet(hit.code, frame, switches.value)
  // 默认选中第一个开关（测点/历史告警跟随；定稿）
  const first = switches.value[0]
  if (first) await selectSwitch(first.deviceId, first.deviceName)
  else {
    selectedSwitchName.value = ''
    measurements.value = []
    history.value = []
  }
}

/** 返回总览（右上按钮）：引擎复原 + 清空看板 */
function backToOverview() {
  scene?.unfocus()
  focused.value = false
  clearPanel()
}

/** 点开关/选中开关变化：看板两模块（§1.11 测点 + §3.3 历史告警全量）+ 3D 选中强调 */
async function selectSwitch(deviceId: number, deviceName?: string) {
  selectedSwitchName.value = deviceName ?? ''
  scene?.markSelectedSwitch(deviceId)
  measLoading.value = true
  historyLoading.value = true
  const [meas, hist] = await Promise.allSettled([
    fetchMeasurements(deviceId),
    fetchDeviceHistoryEvents(deviceId),
  ])
  measurements.value = meas.status === 'fulfilled' ? meas.value : []
  const briefs = hist.status === 'fulfilled' ? hist.value : []
  history.value = briefs.map(eventBriefToHistoryRow)
  historyLoading.value = false
  measLoading.value = false
}

onMounted(() => {
  if (!containerRef.value) return
  // 引擎常驻：渲染器/相机/灯光只建一次，切房走 setRoom（模型模板也跨房缓存）
  scene = createPowerRoomScene(containerRef.value, pitch, { onCabinetClick })
  mountRoom('room-1')
  // §1.3 后台拉取：拿到 switchingId 后预热默认房 §1.6
  void loadSwitchings()
})
onUnmounted(() => scene?.dispose())
</script>

<template>
  <div class="page">
    <!-- 左侧分类 ⇄ 点柜看板同一槽位：先撤出再滑入（福永 pr-swap 同款），聚焦时分类侧栏不再遗留 -->
    <Transition name="pr-swap" mode="out-in">
      <CategoryPanel
        v-if="!selectedCabinet"
        key="cat"
        :options="options"
        :count="totalCount"
        :selected="currentId"
        @select="mountRoom"
      />
      <CabinetPanel
        v-else
        key="cabinet"
        :cabinet="selectedCabinet"
        :selected-switch-name="selectedSwitchName"
        :measurements="measurements"
        :meas-loading="measLoading"
        :history="history"
        :history-loading="historyLoading"
        @view-detail="viewDetail"
      />
    </Transition>
    <transition name="pr-back">
      <button v-if="focused" type="button" class="back-btn" @click="backToOverview">返回配电房</button>
    </transition>
    <div class="status-pill" aria-hidden="true">
      <span class="pulse-dot" />
      <span>{{ currentName }}</span>
    </div>
    <div ref="containerRef" class="scene" />
  </div>
</template>

<style scoped>
.page {
  width: 100%;
  height: 100%;
  position: relative;
}
.status-pill {
  position: absolute;
  top: calc(var(--topbar-height) + 14px);
  left: 50%;
  transform: translateX(-50%);
  z-index: 20;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  width: max-content;
  max-width: calc(100% - 48px);
  padding: 6px 14px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.72);
  backdrop-filter: blur(14px);
  -webkit-backdrop-filter: blur(14px);
  border: 1px solid rgba(255, 255, 255, 0.95);
  box-shadow: 0 6px 16px rgba(43, 108, 160, 0.1);
  font-size: 16px;
  font-weight: 600;
  color: #182635;
  white-space: nowrap;
  line-height: 1.25;
}
.back-btn {
  position: absolute;
  top: calc(var(--topbar-height) + 14px);
  right: 24px;
  z-index: 20;
  padding: 8px 20px;
  border: none;
  border-radius: 10px;
  background: linear-gradient(135deg, var(--primary-400), var(--primary));
  color: var(--on-primary, #fff);
  font-size: 15px;
  font-weight: 600;
  cursor: pointer;
  box-shadow: 0 2px 10px rgba(43, 124, 227, 0.3);
}
.back-btn:hover {
  filter: brightness(1.06);
}
.pulse-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #2b7ce3;
  animation: pill-pulse 2s infinite;
}
@keyframes pill-pulse {
  0%,
  100% {
    box-shadow: 0 0 0 4px rgba(43, 124, 227, 0.14);
  }
  50% {
    box-shadow: 0 0 0 6px rgba(43, 124, 227, 0.05);
  }
}
.scene {
  width: 100%;
  height: 100%;
  position: relative;
}
/* 聚焦看板 / 返回按钮的淡入淡出（福永 pr-swap / pr-back 同款原值） */
.pr-swap-enter-active,
.pr-swap-leave-active {
  transition:
    transform 0.32s ease,
    opacity 0.32s ease;
}
.pr-swap-enter-from,
.pr-swap-leave-to {
  transform: translateX(-28px);
  opacity: 0;
}
.pr-back-enter-active,
.pr-back-leave-active {
  transition:
    opacity 0.24s ease,
    transform 0.24s ease;
}
.pr-back-enter-from,
.pr-back-leave-to {
  opacity: 0;
  transform: translateY(-8px);
}
</style>
