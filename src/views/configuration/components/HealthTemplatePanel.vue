<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { onBeforeRouteLeave, onBeforeRouteUpdate } from 'vue-router'
import { NAlert, NButton, NForm, NFormItem, NInput, NInputNumber } from 'naive-ui'
import {
  addHealthTemplate,
  deleteHealthTemplate,
  getHealthTemplateTree,
  getHealthTemplates,
  saveHealthTemplateTree,
  updateHealthTemplate,
} from '../../../api/health/templates'
import type { HealthTemplateDimension, HealthTemplateSummary, HealthTemplateTree } from '../../../api/health/types'
import { globalMessage } from '../../../utils/message'
import ConfigDialog from './ConfigDialog.vue'
import { useConfigList, useConfigMutation } from '../composables/useConfiguration'
import { AUTO_ITEM_CODE, emptyItem, toTreeSaveBody, validateTemplateTreeDraft } from '../composables/templateTree'

/**
 * §7.6 健康度模板配置（2026-11-17 改版：参考设计稿改页面级编辑，渐变线以下不再走列表+宽弹窗）：
 * 顶部模板页签 = 按设备类型一份模板；汇总条 = 类型/编码/寿命/维度数 + 维度权重合计；
 * 主体 = 双列维度卡（维度名/权重% 可编辑，评分项行内编辑 + 子权重按百分数输入），
 * 「＋添加评分项」在卡片底部，「＋添加维度」是网格末尾的虚线卡；右上角 = 刷新/删除/新增/保存模板。
 * 新增仍是两步（7.6.3 建壳 → 本页配置后 7.6.5 整树保存，全量替换）；壳有变更才调 7.6.4。
 * 客户端预检 templateTree.ts 与后端五规则一致；页签切换/删除/刷新前有未保存修改会先弹确认。
 */
const { rows, loading, error: listError, reload } = useConfigList<HealthTemplateSummary>(getHealthTemplates)
const { saving, error, writable, submit } = useConfigMutation(reload)

/* ---------- 选中模板与编辑草稿 ---------- */
const activeId = ref<number | null>(null)
const treeLoading = ref(false)
const editorCode = ref('')
const editorTypeName = ref('')
const editorLife = ref<number | null>(25)
const draft = ref<HealthTemplateDimension[]>([])
const shellSnapshot = ref('')
const treeSnapshot = ref('')

const activeRow = computed(() => rows.value.find((row) => row.id === activeId.value) ?? null)

function shellNow(): string {
  return JSON.stringify([editorCode.value.trim(), editorTypeName.value.trim(), editorLife.value])
}
const dirty = computed(() => shellNow() !== shellSnapshot.value || JSON.stringify(draft.value) !== treeSnapshot.value)

const treeError = computed(() => validateTemplateTreeDraft(draft.value))
const weightTotal = computed(() =>
  Number(draft.value.reduce((sum, d) => sum + (Number(d.weightPercent) || 0), 0).toFixed(4)),
)
const weightTotalText = computed(() => weightTotal.value.toFixed(2))
const weightOk = computed(() => Math.abs(weightTotal.value - 100) <= 1e-6)

function cloneDimensions(dimensions: HealthTemplateDimension[]): HealthTemplateDimension[] {
  return dimensions.map((d) => ({ ...d, items: d.items.map((i) => ({ ...i })) }))
}

function fillEditor(tree: HealthTemplateTree) {
  editorCode.value = tree.code
  editorTypeName.value = tree.typeName
  editorLife.value = tree.designLifeYears
  draft.value = cloneDimensions(tree.dimensions)
  shellSnapshot.value = shellNow()
  treeSnapshot.value = JSON.stringify(draft.value)
}

async function doSelect(id: number) {
  activeId.value = id
  treeLoading.value = true
  error.value = ''
  try {
    fillEditor(await getHealthTemplateTree(id))
  } catch (e) {
    activeId.value = null
    draft.value = []
    globalMessage()?.error(e instanceof Error ? e.message : '模板整树加载失败')
  } finally {
    treeLoading.value = false
  }
}

/* ---------- 未保存修改守卫：切模板页签/新增/删除/刷新前确认（可自动保存=保存并切换） ---------- */
const confirmOpen = ref(false)
let pendingAction: (() => void | Promise<void>) | null = null

