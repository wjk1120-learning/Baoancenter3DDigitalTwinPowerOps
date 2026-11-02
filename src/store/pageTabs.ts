import { ref } from 'vue'
import { defineStore } from 'pinia'

export interface PageTab {
  /** 路由 fullPath，作为唯一 key */
  path: string
  /** 显示名称 */
  title: string
  /** 路由 name / 组件名，用于 keep-alive include */
  name: string
}

/** 全局只保留一个标签的页面（忽略 query 差异，复用已有标签；/device-model 随 4.3 加入） */
const SINGLETON_BASES = new Set([
  '/hospital',
  '/device',
  '/alert',
  '/defect',
  '/power-room',
  '/training',
])

function basePath(path: string) {
  return path.split('?')[0] || path
}

/** 页内标签页：替代 window.open 新开浏览器标签（API 照搬福永 store/pageTabs） */
export const usePageTabsStore = defineStore('pageTabs', () => {
  const tabs = ref<PageTab[]>([])
  const activePath = ref('')

  /**
   * 打开或激活一个标签。
   * - 精确 path 已存在 → 直接激活
   * - 单例页面 → 按基础路径复用，不重复开
   */
  function open(path: string, title: string, name: string) {
    const base = basePath(path)
    let existing = tabs.value.find((t) => t.path === path)
    if (!existing && SINGLETON_BASES.has(base)) {
      existing = tabs.value.find((t) => basePath(t.path) === base)
    }
    if (existing) {
      existing.path = path
      existing.title = title
      existing.name = name
      activePath.value = path
      return
    }
    tabs.value.push({ path, title, name })
    activePath.value = path
  }

  function close(path: string) {
    const idx = tabs.value.findIndex((t) => t.path === path)
    if (idx === -1) return
    tabs.value.splice(idx, 1)
    if (activePath.value === path) {
      const next = tabs.value[idx] ?? tabs.value[idx - 1]
      activePath.value = next?.path ?? ''
    }
  }

  function clear() {
    tabs.value = []
    activePath.value = ''
  }

  return { tabs, activePath, open, close, clear }
})
