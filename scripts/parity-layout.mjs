#!/usr/bin/env node
/**
 * 对拍脚本（第①层·数学对拍）：
 * 新实现 layout.mjs 的输出 vs 旧项目 computeCircuitLayout 的运行时标准答案
 * （fixtures/layout-g2.expected.json，由旧项目 vitest 生成）。
 *
 * 用法：node scripts/parity-layout.mjs [配置roomId=旧circuitId]
 * 浮点比较用 1e-9 容差（旧输出含 IEEE 误差如 -1.9799999999999995）。
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { computePowerRoomLayout } from '../src/power-room/layout.mjs'

const EPS = 1e-9
const config = JSON.parse(
  readFileSync(fileURLToPath(new URL('../src/config/power-rooms.json', import.meta.url)), 'utf8'),
)
const expected = JSON.parse(
  readFileSync(fileURLToPath(new URL('../fixtures/layout-g2.expected.json', import.meta.url)), 'utf8'),
)

// 旧标准答案的 circuitId（如 circuit:g2）→ 新配置的房 id（g2）
const roomId = expected.circuit.replace(/^circuit:/, '')
const room = config.rooms.find((r) => r.id === roomId)
if (!room) {
  console.error(`✗ 配置中找不到房 id「${roomId}」（对拍对象缺失）`)
  process.exit(1)
}

const actual = computePowerRoomLayout(room, config.pitch)

const errors = []
// 柜集合一致
const expCodes = expected.slots.map((s) => s.code)
const actCodes = actual.slots.map((s) => s.code)
for (const c of expCodes) if (!actCodes.includes(c)) errors.push(`旧有新无：柜「${c}」`)
for (const c of actCodes) if (!expCodes.includes(c)) errors.push(`新有旧无：柜「${c}」`)

// 坐标逐位比对（容差）
expected.slots.forEach((es) => {
  const as = actual.slots.find((s) => s.code === es.code)
  if (!as) return
  if (Math.abs(as.x - es.x) > EPS) errors.push(`${es.code}.x：旧 ${es.x} vs 新 ${as.x}`)
  if (Math.abs(as.z - es.z) > EPS) errors.push(`${es.code}.z：旧 ${es.z} vs 新 ${as.z}`)
  if (as.row !== es.row) errors.push(`${es.code}.row：旧 ${es.row} vs 新 ${as.row}`)
})
if (Math.abs(actual.maxW - expected.maxW) > EPS)
  errors.push(`maxW：旧 ${expected.maxW} vs 新 ${actual.maxW}`)

console.log(`对拍对象：${expected.circuit}（${expected.slots.length} 台一级柜，${room.rows.length} 排）`)
if (errors.length) {
  console.error(`\n✗ 对拍失败，${errors.length} 处差异：`)
  errors.forEach((e) => console.error(`  - ${e}`))
  process.exit(1)
}
console.log(`✓ 数学对拍通过：${expected.slots.length} 台柜坐标逐位一致，maxW=${actual.maxW}`)
