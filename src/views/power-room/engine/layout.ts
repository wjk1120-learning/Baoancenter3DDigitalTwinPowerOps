import type { PowerRoomConfig } from '../schema/powerRoom'

/**
 * 配电房一级大柜布局（纯函数，与福永 computeCircuitLayout 对拍通过）。
 *
 * 规则：
 *   - 排号 r（0 起）：z = (r - (排数-1)/2) * BAND_GAP
 *   - 排内从左到右：x 起点 -rowW/2，每台 cx = x + pitch/2 + nudgeX，下一台 x += pitch
 *
 * 对拍：node scripts/parity-layout.mjs（vs fixtures/layout-g2.expected.json）
 */

/** 排间距（米），与福永 BAND_GAP 一致 */
export const BAND_GAP = 5.6

export interface CabinetSlot {
  code: string
  x: number
  z: number
  row: number
}

export function computePowerRoomLayout(room: PowerRoomConfig, pitch: number): {
  slots: CabinetSlot[]
  maxW: number
  bandGap: number
  pitch: number
} {
  const rowCount = room.rows.length
  const slots: CabinetSlot[] = []
  let maxW = 0

  room.rows.forEach((row, r) => {
    const z = (r - (rowCount - 1) / 2) * BAND_GAP
    const rowW = row.length * pitch
    if (rowW > maxW) maxW = rowW
    let x = -rowW / 2
    row.forEach((cab) => {
      const cx = x + pitch / 2 + (cab.nudgeX ?? 0)
      slots.push({ code: cab.code, x: cx, z, row: r })
      x += pitch
    })
  })

  return { slots, maxW, bandGap: BAND_GAP, pitch }
}
