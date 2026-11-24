<script setup lang="ts">
import { nextTick, ref, watch } from 'vue'
import { NAlert, NButton, NForm, NFormItem, NInput, NRadioButton, NRadioGroup, NSelect } from 'naive-ui'
import { changeDevice, getDevices, searchCabinets, type DeviceConfig, type DeviceFilter } from '../../../api/configuration/inventory'
import { clearEventCache } from '../../../api/event/event'
import ConfigActionButton from './ConfigActionButton.vue'
import ConfigFilterButtons from './ConfigFilterButtons.vue'
import ConfigTable from './ConfigTable.vue'
import ConfigDialog from './ConfigDialog.vue'
import { configError, invalidateCabinetData, useConfigList, useConfigMutation } from '../composables/useConfiguration'

const filters: { label: string; value: DeviceFilter }[] = [
  { label: '全部设备', value: '' },
  { label: '未绑定箱柜', value: 'unbound' },
  { label: '未配置管理编号', value: 'no-location' },
]
const bindings = [
  { label: '保留当前绑定', value: 'keep' },
  { label: '绑定或更换箱柜', value: 'bind' },
  { label: '解绑箱柜', value: 'unbind' },
]
const filter = ref<DeviceFilter>('')
const { rows, loading, error: listError, reload } = useConfigList(() => getDevices(filter.value))
const { saving, error, warnings, writable, submit } = useConfigMutation(reload)
const selected = ref<DeviceConfig | null>(null)
const enabledDraft = ref<number | null>(null)
const binding = ref<'keep' | 'bind' | 'unbind'>('keep')
const cabinetId = ref<number | null>(null)
const keyword = ref('')
const cabinetOptions = ref<{ label: string; value: number; name: string }[]>([])
/** 管理编号行式编辑（2026-11-19 用户口径）：一行一框 + 编辑/移除，＋加行，滚动区最多露三行 */
const locationRows = ref<string[]>([])
const rowInputs = ref<{ focus: () => void }[]>([])

function addLocationRow() {
  locationRows.value.push('')
  nextTick(() => rowInputs.value[locationRows.value.length - 1]?.focus())
}

function removeLocationRow(index: number) {
  locationRows.value.splice(index, 1)
}

function focusLocationRow(index: number) {
  rowInputs.value[index]?.focus()
}
const searching = ref(false)
const searchError = ref('')
let searchVersion = 0

/* ---------- 箱柜联想下拉（§5.19 fuzzy-search；输入即搜，浏览器搜索联想式） ---------- */
const comboOpen = ref(false)
const activeIndex = ref(0)
const menuEl = ref<HTMLElement | null>(null)
const pickedName = ref('')
let comboDebounce: number | null = null

function open(row: DeviceConfig) {
  selected.value = row
  enabledDraft.value = row.enabled
  binding.value = 'keep'
  cabinetId.value = null
  keyword.value = ''
  locationRows.value = [...row.locationNumbers]
  cabinetOptions.value = []
  searching.value = false
  searchError.value = ''
  error.value = ''
  comboOpen.value = false
  activeIndex.value = 0
  pickedName.value = ''
}

function close() {
  searchVersion++
  comboOpen.value = false
  selected.value = null
}

async function findCabinets() {
  const query = keyword.value.trim()
  if (!query || searching.value) return
  const request = ++searchVersion
  cabinetOptions.value = []
  cabinetId.value = null
  searchError.value = ''
  searching.value = true
  try {
    const result = await searchCabinets(query)
    if (request !== searchVersion) return
    cabinetOptions.value = result.map((cabinet) => ({
      label: `${cabinet.superName}（#${cabinet.id}）`,
      value: cabinet.id,
      name: cabinet.superName,
    }))
    activeIndex.value = 0
    comboOpen.value = true
    if (!result.length) searchError.value = '未找到匹配箱柜'
  } catch (e) {
    if (request === searchVersion) {
      searchError.value = configError(e)
      activeIndex.value = 0
      comboOpen.value = true
    }
  } finally {
    if (request === searchVersion) searching.value = false
  }
}

