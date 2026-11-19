<script setup lang="ts">
/**
 * 楼层选择器（3D 园区二期批2，福永 FloorPanel 同构浅色版）：
 * 楼栋聚焦态从左侧滑入的竖排楼层列表——头部只留楼栋名（四格统计已推翻删除，2026-11-19），
 * 行 = 楼层号 + 状态文字（紧急红/严重橙/正常），数据与 3D 亮灯/看板共用一份 §3.11 分桶
 * （summarizeFloorAlarms，「面板染色 == 3D 楼层亮光」口径）。
 * 可收起为窄条（仅楼层号竖排）；选中楼层自动收起（列表/3D 楼层两个入口都经 selectedFloor）；
 * 换楼栋重新展开。楼层行 = GLB 实际节点（引擎 getFloors），宝中无 G 层，地下 -N 在
 * _under 接入后自然出现。
 */
import { ref, watch } from 'vue'
import { floorNodeName } from '../../three/campus/buildings'
import type { FloorAlarmSummary } from './floorAlarmState'

const props = defineProps<{
  buildingId: number
  buildingName: string
  /** 契约楼层键升序（引擎 getFloors：GLB 实际节点） */
  floors: string[]
  /** 楼层告警分桶（summarizeFloorAlarms 结果；键含 -1 等无节点层由行清单自然过滤） */
  alarms: Map<string, FloorAlarmSummary>
  /** 当前选中层（楼层态高亮；null = 未选层） */
  selectedFloor?: string | null
}>()
const emit = defineEmits<{ 'focus-floor': [floor: string] }>()

const collapsed = ref(false)
watch(
  () => props.buildingId,
  () => {
    collapsed.value = false
  },
)
watch(
  () => props.selectedFloor,
  (v) => {
    if (v != null) collapsed.value = true
  },
)

function pick(floor: string) {
  emit('focus-floor', floor)
}

function rowClass(floor: string): 'normal' | 'warn' | 'error' {
  const s = props.alarms.get(floor)
  if (!s || s.level === 0) return 'normal'
  return s.level === 1 ? 'error' : 'warn'
}
function rowText(floor: string): string {
  const s = props.alarms.get(floor)
  if (!s || s.level === 0) return '正常'
  return s.level === 1 ? '紧急' : '严重'
}
const label = (floor: string) => floorNodeName(floor) ?? floor
</script>

<template>
  <aside class="fp glass-card" :class="{ collapsed }">
    <template v-if="!collapsed">
      <header class="fp-head">
        <h3 class="fp-title">{{ buildingName }}</h3>
        <button type="button" class="fp-fold" aria-label="收起楼层列表" @click="collapsed = true">«</button>
      </header>
      <div class="fp-list">
        <button
          v-for="f in floors"
          :key="f"
          type="button"
          class="fp-row"
          :class="[rowClass(f), { active: selectedFloor === f }]"
          @click="pick(f)"
        >
          <span class="fp-floor">{{ label(f) }}</span>
          <span class="fp-state">{{ rowText(f) }}</span>
        </button>
      </div>
    </template>
    <template v-else>
      <button type="button" class="fp-fold" aria-label="展开楼层列表" title="展开楼层列表" @click="collapsed = false">»</button>
      <div class="fp-chips">
        <button
          v-for="f in floors"
          :key="f"
          type="button"
          class="fp-chip"
          :class="[rowClass(f), { active: selectedFloor === f }]"
          :title="`${label(f)} ${rowText(f)}`"
          @click="pick(f)"
        >
          {{ label(f) }}
        </button>
      </div>
    </template>
  </aside>
</template>

