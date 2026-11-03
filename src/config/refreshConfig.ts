/** 前端数据刷新节奏（集中配置） */

/** 测点类：设备特写 / 建模页 / 变压器表盘 — 每 5 分钟一批，批内错峰 */
export const MEAS_BATCH_INTERVAL_MS = 5 * 60 * 1000

/** 批内相邻任务最大间隔（避免单批拖太长） */
export const MEAS_BATCH_MAX_STAGGER_MS = 30_000

/** 3D 楼栋能耗染色 + 告警特效（REST 兜底周期；告警可由 WS 提前更新） */
export const SCENE_REFRESH_MS = 2 * 60 * 1000

/** 能耗轮询周期：v3.90 起 /ws/energy 下线，能耗（2.1/2.3）= 定时轮询；服务端缓存每 20 分钟刷新 */
export const ENERGY_POLL_MS = 10 * 60 * 1000

/** WS 超过此时间无推送 → 触发 REST 兜底（防抖：触发后重置计时） */
export const WS_STALE_MS = 90_000

/** WS 断线后先给重连留宽限：短暂断线恢复则不降级，持续断线才 REST 兜底（兜底按 WS_STALE_MS 节流） */
export const WS_DISCONNECT_GRACE_MS = 20_000

/** 告警 WS 连上后若迟迟没有事件载荷，先用 /FY/event/today 填「告警信息」 */
export const EVENT_WS_FIRST_FALLBACK_MS = 3_000

/** WS 健康检查轮询间隔 */
export const WS_HEALTH_CHECK_MS = 30_000
