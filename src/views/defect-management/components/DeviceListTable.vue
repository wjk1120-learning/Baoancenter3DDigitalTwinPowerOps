<script setup lang="ts">
/**
 * 缺陷管理页 · 设备列表（列口径 2026-11-12 用户定稿：楼栋/设备编号/箱柜名称/设备类型/
 * 有无缺陷/缺陷数量/最近缺陷发现日期/操作；无序号列，服务端分页 12 条/页，
 * 行序=服务端契约行序（v5.4.2：缺陷数量降序，同数量保持台账序））。
 * 行 = §4.5 箱柜缺陷联合查询行直读。「查看」上抛开弹窗（页面按需调 §4.2）；
 * 「详情」上抛由页面经 §1.10 转换 superId 后跳设备详情页。纯展示：筛选与分页由页面负责。
 */
export interface DefectListRow {
  buildingName: string
  deviceNumber: string
  name: string
  type: string
  hasDefect: boolean
  defectCount: number
  latestDefectDate: string | null
}

defineProps<{
  rows: DefectListRow[]
  total: number
  page: number
  pageSize: number
  totalPages: number
  loading: boolean
  /** 左侧楼栋树筛选标签（'' = 全部楼栋） */
  channelLabel: string
  /** 空态文案（加载中与「暂无匹配设备」区分） */
  emptyText: string
}>()

const emit = defineEmits<{
  'update:page': [page: number]
  view: [row: DefectListRow]
  detail: [row: DefectListRow]
}>()

function dash(v: string | null | undefined): string {
  return String(v ?? '').trim() || '—'
}
</script>

<template>
  <section class="dl-card glass-panel">
    <div class="dl-head">
      <h3 class="dl-title">{{ channelLabel }}设备列表</h3>
      <span class="dl-count">共 {{ total }} 台</span>
    </div>

    <div class="dl-scroll">
      <table class="dl-table">
        <thead>
          <tr>
            <th class="c-channel">楼栋</th>
            <th class="c-code">设备编号</th>
            <th class="c-name">箱柜名称</th>
            <th class="c-type">设备类型</th>
            <th class="c-has">有无缺陷</th>
            <th class="c-defect">缺陷数量</th>
            <th class="c-latest">最近缺陷发现日期</th>
            <th class="c-op">操作</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="d in rows" :key="d.deviceNumber">
            <td class="c-channel">{{ dash(d.buildingName) }}</td>
            <td class="c-code mono">{{ dash(d.deviceNumber) }}</td>
            <td class="c-name cell-name">{{ dash(d.name) }}</td>
            <td class="c-type">{{ dash(d.type) }}</td>
            <td class="c-has">
              <span class="has-pill" :class="d.hasDefect ? 'has' : 'none'">
                {{ d.hasDefect ? '有' : '无' }}
              </span>
            </td>
            <td class="c-defect">
              <span class="defect-num" :class="{ has: d.defectCount > 0 }">
                {{ d.defectCount }}
              </span>
            </td>
            <td class="c-latest mono">{{ dash(d.latestDefectDate) }}</td>
            <td class="c-op">
              <span class="op-group">
                <button type="button" class="op-btn view" @click="emit('view', d)">查看</button>
                <button type="button" class="op-btn detail" @click="emit('detail', d)">详情</button>
              </span>
            </td>
          </tr>
          <tr v-if="!rows.length">
            <td class="dl-empty" colspan="8">{{ loading ? '加载中…' : emptyText }}</td>
          </tr>
        </tbody>
      </table>
    </div>

    <div class="dl-foot">
      <span class="dl-foot-total">共 {{ total }} 台</span>
      <div class="pg-btns">
        <button type="button" :disabled="page <= 1" @click="emit('update:page', page - 1)">
          ‹
        </button>
        <span class="pg-info">{{ page }} / {{ totalPages }}</span>
        <button type="button" :disabled="page >= totalPages" @click="emit('update:page', page + 1)">
          ›
        </button>
      </div>
    </div>
  </section>
</template>

