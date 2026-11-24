<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { NButton, NForm, NFormItem, NInput, NInputNumber, NSpace } from 'naive-ui'
import {
  addDataType,
  deleteDataType,
  getDataTypes,
  updateDataType,
  type DataTypeConfig,
} from '../../../api/configuration/configuration'
import ConfigActionButton from './ConfigActionButton.vue'
import ConfigTable from './ConfigTable.vue'
import ConfigDialog from './ConfigDialog.vue'
import { useConfigList, useConfigMutation } from '../composables/useConfiguration'

/** §5.33-5.36 数据类型（CET 曲线字典：类型编码 ↔ DataID） */
const { rows, loading, error: listError, reload } = useConfigList<DataTypeConfig>(getDataTypes)
const { saving, error, writable, submit } = useConfigMutation(reload)
const selected = ref<DataTypeConfig | null>(null)
const mode = ref<'add' | 'edit' | 'delete' | null>(null)
const typeCode = ref('')
const typeName = ref('')
const dataId = ref<number | null>(null)
const remark = ref('')

function open(next: 'add' | 'edit' | 'delete', row?: DataTypeConfig) {
  selected.value = row ?? null
  typeCode.value = row?.typeCode ?? ''
  typeName.value = row?.typeName ?? ''
  dataId.value = row?.dataId ?? null
  remark.value = row?.remark ?? ''
  error.value = ''
  mode.value = next
}

async function save() {
  const row = selected.value
  if (mode.value === 'delete' && row) {
    if (await submit(() => deleteDataType(row.id))) mode.value = null
    return
  }
  const code = typeCode.value.trim()
  const name = typeName.value.trim()
  if (!code) {
    error.value = '请输入类型编码'
    return
  }
  if (!name) {
    error.value = '请输入类型名称'
    return
  }
  if (!dataId.value || dataId.value < 1) {
    error.value = '请输入正整数 DataID'
    return
  }
  if (await submit(async () => {
    let result: DataTypeConfig
    if (!row) {
      result = await addDataType({
        typeCode: code,
        typeName: name,
        dataId: dataId.value!,
        remark: remark.value.trim() || undefined,
      })
    } else {
      // §5.35 字段缺省=保留原值；备注空串=清除（写 null）
      const body: Record<string, unknown> = {}
      if (code !== row.typeCode) body.typeCode = code
      if (name !== row.typeName) body.typeName = name
      if (dataId.value !== row.dataId) body.dataId = dataId.value
      if (remark.value.trim() !== (row.remark ?? '')) body.remark = remark.value.trim()
      result = await updateDataType(row.id, body)
    }
    typeCode.value = result.typeCode
    typeName.value = result.typeName
    dataId.value = result.dataId
    remark.value = result.remark ?? ''
  })) {
    mode.value = null
  }
}

onMounted(reload)
</script>

<template>
  <div>
    <ConfigTable
      title="数据类型列表"
      :headers="['ID', '类型编码', '类型名称', 'DataID', '备注']"
      :rows="rows" :row-key="(row) => row.id"
      :cells="(row) => [row.id, row.typeCode, row.typeName, row.dataId, row.remark]"
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
      :title="mode === 'delete' ? '确认删除' : mode === 'edit' ? '编辑数据类型' : '新增数据类型'"
      @close="mode = null" @submit="save"
    >
      <template v-if="mode === 'delete'">
        <p>确认删除「{{ selected?.typeName }}（{{ selected?.typeCode }}）」？删除后电能参数曲线查询该编码将提示未知数据类型。</p>
      </template>
      <NForm v-else @submit.prevent="save">
        <NFormItem label="类型编码" required>
          <NInput v-model:value="typeCode" :maxlength="32" placeholder="如 Ia / PEsum，曲线查询入参" />
        </NFormItem>
        <NFormItem label="类型名称" required>
          <NInput v-model:value="typeName" :maxlength="64" placeholder="如 A相电流" />
        </NFormItem>
        <NFormItem label="DataID" required>
          <NInputNumber
            v-model:value="dataId" :min="1" :precision="0" :show-button="false"
            placeholder="CET 测点 DataID（正整数，唯一）" class="dataid-input"
          />
        </NFormItem>
        <NFormItem label="备注">
          <NInput v-model:value="remark" type="textarea" :maxlength="255" placeholder="留空可清除已有备注" />
        </NFormItem>
      </NForm>
    </ConfigDialog>
  </div>
</template>

<style scoped>
.dataid-input {
  width: 100%;
}
</style>
