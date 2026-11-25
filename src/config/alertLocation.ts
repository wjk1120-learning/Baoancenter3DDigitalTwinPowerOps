/**
 * 告警位置（doc v3.57 定位表 locations）展示工具 —— 本模块是唯一位置来源，
 * 调用方不得再用设备名/台账猜测楼栋楼层；解析不出 = 不渲染。
 * campus 3D 楼层映射（floorToCampusLevel 等）随总览任务（4.5/4.6）引入。
 */
import type { AlertLocation } from '../api/event/types'
import { fetchBuildingList } from '../api/device/device'

/**
 * 楼栋编号 → 展示名。数据源 = 后端楼栋维度表（§1.2 /device/buildings，唯一事实源；
 * 2026-11-25 联调切换：不再写死福永口径的「1号楼/家属楼」表，配置中心改楼名自动跟进）。
 * App.vue 启动时调 initBuildingLabels() 预拉一次；拉取失败或未知编号兜底「楼栋 N」，
 * 不猜名字（宁缺毋错）。
 */
const BUILDING_LABELS = new Map<number, string>()

/** 预拉楼栋名（App.vue onMounted 调用；失败静默，兜底文案接管） */
export function initBuildingLabels(): void {
  void fetchBuildingList()
    .then((list) => {
      for (const b of list) BUILDING_LABELS.set(b.id, b.buildingName)
    })
    .catch(() => {
      /* 静默：楼栋名缺失时按「楼栋 N」兜底，不影响告警主体展示 */
    })
}

export function buildingLabel(building: number): string {
  return BUILDING_LABELS.get(building) ?? `楼栋 ${building}`
}

/**
 * 位置展示文案："3号楼 G层"；多条去重后用「、」拼接。
 * locations 为 null / 空时返回空串。
 */
export function formatAlertLocations(locations?: AlertLocation[] | null): string {
  if (!locations?.length) return ''
  const seen = new Set<string>()
  const parts: string[] = []
  for (const loc of locations) {
    const floor = String(loc?.floor ?? '').trim()
    if (!Number.isFinite(Number(loc?.building)) || !floor) continue
    const key = `${loc.building}:${floor}`
    if (seen.has(key)) continue
    seen.add(key)
    parts.push(`${buildingLabel(Number(loc.building))} ${floor}层`)
  }
  return parts.join('、')
}
