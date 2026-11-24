<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { NButton, NInput, NModal, NPagination } from 'naive-ui'
import {
  fetchAssessmentDetail,
  fetchAssessmentRecords,
  getAssessmentTemplate,
  submitAssessment,
} from '../../../api/health/assessments'
import type {
  HealthAssessmentDetail,
  HealthAssessmentRecord,
  HealthAssessmentResult,
  HealthAssessTemplate,
  HealthGrade,
} from '../../../api/health/types'
import { GRADE_META, healthGrade } from '../../../config/healthGrades'
import { globalMessage } from '../../../utils/message'

/**
 * 健康度评估弹窗（§7.1-7.4，2026-11-16；2026-11-17 抽屉改弹窗 + 维度页签）：箱柜行「评估」进入
 * （配置中心箱柜板块，cabinetId = §5.15 箱柜 id 与 superId 同一 ID 空间）。
 * 头部右上角 = 发起评估 / 评估历史页签；弹窗 16:9（宽 1200）；发起评估按维度切页签
 * （页签 = 序号 + 维度名 + 权重%，圆点 = 该维度已评完），评分项 2×n 白卡队列（无维度面板头），
 * 四档评定卡 2 列排布（档名 + 扣分 + 判定文案常显不截断）；全部手工项评完才能提交，
 * 未评完点提交 toast 列出未填项并跳到第一个未评完的维度；备注选填。
 * 评估历史 = 按本箱柜服务端分页（7.3）→ 行点击看详情快照（7.4，可重放计算过程）。
 * 提交仅 level 0/1（配置中心路由已挡外部人员，后端 403 兜底）。
 */
const props = defineProps<{
  show: boolean
  /** 只需要箱柜 id（评估 cabinetId 空间）与展示名；设备目录的 DeviceCabinetItem 与 §5.15 行均可直接传 */
  cabinet: { superId: number; name: string } | null
}>()

const emit = defineEmits<{ 'update:show': [value: boolean]; submitted: [] }>()

const TABS = [
  { value: 'form', label: '发起评估' },
  { value: 'history', label: '评估历史' },
] as const
type Tab = (typeof TABS)[number]['value']

const tab = ref<Tab>('form')

/* ---------- 发起评估 ---------- */
const template = ref<HealthAssessTemplate | null>(null)
const templateLoading = ref(false)
const templateError = ref('')
const grades = ref<Record<string, HealthGrade>>({})
const remark = ref('')
const submitting = ref(false)
const result = ref<HealthAssessmentResult | null>(null)
const activeDimNo = ref<number | null>(null)

const GRADE_OPTIONS: { value: HealthGrade; label: string; deduct: string; title: string }[] = [
  { value: '正常', label: '正常', deduct: '扣 0 分', title: '正常：扣 0 分' },
  { value: '注意', label: '注意', deduct: '扣 20 分', title: '注意：扣 20 分' },
  { value: '异常', label: '异常', deduct: '扣 50 分', title: '异常：扣 50 分' },
  { value: '严重', label: '严重', deduct: '扣 100 分', title: '严重：扣 100 分' },
]

async function loadTemplate() {
  const cabinetId = props.cabinet?.superId ?? 0
  if (cabinetId <= 0) {
    templateError.value = '箱柜 ID 无效'
    return
  }
  templateLoading.value = true
  templateError.value = ''
  template.value = null
  result.value = null
  grades.value = {}
  remark.value = ''
  activeDimNo.value = null
  try {
    template.value = await getAssessmentTemplate(cabinetId)
    activeDimNo.value = template.value.dimensions[0]?.no ?? null
  } catch (e) {
    // 类型不支持（电池组/未配置模板）等业务错误直接展示 msg，属预期不加兜底
    templateError.value = e instanceof Error ? e.message : '评估模板加载失败'
  } finally {
    templateLoading.value = false
  }
}

