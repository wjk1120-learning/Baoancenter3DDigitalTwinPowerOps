# Baoancenter3DDigitalTwinPowerOps

宝安中心医院 3D 孪生电力运维平台。以福永项目（../Fuyong3DDigitalTwinPowerOps）为蓝本**参照式重写**：结构照搬、债务清偿、每层与旧项目对拍验证。

## 验证哲学

旧项目 = 标准答案。三层对拍，逐层证明可替代：

1. 数学对拍：布局算法输出坐标与旧 computeCircuitLayout 逐位一致
2. 渲染对拍：同模型同角度截图肉眼比对
3. 功能对拍：按旧项目 8 个页面功能清单逐项验收

## 当前进状

- [x] 配置 schema + 校验脚本（scripts/check-power-rooms.mjs，零依赖）
- [x] 数学对拍通过（src/power-room/layout.mjs vs 旧 circuit.ts）
- [x] 现场采集表模板（docs/配电房摆柜信息采集表.xlsx + 生成脚本）
- [x] 模块开发文档 ×2（配电房 + 楼栋，docs/）
- [x] 目录改名：hospital-twin-next → Baoancenter3DDigitalTwinPowerOps（2026-10-28 完成）
- [ ] Vite + Vue3 骨架
- [ ] 登录对接 / HTTP / WS（照搬旧项目）
- [ ] 3D（复制旧 three/ 改造，福永模型当替身）

## 结构决策

见 docs/decisions.md（每个决策一行理由，先例后改）。

## 校验

```bash
node scripts/check-power-rooms.mjs          # 校验 src/config/power-rooms.json
node scripts/parity-layout.mjs              # 布局对拍（vs fixtures 标准答案）
```
