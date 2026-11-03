<script setup lang="ts">
import type { DeviceDetail, SuperDevice } from '../../../api/device/types'
import { healthGrade } from '../../../config/healthGrades'

/**
 * 设备目录主表（4.2② 照福永 DeviceTable 列结构/样式重写）：
 * - cabinet 模式：§1.4 浏览 / §1.10 柜名检索（序号/楼栋/设备编号/箱柜名称/类型/日期/健康度/测点数/有无开关/操作）
 * - device 模式：§1.9 设备名检索结果（序号/设备ID/设备名称/柜体名称/启用状态/历史告警数/操作）
 */
const props = defineProps<{
  mode: 'cabinet' | 'device'
  rows: (SuperDevice & { buildingName?: string })[] | DeviceDetail[]
  loading: boolean
  gradeLabel: string
  channelLabel: string
  total: number
  page: number
  totalPages: number
}>()

const emit = defineEmits<{
  viewPoints: [cabinet: SuperDevice]
  /** 柜行「详情」→ 父级跳设备详情页（福永 enterDevice3D 同款） */
  open: [cabinet: SuperDevice]
  viewDevice: [device: DeviceDetail]
  page: [page: number]
}>()

function pad2(n: number): string {
  return String(n).padStart(2, '0')
}

function healthClass(h: number | null): string {
  const g = healthGrade(h)
  return `hp-${g ?? 'none'}`
}
</script>

<template>
  <section class="dt-main glass-panel">
    <header class="dt-head">
      <span class="dt-title">{{ props.mode === 'device' ? '测点设备列表' : '全部设备设备列表' }}</span>
      <span class="dt-sub">
        {{ props.total }} 个{{ props.mode === 'device' ? '测点设备' : '箱柜' }} ·
        {{ props.channelLabel }}{{ props.mode === 'cabinet' && props.gradeLabel !== '全部设备' ? ` · ${props.gradeLabel}` : '' }}
      </span>
    </header>
    <div class="table-scroll">
      <table v-if="props.mode === 'cabinet'" class="dm-table">
        <thead>
          <tr>
            <th class="c-idx">序号</th>
            <th class="c-channel">楼栋</th>
            <th class="c-num">设备编号</th>
            <th class="c-name">箱柜名称</th>
            <th class="c-type">设备类型</th>
            <th class="c-date">投运日期</th>
            <th class="c-health">健康度</th>
            <th class="c-count">测点数</th>
            <th class="c-switch">有无开关</th>
            <th class="c-op">操作</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="(c, i) in (props.rows as (SuperDevice & { buildingName?: string })[])" :key="c.id">
            <td class="mono">{{ pad2((props.page - 1) * 16 + i + 1) }}</td>
            <td>{{ c.buildingName || '—' }}</td>
            <td class="mono">{{ c.deviceNumber || '—' }}</td>
            <td class="cell-name">{{ c.superName || '—' }}</td>
            <td><span class="type-badge">{{ c.deviceType || '—' }}</span></td>
            <td class="mono">{{ c.commissionDate || '—' }}</td>
            <td>
              <span class="hp-pill" :class="healthClass(c.health)">
                {{ c.health != null ? c.health : '—' }}
              </span>
            </td>
            <td class="mono c-strong">{{ c.deviceCount }}</td>
            <td>
              <span class="sw-badge" :class="c.status === 1 ? 'on' : 'off'">
                <i class="dot" />{{ c.status === 1 ? '有' : '无' }}
              </span>
            </td>
            <td class="c-op">
              <span class="op-btns">
                <button
                  class="op-btn ghost"
                  :class="{ muted: !c.deviceCount }"
                  type="button"
                  @click="emit('viewPoints', c)"
                >
                  测点
                </button>
                <button class="op-btn primary" type="button" @click="emit('open', c)">详情</button>
              </span>
            </td>
          </tr>
        </tbody>
      </table>

      <table v-else class="dm-table">
        <thead>
          <tr>
            <th class="c-idx">序号</th>
            <th class="c-num">设备ID</th>
            <th class="c-name">设备名称</th>
            <th class="c-cab">柜体名称</th>
            <th class="c-type">启用状态</th>
            <th class="c-health">历史告警数</th>
            <th class="c-op">操作</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="(d, i) in props.rows as DeviceDetail[]" :key="d.deviceId">
            <td class="mono">{{ pad2(i + 1) }}</td>
            <td class="mono">{{ d.deviceId }}</td>
            <td class="cell-name">{{ d.deviceName }}</td>
            <td class="cell-sub">{{ d.superName || '—' }}</td>
            <td>
              <span class="st-pill" :class="d.enabled === 1 ? 'st-done' : 'st-pending'">
                {{ d.enabled === 1 ? '启用' : '停用' }}
              </span>
            </td>
            <td>
              <span class="alarm-tag" :class="{ zero: !d.alarmCount }">{{ d.alarmCount }}</span>
            </td>
            <td class="c-op">
              <span class="op-btns">
                <button class="op-btn primary" type="button" @click="emit('viewDevice', d)">查看</button>
              </span>
            </td>
          </tr>
        </tbody>
      </table>

      <div v-if="!props.rows.length" class="dempty">
        {{ props.loading ? '加载中…' : '无匹配数据' }}
      </div>
    </div>
    <footer class="dt-foot">
      <span>共 {{ props.total }} 条</span>
      <div class="pg-btns">
        <button :disabled="props.page <= 1" @click="emit('page', props.page - 1)">‹</button>
        <span class="pg-info">{{ props.page }} / {{ props.totalPages }}</span>
        <button :disabled="props.page >= props.totalPages" @click="emit('page', props.page + 1)">›</button>
      </div>
    </footer>
  </section>
