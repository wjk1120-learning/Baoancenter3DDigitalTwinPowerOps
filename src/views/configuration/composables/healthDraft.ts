/**
 * 健康度模板「本机草稿」存取（2026-11-25 守卫改版：不再拦人，改暂存放行）。
 * 存 localStorage（重开浏览器照样恢复），按模板 id 一张 map；只存本机、后端永远
 * 收不到未通过五规则预检的数据。写入失败（隐私模式/容量满）静默吞掉——草稿是
 * 兜底体验，不值得为它报错打断主流程。
 */
import type { HealthTemplateDimension } from '../../../api/health/types'

export interface HealthLocalDraft {
  /** 壳字段快照：随草稿一起恢复，避免「编辑基本信息」保存后旧壳值回写覆盖 */
  code: string
  typeName: string
  designLifeYears: number | null
  dimensions: HealthTemplateDimension[]
  /** 暂存时间（ISO），横幅展示用 */
  savedAt: string
}

const STORAGE_KEY = 'baoan.healthTemplate.drafts'

function loadAll(): Record<string, HealthLocalDraft> {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}') as Record<string, HealthLocalDraft>
  } catch {
    return {}
  }
}

function saveAll(map: Record<string, HealthLocalDraft>) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(map))
  } catch {
    /* 本机草稿写失败不打断主流程 */
  }
}

export function getDraft(id: number): HealthLocalDraft | null {
  return loadAll()[String(id)] ?? null
}

export function setDraft(id: number, draft: HealthLocalDraft) {
  const map = loadAll()
  map[String(id)] = draft
  saveAll(map)
}

export function removeDraft(id: number) {
  const map = loadAll()
  if (!map[String(id)]) return
  delete map[String(id)]
  saveAll(map)
}

/** ISO → 「2026/11/24 17:06:00」，解析失败原样返回（横幅不至于空白） */
export function formatStamp(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}/${p(d.getMonth() + 1)}/${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`
}