function guard(action: () => void) {
  if (!dirty.value) {
    action()
    return
  }
  pendingAction = action
  confirmOpen.value = true
}

async function confirmLeave() {
  confirmOpen.value = false
  const action = pendingAction
  pendingAction = null
  if (!action) return
  // 模板配置完整时先自动保存（失败留在本页，错误已在红条显示）；不完整按用户选择丢弃
  if (!treeError.value) {
    const saved = await saveTemplate()
    if (!saved) return
  }
  await action()
}

function selectTemplate(id: number) {
  if (id === activeId.value) return
  guard(() => void doSelect(id))
}

/* 宝安适配（2026-11-24 用户拍板，偏离福永原版）：板块内守卫只覆盖切模板页签/新增/删除/刷新，
 * 离开本板块（顶栏切页 / 左栏切板块）时未保存修改会静默丢失——两个路由守卫兜底。
 * 语义（2026-11-24 二次拍板）：「确定」= 自动保存后放行切换（不丢修改）；模板配置不完整
 * 无法自动保存时才退化为「丢弃并切换」；自动保存失败留在本板块并提示。 */
async function leaveWithSave(): Promise<boolean> {
  if (!dirty.value) return true
  if (treeError.value) {
    return window.confirm('模板配置不完整（无法自动保存），确定丢弃修改并切换吗？')
  }
  if (!window.confirm('有未保存的修改，确定自动保存并切换吗？')) return false
  const saved = await saveTemplate()
  if (!saved) {
    globalMessage()?.error('自动保存失败，已留在本板块，请检查后重试')
    return false
  }
  return true
}

// 用原生 confirm 同步弹首问；自动保存是异步的，守卫返回 Promise 挂起导航直至落定
onBeforeRouteLeave(() => leaveWithSave())

// 缺口补全：左栏切板块是同路由仅 query 变化（leave 守卫不触发），但 v-if 链会立刻
// 卸载本面板丢弃修改——用 update 守卫补位；留在本板块（query 回 health-templates）不拦
onBeforeRouteUpdate((to) => {
  if (to.query.board === 'health-templates') return true
  return leaveWithSave()
})

async function retryList() {
  await reload()
  const first = rows.value[0]
  if (first) await doSelect(first.id)
}

function refresh() {
  guard(() => {
    void (async () => {
      await reload()
      if (activeId.value && !rows.value.some((row) => row.id === activeId.value)) {
        const first = rows.value[0]
        if (first) await doSelect(first.id)
        else {
          activeId.value = null
          draft.value = []
        }
      }
    })()
  })
}

/* ---------- 新增模板（两步第一步：壳） ---------- */
const shellOpen = ref(false)
const shellCode = ref('')
const shellTypeName = ref('')
const shellLife = ref<number | null>(25)

function openAdd() {
  guard(() => {
    shellCode.value = ''
    shellTypeName.value = ''
    shellLife.value = 25
    error.value = ''
    shellOpen.value = true
  })
}

async function saveShell() {
  const code = shellCode.value.trim()
  const typeName = shellTypeName.value.trim()
  const life = shellLife.value
  if (!code) {
    error.value = '请输入模板编码'
    return
  }
  if (!typeName) {
    error.value = '请输入匹配的设备类型名称'
    return
  }
  if (!life || life < 1) {
    error.value = '请输入设计寿命（≥1 年）'
    return
  }
  if (
    await submit(
      async () => {
        const tree = await addHealthTemplate({ code, typeName, designLifeYears: life })
        await doSelect(tree.id)
      },
      true,
      // 宝安适配：成功提示走 mutation 层参数（福永原版面板自带 globalMessage，
      // 中央 toast 上线后改为传参，避免双重提示）
      '模板壳已创建，请在页面中配置维度与评分项并保存（完成前该类型箱柜评估不可用）',
    )
  ) {
    shellOpen.value = false
  }
}

/* ---------- 编辑基本信息（7.6.4，仅壳；维度/评分项走「保存模板」） ---------- */
const infoOpen = ref(false)

