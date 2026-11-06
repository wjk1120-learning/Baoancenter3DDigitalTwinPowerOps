<script setup lang="ts">
import { NImage } from 'naive-ui'
import type { InspectDeviceRecord } from '../../../api/operation/types'

/**
 * 维护记录卡（巡检记录，§4.1 按箱柜编号查询）。
 * 头部时间 + 本月标签 + 巡检结果标签；中间行按记录实际有值字段动态渲染
 * （记录编号/巡检人/温度/最热点电流）；缩略图行点击可放大预览。
 */
const props = defineProps<{
  records: InspectDeviceRecord[]
  loading: boolean
  /** 卡片位置行展示用的箱柜名（§4.1 的 superDeviceName 与目录名一致时直接用它） */
  cabinetName: string
}>()

/** 时间展示：yyyy-MM-dd HH:mm */
function fmtTime(t: string): string {
  return String(t || '').replace('T', ' ').slice(0, 16)
}

/** 是否本月 */
function isThisMonth(t: string): boolean {
  const d = new Date(String(t || '').replace(/-/g, '/'))
  if (Number.isNaN(d.getTime())) return false
  const now = new Date()
  return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth()
}

/** 卡片中间行元数据：按记录实际有值字段动态构建（温度/电流金色高亮） */
interface MetaField {
  label: string
  value: string
  accent?: boolean
}

function metaFields(rec: InspectDeviceRecord): MetaField[] {
  const fields: MetaField[] = []
  if (rec.recordId) fields.push({ label: '记录编号', value: rec.recordId })
  if (props.cabinetName || rec.superDeviceName) {
    fields.push({ label: '箱柜名称', value: props.cabinetName || rec.superDeviceName })
  }
  if (rec.inspector) fields.push({ label: '巡检人', value: rec.inspector })
  if (rec.temperature != null) {
    fields.push({ label: '设备运行温度', value: `${rec.temperature}℃`, accent: true })
  }
  // 最热点电流不展示（2026-11-06 用户定稿：元数据行只留 记录编号/扫码位置/巡检人/设备温度）
  return fields
}

/** 缩略图：箱柜巡检照 + 红外图 + 最热点电流图，最多 4 张 */
function thumbs(rec: InspectDeviceRecord): { url: string; tag: string }[] {
  const list: { url: string; tag: string }[] = []
  const photos = String(rec.deviceImage || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
  for (const p of photos) list.push({ url: p, tag: '设备' })
  if (rec.temperatureImage) list.push({ url: rec.temperatureImage, tag: '红外' })
  if (rec.currentImage) list.push({ url: rec.currentImage, tag: '电流' })
  return list.slice(0, 4)
}
</script>

<template>
  <div class="info-card glass-panel maint-card">
    <div class="card-title">
      维护记录
      <span v-if="records.length" class="mc-count">共 {{ records.length }} 条</span>
    </div>
    <div v-if="records.length" class="maint-list">
      <div v-for="rec in records" :key="rec.recordId" class="maint-card-item">
        <div class="mc-head">
          <span class="mc-time mono">{{ fmtTime(rec.createdAt) }}</span>
          <div class="mc-head-right">
            <span v-if="isThisMonth(rec.createdAt)" class="mc-month-tag">本月</span>
            <span
              v-if="rec.inspectResult"
              class="mc-result-tag"
              :class="rec.inspectResult === '正常' ? 'ok' : 'err'"
              >{{ rec.inspectResult }}</span
            >
          </div>
        </div>

        <!-- 中间元数据行：按记录实际字段动态渲染，有几种显示几种 -->
        <div v-if="metaFields(rec).length" class="mc-meta">
          <span v-for="(f, i) in metaFields(rec)" :key="i" class="mc-meta-field">
            <span class="mc-meta-label">{{ f.label }}:</span>
            <span class="mc-meta-value" :class="{ accent: f.accent }">{{ f.value }}</span>
            <span v-if="i < metaFields(rec).length - 1" class="mc-meta-sep">·</span>
          </span>
        </div>

        <!-- 缩略图行：点击可放大预览 -->
        <div v-if="thumbs(rec).length" class="mc-gallery">
          <n-image
            v-for="(t, i) in thumbs(rec)"
            :key="i"
            class="mc-thumb"
            :src="t.url"
            preview
            :img-props="{ alt: t.tag }"
          />
        </div>
      </div>
    </div>
    <div v-else-if="loading" class="maint-empty">加载中…</div>
    <div v-else class="maint-empty">
      <!-- 空态对齐缺陷卡/告警卡：图标 + 主文案居中竖排 -->
      <svg
        class="me-icon"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="1.6"
        stroke-linecap="round"
        stroke-linejoin="round"
        aria-hidden="true"
      >
        <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
        <rect x="8" y="2" width="8" height="4" rx="1" />
        <path d="M9 14l2 2 4-4" />
      </svg>
      <span>暂无维护记录</span>
    </div>
  </div>
</template>

<style scoped>
.maint-card {
  /* 卡片基底（福永页面级 .info-card 同款）：glass-panel 只提供底色边框 */
  padding: 16px 18px;
  border-radius: var(--radius);
  box-shadow: var(--card-shadow);
  overflow: hidden;
  flex: 1;
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
.mc-count {
  font-size: 13px;
  font-weight: 500;
  color: var(--muted);
  padding-left: 8px;
}

/* 列表滚动容器 */
.maint-list {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding-right: 6px;
  padding-bottom: 4px;
}
.maint-list::-webkit-scrollbar {
  width: 8px;
}
.maint-list::-webkit-scrollbar-thumb {
  background: rgba(82, 149, 232, 0.4);
  border-radius: 4px;
}

.maint-card-item {
  background: #fff;
  border: 1px solid var(--border);
  border-radius: 10px;
  padding: 12px 14px;
  box-shadow: 0 1px 3px rgba(43, 108, 160, 0.05);
  transition: box-shadow 0.15s;
  flex: none;
}
.maint-card-item:hover {
  box-shadow: 0 3px 10px rgba(43, 108, 160, 0.1);
}

.mc-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 6px;
}
.mc-head-right {
  display: flex;
  align-items: center;
  gap: 6px;
}
.mc-time {
  font-size: 15px;
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
  padding: 2px 8px;
}
.mc-result-tag {
  font-size: 12px;
  font-weight: 600;
  border-radius: 999px;
  padding: 2px 8px;
}
.mc-result-tag.ok {
  color: #52c41a;
  background: #f6ffed;
  border: 1px solid #b7eb8f;
}
.mc-result-tag.err {
  color: var(--danger-text);
  background: rgba(239, 68, 68, 0.08);
  border: 1px solid rgba(239, 68, 68, 0.35);
}

/* 中间元数据行 */
.mc-meta {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0 4px;
  font-size: 13px;
  line-height: 1.6;
  margin-bottom: 8px;
  color: var(--muted);
}
.mc-meta-field {
  display: inline-flex;
  align-items: baseline;
}
.mc-meta-label {
  color: var(--muted);
  margin-right: 3px;
}
.mc-meta-value {
  color: var(--text);
  font-weight: 500;
}
.mc-meta-value.accent {
  color: #c8862c;
  font-weight: 700;
}
.mc-meta-sep {
  margin: 0 6px;
  color: var(--border);
}

/* 缩略图行 */
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

/* 空态：图标 + 主文案，居中撑满卡片（缺陷卡/告警卡同款规格） */
.maint-empty {
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
.me-icon {
  width: 38px;
  height: 38px;
  color: #b9cee9;
}
</style>
