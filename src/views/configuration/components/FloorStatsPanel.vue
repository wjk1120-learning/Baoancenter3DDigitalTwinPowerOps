<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { NAlert, NButton, NForm, NFormItem, NInput, NInputNumber, NSelect, NSpace } from 'naive-ui'
import { addFloorStats, deleteFloorStats, getFloorStats, updateFloorStats, type Coefficient, type FloorStatsGroup, type StatsDevice } from '../../../api/configuration/energy'
import ConfigActionButton from './ConfigActionButton.vue'
import ConfigDialog from './ConfigDialog.vue'
import ConfigFilterButtons from './ConfigFilterButtons.vue'
import ConfigTable from './ConfigTable.vue'
import { coefficientOptions, useEnergyChoices } from '../composables/useEnergyChoices'
import { invalidateEnergyData, useConfigList, useConfigMutation } from '../composables/useConfiguration'

const filter = ref<number | null>(null)
const { rows, loading, error: listError, reload } = useConfigList(() => getFloorStats(filter.value ?? undefined))
const { writable, saving, error, submit } = useConfigMutation(async () => {
  invalidateEnergyData()
  await reload()
})
const { buildings, buildingOptions } = useEnergyChoices()
const filterOptions = computed(() => [
  { label: '全部楼栋', value: null as number | null },
  ...buildingOptions.value,
])
const selected = ref<FloorStatsGroup>()
const mode = ref<'add' | 'edit' | 'clear' | 'delete' | null>(null)
const buildingId = ref<number | null>(null)
const floor = ref('')
let nextRowKey = 0
const drafts = ref<{ key: number; deviceId: number | null; coefficient: Coefficient }[]>([])

function addDevice() {
  drafts.value.push({ key: nextRowKey++, deviceId: null, coefficient: 1 })
}

function formatDevices(devices: StatsDevice[]) {
  const ids = (coefficient: Coefficient) =>
    devices.filter((device) => device.coefficient === coefficient).map((device) => device.deviceId).join('、')
  const add = ids(1)
  const subtract = ids(-1)
  return [add ? `累加：${add}` : '', subtract ? `扣减：${subtract}` : ''].filter(Boolean).join('\n')
}

function open(next: NonNullable<typeof mode.value>, row?: FloorStatsGroup) {
  selected.value = row
  buildingId.value = row?.buildingId ?? filter.value
  floor.value = row?.floor ?? ''
  drafts.value = row?.devices.map((device) => ({ ...device, key: nextRowKey++ })) ?? []
  if (next === 'add') addDevice()
  error.value = ''
  mode.value = next
}

async function save() {
  const row = selected.value
  if (mode.value === 'clear' && row) {
    if (await submit(async () => {
      const result = await updateFloorStats(row, [])
      if (!result || result.buildingId !== row.buildingId || result.floor !== row.floor || result.devices.length) {
        throw new Error('后端未确认测点组已清空，请刷新核对')
      }
    })) mode.value = 'delete'
    return
  }
  if (mode.value === 'delete' && row) {
    if (await submit(() => deleteFloorStats(row))) mode.value = null
    return
  }

  const building = buildingId.value
  const level = floor.value.trim().toUpperCase()
  if (building == null || !/^(G|-?\d+)$/.test(level)) {
    error.value = '请选择楼栋，并填写 G、数字或负数楼层'
    return
  }
  const devices: StatsDevice[] = []
  const ids = new Set<number>()
  for (const draft of drafts.value) {
    if (draft.deviceId == null || !Number.isInteger(draft.deviceId) || draft.deviceId <= 0 || ids.has(draft.deviceId)) {
      error.value = '请填写每行测点 ID（正整数），同一组内的测点不可重复'
      return
    }
    ids.add(draft.deviceId)
    devices.push({ deviceId: draft.deviceId, coefficient: draft.coefficient })
  }
  if (!devices.length) {
    error.value = row ? '如需清空整组，请使用「清空并删除」操作' : '至少添加一个测点'
    return
  }
  if (await submit(async () => {
    const result = row ? await updateFloorStats(row, devices) : await addFloorStats({ buildingId: building, floor: level }, devices)
    selected.value = result
    buildingId.value = result.buildingId
    floor.value = result.floor
    drafts.value = result.devices.map((device) => ({ ...device, key: nextRowKey++ }))
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
      title="楼层能耗统计列表"
:headers="['楼栋', '楼层', '测点数量', '统计方式与设备']"
      :widths="[101, 88, 135]"
      :actions-width="230"
      :cell-align="['center', 'center', 'center', 'left']"
      :rows="rows" :row-key="(row) => row.buildingId + ':' + row.floor"
      :cells="(row) => [row.buildingName, row.floor, row.devices.length,
        row.devices.length ? formatDevices(row.devices) : null]"
      :loading="loading" :error="listError" :actions="writable" @reload="reload">
      <template #toolbar>
        <NButton @click="reload">刷新</NButton>
        <NButton v-if="writable" type="primary" @click="open('add')">新增楼层测点组</NButton>
      </template>
      <template #actions="{ row }">
        <NSpace justify="center">
          <ConfigActionButton tone="primary" @click="open('edit', row)">编辑测点组</ConfigActionButton>
          <ConfigActionButton tone="danger" @click="open('clear', row)">清空并删除</ConfigActionButton>
        </NSpace>
      </template>
    </ConfigTable>
    <ConfigDialog
:show="mode !== null" :title="mode === 'clear' ? '第 1 步 · 清空测点组' : mode === 'delete' ? '第 2 步 · 确认删除' : '楼层统计测点组'"
      :saving="saving" :error="error" :danger="mode === 'clear' || mode === 'delete'"
      :action="mode === 'clear' ? '确认清空' : undefined" @close="mode = null" @submit="save">
      <NAlert type="warning">楼层测点变更将在次日重新计算楼层日能耗。</NAlert>
      <p v-if="mode === 'clear'">
        即将清空 {{ selected?.buildingName }} {{ selected?.floor }} 层的 {{ selected?.devices.length }} 个测点。
      </p>
      <p v-else-if="mode === 'delete'">后端已确认测点组清空。确认完成 {{ selected?.buildingName }} {{ selected?.floor }} 层的删除操作。</p>
      <NForm v-else @submit.prevent="save">
        <template v-if="mode === 'add'">
          <NFormItem label="楼栋" required>
            <NSelect v-model:value="buildingId" filterable :options="buildingOptions" :loading="buildings.loading.value" />
          </NFormItem>
          <NFormItem label="楼层" required><NInput v-model:value="floor" placeholder="如 G、2 或 -1" /></NFormItem>
        </template>
        <p v-else>{{ selected?.buildingName }} · {{ selected?.floor }} 层</p>
        <div class="floor-device-list">
          <div v-for="(device, index) in drafts" :key="device.key" class="floor-device">
            <NInputNumber v-model:value="device.deviceId" :min="1" :precision="0" :show-button="false" aria-label="测点 ID" placeholder="测点 ID" />
            <NSelect v-model:value="device.coefficient" :options="coefficientOptions" aria-label="统计方式" />
            <NButton :disabled="saving" @click="drafts.splice(index, 1)">移除</NButton>
          </div>
        </div>
        <NButton :disabled="saving" @click="addDevice">添加测点</NButton>
      </NForm>
    </ConfigDialog>
  </div>
</template>

<style scoped>
.floor-device-list { max-height: 330px; overflow: auto; margin-bottom: 12px; }
.floor-device { display: grid; grid-template-columns: 2fr 1fr auto; gap: 8px; margin-bottom: 8px; }
</style>
