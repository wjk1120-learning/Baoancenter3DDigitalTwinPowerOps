#!/usr/bin/env node
/**
 * 配置校验：node scripts/check-power-rooms.mjs [配置路径]
 *
 * 新项目种子脚本：power-rooms.json（图纸+档案+暗号合并配置）的机器把关。
 * 迁入新仓库后挂到 npm run build 之前执行，任何错误直接构建失败。
 * 零依赖（只用 node 内置模块），换机器换医院都能跑。
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const MODELS = ['jinxian', 'dianrongui', 'peidiangui', 'shuangdianyuan', 'kaiguan']
const FY_RE = /^FY\d{6}$/

const target =
  process.argv[2] ?? fileURLToPath(new URL('../src/config/power-rooms.json', import.meta.url))

const errors = []
let rooms = 0
let cabinets = 0

function fail(room, where, msg) {
  errors.push(`[${room ?? '?'}] ${where}: ${msg}`)
}

let config
try {
  config = JSON.parse(readFileSync(target, 'utf8'))
} catch (e) {
  console.error(`✗ JSON 解析失败：${e.message}`)
  process.exit(1)
}

if (typeof config.pitch !== 'number' || config.pitch <= 0) {
  errors.push('[全局] pitch: 必须是正数（柜间距，米）')
}

if (!Array.isArray(config.rooms) || config.rooms.length === 0) {
  errors.push('[全局] rooms: 必须是非空数组')
}

const roomIds = new Set()
;(config.rooms ?? []).forEach((room, ri) => {
  const tag = `rooms[${ri}] ${room?.id ?? ''}`
  rooms += 1

  if (!room?.id || typeof room.id !== 'string') fail(tag, 'id', '必填且为字符串')
  else if (roomIds.has(room.id)) fail(tag, 'id', `重复的配电房 id「${room.id}」`)
  else roomIds.add(room.id)

  if (!room?.name) fail(tag, 'name', '必填')
  if (!Array.isArray(room?.rows) || room.rows.length === 0) {
    fail(tag, 'rows', '必须是非空数组（至少一排柜子）')
    return
  }

  // code 只在配电房内唯一（真实教训：福永台账里 2AA1 在综合房和放射科各出现一次）
  const codes = new Set()
  room.rows.forEach((row, rIdx) => {
    if (!Array.isArray(row) || row.length === 0) {
      fail(tag, `rows[${rIdx}]`, '每排必须是非空数组')
      return
    }
    row.forEach((cab, cIdx) => {
      cabinets += 1
      const at = `rows[${rIdx}][${cIdx}]`

      if (!cab?.code || typeof cab.code !== 'string') fail(tag, at, 'code 必填')
      else if (codes.has(cab.code)) fail(tag, at, `配电房内重复的柜号「${cab.code}」`)
      else codes.add(cab.code)

      if (!cab?.name) fail(tag, at, 'name 必填')

      if (!cab?.model) fail(tag, at, 'model 必填（柜体选型）')
      else if (!MODELS.includes(cab.model))
        fail(tag, at, `model「${cab.model}」不在 5 种柜体枚举内：${MODELS.join(' / ')}`)

      if (cab?.fyCode != null && cab.fyCode !== '') {
        if (typeof cab.fyCode !== 'string' || !FY_RE.test(cab.fyCode))
          fail(tag, at, `fyCode「${cab.fyCode}」不符合 FY+6位数字 规则（如 FY000151）`)
      }

      if (cab?.nudgeX != null && typeof cab.nudgeX !== 'number')
        fail(tag, at, 'nudgeX 必须是数字（米，缺省 0）')
    })
  })
})

console.log(`配电房 ${rooms} 个，柜子 ${cabinets} 台`)
if (errors.length) {
  console.error(`\n✗ 校验失败，${errors.length} 处问题：`)
  errors.forEach((e) => console.error(`  - ${e}`))
  process.exit(1)
}
console.log('✓ 配置校验通过')
