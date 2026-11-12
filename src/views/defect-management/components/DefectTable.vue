<script setup lang="ts">
import type { CaoliaoRecord } from '../../../api/operation/types'

/**
 * 缺陷记录列表（§4.2 数据，9 列同福永；2026-11-12 用户拍板不删列，
 * 仅表头「发现时间」改「记录时间」——该列值本就取 recordTime）。
 * 纯展示：筛选与分页由页面负责，行内「查看详情」上抛给页面开抽屉。
 * 缺陷管理页「查看」弹窗内复用本组件（传 title="" + plain 去掉卡片外观）。
 */
withDefaults(
  defineProps<{
    rows: CaoliaoRecord[]
    total: number
    page: number
    totalPages: number
    loading: boolean
    /** 空态文案 */
    emptyText: string
    /** 卡片标题；传 '' 隐藏（弹窗内已有自己的标题） */
    title?: string
    /** 无卡片底色/阴影（弹窗内嵌用） */
    plain?: boolean
  }>(),
  { title: '缺陷记录列表' },
)

const emit = defineEmits<{ 'update:page': [page: number]; view: [rec: CaoliaoRecord] }>()

function dash(v: string | null | undefined): string {
  return String(v ?? '').trim() || '—'
}

function riskClass(risk: string | null | undefined): string {
  const s = String(risk || '')
  if (s.includes('重大')) return 'err'
  return s ? 'warn' : 'na'
}

function rectifiedClass(v: string | null | undefined): string {
  const s = String(v || '')
  if (s.includes('已整改')) return 'ok'
  if (s.includes('待停电')) return 'doing'
  return s ? 'warn' : 'na'
}

function stateClass(state: string | null | undefined): string {
  const s = String(state || '')
  if (s === '已完成') return 'ok'
  if (s === '处理中') return 'doing'
  if (s === '待处理') return 'todo'
  return 'na'
}
</script>

<template>
  <section class="dt-card" :class="plain ? 'dt-plain' : 'glass-panel'">
    <div class="dt-head">
      <h3 v-if="title" class="dt-title">{{ title }}</h3>
      <span class="dt-count">共 {{ total }} 条</span>
    </div>

    <div class="dt-scroll">
      <table class="dt-table">
        <thead>
          <tr>
            <th class="c-no">编号</th>
            <th class="c-pos">隐患位置</th>
            <th class="c-desc">隐患描述</th>
            <th class="c-risk">风险等级</th>
            <th class="c-fix">整改情况</th>
            <th class="c-state">处理进度</th>
            <th class="c-reporter">提交人</th>
            <th class="c-time">记录时间</th>
            <th class="c-op">操作</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="rec in rows" :key="rec.recordId">
            <td class="c-no mono">{{ rec.recordId }}</td>
            <td class="c-pos">{{ dash(rec.defectInfo?.hazardPosition) }}</td>
            <td class="c-desc" :title="rec.defectInfo?.hazardDescription || ''">
              {{ dash(rec.defectInfo?.hazardDescription) }}
            </td>
            <td class="c-risk">
              <span class="dt-tag" :class="riskClass(rec.defectInfo?.riskLevel)">{{
                dash(rec.defectInfo?.riskLevel)
              }}</span>
            </td>
            <td class="c-fix">
              <span class="dt-tag" :class="rectifiedClass(rec.defectInfo?.rectified)">{{
                dash(rec.defectInfo?.rectified)
              }}</span>
            </td>
            <td class="c-state">
              <span class="dt-tag" :class="stateClass(rec.processState)">{{
                dash(rec.processState)
              }}</span>
            </td>
            <td class="c-reporter">{{ dash(rec.inspector) }}</td>
            <td class="c-time mono">{{ dash(rec.recordTime) }}</td>
            <td class="c-op">
              <button type="button" class="dt-link" @click="emit('view', rec)">查看详情</button>
            </td>
          </tr>
          <tr v-if="!rows.length">
            <td class="dt-empty" colspan="9">{{ loading ? '加载中…' : emptyText }}</td>
          </tr>
        </tbody>
      </table>
    </div>

    <div class="dt-foot">
      <span class="dt-foot-total">共 {{ total }} 条</span>
      <div class="pg-btns">
        <button type="button" :disabled="page <= 1" @click="emit('update:page', page - 1)">‹</button>
        <span class="pg-info">{{ page }} / {{ totalPages }}</span>
        <button
          type="button"
          :disabled="page >= totalPages"
          @click="emit('update:page', page + 1)"
        >
          ›
        </button>
      </div>
    </div>
  </section>
