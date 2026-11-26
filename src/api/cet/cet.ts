/**
 * CET 缓存失效入口（配置中心照搬自福永，见福永配置中心参考/source-adaptation/stubs）。
 *
 * 配置中心对 CET 模块的全部依赖只有两个缓存失效入口（useConfiguration.ts 的
 * invalidateCabinetData / invalidateEnergyData）。宝安各页接口无内存缓存
 * （2026-11-25 联调拍板：前端不做数据缓存，新鲜度由后端 Redis 兜），故为空实现；
 * 后续若引入页面级缓存，在这里补真实失效逻辑即可，配置中心调用方不用动。
 */
export function clearCetCache(): void {}

export function clearCetEnergyCache(): void {}