</template>

<style scoped>
.dt-main {
  flex: 1;
  min-width: 0;
  border-radius: var(--radius);
  box-shadow: var(--card-shadow);
  display: flex;
  flex-direction: column;
  padding: 14px 18px 10px;
}
.dt-head {
  flex: none;
  display: flex;
  align-items: baseline;
  gap: 12px;
  padding-bottom: 10px;
  margin-bottom: 10px;
}
.dt-title {
  font-size: 20px;
  font-weight: 700;
  color: var(--title);
}
.dt-sub {
  font-size: 14px;
  color: var(--muted);
}
.table-scroll {
  flex: 1;
  overflow: auto;
  min-height: 0;
}
.table-scroll::-webkit-scrollbar {
  width: 8px;
  height: 8px;
}
.table-scroll::-webkit-scrollbar-thumb {
  background: rgba(82, 149, 232, 0.25);
  border-radius: 4px;
}
.dm-table {
  width: 100%;
  table-layout: fixed;
  border-collapse: collapse;
  font-size: 17px;
}
.dm-table th,
.dm-table td {
  padding: 11px 10px;
  text-align: center;
  border-bottom: 1px solid var(--border);
  vertical-align: middle;
  line-height: 1.45;
}
.dm-table th {
  color: var(--title);
  font-weight: 700;
  background: var(--primary-50);
  position: sticky;
  top: 0;
  z-index: 1;
  letter-spacing: 0.2px;
  height: 36px;
  box-sizing: border-box;
}
.dm-table tbody tr {
  transition: background 0.15s;
}
.dm-table tbody tr:hover {
  background: var(--primary-50);
}
/* 列宽对齐福永：短字段略窄、名称略宽，操作列留足双按钮并排 */
.c-idx {
  width: 5%;
}
.c-channel {
  width: 8%;
}
.c-num {
  width: 9%;
}
.c-name {
  width: 20%;
}
.cell-name {
  text-align: left;
  color: var(--primary-700);
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.c-cab {
  width: 22%;
}
.cell-sub {
  text-align: left;
  color: var(--text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.c-type {
  width: 10%;
}
.c-date {
  width: 11%;
}
.c-health {
  width: 8%;
}
.c-count {
  width: 7%;
}
.c-switch {
  width: 8%;
}
.c-op {
  width: 16%;
}
.c-strong {
  font-weight: 700;
  color: var(--title);
}
.mono {
  font-family: var(--font-mono);
  font-size: 15px;
}
.type-badge {
  display: inline-block;
  padding: 2px 10px;
  border-radius: 4px;
  font-size: 14px;
  color: var(--primary-700);
  background: rgba(43, 124, 227, 0.08);
}
.hp-pill {
  display: inline-block;
  min-width: 34px;
  padding: 2px 10px;
  border-radius: 999px;
  font-size: 14px;
  font-weight: 700;
  font-family: var(--font-mono);
}
/* 优/良属正常值：用户设计定稿用主题蓝（黄=一般、红=差） */
.hp-pill.hp-excellent {
  color: var(--primary-700);
  background: rgba(43, 124, 227, 0.14);
}
.hp-pill.hp-good {
  color: var(--primary-700);
  background: rgba(43, 124, 227, 0.1);
}
.hp-pill.hp-fair {
  color: #d80;
  background: rgba(216, 136, 0, 0.12);
}
.hp-pill.hp-poor,
.hp-pill.hp-terrible {
  color: var(--danger);
  background: rgba(229, 72, 77, 0.12);
}
.hp-pill.hp-none {
  color: var(--muted);
  background: var(--primary-50);
}
.sw-badge {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 2px 10px;
  border-radius: 999px;
  font-size: 14px;
  font-weight: 600;
}
.sw-badge .dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
}
.sw-badge.on {
  color: var(--primary-700);
  background: rgba(43, 124, 227, 0.1);
}
.sw-badge.on .dot {
  background: var(--primary);
}
.sw-badge.off {
  color: var(--muted);
  background: var(--primary-50);
}
.sw-badge.off .dot {
  background: var(--muted);
}
.alarm-tag {
  font-family: var(--font-mono);
  font-weight: 700;
  color: var(--danger);
}
.alarm-tag.zero {
  color: var(--muted);
}
.st-pill {
  display: inline-flex;
  padding: 2px 10px;
  border-radius: 999px;
  font-size: 14px;
  font-weight: 600;
}
.st-pill.st-done {
  color: var(--ok-text);
  background: rgba(46, 196, 142, 0.12);
}
.st-pill.st-pending {
  color: var(--danger-text);
  background: rgba(239, 68, 68, 0.12);
}
.op-btns {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  white-space: nowrap;
}
.op-btn {
  padding: 4px 14px;
  border-radius: var(--radius-sm);
  border: 1px solid transparent;
  background: transparent;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.15s;
}
/* 福永同款：测点=白底描边主题色字；详情/查看=实心主题色 */
.op-btn.ghost {
  border-color: var(--primary);
  color: var(--primary);
}
.op-btn.ghost:hover:not(.muted) {
  background: var(--primary-50);
}
.op-btn.ghost.muted {
  border-color: var(--border);
  color: var(--muted);
  background: rgba(93, 113, 137, 0.08);
}
.op-btn.primary {
  color: var(--on-primary);
  background: linear-gradient(135deg, var(--primary-400), var(--primary));
}
.op-btn.primary:hover {
  transform: translateY(-1px);
  box-shadow: 0 2px 8px rgba(82, 149, 232, 0.28);
}
.dempty {
  text-align: center;
  color: var(--muted);
  padding: 40px !important;
  font-size: 16px;
}
.dt-foot {
  flex: none;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding-top: 8px;
  font-size: 14px;
  color: var(--muted);
}
.pg-btns {
  display: flex;
  align-items: center;
  gap: 8px;
}
.pg-btns button {
  min-width: 32px;
  height: 32px;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: rgba(255, 255, 255, 0.85);
  cursor: pointer;
  font-size: 14px;
  color: var(--text);
}
.pg-btns button:hover:not(:disabled) {
  border-color: var(--primary);
  color: var(--primary);
  background: var(--primary-50);
}
.pg-btns button:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
.pg-info {
  font-family: var(--font-mono);
  padding: 0 6px;
}
</style>