<style scoped>
.dl-card {
  /* 内容自然撑开（分页固定 12 行，无内部滚动——2026-11-12 用户口径） */
  flex: none;
  display: flex;
  flex-direction: column;
  padding: 16px 18px 14px;
  border-radius: var(--radius);
  box-shadow: var(--card-shadow);
}
.dl-head {
  flex: none;
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 10px;
}
.dl-title {
  margin: 0;
  font-size: 17px;
  font-weight: 700;
  color: var(--title);
  position: relative;
  padding-left: 12px;
}
.dl-title::before {
  content: '';
  position: absolute;
  left: 0;
  top: 50%;
  transform: translateY(-50%);
  width: 3px;
  height: 15px;
  background: var(--primary);
  border-radius: 2px;
}
.dl-count {
  margin-left: auto;
  font-size: 13px;
  color: var(--muted);
}

.dl-scroll {
  /* 纯容器：行数由分页固定，不做内部滚动 */
}

.dl-table {
  width: 100%;
  table-layout: fixed;
  border-collapse: collapse;
  font-size: 15px;
}
.dl-table th,
.dl-table td {
  padding: 8px 6px;
  text-align: center;
  border-bottom: 1px solid var(--border);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  vertical-align: middle;
}
.dl-table th {
  color: var(--title);
  font-weight: 700;
  background: #eaf3fb;
  font-size: 14px;
  letter-spacing: 0.4px;
}
.dl-table th:first-child {
  border-top-left-radius: 6px;
}
.dl-table th:last-child {
  border-top-right-radius: 6px;
}
.dl-table tbody tr:hover {
  background: var(--primary-50);
}
.c-channel {
  width: 10%;
}
.c-code {
  width: 12%;
}
.c-name {
  width: 23%;
}
.c-type {
  width: 10%;
}
.c-has {
  width: 9%;
}
.c-defect {
  width: 8%;
}
.c-latest {
  width: 14%;
}
.c-op {
  width: 14%;
}
.cell-name {
  color: var(--title);
  font-weight: 500;
}
.mono {
  font-family: var(--font-mono);
  font-size: 13px;
}
.muted {
  color: var(--muted);
}

.defect-num {
  font-size: 16px;
  font-weight: 700;
  font-family: var(--font-mono);
  color: var(--muted);
}
.defect-num.has {
  color: var(--danger-text);
}

.has-pill {
  display: inline-flex;
  align-items: center;
  padding: 2px 10px;
  border-radius: 999px;
  font-size: 13px;
  font-weight: 600;
}
.has-pill.has {
  color: var(--warn-text);
  background: rgba(245, 166, 35, 0.12);
}
.has-pill.none {
  color: var(--ok-text);
  background: rgba(46, 196, 142, 0.12);
}

/* 操作列：成对小按钮（查看=主操作实心渐变 / 详情=次操作浅底描边） */
.op-group {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}
.op-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 3px 12px;
  border-radius: 6px;
  border: 1px solid transparent;
  font-size: 13px;
  font-weight: 600;
  font-family: inherit;
  line-height: 1.5;
  cursor: pointer;
  white-space: nowrap;
  transition: all 0.18s;
}
.op-btn.view {
  color: #fff;
  background: linear-gradient(135deg, var(--primary-400), var(--primary));
  box-shadow: 0 2px 6px rgba(82, 149, 232, 0.28);
}
.op-btn.view:hover {
  transform: translateY(-1px);
  box-shadow: 0 4px 10px rgba(82, 149, 232, 0.38);
}
.op-btn.view:active {
  transform: translateY(0);
  box-shadow: 0 1px 4px rgba(82, 149, 232, 0.3);
}
.op-btn.detail {
  color: var(--primary-700);
  background: var(--primary-50);
  border-color: var(--primary-100, #bfdbfe);
}
.op-btn.detail:hover {
  color: var(--primary);
  border-color: var(--primary-300);
  background: #e8f2fd;
}
.op-btn.detail:active {
  background: #dcebfa;
}

.dl-empty {
  text-align: center;
  color: var(--muted);
  padding: 36px 0 !important;
  font-size: 15px;
}

.dl-foot {
  flex: none;
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: 10px;
  padding-top: 10px;
  border-top: 1px solid var(--border);
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
  transition: all 0.15s;
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
  font-size: 14px;
  color: var(--muted);
  padding: 0 6px;
  font-family: var(--font-mono);
}
</style>
