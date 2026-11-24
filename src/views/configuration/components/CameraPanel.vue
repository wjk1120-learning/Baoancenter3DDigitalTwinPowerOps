<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue'
import { NButton, NForm, NFormItem, NInput, NSpace } from 'naive-ui'
import { addCamera, deleteCamera, fetchCameraList, updateCamera } from '../../../api/ezviz/ezviz'
import type { CameraVo } from '../../../api/ezviz/types'
import ConfigActionButton from './ConfigActionButton.vue'
import ConfigTable from './ConfigTable.vue'
import ConfigDialog from './ConfigDialog.vue'
import { useConfigList, useConfigMutation } from '../composables/useConfiguration'

/**
 * §6.1-6.4 监控配置（2026-11-17 新增第 11 板块）：萤石摄像头台账维护。
 * `/ezviz` 前缀不走 configGet/configPost、不进 validateConfiguration（同健康度模板 §7.6 先例）；
 * 列表 silent、增删改非 silent（拦截器统一 toast，序列号全局唯一重复 code=0）；
 * 写权限 0/1（writable），外部人员被配置中心路由挡住 + 后端 403 兜底。
 * 环境监控页「摄像头管理」入口同日改为跳转本板块（CameraLedgerDrawer 已删，台账唯一维护处）。
 */
const { rows, loading, error: listError, reload } = useConfigList(fetchCameraList)
const { saving, error, writable, submit } = useConfigMutation(reload)

const mode = ref<'add' | 'edit' | 'delete' | null>(null)
const selected = ref<CameraVo>()
const draft = reactive({ deviceSerial: '', cameraName: '', locationDesc: '' })

/** online 三态（true/false/null=查询失败未知），与 /monitor 视频墙「无画面隐藏」口径一致仅作展示 */
function onlineText(row: CameraVo): string {
  if (row.online === true) return '在线'
  if (row.online === false) return '离线'
  return '未知'
}

function open(next: NonNullable<typeof mode.value>, row?: CameraVo) {
  if (!writable.value) return
  selected.value = row
  Object.assign(draft, {
    deviceSerial: row?.deviceSerial ?? '',
    cameraName: row?.cameraName ?? '',
    locationDesc: row?.locationDesc ?? '',
  })
  error.value = ''
  mode.value = next
}

async function save() {
  const row = selected.value
  if (mode.value === 'delete' && row) {
    if (await submit(() => deleteCamera(row.id))) mode.value = null
    return
  }
  const deviceSerial = draft.deviceSerial.trim()
  const cameraName = draft.cameraName.trim()
  const locationDesc = draft.locationDesc.trim()
  if (!deviceSerial || !cameraName) {
    error.value = '请填写设备序列号与摄像头名称'
    return
  }
  if (await submit(async () => {
    // 6.2/6.3 为全量提交目标状态；位置描述空串按可空字段提交 null
    const body = { deviceSerial, cameraName, locationDesc: locationDesc || null }
    const saved = row ? await updateCamera(row.id, body) : await addCamera(body)
    Object.assign(draft, {
      deviceSerial: saved.deviceSerial,
      cameraName: saved.cameraName,
      locationDesc: saved.locationDesc ?? '',
    })
  })) mode.value = null
}

onMounted(reload)
</script>

<template>
  <div>
    <ConfigTable
      title="摄像头台账"
      :headers="['ID', '摄像头名称', '设备序列号', '位置描述', '在线状态']"
      :rows="rows" :row-key="(row) => row.id"
      :cells="(row) => [row.id, row.cameraName, row.deviceSerial, row.locationDesc, onlineText(row)]"
      :loading="loading" :error="listError" :actions="writable" @reload="reload">
      <template #toolbar>
        <NButton @click="reload">刷新</NButton>
        <NButton v-if="writable" type="primary" @click="open('add')">新增摄像头</NButton>
      </template>
      <template #actions="{ row }">
        <NSpace justify="center">
          <ConfigActionButton tone="primary" @click="open('edit', row)">编辑</ConfigActionButton>
          <ConfigActionButton tone="danger" @click="open('delete', row)">删除</ConfigActionButton>
        </NSpace>
      </template>
    </ConfigTable>
    <ConfigDialog
      :show="mode !== null" :title="mode === 'delete' ? '删除摄像头' : mode === 'edit' ? '编辑摄像头' : '新增摄像头'"
      :saving="saving" :error="error" :danger="mode === 'delete'"
      @close="mode = null" @submit="save">
      <p v-if="mode === 'delete'">确认删除摄像头「{{ selected?.cameraName }}」？删除后环境监控页不再展示该画面。</p>
      <NForm v-else @submit.prevent="save">
        <NFormItem label="设备序列号（萤石控制台/APP 查看）" required>
          <NInput v-model:value="draft.deviceSerial" :maxlength="64" placeholder="序列号全局唯一，如 C24805932" />
        </NFormItem>
        <NFormItem label="摄像头名称" required>
          <NInput v-model:value="draft.cameraName" :maxlength="255" placeholder="本地展示名，如 1#变配电房全景" />
        </NFormItem>
        <NFormItem label="位置描述（可选）">
          <NInput v-model:value="draft.locationDesc" :maxlength="255" placeholder="如 福永人民医院1#配电房" />
        </NFormItem>
      </NForm>
    </ConfigDialog>
  </div>
</template>
