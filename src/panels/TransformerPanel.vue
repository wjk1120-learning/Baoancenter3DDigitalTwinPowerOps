<script setup lang="ts">
import { computed, onActivated, onBeforeUnmount, onDeactivated, onMounted, ref } from 'vue'
import { NSelect } from 'naive-ui'
import BaseChart from './BaseChart.vue'
import {
  fetchDeviceBriefsBySuper,
  fetchMeasurements,
  fetchSwitchingList,
  fetchSwitchingSupers,
} from '../api/device/device'

/**
 * 医院总览 · 主要设备监测面板（福永 TransformerPanel 同构，宝中重写）：
 * 严格三级联动 配电房(§1.3) → 箱柜(§1.6) → 测点设备(§1.8)，选中设备后 §1.11 测点实时值
 * 提取 A/B/C 相电压/电流六仪表。接口全部已有，无新契约条目。
 * 读数轮询 300s（与 §1.11 服务端 Redis 缓存周期对齐）；keep-alive 失活即停。
 */
interface NamedItem {
  id: number
  name: string
}

const switchings = ref<NamedItem[]>([])
const supers = ref<NamedItem[]>([])
const devices = ref<NamedItem[]>([])
const selectedSwitchingId = ref<number | ''>('')
const selectedSuperId = ref<number | ''>('')
const selectedDeviceId = ref<number | ''>('')
/** 六仪表读数：测点名 → 实时值（§1.11） */
const readings = ref<{ name: string; value: number }[] | null>(null)

const switchingPending = ref(true)
const superPending = ref(true)
const devicePending = ref(true)
const readingPending = ref(true)

const switchingOptions = computed(() =>
  switchings.value.map((t) => ({ value: t.id, label: t.name })),
)
const superOptions = computed(() => supers.value.map((c) => ({ value: c.id, label: c.name })))
const deviceOptions = computed(() => devices.value.map((d) => ({ value: d.id, label: d.name })))

/**
 * 六仪表：A/B/C 相电压 + A/B/C 相电流。
 * ⚠ 匹配口径（2026-11-25 联调实测）：后端 §1.11 measName 两套命名并存——CET 直采电表
 * 为英文代码（Ua/Ia/Pa…），部分设备为中文名（「A相电压」…）。前端按 code 优先、
 * 中文名兜底双向匹配（抽屉 PointCurveDrawer 同口径）；显示仍用中文（映射即本表）。
 * 缺测点的相按 0 展示，福永同口径。
 */
const MEAS_POINTS: { code: string; label: string }[] = [
  { code: 'Ua', label: 'A相电压' },
  { code: 'Ia', label: 'A相电流' },
  { code: 'Ub', label: 'B相电压' },
  { code: 'Ib', label: 'B相电流' },
  { code: 'Uc', label: 'C相电压' },
  { code: 'Ic', label: 'C相电流' },
]
const displayPoints = computed(() => {
  const pts = readings.value ?? []
  // 缺测（接口返回里没有该相测点）→ 默认 0（2026-11-26 用户口径，与点柜看板六项一致）
  const findVal = (code: string, label: string): number =>
    pts.find((p) => p.name === code)?.value ?? pts.find((p) => p.name === label)?.value ?? 0
  return readings.value
    ? MEAS_POINTS.map(({ code, label }) => ({ name: label, value: findVal(code, label) }))
    : []
})

function pointUnit(name: string): string {
  if (name.includes('电压')) return ' V'
  if (name.includes('电流')) return ' A'
  if (name.includes('温度')) return ' ℃'
  return ''
}

function pointGaugeOption(p: { name: string; value: number }) {
  const v = p.value
  const max = Math.max(Math.ceil((Math.max(Math.abs(v), 1) * 1.25) / 10) * 10, 10)
  const min = v < 0 ? -max : 0
  return {
    series: [
      {
        type: 'gauge',
        startAngle: 210,
        endAngle: -30,
        min,
        max,
        radius: '90%',
        center: ['50%', '58%'],
        progress: { show: true, width: 8, itemStyle: { color: '#2B7CE3' } },
        axisLine: { lineStyle: { width: 8, color: [[1, '#EAF3FB']] } },
        pointer: { show: true, length: '55%', width: 3, itemStyle: { color: '#174E93' } },
        axisTick: { distance: -10, length: 3, lineStyle: { color: '#D6E4F2' } },
        splitLine: { distance: -10, length: 8, lineStyle: { color: '#D6E4F2' } },
        axisLabel: { distance: 14, fontSize: 8, color: '#9AA7B8' },
        title: { show: false },
        detail: {
          valueAnimation: true,
          offsetCenter: [0, '80%'],
          fontSize: 15,
          fontWeight: 700,
          fontFamily: "'Source Han Sans SC', '思源黑体', 'Microsoft YaHei', sans-serif",
          color: '#174E93',
          formatter: `${v.toFixed(2)}${pointUnit(p.name)}`,
        },
        data: [{ value: v }],
      },
    ],
  }
}

