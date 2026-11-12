<script setup lang="ts">
import { ref } from 'vue'

export interface SidebarChannel {
  chnID: number
  chnName: string
  /** 楼栋角标计数；不传不显示（缺陷管理页 §1.2 楼栋无柜数） */
  deviceCount?: number
}

defineProps<{
  channels: SidebarChannel[]
  selectedChnId: number | null
  totalDevices: number
}>()

const emit = defineEmits<{ 'select-channel': [chnID: number | null] }>()

const hospitalName = '宝安中心医院'

const treeExpanded = ref<Set<string>>(new Set(['root', 'city', 'hospital']))

function toggleNode(id: string) {
  if (treeExpanded.value.has(id)) treeExpanded.value.delete(id)
  else treeExpanded.value.add(id)
}

function selectHospitalNode() {
  toggleNode('hospital')
  emit('select-channel', null)
}
</script>

<template>
  <aside class="dm-sidebar glass-panel">
    <div class="sb-head">
      <svg
        viewBox="0 0 24 24"
        width="18"
        height="18"
        fill="none"
        stroke="var(--primary)"
        stroke-width="2"
        stroke-linecap="round"
      >
        <path d="M3 6h18M3 12h18M3 18h12" />
      </svg>
      <span>楼栋</span>
    </div>
    <div class="tree">
      <div class="tnode">
        <div class="trow root" @click="toggleNode('root')">
          <span class="tarrow">{{ treeExpanded.has('root') ? '▾' : '▸' }}</span>
          <span> 深圳市</span>
        </div>
        <div v-if="treeExpanded.has('root')" class="tchildren">
          <div class="tnode">
            <div
              class="trow hospital"
              :class="{ active: selectedChnId == null }"
              @click="selectHospitalNode()"
            >
              <span class="tarrow">{{ treeExpanded.has('hospital') ? '▾' : '▸' }}</span>
              <span> {{ hospitalName }}</span>
            </div>
            <div v-if="treeExpanded.has('hospital')" class="tchildren">
              <div
                v-for="ch in channels"
                :key="ch.chnID"
                class="trow leaf"
                :class="{ active: selectedChnId === ch.chnID }"
                @click="emit('select-channel', ch.chnID)"
              >
                <span class="tdot" /><span class="tlabel" :title="ch.chnName">{{ ch.chnName }}</span
                ><span v-if="ch.deviceCount != null" class="tcount">{{ ch.deviceCount }}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
    <div class="sb-foot">
      <div class="sb-stat">
        <span class="sb-num">{{ channels.length }}</span
        ><span class="sb-lbl">楼栋</span>
      </div>
      <div class="sb-stat">
        <span class="sb-num">{{ totalDevices }}</span
        ><span class="sb-lbl">箱柜总数</span>
      </div>
    </div>
  </aside>
</template>

<style scoped>
/* 侧边栏 */
.dm-sidebar {
  position: relative;
  z-index: 10;
  width: 268px;
  flex: none;
  margin: calc(var(--topbar-height) + 14px) 0 18px 18px;
  border-radius: var(--radius);
  display: flex;
  flex-direction: column;
  box-shadow: var(--card-shadow);
  overflow: hidden;
}
.sb-head {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 18px 20px 14px;
  font-size: 17px;
  font-weight: 700;
  color: var(--title);
  border-bottom: 1px solid var(--border);
  position: relative;
}
.sb-head::after {
  content: '';
  position: absolute;
  left: 20px;
  right: 20px;
  bottom: -1px;
  height: 2px;
  background: linear-gradient(90deg, var(--primary), transparent);
  border-radius: 2px;
}
.tree {
  flex: 1;
  overflow-y: auto;
  flex: 1;
  overflow-y: auto;
  padding: 10px 10px 8px;
}
.tree::-webkit-scrollbar {
  width: 6px;
}
.tree::-webkit-scrollbar-thumb {
  background: rgba(82, 149, 232, 0.25);
  border-radius: 3px;
}
.tnode {
  margin: 2px 0;
}
.trow {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 9px 12px;
  border-radius: var(--radius-sm);
  cursor: pointer;
  font-size: 15px;
  color: var(--text);
  transition: all 0.18s ease;
  user-select: none;
  border: 1px solid transparent;
}
.trow:hover {
  background: var(--primary-50);
  color: var(--primary);
}
.trow.active {
  background: linear-gradient(135deg, rgba(255, 255, 255, 0.95), var(--primary-50));
  color: var(--primary-700);
  font-weight: 600;
  border-color: rgba(82, 149, 232, 0.3);
  box-shadow: 0 2px 8px rgba(82, 149, 232, 0.12);
}
.trow.root {
  font-weight: 700;
  color: var(--title);
  font-size: 16px;
}
.trow.hospital {
  font-weight: 600;
}
.tarrow {
  width: 12px;
  font-size: 13px;
  color: var(--muted);
  flex: none;
  text-align: center;
}
.tchildren {
  padding-left: 18px;
  margin: 2px 0 4px;
  border-left: 1px dashed rgba(82, 149, 232, 0.25);
  margin-left: 18px;
}
.trow.leaf {
  font-size: 14.5px;
  padding: 7px 12px;
  gap: 10px;
}
.tdot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--primary-300);
  flex: none;
  box-shadow: 0 0 0 2px rgba(82, 149, 232, 0.15);
  transition: all 0.18s;
}
.trow.leaf.active .tdot {
  background: var(--primary);
  box-shadow: 0 0 0 3px rgba(82, 149, 232, 0.25);
}
.tlabel {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.tcount {
  font-size: 13px;
  font-weight: 700;
  color: var(--primary-700);
  background: var(--primary-50);
  padding: 2px 8px;
  border-radius: 999px;
  flex: none;
  font-family: var(--font-mono);
}
.trow.leaf.active .tcount {
  background: var(--primary);
  color: var(--on-primary);
}

/* 侧边栏底部统计 */
.sb-foot {
  margin-top: auto;
  display: flex;
  gap: 10px;
  padding: 14px 18px 16px;
  border-top: 1px solid var(--border);
  background: rgba(234, 243, 251, 0.25);
}
.sb-stat {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
}
.sb-num {
  font-size: 24px;
  font-weight: 700;
  color: var(--primary-700);
  font-family: var(--font-mono);
  line-height: 1.1;
}
.sb-lbl {
  font-size: 13px;
  color: var(--muted);
}
</style>
