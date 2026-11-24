<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { NAlert, NButton, NForm, NFormItem, NInput, NSelect, NSpace } from 'naive-ui'
import { deleteConfig, getBuildings, getDeviceTypes, getSwitchings } from '../../../api/configuration/configuration'
import { changeCabinet, getCabinets, type CabinetConfig, type CabinetFields } from '../../../api/configuration/inventory'
import HealthAssessDialog from './HealthAssessDialog.vue'
import ConfigActionButton from './ConfigActionButton.vue'
import ConfigFilterButtons from './ConfigFilterButtons.vue'
import ConfigTable from './ConfigTable.vue'
import ConfigDialog from './ConfigDialog.vue'
import { configError, invalidateCabinetData, useConfigList, useConfigMutation } from '../composables/useConfiguration'

const props = defineProps<{ createOnMount?: boolean }>()
const { rows, loading, error: listError, reload } = useConfigList(getCabinets)
const { saving, error, warnings, writable, submit } = useConfigMutation(async () => {
  invalidateCabinetData()
  await reload()
})

/* ---------- 筛选（渐变线下 tab 行；§5.15 无筛选参数，客户端过滤）
 * 楼栋筛选已删（2026-11-17 用户口径：后端没有该筛选能力）；只保留柜型筛选。 ---------- */
const typeFilter = ref<number | null>(null)
const filterTypes = ref<Option[]>([])
const typeFilterOptions = computed(() => [
  { label: '全部柜型', value: null as number | null },
  ...filterTypes.value,
])
const filteredRows = computed(() =>
  rows.value.filter((row) => typeFilter.value == null || row.deviceTypeId === typeFilter.value),
)

async function loadFilterChoices() {
  try {
    filterTypes.value = (await getDeviceTypes()).map((row) => ({ label: row.name, value: row.id }))
  } catch {
    /* 筛选字典拉取失败不阻塞列表，选项保持空（仅「全部」档可用） */
  }
}

/* ---------- 健康度评估（2026-11-17 自设备管理页迁入：cabinetId = §5.15 箱柜 id） ---------- */
const assessRow = ref<CabinetConfig | null>(null)
const assessShow = ref(false)
function openAssess(row: CabinetConfig) {
  if (!writable.value) return
  assessRow.value = row
  assessShow.value = true
}
function onAssessSubmitted() {
  // 评估回写箱柜 health：重拉本表刷新健康度列，并清设备目录缓存（§1.4）
  invalidateCabinetData()
  void reload()
}

const mode = ref<'add' | 'edit' | 'delete' | null>(null)
const selected = ref<CabinetConfig>()
const draft = reactive({
  buildingId: null as number | null,
  deviceTypeId: null as number | null,
  switchingId: null as number | null,
  superName: '',
  deviceNumber: '',
  commissionDate: '',
})
type Option = { label: string; value: number }
const buildings = ref<Option[]>([])
const deviceTypes = ref<Option[]>([])
const switchings = ref<Option[]>([])
const choicesLoading = ref(false)
const choicesError = ref('')
const renumbering = computed(() => mode.value === 'edit' && draft.deviceNumber.trim() !== selected.value?.deviceNumber)

async function loadChoices() {
  if (choicesLoading.value) return
  choicesLoading.value = true
  choicesError.value = ''
  try {
    const [buildingRows, types, rooms] = await Promise.all([
      getBuildings(),
      getDeviceTypes(),
      mode.value === 'edit' ? getSwitchings() : Promise.resolve([]),
    ])
    buildings.value = buildingRows.map((row) => ({ label: row.buildingName, value: row.id }))
    deviceTypes.value = types.map((row) => ({ label: row.name, value: row.id }))
    switchings.value = rooms.map((row) => ({ label: row.switchingName, value: row.id }))
  } catch (e) {
    choicesError.value = configError(e)
  } finally {
    choicesLoading.value = false
  }
}

function open(next: NonNullable<typeof mode.value>, row?: CabinetConfig) {
  if (!writable.value || choicesLoading.value) return
  selected.value = row
  Object.assign(draft, {
    buildingId: row?.buildingId ?? null,
    deviceTypeId: row?.deviceTypeId ?? null,
    switchingId: row?.switchingId ?? null,
    superName: row?.superName ?? '',
    deviceNumber: row?.deviceNumber ?? '',
    commissionDate: row?.commissionDate ?? '',
  })
  error.value = ''
  mode.value = next
  if (next !== 'delete') void loadChoices()
}

function isIsoDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const date = new Date(value + 'T00:00:00Z')
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value
}

