<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { NAlert, NButton, NForm, NFormItem, NInputNumber, NSelect, NSpace } from 'naive-ui'
import { addBuildingStats, deleteBuildingStats, getBuildingStats, updateBuildingStats, type BuildingStatsDevice, type Coefficient } from '../../../api/configuration/energy'
import ConfigActionButton from './ConfigActionButton.vue'
import ConfigDialog from './ConfigDialog.vue'
import ConfigFilterButtons from './ConfigFilterButtons.vue'
import ConfigTable from './ConfigTable.vue'
import { coefficientOptions, useEnergyChoices } from '../composables/useEnergyChoices'
import { invalidateEnergyData, useConfigList, useConfigMutation } from '../composables/useConfiguration'

const filter = ref<number | null>(null)
const { rows, loading, error: listError, reload } = useConfigList(() => getBuildingStats(filter.value ?? undefined))
const { writable, saving, error, submit } = useConfigMutation(async () => {
  invalidateEnergyData()
  await reload()
})
const { buildings, buildingOptions } = useEnergyChoices()
const filterOptions = computed(() => [
  { label: '全部楼栋', value: null as number | null },
  ...buildingOptions.value,
])
const selected = ref<BuildingStatsDevice>()
const mode = ref<'add' | 'sentinel' | 'edit' | 'delete' | null>(null)
const buildingId = ref<number | null>(null)
const deviceId = ref<number | null>(null)
const coefficient = ref<Coefficient>(1)

function open(next: NonNullable<typeof mode.value>, row?: BuildingStatsDevice) {
  selected.value = row
  buildingId.value = next === 'sentinel' ? 0 : row?.buildingId ?? filter.value
  deviceId.value = row?.deviceId ?? null
  coefficient.value = row?.coefficient ?? 1
  error.value = ''
  mode.value = next
}

async function save() {
  const row = selected.value
  if (mode.value === 'delete' && row) {
    // 契约 2026-11-24 变更：body buildingId 必填（此前靠设备单行定位可省略）
    if (await submit(() => deleteBuildingStats(row.deviceId, row.buildingId))) mode.value = null
    return
  }
  const id = deviceId.value
  const building = buildingId.value
  if (id == null || !Number.isInteger(id) || id <= 0) {
    error.value = '请填写统计设备 ID（正整数）'
    return
  }
  if (building == null) {
    error.value = '请选择楼栋'
    return
  }
  if (await submit(async () => {
    const device = { deviceId: id, coefficient: coefficient.value }
    const result = row ? await updateBuildingStats(device, building) : await addBuildingStats(device, building)
    selected.value = result
    buildingId.value = result.buildingId
    deviceId.value = result.deviceId
    coefficient.value = result.coefficient
  })) mode.value = null
}

watch(filter, reload, { immediate: true })
</script>

<template>
  <div>
    <div class="config-toolbar">
      <div class="config-toolbar__filters">
        <ConfigFilterButtons :options="filterOptions" :value="filter" label="楼栋筛选" @change="filter = $event" />
      </div>
    </div>
    <NAlert v-if="buildings.error.value" class="config-notice" type="warning">
      楼栋选项加载失败。{{ buildings.error.value }}
      <NButton text @click="buildings.reload">重试</NButton>
    </NAlert>
    <ConfigTable
      title="楼栋能耗统计列表"
      :headers="['楼栋', '设备 ID', '通道 ID', '统计方式']"
      :rows="rows" :row-key="(row) => row.buildingId + ':' + row.deviceId"
      :cells="(row) => [row.buildingName, row.deviceId, row.channelId, row.coefficient === 1 ? '累加' : '扣减']"
      :loading="loading" :error="listError" :actions="writable" @reload="reload">
      <template #toolbar>
        <NButton @click="reload">刷新</NButton>
        <template v-if="writable">
          <NButton @click="open('sentinel')">新增全院统计设备</NButton>
          <NButton type="primary" @click="open('add')">新增楼栋统计设备</NButton>
        </template>
      </template>
      <template #actions="{ row }">
        <NSpace justify="center">
          <ConfigActionButton tone="primary" @click="open('edit', row)">修改统计方式</ConfigActionButton>
          <ConfigActionButton tone="danger" @click="open('delete', row)">删除</ConfigActionButton>
        </NSpace>
      </template>
    </ConfigTable>
    <ConfigDialog
:show="mode !== null" :title="mode === 'delete' ? '删除统计设备' : mode === 'sentinel' ? '新增全院统计设备' : '楼栋统计设备'"
      :saving="saving" :error="error" :danger="mode === 'delete'" @close="mode = null" @submit="save">
      <NAlert v-if="buildingId === 0" type="warning">
        此操作会改变全院及派生楼栋的能耗统计，请先核对计量拓扑。
      </NAlert>
      <p v-if="mode === 'delete'">确认删除 {{ selected?.buildingName }} 的统计设备 #{{ selected?.deviceId }}？</p>
      <NForm v-else @submit.prevent="save">
        <NFormItem v-if="mode === 'add'" label="楼栋" required>
          <NSelect v-model:value="buildingId" filterable :options="buildingOptions" :loading="buildings.loading.value" />
        </NFormItem>
        <NFormItem v-if="!selected" label="统计设备 ID" required>
          <NInputNumber v-model:value="deviceId" :min="1" :precision="0" :show-button="false" placeholder="设备 ID" />
        </NFormItem>
        <p v-else>{{ selected.buildingName }} · 设备 #{{ selected.deviceId }}</p>
        <NFormItem label="统计方式" required><NSelect v-model:value="coefficient" :options="coefficientOptions" /></NFormItem>
      </NForm>
    </ConfigDialog>
  </div>
</template>
