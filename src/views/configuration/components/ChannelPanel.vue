<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { NAlert, NButton, NForm, NFormItem, NInput, NInputNumber, NSpace } from 'naive-ui'
import { changeChannel, deleteChannel, getChannels, type ChannelConfig, type ChannelDeleteResult } from '../../../api/configuration/inventory'
import { clearEventCache } from '../../../api/event/event'
import ConfigActionButton from './ConfigActionButton.vue'
import ConfigTable from './ConfigTable.vue'
import ConfigDialog from './ConfigDialog.vue'
import { invalidateCabinetData, invalidateEnergyData, useConfigList, useConfigMutation } from '../composables/useConfiguration'

const { rows, loading, error: listError, reload } = useConfigList(getChannels)
const { saving, error, warnings, writable, submit } = useConfigMutation(reload)
const mode = ref<'add' | 'edit' | 'delete' | null>(null)
const selected = ref<ChannelConfig>()
const id = ref<number | null>(null)
const name = ref('')
const preview = ref<ChannelDeleteResult | null>(null)
const refreshStatus = ref('')

function open(next: NonNullable<typeof mode.value>, row?: ChannelConfig) {
  selected.value = row
  id.value = row?.channelId ?? null
  name.value = row?.channelName ?? ''
  preview.value = null
  error.value = ''
  mode.value = next
}

async function save() {
  const row = selected.value
  if (mode.value === 'delete' && row) {
    if (!preview.value) {
      await submit(async () => { preview.value = await deleteChannel(row.channelId, false) }, false)
    } else if (await submit(async () => {
      const result = await deleteChannel(row.channelId, true)
      warnings.value = result.warnings ?? []
      refreshStatus.value = '通道已删除，后台正在刷新设备。'
      invalidateCabinetData()
      invalidateEnergyData()
      clearEventCache()
    })) mode.value = null
    return
  }
  const channelId = id.value
  const channelName = name.value.trim()
  if (channelId == null || !Number.isSafeInteger(channelId) || channelId < 1 || !channelName) {
    error.value = '请输入有效的 CET 通道 ID 和名称'
    return
  }
  if (await submit(async () => {
    const result = await changeChannel(row?.channelId, { channelId, channelName })
    id.value = result.channelId
    name.value = result.channelName
    warnings.value = result.warnings ?? []
    refreshStatus.value = !row
      ? result.refreshSubmitted ? '已提交后台设备刷新，请稍后在设备板块刷新查询。' : '设备刷新正在执行，请稍后在设备板块查询入库结果。'
      : ''
    if (!row) invalidateCabinetData()
  })) mode.value = null
}

onMounted(reload)
</script>

<template>
  <div>
    <NAlert v-if="refreshStatus" class="config-notice" type="info">{{ refreshStatus }}</NAlert>
    <NAlert v-if="warnings.length" class="config-notice" type="warning">
      <div v-for="warning in warnings" :key="warning">{{ warning }}</div>
    </NAlert>
    <ConfigTable
      title="通道列表"
      :headers="['通道 ID', '名称']" :rows="rows" :row-key="(row) => row.channelId"
      :cells="(row) => [row.channelId, row.channelName]" :loading="loading" :error="listError"
      :actions="writable" @reload="reload">
      <template #toolbar>
        <NButton @click="reload">刷新</NButton>
        <NButton v-if="writable" type="primary" @click="open('add')">新增通道</NButton>
      </template>
      <template #actions="{ row }">
        <NSpace justify="center">
          <ConfigActionButton tone="primary" @click="open('edit', row)">编辑</ConfigActionButton>
          <ConfigActionButton tone="danger" @click="open('delete', row)">删除</ConfigActionButton>
        </NSpace>
      </template>
    </ConfigTable>
    <ConfigDialog
:show="mode !== null" :title="mode === 'delete' ? '删除通道' : mode === 'edit' ? '编辑通道' : '新增通道'"
      :saving="saving" :error="error" :danger="mode === 'delete' && !!preview"
      :action="mode === 'delete' && !preview ? '预检' : undefined" @close="mode = null" @submit="save">
      <template v-if="mode === 'delete'">
        <p>通道 {{ selected?.channelId }} · {{ selected?.channelName }}</p>
        <p v-if="!preview">先预检并核对影响范围，再确认删除。</p>
        <template v-else>
          <NAlert type="warning">
            将删除 {{ preview.devices.length }} 台设备，清理楼栋映射 {{ preview.buildingDeviceRefs }} 条、
            楼层映射 {{ preview.floorDeviceRefs }} 条、告警位置 {{ preview.alertLocationRefs }} 条。
            <div v-for="warning in preview.warnings" :key="warning">{{ warning }}</div>
          </NAlert>
          <ul class="channel-preview">
            <li v-for="device in preview.devices" :key="device.deviceId">{{ device.deviceId }} · {{ device.deviceName }}</li>
          </ul>
        </template>
      </template>
      <NForm v-else @submit.prevent="save">
        <!-- 宝安适配（2026-11-24 用户反馈）：ID 提示从两个表单项之间移入「CET 通道 ID」
             项内部贴输入框下方，归属清晰；样式对齐福永 .dlg-hint 规格（13px muted） -->
        <NFormItem label="CET 通道 ID" required>
          <div class="id-field">
            <NInputNumber v-model:value="id" :min="1" :precision="0" :show-button="false" :disabled="mode === 'edit'" />
            <p v-if="mode === 'add'" class="field-hint">请填 CET 平台的实际通道 ID，建档后只能改名称。</p>
          </div>
        </NFormItem>
        <NFormItem label="名称" required><NInput v-model:value="name" :maxlength="255" /></NFormItem>
      </NForm>
    </ConfigDialog>
  </div>
</template>

<style scoped>
.channel-preview { max-height: 260px; overflow: auto; }
/* ID 字段 = 输入框 + 提示纵向排布；n-form-item-blank 是 flex，包裹层需自撑满，
 * NInputNumber 失去 flex 拉伸后也要显式给宽 */
.id-field { width: 100%; }
.id-field .n-input-number { width: 100%; }
/* 提示规格对齐福永 .dlg-hint（ConfigurationPage 全局规则只覆盖 n-form 直接子级，
 * 移入表单项后改用类挂载） */
.field-hint { margin: 4px 0 0; font-size: 13px; color: var(--muted); line-height: 1.6; }
</style>