</template>

<style scoped>
.dt-card {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  padding: 16px 18px 14px;
  border-radius: var(--radius);
  box-shadow: var(--card-shadow);
}
/* 弹窗内嵌：去掉卡片外观，只留表格本体 */
.dt-plain {
  padding: 0;
  box-shadow: none;
}
.dt-head {
  flex: none;
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 10px;
}
.dt-title {
  margin: 0;
  font-size: 17px;
  font-weight: 700;
  color: var(--title);
  position: relative;
  padding-left: 12px;
}
.dt-title::before {
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
.dt-count {
  margin-left: auto;
  font-size: 13px;
  color: var(--muted);
}

.dt-scroll {
  flex: 1;
  min-height: 0;
  overflow: auto;
}
.dt-scroll::-webkit-scrollbar {
  width: 8px;
  height: 8px;
}
.dt-scroll::-webkit-scrollbar-thumb {
  background: rgba(82, 149, 232, 0.25);
  border-radius: 4px;
}
.dt-scroll::-webkit-scrollbar-thumb:hover {
  background: rgba(82, 149, 232, 0.4);
}

.dt-table {
  width: 100%;
  table-layout: fixed;
  border-collapse: collapse;
  font-size: 15px;
}
.dt-table th,
.dt-table td {
  padding: 10px 8px;
  text-align: center;
  border-bottom: 1px solid var(--border);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  vertical-align: middle;
}
.dt-table th {
  color: var(--title);
  font-weight: 700;
  background: #eaf3fb;
  position: sticky;
  top: 0;
  z-index: 1;
  font-size: 14px;
  letter-spacing: 0.4px;
}
.dt-table th:first-child {
  border-top-left-radius: 6px;
}
.dt-table th:last-child {
  border-top-right-radius: 6px;
}
.dt-table tbody tr:hover {
  background: var(--primary-50);
}
.c-no {
  width: 9%;
}
.c-pos {
  width: 14%;
}
.c-desc {
  width: 18%;
}
.c-risk {
  width: 9%;
}
.c-fix {
  width: 10%;
}
.c-state {
  width: 9%;
}
.c-reporter {
  width: 7%;
}
.c-time {
  width: 15%;
}
.c-op {
  width: 9%;
}
/* 隐患描述允许换行完整展示 */
.dt-table td.c-desc {
  white-space: normal;
  word-break: break-word;
  line-height: 1.35;
  text-align: left;
}
.mono {
  font-family: var(--font-mono);
  font-size: 13px;
}

.dt-tag {
  display: inline-block;
  max-width: 100%;
  padding: 2px 9px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  vertical-align: middle;
}
.dt-tag.err {
  color: #e5484d;
  background: #fff1f0;
  border: 1px solid #ffccc7;
}
.dt-tag.warn {
  color: #c8862c;
  background: #fffbe6;
  border: 1px solid #ffe58f;
}
.dt-tag.ok {
  color: #52c41a;
  background: #f6ffed;
  border: 1px solid #b7eb8f;
}
.dt-tag.doing {
  color: var(--primary-700);
  background: var(--primary-50);
  border: 1px solid var(--primary-100, #bfdbfe);
}
.dt-tag.todo {
  color: #c8862c;
  background: #fffbe6;
  border: 1px solid #ffe58f;
}
.dt-tag.na {
  color: var(--muted);
  background: rgba(93, 113, 137, 0.1);
}

.dt-link {
  border: none;
  background: none;
  padding: 0;
  color: var(--primary);
  font-size: 14px;
  font-weight: 600;
  font-family: inherit;
  cursor: pointer;
}
.dt-link:hover {
  text-decoration: underline;
}

.dt-empty {
  text-align: center;
  color: var(--muted);
  padding: 36px 0 !important;
  font-size: 15px;
}

.dt-foot {
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