function resetReadings() {
  readings.value = null
  readingPending.value = true
}

const switchingLoadSeq = ref(0)
const superLoadSeq = ref(0)
const deviceLoadSeq = ref(0)
const readingsSeq = ref(0)

/** §1.3 配电房列表：默认选中第一房并级联拉箱柜 */
async function loadSwitchings() {
  const seq = ++switchingLoadSeq.value
  try {
    const list = await fetchSwitchingList()
    if (seq !== switchingLoadSeq.value) return
    switchings.value = list.map((s) => ({ id: s.id, name: s.switchingName }))
    switchingPending.value = list.length === 0
    if (!list.length) {
      selectedSwitchingId.value = ''
      return
    }
    const cur = Number(selectedSwitchingId.value)
    if (!list.some((t) => t.id === cur)) {
      selectedSwitchingId.value = list[0]!.id
      selectedSuperId.value = ''
      selectedDeviceId.value = ''
      supers.value = []
      devices.value = []
      resetReadings()
    }
    await loadSupers()
  } catch {
    if (seq !== switchingLoadSeq.value) return
    switchings.value = []
    selectedSwitchingId.value = ''
    switchingPending.value = true
  }
}

/** §1.6 房下箱柜：默认选中第一柜并级联拉设备 */
async function loadSupers() {
  const switchingId = Number(selectedSwitchingId.value)
  const seq = ++superLoadSeq.value
  if (!switchingId) {
    supers.value = []
    selectedSuperId.value = ''
    superPending.value = true
    return
  }
  try {
    const list = await fetchSwitchingSupers(switchingId)
    if (seq !== superLoadSeq.value) return
    supers.value = list.map((s) => ({ id: s.id, name: s.superName }))
    superPending.value = list.length === 0
    if (!list.length) {
      selectedSuperId.value = ''
      devices.value = []
      selectedDeviceId.value = ''
      devicePending.value = true
      return
    }
    const cur = Number(selectedSuperId.value)
    if (!list.some((c) => c.id === cur)) {
      selectedSuperId.value = list[0]!.id
      selectedDeviceId.value = ''
      devices.value = []
      resetReadings()
    }
    await loadDevices()
  } catch {
    if (seq !== superLoadSeq.value) return
    supers.value = []
    selectedSuperId.value = ''
    superPending.value = true
  }
}

/** §1.8 柜下设备精简列表：默认选中第一台并拉读数 */
async function loadDevices() {
  const superId = Number(selectedSuperId.value)
  const seq = ++deviceLoadSeq.value
  if (!superId) {
    devices.value = []
    selectedDeviceId.value = ''
    devicePending.value = true
    return
  }
  try {
    const list = await fetchDeviceBriefsBySuper(superId)
    if (seq !== deviceLoadSeq.value || Number(selectedSuperId.value) !== superId) return
    devices.value = list.map((d) => ({ id: d.deviceId, name: d.deviceName }))
    devicePending.value = list.length === 0
    if (!list.length) {
      selectedDeviceId.value = ''
      resetReadings()
      return
    }
    const cur = Number(selectedDeviceId.value)
    if (!list.some((d) => d.deviceId === cur)) {
      selectedDeviceId.value = list[0]!.deviceId
      resetReadings()
    }
    await loadReadings()
  } catch {
    if (seq !== deviceLoadSeq.value) return
    devices.value = []
    selectedDeviceId.value = ''
    devicePending.value = true
  }
}

/** §1.11 测点实时值（服务端/客户端 300s 缓存） */
async function loadReadings() {
  const id = Number(selectedDeviceId.value)
  const seq = ++readingsSeq.value
  if (!id) {
    readings.value = null
    readingPending.value = true
    return
  }
  try {
    const meas = await fetchMeasurements(id)
    if (seq !== readingsSeq.value || Number(selectedDeviceId.value) !== id) return
    readings.value = meas.map((m) => ({ name: m.measName, value: Number(m.measVal) || 0 }))
    readingPending.value = meas.length === 0
  } catch {
    if (seq !== readingsSeq.value || Number(selectedDeviceId.value) !== id) return
    readings.value = null
    readingPending.value = true
  }
}

