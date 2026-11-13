<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { NSelect } from 'naive-ui'
import { usePageTabsStore } from '../../store/pageTabs'
import {
  fetchDeviceSearch,
  fetchHealthLevelStats,
  fetchSuperPage,
  fetchSuperSearch,
} from '../../api/device/device'
import type {
  DeviceDetail,
  DeviceHealthLevelStats,
  SuperDevice,
  SuperDeviceRow,
} from '../../api/device/types'
import {
  gradeCountsFromLevelStats,
  healthGrade,
  type HealthGrade,
} from '../../config/healthGrades'
import ChannelSidebar from '../../components/ChannelSidebar.vue'
import CabinetTable from './components/CabinetTable.vue'
import HealthAside from '../../components/HealthAside.vue'
import PointListDialog from './components/PointListDialog.vue'
import PointCurveDrawer from './components/PointCurveDrawer.vue'

/**
 * 设备管理（4.2，福永 DeviceManagementPage 同构；目录解耦批次 2 起不再走全局 store）：
 * 楼栋树侧栏（角标=医院级全量行本地分组，0 柜楼栋隐藏）→ 头部工具条（面包屑+类型下拉+搜索+重置）→
 * 箱柜表（§1.4 浏览 / §1.10 柜名检索 / §1.9 设备名检索）→ 健康度五档卡（§1.12）。
 * 请求口径（用户定稿）：进入 2 个（§1.4 全量 + §1.12）；切楼栋 2 个（§1.4/§1.12 带 buildingId）；
 * 楼栋树/角标/总数从医院级全量行本地派生（§1.2/§1.5 不再调用）；切回页签 0 请求。
 * 交互链：柜行「详情」跳 /device-detail；柜行「测点」开弹窗（§1.7+§3.5）；弹窗行「查看」开告警
 * 抽屉（§1.11+§3.3）——均按需请求。
 */
defineOptions({ name: 'DeviceManagementPage' })

const HOSPITAL_NAME = '深圳市宝安中心医院'

// ---- 页面本地目录状态 ----
/** 浏览态行（当前选中范围：医院或某栋；§1.4 行自带 buildingId/buildingName） */
const cabinets = ref<SuperDeviceRow[]>([])
/** 当前选中范围的 §1.4 行（不被检索结果覆盖——设备名检索按它做楼栋范围过滤） */
const browseRows = ref<SuperDeviceRow[]>([])
/** 健康度五档（随选中范围，§1.12） */
const health = ref<DeviceHealthLevelStats | null>(null)
/** 侧栏选中：null=医院 */
const selectedBuilding = ref<number | null>(null)
const loading = ref(false)

/** 医院级派生（仅首次进入加载，楼栋切换不刷新 → 角标/总数恒显示） */
const buildingTree = ref<{ chnID: number; chnName: string; deviceCount: number }[]>([])
const sidebarTotal = ref(0)

// 本地分页（12 条/页，序号跨页累加；用户拍板 12 条对齐福永观感）
const page = ref(1)
const PAGE_SIZE = 12

// 健康度筛选（本地，作用于当前范围行）
const selectedGrade = ref<HealthGrade>('all')
const gradeCounts = computed(() =>
  health.value
    ? gradeCountsFromLevelStats(health.value)
    : { all: 0, excellent: 0, good: 0, fair: 0, poor: 0, terrible: 0 },
)
const gradeLabel = computed(() => GRADE_LABELS[selectedGrade.value] ?? '全部设备')
const GRADE_LABELS: Record<HealthGrade, string> = {
  all: '全部设备',
  excellent: '优秀',
  good: '良好',
  fair: '一般',
  poor: '较差',
  terrible: '极差',
}

const filtered = computed(() =>
  selectedGrade.value === 'all'
    ? cabinets.value
    : cabinets.value.filter((c) => healthGrade(c.health) === selectedGrade.value),
)
const cabinetRows = computed(() =>
  filtered.value.map((c) => ({ ...c, buildingName: c.buildingName || '—' })),
)
const totalPages = computed(() => Math.max(1, Math.ceil(filtered.value.length / PAGE_SIZE)))
const paged = computed(() =>
  cabinetRows.value.slice((page.value - 1) * PAGE_SIZE, page.value * PAGE_SIZE),
)

function selectGrade(g: HealthGrade) {
  selectedGrade.value = g
  page.value = 1
}
function onPage(p: number) {
  page.value = Math.min(Math.max(1, p), totalPages.value)
}

