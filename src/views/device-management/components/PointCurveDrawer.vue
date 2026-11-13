<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { EChartsOption } from 'echarts'
import BaseChart from '../../../panels/BaseChart.vue'
import type { DeviceDetail } from '../../../api/device/types'
import { fetchMeasurements } from '../../../api/device/device'
import { fetchCetDataTypes } from '../../../api/configuration/configuration'
import type { CetDataType } from '../../../api/configuration/types'
import { fetchDeviceParamCurve } from '../../../api/energy/energy'
import type { ParamCurvePeriod } from '../../../api/energy/energy'
import type { Datalog } from '../../../api/energy/types'
import { chartColors, withAlpha } from '../../../config/chartColors'

/**
 * 测点曲线抽屉 PointCurveDrawer（4.2④ 曲线改版，由 PointAlarmDrawer 更名：告警区已移除）。
 * 电能参数列表（§5.33 字典驱动 + §1.11 实时值）+ 电能参数趋势曲线
 * （§2.9，今日/近7天/近30天，样式见 docs/design/测点曲线抽屉设计稿.html），按需请求。
 * 左栏只列字典参数（全部可出曲线），实时值按 typeName ↔ measName 名称匹配附上；
 * 任意勾选（不限单位）：不同单位各挂一条 Y 轴（第 1 组靠左，其余靠右依次偏移）。
 * 抽屉关闭即清状态。
 */
const props = defineProps<{ device: DeviceDetail | null }>()
const emit = defineEmits<{ close: [] }>()

/** 曲线序列色（DESIGN.md §5 分类序列，纯颜色区分，第 5 条起循环） */
const SERIES_PALETTE = [
  chartColors.primary,
  chartColors.teal,
  chartColors.auxBlue,
  chartColors.primary700,
]

/** typeCode → 单位（§5.33 字典无单位字段，前端维护；新增未知 code 自成一组、仅可单独勾选） */
const UNIT_BY_CODE: Record<string, string> = {
  Ia: 'A',
  Ib: 'A',
  Ic: 'A',
  Pa: 'kW',
  Pb: 'kW',
  Pc: 'kW',
  Pfs: '',
  PEsum: 'kWh',
}
function unitOf(code: string): string {
  return UNIT_BY_CODE[code] ?? ''
}
const params = ref<CetDataType[]>([])
const dictLoading = ref(false)
const dictError = ref(false)
/** §1.11 实时值：measName → measVal（typeName 全等匹配；§1.11 失败时全部「暂无」，不阻塞勾选） */
const measMap = ref<Record<string, number>>({})
const keyword = ref('')
const checkedCodes = ref<string[]>([])
const period = ref<ParamCurvePeriod>('today')
const curveRows = ref<Datalog[]>([])
const curveLoading = ref(false)
const curveError = ref(false)
/** §2.9 cacheTs → 「更新于 HH:mm」 */
const updatedAt = ref('')

interface Row extends CetDataType {
  unit: string
  value: number | null
  checked: boolean
}

const filteredRows = computed<Row[]>(() => {
  const kw = keyword.value.trim().toLowerCase()
  return params.value
    .filter(
      (p) => !kw || p.typeName.toLowerCase().includes(kw) || p.typeCode.toLowerCase().includes(kw),
    )
    .map((p) => ({
      ...p,
      unit: unitOf(p.typeCode),
      value: measMap.value[p.typeName] ?? null,
      checked: checkedCodes.value.includes(p.typeCode),
    }))
})

/** 已勾选参数（按字典顺序 = 曲线序列顺序） */
const checkedParams = computed<CetDataType[]>(() =>
  params.value.filter((p) => checkedCodes.value.includes(p.typeCode)),
)

function formatVal(v: number | null): string {
  if (v == null || !Number.isFinite(v)) return '暂无'
  const abs = Math.abs(v)
  if (abs >= 100) return v.toFixed(1)
  return String(Number(v.toFixed(2)))
}

function rowTip(row: Row): string {
  const unitLabel = row.unit || '无量纲'
  if (row.checked) return `${row.typeName}（${row.typeCode}），单位 ${unitLabel}，已出曲线`
  const miss = row.value == null ? '；该设备测点明细暂无此参数实时值' : ''
  return `${row.typeName}（${row.typeCode}），单位 ${unitLabel}，勾选后出曲线${miss}`
}

