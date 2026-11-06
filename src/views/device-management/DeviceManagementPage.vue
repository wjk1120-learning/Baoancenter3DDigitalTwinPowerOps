<script setup lang="ts">
import { computed, onActivated, ref } from 'vue'
import { useRouter } from 'vue-router'
import { NSelect } from 'naive-ui'
import { usePageTabsStore } from '../../store/pageTabs'
import { useDeviceCatalogStore } from '../../store/deviceCatalog'
import { fetchDeviceSearch } from '../../api/device/device'
import type { DeviceDetail, SuperDevice } from '../../api/device/types'
import {
  gradeCountsFromLevelStats,
  healthGrade,
  type HealthGrade,
} from '../../config/healthGrades'
import DeviceSidebar from './components/DeviceSidebar.vue'
import CabinetTable from './components/CabinetTable.vue'
import HealthAside from '../../components/HealthAside.vue'
import PointListDialog from './components/PointListDialog.vue'
import PointAlarmDrawer from './components/PointAlarmDrawer.vue'

/**
 * 设备管理（4.2，福永 DeviceManagementPage 同构）：
 * 楼栋树侧栏（§1.5 计数）→ 头部工具条（面包屑 + 类型下拉 + 搜索 + 重置）→
 * 箱柜表（§1.4 浏览 / §1.10 柜名检索 / §1.9 设备名检索）→ 健康度五档卡（§1.12）。
 * 交互链（用户拍板同福永）：柜行「详情」跳设备详情页 /device-detail；
 * 柜行「测点」开弹窗（§1.7 + §3.5）；弹窗行「查看」开告警抽屉（§1.11 + §3.3）——均按需请求。
 * 「添加设备」福永为隐藏按钮+占位抽屉、「导出」待后端联调开放——恢复时照福永移植。
 */
defineOptions({ name: 'DeviceManagementPage' })

const HOSPITAL_NAME = '深圳市宝安中心医院'
const catalog = useDeviceCatalogStore()

// 本地分页（目录全量在 store，12 条/页，序号跨页累加；用户拍板 12 条对齐福永观感）
const page = ref(1)
const PAGE_SIZE = 12

// 健康度筛选（本地，作用于全量目录）
const selectedGrade = ref<HealthGrade>('all')
const gradeCounts = computed(() =>
  catalog.health
    ? gradeCountsFromLevelStats(catalog.health)
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

/** 楼栋列显示名（buildingId → 楼栋名） */
function buildingNameOf(buildingId?: number): string {
  if (buildingId == null) return '—'
  return catalog.buildings.find((b) => b.id === buildingId)?.buildingName ?? '—'
}

const filtered = computed(() =>
  selectedGrade.value === 'all'
    ? catalog.cabinets
    : catalog.cabinets.filter((c) => healthGrade(c.health) === selectedGrade.value),
)
const cabinetRows = computed(() =>
  filtered.value.map((c) => ({ ...c, buildingName: buildingNameOf(c.buildingId) })),
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
  if (catalog.buildingId == null) return '全部楼栋'
  return catalog.buildings.find((b) => b.id === catalog.buildingId)?.buildingName ?? '全部楼栋'
})
async function doSearch() {
  const q = searchInput.value.trim()
  if (!q || !searchKind.value) return
  page.value = 1
  if (searchKind.value === 'cabinet') {
    deviceSearched.value = false
    deviceRows.value = []
    await catalog.searchCabinets(q)
  } else {
    catalog.clearCabinetSearch()
    deviceSearched.value = true
    searchLoading.value = true
    try {
      const r = await fetchDeviceSearch(q, 1, 200)
      deviceRows.value = r.rows
    } finally {
      searchLoading.value = false
    }
  }
}

function resetSearch() {
  searchInput.value = ''
  searchKind.value = ''
  deviceSearched.value = false
  deviceRows.value = []
  selectedGrade.value = 'all'
  catalog.clearCabinetSearch()
  page.value = 1
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

onActivated(() => {
  void catalog.load()
})
</script>

<template>
  <div class="dm-page">
    <div class="dm-bg" aria-hidden="true">
      <div class="dm-bg-grid" />
      <div class="dm-bg-glow a" />
      <div class="dm-bg-glow b" />
    </div>

    <DeviceSidebar
      :channels="catalog.buildings.map((b) => ({
        chnID: b.id,
        chnName: b.buildingName,
        deviceCount: catalog.sidebarCounts.byBuilding[b.id] ?? 0,
      }))"
      :selected-chn-id="catalog.buildingId"
      :total-devices="catalog.sidebarCounts.total"
      @select-channel="catalog.selectBuilding"
    />

    <div class="dm-main">
      <header class="dm-header glass-panel">
        <div class="bread-crumbs">
          <span class="crumb">深圳市</span><span class="sep">/</span>
          <span class="crumb">{{ HOSPITAL_NAME }}</span>
          <template v-if="catalog.buildingId != null"
            ><span class="sep">/</span
            ><span class="crumb current">{{
              catalog.buildings.find((b) => b.id === catalog.buildingId)?.buildingName
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
          :loading="catalog.loading"
          :grade-label="gradeLabel"
          :channel-label="channelLabel"
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
    <PointAlarmDrawer :device="alarmDevice" @close="alarmDevice = null" />
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
