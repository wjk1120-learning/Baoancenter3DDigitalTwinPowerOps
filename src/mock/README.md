# src/mock — 宝中占位假数据（唯一出处）

后端未就绪期间的占位层。接口契约照搬福永（见 `docs/福永接口契约参考-*.md`）。
真后端就绪后：`.env.development` 的 `VITE_USE_MOCK=false` 即切真联调；
稳定上线后**删除本目录即退役**，业务代码零残留。

## 开关与接线

| 层 | mock 方式 | 挂点 |
|---|---|---|
| REST | axios adapter 位拦截（不出网络，走完整拦截器链：信封解包/401/重试） | `utils/http/clients.ts` 三实例 `defaults.adapter` |
| 会话 | authMock 播种 userLevel=1 假会话（写真实 session 存储） | `main.ts start()` |
| WS | wsMock 与 eventPushSocket 同接口（定时器 8~15s 推假告警） | eventPushSocket 4.1 落地时在 connect 内按 `useMock()` 分支 |

## 已 mock 接口（对照福永契约，缺口随阶段 4 页面补）

| 方法 路径 | 福永文档 | 数据来源 |
|---|---|---|
| GET /event/today?page&pageSize | 3.1 今日告警分页 | data/event.ts 8 条 EventBrief（按时间倒序） |
| GET /event/grouped[?level] | 3.2 按设备聚合 | 同一份数据实时聚合 |
| GET /event/stats | 3.4 分级统计 | 同一份数据实时汇总 |
| POST /event/{eventId}/handle | 3.10 标记处理 | 改数据数组，stats/grouped 联动 |
| POST /event/sync | 3.9 手动同步 | 恒返 0（互斥跳过语义） |
| /auth/*（logout/tickets/exchange） | §4 认证中心 | 未 mock（4.0 登录移植时补） |
| 设备/能耗/缺陷/园区接口 | 1.x / 2.x / 4.x | 未 mock（对应页面 4.2~4.6 时补） |

## 文件职责

`index.ts` 总开关 · `mockAdapter.ts` axios 拦截 · `routes.ts` 路由表+匹配（带单测）·
`wsMock.ts` 假推送 · `authMock.ts` 假会话 · `data/` 假数据