// 搜索：类型下拉 + 单输入框（福永 2026-10-30 改稿同款：柜名→§1.10、设备名→§1.9）
const searchKind = ref<'' | 'cabinet' | 'device'>('')
const searchKindOptions = [
  { value: 'cabinet', label: '柜体名称' },
  { value: 'device', label: '测点设备' },
]
const searchInput = ref('')
const searchPlaceholder = computed(() =>
  searchKind.value === 'cabinet'
    ? '按柜体名称检索'
    : searchKind.value === 'device'
      ? '按测点设备名称检索'
      : '请先选择查询类型',
)
/** 设备名检索结果（§1.9）；柜名检索结果由 store.cabinets 承载 */
const deviceRows = ref<DeviceDetail[]>([])
const deviceSearched = ref(false)
const searchLoading = ref(false)

const tableMode = computed(() => (deviceSearched.value ? 'device' : 'cabinet'))
const tableTotal = computed(() =>
  tableMode.value === 'device' ? deviceRows.value.length : filtered.value.length,
)
const channelLabel = computed(() => {
  if (selectedBuilding.value == null) return '全部楼栋'
  return buildingTree.value.find((t) => t.chnID === selectedBuilding.value)?.chnName ?? '全部楼栋'
})

/** §1.4 分页拉全量（buildingId null=医院级；行自带 buildingId/buildingName） */
async function fetchAllRows(buildingId: number | null): Promise<SuperDeviceRow[]> {
  const first = await fetchSuperPage(buildingId, 1, 200)
  const rows = [...first.rows]
  while (rows.length < first.total && rows.length < 2000) {
    const next = await fetchSuperPage(buildingId, Math.floor(rows.length / 200) + 1, 200)
    if (!next.rows.length) break
    rows.push(...next.rows)
  }
  return rows
}

/** 首次进入（医院级，2 个请求）：§1.4 全量（行派生楼栋树/角标/总数）+ §1.12 五档 */
async function loadHospital() {
  loading.value = true
  try {
    const rows = await fetchAllRows(null)
    cabinets.value = rows
    browseRows.value = rows
    sidebarTotal.value = rows.length
    const map = new Map<number, { chnID: number; chnName: string; deviceCount: number }>()
    for (const r of rows) {
      const hit = map.get(r.buildingId)
      if (hit) hit.deviceCount += 1
      else map.set(r.buildingId, { chnID: r.buildingId, chnName: r.buildingName, deviceCount: 1 })
    }
    buildingTree.value = [...map.values()].sort((a, b) => a.chnID - b.chnID)
    health.value = await fetchHealthLevelStats(undefined)
  } finally {
    loading.value = false
  }
}

/** 侧栏选中范围变化（2 个请求）：§1.4?buildingId + §1.12?buildingId；医院级派生不动 */
async function loadSelection() {
  loading.value = true
  try {
    const bid = selectedBuilding.value
    const [rows, stats] = await Promise.all([
      fetchAllRows(bid),
      fetchHealthLevelStats(bid ?? undefined),
    ])
    cabinets.value = rows
    browseRows.value = rows
    health.value = stats
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  void loadHospital()
})

/** 侧栏切换选中（null=医院）；切换即退出检索/筛选态并重查当前范围 */
function selectBuilding(id: number | null) {
  if (selectedBuilding.value === id) return
  selectedBuilding.value = id
  deviceSearched.value = false
  deviceRows.value = []
  selectedGrade.value = 'all'
  page.value = 1
  void loadSelection()
}

async function doSearch() {
  const q = searchInput.value.trim()
  if (!q || !searchKind.value) return
  page.value = 1
  if (searchKind.value === 'cabinet') {
    deviceSearched.value = false
    deviceRows.value = []
    loading.value = true
    try {
      // 搜索跟随侧栏选中（用户定稿 B 方案）：医院级不带参，选中楼栋带 buildingId——
      // 过滤由后端 §1.10 的可选 buildingId 参数完成，前端不做本地过滤
      const r = await fetchSuperSearch(q, selectedBuilding.value, 1, 200)
      cabinets.value = r.rows
    } finally {
      loading.value = false
    }
  } else {
    deviceSearched.value = true
    searchLoading.value = true
    try {
      const r = await fetchDeviceSearch(q, 1, 200)
      // 楼栋范围过滤：设备行带 superName，与当前楼栋柜名单求交集（§1.9 无 buildingId 入参）
      const scope =
        selectedBuilding.value == null
          ? null
          : new Set(browseRows.value.map((c) => c.superName))
      deviceRows.value =
        scope == null ? r.rows : r.rows.filter((d) => d.superName != null && scope.has(d.superName))
    } finally {
      searchLoading.value = false
    }
  }
}

/** 表格空态提示：选中楼栋时 0 匹配引导切回全院检索 */
const emptyHint = computed(() =>
  selectedBuilding.value != null && tableMode.value === 'cabinet'
    ? '当前楼栋下无匹配，可切回「全部楼栋」检索'
    : '',
)

