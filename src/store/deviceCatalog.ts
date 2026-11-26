/**
 * 设备目录缓存失效入口（配置中心照搬自福永，见福永配置中心参考/source-adaptation/stubs）。
 *
 * 配置中心对设备目录 store 的全部依赖是 useDeviceCatalogStore().invalidate()
 * （useConfiguration.ts 的 invalidateCabinetData 在箱柜/设备等配置变更后调用）。
 * 宝安设备目录无共享 store 缓存（各页面自行拉取，前端不做数据缓存），故用普通函数空实现；
 * 后续若建目录缓存 store，替换为 pinia 实现即可，配置中心调用方不用动。
 */
export function useDeviceCatalogStore() {
  return {
    invalidate(): void {},
  }
}
