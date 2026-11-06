<script setup lang="ts">
import { computed } from 'vue'
import { NDrawer, NDrawerContent, NImage, NImageGroup, NTag } from 'naive-ui'
import type { CaoliaoRecord, DefectInfo } from '../api/operation/types'

/**
 * 缺陷详情抽屉（对齐运维平台「缺陷详情」版式）：
 * 表单详情 / 基本信息 / 隐患详情 / 整改情况 / 图片记录 五个分区，
 * 数据全部来自 §4.2 缺陷记录响应（defectInfo 完整承载，无单独详情接口）。
 * 设备详情（4.3）与缺陷管理（4.4）共用。
 */
const props = defineProps<{
  show: boolean
  record: CaoliaoRecord | null
}>()

const emit = defineEmits<{ 'update:show': [value: boolean] }>()

const info = computed<DefectInfo | null>(() => props.record?.defectInfo ?? null)

function dash(v: string | null | undefined): string {
  const s = String(v ?? '').trim()
  return s || '--'
}

/** 处理进度 / 风险等级 / 是否整改 → naive-ui tag 类型 */
function tagType(v: string | null | undefined): 'success' | 'info' | 'warning' | 'error' | 'default' {
  const s = String(v ?? '')
  if (s === '已完成' || s === '已整改') return 'success'
  if (s === '处理中') return 'info'
  if (s === '待处理' || s === '未整改') return 'warning'
  if (s.includes('重大')) return 'error'
  return s ? 'warning' : 'default'
}

const hasAnyImage = computed(() => {
  const g = info.value
  if (!g) return false
  return !!(
    g.workImageUrls?.length ||
    g.beforeImageUrls?.length ||
    g.duringImageUrls?.length ||
    g.afterImageUrls?.length
  )
})
</script>

<template>
  <NDrawer
    :show="show"
    :width="720"
    placement="right"
    @update:show="emit('update:show', $event)"
  >
    <NDrawerContent :title="`缺陷详情 · ${record?.recordId ?? ''}`" closable>
      <div class="drawer-body">
        <!-- 表单详情 -->
        <section class="detail-section">
          <h3 class="section-title">表单详情</h3>
          <div class="section-card">
            <div class="desc-list">
              <div class="desc-item span2">
                <span class="dt">表单名称：</span><span class="dd">{{ dash(record?.formName) }}</span>
              </div>
              <div class="desc-item">
                <span class="dt">记录编号：</span><span class="dd td-mono">{{ dash(record?.recordId) }}</span>
              </div>
              <div class="desc-item">
                <span class="dt">表单编号：</span><span class="dd td-mono">{{ dash(record?.formNumber) }}</span>
              </div>
              <div class="desc-item">
                <span class="dt">二维码名称：</span><span class="dd">{{ dash(record?.position) }}</span>
              </div>
              <div class="desc-item span2">
                <span class="dt">二维码链接：</span>
                <a v-if="record?.webUrl" class="dd link" :href="record.webUrl" target="_blank" rel="noopener">{{
                  record.webUrl
                }}</a>
                <span v-else class="dd">--</span>
              </div>
            </div>
          </div>
        </section>

        <!-- 基本信息 -->
        <section class="detail-section">
          <h3 class="section-title">基本信息</h3>
          <div class="section-card">
            <div class="desc-list">
              <div class="desc-item">
                <span class="dt">提交人：</span><span class="dd">{{ dash(record?.inspector || info?.reporterName) }}</span>
              </div>
              <div class="desc-item">
                <span class="dt">发现时间：</span><span class="dd td-mono">{{ dash(record?.recordTime) }}</span>
              </div>
              <div class="desc-item">
                <span class="dt">最近流转时间：</span><span class="dd td-mono">{{ dash(info?.processTime) }}</span>
              </div>
              <div class="desc-item">
                <span class="dt">处理进度：</span>
                <NTag v-if="record?.processState" round size="small" :type="tagType(record.processState)">{{
                  record.processState
                }}</NTag>
                <span v-else class="dd">--</span>
              </div>
            </div>
          </div>
        </section>

        <!-- 隐患详情 -->
        <section class="detail-section">
          <h3 class="section-title">隐患详情</h3>
          <div class="section-card">
            <div class="desc-list">
              <div class="desc-item">
                <span class="dt">隐患位置：</span><span class="dd">{{ dash(info?.hazardPosition) }}</span>
              </div>
              <div class="desc-item">
                <span class="dt">风险等级：</span>
                <NTag v-if="info?.riskLevel" size="small" :type="tagType(info.riskLevel)">{{ info.riskLevel }}</NTag>
                <span v-else class="dd">--</span>
              </div>
              <div class="desc-item span2">
                <span class="dt">隐患描述：</span><span class="dd">{{ dash(info?.hazardDescription) }}</span>
              </div>
            </div>
          </div>
        </section>

        <!-- 整改情况 -->
        <section class="detail-section">
          <h3 class="section-title">整改情况</h3>
          <div class="section-card">
            <div class="desc-list">
              <div class="desc-item">
                <span class="dt">是否整改：</span>
                <NTag v-if="info?.rectified" size="small" :type="tagType(info.rectified)">{{ info.rectified }}</NTag>
                <span v-else class="dd">--</span>
              </div>
              <div class="desc-item">
                <span class="dt">发现日期：</span><span class="dd td-mono">{{ dash(info?.foundDate) }}</span>
              </div>
              <div class="desc-item span2">
                <span class="dt">整改措施：</span><span class="dd">{{ dash(info?.rectifyMeasure) }}</span>
              </div>
              <div class="desc-item">
                <span class="dt">整改期限：</span><span class="dd td-mono">{{ dash(info?.deadline) }}</span>
              </div>
              <div class="desc-item">
                <span class="dt">整改科室及责任人：</span><span class="dd">{{ dash(info?.responsibleDept) }}</span>
              </div>
              <div class="desc-item span2">
                <span class="dt">建议整改措施：</span><span class="dd">{{ dash(info?.suggestedMeasure) }}</span>
              </div>
              <div class="desc-item span2">
                <span class="dt">不符合标准条款：</span><span class="dd">{{ dash(info?.standardClause) }}</span>
              </div>
              <div class="desc-item span2">
                <span class="dt">备注：</span><span class="dd">{{ dash(info?.remark) }}</span>
              </div>
            </div>
          </div>
        </section>

        <!-- 图片记录 -->
        <section class="detail-section">
          <h3 class="section-title">图片记录</h3>
          <div class="section-card">
            <template v-if="hasAnyImage">
              <div v-if="info?.workImageUrls?.length" class="img-group">
                <div class="img-group-title">作业图片</div>
                <NImageGroup>
                  <div class="img-row">
                    <NImage v-for="(u, i) in info.workImageUrls" :key="i" class="img-item" :src="u" />
                  </div>
                </NImageGroup>
              </div>
              <div v-if="info?.beforeImageUrls?.length" class="img-group">
                <div class="img-group-title">整改前</div>
                <NImageGroup>
                  <div class="img-row">
                    <NImage v-for="(u, i) in info.beforeImageUrls" :key="i" class="img-item" :src="u" />
                  </div>
                </NImageGroup>
              </div>
              <div v-if="info?.duringImageUrls?.length" class="img-group">
                <div class="img-group-title">整改中</div>
                <NImageGroup>
                  <div class="img-row">
                    <NImage v-for="(u, i) in info.duringImageUrls" :key="i" class="img-item" :src="u" />
                  </div>
                </NImageGroup>
              </div>
              <div v-if="info?.afterImageUrls?.length" class="img-group">
                <div class="img-group-title">整改后</div>
                <NImageGroup>
                  <div class="img-row">
                    <NImage v-for="(u, i) in info.afterImageUrls" :key="i" class="img-item" :src="u" />
                  </div>
                </NImageGroup>
              </div>
            </template>
            <div v-else class="img-empty">暂无图片</div>
          </div>
        </section>
      </div>
    </NDrawerContent>
  </NDrawer>