/** 维度与其中手工评分项的配对（未填提示、页签完成态都用） */
const dimEntries = computed(() =>
  template.value?.dimensions.map((dim) => ({ dim, manual: dim.items.filter((i) => !i.autoCalculated) })) ?? [],
)
const manualEntries = computed(() => dimEntries.value.flatMap(({ dim, manual }) => manual.map((item) => ({ dim, item }))))
const manualItems = computed(() => manualEntries.value.map((e) => e.item))
const gradedCount = computed(() => manualItems.value.filter((i) => grades.value[i.code]).length)
const allGraded = computed(
  () => manualItems.value.length > 0 && gradedCount.value === manualItems.value.length,
)
const missingEntries = computed(() => manualEntries.value.filter((e) => !grades.value[e.item.code]))

/** 维度内全部评分项已定（自动项豁免）→ 页签绿点 */
function dimDone(dim: HealthAssessTemplate['dimensions'][number]): boolean {
  return dim.items.every((i) => i.autoCalculated || grades.value[i.code])
}

const activeDim = computed(() => template.value?.dimensions.find((d) => d.no === activeDimNo.value) ?? null)

function gradeText(code: string, value: HealthGrade): string {
  const item = manualItems.value.find((i) => i.code === code)
  if (!item) return ''
  return value === '正常' ? item.normal : value === '注意' ? item.attention : value === '异常' ? item.abnormal : item.severe
}

/** 评分项子权重（维度内小数，和=1）→ 百分比展示：0.3 → 30%，两位封顶去尾零防浮点误差 */
function subWeightPercent(v: number): string {
  return `${Number(((v ?? 0) * 100).toFixed(2))}%`
}

/** 四级等级 → 徽章色（正常绿/注意黄/异常橙红/严重红） */
function gradeCls(grade: string): string {
  if (grade === '正常') return 'g-ok'
  if (grade === '注意') return 'g-warn'
  if (grade === '异常') return 'g-bad'
  return 'g-severe'
}

async function onSubmit() {
  const t = template.value
  if (!t || submitting.value) return
  if (missingEntries.value.length) {
    const labels = missingEntries.value.map((e) => `${e.dim.name} · ${e.item.name}`)
    globalMessage()?.error(
      `还有 ${labels.length} 项未评定：${labels.slice(0, 5).join('、')}${labels.length > 5 ? ' 等' : ''}，全部评定后才能提交`,
    )
    activeDimNo.value = missingEntries.value[0]?.dim.no ?? activeDimNo.value
    return
  }
  submitting.value = true
  try {
    const res = await submitAssessment({
      cabinetId: t.cabinetId,
      items: manualItems.value.map((i) => ({ code: i.code, grade: grades.value[i.code]! })),
      remark: remark.value.trim() || undefined,
    })
    result.value = res
    emit('submitted')
  } catch (e) {
    globalMessage()?.error(e instanceof Error ? e.message : '评估提交失败')
  } finally {
    submitting.value = false
  }
}

/* ---------- 评估历史 ---------- */
const records = ref<HealthAssessmentRecord[]>([])
const recordsLoading = ref(false)
const recordsError = ref('')
const recordsTotal = ref(0)
const recordsPage = ref(1)
const RECORDS_PAGE_SIZE = 12
const detail = ref<HealthAssessmentDetail | null>(null)
const detailLoading = ref(false)

function levelMeta(healthValue: number | null, backendLevel?: string): { label: string; cls: string } {
  if (backendLevel) {
    const map: Record<string, string> = { 优秀: 'lv-ok', 良好: 'lv-ok', 一般: 'lv-mid', 较差: 'lv-warn', 极差: 'lv-bad' }
    return { label: backendLevel, cls: map[backendLevel] ?? 'lv-mid' }
  }
  const g = healthGrade(healthValue)
  const meta = GRADE_META.find((m) => m.id === g)
  const clsMap: Record<string, string> = { excellent: 'lv-ok', good: 'lv-ok', fair: 'lv-mid', poor: 'lv-warn', terrible: 'lv-bad' }
  return { label: meta?.label ?? '—', cls: g ? (clsMap[g] ?? 'lv-mid') : 'lv-mid' }
}

