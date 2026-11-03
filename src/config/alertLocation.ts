/**
 * 告警位置（doc v3.57 定位表 locations）展示工具 —— 本模块是唯一位置来源，
 * 调用方不得再用设备名/台账猜测楼栋楼层；解析不出 = 不渲染。
 * campus 3D 楼层映射（floorToCampusLevel 等）随总览任务（4.5/4.6）引入。
 */
import type { AlertLocation } from '../api/event/types'

/** 楼栋编号 → 展示名（对齐 1.2 /device/buildings 返回的楼栋） */
const BUILDING_LABELS: Record<number, string> = {
  1: '1号楼',
  2: '2号楼',
  3: '3号楼',
  4: '家属楼',
  5: '5号楼',
}

export function buildingLabel(building: number): string {
  return BUILDING_LABELS[building] || `${building}号楼`
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