function onToggle(p: CetDataType, e: Event) {
  const on = (e.target as HTMLInputElement).checked
  checkedCodes.value = on
    ? [...checkedCodes.value, p.typeCode]
    : checkedCodes.value.filter((c) => c !== p.typeCode)
  void loadCurve()
}

function setPeriod(e: Event) {
  const v = (e.target as HTMLInputElement).value as ParamCurvePeriod
  if (v === period.value) return
  period.value = v
  void loadCurve()
}

async function loadCurve() {
  const d = props.device
  if (!d) return
  const sel = checkedParams.value
  if (!sel.length) {
    curveRows.value = []
    curveError.value = false
    updatedAt.value = ''
    return
  }
  curveLoading.value = true
  curveError.value = false
  try {
    const res = await fetchDeviceParamCurve(
      d.deviceId,
      period.value,
      sel.map((p) => p.dataId).join(','),
    )
    curveRows.value = res?.resultList ?? []
    updatedAt.value = res ? fmtHm(res.cacheTs) : ''
  } catch {
    curveRows.value = []
    curveError.value = true
    updatedAt.value = ''
  } finally {
    curveLoading.value = false
  }
}

async function retryDict() {
  dictLoading.value = true
  try {
    params.value = await fetchCetDataTypes()
    dictError.value = false
    checkedCodes.value = params.value[0] ? [params.value[0].typeCode] : []
  } catch {
    params.value = []
    dictError.value = true
    checkedCodes.value = []
  } finally {
    dictLoading.value = false
  }
  void loadCurve()
}

