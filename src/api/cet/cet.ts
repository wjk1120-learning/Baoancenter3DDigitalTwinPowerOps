/**
 * CET 缓存失效入口（配置中心照搬自福永，见福永配置中心参考/source-adaptation/stubs）。
 *
 * 配置中心对 CET 模块的全部依赖只有两个缓存失效入口（useConfiguration.ts 的
 * invalidateCabinetData / invalidateEnergyData）。宝安暂无 CET 采集链路（能耗/设备
 * 数据走 bz 接口 mock，无内存缓存），故为空实现；后续接真后端若能耗/箱柜接口引入
 * 缓存，在这里补真实失效逻辑即可，配置中心调用方不用动。
 */
export function clearCetCache(): void {}

export function clearCetEnergyCache(): void {}