<style scoped>
.fp {
  position: absolute;
  left: 24px;
  top: calc(var(--topbar-height) + 16px);
  bottom: 24px;
  width: 360px;
  z-index: 20;
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 18px 16px 16px;
}
/* 收起态：竖窄条（福永同款布局）——顶部展开按钮 + 楼层芯片竖排一列（一键切层） */
.fp.collapsed {
  width: 76px;
  align-items: center;
  gap: 10px;
  padding: 14px 8px 12px;
}
/* 细长条上 glass-card 的装饰光斑会拉丝，收起态收掉 */
.fp.collapsed::before,
.fp.collapsed::after {
  display: none;
}
.fp-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}
.fp-title {
  margin: 0;
  font-size: 20px;
  font-weight: 700;
  color: var(--title);
  letter-spacing: 1px;
}
.fp-fold {
  width: 28px;
  height: 28px;
  border-radius: 8px;
  border: 1px solid rgba(90, 107, 128, 0.35);
  background: rgba(255, 255, 255, 0.6);
  color: var(--title);
  font-size: 16px;
  line-height: 1;
  cursor: pointer;
  flex: none;
}
.fp-fold:hover {
  background: rgba(43, 124, 227, 0.12);
}
.fp-list {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding-right: 4px;
}
.fp-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 9px 14px;
  border-radius: 10px;
  border: 1px solid rgba(90, 107, 128, 0.22);
  background: rgba(255, 255, 255, 0.55);
  cursor: pointer;
  transition: background 0.15s ease, border-color 0.15s ease;
}
.fp-row:hover {
  background: rgba(43, 124, 227, 0.1);
}
.fp-floor {
  font-size: 16px;
  font-weight: 700;
  color: var(--title);
  font-family: var(--font-mono);
}
.fp-state {
  font-size: 13px;
  color: var(--muted);
}
/* 行染色（与 3D 亮灯同色系：紧急红 / 严重橙） */
.fp-row.warn {
  border-color: rgba(232, 163, 61, 0.55);
  background: rgba(237, 137, 54, 0.12);
}
.fp-row.warn .fp-state {
  color: #d98a1f;
  font-weight: 600;
}
.fp-row.error {
  border-color: rgba(229, 62, 62, 0.5);
  background: rgba(229, 62, 62, 0.1);
}
.fp-row.error .fp-state {
  color: #d64545;
  font-weight: 600;
}
.fp-row.active {
  background: var(--primary);
  border-color: var(--primary);
}
.fp-row.active .fp-floor,
.fp-row.active .fp-state {
  color: #fff;
}
/* 收起态楼层芯片：竖排一列、一键切层；当前层蓝底，告警层染色（同 3D 亮灯色系） */
.fp-chips {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 2px 0;
  scrollbar-width: none;
}
.fp-chips::-webkit-scrollbar {
  display: none;
}
.fp-chip {
  flex: none;
  width: 52px;
  padding: 9px 0;
  border-radius: 12px;
  border: 1px solid rgba(90, 107, 128, 0.2);
  background: rgba(255, 255, 255, 0.72);
  font-size: 14px;
  font-weight: 600;
  color: var(--title);
  font-family: var(--font-mono);
  cursor: pointer;
  box-shadow: 0 1px 4px rgba(43, 108, 160, 0.1);
  transition: transform 0.15s ease, background 0.15s ease, border-color 0.15s ease;
}
.fp-chip:hover {
  transform: translateY(-1px);
  background: rgba(255, 255, 255, 0.92);
}
.fp-chip.warn {
  border-color: rgba(232, 163, 61, 0.55);
  background: rgba(237, 137, 54, 0.16);
  color: #d98a1f;
}
.fp-chip.error {
  border-color: rgba(229, 62, 62, 0.5);
  background: rgba(229, 62, 62, 0.12);
  color: #d64545;
}
.fp-chip.active {
  background: var(--primary);
  border-color: var(--primary);
  color: #fff;
  box-shadow: 0 2px 8px rgba(43, 124, 227, 0.35);
}
/* 键盘可达（hallmark 底线：交互件必须有 focus-visible） */
.fp-row:focus-visible,
.fp-chip:focus-visible,
.fp-fold:focus-visible {
  outline: 2px solid var(--primary);
  outline-offset: 1px;
}
</style>
