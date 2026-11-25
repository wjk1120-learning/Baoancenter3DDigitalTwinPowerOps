<script setup lang="ts">
import { computed, onActivated, onDeactivated, onUnmounted, ref } from 'vue'
import { fetchDeviceCount } from '../api/device/device'
import { fetchEnergyToday, fetchEnergyYesterday } from '../api/energy/energy'
import type { EnergyDailyStats, EnergyTodayStats } from '../api/energy/types'

/**
 * 医院总览 · 能源运营总览面板（福永 EnergyOverviewPanel 同构，宝中重写）：
 * 2×2 KPI 卡（今日用电量/碳排放量/总设备数/昨日用电量）。数据自拉：
 * §2.1 今日能耗（全院合计 = 分楼栋求和）+ §2.2 昨日能耗（全院行）+ §1.1 总设备数。
 * 轮询 10 分钟（契约口径"原 /ws/energy 推送已取消，前端定时轮询"）；keep-alive 失活即停。
 * 环比角标只在「今日用电量/碳排放量」两卡：今日 vs 昨日（§2.2 全院行为基数）。
 */
const todayStats = ref<EnergyTodayStats | null>(null)
const yesterdayList = ref<EnergyDailyStats[]>([])
const deviceCount = ref<number | null>(null)

const ENERGY_POLL_MS = 10 * 60 * 1000
let pollTimer: number | null = null

async function load() {
  const [today, yesterday, count] = await Promise.all([
    fetchEnergyToday().catch(() => null),
    fetchEnergyYesterday().catch(() => [] as EnergyDailyStats[]),
    fetchDeviceCount().catch(() => null),
  ])
  todayStats.value = today
  yesterdayList.value = yesterday
  deviceCount.value = count
}

function startPoll() {
  stopPoll()
  void load()
  pollTimer = window.setInterval(() => void load(), ENERGY_POLL_MS)
}
function stopPoll() {
  if (pollTimer != null) {
    window.clearInterval(pollTimer)
    pollTimer = null
  }
}
// 只挂 onActivated：keep-alive 组件首次挂载时 activated 也会触发，onMounted+onActivated
// 双挂会首屏双发请求（2026-11-25 联调实测 count/today/yesterday 各重复一次）；失活即停。
onActivated(startPoll)
onDeactivated(stopPoll)
onUnmounted(stopPoll)

/** 全院今日用电/碳排：优先取 buildingStats 的「全院」键（后端权威合计，2026-11-16 真实样例
 *  确认该键存在且可能不等于楼栋求和）；缺失时回退"跳过全院键的楼栋求和"。 */
const CAMPUS_KEY = '全院'
function campusStatOf(s: EnergyTodayStats, field: 'energyKwh' | 'carbonKg'): number | null {
  const campus = s.buildingStats[CAMPUS_KEY]
  if (campus && typeof campus[field] === 'number') return campus[field] as number
  let sum = 0
  let has = false
  for (const [name, stat] of Object.entries(s.buildingStats)) {
    if (name === CAMPUS_KEY) continue
    const v = stat[field]
    if (typeof v === 'number') {
      sum += v
      has = true
    }
  }
  return has ? sum : null
}
const sumTodayKwh = computed<number | null>(() => {
  const s = todayStats.value
  if (!s) return null
  return campusStatOf(s, 'energyKwh')
})
const sumTodayCarbonKg = computed<number | null>(() => {
  const s = todayStats.value
  if (!s) return null
  return campusStatOf(s, 'carbonKg')
})
const yesterdayKwh = computed(() => yesterdayList.value[0]?.energyKwh ?? null)
const yesterdayCarbonKg = computed(() => yesterdayList.value[0]?.carbonKg ?? null)

const fmt = (n: number) => Math.round(n).toLocaleString('en-US')

type KpiKind = 'elec' | 'carbon' | 'devices' | 'power'

interface KpiCard {
  kind: KpiKind
  label: string
  text: string
  ready: boolean
  /** 环比变化（%，正=涨）；null 不显示角标。仅 elec/carbon 两卡有 */
  change: number | null
  hero: boolean
  unit?: string
}

function changeOf(cur: number | null, base: number | null): number | null {
  if (cur == null || base == null || base <= 0) return null
  return ((cur - base) / base) * 100
}

const kpis = computed<KpiCard[]>(() => {
  const todayKwh = sumTodayKwh.value
  const todayCarbonT = sumTodayCarbonKg.value == null ? null : sumTodayCarbonKg.value / 1000
  return [
    {
      kind: 'elec',
      label: '今日用电量',
      text: todayKwh == null ? '--' : fmt(todayKwh),
      ready: todayKwh != null,
      change: changeOf(todayKwh, yesterdayKwh.value),
      hero: false,
      unit: 'kWh',
    },
    {
      kind: 'carbon',
      label: '碳排放量',
      text: todayCarbonT == null ? '--' : todayCarbonT.toFixed(1),
      ready: todayCarbonT != null,
      change: changeOf(todayCarbonT == null ? null : todayCarbonT * 1000, yesterdayCarbonKg.value),
      hero: false,
      unit: 't',
    },
    {
      kind: 'devices',
      label: '总设备数',
      text: deviceCount.value == null ? '--' : fmt(deviceCount.value),
      ready: deviceCount.value != null,
      change: null,
      hero: false,
      unit: '台',
    },
    {
      kind: 'power',
      label: '昨日用电量',
      text: yesterdayKwh.value == null ? '--' : fmt(yesterdayKwh.value),
      ready: yesterdayKwh.value != null,
      change: null,
      hero: true,
      unit: 'kWh',
    },
  ]
})

