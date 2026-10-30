import { ref } from 'vue'

export interface PageTab {
  /** 视图路径，作为唯一 key（暂无 router，对应 App.vue 的视图表） */
  path: string
  /** 显示名称 */
  title: string
  /** 模块 id（navConfig.id） */
  name: string
}

/**
 * 页内标签页状态（API 照搬福永 store/pageTabs；宝安暂无 pinia，
 * 用模块级单例等价实现，后续引入 pinia 时改 defineStore 即可）。
 */
const tabs = ref<PageTab[]>([])
const activePath = ref('')

/** 打开或激活一个标签 */
function open(path: string, title: string, name: string) {
  if (!tabs.value.some((t) => t.path === path)) tabs.value.push({ path, title, name })
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

export function usePageTabs() {
  return { tabs, activePath, open, close, clear }
}