function resetSearch() {
  searchInput.value = ''
  searchKind.value = ''
  deviceSearched.value = false
  deviceRows.value = []
  selectedGrade.value = 'all'
  page.value = 1
  void loadSelection()
}

// 按需弹窗/抽屉
const pointsCabinet = ref<SuperDevice | null>(null)
const alarmDevice = ref<DeviceDetail | null>(null)

const router = useRouter()
const pageTabs = usePageTabsStore()

/** 柜行「详情」→ 设备详情页 /device-detail（功能同福永 enterDevice3D）。
 * 福永另带首设备 id（其目录内嵌 devices）；宝中轻目录无此数据，4.3 页面自行经 §1.7 取。 */
function enterDevice3D(cabinet: SuperDevice) {
  pageTabs.open('/device-detail?superId=' + cabinet.id, '设备详情', 'device-detail')
  void router.push({ path: '/device-detail', query: { superId: String(cabinet.id) } })
}
</script>

<template>
  <div class="dm-page">
    <div class="dm-bg" aria-hidden="true">
      <div class="dm-bg-grid" />
      <div class="dm-bg-glow a" />
      <div class="dm-bg-glow b" />
    </div>

    <ChannelSidebar
      :channels="buildingTree"
      :selected-chn-id="selectedBuilding"
      :total-devices="sidebarTotal"
      @select-channel="selectBuilding"
    />

    <div class="dm-main">
      <header class="dm-header glass-panel">
        <div class="bread-crumbs">
          <span class="crumb">深圳市</span><span class="sep">/</span>
          <span class="crumb">{{ HOSPITAL_NAME }}</span>
          <template v-if="selectedBuilding != null"
            ><span class="sep">/</span
            ><span class="crumb current">{{
              buildingTree.find((t) => t.chnID === selectedBuilding)?.chnName
            }}</span></template
          >
        </div>
        <div class="header-right">
          <div class="search-group">
            <span class="search-kind-label">请选择需要查询的类型</span>
            <div class="search-kind">
              <NSelect
                :value="searchKind || null"
                :options="searchKindOptions"
                placeholder="选择类型"
                size="medium"
                :show-checkmark="false"
                :consistent-menu-width="false"
                :menu-props="{ class: 'search-kind-menu' }"
                @update:value="(v: '' | 'cabinet' | 'device') => (searchKind = v)"
              />
            </div>
            <div class="search-wrap">
              <svg
                class="search-ico"
                viewBox="0 0 24 24"
                width="16"
                height="16"
                fill="none"
                stroke="var(--muted)"
                stroke-width="2"
                stroke-linecap="round"
              >
                <circle cx="11" cy="11" r="7" />
                <path d="M21 21l-4.3-4.3" />
              </svg>
              <input
                v-model="searchInput"
                class="dm-search"
                :disabled="!searchKind"
                :placeholder="searchPlaceholder"
                @keydown.enter.prevent="doSearch"
              />
            </div>
            <button class="dm-btn primary" type="button" @click="doSearch">搜索</button>
          </div>
          <button class="dm-btn ghost" type="button" @click="resetSearch">重置</button>
          <!-- 导出（§1.17）：待后端联调开放（blob + Authorization AJAX 下载）；mock 不实现 -->
          <button class="dm-btn primary" type="button" disabled title="后端联调后开放">
            导出
          </button>
        </div>
      </header>

      <main class="dm-content">
        <CabinetTable
          :mode="tableMode"
          :rows="tableMode === 'device' ? deviceRows : paged"
          :loading="loading"
          :grade-label="gradeLabel"
          :channel-label="channelLabel"
          :empty-hint="emptyHint"
          :total="tableTotal"
          :page="page"
          :total-pages="totalPages"
          @view-points="(c) => (pointsCabinet = c)"
          @open="enterDevice3D"
          @view-device="(d) => (alarmDevice = d)"
          @page="onPage"
        />
        <p v-if="tableMode === 'device' && searchLoading" class="dm-hint">正在检索…</p>
        <HealthAside :counts="gradeCounts" :selected="selectedGrade" @select="selectGrade" />
      </main>
    </div>

    <PointListDialog
      :cabinet="pointsCabinet"
      @close="pointsCabinet = null"
      @view-alarms="(d) => (alarmDevice = d)"
    />
    <PointCurveDrawer :device="alarmDevice" @close="alarmDevice = null" />
  </div>
</template>