watch(keyword, () => {
  if (keyword.value.trim() === pickedName.value && cabinetId.value != null) return
  pickedName.value = ''
  if (comboDebounce !== null) clearTimeout(comboDebounce)
  const query = keyword.value.trim()
  if (!query) {
    searchVersion++
    cabinetOptions.value = []
    cabinetId.value = null
    searchError.value = ''
    searching.value = false
    comboOpen.value = false
    return
  }
  comboDebounce = window.setTimeout(() => {
    comboDebounce = null
    void findCabinets()
  }, 250)
})

function pickCabinet(index: number) {
  const option = cabinetOptions.value[index]
  if (!option) return
  cabinetId.value = option.value
  keyword.value = option.name
  pickedName.value = option.name
  comboOpen.value = false
}

function onKeywordFocus() {
  if (cabinetOptions.value.length && keyword.value.trim()) comboOpen.value = true
}

function scrollActiveIntoView() {
  void nextTick(() => {
    menuEl.value?.querySelector('.cabinet-combo__option.is-active')?.scrollIntoView({ block: 'nearest' })
  })
}

function onComboKeydown(e: KeyboardEvent) {
  if (!comboOpen.value) return
  if (e.key === 'ArrowDown') {
    e.preventDefault()
    if (cabinetOptions.value.length && activeIndex.value < cabinetOptions.value.length - 1) {
      activeIndex.value++
      scrollActiveIntoView()
    }
  } else if (e.key === 'ArrowUp') {
    e.preventDefault()
    if (activeIndex.value > 0) {
      activeIndex.value--
      scrollActiveIntoView()
    }
  } else if (e.key === 'Enter') {
    if (!searching.value && cabinetOptions.value[activeIndex.value]) {
      e.preventDefault()
      pickCabinet(activeIndex.value)
    }
  } else if (e.key === 'Escape') {
    comboOpen.value = false
  }
}

function locationSet(values: string[]) {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))].sort()
}

async function save() {
  const row = selected.value
  if (!row) return
  if (binding.value === 'bind' && cabinetId.value == null) {
    error.value = '请输入关键字并从下拉中选择箱柜'
    return
  }
  const numbers = locationSet(locationRows.value)
  const locationsChanged = JSON.stringify(numbers) !== JSON.stringify(locationSet(row.locationNumbers))
  const superId = binding.value === 'unbind' ? 0 : binding.value === 'bind' ? cabinetId.value ?? undefined : undefined
  /* §5.14 enabled：仅与当前值不同时提交（0=停用/1=启用，缺省=不修改） */
  const enabledChanged =
    (enabledDraft.value === 0 || enabledDraft.value === 1) && enabledDraft.value !== row.enabled
  if (!locationsChanged && superId == null && !enabledChanged) {
    close()
    return
  }
  if (await submit(async () => {
    const result = await changeDevice(row.deviceId, {
      superId,
      locationNumbers: locationsChanged ? numbers : undefined,
      enabled: enabledChanged ? enabledDraft.value ?? undefined : undefined,
    })
    warnings.value = result.warnings ?? []
    selected.value = result
    enabledDraft.value = result.enabled
    locationRows.value = [...result.locationNumbers]
    binding.value = 'keep'
    if (superId != null) invalidateCabinetData()
    if (locationsChanged) clearEventCache()
  })) close()
}

watch(filter, reload, { immediate: true })
</script>

<template>
  <div>
    <div class="config-toolbar">
      <div class="config-toolbar__filters">
        <ConfigFilterButtons :options="filters" :value="filter" label="设备筛选" @change="filter = $event" />
      </div>
    </div>
    <NAlert v-if="warnings.length" class="config-notice" type="warning">
      <div v-for="warning in warnings" :key="warning">{{ warning }}</div>
    </NAlert>
    <ConfigTable
      title="设备列表"
