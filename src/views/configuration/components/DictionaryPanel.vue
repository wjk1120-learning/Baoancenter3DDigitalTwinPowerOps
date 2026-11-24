<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { NButton, NForm, NFormItem, NInput, NSpace } from 'naive-ui'
import { configPost, deleteConfig, getBuildings, getDeviceTypes, getSwitchings } from '../../../api/configuration/configuration'
import ConfigActionButton from './ConfigActionButton.vue'
import ConfigTable from './ConfigTable.vue'
import ConfigDialog from './ConfigDialog.vue'
import { invalidateCabinetData, invalidateEnergyData, useConfigList, useConfigMutation } from '../composables/useConfiguration'

const props = defineProps<{ board: 'device-types' | 'switchings' | 'buildings' }>()
interface Row {
  id: number
  name: string
  remark?: string | null
}
const { rows, loading, error: listError, reload } = useConfigList<Row>(async () => {
  switch (props.board) {
    case 'device-types': return getDeviceTypes()
    case 'switchings': return (await getSwitchings()).map(({ id, switchingName }) => ({ id, name: switchingName }))
    case 'buildings': return (await getBuildings()).map(({ id, buildingName }) => ({ id, name: buildingName }))
  }
})
const { saving, error, writable, submit } = useConfigMutation(async () => {
  invalidateCabinetData()
  if (props.board === 'buildings') invalidateEnergyData()
  await reload()
})
const selected = ref<Row | null>(null)
const mode = ref<'add' | 'edit' | 'delete' | null>(null)
const name = ref('')
const remark = ref('')

function open(next: 'add' | 'edit' | 'delete', row?: Row) {
  selected.value = row ?? null
  name.value = row?.name ?? ''
  remark.value = row?.remark ?? ''
  error.value = ''
  mode.value = next
}

async function save() {
  const base = '/' + props.board
  const row = selected.value
  if (mode.value === 'delete' && row) {
    if (await submit(() => deleteConfig(`${base}/${row.id}/delete`))) mode.value = null
    return
  }
  const value = name.value.trim()
  if (!value) {
    error.value = '请输入名称'
    return
  }
  const body = props.board === 'device-types'
    ? { name: value, remark: !row || remark.value.trim() !== (row.remark ?? '') ? remark.value.trim() : undefined }
    : props.board === 'switchings' ? { switchingName: value } : { buildingName: value }
  if (await submit(async () => {
    const result = await configPost<Record<string, unknown>>(row ? `${base}/${row.id}/rename` : base, body)
    name.value = String(result.name ?? result.switchingName ?? result.buildingName)
    remark.value = typeof result.remark === 'string' ? result.remark : ''
  })) mode.value = null
}

onMounted(reload)
</script>

<template>
  <div>
    <ConfigTable
      :title="board === 'device-types' ? '设备类型列表' : board === 'switchings' ? '配电房列表' : '楼栋列表'"
      :headers="board === 'device-types' ? ['ID', '名称', '备注'] : ['ID', '名称']"
      :rows="rows" :row-key="(row) => row.id"
      :cells="(row) => board === 'device-types' ? [row.id, row.name, row.remark] : [row.id, row.name]"
      :loading="loading" :error="listError" :actions="writable" @reload="reload"
    >
      <template #toolbar>
        <NButton @click="reload">刷新</NButton>
        <NButton v-if="writable" type="primary" @click="open('add')">新增</NButton>
      </template>
      <template #actions="{ row }">
        <NSpace justify="center">
          <ConfigActionButton tone="primary" @click="open('edit', row)">编辑</ConfigActionButton>
          <ConfigActionButton tone="danger" @click="open('delete', row)">删除</ConfigActionButton>
        </NSpace>
      </template>
    </ConfigTable>
    <ConfigDialog
:show="mode !== null" :saving="saving" :error="error" :danger="mode === 'delete'"
      :title="mode === 'delete' ? '确认删除' : mode === 'edit' ? '编辑' : '新增'"
      @close="mode = null" @submit="save">
      <template v-if="mode === 'delete'">
        <p>确认删除「{{ selected?.name }}」？有关联箱柜时，须先调整箱柜归属。</p>
        <p v-if="board === 'buildings'">删除会清理该楼栋的楼栋和楼层能耗映射。删除派生楼栋会影响能耗派生口径。</p>
      </template>
      <NForm v-else @submit.prevent="save">
        <NFormItem label="名称" required><NInput v-model:value="name" :maxlength="64" /></NFormItem>
        <NFormItem v-if="board === 'device-types'" label="备注">
          <NInput v-model:value="remark" type="textarea" :maxlength="255" placeholder="留空可清除已有备注" />
        </NFormItem>
      </NForm>
    </ConfigDialog>
  </div>
</template>
