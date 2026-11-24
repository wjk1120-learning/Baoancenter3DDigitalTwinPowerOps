<script setup lang="ts">
import { computed, reactive, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import BuildingStatsPanel from './components/BuildingStatsPanel.vue'
import FloorStatsPanel from './components/FloorStatsPanel.vue'
import CabinetPanel from './components/CabinetPanel.vue'
import ChannelPanel from './components/ChannelPanel.vue'
import DevicePanel from './components/DevicePanel.vue'
import DictionaryPanel from './components/DictionaryPanel.vue'
import DataTypePanel from './components/DataTypePanel.vue'
import HealthTemplatePanel from './components/HealthTemplatePanel.vue'
import CameraPanel from './components/CameraPanel.vue'

defineOptions({ name: 'ConfigurationPage' })
// 照搬福永配置中心参考包；宝安适配：顶部内边距改用顶栏令牌（80+24 与原 104px 等值）。
// 有意不进 App.vue keep-alive（每次进入重拉数据，福永同款）；页签单例见 store/pageTabs。

// 侧栏分组：基础配置 / 能耗配置（2026-11-11 用户参考样式；2026-11-17 组名「能耗分析」→「能耗配置」）
const basicBoards = [
  { id: 'device-types', label: '设备类型' },
  { id: 'switchings', label: '配电房' },
  { id: 'buildings', label: '楼栋' },
  { id: 'channels', label: '通道' },
  { id: 'devices', label: '设备' },
  { id: 'cabinets', label: '箱柜' },
  { id: 'health-templates', label: '健康度模板' },
  { id: 'cameras', label: '监控配置' },
] as const
const statBoards = [
  { id: 'building-stats', label: '楼栋能耗统计' },
  { id: 'building-floor-stats', label: '楼层能耗统计' },
  { id: 'data-types', label: '数据类型' },
] as const
const boardGroups = [
  { label: '基础配置', items: basicBoards },
  { label: '能耗配置', items: statBoards },
] as const
const boards = [...basicBoards, ...statBoards]
type BoardId = (typeof boards)[number]['id']

const boardHints: Record<BoardId, string> = {
  'device-types': '维护设备类型字典',
  switchings: '维护配电房字典',
  buildings: '维护楼栋字典，箱柜和能耗统计都按此归属',
  channels: '维护 CET 通道的 ID 与名称，删除前先预检影响的设备、映射和告警位置，再二次确认。',
  devices: '按筛选查看设备，可修改所属箱柜和管理编号，管理编号用于告警位置解析。',
  cabinets: '维护箱柜档案，更换管理编号会影响历史巡检与缺陷关联。',
  'health-templates': '维护健康度评估模板，按设备类型名称精确匹配箱柜，保存即生效。',
  cameras: '维护萤石摄像头台账，保存后环境监控页即可拉流播放。',
  'building-stats': '维护参与楼栋/全院能耗汇总的设备与系数，填写设备 ID 新增后立即计入统计。',
  'building-floor-stats': '按楼栋和楼层维护测点组与系数，变更会在次日重新计算楼层日能耗。',
  'data-types': '维护电能参数曲线的数据类型字典，新增即时可用于测点详情曲线。',
}

// 侧栏简约线性图标（16×16，stroke 跟随文字颜色）；每项为一组 path 的 d 数据
const boardIcons: Record<BoardId, string[]> = {
  // 设备类型：四宫格分类
  'device-types': [
    'M2.2 2.2h4.4v4.4H2.2z',
    'M9.4 2.2h4.4v4.4H9.4z',
    'M2.2 9.4h4.4v4.4H2.2z',
    'M9.4 9.4h4.4v4.4H9.4z',
  ],
  // 配电房：闪电
  switchings: ['M8.7 1.4 2.6 9.1h4.3L6.6 14.6l6.8-8.2H9.1z'],
  // 楼栋：楼体 + 窗 + 门
  buildings: [
    'M2.6 14V2.4a1 1 0 0 1 1-1h8.8a1 1 0 0 1 1 1V14',
    'M1.6 14.2h12.8',
    'M5.2 4.9h1.7M9.1 4.9h1.7M5.2 7.7h1.7M9.1 7.7h1.7',
    'M6.7 14.2v-2.9h2.6v2.9',
  ],
  // 通道：双向箭头
  channels: ['M2 5.2h9.4', 'M9 2.4l2.8 2.8-2.8 2.8', 'M14 10.8H4.6', 'M7 8.3l-2.7 2.5 2.7 2.5'],
  // 设备：显示器
  devices: [
    'M1.8 3.4a1.2 1.2 0 0 1 1.2-1.2h10a1.2 1.2 0 0 1 1.2 1.2v6a1.2 1.2 0 0 1-1.2 1.2H3a1.2 1.2 0 0 1-1.2-1.2z',
    'M5.3 14h5.4',
    'M8 10.6V14',
  ],
  // 箱柜：档案箱
  cabinets: [
    'M2.6 1.8h10.8a1 1 0 0 1 1 1v1.4a1 1 0 0 1-1 1H2.6a1 1 0 0 1-1-1V2.8a1 1 0 0 1 1-1z',
    'M2.6 5.2v7.4a1 1 0 0 0 1 1h8.8a1 1 0 0 0 1-1V5.2',
    'M6.2 8.3h3.6',
  ],
  // 健康度模板：剪贴板 + 心电波形
  'health-templates': [
    'M5.2 2.6h5.6a1 1 0 0 1 1 1v9.8a1 1 0 0 1-1 1H5.2a1 1 0 0 1-1-1V3.6a1 1 0 0 1 1-1z',
    'M6.4 1.6h3.2v2H6.4z',
    'M5.6 9.4h1.5l.8-2.2 1.2 3.6.8-1.4h1.5',
  ],
  // 监控配置：摄像头（机身 + 镜头锥 + 支架）
  cameras: [
    'M2.4 4.8h6.8a1 1 0 0 1 1 1v4.8a1 1 0 0 1-1 1H2.4a1 1 0 0 1-1-1V5.8a1 1 0 0 1 1-1z',
    'M10.2 6.9l3.4-2v6.2l-3.4-2',
    'M5.8 11.6v2.6',
    'M4.2 14.2h3.2',
  ],
  // 楼栋能耗统计：柱状图
  'building-stats': ['M2.2 13.8V8', 'M6.1 13.8V4.8', 'M9.9 13.8V6.6', 'M13.8 13.8V2.4', 'M1.4 13.8h13.2'],
  // 楼层能耗统计：层叠
  'building-floor-stats': [
    'M8 1.6 14.4 5.2 8 8.8 1.6 5.2z',
    'M2.4 8.4 8 11.6l5.6-3.2',
    'M2.4 11.4 8 14.6l5.6-3.2',
  ],
  // 数据类型：波形线（曲线字典）
  'data-types': ['M1.6 8.2h2.3l1.5-3.9 2.2 7.8 1.7-5.5 1 1.6h4.1'],
}

const route = useRoute()
const router = useRouter()
const board = computed(() => boards.find((item) => item.id === route.query.board)?.id ?? 'device-types')
function selectBoard(id: string) {
  void router.replace({ path: '/configuration', query: { board: id } })
}

// 面板首次选中才挂载（同 NTabPane 惰性渲染），此后 v-show 保留组件状态
const visited = reactive(new Set<string>([board.value]))
watch(board, (id) => {
  visited.add(id)
})
</script>

<template>
  <main class="configuration-page">
    <aside class="config-nav">
      <div v-for="group in boardGroups" :key="group.label" class="config-nav__group">
        <div class="config-nav__group-label">{{ group.label }}</div>
        <button
          v-for="item in group.items"
          :key="item.id"
          type="button"
          class="config-nav__item"
          :class="{ 'config-nav__item--active': board === item.id }"
          @click="selectBoard(item.id)"
        >
          <svg class="config-nav__icon" viewBox="0 0 16 16" aria-hidden="true">
            <path v-for="(d, i) in boardIcons[item.id]" :key="i" :d="d" />
          </svg>
          <span>{{ item.label }}</span>
        </button>
      </div>
    </aside>
    <section class="config-content">
      <div v-for="item in boards" v-show="board === item.id" :key="item.id" class="config-pane">
        <template v-if="visited.has(item.id)">
          <div class="config-breadcrumb">
            <span>配置中心</span>
            <span class="config-breadcrumb__sep">/</span>
            <span>{{ item.label }}</span>
          </div>
          <h1 class="config-title">{{ item.label }}配置</h1>
          <p class="config-hint">{{ boardHints[item.id] }}</p>
          <div class="config-divider" />
          <ChannelPanel v-if="item.id === 'channels'" />
          <DevicePanel v-else-if="item.id === 'devices'" />
          <CabinetPanel v-else-if="item.id === 'cabinets'" :create-on-mount="route.query.create === '1'" />
          <BuildingStatsPanel v-else-if="item.id === 'building-stats'" />
          <FloorStatsPanel v-else-if="item.id === 'building-floor-stats'" />
          <DataTypePanel v-else-if="item.id === 'data-types'" />
          <HealthTemplatePanel v-else-if="item.id === 'health-templates'" />
          <CameraPanel v-else-if="item.id === 'cameras'" />
          <DictionaryPanel
            v-else-if="item.id === 'device-types' || item.id === 'switchings' || item.id === 'buildings'"
            :board="item.id" />
        </template>
      </div>
    </section>
  </main>
</template>

<style>
.configuration-page {
  height: 100%;
  overflow: hidden;
  padding: calc(var(--topbar-height) + 24px) 42px 32px;
  color: var(--text-1);
  display: flex;
  flex-direction: row;
  gap: 20px;
  --config-nav-width: 188px;
}
.config-title { margin: 0 0 10px; font-size: 30px; line-height: 1.2; }
.config-hint { margin: 0 0 14px; color: var(--muted); font-size: 15px; line-height: 1.6; }
/* 表单内裸字段提示弱化为辅助文案（宝安补的福永遗漏：福永仅 HealthTemplatePanel 的
 * .dlg-hint 有样式，ChannelPanel/CabinetPanel 等表单提示是裸 <p>，长成正文）。
 * 规格照抄福永 .dlg-hint；只命中 NForm 直接子级的 p——删除确认正文都在 NForm 外，不受影响。 */
.config-modal .n-form > p {
  margin: 0 0 12px;
  font-size: 13px;
  color: var(--muted);
  line-height: 1.6;
}
.config-breadcrumb {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 0 0 6px;
  font-size: 14px;
  color: var(--muted);
}
.config-breadcrumb__sep { color: var(--border-strong); }
/* 标题组下的渐变线：圆头（左）→ 渐隐尖尾（右），占整行 61.8%；
 * flex:none 钉住高度——pane 是纵向 flex，内容超高时默认 flex-shrink:1 会把这条空元素线压成 0 高（2026-11-17 实测修复） */
.config-divider {
  flex: none;
  width: 61.8%;
  height: 3px;
  margin: 14px 0 0;
  border-radius: 999px 0 0 999px;
  margin-bottom: 16px;
  background: linear-gradient(
    90deg,
    var(--primary-700) 0%,
    var(--primary) 38%,
    rgba(82, 149, 232, 0.45) 74%,
    rgba(82, 149, 232, 0) 100%
  );
}
.config-notice { margin-bottom: 12px; }
.config-toolbar { display: flex; flex-wrap: wrap; align-items: center; gap: 12px; margin: 0 0 16px; }
.config-toolbar__filters { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; min-width: 0; }
.config-modal { width: min(660px, calc(100vw - 32px)); }
/* 健康度模板整树编辑器等宽弹窗变体 */
.config-modal--wide { width: min(1080px, calc(100vw - 32px)); }
.config-modal .n-alert { margin-bottom: 14px; }
.config-content { flex: 1 1 auto; min-width: 0; display: flex; flex-direction: column; }
.config-pane {
  flex: 1 1 auto;
  min-height: 0;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  /* 内容超高的兜底滚动仍保留，但不显示侧边大滚动条（滚轮/触摸板仍可滚） */
  scrollbar-width: none;
}
.config-pane::-webkit-scrollbar { display: none; }
/* 面板根节点（breadcrumb/h1/p/divider 之外的 div）与卡片纵向撑满，使各板块卡片底边与侧栏底边平齐 */
.config-pane > div:not(.config-divider):not(.config-breadcrumb) {
  flex: 1 0 auto;
  display: flex;
  flex-direction: column;
}
.config-pane .config-card {
  flex: 1 0 auto;
}
.config-nav {
  flex: none;
  width: var(--config-nav-width);
  display: flex;
  flex-direction: column;
  padding: 12px 10px 10px;
  border-radius: 10px;
  background: var(--primary-100);
}
.config-nav__group { display: flex; flex-direction: column; }
.config-nav__group + .config-nav__group { margin-top: 10px; }
.config-nav__group-label { padding: 6px 8px; font-size: 13px; color: var(--muted); }
.config-nav__item {
  position: relative;
  display: flex;
  align-items: center;
  gap: 9px;
  width: 100%;
  padding: 9px 10px;
  border: none;
  border-radius: 8px;
  background: transparent;
  cursor: pointer;
  font: inherit;
  font-size: 18px;
  color: var(--title);
  text-align: left;
}
.config-nav__item:hover { background: rgba(255, 255, 255, 0.55); }
.config-nav__item--active {
  background: var(--panel-solid);
  color: var(--primary-700);
  font-weight: 600;
}
/* 选中项左缘的蓝色指示条 */
.config-nav__item--active::before {
  content: '';
  position: absolute;
  left: 0;
  top: 22%;
  bottom: 22%;
  width: 3px;
  border-radius: 2px;
  background: var(--primary-600);
}
.config-nav__icon {
  width: 16px;
  height: 16px;
  flex: none;
  fill: none;
  stroke: currentColor;
  stroke-width: 1.5;
  stroke-linecap: round;
  stroke-linejoin: round;
}
</style>
