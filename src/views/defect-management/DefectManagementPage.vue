<script setup lang="ts">
import { computed, onActivated, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { NDatePicker, NModal, NSelect, useMessage } from 'naive-ui'
import { usePageTabsStore } from '../../store/pageTabs'
import { fetchBuildingList, fetchSuperSearch } from '../../api/device/device'
import type { BuildingInfo } from '../../api/device/types'
import {
  fetchCabinetDefectPage,
  fetchDefectRecordsByDeviceNumber,
  fetchDefectStats,
} from '../../api/operation/operation'
import type { CabinetDefectOverview, CaoliaoRecord, DefectStats } from '../../api/operation/types'
import ChannelSidebar from '../../components/ChannelSidebar.vue'
import DefectDetailDrawer from '../../components/DefectDetailDrawer.vue'
import DeviceListTable, { type DefectListRow } from './components/DeviceListTable.vue'
import DefectTable from './components/DefectTable.vue'

defineOptions({ name: 'DefectManagementPage' })

/**
 * 缺陷管理页（2026-11-12 移植自福永 /defect，链路按宝中口径重定，见 docs/缺陷管理页移植方案.md）：
 * 左侧楼栋树（§1.2 全量楼栋含 0 柜楼栋，无角标）→ 面包屑（设备管理同款，随侧栏联动）→
 * 筛选区（风险等级+发现时间，clearable 选值/删值即查，无按钮——2026-11-12 用户定稿）→
 * 五张统计卡（§4.3 buildingId 版，随楼栋不随筛选）→ 设备列表（§4.5 服务端分页 12 条/页）。
 * 进页 3 请求：onMounted §1.2 + onActivated §4.5∥§4.3；切楼栋 2 请求（§4.5/§4.3 带 buildingId）；
 * 「查看」弹窗 §4.2 打开瞬间按需；「详情」§1.10 按需转 superId 后跳设备详情页。
 */
const HOSPITAL_NAME = '深圳市宝安中心医院'
const PAGE_SIZE = 12
const MODAL_PAGE_SIZE = 8

const message = useMessage()
const router = useRouter()
const pageTabs = usePageTabsStore()

// ---- 楼栋树（§1.2，进页一次；侧栏无角标） ----
const buildings = ref<BuildingInfo[]>([])
const selectedBuilding = ref<number | null>(null)
const buildingChannels = computed(() =>
  buildings.value.map((b) => ({ chnID: b.id, chnName: b.buildingName })),
)
const selectedBuildingName = computed(
  () => buildings.value.find((b) => b.id === selectedBuilding.value)?.buildingName ?? '',
)
/** 表格标题前缀：选中楼栋显示楼栋名，全部楼栋为空 */
const channelLabel = computed(() =>
  selectedBuilding.value == null ? '' : `${selectedBuildingName.value} `,
)

// ---- 筛选（零按钮：选值/删值即查，page 重置 1） ----
const fRisk = ref<string | null>(null)
/** 发现时间（2026-11-12 用户拍板：成对才查）：daterange 选完起止确认才触发；
 *  × 清空（null）= 时间条件整体退出、不带时间重查。无单边中途态。 */
const dateRange = ref<[number, number] | null>(null)
const riskOptions = [
  { label: '一般缺陷', value: '一般缺陷' },
  { label: '严重缺陷', value: '严重缺陷' },
  { label: '重大缺陷', value: '重大缺陷' },
]

function tsToDate(ts: number): string {
  const d = new Date(ts)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

// ---- 主列表（§4.5 服务端分页；请求序号防抖，快速连点只认最后一次响应） ----
const rows = ref<CabinetDefectOverview[]>([])
const total = ref(0)
const page = ref(1)
const totalPages = computed(() => Math.max(1, Math.ceil(total.value / PAGE_SIZE)))
const loading = ref(false)

let listReqSeq = 0
async function loadList() {
  const seq = ++listReqSeq
  loading.value = true
  try {
    const res = await fetchCabinetDefectPage({
      riskLevel: fRisk.value || undefined,
      startDate: dateRange.value?.[0] != null ? tsToDate(dateRange.value[0]) : undefined,
      endDate: dateRange.value?.[1] != null ? tsToDate(dateRange.value[1]) : undefined,
      buildingId: selectedBuilding.value ?? undefined,
      page: page.value,
      pageSize: PAGE_SIZE,
    })
    if (seq !== listReqSeq) return
    rows.value = res.rows
    total.value = res.total
  } catch {
    if (seq !== listReqSeq) return
    rows.value = []
    total.value = 0
  } finally {
    if (seq === listReqSeq) loading.value = false
  }
}

// ---- 统计卡（§4.3，随楼栋不随筛选/翻页；接口失败显示「—」） ----
const stats = ref<DefectStats | null>(null)
async function loadStats() {
  try {
    stats.value = await fetchDefectStats(selectedBuilding.value ?? undefined)
  } catch {
    stats.value = null
  }
}

// ---- 交互即查 ----
function onRiskChange(v: string | null) {
  fRisk.value = v
  page.value = 1
  void loadList()
}
function onDateRangeChange(v: [number, number] | null) {
  dateRange.value = v
  page.value = 1
  void loadList()
}
function selectBuilding(id: number | null) {
  selectedBuilding.value = id
  page.value = 1
  void loadList()
  void loadStats()
}
function onPage(p: number) {
  page.value = Math.min(Math.max(1, p), totalPages.value)
  void loadList()
}

// ---- 进页时序：onMounted §1.2（楼栋静态，切页签回来不重拉）；onActivated §4.5∥§4.3 ----
onMounted(() => {
  void (async () => {
    try {
      buildings.value = await fetchBuildingList()
    } catch {
      buildings.value = []
    }
  })()
})
onActivated(() => {
  void loadList()
  void loadStats()
})

// ---- 表格行映射（§4.5 行直读） ----
const listRows = computed<DefectListRow[]>(() =>
  rows.value.map((o) => ({
    buildingName: o.buildingName ?? '',
    deviceNumber: o.deviceNumber,
    name: o.superName,
    type: o.deviceType,
    hasDefect: o.hasDefect,
    defectCount: o.defectCount,
    latestDefectDate: o.latestDefectDate,
  })),
)
const emptyText = computed(() => {
  if (loading.value) return '缺陷数据加载中…'
  const filtered =
    fRisk.value != null || dateRange.value != null || selectedBuilding.value != null
  return filtered ? '暂无匹配设备' : '暂无设备'
})

// ---- 「查看」弹窗（§4.2 打开瞬间按需请求；本地分页 8 条/页） ----
const drawerShow = ref(false)
const activeRecord = ref<CaoliaoRecord | null>(null)
const modalShow = ref(false)
const modalCabinet = ref<DefectListRow | null>(null)
const modalLoading = ref(false)
const modalRows = ref<CaoliaoRecord[]>([])
const modalPage = ref(1)
const modalTotalPages = computed(() =>
  Math.max(1, Math.ceil(modalRows.value.length / MODAL_PAGE_SIZE)),
)
const modalPaged = computed(() =>
  modalRows.value.slice((modalPage.value - 1) * MODAL_PAGE_SIZE, modalPage.value * MODAL_PAGE_SIZE),
)

function openDefectModal(row: DefectListRow) {
  modalCabinet.value = row
  modalPage.value = 1
  modalRows.value = []
  modalShow.value = true
  modalLoading.value = true
  void (async () => {
    try {
      modalRows.value = await fetchDefectRecordsByDeviceNumber(row.deviceNumber)
    } catch {
      modalRows.value = []
    } finally {
      modalLoading.value = false
    }
  })()
}

function openDefect(rec: CaoliaoRecord) {
  activeRecord.value = rec
  drawerShow.value = true
}

// ---- 「详情」（§1.10 按需 superName→superId 转换；查不到提示不跳转） ----
let detailSeq = 0
async function openDeviceDetail(row: DefectListRow) {
  const seq = ++detailSeq
  const name = row.name.trim()
  if (!name) {
    message.warning('该行缺少箱柜名称，无法定位台账')
    return
  }
  try {
    const res = await fetchSuperSearch(name, null, 1, 10)
    if (seq !== detailSeq) return
    const hit = res.rows.find((r) => r.superName === name)
    if (!hit) {
      message.warning(`未在台账中找到「${name}」，无法打开详情`)
      return
    }
    pageTabs.open(`/device-detail?superId=${hit.id}`, '设备详情', 'device-detail')
    void router.push({ path: '/device-detail', query: { superId: String(hit.id) } })
  } catch {
    if (seq === detailSeq) message.error('查询台账失败，请重试')
  }
}
</script>

<template>
  <div class="df-page">
    <div class="df-bg" aria-hidden="true">
      <div class="df-bg-grid" />
      <div class="df-bg-glow a" />
      <div class="df-bg-glow b" />
    </div>

    <ChannelSidebar
      :channels="buildingChannels"
      :selected-chn-id="selectedBuilding"
      :total-devices="total"
      @select-channel="selectBuilding"
    />

    <div class="df-main">
      <header class="df-header glass-panel">
        <div class="bread-crumbs">
          <span class="crumb">深圳市</span><span class="sep">/</span>
          <span class="crumb">{{ HOSPITAL_NAME }}</span>
          <template v-if="selectedBuildingName"
            ><span class="sep">/</span
            ><span class="crumb current">{{ selectedBuildingName }}</span></template
          >
        </div>
      </header>

      <!-- 筛选区：两组件 clearable，选值/删值即查（2026-11-12 用户定稿，无按钮） -->
      <div class="df-filter glass-panel">
        <div class="cb-group">
          <span class="cb-label">风险等级</span>
          <NSelect
            :value="fRisk"
            :options="riskOptions"
            placeholder="选择风险等级"
            size="medium"
            clearable
            class="df-select"
            :show-checkmark="false"
            @update:value="onRiskChange"
          />
        </div>
        <div class="cb-group">
          <span class="cb-label">发现时间</span>
          <NDatePicker
            :value="dateRange"
            type="daterange"
            size="medium"
            class="df-date-range"
            start-placeholder="开始日期"
            end-placeholder="结束日期"
            clearable
            @update:value="onDateRangeChange"
          />
        </div>
      </div>

      <!-- 统计卡（§4.3，纯展示不可点） -->
      <div class="df-stats glass-panel">
        <div class="stat-card">
          <span class="stat-val">{{ stats?.total ?? '—' }}</span>
          <span class="stat-lbl">缺陷总数</span>
        </div>
        <div class="stat-card">
          <span class="stat-val warn">{{ stats?.pending ?? '—' }}</span>
          <span class="stat-lbl">待处理</span>
        </div>
        <div class="stat-card">
          <span class="stat-val primary">{{ stats?.processing ?? '—' }}</span>
          <span class="stat-lbl">处理中</span>
        </div>
        <div class="stat-card">
          <span class="stat-val ok">{{ stats?.done ?? '—' }}</span>
          <span class="stat-lbl">已完成</span>
        </div>
        <div class="stat-card">
          <span class="stat-val">{{ stats?.skipped ?? '—' }}</span>
          <span class="stat-lbl">无需处理</span>
        </div>
      </div>

      <DeviceListTable
        :rows="listRows"
        :total="total"
        :page="page"
        :page-size="PAGE_SIZE"
        :total-pages="totalPages"
        :loading="loading"
        :channel-label="channelLabel"
        :empty-text="emptyText"
        @update:page="onPage"
        @view="openDefectModal"
        @detail="openDeviceDetail"
      />
    </div>

    <!-- 查看：该柜缺陷记录列表（按设备编号调 §4.2） -->
    <NModal
      v-model:show="modalShow"
      preset="card"
      class="defect-modal"
      :title="`${modalCabinet?.name || ''} · 缺陷信息`"
      :bordered="false"
      :style="{ width: '1080px' }"
    >
      <DefectTable
        :rows="modalPaged"
        :total="modalRows.length"
        :page="modalPage"
        :total-pages="modalTotalPages"
        :loading="modalLoading"
        title=""
        plain
        empty-text="该设备暂无缺陷记录"
        @update:page="modalPage = $event"
        @view="openDefect"
      />
    </NModal>

    <DefectDetailDrawer v-model:show="drawerShow" :record="activeRecord" />
  </div>
</template>

<style scoped>
.df-page {
  width: 100%;
  height: 100%;
  position: relative;
  display: flex;
}
/* 背景层（与设备管理/告警中心同款页面底色） */
.df-bg {
  position: absolute;
  inset: 0;
  z-index: 0;
  background:
    radial-gradient(900px 520px at 12% 6%, rgba(76, 208, 232, 0.11), transparent 58%),
    radial-gradient(780px 480px at 92% 94%, rgba(43, 124, 227, 0.09), transparent 58%),
    linear-gradient(165deg, var(--bg-1), var(--bg-2));
}
.df-bg-grid {
  position: absolute;
  inset: 0;
  opacity: 0.22;
  background-image:
    linear-gradient(rgba(43, 124, 227, 0.05) 1px, transparent 1px),
    linear-gradient(90deg, rgba(43, 124, 227, 0.05) 1px, transparent 1px);
  background-size: 48px 48px;
}
.df-bg-glow {
  position: absolute;
  border-radius: 50%;
  filter: blur(80px);
  opacity: 0.35;
  pointer-events: none;
}
.df-bg-glow.a {
  width: 420px;
  height: 420px;
  top: -120px;
  left: -100px;
  background: var(--primary);
}
.df-bg-glow.b {
  width: 380px;
  height: 380px;
  bottom: -120px;
  right: -100px;
  background: var(--cyan);
}

.df-main {
  position: relative;
  z-index: 5;
  height: 100%;
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: calc(var(--topbar-height) + 14px) 18px 18px 14px;
  min-width: 0;
}

.df-header {
  flex: none;
  display: flex;
  align-items: center;
  padding: 12px 22px;
  border-radius: var(--radius);
  box-shadow: var(--card-shadow);
}
.bread-crumbs {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 17px;
}
.crumb {
  color: var(--muted);
  font-weight: 500;
}
.crumb.current {
  color: var(--primary-700);
  font-weight: 700;
}
.sep {
  color: var(--primary-300);
  font-size: 14px;
}

/* 筛选区（零按钮：clearable 选值/删值即查） */
.df-filter {
  flex: none;
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 10px 18px;
  padding: 12px 18px;
  border-radius: var(--radius);
  box-shadow: var(--card-shadow);
}
.cb-group {
  display: flex;
  align-items: center;
  gap: 8px;
}
.cb-label {
  font-size: 14px;
  font-weight: 600;
  color: var(--muted);
  white-space: nowrap;
}
.df-select {
  width: 150px;
}
.df-date-range {
  width: 280px;
}

/* 统计行（§4.3 纯展示，不可点） */
.df-stats {
  flex: none;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 18px;
  border-radius: var(--radius);
  box-shadow: var(--card-shadow);
}
.stat-card {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  padding: 6px 0;
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.55);
  border: 1px solid var(--border);
  transition:
    transform 0.18s,
    box-shadow 0.18s,
    border-color 0.18s,
    background 0.18s;
}
.stat-val {
  font-size: 26px;
  font-weight: 700;
  line-height: 1.15;
  color: var(--title);
  font-family: var(--font-mono);
}
.stat-val.warn {
  color: var(--warn-text);
}
.stat-val.primary {
  color: var(--primary);
}
.stat-val.ok {
  color: var(--ok-text);
}
.stat-lbl {
  font-size: 13px;
  color: var(--muted);
}
</style>