async function save() {
  const row = selected.value
  if (mode.value === 'delete' && row) {
    if (await submit(() => deleteConfig(`/cabinets/${row.id}/delete`))) mode.value = null
    return
  }
  if (choicesLoading.value || choicesError.value) return
  const superName = draft.superName.trim()
  const deviceNumber = draft.deviceNumber.trim()
  const commissionDate = draft.commissionDate.trim()
  if ((!superName && (!row || superName !== row.superName)) ||
      (!deviceNumber && (!row || deviceNumber !== row.deviceNumber)) ||
      (!row && (draft.buildingId == null || draft.deviceTypeId == null))) {
    error.value = '请填写箱柜名称、设备编号及新增所需的楼栋和类型'
    return
  }
  if (commissionDate && !isIsoDate(commissionDate)) {
    error.value = '投运日期必须是有效的 yyyy-MM-dd 日期'
    return
  }
  const body: Partial<CabinetFields> = {
    buildingId: draft.buildingId !== row?.buildingId ? draft.buildingId ?? undefined : undefined,
    superName: superName !== row?.superName ? superName : undefined,
    deviceNumber: deviceNumber !== row?.deviceNumber ? deviceNumber : undefined,
    deviceTypeId: draft.deviceTypeId !== row?.deviceTypeId ? draft.deviceTypeId ?? undefined : undefined,
    commissionDate: commissionDate && commissionDate !== row?.commissionDate ? commissionDate : undefined,
    switchingId: row && draft.switchingId !== row.switchingId ? draft.switchingId ?? undefined : undefined,
  }
  if (row && Object.values(body).every((value) => value === undefined)) {
    mode.value = null
    return
  }
  if (await submit(async () => {
    const result = await changeCabinet(row?.id, body)
    warnings.value = result.warnings ?? []
    Object.assign(draft, { buildingId: result.buildingId, deviceTypeId: result.deviceTypeId, superName: result.superName, deviceNumber: result.deviceNumber, commissionDate: result.commissionDate ?? '', switchingId: result.switchingId ?? null })
  })) mode.value = null
}

onMounted(() => {
  void reload()
  void loadFilterChoices()
  if (props.createOnMount) open('add')
})
</script>

<template>
  <div>
    <div class="config-toolbar">
      <div class="config-toolbar__filters">
        <ConfigFilterButtons
          :options="typeFilterOptions" :value="typeFilter" label="柜型筛选"
          @change="typeFilter = $event"
        />
      </div>
    </div>
    <NAlert v-if="warnings.length" class="config-notice" type="warning">
      <div v-for="warning in warnings" :key="warning">{{ warning }}</div>
    </NAlert>
    <ConfigTable
      title="箱柜列表"
      :headers="['ID', '箱柜名称', '设备编号', '楼栋', '类型', '配电房', '投运日期', '开关', '健康度']"
      :rows="filteredRows" :row-key="(row) => row.id"
      :cells="(row) => [row.id, row.superName, row.deviceNumber ?? '—', row.buildingName, row.deviceTypeName, row.switchingName, row.commissionDate, row.status === 1 ? '有' : '无', row.health]"
      :loading="loading" :error="listError" :actions="writable" @reload="reload">
      <template #toolbar>
        <NButton @click="reload">刷新</NButton>
        <NButton v-if="writable" type="primary" @click="open('add')">新增箱柜</NButton>
      </template>
      <template #actions="{ row }">
        <NSpace justify="center">
          <ConfigActionButton tone="primary" @click="openAssess(row)">评估</ConfigActionButton>
          <ConfigActionButton tone="primary" @click="open('edit', row)">编辑</ConfigActionButton>
          <ConfigActionButton tone="danger" @click="open('delete', row)">删除</ConfigActionButton>
        </NSpace>
      </template>
    </ConfigTable>
    <ConfigDialog
:show="mode !== null" :title="mode === 'delete' ? '删除箱柜' : mode === 'edit' ? '编辑箱柜' : '箱柜建档'"
      :saving="saving" :error="error" :danger="mode === 'delete'"
      :disabled="mode !== 'delete' && (choicesLoading || !!choicesError)" @close="mode = null" @submit="save">
      <p v-if="mode === 'delete'">确认删除「{{ selected?.superName }}」？箱柜仍有测点设备时须先解绑。</p>
      <template v-else>
        <NAlert v-if="choicesError" type="error">{{ choicesError }} <NButton text @click="loadChoices">重试</NButton></NAlert>
        <NAlert v-if="renumbering" type="warning">历史巡检与缺陷仍按旧编号关联。已建模柜换号需同步核对配电房模板编号。</NAlert>
        <NForm @submit.prevent="save">
          <NFormItem label="箱柜名称" required><NInput v-model:value="draft.superName" :maxlength="255" /></NFormItem>
          <NFormItem label="设备编号" required><NInput v-model:value="draft.deviceNumber" :maxlength="64" /></NFormItem>
          <NFormItem label="楼栋" :required="mode === 'add'">
            <NSelect v-model:value="draft.buildingId" filterable :loading="choicesLoading" :options="buildings" />
          </NFormItem>
          <NFormItem label="设备类型" :required="mode === 'add'">
            <NSelect v-model:value="draft.deviceTypeId" filterable :loading="choicesLoading" :options="deviceTypes" />
          </NFormItem>
          <NFormItem v-if="mode === 'edit'" label="配电房">
            <NSelect v-model:value="draft.switchingId" filterable :loading="choicesLoading" :options="switchings" />
          </NFormItem>
          <p v-else>建档后可通过编辑分配配电房。</p>
          <NFormItem label="投运日期">
            <NInput v-model:value="draft.commissionDate" placeholder="yyyy-MM-dd，留空不修改" :maxlength="10" />
          </NFormItem>
        </NForm>
      </template>
    </ConfigDialog>
    <HealthAssessDialog
      v-model:show="assessShow"
      :cabinet="assessRow ? { superId: assessRow.id, name: assessRow.superName } : null"
      @submitted="onAssessSubmitted"
    />
  </div>
</template>