</template>

<style scoped>
.drawer-body {
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.detail-section .section-title {
  margin: 0 0 8px;
  font-size: 15px;
  font-weight: 700;
  color: var(--title);
  position: relative;
  padding-left: 10px;
}
.detail-section .section-title::before {
  content: '';
  position: absolute;
  left: 0;
  top: 50%;
  transform: translateY(-50%);
  width: 3px;
  height: 14px;
  background: var(--primary);
  border-radius: 2px;
}
.section-card {
  background: var(--primary-50, #f4f8fd);
  border: 1px solid var(--border);
  border-radius: 10px;
  padding: 12px 14px;
}
.desc-list {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px 18px;
}
.desc-item {
  display: flex;
  align-items: baseline;
  gap: 4px;
  font-size: 14px;
  line-height: 1.6;
  min-width: 0;
}
.desc-item.span2 {
  grid-column: span 2;
}
.dt {
  color: var(--muted);
  flex: none;
}
.dd {
  color: var(--text);
  word-break: break-all;
}
.td-mono {
  font-family: var(--font-mono);
}
a.link {
  color: var(--primary);
  text-decoration: none;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
a.link:hover {
  text-decoration: underline;
}

.img-group {
  margin-bottom: 12px;
}
.img-group:last-child {
  margin-bottom: 0;
}
.img-group-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--muted);
  margin-bottom: 6px;
}
.img-row {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
}
.img-item {
  width: 132px;
  height: 96px;
  border-radius: 8px;
  border: 1px solid var(--border);
  overflow: hidden;
}
.img-item :deep(img) {
  width: 132px;
  height: 96px;
  object-fit: cover;
  display: block;
}
.img-empty {
  font-size: 14px;
  color: var(--muted);
  text-align: center;
  padding: 18px;
}
</style>
