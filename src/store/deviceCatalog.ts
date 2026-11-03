import { ref } from 'vue'
import { defineStore } from 'pinia'
import {
  fetchBuildingList,
  fetchHealthLevelStats,
  fetchSuperDeviceCount,
  fetchSuperPage,
  fetchSuperSearch,
} from '../api/device/device'
import type { BuildingInfo, DeviceHealthLevelStats, SuperDevice } from '../api/device/types'

const CATALOG_PAGE_SIZE = 200 // §1.4 大页拉全量（福永 fetchAllSupersByBuilding 同款），本地分页/筛选

/**
 * 设备目录 store（4.2②：楼栋→箱柜两级，页面初始化拉全量后本地分页/健康度筛选）。
 * 柜名/设备名检索走服务端（§1.10/§1.9）；测点/告警明细按需请求，不进本 store。
 */
export const useDeviceCatalogStore = defineStore('deviceCatalog', () => {
  const buildings = ref<BuildingInfo[]>([])
  /** 当前楼栋筛选（null = 全部楼栋） */
  const buildingId = ref<number | null>(null)
  /** 当前范围的箱柜全量列表（浏览态 = §1.4；柜名检索态 = §1.10 结果）；buildingId 供楼栋列显示 */
  const cabinets = ref<(SuperDevice & { buildingId?: number })[]>([])
  /** 侧栏箱柜数：§1.5 全院 + 按楼栋 */
  const sidebarCounts = ref<{ total: number; byBuilding: Record<number, number> }>({
    total: 0,
    byBuilding: {},
  })
  /** §1.12 健康度五档（随楼栋筛选联动） */
  const health = ref<DeviceHealthLevelStats | null>(null)
  const loading = ref(false)
  const error = ref('')
  /** 柜名检索态（非空 = 表格显示的是检索结果而非浏览态） */
  const cabinetQuery = ref('')

  async function loadSupers() {
    const first = await fetchSuperPage(buildingId.value, 1, CATALOG_PAGE_SIZE)
    const rows = [...first.rows]
    while (rows.length < first.total && rows.length < 2000) {
      const next = await fetchSuperPage(
        buildingId.value,
        Math.floor(rows.length / CATALOG_PAGE_SIZE) + 1,
        CATALOG_PAGE_SIZE,
      )
      if (!next.rows.length) break
      rows.push(...next.rows)
    }
    cabinets.value = rows
  }

  async function loadSidebarCounts() {
    const [total, ...per] = await Promise.all([
      fetchSuperDeviceCount(),
      ...buildings.value.map((b) => fetchSuperDeviceCount(b.id)),
    ])
    const byBuilding: Record<number, number> = {}
    buildings.value.forEach((b, i) => {
      byBuilding[b.id] = per[i] ?? 0
    })
    sidebarCounts.value = { total: total ?? 0, byBuilding }
  }

  async function loadMeta() {
    const [list, stats] = await Promise.all([
      fetchBuildingList(),
      fetchHealthLevelStats(buildingId.value ?? undefined),
    ])
    buildings.value = list
    health.value = stats
  }

  async function load() {
    loading.value = true
    error.value = ''
    try {
      // 楼栋列表先行（侧栏计数依赖楼栋 id），再并行取目录/计数/健康度
      await loadMeta()
      await Promise.all([loadSupers(), loadSidebarCounts()])
    } catch (err) {
      error.value = err instanceof Error ? err.message : String(err)
    } finally {
      loading.value = false
    }
  }

  /** 切换楼栋筛选（null = 全部）；切楼栋退出检索态 */
  function selectBuilding(id: number | null) {
    if (buildingId.value === id) return
    buildingId.value = id
    cabinetQuery.value = ''
    void load()
  }

  /** §1.10 柜名检索（结果直接替换 cabinets，进入检索态） */
  async function searchCabinets(superName: string) {
    const q = String(superName || '').trim()
    if (!q) return
    loading.value = true
    error.value = ''
    try {
      cabinetQuery.value = q
      const r = await fetchSuperSearch(q, 1, 200)
      cabinets.value = r.rows
    } catch (err) {
      error.value = err instanceof Error ? err.message : String(err)
    } finally {
      loading.value = false
    }
  }

  /** 退出柜名检索态，回浏览态 */
  function clearCabinetSearch() {
    if (!cabinetQuery.value) return
    cabinetQuery.value = ''
    void loadSupers()
  }

  return {
    buildings,
    buildingId,
    cabinets,
    sidebarCounts,
    health,
    loading,
    error,
    cabinetQuery,
    load,
    selectBuilding,
    searchCabinets,
    clearCabinetSearch,
  }
})
