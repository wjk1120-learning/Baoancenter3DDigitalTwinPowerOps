<script setup lang="ts">
import { NButton, NDataTable, NDrawer, NDrawerContent, NForm, NFormItem, NInput, NTag } from 'naive-ui'
import type { DataTableColumns } from 'naive-ui'
import { h, ref, watch } from 'vue'
import { addCamera, deleteCamera, fetchCameraList, updateCamera } from '../../../api/ezviz/ezviz'
import type { CameraSaveBody, CameraVo } from '../../../api/ezviz/types'
import { globalMessage } from '../../../utils/message'

/**
 * 摄像头台账管理抽屉（§6.2/6.3/6.4）：入口按钮仅内部人员可见（页面级已挡，后端 403 兜底）。
 * NDataTable 列表 + 抽屉内新增/编辑表单（NForm/NInput）+ 删除（window.confirm，项目先例）。
 * CRUD 走非 silent 接口：失败由拦截器统一 toast，表单/列表现状保留待修正；
 * 成功后刷新抽屉列表并 emit('changed') 通知页面重拉台账（视频墙联动）。
 */
const props = defineProps<{ open: boolean }>()
const emit = defineEmits<{
  (e: 'close'): void
  (e: 'changed'): void
}>()

const rows = ref<CameraVo[]>([])
const loading = ref(false)

/** 表单态：null=列表视图；id=null 新增 / id=编辑 */
const editing = ref<{ id: number | null; form: CameraSaveBody } | null>(null)
const saving = ref(false)

async function loadRows() {
  loading.value = true
  try {
    rows.value = await fetchCameraList()
  } catch {
    rows.value = []
  } finally {
    loading.value = false
  }
}

watch(
  () => props.open,
  (v) => {
    if (v) {
      editing.value = null
      void loadRows()
    }
  },
)

function openAdd() {
  editing.value = { id: null, form: { deviceSerial: '', cameraName: '', locationDesc: '' } }
}

function openEdit(c: CameraVo) {
  editing.value = {
    id: c.id,
    form: {
      deviceSerial: c.deviceSerial,
      cameraName: c.cameraName,
      locationDesc: c.locationDesc ?? '',
    },
  }
}

function cancelEdit() {
  editing.value = null
}

async function save() {
  if (!editing.value || saving.value) return
  const { id, form } = editing.value
  if (!form.deviceSerial.trim() || !form.cameraName.trim()) {
    globalMessage()?.warning('序列号与名称为必填项')
    return
  }
  saving.value = true
  try {
    const body: CameraSaveBody = {
      deviceSerial: form.deviceSerial.trim(),
      cameraName: form.cameraName.trim(),
      locationDesc: form.locationDesc?.trim() ? form.locationDesc.trim() : null,
    }
    if (id == null) await addCamera(body)
    else await updateCamera(id, body)
    globalMessage()?.success(id == null ? '新增成功' : '修改成功')
    editing.value = null
    await loadRows()
    emit('changed')
  } catch {
    /* 失败原因已由拦截器 toast（如序列号重复），表单保留待修正 */
  } finally {
    saving.value = false
  }
}

async function remove(c: CameraVo) {
  if (!window.confirm(`确认删除摄像头「${c.cameraName}」？`)) return
  try {
    await deleteCamera(c.id)
    globalMessage()?.success('删除成功')
    await loadRows()
    emit('changed')
  } catch {
    /* 失败原因已由拦截器 toast */
  }
}

function onlineTag(c: CameraVo) {
  if (c.online === true) return { text: '在线', type: 'success' as const }
  if (c.online === false) return { text: '离线', type: 'default' as const }
  return { text: '未知', type: 'warning' as const }
}

const columns: DataTableColumns<CameraVo> = [
  { title: '名称', key: 'cameraName', ellipsis: { tooltip: true } },
  { title: '序列号', key: 'deviceSerial', width: 130, ellipsis: { tooltip: true } },
  { title: '位置描述', key: 'locationDesc', ellipsis: { tooltip: true }, render: (c) => c.locationDesc || '—' },
  {
    title: '在线状态',
    key: 'online',
    width: 90,
    render: (c) => {
      const t = onlineTag(c)
      return h(NTag, { size: 'small', type: t.type, bordered: false }, { default: () => t.text })
    },
  },
  {
    title: '操作',
    key: 'actions',
    width: 130,
    render: (c) =>
      h('div', { class: 'cl-actions' }, [
        h(
          NButton,
          { size: 'small', tertiary: true, type: 'primary', onClick: () => openEdit(c) },
          { default: () => '编辑' },
        ),
        h(
          NButton,
          { size: 'small', tertiary: true, type: 'error', onClick: () => void remove(c) },
          { default: () => '删除' },
        ),
      ]),
  },
]
</script>

