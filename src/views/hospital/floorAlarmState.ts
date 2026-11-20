/**
 * 楼层告警状态纯函数（3D 园区二期，数据源 = §3.11 未处理事件列表归一的 AlertItem[]）。
 * 三视图共用一份分桶结果，保证「面板染色 == 3D 楼层亮光 == 看板明细」口径一致：
 *   - summarizeFloorAlarms：楼层行状态（紧急红/严重橙/正常）+ 该层 1/2 级条数
 *   - floorAlerts：楼层告警看板明细（时间倒序）
 *   - buildFloorCalloutItems：全屏引线卡 payload（福永 buildFloorAlarmCallouts 同款，
 *     HTML 结构组装在此、世界锚点在引擎 CSS2D——见 sceneManager setFloorAlarmCallouts）
 * 拍板口径（2026-11-19）：
 *   - 只认未处理 + level 1/2（一般/提醒不参与楼层状态、不进看板、不亮灯）
 *   - 每层取最高等级：同层既有紧急又有严重 → 显示紧急（等级数值小=优先级高）
 *   - G/-N 等无 GLB 节点的层：分桶结果里可能出现，由调用方按楼层清单取用（取不到即丢弃）。
 *     宝中楼栋无 G 层（2026-11-19 用户澄清，契约 "G" 为福永口径）；宝中现实场景是地下层
 *     "-N"（_under 未接入时同样落不到行），引擎 GF/BNF 解析保留为换医院通用能力。
 */
import type { AlertItem } from '../../api/hospital/types'
import { CAMPUS_BUILDINGS } from '../../config/campusConfig'
import { floorNodeName } from '../../three/campus/buildings'
import type { FloorAlarmCalloutInput } from '../../three/campus/sceneManager'

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

/** 楼层告警看板明细：未处理 + level 1/2 + building/floor 双匹配，时间倒序 */
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

function escapeHtml(s: string) {
  return String(s || '').replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] || c,
  )
}

/** 楼层键排序（G 最先，其余数值升序，地下层自然排前——引擎 getFloors 同规则） */
const floorOrder = (f: string) => (f === 'G' ? 0 : Number(f))

/** 全屏引线卡 payload（福永 buildFloorAlarmCallouts 宝中版）：一告警楼层一枚卡。
 *  楼栋按配置顺序、层内按楼层键升序，shift=i*28 垂直错层；文案取该层最新一条
 *  （内容 · 设备名，福永同款拼接），同层其余条数折进「另有 N 条」。HTML 组装后
 *  交引擎挂 CSS2DObject——世界锚点/朝向/投影全在引擎，这里不含屏幕坐标。 */
export function buildFloorCalloutItems(alerts: AlertItem[]): FloorAlarmCalloutInput[] {
  const out: FloorAlarmCalloutInput[] = []
  for (const b of CAMPUS_BUILDINGS) {
    const summary = summarizeFloorAlarms(b.id, alerts)
    const floors = [...summary.keys()].sort((a, z) => floorOrder(a) - floorOrder(z))
    floors.forEach((floorKey, i) => {
      const tone = summary.get(floorKey)!.level === 1 ? 'error' : 'warn'
      const grade = tone === 'error' ? '紧急告警' : '严重告警'
      const list = floorAlerts(b.id, floorKey, alerts)
      const latest = list[0]
      const text = [latest?.content, latest?.device].filter(Boolean).join(' · ') || grade
      const where = `${escapeHtml(b.name)} · ${floorNodeName(floorKey) ?? floorKey}`
      out.push({
        id: `floor-callout-${b.id}-${floorKey}`,
        buildingId: b.id,
        floorKey,
        tone,
        shift: i * 28,
        html:
          `<i class="floor-callout__dot"></i>` +
          `<span class="floor-callout__leader"></span>` +
          `<div class="floor-callout__card">` +
          `<div class="floor-callout__head">` +
          `<span class="floor-callout__grade">${grade}</span>` +
          `<span class="floor-callout__where">${where}</span>` +
          `</div>` +
          (latest
            ? `<div class="floor-callout__time">${escapeHtml(latest.time.slice(5, 16))}</div>`
            : '') +
          `<div class="floor-callout__text">${escapeHtml(text)}</div>` +
          (list.length > 1 ? `<div class="floor-callout__more">另有 ${list.length - 1} 条</div>` : '') +
          `</div>`,
      })
    })
  }
  return out
}
