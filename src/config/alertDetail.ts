import type { AlertItem } from '../api/hospital/types'

/**
 * 告警快照：抽屉详情的数据通道（openEventDetail 写、抽屉读同一份 AlertItem）。
 * 福永同款 sessionStorage 通道；quickAlert 快览弹窗随总览任务（4.5）再引入。
 */

const SNAPSHOT_KEY = 'mes-alert-snapshot'

export function saveAlertSnapshot(a: AlertItem) {
  try {
    sessionStorage.setItem(SNAPSHOT_KEY, JSON.stringify(a))
  } catch {
    /* ignore quota */
  }
}

export function readAlertSnapshot(id?: string): AlertItem | null {
  try {
    const raw = sessionStorage.getItem(SNAPSHOT_KEY)
    if (!raw) return null
    const a = JSON.parse(raw) as AlertItem
    if (id && a.id !== id) return null
    return a
  } catch {
    return null
  }
}