function setSwitching(v: number | null) {
  const id = v ?? ''
  if (id === selectedSwitchingId.value) return
  selectedSwitchingId.value = id
  selectedSuperId.value = ''
  selectedDeviceId.value = ''
  supers.value = []
  devices.value = []
  resetReadings()
  void loadSupers()
}
function setSuper(v: number | null) {
  const id = v ?? ''
  if (id === selectedSuperId.value) return
  selectedSuperId.value = id
  selectedDeviceId.value = ''
  devices.value = []
  resetReadings()
  void loadDevices()
}
function setDevice(v: number | null) {
  const id = v ?? ''
  if (id === selectedDeviceId.value) return
  selectedDeviceId.value = id
  resetReadings()
  void loadReadings()
}

/** 读数轮询 300s（与 §1.11 缓存周期对齐；keep-alive 失活即停） */
const READINGS_POLL_MS = 300 * 1000
let pollTimer: number | null = null
function startPoll() {
  stopPoll()
  pollTimer = window.setInterval(() => {
    if (Number(selectedDeviceId.value)) void loadReadings()
  }, READINGS_POLL_MS)
}
function stopPoll() {
  if (pollTimer != null) {
    window.clearInterval(pollTimer)
    pollTimer = null
  }
}

onMounted(() => {
  void loadSwitchings()
  startPoll()
})
onActivated(() => {
  startPoll()
  if (Number(selectedDeviceId.value)) void loadReadings()
})
onDeactivated(stopPoll)
onBeforeUnmount(stopPoll)

/** 空态提示链（照福永，接口号换宝中契约号） */
const pendingHint = computed(() => {
  if (switchingPending.value) return '暂无配电房（接口 §1.3）'
  if (superPending.value) return '该配电房下暂无箱柜（接口 §1.6）'
  if (devicePending.value) return '该箱柜下暂无测点设备（接口 §1.8）'
  if (readingPending.value) return '暂无三相电压/电流读数（接口 §1.11）'
  return ''
})
</script>

<template>
  <div class="transformer">
    <div class="controls">
      <NSelect
        class="ctrl"
        :value="selectedSwitchingId === '' ? null : selectedSwitchingId"
        :options="switchingOptions"
        :placeholder="switchingPending ? '暂无配电房' : '选择配电房'"
        size="small"
        :show-checkmark="false"
        :consistent-menu-width="false"
        :menu-props="{ style: { minWidth: 'max-content' } }"
        @update:value="setSwitching"
      />
      <NSelect
        class="ctrl"
        :value="selectedSuperId === '' ? null : selectedSuperId"
        :options="superOptions"
        :placeholder="superPending ? '暂无箱柜' : '选择箱柜'"
        size="small"
        :show-checkmark="false"
        :consistent-menu-width="false"
        :menu-props="{ style: { minWidth: 'max-content' } }"
        @update:value="setSuper"
      />
      <NSelect
        class="ctrl"
        :value="selectedDeviceId === '' ? null : selectedDeviceId"
        :options="deviceOptions"
        :placeholder="devicePending ? '暂无测点设备' : '选择测点设备'"
        size="small"
        :show-checkmark="false"
        :consistent-menu-width="false"
        :menu-props="{ style: { minWidth: 'max-content' } }"
        @update:value="setDevice"
      />
    </div>

    <p v-if="pendingHint" class="pending-hint">{{ pendingHint }}</p>

    <div v-if="displayPoints.length && !readingPending" class="gauges">
      <div v-for="p in displayPoints" :key="p.name" class="gauge-box">
        <BaseChart :option="pointGaugeOption(p)" />
        <span class="g-name" :title="p.name">{{ p.name }}</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.transformer {
  height: 100%;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.controls {
  display: flex;
  gap: 6px;
  flex: none;
  min-width: 0;
  align-items: center;
}
.ctrl {
  flex: 1 1 0;
  min-width: 0;
}
.pending-hint {
  margin: 0;
  font-size: 13px;
  color: var(--muted);
  text-align: center;
  padding: 12px 0;
}
.gauges {
  flex: 1;
  min-height: 0;
  display: grid;
  grid-template-columns: 1fr 1fr;
  grid-template-rows: repeat(3, minmax(0, 1fr));
  gap: 6px;
}
.gauge-box {
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
}
.gauge-box :deep(.base-chart) {
  flex: 1;
  min-height: 0;
  width: 100%;
}
.g-name {
  flex: none;
  font-size: 11px;
  color: var(--muted);
  white-space: nowrap;
}
</style>
