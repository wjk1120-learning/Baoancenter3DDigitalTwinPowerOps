# power-room 模块复用说明（新医院接入清单）

> 给下一家医院的接手人。本模块 = 配电房 3D 页（总览 → 点柜聚焦 → 开关看板 → 柜体详情跳转），
> 机制代码引擎/组件零医院字面量；医院相关的东西只在这几处：

## 一、接入步骤（按顺序）

1. **拷目录**：把 `src/views/power-room/` 整个拷进新项目。
2. **改接口前缀**：`utils/http/clients.ts` 里 http 实例的 `baseURL` 改成新医院前缀
   （宝中是 `/bz-hospital`）。api 层（`api/device/device.ts`）全部是契约相对路径
   （`/device/switchings` 等），**不用改**——所有医院共用同一份契约（docs/FY-Hospital-API-v3.90.md），
   数据请求链路：§1.3 房列表 → §1.6 房下柜（按房缓存）→ 点柜 §1.8 开关 → §1.11/§3.3 跟随选中开关。
3. **出图纸**：改 `data/power-rooms.json`（房名/柜位/柜号/devCode/pitch），由采集表工具链生成：
   `node scripts/excel-to-rooms.mjs`（devCode 必填+全表唯一，缺/重报错不写盘）→
   `node scripts/check-power-rooms.mjs`。devCode 前缀按新医院规范（宝中=BZ+6位数字），
   绑定键 = 图纸 `devCode` ↔ §1.6 返回 `deviceNumber` **唯一精确匹配**（禁止柜名/前缀模糊匹配）。
4. **放模型**：`public/models/cabinets/` 放柜体 GLB（Draco 压缩，命名=柜型小写拼音，
   如 jinxian/shuangdianyuan/dianrongui/peidiangui + `kaiguan.glb` 二级开关单元）。
   新医院柜型不同 → 改 `config.ts` 的 `CabinetModel` 枚举并同步 `scripts/check-power-rooms.mjs` 的 MODELS。
5. **注册装配**（各项目本来就做）：`router/index.ts` REAL_PAGES、`config/navConfig.ts`、
   `store/pageTabs.ts` SINGLETON_BASES + keepAlive include。

## 二、模块结构（谁负责什么）

```
PowerRoomPage.vue    装配层：数据编排（§1.3→1.6 缓存→绑定→1.8→1.11/3.3）、失败提示文案、路由跳转
config.ts            医院配置：模型目录、柜型枚举（唯一允许出现医院变量的代码文件，图纸 JSON 除外）
data/power-rooms.json 医院图纸（柜位/柜号/devCode）
data/powerRoom.ts    图纸 schema 类型（纯类型）
components/          纯展示组件（props 进、事件出，无 api 依赖）
engine/scene.ts      场景编排：建柜批次/聚焦状态机/动画驱动/拾取（~850 行，编排密度高，见文件头说明）
engine/cabinetModels.ts  模型模板加载/归一化（大柜统一柜高 2.2；kaiguan 三步处理）
engine/focusLayout.ts    聚焦构图解算（纯计算：大柜右侧+开关悬浮墙+直角光路）
engine/flowPath.ts       流光光路段生成
engine/layout.ts         总览柜位（排布纯函数）
engine/bus.ts            总览母线
```

## 三、行为约定（产品定稿，勿自行更改）

- 绑定失败的柜照常摆场，点击提示「未接入设备台账」；
- 数据加载失败三条提示（§1.3「配电房列表数据加载失败」/§1.6「{房名}下的柜体信息加载失败」/
  §1.8「当前柜体下的开关设备数据加载失败」），**失败结果不缓存**（下次进房/点击自动重试）；
- 点柜默认选中第一个开关，测点/历史告警跟随开关查询；
- 没有当前告警模块（该口径=WS 推流按柜名过滤，契约无此接口，不可靠）。

## 四、已知限制

- `engine/focusLayout.ts` 与福永项目是两份副本，无同步机制，一侧改动另一侧不会自动跟；
  2026-11-11 实例：宝中曾在开关摆场缩放里多乘模板归一化系数（福永没有），导致选中名牌压到
  上一行开关——已修回福永同链路（popBase=f.scale，见 scene.ts selectCabinet 注释），勿改回；
  再遇两边行为不一致，先读运行时真实数值找首个分叉点，别直接调构图参数；
- `engine/scene.ts` 拆分后仍约 850 行（编排密度高，再拆收益递减，见文件头说明）；
- 3D 模型资产（public/models/cabinets/*.glb）不在本目录内，拷目录时记得一起搬；
- 调试工具：`src/tests/PowerRoomDebugPage.vue`（dev 路由 /tests/power-room）挂引擎调试句柄
  （window.__prDebug），可读开关/名牌真实世界数值——新医院对数值时可一并拷走；
- 第三家医院出现时再评估升级为共享包/npm 私有包。