:headers="['设备 ID', '设备名称', '通道 ID', '状态', '所属箱柜', '管理编号']"
      :rows="rows" :row-key="(row) => row.deviceId"
      :cells="(row) => [row.deviceId, row.deviceName, row.channelId, row.enabled === 1 ? '启用' : row.enabled === 0 ? '停用' : '—', row.superName, row.locationNumbers.join('、') || null]"
      :loading="loading" :error="listError" :actions="writable" @reload="reload">
      <template #toolbar><NButton @click="reload">刷新</NButton></template>
      <template #actions="{ row }"><ConfigActionButton tone="primary" @click="open(row)">编辑</ConfigActionButton></template>
    </ConfigTable>
    <ConfigDialog
:show="!!selected" title="编辑设备" :saving="saving" :error="error"
      @close="close" @submit="save">
      <div class="device-meta">
        <span class="device-meta__group">
          <span class="device-meta__label">当前箱柜</span>
          <span class="device-meta__chip device-meta__chip--cabinet" :title="selected?.superName ?? '未绑定'">{{ selected?.superName ?? '未绑定' }}</span>
        </span>
        <span class="device-meta__group">
          <span class="device-meta__label">当前状态</span>
          <span class="device-meta__chip device-meta__chip--status">{{ selected?.enabled === 1 ? '启用' : selected?.enabled === 0 ? '停用' : '—' }}</span>
        </span>
      </div>
      <NForm @submit.prevent="save">
        <NFormItem label="启用状态">
          <NRadioGroup v-model:value="enabledDraft">
            <NRadioButton :value="1">启用</NRadioButton>
            <NRadioButton :value="0">停用</NRadioButton>
          </NRadioGroup>
        </NFormItem>
        <NFormItem label="箱柜绑定"><NSelect v-model:value="binding" :options="bindings" /></NFormItem>
        <template v-if="binding === 'bind'">
          <NFormItem label="按箱柜名称搜索" required>
            <div class="cabinet-combo" @keydown="onComboKeydown">
              <NInput
                v-model:value="keyword" placeholder="输入箱柜名称关键字"
                @focus="onKeywordFocus" @blur="comboOpen = false"
              />
              <div v-if="comboOpen" ref="menuEl" class="cabinet-combo__menu">
                <div v-if="searching" class="cabinet-combo__hint">搜索中…</div>
                <template v-else-if="cabinetOptions.length">
                  <button
                    v-for="(option, index) in cabinetOptions" :key="option.value" type="button"
                    class="cabinet-combo__option" :class="{ 'is-active': index === activeIndex }"
                    :title="option.label" @mousedown.prevent @click="pickCabinet(index)"
                  >
                    {{ option.label }}
                  </button>
                </template>
                <div v-else class="cabinet-combo__hint">{{ searchError || '未找到匹配箱柜' }}</div>
              </div>
            </div>
          </NFormItem>
        </template>
        <NFormItem label="管理编号">
          <div class="locations-field">
            <span class="locations-meta__warn">修改或删除原编号可能影响历史告警位置解析。</span>
            <div class="location-rows">
              <div v-for="(_, i) in locationRows" :key="i" class="location-row">
                <NInput
                  :ref="(el) => (rowInputs[i] = el as unknown as { focus: () => void })"
                  v-model:value="locationRows[i]" placeholder="如 FY-ZY3-GF-P1#-1AA1"
                />
                <button type="button" class="location-row__btn" @click="focusLocationRow(i)">编辑</button>
                <button type="button" class="location-row__btn location-row__btn--remove" @click="removeLocationRow(i)">移除</button>
              </div>
            </div>
            <button type="button" class="location-add" title="新增一行管理编号" @click="addLocationRow">＋</button>
          </div>
        </NFormItem>
      </NForm>
    </ConfigDialog>
  </div>
</template>