function trendClass(k: KpiCard): string {
  if (k.change === null) return ''
  return k.change >= 0 ? 'bad' : 'good'
}
const trendText = (k: KpiCard) =>
  k.change === null ? '' : `${k.change >= 0 ? '↑' : '↓'}${Math.abs(k.change).toFixed(1)}%`
</script>

<template>
  <div class="energy-overview">
    <div class="grid">
      <div v-for="k in kpis" :key="k.kind" class="kpi" :class="[k.kind, { hero: k.hero }]">
        <span class="kpi-bar" />

        <div class="kpi-top">
          <span class="kpi-icon">
            <svg viewBox="0 0 24 24" width="12" height="12" fill="currentColor" aria-hidden="true">
              <path v-if="k.kind === 'elec'" d="M13 2 3 14h7l-1 8 10-12h-7l1-8z" />
              <path
                v-else-if="k.kind === 'carbon'"
                d="M12 2a6 6 0 0 0-6 6c0 3 2 5 4 6-2 1-4 3-4 6a6 6 0 0 0 12 0c0-3-2-5-4-6 2-1 4-3 4-6a6 6 0 0 0-6-6z"
              />
              <path
                v-else-if="k.kind === 'devices'"
                d="M4 6h16M4 6v10a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V6M4 6l2-3h12l2 3M9 12h6"
              />
              <path v-else d="M13 2 3 14h7l-1 8 10-12h-7l1-8z" />
            </svg>
          </span>
          <span class="kpi-label">{{ k.label }}</span>
        </div>

        <div class="kpi-value-row">
          <span class="kpi-value">{{ k.text }}</span>
          <span v-if="k.unit && k.ready" class="kpi-unit">{{ k.unit }}</span>
        </div>

        <div class="kpi-bottom">
          <span v-if="k.ready && k.change !== null" class="kpi-pill" :class="trendClass(k)">{{
            trendText(k)
          }}</span>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.energy-overview {
  height: 100%;
  min-height: 0;
}
.grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  grid-template-rows: 1fr 1fr;
  gap: 16px;
  height: 100%;
  min-height: 0;
}
.kpi {
  --accent: #2b7ce3;
  --accent-light: #5295e8;
  position: relative;
  min-height: 0;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  padding: 14px 16px;
  border-radius: 16px;
}
.kpi-bar {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 2px;
}
.kpi.hero .kpi-bar {
  height: 3px;
}
.kpi.elec .kpi-bar {
  background: linear-gradient(90deg, #2b7ce3, #5295e8);
}
.kpi.carbon .kpi-bar {
  background: linear-gradient(90deg, #2fa36b, #52c58f);
}
.kpi.devices .kpi-bar {
  background: linear-gradient(90deg, #4a5fd6, #6c7df5);
}
.kpi.power .kpi-bar {
  background: linear-gradient(90deg, #2b7ce3, #17a2b8);
}
.kpi.elec {
  --accent: #2b7ce3;
  --accent-light: #5295e8;
}
.kpi.carbon {
  --accent: #2fa36b;
  --accent-light: #52c58f;
}
.kpi.devices {
  --accent: #4a5fd6;
  --accent-light: #6c7df5;
}
.kpi.power {
  --accent: #2b7ce3;
  --accent-light: #17a2b8;
}
.kpi-top {
  display: flex;
  align-items: center;
  gap: 6px;
}
.kpi-icon {
  width: 20px;
  height: 20px;
  border-radius: 6px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  background: linear-gradient(135deg, var(--accent), var(--accent-light));
  box-shadow: 0 2px 6px rgba(43, 108, 160, 0.16);
}
.kpi-label {
  font-size: 14px;
  font-weight: 500;
  color: var(--muted);
  white-space: nowrap;
}
.kpi-bottom {
  display: flex;
  min-height: 18px;
}
.kpi-pill {
  font-size: 12px;
  font-weight: 700;
  padding: 2px 8px;
  border-radius: 999px;
  white-space: nowrap;
}
.kpi-pill.good {
  color: var(--ok-text);
  background: rgba(47, 163, 107, 0.12);
}
.kpi-pill.bad {
  color: var(--danger-text);
  background: rgba(229, 72, 77, 0.11);
}
.kpi-value-row {
  display: flex;
  align-items: baseline;
  gap: 4px;
}
.kpi-value {
  font-size: 32px;
  font-weight: 700;
  color: var(--title);
  line-height: 1;
  letter-spacing: 0.3px;
  white-space: nowrap;
  font-family: var(--font-mono);
}
.kpi-unit {
  font-size: 14px;
  font-weight: 600;
  color: var(--muted);
}
</style>