<style scoped>
.dm-page {
  width: 100%;
  height: 100%;
  position: relative;
  display: flex;
}
.dm-bg {
  position: absolute;
  inset: 0;
  z-index: 0;
  background:
    radial-gradient(900px 520px at 12% 6%, rgba(76, 208, 232, 0.11), transparent 58%),
    radial-gradient(780px 480px at 92% 94%, rgba(43, 124, 227, 0.09), transparent 58%),
    linear-gradient(165deg, var(--bg-1), var(--bg-2));
}
.dm-bg-grid {
  position: absolute;
  inset: 0;
  opacity: 0.22;
  background-image:
    linear-gradient(rgba(43, 124, 227, 0.05) 1px, transparent 1px),
    linear-gradient(90deg, rgba(43, 124, 227, 0.05) 1px, transparent 1px);
  background-size: 48px 48px;
}
.dm-bg-glow {
  position: absolute;
  border-radius: 50%;
  filter: blur(80px);
  opacity: 0.35;
  pointer-events: none;
}
.dm-bg-glow.a {
  width: 420px;
  height: 420px;
  top: -120px;
  left: -100px;
  background: var(--primary);
}
.dm-bg-glow.b {
  width: 380px;
  height: 380px;
  bottom: -120px;
  right: -100px;
  background: var(--cyan);
}
.dm-main {
  position: relative;
  z-index: 5;
  height: 100%;
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding: calc(var(--topbar-height) + 14px) 18px 18px 14px;
  min-width: 0;
}
.dm-header {
  flex: none;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 14px 22px;
  border-radius: var(--radius);
  box-shadow: var(--card-shadow);
  flex-wrap: wrap;
  /* glass-panel 的 backdrop-filter 会建堆叠上下文，后渲染的内容卡片会盖住下拉菜单 → 抬到内容之上 */
  position: relative;
  z-index: 20;
}
.bread-crumbs {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 17px;
  color: var(--muted);
}
.crumb.current {
  color: var(--primary-700);
  font-weight: 700;
}
.sep {
  color: var(--border-strong);
}
.header-right {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}
.search-group {
  display: flex;
  align-items: center;
  gap: 10px;
}
.search-kind-label {
  font-size: 14px;
  color: var(--muted);
  white-space: nowrap;
}
/* 类型下拉定宽容器；触发器 35px 对齐搜索框、选中与菜单项文字居中 */
.search-kind {
  width: 128px;
  flex: none;
}
.search-kind :deep(.n-base-selection) {
  --n-height: 35px;
  --n-font-size: 14px;
  --n-border-radius: 8px;
}
.search-kind :deep(.n-base-selection-label),
.search-kind :deep(.n-base-selection-placeholder) {
  justify-content: center;
}
.search-kind :deep(.n-base-select-option__content) {
  text-align: center;
}
.search-wrap {
  position: relative;
  display: flex;
  align-items: center;
}
.search-ico {
  position: absolute;
  left: 12px;
  pointer-events: none;
}
.dm-search {
  padding: 8px 14px 8px 36px;
  border-radius: var(--radius-sm);
  border: 1px solid var(--border);
  background: rgba(255, 255, 255, 0.9);
  font-size: 15px;
  color: var(--text);
  width: 180px;
  transition: all 0.18s;
}
.dm-search:focus {
  border-color: var(--primary);
  box-shadow: 0 0 0 3px rgba(82, 149, 232, 0.15);
}
.dm-search:disabled {
  background: rgba(93, 113, 137, 0.1);
  color: var(--muted);
  border-color: var(--border);
  cursor: not-allowed;
  opacity: 0.75;
}
.dm-search:disabled::placeholder {
  color: var(--muted);
  opacity: 0.85;
}
.dm-btn {
  padding: 8px 18px;
  border-radius: var(--radius-sm);
  border: none;
  font-size: 15px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.18s;
}
.dm-btn.primary {
  color: var(--on-primary);
  background: linear-gradient(135deg, var(--primary-400), var(--primary));
  box-shadow: 0 2px 8px rgba(82, 149, 232, 0.25);
}
.dm-btn.primary:not(:disabled):hover {
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(82, 149, 232, 0.3);
}
.dm-btn.ghost {
  background: rgba(255, 255, 255, 0.8);
  border: 1px solid var(--border);
  color: var(--muted);
}
.dm-btn.ghost:not(:disabled):hover {
  color: var(--primary);
  border-color: var(--primary-300);
}
.dm-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.dm-content {
  flex: 1;
  min-height: 0;
  display: flex;
  gap: 14px;
}
.dm-hint {
  margin: 8px 0 0;
  font-size: 13px;
  color: var(--muted);
}
</style>

<style>
/* 类型下拉菜单（teleport 到 body，需全局样式）：选项文字居中 */
.search-kind-menu .n-base-select-option .n-base-select-option__content {
  text-align: center;
}
</style>