<style scoped>
/* 弹窗头部：当前箱柜（左，值=蓝底框）· 当前状态（右，值=绿底框）；标签不进框 */
.device-meta {
  display: flex;
  gap: 12px;
  align-items: center;
  justify-content: space-between;
  margin: 2px 0 16px;
  padding-bottom: 14px;
  border-bottom: 1px solid #edf2f8;
}

.device-meta__group {
  display: inline-flex;
  gap: 10px;
  align-items: center;
}

.device-meta__label {
  color: var(--muted);
  font-size: 13px;
}

.device-meta__chip {
  display: inline-flex;
  align-items: center;
  height: 28px;
  max-width: 420px;
  padding: 0 12px;
  overflow: hidden;
  border-radius: 8px;
  font-size: 13px;
  font-weight: 600;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.device-meta__chip--cabinet {
  color: var(--primary-700);
  background: var(--primary-50);
  border: 1px solid var(--primary-100);
}

.device-meta__chip--status {
  color: #1e7b3c;
  background: #e9f7ee;
  border: 1px solid #bfe5cd;
}

/* 管理编号行式编辑（2026-11-19）：琥珀提示在标签下，行列表最多露三行带滚动条，左下角＋加行 */
.locations-field {
  display: flex;
  flex-direction: column;
  gap: 8px;
  width: 100%;
}

.locations-meta__warn {
  color: #a8742a;
  font-size: 13px;
  line-height: 1.5;
}

.location-rows {
  display: flex;
  flex-direction: column;
  gap: 8px;
  max-height: 126px; /* 3 × 34px 行高 + 2 × 8px 间距：一次最多完整展示三行，其余滚动 */
  overflow-y: auto;
}

.location-row {
  display: flex;
  flex: none;
  gap: 8px;
  align-items: center;
}

.location-row .n-input {
  flex: 1;
}

.location-row__btn {
  flex: none;
  padding: 6px 12px;
  border: 1px solid var(--primary-100, #d6e8f7);
  border-radius: 8px;
  background: var(--primary-50, #eaf3fb);
  color: var(--primary-700);
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition:
    color 0.15s,
    border-color 0.15s,
    background 0.15s;
}

.location-row__btn:hover {
  color: var(--primary);
  border-color: var(--primary-300, #7fb0e8);
}

.location-row__btn--remove {
  color: #a92a30;
  background: #fdf2f2;
  border-color: #f7dcdd;
}

.location-row__btn--remove:hover {
  color: #d7312e;
  border-color: #ecb0b3;
  background: #fbe6e7;
}

.location-add {
  align-self: flex-start;
  width: 34px;
  height: 30px;
  border: 1px dashed var(--primary-300, #7fb0e8);
  border-radius: 8px;
  background: #fff;
  color: var(--primary);
  font-size: 18px;
  line-height: 1;
  cursor: pointer;
  transition: background 0.15s;
}

.location-add:hover {
  background: var(--primary-50, #eaf3fb);
}

.cabinet-combo {
  position: relative;
  width: 100%;
}

.cabinet-combo__menu {
  position: absolute;
  top: calc(100% + 4px);
  right: 0;
  left: 0;
  z-index: 10;
  max-height: 119px; /* 3.5 × 34px 行高：三行整显 + 第四行露半截，滚动查看其余 */
  overflow-y: auto;
  background: #fff;
  border: 1px solid #b9cee9;
  border-radius: 8px;
  box-shadow: 0 8px 24px rgba(43, 124, 227, 0.12);
}

.cabinet-combo__option {
  display: block;
  width: 100%;
  height: 34px;
  padding: 0 12px;
  overflow: hidden;
  border: 0;
  background: none;
  color: #33485f;
  font: inherit;
  line-height: 34px;
  text-align: left;
  text-overflow: ellipsis;
  white-space: nowrap;
  cursor: pointer;
}

.cabinet-combo__option:hover,
.cabinet-combo__option.is-active {
  background: #eaf3fb;
}

.cabinet-combo__hint {
  height: 34px;
  padding: 0 12px;
  color: #5d7189;
  font-size: 13px;
  line-height: 34px;
}
</style>