async function saveInfo() {
  const id = activeId.value
  const code = editorCode.value.trim()
  const typeName = editorTypeName.value.trim()
  const life = editorLife.value
  if (!id || !code || !typeName || !life || life < 1) {
    error.value = '请完整填写模板编码、类型名称与设计寿命'
    return
  }
  if (
    await submit(
      async () => {
        const shell = await updateHealthTemplate(id, { code, typeName, designLifeYears: life })
        editorCode.value = shell.code
        editorTypeName.value = shell.typeName
        editorLife.value = shell.designLifeYears
        shellSnapshot.value = shellNow()
      },
      true,
      '模板基本信息已保存',
    )
  ) {
    infoOpen.value = false
  }
}

/* ---------- 保存模板（壳有变更先 7.6.4，再 7.6.5 整树全量替换） ----------
 * saveTemplate 抽成可复用的布尔函数：页面「保存模板」按钮与离开守卫的「自动保存」共用。 */
async function saveTemplate(): Promise<boolean> {
  const id = activeId.value
  if (!id || treeError.value || saving.value) return false
  const code = editorCode.value.trim()
  const typeName = editorTypeName.value.trim()
  const life = editorLife.value
  if (!code || !typeName || !life || life < 1) {
    error.value = '请完整填写模板编码、类型名称与设计寿命'
    return false
  }
  return !!(await submit(
    async () => {
      if (shellNow() !== shellSnapshot.value) {
        const shell = await updateHealthTemplate(id, { code, typeName, designLifeYears: life })
        editorCode.value = shell.code
        editorTypeName.value = shell.typeName
        editorLife.value = shell.designLifeYears
      }
      // 7.6.5 全量替换；保存成功用返回整树回填（rule.md 配置中心口径）
      const saved = await saveHealthTemplateTree(id, toTreeSaveBody(draft.value))
      draft.value = cloneDimensions(saved.dimensions)
      shellSnapshot.value = shellNow()
      treeSnapshot.value = JSON.stringify(draft.value)
    },
    true,
    '模板已保存（全量替换维度与评分项，保存即生效）',
  ))
}

/** 页面「保存模板」按钮：保存成功留在本页继续编辑 */
async function saveEditor() {
  await saveTemplate()
}

/* ---------- 维度 / 评分项操作 ---------- */
/* 评分项编码不在界面暴露（2026-11-17 用户口径），但契约 7.6.5 要求模板内唯一：
 * 新增评分项时自动生成 d<维度号>_<序号>，跳过已占用编码与自动项固定编码。 */
function nextItemCode(dimNo: number): string {
  const used = new Set(draft.value.flatMap((d) => d.items.map((i) => i.code.trim())).filter(Boolean))
  let n = 1
  while (used.has(`d${dimNo}_${n}`) || `d${dimNo}_${n}` === AUTO_ITEM_CODE) n++
  return `d${dimNo}_${n}`
}
function makeItem(dimNo: number): HealthTemplateDimension['items'][number] {
  const item = emptyItem()
  item.code = nextItemCode(dimNo)
  return item
}
function addDimension() {
  const nextNo = draft.value.reduce((m, d) => Math.max(m, d.no), 0) + 1
  draft.value.push({ no: nextNo, name: '', weightPercent: 0, items: [makeItem(nextNo)] })
}
function removeDimension(index: number) {
  draft.value.splice(index, 1)
}
function addItem(dimIndex: number) {
  const dim = draft.value[dimIndex]
  if (!dim) return
  dim.items.push(makeItem(dim.no))
}
function removeItem(dimIndex: number, itemIndex: number) {
  draft.value[dimIndex]?.items.splice(itemIndex, 1)
}

/** 子权重按百分数输入（0.35 ↔ 35，展示对齐参考稿），存库仍为维度内小数（和=1） */
function pctOf(subWeight: number): number {
  return Number(((subWeight ?? 0) * 100).toFixed(2))
}
function setPct(item: HealthTemplateDimension['items'][number], value: number | null) {
  item.subWeight = Number(((value ?? 0) / 100).toFixed(4))
}
function subPctSum(dim: HealthTemplateDimension): number {
  return Number((dim.items.reduce((sum, i) => sum + (Number(i.subWeight) || 0), 0) * 100).toFixed(2))
}
function subPctSumText(dim: HealthTemplateDimension): string {
  return subPctSum(dim).toFixed(2)
}
function subPctOk(dim: HealthTemplateDimension): boolean {
  return Math.abs(subPctSum(dim) - 100) <= 1e-6
}

