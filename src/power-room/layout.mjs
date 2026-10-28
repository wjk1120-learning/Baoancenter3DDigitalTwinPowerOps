/**
 * 配电房一级大柜布局（纯函数，对拍基准实现）。
 *
 * 规则逐字对齐旧项目 computeCircuitLayout（circuit.ts）：
 *   - 排号 r（0 起）：z = (r - (排数-1)/2) * BAND_GAP
 *   - 排内从左到右：x 起点 -rowW/2，每台 cx = x + pitch/2 + nudgeX，下一台 x += pitch
 *   - 二级小柜不参与几何（旧项目总览隐藏小柜，feeders 仅档案）
 *
 * 对拍：node scripts/parity-layout.mjs（与旧项目运行时输出逐位比对）
 */

/** 排间距（米），与旧项目 BAND_GAP 一致 */
export const BAND_GAP = 5.6

/**
 * @param {import('../schema/powerRoom.ts').PowerRoomConfig} room
 * @param {number} pitch 柜间距（米）
 */
export function computePowerRoomLayout(room, pitch) {
  const rowCount = room.rows.length
  /** @type {{code: string, x: number, z: number, row: number}[]} */
  const slots = []
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
