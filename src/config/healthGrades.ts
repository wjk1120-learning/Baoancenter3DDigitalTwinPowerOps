import type { DeviceHealthLevelStats } from '../api/device/types'

/** 健康度分级：与医院总览 1.20 五档一致（优秀 ≥85 / 良好 70–85 / 一般 50–70 / 较差 30–50 / 极差 <30） */
export type HealthGrade = 'all' | 'excellent' | 'good' | 'fair' | 'poor' | 'terrible'

export const GRADE_META: { id: HealthGrade; label: string; hint: string }[] = [
  { id: 'all', label: '全部设备', hint: '不限健康度' },
  { id: 'excellent', label: '优秀', hint: '健康度 ≥ 85' },
  { id: 'good', label: '良好', hint: '健康度 70–85' },
  { id: 'fair', label: '一般', hint: '健康度 50–70' },
  { id: 'poor', label: '较差', hint: '健康度 30–50' },
  { id: 'terrible', label: '极差', hint: '健康度 < 30' },
]

export function healthGrade(h: number | null): Exclude<HealthGrade, 'all'> | null {
  if (h == null || !Number.isFinite(h)) return null
  if (h >= 85) return 'excellent'
  if (h >= 70) return 'good'
  if (h >= 50) return 'fair'
  if (h >= 30) return 'poor'
  return 'terrible'
}

export function emptyGradeCounts(): Record<HealthGrade, number> {
  return { all: 0, excellent: 0, good: 0, fair: 0, poor: 0, terrible: 0 }
}


/** 1.20 五档统计 → 五卡一一对应（口径与医院总览健康度面板一致） */
export function gradeCountsFromLevelStats(stats: DeviceHealthLevelStats): Record<HealthGrade, number> {
  const { excellentCount, goodCount, fairCount, poorCount, terribleCount, totalCount } = stats
  const all = totalCount || excellentCount + goodCount + fairCount + poorCount + terribleCount
  return {
    all,
    excellent: excellentCount,
    good: goodCount,
    fair: fairCount,
    poor: poorCount,
    terrible: terribleCount,
  }
}