/* ---------- 删除 ---------- */
const deleteRow = ref<HealthTemplateSummary | null>(null)
const deleteOpen = ref(false)

function openDelete(row: HealthTemplateSummary | null) {
  if (!row) return
  guard(() => {
    deleteRow.value = row
    error.value = ''
    deleteOpen.value = true
  })
}

async function confirmDelete() {
  const row = deleteRow.value
  if (!row) return
  if (await submit(() => deleteHealthTemplate(row.id))) {
    deleteOpen.value = false
    if (activeId.value === row.id) {
      activeId.value = null
      draft.value = []
      const first = rows.value[0]
      if (first) await doSelect(first.id)
    }
  }
}

onMounted(async () => {
  await reload()
  const first = rows.value[0]
  if (first) await doSelect(first.id)
})
</script>

<template>
  <div class="htp">
    <!-- 顶部：模板页签（按设备类型） + 右侧操作 -->
    <div class="htp-top">
      <div class="htp-tabs">
        <button
          v-for="row in rows"
          :key="row.id"
          type="button"
          class="htp-tab"
          :class="{ active: row.id === activeId }"
          :title="`${row.code} · 设计寿命 ${row.designLifeYears} 年`"
          @click="selectTemplate(row.id)"
        >
          {{ row.typeName }}
        </button>
        <!-- 2026-11-20 用户口径：新增模板改成页签行末尾的圆框加号图标，悬停 title 给功能说明 -->
        <button
          v-if="writable"
          type="button"
          class="htp-add-icon"
          title="新增模板：按设备类型新建健康度评估模板"
          @click="openAdd"
        >
          <svg viewBox="0 0 16 16" aria-hidden="true">
            <path d="M8 3.5v9M3.5 8h9" />
          </svg>
        </button>
      </div>
      <div class="htp-actions">
        <NButton size="small" :loading="loading" @click="refresh">刷新</NButton>
        <NButton v-if="writable" size="small" :disabled="!activeRow" @click="openDelete(activeRow)">删除模板</NButton>
        <NButton
          v-if="writable" size="small" type="primary" :loading="saving"
          :disabled="!activeRow || treeLoading || !dirty || !!treeError"
          @click="saveEditor"
        >
          保存模板
        </NButton>
      </div>
    </div>

    <!-- 汇总条：模板信息 + 维度权重合计 -->
    <div class="htp-bar">
      <div class="htp-bar-left">
        <template v-if="activeRow && !treeLoading">
          <b class="htp-bar-name">{{ activeRow.typeName }}</b>
          <span class="htp-meta">设计寿命 {{ editorLife ?? '—' }} 年</span>
          <span class="htp-meta">维度数量: {{ draft.length }}</span>
          <NButton v-if="writable" text size="tiny" type="primary" @click="infoOpen = true">编辑基本信息</NButton>
        </template>
        <span v-else-if="treeLoading" class="htp-meta">模板整树加载中…</span>
      </div>
      <span class="htp-total" :class="weightOk ? 'ok' : 'bad'">
        维度权重合计: {{ weightTotalText }} %（{{ weightOk ? '等于 100，可保存' : '必须等于 100，不可保存' }}）
      </span>
    </div>

    <NAlert v-if="listError" type="error" class="htp-alert">
      {{ listError }}
      <NButton size="small" @click="retryList">重试</NButton>
    </NAlert>
    <NAlert v-if="error" type="error" class="htp-alert">{{ error }}</NAlert>
    <NAlert v-if="treeError && activeRow && !treeLoading" type="error" class="htp-alert">{{ treeError }}</NAlert>

    <div v-if="!listError && !loading && !rows.length" class="htp-state">
      暂无模板，点击页签右侧「＋」创建（两步：先建模板壳，再在本页配置维度与评分项）。
    </div>
    <div v-else-if="!listError && rows.length && !activeRow && !treeLoading" class="htp-state">请选择上方模板</div>

    <!-- 双列维度卡（参考稿：序号 + 名称 + 权重%；评分项行内编辑；卡底添加评分项 + 子权重合计） -->
    <div v-else-if="activeRow && !treeLoading" class="htp-grid">
      <section v-for="(dim, di) in draft" :key="di" class="dim-card">
        <div class="dim-head">
          <span class="dim-no mono">{{ di + 1 }}</span>
          <NInput v-model:value="dim.name" :maxlength="64" placeholder="维度名称" class="dim-name" />
          <NInputNumber
            v-model:value="dim.weightPercent" :min="0" :max="100" :precision="2" :show-button="false"
            class="dim-weight" placeholder="权重"
          />
          <span class="unit">%</span>
          <button v-if="writable" type="button" class="icon-del" title="删除维度" @click="removeDimension(di)">
            <svg viewBox="0 0 16 16" aria-hidden="true">
              <path d="M2.5 4.2h11M6.6 4.2V2.7h2.8v1.5M4.2 4.2l.6 9.2a1 1 0 0 0 1 .9h4.4a1 1 0 0 0 1-.9l.6-9.2M6.6 7v4.7M9.4 7v4.7" />
            </svg>
          </button>
        </div>

        <div v-for="(item, ii) in dim.items" :key="ii" class="item-block">
          <div class="item-row">
            <NInput v-model:value="item.name" :maxlength="64" placeholder="评分项名称" class="item-name" />
            <!-- 自动项只读标识（自动项由服务端按运行年限预计算，界面不再提供勾选切换，2026-11-17） -->
            <span v-if="item.autoCalculated" class="auto-badge">自动</span>
            <NInputNumber
              :value="pctOf(item.subWeight)" :min="0" :max="100" :precision="2" :show-button="false"
              class="item-weight" placeholder="子权重"
              @update:value="(v: number | null) => setPct(item, v)"
            />
            <span class="unit">%</span>
            <button v-if="writable" type="button" class="icon-del" title="删除评分项" @click="removeItem(di, ii)">
              <svg viewBox="0 0 16 16" aria-hidden="true">
                <path d="M2.5 4.2h11M6.6 4.2V2.7h2.8v1.5M4.2 4.2l.6 9.2a1 1 0 0 0 1 .9h4.4a1 1 0 0 0 1-.9l.6-9.2M6.6 7v4.7M9.4 7v4.7" />
              </svg>
            </button>
          </div>
          <!-- 四档判定文案必填（自动项豁免）：预校验 templateTree.ts 拦截 -->
          <div v-if="!item.autoCalculated" class="item-grades">
            <span class="grade-label req">正常</span>
            <NInput v-model:value="item.normal" :maxlength="255" placeholder="正常档判定文案" />
            <span class="grade-label req">注意</span>
            <NInput v-model:value="item.attention" :maxlength="255" placeholder="注意档判定文案" />
            <span class="grade-label req">异常</span>
            <NInput v-model:value="item.abnormal" :maxlength="255" placeholder="异常档判定文案" />
            <span class="grade-label req">严重</span>
            <NInput v-model:value="item.severe" :maxlength="255" placeholder="严重档判定文案" />
          </div>
          <p v-else class="item-auto-hint">自动项：服务端按「运行年限/设计寿命」预计算，四档判定文案可留空</p>
        </div>

        <div class="dim-foot">
          <NButton v-if="writable" text size="small" type="primary" @click="addItem(di)">＋ 添加评分项</NButton>
          <span v-else />
          <span class="dim-subsum" :class="{ bad: !subPctOk(dim) }">子权重合计 {{ subPctSumText(dim) }} %</span>
        </div>
      </section>

      <button v-if="writable" type="button" class="dim-add" @click="addDimension">＋ 添加维度</button>
    </div>

    <!-- 新增模板第一步：模板壳 -->
    <ConfigDialog
      :show="shellOpen" :saving="saving" :error="error" title="新增模板 · 基本信息"
      @close="shellOpen = false" @submit="saveShell"
    >
      <p class="dlg-hint">
        两步新增：先建模板壳，保存成功后回到本页继续配置维度与评分项（第二步）。完成整树保存前该设备类型的箱柜评估不可用。
      </p>
      <NForm @submit.prevent="saveShell">
        <NFormItem label="模板编码" required>
          <NInput v-model:value="shellCode" :maxlength="32" placeholder="如 HV_SWITCH / DRY_TRANSFORMER" />
        </NFormItem>
        <NFormItem label="匹配设备类型" required>
          <NInput v-model:value="shellTypeName" :maxlength="64" placeholder="按箱柜设备类型名称精确匹配，如 高压开关柜" />
        </NFormItem>
        <NFormItem label="设计寿命(年)" required>
          <NInputNumber v-model:value="shellLife" :min="1" :precision="0" :show-button="false" class="life-input" />
        </NFormItem>
      </NForm>
    </ConfigDialog>

    <!-- 编辑基本信息（7.6.4，仅壳字段；维度与评分项由「保存模板」整树提交） -->
    <ConfigDialog
      :show="infoOpen" :saving="saving" :error="error" title="编辑基本信息"
      @close="infoOpen = false" @submit="saveInfo"
    >
      <NForm @submit.prevent="saveInfo">
        <NFormItem label="模板编码" required>
          <NInput v-model:value="editorCode" :maxlength="32" />
        </NFormItem>
        <NFormItem label="匹配设备类型" required>
          <NInput v-model:value="editorTypeName" :maxlength="64" />
        </NFormItem>
        <NFormItem label="设计寿命(年)" required>
          <NInputNumber v-model:value="editorLife" :min="1" :precision="0" :show-button="false" class="life-input" />
        </NFormItem>
      </NForm>
      <p class="dlg-hint">基本信息保存即生效，维度与评分项的修改由「保存模板」提交（全量替换）。</p>
    </ConfigDialog>

    <!-- 删除确认 -->
    <ConfigDialog
      :show="deleteOpen" :saving="saving" :error="error" danger title="确认删除"
      @close="deleteOpen = false" @submit="confirmDelete"
    >
      <p>确认删除模板「{{ deleteRow?.typeName }}（{{ deleteRow?.code }}）」？该设备类型的箱柜将无法评估。</p>
      <p>评估历史靠明细快照自包含，不受影响。</p>
    </ConfigDialog>

    <!-- 未保存修改守卫（宝安适配：可自动保存时确定=保存并切换，不完整才丢弃） -->
    <ConfigDialog
      :show="confirmOpen"
      :saving="false"
      :error="''"
      title="有未保存的修改"
      :action="treeError ? '丢弃并切换' : '保存并切换'"
      @close="confirmOpen = false"
      @submit="confirmLeave"
    >
      <p v-if="treeError">模板配置不完整（{{ treeError }}），无法自动保存，切换将丢弃这些修改。</p>
      <p v-else>当前模板有未保存的修改，确定后将自动保存并切换。</p>
    </ConfigDialog>
  </div>
