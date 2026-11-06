<script setup lang="ts">
import { NImage } from 'naive-ui'
import type { CaoliaoRecord } from '../../../api/operation/types'

/**
 * 缺陷记录卡（§4.2 按箱柜编号查询）。
 * 条目模板与维护记录一致：头部时间 + 本月 + 风险等级/流程状态标签，
 * 中间行元数据（记录编号/位置/描述/提交人，有几种显示几种），缩略图行点击放大预览。
 * 点击整卡打开右侧缺陷详情抽屉（DefectDetailDrawer）。
 */
defineProps<{ records: CaoliaoRecord[]; loading: boolean }>()

const emit = defineEmits<{ open: [record: CaoliaoRecord] }>()

/** 流程状态标签配色（运维平台同款语义色） */
function stateClass(state: string | null | undefined): string {
  const s = String(state || '')
  if (s === '已完成') return 'ok'
  if (s === '处理中') return 'doing'
  if (s === '待处理') return 'todo'
  return 'na'
}

/** 风险等级标签配色 */
function riskClass(risk: string | null | undefined): string {
  const s = String(risk || '')
  if (s.includes('重大')) return 'err'
  if (s) return 'warn'
  return 'na'
}

function fmtTime(t: string): string {
  return String(t || '').slice(0, 16)
}

function isThisMonth(t: string): boolean {
  const d = new Date(String(t || '').replace(/-/g, '/'))
  if (Number.isNaN(d.getTime())) return false
  const now = new Date()
  return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth()
}

/** 缩略图：整改前 → 整改中 → 整改后 → 作业，最多 4 张 */
function thumbs(rec: CaoliaoRecord): string[] {
  const g = rec.defectInfo
  if (!g) return []
  return [
    ...(g.beforeImageUrls ?? []),
    ...(g.duringImageUrls ?? []),
    ...(g.afterImageUrls ?? []),
    ...(g.workImageUrls ?? []),
  ].slice(0, 4)
}
</script>

<template>
  <div class="info-card glass-panel defect-card">
    <div class="card-title">
      缺陷记录
      <span v-if="records.length" class="dc-count">共 {{ records.length }} 条</span>
    </div>
    <div v-if="records.length" class="defect-list">
      <button
        v-for="rec in records"
        :key="rec.recordId"
        type="button"
        class="maint-card-item"
        @click="emit('open', rec)"
      >
        <div class="mc-head">
          <span class="mc-time mono">{{ fmtTime(rec.recordTime) }}</span>
          <div class="mc-head-right">
            <span v-if="isThisMonth(rec.recordTime)" class="mc-month-tag">本月</span>
            <span
              v-if="rec.defectInfo?.riskLevel"
              class="dc-risk"
              :class="riskClass(rec.defectInfo.riskLevel)"
              >{{ rec.defectInfo.riskLevel }}</span
            >
            <span v-if="rec.processState" class="dc-state" :class="stateClass(rec.processState)">{{
              rec.processState
            }}</span>
          </div>
        </div>

        <div class="mc-meta">
          <span v-if="rec.recordId" class="mc-meta-field">
            <span class="mc-meta-label">记录编号:</span>
            <span class="mc-meta-value">{{ rec.recordId }}</span>
            <span class="mc-meta-sep">·</span>
          </span>
          <span v-if="rec.position" class="mc-meta-field">
            <span class="mc-meta-label">位置:</span>
            <span class="mc-meta-value">{{ rec.position }}</span>
            <span class="mc-meta-sep">·</span>
          </span>
          <span v-if="rec.defectInfo?.hazardDescription" class="mc-meta-field dc-desc">
            <span class="mc-meta-label">描述:</span>
            <span class="mc-meta-value">{{ rec.defectInfo.hazardDescription }}</span>
            <span class="mc-meta-sep">·</span>
          </span>
          <span v-if="rec.defectInfo?.reporterName" class="mc-meta-field">
            <span class="mc-meta-label">提交人:</span>
            <span class="mc-meta-value">{{ rec.defectInfo.reporterName }}</span>
          </span>
        </div>

        <div v-if="thumbs(rec).length" class="mc-gallery">
          <n-image
            v-for="(url, i) in thumbs(rec)"
            :key="i"
            class="mc-thumb"
            :src="url"
            preview
            :img-props="{ alt: '缺陷照片' }"
          />
        </div>
      </button>
    </div>
    <div v-else-if="loading" class="defect-empty">加载中…</div>
    <div v-else class="defect-empty">
      <svg
        class="de-icon"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="1.6"
        stroke-linecap="round"
        stroke-linejoin="round"
        aria-hidden="true"
      >
        <path d="M22 12h-4l-3 8-4-16-3 8H2" />
      </svg>
      <span>暂无缺陷记录</span>
    </div>
  </div>