<template>
  <NDrawer
    class="cl-drawer"
    :show="props.open"
    :width="760"
    @update:show="(v: boolean) => !v && emit('close')"
  >
    <NDrawerContent title="摄像头管理" closable>
      <!-- 列表视图 -->
      <div v-if="!editing" class="cl-list">
        <div class="cl-toolbar">
          <span class="cl-count">共 <b class="num">{{ rows.length }}</b> 台摄像头</span>
          <NButton size="small" type="primary" @click="openAdd">新增摄像头</NButton>
        </div>
        <NDataTable
          :columns="columns"
          :data="rows"
          :loading="loading"
          :bordered="false"
          size="small"
        />
      </div>

      <!-- 新增/编辑表单 -->
      <div v-else class="cl-form">
        <div class="cl-form-title">{{ editing.id == null ? '新增摄像头' : '编辑摄像头' }}</div>
        <NForm label-placement="top" size="small">
          <NFormItem label="设备序列号（萤石控制台/APP 查看）" required>
            <NInput
              v-model:value="editing.form.deviceSerial"
              placeholder="如 C24805932"
              maxlength="64"
            />
          </NFormItem>
          <NFormItem label="摄像头名称" required>
            <NInput
              v-model:value="editing.form.cameraName"
              placeholder="本地展示名，如 1#变配电房全景"
              maxlength="255"
            />
          </NFormItem>
          <NFormItem label="位置描述（可选）">
            <NInput
              v-model:value="editing.form.locationDesc"
              placeholder="如 宝安中心医院1#配电房"
              maxlength="255"
            />
          </NFormItem>
        </NForm>
        <div class="cl-form-actions">
          <NButton size="small" :disabled="saving" @click="cancelEdit">取消</NButton>
          <NButton size="small" type="primary" :loading="saving" @click="save">
            {{ saving ? '保存中…' : '保存' }}
          </NButton>
        </div>
      </div>
    </NDrawerContent>
  </NDrawer>
</template>

<style scoped>
.cl-list {
  display: flex;
  flex-direction: column;
  gap: 14px;
}
.cl-toolbar {
  display: flex;
  align-items: center;
}
/* 主操作：胶囊化 + 轻投影，与项目 back-btn 胶囊语言一致 */
.cl-toolbar .n-button {
  margin-left: auto;
  border-radius: 999px;
  height: 32px;
  padding: 0 18px;
  font-weight: 600;
  box-shadow: 0 4px 12px rgba(43, 108, 160, 0.2);
  transition:
    box-shadow 0.2s,
    transform 0.12s;
}
.cl-toolbar .n-button:hover {
  transform: translateY(-1px);
  box-shadow: 0 6px 16px rgba(43, 108, 160, 0.26);
}
.cl-toolbar .n-button:focus-visible {
  outline: 2px solid var(--primary-300);
  outline-offset: 2px;
}
.cl-count {
  font-size: 13px;
  color: var(--muted);
}
.cl-count b {
  color: var(--primary);
  font-weight: 700;
}

/* 表格质感：表头淡蓝底、行分隔用项目边框色、行悬停淡蓝 */
.cl-list :deep(.n-data-table-th) {
  background: var(--primary-50);
  color: var(--title);
  font-weight: 700;
}
.cl-list :deep(.n-data-table-td) {
  border-bottom: 1px solid var(--border);
}
.cl-list :deep(.n-data-table-tr:hover .n-data-table-td) {
  background: var(--primary-50);
}
/* 状态标签：圆角胶囊 + 字重 */
.cl-list :deep(.n-tag) {
  border-radius: 999px;
  font-weight: 600;
}

.cl-form {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.cl-form-title {
  font-size: 15px;
  font-weight: 700;
  color: var(--title);
}
/* 表单提交主按钮：与工具条同款胶囊 */
.cl-form-actions .n-button {
  border-radius: 999px;
  min-width: 76px;
  font-weight: 600;
}
.cl-form-actions .n-button:focus-visible {
  outline: 2px solid var(--primary-300);
  outline-offset: 2px;
}
.cl-form-actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  margin-top: 8px;
}
</style>

<style>
/* NDataTable render 列与抽屉壳（naive 内部 DOM 无 scoped 属性，走全局块 + 命名空间） */
.cl-actions {
  display: flex;
  gap: 8px;
}
/* 编辑/删除：去底色的细胶囊，悬停各自淡色填充，避免彩色块堆叠的杂乱感 */
.cl-actions .n-button {
  border-radius: 999px;
  background: transparent;
  font-weight: 600;
  transition:
    background-color 0.15s,
    color 0.15s;
}
.cl-actions .n-button:hover {
  background: var(--primary-50);
}
.cl-actions .n-button:last-child {
  color: var(--danger-text);
}
.cl-actions .n-button:last-child:hover {
  background: rgba(229, 72, 77, 0.08);
}
.cl-actions .n-button:focus-visible {
  outline: 2px solid var(--primary-300);
  outline-offset: 1px;
  border-radius: 999px;
}

/* 抽屉壳：标题字重与分隔线 */
.cl-drawer .n-drawer-header {
  border-bottom: 1px solid var(--border);
}
.cl-drawer .n-drawer-header__main {
  font-size: 16px;
  font-weight: 700;
  color: var(--title);
  letter-spacing: 0.5px;
}
.cl-drawer .n-drawer-body-content-wrapper {
  background: linear-gradient(180deg, var(--bg-1), #fff 120px);
}
</style>