</template>

<style scoped>
.dlg-hint {
  margin: 0 0 12px;
  font-size: 13px;
  color: var(--muted);
  line-height: 1.6;
}
.life-input {
  width: 100%;
}

/* 顶部：页签 + 操作 */
.htp-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 12px;
}
.htp-tabs {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  min-width: 0;
}
.htp-tab {
  padding: 7px 18px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: #fff;
  font: inherit;
  font-size: 14px;
  color: var(--muted);
  cursor: pointer;
  transition: all 0.12s;
}
.htp-tab:hover {
  border-color: var(--primary);
  color: var(--primary-700);
}
.htp-tab.active {
  background: var(--primary);
  border-color: var(--primary);
  color: #fff;
  font-weight: 600;
}
.htp-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: none;
}
/* 新增模板：页签行末尾的圆框加号（2026-11-20 用户口径，取代右上大按钮），悬停靠原生 title */
.htp-add-icon {
  display: inline-flex;
  /* 页签行默认 stretch，固定 32px 高会贴行顶 → 显式居中 */
  align-self: center;
  align-items: center;
  justify-content: center;
  flex: none;
  width: 32px;
  height: 32px;
  padding: 0;
  border: 1.5px solid var(--primary);
  border-radius: 50%;
  background: #fff;
  color: var(--primary);
  cursor: pointer;
  transition: all 0.12s;
}
.htp-add-icon svg {
  width: 16px;
  height: 16px;
  fill: none;
  stroke: currentColor;
  stroke-width: 1.6;
  stroke-linecap: round;
}
.htp-add-icon:hover {
  background: var(--primary);
  color: #fff;
}

