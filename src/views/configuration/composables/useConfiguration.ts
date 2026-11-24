/**
 * 配置中心 composable（照搬福永配置中心参考包）：
 * - canWriteConfiguration：写按钮显隐（level 0/1），后端 403 兜底
 * - invalidateCabinetData / invalidateEnergyData：配置变更后通知其它页面缓存失效
 * - useConfigList：列表加载（版本号竞态保护 + 卸载作废）
 * - useConfigMutation：写操作（saving 锁、失败就地报错、成功才 reload）
 */
import { computed, onScopeDispose, ref, shallowRef } from 'vue'
import { clearCetCache, clearCetEnergyCache } from '../../../api/cet/cet'
import { useDeviceCatalogStore } from '../../../store/deviceCatalog'
import { readAuthUser } from '../../../utils/session'
import { globalMessage } from '../../../utils/message'

export function canWriteConfiguration(level = readAuthUser()?.userLevel) {
  return level === 0 || level === 1
}

export function invalidateCabinetData() {
  clearCetCache()
  useDeviceCatalogStore().invalidate()
}

export function invalidateEnergyData() {
  clearCetEnergyCache()
}

export function configError(error: unknown) {
  return error instanceof Error ? error.message : '请求失败，请重试'
}

export function useConfigList<T>(fetchRows: () => Promise<T[]>) {
  const rows = shallowRef<T[]>([])
  const loading = ref(false)
  const error = ref('')
  let version = 0

  async function reload() {
    const request = ++version
    loading.value = true
    error.value = ''
    rows.value = []
    try {
      const result = await fetchRows()
      if (request === version) rows.value = result
    } catch (e) {
      if (request === version) error.value = configError(e)
    } finally {
      if (request === version) loading.value = false
    }
  }

  onScopeDispose(() => { version++ })
  return { rows, loading, error, reload }
}

export function useConfigMutation(afterSave: () => void | Promise<void>) {
  const saving = ref(false)
  const error = ref('')
  const warnings = ref<string[]>([])
  const writable = computed(() => canWriteConfiguration())

  async function submit(action: () => Promise<unknown>, reload = true) {
    /* action 的返回值不参与成败判定（抛错=失败），故接受任意 Promise */
    if (!canWriteConfiguration() || saving.value) return false
    saving.value = true
    error.value = ''
    try {
      await action()
      // 宝安定制（2026-11-24 用户拍板，偏离福永原版）：成功统一给轻提示——
      // 福永成功仅关弹窗+列表刷新，无反馈。放在 mutation 层，批次 2-4 照搬的
      // 面板走同一入口自动获得；失败仍走弹窗内红条（不在全局重复报）。
      globalMessage()?.success('操作成功')
      if (reload) await afterSave()
      return true
    } catch (e) {
      error.value = configError(e)
      return false
    } finally {
      saving.value = false
    }
  }

  return { saving, error, warnings, writable, submit }
}