</template>

<style scoped>
.defect-card {
  /* 卡片基底（福永页面级 .info-card 同款）：padding/圆角/阴影，glass-panel 只提供底色边框 */
  padding: 16px 18px;
  border-radius: var(--radius);
  box-shadow: var(--card-shadow);
  overflow: hidden;
  /* 比告警记录卡（等高趋势图）占更多高度：设备信息卡腾出的空间由缺陷记录承接 */
  flex: 1.4;
  min-height: 0;
  display: flex;
  flex-direction: column;
}
.card-title {
  font-size: 18px;
  font-weight: 700;
  color: var(--title);
  margin-bottom: 14px;
  position: relative;
  padding-left: 12px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex: none;
}
.card-title::before {
  content: '';
  position: absolute;
  left: 0;
  top: 50%;
  transform: translateY(-50%);
  width: 3px;
  height: 16px;
  background: var(--primary);
  border-radius: 2px;
}
.dc-count {
  font-size: 13px;
  font-weight: 500;
  color: var(--muted);
  padding-left: 8px;
}

.defect-list {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding-right: 6px;
  padding-bottom: 4px;
}
.defect-list::-webkit-scrollbar {
  width: 8px;
}
.defect-list::-webkit-scrollbar-thumb {
  background: rgba(82, 149, 232, 0.4);
  border-radius: 4px;
}

/* 复用维护记录卡片的条目模板（scoped 内重新声明） */
.maint-card-item {
  display: block;
  width: 100%;
  text-align: left;
  font: inherit;
  color: inherit;
  background: #fff;
  border: 1px solid var(--border);
  border-left: 3px solid var(--warn);
  border-radius: 10px;
  padding: 10px 14px;
  box-shadow: 0 1px 3px rgba(43, 108, 160, 0.05);
  transition: box-shadow 0.15s;
  flex: none;
  cursor: pointer;
}
.maint-card-item:hover {
  box-shadow: 0 3px 10px rgba(43, 108, 160, 0.12);
}

.mc-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 6px;
  margin-bottom: 6px;
}
.mc-head-right {
  display: flex;
  align-items: center;
  gap: 6px;
  flex: none;
}
.mc-time {
  font-size: 14px;
  font-weight: 700;
  color: var(--primary-700);
  letter-spacing: 0.2px;
}
.mc-month-tag {
  font-size: 12px;
  font-weight: 600;
  color: var(--primary-700);
  background: var(--primary-50);
  border: 1px solid var(--primary-100, #bfdbfe);
  border-radius: 999px;
  padding: 1px 8px;
}
.dc-risk,
.dc-state {
  font-size: 12px;
  font-weight: 600;
  border-radius: 999px;
  padding: 1px 8px;
  white-space: nowrap;
}
.dc-risk.err {
  color: #e5484d;
  background: #fff1f0;
  border: 1px solid #ffccc7;
}
.dc-risk.warn {
  color: #c8862c;
  background: #fffbe6;
  border: 1px solid #ffe58f;
}
.dc-risk.na {
  color: var(--muted);
  background: rgba(93, 113, 137, 0.1);
}
.dc-state.ok {
  color: #52c41a;
  background: #f6ffed;
  border: 1px solid #b7eb8f;
}
.dc-state.doing {
  color: var(--primary-700);
  background: var(--primary-50);
  border: 1px solid var(--primary-100, #bfdbfe);
}
.dc-state.todo {
  color: #c8862c;
  background: #fffbe6;
  border: 1px solid #ffe58f;
}
.dc-state.na {
  color: var(--muted);
  background: rgba(93, 113, 137, 0.1);
}

.mc-meta {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0 4px;
  font-size: 13px;
  line-height: 1.6;
  margin-bottom: 6px;
  color: var(--muted);
}
.mc-meta-field {
  display: inline-flex;
  align-items: baseline;
  min-width: 0;
}
.dc-desc .mc-meta-value {
  display: inline-block;
  max-width: 150px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  vertical-align: bottom;
}
.mc-meta-label {
  color: var(--muted);
  margin-right: 3px;
}
.mc-meta-value {
  color: var(--text);
  font-weight: 500;
}
.mc-meta-sep {
  margin: 0 6px;
  color: var(--border);
}

.mc-gallery {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}
.mc-thumb {
  display: block;
  width: 72px;
  height: 54px;
  border-radius: 6px;
  border: 1px solid var(--border);
  overflow: hidden;
  cursor: pointer;
}
.mc-thumb :deep(img) {
  width: 72px;
  height: 54px;
  object-fit: cover;
  display: block;
}

.defect-empty {
  flex: 1;
  min-height: 120px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  font-size: 15px;
  color: var(--muted);
}
.de-icon {
  width: 34px;
  height: 34px;
  color: #b9cee9;
}
</style>
