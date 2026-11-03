import type { AlertEventLevel } from '../../../api/hospital/types'
import type { DeviceEventGroup } from '../../../api/event/types'
import { normalizeEventLevel } from '../../../api/event/mappers'
import { chartColors } from '../../../config/chartColors'

export const GRADE_META: { id: AlertEventLevel; label: string; color: string }[] = [
  { id: 4, label: '提醒', color: chartColors.teal },
  { id: 3, label: '一般', color: chartColors.primary },
  { id: 2, label: '严重', color: chartColors.warn },
  { id: 1, label: '紧急', color: chartColors.danger },
]
export const GRADE_BY_ID = Object.fromEntries(GRADE_META.map((g) => [g.id, g])) as Record<
  AlertEventLevel,
  (typeof GRADE_META)[number]
>

export function gradeOf(g: DeviceEventGroup): AlertEventLevel {
  return normalizeEventLevel(g.highestLevel)
}

export function distCount(dist: Record<string, number> | undefined, id: AlertEventLevel): number {
  if (!dist) return 0
  return Number(dist[String(id)] ?? dist[id as unknown as string] ?? 0) || 0
}

export function groupCount(g: DeviceEventGroup): number {
  return Number(g.count) || 0
}
