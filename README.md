# Baoancenter3DDigitalTwinPowerOps

宝安中心医院 3D 孪生电力运维平台。以福永项目（../Fuyong3DDigitalTwinPowerOps）为蓝本**参照式重写**：结构照搬、债务清偿、每层与旧项目对拍验证。

## 验证哲学

旧项目 = 标准答案。三层对拍，逐层证明可替代：

1. 数学对拍：布局算法输出坐标与旧 computeCircuitLayout 逐位一致
2. 渲染对拍：同模型同角度截图肉眼比对
3. 功能对拍：按旧项目 8 个页面功能清单逐项验收

## 目录结构（模块自治：页面、独有组件、引擎、数据全在模块目录下）

```text
src/
├─ main.ts / App.vue           # 入口（App = 顶栏 + 页内标签切换的壳）
├─ assets/logo.png             # 顶栏 logo（暂用福永图占位）
├─ styles/theme.css            # 全局样式（用户自福永原样搬来的设计令牌）
├─ components/                 # 跨模块组件
│  ├─ TopBar.vue               #   顶部栏（品牌/页签/导航下拉/时钟/全屏）
│  └─ PageTabs.vue             #   页内标签条
├─ config/navConfig.ts         # 顶部导航清单
├─ store/pageTabs.ts           # 页内标签状态（无 pinia，模块级单例）
└─ views/
   ├─ placeholder/             # 未移植模块的占位页
   │  └─ PlaceholderPage.vue
   └─ power-room/              # 配电房模块
      ├─ PowerRoomPage.vue     # 页面（房间切换 / 顶栏胶囊）
      ├─ components/           # 模块独有组件
      │  └─ CategoryPanel.vue  #   房间分类卡片
      ├─ engine/               # 3D 引擎层（对应福永 engine/）
      │  ├─ layout.ts          #   布局纯函数（数学对拍对象）
      │  ├─ scene.ts           #   场景（渲染态/灯光/地面/摆柜/动画）
      │  └─ bus.ts             #   母线光路（光芯 + 流光）
      └─ data/                 # 模块数据
         ├─ power-rooms.json   #   图纸+档案合并配置（6 房 31 台）
         └─ powerRoom.ts       #   类型 schema
```

后续扩张仍按模块优先：接后端时建 `api/`、多页面时建 `router/`（届时 App.vue 的 v-if 换 `<router-view>`）——模块私有的东西一律先进自己的模块目录。

## 命名规范

- 目录：kebab-case（`power-room/`、`engine/`、`data/`）
- Vue 组件：PascalCase（`PowerRoomPage.vue`、`CategoryPanel.vue`）
- 引擎/工具 ts 模块：camelCase（`layout.ts`、`powerRoom.ts`）
- 配置 JSON：kebab-case（`power-rooms.json`）

## 当前进状

- [x] 配置 schema + 校验脚本（scripts/check-power-rooms.mjs，零依赖）
- [x] 数学对拍通过（engine/layout.ts vs 旧 circuit.ts，标准答案在 fixtures/）
- [x] 现场采集表模板 + 转换流水线（Excel → power-rooms.json）
- [x] 模块开发文档 ×2（配电房 + 楼栋，docs/）
- [x] Vite + Vue3 骨架
- [x] 3D 配电房场景：摆柜 / 名字牌 / 灯光 / 科技蓝地面 / 流光母线 / 6 房切换
- [ ] 点击柜体交互（选中 / 看板）
- [ ] 登录对接 / HTTP / WS（照搬旧项目）
- [ ] 楼栋模块（按 docs/楼栋模块开发文档.md）

## 常用命令

```bash
npm run dev           # 开发服务器（5252 被占则自动顺延端口）
npm run build         # 类型检查（vue-tsc）+ 构建
npm run convert       # 采集表 Excel → src/views/power-room/data/power-rooms.json
npm run check         # 配置校验（柜号唯一 / 模型枚举 / 编号正则）
npm run parity        # 数学对拍（vs fixtures/layout-g2.expected.json）
npm run gen:template  # 重新生成空白采集表（需本机 python + openpyxl）
```

## 结构决策

见 docs/decisions.md（每个决策一行理由，先例后改）。

## 注意

- docs/ 与 scripts/ 默认不进 git（.gitignore 用户设定，个别早期文件已入库）；克隆后需自行恢复
- public/models/cabinets/ 下 46MB 柜体 GLB 为福永替身模型，宝安正式模型到位后整体替换