function fmtHm(epochSec: number): string {
  if (!Number.isFinite(epochSec) || epochSec <= 0) return ''
  const d = new Date(epochSec * 1000)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${p(d.getHours())}:${p(d.getMinutes())}`
}

/** 滑条两端起止时间（常显 HTML 标签；ECharts 自带标签 hover 才显示且会被画布裁掉，弃用） */
const zoomStartLabel = ref('')
const zoomEndLabel = ref('')

/** 当前曲线的时间轴并集（毫秒升序），滑条标签按它复位 */
const curveTimes = computed<number[]>(() => {
  const set = new Set<number>()
  for (const row of curveRows.value) {
    const t = new Date(row.LogTime).getTime()
    if (Number.isFinite(t)) set.add(t)
  }
  return [...set].sort((a, b) => a - b)
})

watch(curveTimes, (times) => {
  if (!times.length) {
    zoomStartLabel.value = ''
    zoomEndLabel.value = ''
    return
  }
  zoomStartLabel.value = fmtZoomLabel(times[0]!)
  zoomEndLabel.value = fmtZoomLabel(times[times.length - 1]!)
})

/** 拖动滑条时按百分比换算窗口起止，同步刷新两端标签 */
function onChartZoom(params: unknown) {
  const times = curveTimes.value
  if (times.length < 2) return
  const { start = 0, end = 100 } = (params ?? {}) as { start?: number; end?: number }
  const first = times[0]!
  const last = times[times.length - 1]!
  zoomStartLabel.value = fmtZoomLabel(first + ((last - first) * start) / 100)
  zoomEndLabel.value = fmtZoomLabel(first + ((last - first) * end) / 100)
}

/** dataZoom 两端起止时间标签格式（yyyy-MM-dd HH:mm，直观显示当前窗口范围） */
function fmtZoomLabel(ms: number): string {
  const d = new Date(ms)
  const p = (n: number) => String(n).padStart(2, '0')
  return (
    `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}` +
    ` ${p(d.getHours())}:${p(d.getMinutes())}`
  )
}

/** 时间轴刻度模板（ECharts 内置占位符，避免 formatter 入参在 5/6 版本间的差异） */
function tickTemplate(): string {
  return period.value === 'today' ? '{HH}:{mm}' : '{M}/{d}'
}

/** 曲线配置：LogTime 并集作时间轴，缺点为 null 断线；末端标最新值（labelLayout 防重叠） */
const chartOption = computed<EChartsOption | null>(() => {
  const sel = checkedParams.value
  if (!sel.length || !curveRows.value.length) return null
  const byId = new Map<number, Map<number, number>>()
  for (const row of curveRows.value) {
    const t = new Date(row.LogTime).getTime()
    if (!Number.isFinite(t)) continue
    let m = byId.get(row.DataID)
    if (!m) {
      m = new Map()
      byId.set(row.DataID, m)
    }
    m.set(t, row.Value)
  }
  const times = curveTimes.value
  if (!times.length) return null

  // 不同单位各挂一条 Y 轴：第 1 组靠左，其余靠右依次偏移 44px
  const unitOrder: string[] = []
  for (const p of sel) {
    const u = unitOf(p.typeCode)
    if (!unitOrder.includes(u)) unitOrder.push(u)
  }
  const axisIndex = (u: string) => unitOrder.indexOf(u)
  const yAxes = unitOrder.map((u, i) => ({
    type: 'value' as const,
    scale: true,
    name: u || undefined,
    position: (i === 0 ? 'left' : 'right') as 'left' | 'right',
    offset: i === 0 ? 0 : (i - 1) * 44,
    nameTextStyle: { color: chartColors.muted, fontSize: 11 },
    axisLine: { show: i > 0, lineStyle: { color: chartColors.borderStrong } },
    axisTick: { show: false },
    axisLabel: { color: chartColors.muted, fontSize: 11 },
    splitLine: { show: i === 0, lineStyle: { color: chartColors.border } },
  }))

  const series = sel.map((p, i) => {
    const m = byId.get(p.dataId)
    const color = SERIES_PALETTE[i % SERIES_PALETTE.length]!
    return {
      type: 'line' as const,
      name: p.typeName,
      yAxisIndex: axisIndex(unitOf(p.typeCode)),
      smooth: 0.2,
      symbol: 'none' as const,
      connectNulls: false,
      data: times.map((t) => {
        const v = m?.get(t)
        return [t, v == null ? null : v] as [number, number | null]
      }),
      itemStyle: { color },
      lineStyle: { color, width: 2 },
      areaStyle: sel.length === 1 ? { color: withAlpha(color, 0.2) } : undefined,
    }
  })

  // tooltip 按各系列自己的单位标注数值
  const unitBySeries = new Map(sel.map((p) => [p.typeName, unitOf(p.typeCode)]))

  return {
    color: SERIES_PALETTE,
    tooltip: {
      trigger: 'axis',
      confine: true,
      formatter: (params: unknown) => {
        const list = (Array.isArray(params) ? params : [params]) as Array<{
          axisValue?: unknown
          marker?: string
          seriesName?: string
          value?: unknown
        }>
        const first = list[0]
        const header =
          typeof first?.axisValue === 'number' ? fmtZoomLabel(first.axisValue) : ''
        const lines = list.map((q) => {
          const u = unitBySeries.get(q.seriesName ?? '') ?? ''
          // [时间戳, 值] 坐标对数据的 value 是整个数组，取第二位才是数值
          const raw = q.value
          const v = Array.isArray(raw) ? raw[1] : raw
          return `${q.marker ?? ''}${q.seriesName ?? ''} ${v == null ? '—' : v}${u ? ' ' + u : ''}`
        })
        return [header, ...lines].join('<br/>')
      },
    },
    legend: {
      type: 'scroll',
      top: 0,
      // 少量图例居中；多到会溢出时切定宽盒子，scroll 按整条目翻页、不折行
      ...(checkedParams.value.length <= 4
        ? { left: 'center' as const }
        : { left: 12 as const, right: 12 as const }),
      itemWidth: 18,
      itemGap: 12,
      textStyle: { color: chartColors.muted, fontSize: 12 },
      pageIconColor: chartColors.primary700,
      pageIconInactiveColor: chartColors.borderStrong,
      pageTextStyle: { color: chartColors.muted, fontSize: 11 },
    },
    grid: {
      left: 46,
      right: 48 + Math.max(0, unitOrder.length - 1) * 44,
      // 顶部留足：图例行与各轴顶部的单位名分层，不互相叠压
      top: 58,
      bottom: 64,
    },
    xAxis: {
      type: 'time',
      axisLine: { lineStyle: { color: chartColors.borderStrong } },
      axisLabel: {
        color: chartColors.muted,
        fontSize: 11,
        hideOverlap: true,
        formatter: tickTemplate(),
      },
    },
    yAxis: yAxes,
    dataZoom: [
      {
        type: 'slider',
        height: 32,
        bottom: 0,
        borderColor: chartColors.border,
        fillerColor: withAlpha(chartColors.primary, 0.14),
        handleStyle: { color: '#ffffff', borderColor: chartColors.borderStrong },
        left: 132,
        right: 132,
        labelFormatter: () => '',
        brushSelect: false,
      },
    ],
    series,
  }
})

function onEsc(e: KeyboardEvent) {
  if (e.key === 'Escape') emit('close')
}

async function loadAll(deviceId: number) {
  dictLoading.value = true
  try {
    params.value = await fetchCetDataTypes()
    dictError.value = false
  } catch {
    params.value = []
    dictError.value = true
  } finally {
    dictLoading.value = false
  }
  checkedCodes.value = params.value[0] ? [params.value[0].typeCode] : []

  try {
    const list = await fetchMeasurements(deviceId)
    measMap.value = Object.fromEntries(list.map((m) => [m.measName, m.measVal]))
  } catch {
    measMap.value = {}
  }
  void loadCurve()
}

watch(
  () => props.device,
  (d) => {
    if (d) {
      params.value = []
      measMap.value = {}
      keyword.value = ''
      checkedCodes.value = []
      period.value = 'today'
      curveRows.value = []
      curveError.value = false
      updatedAt.value = ''
      void loadAll(d.deviceId)
      window.addEventListener('keydown', onEsc)
    } else {
      window.removeEventListener('keydown', onEsc)
    }
  },
  { immediate: true },
)
</script>

<template>
  <Teleport to="body">
    <Transition name="ad-drawer">
      <div v-if="props.device" class="ad-drawer-mask" @click.self="emit('close')">
        <aside
          class="ad-drawer"
          role="dialog"
          aria-modal="true"
          :aria-label="`${props.device.deviceName} 测点详情`"
        >
          <header class="ad-drawer-head">
            <div class="card-title">{{ props.device.deviceName }} 测点详情</div>
            <button type="button" class="ad-x" aria-label="关闭" @click="emit('close')">×</button>
          </header>
          <div class="ad-drawer-body">
            <!-- 左栏：电能参数（§5.33 字典驱动 + §1.11 实时值） -->
            <section class="left">
              <div class="pane-title">电能参数 · 实时测点值</div>
              <input
                v-model="keyword"
                class="search"
                type="search"
                placeholder="搜索参数名称"
                aria-label="搜索参数名称"
              />
              <div class="meas-list">
                <div v-if="dictLoading" class="skel-list" aria-hidden="true">
                  <div v-for="i in 6" :key="i" class="skel-row">
                    <span class="skel-check"></span
                    ><span class="skel" :class="i % 2 ? 'w80' : 'w60'"></span>
                  </div>
                </div>
                <div v-else-if="dictError" class="dict-err">
                  <div class="state-msg err">参数字典（§5.33）加载失败，曲线不可用</div>
                  <button type="button" class="btn" @click="retryDict">重试</button>
                </div>
                <template v-else-if="filteredRows.length">
                  <label
                    v-for="row in filteredRows"
                    :key="row.typeCode"
                    class="row"
                    :class="{ on: row.checked }"
                    :title="rowTip(row)"
                  >
                    <input
                      type="checkbox"
                      class="row-check"
                      :checked="row.checked"
                      @change="onToggle(row, $event)"
                    />
                    <span class="row-name" :title="row.typeName">{{ row.typeName }}</span>
                    <span class="row-code">{{ row.typeCode }}</span>
                    <span class="row-val mono" :class="{ none: row.value == null }">
                      {{ formatVal(row.value)
                      }}<span v-if="row.unit && row.value != null" class="u"> {{ row.unit }}</span>
                    </span>
                  </label>
                </template>
                <div v-else class="state-msg">无匹配参数</div>
              </div>
            </section>

            <!-- 右栏：电能参数趋势（§2.9） -->
            <section class="right">
              <div class="right-head">
                <div class="pane-title">电能参数趋势</div>
                <div class="seg" role="radiogroup" aria-label="筛选周期">
                  <input
                    id="adp-today"
                    type="radio"
                    value="today"
                    :checked="period === 'today'"
                    @change="setPeriod"
                  /><label class="seg-label" for="adp-today">今日</label>
                  <input
                    id="adp-7d"
                    type="radio"
                    value="7d"
                    :checked="period === '7d'"
                    @change="setPeriod"
                  /><label class="seg-label" for="adp-7d">近7天</label>
                  <input
                    id="adp-30d"
                    type="radio"
                    value="30d"
                    :checked="period === '30d'"
                    @change="setPeriod"
                  /><label class="seg-label" for="adp-30d">近30天</label>
                </div>
                <span v-if="updatedAt && !curveLoading && !curveError" class="refreshed">
                  更新于 {{ updatedAt }}
                </span>
              </div>

              <div class="chart-card">
                <div class="chart-box">
                  <BaseChart
                    v-if="chartOption"
                    :option="chartOption"
                    class="chart"
                    @datazoom="onChartZoom"
                  />
                  <span v-if="zoomStartLabel" class="zoom-time l mono">{{ zoomStartLabel }}</span>
                  <span v-if="zoomEndLabel" class="zoom-time r mono">{{ zoomEndLabel }}</span>
                  <div v-if="curveLoading" class="chart-overlay">曲线加载中…</div>
                  <div v-else-if="curveError" class="chart-overlay">
                    <div class="state-msg err">曲线加载失败</div>
                    <button type="button" class="btn" @click="loadCurve">重试</button>
                  </div>
                  <div v-else-if="!checkedCodes.length" class="chart-overlay">
                    勾选左侧参数查看趋势曲线
                  </div>
                  <div v-else-if="!chartOption" class="chart-overlay">
                    所选参数在当前周期暂无曲线记录
                  </div>
                </div>
              </div>
            </section>
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
  width: min(1080px, 94vw);
  background: linear-gradient(165deg, rgba(255, 255, 255, 0.96), rgba(245, 250, 255, 0.94));
  border-left: 1px solid rgba(255, 255, 255, 0.95);
  box-shadow: -12px 0 40px rgba(43, 108, 160, 0.18);
  display: flex;
  flex-direction: column;
  padding: 18px 20px 20px;
}
.ad-drawer-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
  flex: none;
}
.card-title {
  font-size: 18px;
  font-weight: 700;
  color: var(--title);
  position: relative;
  padding-left: 12px;
  flex: 1;
  min-width: 0;
  line-height: 1.35;
  word-break: break-word;
}
.card-title::before {
  content: '';
  position: absolute;
  left: 0;
  top: 0.35em;
  transform: none;
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
  display: flex;
  gap: 16px;
}

/* 区块标题（蓝条） */
.pane-title {
  font-size: 15px;
  font-weight: 700;
  color: var(--title);
  position: relative;
  padding-left: 12px;
  flex: none;
}
.pane-title::before {
  content: '';
  position: absolute;
  left: 0;
  top: 50%;
  transform: translateY(-50%);
  width: 3px;
  height: 14px;
  background: var(--primary);
  border-radius: 2px;
}

/* ============ 左栏 ============ */
.left {
  flex: none;
  width: 288px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-height: 0;
}
.search {
  flex: none;
  width: 100%;
  height: 32px;
  padding: 0 10px;
  font-family: inherit;
  font-size: 13px;
  color: var(--text);
  background: var(--panel-solid);
  border: 1px solid var(--border);
  border-radius: 8px;
}
.search::placeholder {
  color: var(--muted);
}
.search:focus {
  border-color: var(--primary);
  box-shadow: 0 0 0 3px var(--primary-100);
  outline: none;
}
.meas-list {
  flex: 1;
  min-height: 0;
  overflow: auto;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.7);
}
.row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 0 10px;
  min-height: 37px;
  border-bottom: 1px solid var(--border);
  cursor: pointer;
}
.row:last-child {
  border-bottom: none;
}
.row:hover {
  background: rgba(43, 124, 227, 0.05);
}
.row-check {
  flex: none;
  width: 15px;
  height: 15px;
  accent-color: var(--primary);
  cursor: pointer;
}
.row-check:disabled {
  cursor: not-allowed;
}
.row-name {
  flex: 1;
  min-width: 0;
  font-size: 13px;
  font-weight: 600;
  color: var(--muted);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.row.on .row-name {
  color: var(--title);
}
.row.on {
  background: var(--primary-50);
  box-shadow: inset 2px 0 0 var(--primary);
}
.row-code {
  flex: none;
  font-family: var(--font-mono);
  font-size: 11px;
  color: var(--muted);
}
.row-val {
  flex: none;
  font-weight: 700;
  color: var(--title);
}
.row-val.none {
  color: var(--muted);
  font-weight: 400;
}
.row-val .u {
  margin-left: 3px;
  font-weight: 400;
  font-size: 11px;
  color: var(--muted);
}
/* 骨架行 */
.skel-list {
  padding: 8px 10px;
  display: flex;
  flex-direction: column;
  gap: 14px;
}
.skel-row {
  display: flex;
  align-items: center;
  gap: 8px;
}
.skel-check {
  width: 15px;
  height: 15px;
  flex: none;
  border-radius: 3px;
  background: var(--primary-100);
}
.skel {
  height: 12px;
  border-radius: 4px;
  background: var(--primary-100);
  opacity: 0.7;
}
.skel.w60 {
  width: 60%;
}
.skel.w80 {
  width: 80%;
}

/* 字典失败 / 空态 */
.dict-err {
  padding: 14px 12px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  align-items: center;
}
.state-msg {
  padding: 16px 12px;
  text-align: center;
  font-size: 13px;
  color: var(--muted);
  background: rgba(196, 218, 240, 0.3);
  border-radius: 8px;
  width: 100%;
}
.state-msg.err {
  color: var(--danger-text);
  background: rgba(229, 72, 77, 0.08);
}
.btn {
  padding: 5px 18px;
  font-family: inherit;
  font-size: 13px;
  font-weight: 600;
  color: var(--primary-700);
  background: transparent;
  border: 1px solid var(--primary);
  border-radius: 8px;
  cursor: pointer;
}
.btn:hover {
  background: var(--primary-50);
}
.btn:active {
  background: var(--primary-100);
}

/* ============ 右栏 ============ */
.right {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-height: 0;
}
.right-head {
  display: flex;
  align-items: center;
  gap: 12px;
  flex: none;
}
.seg {
  display: inline-flex;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--panel-solid);
  overflow: hidden;
}
.seg input {
  position: absolute;
  opacity: 0;
  pointer-events: none;
}
.seg-label {
  display: inline-block;
  padding: 5px 14px;
  font-size: 13px;
  color: var(--muted);
  cursor: pointer;
}
.seg-label:hover {
  color: var(--title);
}
.seg input:checked + .seg-label {
  background: var(--primary-700);
  color: var(--on-primary);
  font-weight: 600;
}
.seg input:focus-visible + .seg-label {
  outline: 2px solid var(--primary-700);
  outline-offset: -2px;
}
.refreshed {
  margin-left: auto;
  font-size: 12px;
  color: var(--muted);
  white-space: nowrap;
}
.chart-card {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--panel-solid);
  padding: 10px 8px 8px;
}
.chart-box {
  flex: 1;
  min-height: 0;
  position: relative;
}
.chart {
  width: 100%;
  height: 100%;
}
.zoom-time {
  position: absolute;
  bottom: 8px;
  font-size: 11px;
  font-weight: 600;
  color: var(--title);
  pointer-events: none;
  white-space: nowrap;
}
.zoom-time.l {
  left: 6px;
}
.zoom-time.r {
  right: 6px;
}
.chart-overlay {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  gap: 10px;
  align-items: center;
  justify-content: center;
  font-size: 13px;
  color: var(--muted);
  pointer-events: none;
}
.chart-overlay .btn,
.chart-overlay .state-msg {
  pointer-events: auto;
}
.chart-overlay .btn {
  align-self: center;
}

.mono {
  font-family: var(--font-mono);
  font-size: 13px;
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