/* 汇总条 */
.htp-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 9px 14px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--primary-50);
  margin-bottom: 12px;
}
.htp-bar-left {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px 14px;
  min-width: 0;
  font-size: 13px;
}
.htp-bar-name {
  font-size: 14px;
  color: var(--title);
}
.htp-meta {
  color: var(--muted);
}
.htp-total {
  flex: none;
  font-size: 13px;
  font-weight: 600;
}
.htp-total.ok {
  color: var(--ok-text);
}
.htp-total.bad {
  color: var(--danger-text);
}
.htp-alert {
  margin-bottom: 12px;
}
.htp-state {
  padding: 42px 16px;
  text-align: center;
  font-size: 14px;
  color: var(--muted);
  background: rgba(196, 218, 240, 0.3);
  border-radius: 10px;
}

/* 双列维度卡 */
.htp-grid {
  flex: 1 0 auto;
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 14px;
}
.dim-card {
  display: flex;
  flex-direction: column;
  border: 1px solid var(--border);
  border-radius: 10px;
  background: #fff;
  padding: 12px 14px 10px;
}
.dim-head {
  display: flex;
  align-items: center;
  gap: 8px;
  padding-bottom: 10px;
  border-bottom: 1px solid var(--border);
}
.dim-no {
  flex: none;
  width: 22px;
  height: 22px;
  border-radius: 50%;
  background: var(--primary);
  color: #fff;
  font-size: 12px;
  font-weight: 700;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}
