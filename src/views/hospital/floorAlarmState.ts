/**
 * 楼层告警状态纯函数（3D 园区二期，数据源 = §3.11 未处理事件列表归一的 AlertItem[]）。
 * 三视图共用一份分桶结果，保证「面板染色 == 3D 楼层亮光 == 看板明细」口径一致：
 *   - summarizeFloorAlarms：楼层行状态（紧急红/严重橙/正常）+ 该层 1/2 级条数
 *   - floorAlerts：楼层预警看板明细（时间倒序）
 * 拍板口径（2026-11-19）：
 *   - 只认未处理 + level 1/2（一般/提醒不参与楼层状态、不进看板、不亮灯）
 *   - 每层取最高等级：同层既有紧急又有严重 → 显示紧急（等级数值小=优先级高）
 *   - G/-N 等无 GLB 节点的层：分桶结果里可能出现，由调用方按楼层清单取用（取不到即丢弃）。
 *     宝中楼栋无 G 层（2026-11-19 用户澄清，契约 "G" 为福永口径）；宝中现实场景是地下层
 *     "-N"（_under 未接入时同样落不到行），引擎 GF/BNF 解析保留为换医院通用能力。
 */
import type { AlertItem } from '../../api/hospital/types'

/** 楼层行状态：0=正常 1=紧急（红） 2=严重（橙） */
export type FloorAlarmLevel = 0 | 1 | 2

export interface FloorAlarmSummary {
  level: FloorAlarmLevel
  /** 该层未处理且等级 1/2 的条数（看板明细数、四格数字同源） */
  count: number
}

/** 指定楼栋的楼层状态分桶：floorKey → { level, count } */
export function summarizeFloorAlarms(
  buildingId: number,
  alerts: AlertItem[],
): Map<string, FloorAlarmSummary> {
  const map = new Map<string, FloorAlarmSummary>()
  for (const a of alerts) {
    if (a.status !== 'pending') continue
    const lv = a.eventLevel
    if (lv !== 1 && lv !== 2) continue
    for (const loc of a.locations ?? []) {
      if (loc.building !== buildingId) continue
      const cur = map.get(loc.floor) ?? { level: 0 as FloorAlarmLevel, count: 0 }
      cur.count += 1
      // 取更高优先级（数值小=更紧急；初始 0=无告警直接取本条等级）
      cur.level = (cur.level === 0 ? lv : Math.min(cur.level, lv)) as FloorAlarmLevel
      map.set(loc.floor, cur)
    }
  }
  return map
}

/** 楼层预警看板明细：未处理 + level 1/2 + building/floor 双匹配，时间倒序 */
export function floorAlerts(buildingId: number, floor: string, alerts: AlertItem[]): AlertItem[] {
  return alerts
    .filter(
      (a) =>
        a.status === 'pending' &&
        (a.eventLevel === 1 || a.eventLevel === 2) &&
        a.locations?.some((l) => l.building === buildingId && l.floor === floor),
    )
    .sort((a, b) => b.time.localeCompare(a.time))
}