async function loadRecords(page = recordsPage.value) {
  const cabinetId = props.cabinet?.superId ?? 0
  if (cabinetId <= 0) return
  recordsLoading.value = true
  recordsError.value = ''
  recordsPage.value = page
  try {
    const res = await fetchAssessmentRecords({ cabinetId, page, pageSize: RECORDS_PAGE_SIZE })
    records.value = res.rows
    recordsTotal.value = res.total
  } catch (e) {
    recordsError.value = e instanceof Error ? e.message : '评估历史加载失败'
  } finally {
    recordsLoading.value = false
  }
}

async function openDetail(row: HealthAssessmentRecord) {
  detailLoading.value = true
  try {
    detail.value = await fetchAssessmentDetail(row.id)
  } catch (e) {
    globalMessage()?.error(e instanceof Error ? e.message : '评估详情加载失败')
  } finally {
    detailLoading.value = false
  }
}

/* ---------- 开合与复位 ---------- */
/* 只 watch show 的打开沿：cabinet 是父组件模板里的内联对象字面量（CabinetPanel），
 * 父组件任意重渲染（如提交成功后 emit('submitted') 触发的表格 reload）都会产生新对象身份，
 * 若把 cabinet 放进 watch 源，评分/结果卡会被整体复位（2026-11-17 实测踩坑）。
 * 组件挂载时 show 已为 true（HMR 重挂载/未来接入方先开后挂）也要拉一次模板。 */
watch(
  () => props.show,
  (show) => {
    if (!show) return
    resetAndLoad()
  },
)
onMounted(() => {
  if (props.show) resetAndLoad()
})

function resetAndLoad() {
  tab.value = 'form'
  template.value = null
  templateError.value = ''
  result.value = null
  grades.value = {}
  remark.value = ''
  activeDimNo.value = null
  records.value = []
  recordsTotal.value = 0
  recordsPage.value = 1
  recordsError.value = ''
  detail.value = null
  void loadTemplate()
}

function switchTab(next: Tab) {
  tab.value = next
  detail.value = null
  if (next === 'history' && !records.value.length && !recordsError.value) void loadRecords(1)
}

function close() {
  emit('update:show', false)
}
</script>