.dim-name {
  flex: 1;
  min-width: 90px;
}
.dim-weight {
  width: 86px;
  flex: none;
}
.unit {
  flex: none;
  font-size: 12px;
  color: var(--muted);
}
.icon-del {
  flex: none;
  width: 26px;
  height: 26px;
  border: none;
  border-radius: 6px;
  background: transparent;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: var(--muted);
}
.icon-del:hover {
  color: var(--danger-text);
  background: rgba(229, 72, 77, 0.08);
}
.icon-del svg {
  width: 15px;
  height: 15px;
  fill: none;
  stroke: currentColor;
  stroke-width: 1.4;
  stroke-linecap: round;
  stroke-linejoin: round;
}
.item-block {
  padding: 9px 0 7px;
}
/* 评分项之间的分隔虚线：加深的蓝（2026-11-17 用户口径） */
.item-block + .item-block {
  border-top: 1px dashed rgba(23, 78, 147, 0.6);
}
.item-row {
  display: flex;
  align-items: center;
  gap: 8px;
}
.auto-badge {
  flex: none;
  padding: 1px 8px;
  border-radius: 999px;
  font-size: 11px;
  color: var(--primary-700);
  background: var(--primary-100);
}
.item-name {
  flex: 1;
  min-width: 80px;
}
.item-weight {
  width: 76px;
  flex: none;
}
.item-grades {
  display: grid;
  grid-template-columns: auto 1fr auto 1fr;
  gap: 6px 8px;
  margin-top: 7px;
}
.grade-label {
  font-size: 12px;
  color: var(--muted);
  line-height: 2;
}
/* 四档判定文案必填（2026-11-17）：红星标记 + 预校验拦截（templateTree.ts） */
.grade-label.req::after {
  content: ' *';
  color: var(--danger-text);
  font-weight: 700;
}
.item-auto-hint {
  margin: 6px 0 0;
  font-size: 12px;
  color: var(--muted);
}
.dim-foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-top: auto;
  padding-top: 8px;
}
.dim-subsum {
  font-size: 12px;
  font-weight: 600;
  color: var(--ok-text);
}
.dim-subsum.bad {
  color: var(--danger-text);
}
.dim-add {
  grid-column: 1 / -1;
  align-self: start;
  padding: 11px;
  border: 1px dashed rgba(23, 78, 147, 0.6);
  border-radius: 10px;
  background: transparent;
  font: inherit;
  font-size: 14px;
  color: var(--primary-700);
  cursor: pointer;
}
.dim-add:hover {
  border-color: var(--primary);
  background: var(--primary-50);
}
.mono {
  font-family: var(--font-mono);
}
</style>