<template>
  <NModal
    :show="props.show"
    preset="card"
    class="assess-modal"
    :mask-closable="false"
    :closable="!submitting"
    :close-on-esc="!submitting"
    @update:show="(v: boolean) => { if (!v) close() }"
  >
    <template #header>
      <div class="ahd-head">
        <span class="ahd-title">{{ cabinet?.name ?? '' }} 健康度评估</span>
        <div class="ahd-tabs">
          <button
            v-for="t in TABS"
            :key="t.value"
            type="button"
            class="tab-btn"
            :class="{ active: tab === t.value }"
            @click="switchTab(t.value)"
          >
            {{ t.label }}
          </button>
        </div>
      </div>
    </template>

    <!-- ============ 发起评估 ============ -->
    <template v-if="tab === 'form'">
      <div v-if="templateLoading" class="state-msg">评估模板加载中…</div>
      <div v-else-if="templateError" class="state-msg err">
        {{ templateError }}
        <NButton size="small" @click="loadTemplate">重试</NButton>
      </div>

      <!-- 提交成功：结果卡 -->
      <div v-else-if="result" class="result-card">
        <div class="result-head">
          <div class="hi-score">
            <span class="hi-num">{{ result.hiScore }}</span>
            <span class="hi-unit">HI 总分</span>
          </div>
          <span class="level-pill" :class="levelMeta(result.healthValue, result.healthLevel).cls">
            {{ result.healthLevel }}
          </span>
        </div>
        <p class="result-note">
          已回写箱柜健康度：<b>{{ result.healthValue }}</b>
          （评估记录 #{{ result.assessmentId }}，提交即生效）
        </p>
        <div class="dim-scores">
          <div v-for="d in result.dimensions" :key="d.no" class="dim-score-row">
            <span class="dim-score-name">{{ d.name }}</span>
            <span class="dim-score-weight">权重 {{ d.weightPercent }}%</span>
            <span class="dim-score-value mono">{{ d.score }}</span>
          </div>
        </div>
        <div class="result-actions">
          <NButton type="primary" @click="close">完成</NButton>
        </div>
      </div>

      <!-- 评定表单 -->
      <template v-else-if="template">
        <div class="tpl-meta">
          {{ template.deviceTypeName }} · 模板「{{ template.templateName }}」 · 箱柜编号 {{ template.cabinetNumber || '—' }}
        </div>

        <!-- 维度页签：权重并入页签（不写「维度权重」字样）；圆点 = 该维度全部评分项已评完（自动项豁免） -->
        <div class="dim-tabs">
          <button
            v-for="entry in dimEntries"
            :key="entry.dim.no"
            type="button"
            class="dim-tab"
            :class="{ active: activeDimNo === entry.dim.no, done: dimDone(entry.dim) }"
            @click="activeDimNo = entry.dim.no"
          >
            <span class="dim-tab-no mono">{{ entry.dim.no }}</span>
            <span class="dim-tab-name">{{ entry.dim.name }}</span>
            <span class="dim-tab-weight mono">{{ entry.dim.weightPercent }}%</span>
            <span class="dim-tab-dot" />
          </button>
        </div>

        <!-- 评分项 2×n 队列：不设维度面板头，直接展示评分项卡（2026-11-17 用户口径） -->
        <div v-if="activeDim" class="item-grid">
          <div v-for="item in activeDim.items" :key="item.code" class="item-block" :class="{ auto: item.autoCalculated }">
            <div class="item-main">
              <span class="item-name" :title="item.name">{{ item.name }}</span>
              <span v-if="item.autoCalculated" class="auto-badge">自动</span>
              <span class="item-sub mono">{{ subWeightPercent(item.subWeight) }}</span>
            </div>
            <!-- 自动项：只读展示服务端预计算结果 -->
            <div v-if="item.autoCalculated" class="auto-line">
              <span class="grade-pill static" :class="gradeCls(template.autoPreview.grade)">
                {{ template.autoPreview.grade }}
              </span>
              <span class="auto-detail" :title="template.autoPreview.autoDetail">{{ template.autoPreview.autoDetail }}</span>
            </div>
            <!-- 四档评定卡：2 列排布，档名 + 扣分 + 判定文案常显（不截断） -->
            <div v-else class="grade-grid" role="radiogroup" :aria-label="item.name">
              <button
                v-for="opt in GRADE_OPTIONS"
                :key="opt.value"
                type="button"
                class="grade-card"
                :class="[gradeCls(opt.value), { selected: grades[item.code] === opt.value }]"
                :title="`${opt.title}；判定：${gradeText(item.code, opt.value)}`"
                @click="grades[item.code] = opt.value"
              >
                <span class="gc-main">
                  <span class="gc-label">{{ opt.label }}</span>
                  <span class="gc-text">{{ gradeText(item.code, opt.value) || '—' }}</span>
                </span>
                <span class="gc-deduct mono">{{ opt.deduct }}</span>
              </button>
            </div>
          </div>
        </div>

        <NInput
          v-model:value="remark"
          type="textarea"
          :maxlength="255"
          placeholder="备注（可选，随评估记录保存）"
          class="remark-input"
        />
      </template>
    </template>

    <!-- ============ 评估历史 ============ -->
    <template v-else>
      <!-- 详情子视图（7.4 快照重放） -->
      <template v-if="detail">
        <div class="detail-head">
          <NButton size="small" @click="detail = null">← 返回列表</NButton>
          <span class="detail-title mono">#{{ detail.assessment.id }} · {{ detail.assessment.createdAt }}</span>
          <span class="level-pill" :class="levelMeta(detail.assessment.healthValue).cls">
            {{ levelMeta(detail.assessment.healthValue).label }}
          </span>
        </div>
        <div class="detail-summary">
          <span>评估人：{{ detail.assessment.assessorName || '—' }}</span>
          <span>HI 总分：<b class="mono">{{ detail.assessment.hiScore }}</b></span>
          <span>回写健康度：<b class="mono">{{ detail.assessment.healthValue ?? '—' }}</b></span>
        </div>
        <p v-if="detail.assessment.remark" class="detail-remark">备注：{{ detail.assessment.remark }}</p>

        <div class="detail-sec-title">维度得分</div>
        <div class="dim-scores">
          <div v-for="d in detail.dimensions" :key="d.no" class="dim-score-row">
            <span class="dim-score-name">{{ d.name }}</span>
            <span class="dim-score-weight">权重 {{ d.weightPercent }}%</span>
            <span class="dim-score-value mono">{{ d.score }}</span>
          </div>
        </div>

        <div class="detail-sec-title">评分项明细（评估时快照，可重放计算过程）</div>
        <div class="detail-items">
          <div v-for="i in detail.items" :key="i.id" class="detail-item-row">
            <span class="di-dim mono">D{{ i.dimensionNo }}</span>
            <span class="di-name" :title="i.itemName">{{ i.itemName }}</span>
            <span class="di-sub mono">{{ subWeightPercent(i.subWeight) }}</span>
            <span class="grade-pill static" :class="gradeCls(i.grade)">{{ i.grade }}</span>
            <span class="di-deduct mono" :class="{ deduct: i.deduction > 0 }">-{{ i.deduction }}</span>
            <span v-if="i.autoCalculated" class="di-auto">自动</span>
          </div>
          <p v-if="detail.items.some((i) => i.autoDetail)" class="auto-detail-block">
            <span v-for="i in detail.items.filter((x) => x.autoDetail)" :key="i.id" class="auto-detail-line">
              {{ i.itemName }}：{{ i.autoDetail }}
            </span>
          </p>
        </div>
      </template>

      <!-- 列表 -->
      <template v-else>
        <div v-if="recordsLoading && !records.length" class="state-msg">评估历史加载中…</div>
        <div v-else-if="recordsError" class="state-msg err">
          {{ recordsError }}
          <NButton size="small" @click="loadRecords(recordsPage)">重试</NButton>
        </div>
        <div v-else-if="!records.length" class="state-msg">该箱柜暂无评估记录</div>
        <template v-else>
          <div
            v-for="row in records"
            :key="row.id"
            class="record-row"
            role="button"
            tabindex="0"
            @click="openDetail(row)"
            @keydown.enter="openDetail(row)"
          >
            <div class="record-line1">
              <span class="record-time mono">{{ row.createdAt }}</span>
              <span class="level-pill" :class="levelMeta(row.healthValue).cls">
                {{ levelMeta(row.healthValue).label }}
              </span>
              <span class="record-score mono">HI {{ row.hiScore }}</span>
            </div>
            <div class="record-line2">
              <span>{{ row.assessorName || '—' }} 评估 · {{ row.deviceTypeName }}</span>
              <span v-if="row.remark" class="record-remark" :title="row.remark">{{ row.remark }}</span>
            </div>
          </div>
          <div class="history-foot">
            <NPagination
              :page="recordsPage"
              :item-count="recordsTotal"
              :page-size="RECORDS_PAGE_SIZE"
              @update:page="(p: number) => loadRecords(p)"
            />
          </div>
        </template>
      </template>
    </template>

    <!-- 底部：进度 + 提交（结果卡/历史页不显示；未评完点提交 toast 报未填项） -->
    <template v-if="tab === 'form' && template && !result" #footer>
      <div class="form-foot">
        <span class="progress" :class="{ ok: allGraded }">
          已评 {{ gradedCount }} / {{ manualItems.length }} 项{{ allGraded ? '，可提交' : '，未评完不可提交' }}
        </span>
        <NButton type="primary" :loading="submitting" @click="onSubmit">提交评估（提交即生效）</NButton>
      </div>
    </template>
  </NModal>
</template>

<style scoped>
.ahd-head {
  display: flex;
  align-items: center;
  gap: 16px;
  min-width: 0;
}
.ahd-title {
  font-size: 16px;
  font-weight: 600;
  color: var(--title);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.ahd-tabs {
  margin-left: auto;
  flex: none;
  display: inline-flex;
  border: 1px solid var(--border);
  border-radius: 8px;
  overflow: hidden;
}
.tab-btn {
  padding: 6px 16px;
  border: none;
  background: #fff;
  font-family: inherit;
  font-size: 14px;
  color: var(--muted);
  cursor: pointer;
}
.tab-btn + .tab-btn {
  border-left: 1px solid var(--border);
}
.tab-btn.active {
  background: var(--primary-700);
  color: #fff;
  font-weight: 600;
}

.state-msg {
  margin: 24px 0;
  padding: 28px 16px;
  text-align: center;
  font-size: 14px;
  color: var(--muted);
  background: rgba(196, 218, 240, 0.3);
  border-radius: 8px;
}
.state-msg.err {
  color: var(--danger-text);
  background: rgba(229, 72, 77, 0.08);
}

.tpl-meta {
  margin-bottom: 12px;
  font-size: 13px;
  color: var(--muted);
}
/* 维度页签：强制单排（2026-11-17 用户口径「只能排成一排」）——nowrap + 横向滚动兜底，
 * 同时压缩字号/间距让 7 个维度在 1200 宽弹窗内一排放得下 */
.dim-tabs {
  display: flex;
  flex-wrap: nowrap;
  gap: 5px;
  margin-bottom: 10px;
  overflow-x: auto;
  scrollbar-width: thin;
}
.dim-tab {
  flex: none;
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 5px 10px;
  border: 1px solid var(--border);
  border-radius: 999px;
  background: #fff;
  font-family: inherit;
  font-size: 12px;
  color: var(--muted);
  cursor: pointer;
  white-space: nowrap;
}
.dim-tab-name {
  max-width: 120px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.dim-tab-weight {
  font-size: 11px;
  color: var(--muted);
}
.dim-tab.active .dim-tab-weight {
  color: rgba(255, 255, 255, 0.85);
}
.dim-tab-no {
  width: 17px;
  height: 17px;
  border-radius: 50%;
  background: var(--primary-100);
  color: var(--primary-700);
  font-size: 10px;
  font-weight: 700;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}
.dim-tab-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--border-strong);
}
.dim-tab.done .dim-tab-dot {
  background: var(--ok-text);
}
.dim-tab.active {
  background: var(--primary-700);
  border-color: var(--primary-700);
  color: #fff;
  font-weight: 600;
}
.dim-tab.active .dim-tab-no {
  background: rgba(255, 255, 255, 0.25);
  color: #fff;
}
/* 评分项 2×n 队列：每项一张白卡，维度不再有面板头 */
.item-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px 12px;
}
.item-block {
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 9px 11px;
  background: #fff;
}
.item-block.auto {
  background: rgba(196, 218, 240, 0.18);
}
.item-main {
  display: flex;
  align-items: center;
  gap: 8px;
}
.item-name {
  flex: 1;
  min-width: 0;
  font-size: 14px;
  font-weight: 600;
  color: var(--title);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.item-sub {
  flex: none;
  font-size: 12px;
  color: var(--muted);
}
.auto-badge {
  flex: none;
  padding: 1px 8px;
  border-radius: 999px;
  font-size: 11px;
  color: var(--primary-700);
  background: var(--primary-100);
}
.auto-line {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 6px;
}
.auto-detail {
  flex: 1;
  min-width: 0;
  font-size: 12px;
  color: var(--muted);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.grade-pill {
  padding: 3px 12px;
  border-radius: 999px;
  border: 1px solid var(--border);
  background: #fff;
  font-family: inherit;
  font-size: 13px;
  color: var(--muted);
  cursor: pointer;
}
.grade-pill.static.g-ok {
  color: var(--ok-text);
  background: rgba(46, 196, 142, 0.14);
  border-color: rgba(46, 196, 142, 0.5);
}
.grade-pill.static.g-warn {
  color: var(--warn-text);
  background: rgba(245, 166, 35, 0.16);
  border-color: rgba(245, 166, 35, 0.5);
}
.grade-pill.static.g-bad {
  color: #b45309;
  background: rgba(217, 119, 6, 0.14);
  border-color: rgba(217, 119, 6, 0.5);
}
.grade-pill.static.g-severe {
  color: var(--danger-text);
  background: rgba(229, 72, 77, 0.14);
  border-color: rgba(229, 72, 77, 0.5);
}

/* 四档评定卡：2 列网格；卡内左侧 = 档名 + 判定文案（上下两行），右侧「扣 X 分」整卡垂直居中
 * （2026-11-17 用户口径：扣分要上下居中，不是贴着档名那行） */
.grade-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 6px;
  margin-top: 7px;
}
.grade-card {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 5px 9px;
  border: 1px solid var(--border);
  border-radius: 7px;
  background: #fff;
  font-family: inherit;
  text-align: left;
  cursor: pointer;
  transition: border-color 0.12s, background 0.12s;
}
.grade-card:hover {
  border-color: var(--border-strong);
}
.gc-main {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.gc-label {
  font-size: 13px;
  font-weight: 600;
  line-height: 18px;
  color: var(--title);
}
.gc-deduct {
  flex: none;
  align-self: center;
  font-size: 11px;
  color: var(--muted);
  white-space: nowrap;
}
.gc-text {
  font-size: 12px;
  line-height: 1.45;
  color: var(--muted);
  overflow-wrap: anywhere;
}
.grade-card.selected.g-ok {
  border-color: rgba(46, 196, 142, 0.55);
  background: rgba(46, 196, 142, 0.12);
}
.grade-card.selected.g-ok .gc-label {
  color: var(--ok-text);
}
.grade-card.selected.g-warn {
  border-color: rgba(245, 166, 35, 0.55);
  background: rgba(245, 166, 35, 0.12);
}
.grade-card.selected.g-warn .gc-label {
  color: var(--warn-text);
}
.grade-card.selected.g-bad {
  border-color: rgba(217, 119, 6, 0.55);
  background: rgba(217, 119, 6, 0.1);
}
.grade-card.selected.g-bad .gc-label {
  color: #b45309;
}
.grade-card.selected.g-severe {
  border-color: rgba(229, 72, 77, 0.55);
  background: rgba(229, 72, 77, 0.1);
}
.grade-card.selected.g-severe .gc-label {
  color: var(--danger-text);
}
.grade-card.selected .gc-text {
  color: var(--text);
}
.remark-input {
  margin-top: 12px;
}
.form-foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.progress {
  font-size: 13px;
  color: var(--muted);
}
.progress.ok {
  color: var(--ok-text);
  font-weight: 600;
}

/* 结果卡 */
.result-card {
  border: 1px solid var(--border);
  border-radius: 10px;
  padding: 18px;
  background: #fff;
}
.result-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.hi-num {
  font-family: var(--font-mono);
  font-size: 44px;
  font-weight: 700;
  color: var(--title);
  line-height: 1;
}
.hi-unit {
  margin-left: 8px;
  font-size: 13px;
  color: var(--muted);
}
.level-pill {
  padding: 4px 14px;
  border-radius: 999px;
  font-size: 15px;
  font-weight: 700;
}
.level-pill.lv-ok {
  color: var(--ok-text);
  background: rgba(46, 196, 142, 0.14);
}
.level-pill.lv-mid {
  color: var(--primary-700);
  background: var(--primary-50);
}
.level-pill.lv-warn {
  color: var(--warn-text);
  background: rgba(245, 166, 35, 0.16);
}
.level-pill.lv-bad {
  color: var(--danger-text);
  background: rgba(229, 72, 77, 0.14);
}
.result-note {
  margin: 12px 0;
  font-size: 13px;
  color: var(--text);
}
.dim-scores {
  border-top: 1px solid var(--border);
  padding-top: 10px;
}
.dim-score-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 5px 0;
  font-size: 13px;
}
.dim-score-name {
  flex: 1;
  color: var(--title);
}
.dim-score-weight {
  flex: none;
  color: var(--muted);
}
.dim-score-value {
  flex: none;
  width: 48px;
  text-align: right;
  font-weight: 700;
  color: var(--title);
}
.result-actions {
  display: flex;
  justify-content: flex-end;
  margin-top: 14px;
}

/* 历史 */
.record-row {
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 10px 14px;
  margin-bottom: 10px;
  cursor: pointer;
  transition: all 0.15s;
  background: #fff;
}
.record-row:hover {
  border-color: var(--primary);
  background: var(--primary-50);
}
.record-line1 {
  display: flex;
  align-items: center;
  gap: 10px;
}
.record-time {
  flex: 1;
  font-size: 13px;
  color: var(--title);
}
.record-score {
  font-size: 15px;
  font-weight: 700;
  color: var(--title);
}
.record-line2 {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-top: 4px;
  font-size: 12px;
  color: var(--muted);
}
.record-remark {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.history-foot {
  display: flex;
  justify-content: center;
  margin-top: 12px;
}

/* 详情 */
.detail-head {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 10px;
}
.detail-title {
  flex: 1;
  font-size: 13px;
  color: var(--muted);
}
.detail-summary {
  display: flex;
  gap: 18px;
  font-size: 13px;
  color: var(--text);
  margin-bottom: 8px;
}
.detail-remark {
  margin: 0 0 8px;
  font-size: 13px;
  color: var(--muted);
}
.detail-sec-title {
  font-size: 14px;
  font-weight: 700;
  color: var(--title);
  margin: 14px 0 6px;
  padding-left: 10px;
  position: relative;
}
.detail-sec-title::before {
  content: '';
  position: absolute;
  left: 0;
  top: 50%;
  transform: translateY(-50%);
  width: 3px;
  height: 13px;
  background: var(--primary);
  border-radius: 2px;
}
.detail-items {
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 6px 12px;
  background: #fff;
}
.detail-item-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 5px 0;
  border-bottom: 1px dashed var(--border);
  font-size: 13px;
}
.detail-item-row:last-of-type {
  border-bottom: none;
}
.di-dim {
  flex: none;
  width: 28px;
  color: var(--muted);
  font-size: 12px;
}
.di-name {
  flex: 1;
  min-width: 0;
  color: var(--title);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.di-sub {
  flex: none;
  color: var(--muted);
  font-size: 12px;
}
.di-deduct {
  flex: none;
  width: 36px;
  text-align: right;
  color: var(--muted);
}
.di-deduct.deduct {
  color: var(--danger-text);
  font-weight: 700;
}
.di-auto {
  flex: none;
  font-size: 11px;
  color: var(--primary-700);
  background: var(--primary-100);
  border-radius: 999px;
  padding: 1px 7px;
}
.auto-detail-block {
  margin: 8px 0 4px;
  font-size: 12px;
  color: var(--muted);
  line-height: 1.7;
}
.auto-detail-line {
  display: block;
}
.mono {
  font-family: var(--font-mono);
}
</style>

<style>
/* 弹窗尺寸（2026-11-17 用户口径演进 16:9 → 20:8 → 18:8 → 高度 +1/3）：
 * 高度 = 宽度 × 16/27（= 18:8 的高度 ×4/3，即「高增加 1/3」）；
 * 宽 = min(1200, 视口宽-48, (视口高-48)×27/16)，高 = 宽×16/27，
 * 用同一条 min() 表达式反推，保证比例恒定且整窗永远不超出视口（只写 aspect-ratio 会被内容撑高，实测踩过）。
 * 卡体强制 flex 列，内容区吃掉 header/footer 之间剩余高度并内部滚动（naive-ui 类名是 n-card-content）。 */
.assess-modal {
  width: min(1200px, calc(100vw - 48px), calc((100vh - 48px) * 27 / 16));
  height: calc(min(1200px, calc(100vw - 48px), calc((100vh - 48px) * 27 / 16)) * 16 / 27);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
.assess-modal .n-card-content {
  flex: 1 1 0;
  min-height: 0;
  overflow-y: auto;
}
</style>
