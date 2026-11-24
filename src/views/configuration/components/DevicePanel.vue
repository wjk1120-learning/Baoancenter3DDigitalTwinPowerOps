<script setup lang="ts">
import { nextTick, ref, watch } from 'vue'
import { NAlert, NButton, NForm, NFormItem, NInput, NRadioButton, NRadioGroup } from 'naive-ui'
import {
  changeDevice,
  getDevices,
  searchCabinets,
  type DeviceConfig,
  type DeviceFilter,
} from '../../../api/configuration/inventory'
import { clearEventCache } from '../../../api/event/event'
import ConfigActionButton from './ConfigActionButton.vue'
import ConfigFilterButtons from './ConfigFilterButtons.vue'
import ConfigTable from './ConfigTable.vue'
import ConfigDialog from './ConfigDialog.vue'
import {
  configError,
  invalidateCabinetData,
  useConfigList,
  useConfigMutation,
} from '../composables/useConfiguration'

const filters: { label: string; value: DeviceFilter }[] = [
  { label: '全部设备', value: '' },
  { label: '未绑定箱柜', value: 'unbound' },
  { label: '未配置管理编号', value: 'no-location' },
]
const filter = ref<DeviceFilter>('')
const { rows, loading, error: listError, reload } = useConfigList(() => getDevices(filter.value))
const { saving, error, warnings, writable, submit } = useConfigMutation(reload)
const selected = ref<DeviceConfig | null>(null)
const enabledDraft = ref<number | null>(null)
/** 所属箱柜（宝安 2026-11-24 用户拍板，替代福永三态绑定选择）：
 * 输入框默认显示当前箱柜名，输入即 §5.19 模糊检索；协议——选定传箱柜 id、
 * 清空传 0（解绑）、与原名一致/未动不传（缺省=不修改）。 */
const originalCabinetName = ref('')
const cabinetId = ref<number | null>(null)
const keyword = ref('')
const cabinetOptions = ref<{ label: string; value: number; name: string }[]>([])
/** 管理编号行式编辑：一行一框（直接改）+ 移除，＋加行（新行自动聚焦），滚动区最多露三行。
 * 宝安适配（2026-11-24 用户拍板，偏离福永）：去掉行内「编辑」按钮——它只做聚焦，
 * 输入框本就随时可编辑，按钮纯属冗余。 */
const locationRows = ref<string[]>([])
const rowInputs = ref<{ focus: () => void }[]>([])

function addLocationRow() {
  locationRows.value.push('')
  nextTick(() => rowInputs.value[locationRows.value.length - 1]?.focus())
}

function removeLocationRow(index: number) {
  locationRows.value.splice(index, 1)
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
  originalCabinetName.value = row.superName ?? ''
  cabinetId.value = null
  keyword.value = originalCabinetName.value
  pickedName.value = keyword.value
  locationRows.value = [...row.locationNumbers]
  cabinetOptions.value = []
  searching.value = false
  searchError.value = ''
  error.value = ''
  comboOpen.value = false
  activeIndex.value = 0
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
      // 宝安适配（2026-11-24 用户拍板）：选项只显示箱柜名称，不带 #id 后缀（提交仍用 id）
      label: cabinet.superName,
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
  if (keyword.value.trim() === pickedName.value) return
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
    menuEl.value
      ?.querySelector('.cabinet-combo__option.is-active')
      ?.scrollIntoView({ block: 'nearest' })
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
  /* 所属箱柜协议（§5.14 superId 缺省=不修改）：清空=解绑(0，原已无绑定时同为缺省)；
   * 与原名一致=不修改（缺省）；输入了新名 → 必须从下拉选定（拿到 id 才能提交） */
  const kw = keyword.value.trim()
  let superId: number | undefined
  if (!kw) {
    superId = originalCabinetName.value ? 0 : undefined
  } else if (kw === originalCabinetName.value) {
    superId = undefined
  } else if (cabinetId.value != null) {
    superId = cabinetId.value
  } else {
    error.value = '请输入关键字并从下拉中选择箱柜，或清空以解绑'
    return
  }
  const numbers = locationSet(locationRows.value)
  const locationsChanged =
    JSON.stringify(numbers) !== JSON.stringify(locationSet(row.locationNumbers))
  /* §5.14 enabled：仅与当前值不同时提交（0=停用/1=启用，缺省=不修改） */
  const enabledChanged =
    (enabledDraft.value === 0 || enabledDraft.value === 1) && enabledDraft.value !== row.enabled
  if (!locationsChanged && superId == null && !enabledChanged) {
    close()
    return
  }
  if (
    await submit(async () => {
      const result = await changeDevice(row.deviceId, {
        superId,
        locationNumbers: locationsChanged ? numbers : undefined,
        enabled: enabledChanged ? (enabledDraft.value ?? undefined) : undefined,
      })
      warnings.value = result.warnings ?? []
      selected.value = result
      enabledDraft.value = result.enabled
      locationRows.value = [...result.locationNumbers]
      originalCabinetName.value = result.superName ?? ''
      keyword.value = originalCabinetName.value
      pickedName.value = keyword.value
      cabinetId.value = null
      if (superId != null) invalidateCabinetData()
      if (locationsChanged) clearEventCache()
    })
  )
    close()
}

watch(filter, reload, { immediate: true })
</script>

<template>
  <div>
    <div class="config-toolbar">
      <div class="config-toolbar__filters">
        <ConfigFilterButtons
          :options="filters"
          :value="filter"
          label="设备筛选"
          @change="filter = $event"
        />
      </div>
    </div>
    <NAlert v-if="warnings.length" class="config-notice" type="warning">
      <div v-for="warning in warnings" :key="warning">{{ warning }}</div>
    </NAlert>
    <ConfigTable
      title="设备列表"
      :headers="['设备 ID', '设备名称', '通道 ID', '状态', '所属箱柜', '管理编号']"
      :rows="rows"
      :row-key="(row) => row.deviceId"
      :cells="
        (row) => [
          row.deviceId,
          row.deviceName,
          row.channelId,
          row.enabled === 1 ? '启用' : row.enabled === 0 ? '停用' : '—',
          row.superName,
          row.locationNumbers.join('、') || null,
        ]
      "
      :loading="loading"
      :error="listError"
      :actions="writable"
      @reload="reload"
    >
      <template #toolbar><NButton @click="reload">刷新</NButton></template>
      <template #actions="{ row }"
        ><ConfigActionButton tone="primary" @click="open(row)">编辑</ConfigActionButton></template
      >
    </ConfigTable>
    <ConfigDialog
      :show="!!selected"
      title="编辑设备"
      :saving="saving"
      :error="error"
      @close="close"
      @submit="save"
    >
      <NForm @submit.prevent="save">
        <NFormItem label="启用状态">
          <NRadioGroup v-model:value="enabledDraft">
            <NRadioButton :value="1">启用</NRadioButton>
            <NRadioButton :value="0">停用</NRadioButton>
          </NRadioGroup>
        </NFormItem>
        <!-- 宝安适配（2026-11-24 用户拍板）：三态绑定选择改为「所属箱柜」单输入框——
             默认显示当前箱柜，输入即 §5.19 模糊检索；选定传 id、清空传 0（解绑）、未动不传 -->
        <NFormItem label="所属箱柜">
          <div class="cabinet-combo" @keydown="onComboKeydown">
            <NInput
              v-model:value="keyword"
              placeholder="留空 = 解绑；输入关键字可更换箱柜"
              @focus="onKeywordFocus"
              @blur="comboOpen = false"
            />
            <div v-if="comboOpen" ref="menuEl" class="cabinet-combo__menu">
              <div v-if="searching" class="cabinet-combo__hint">搜索中…</div>
              <template v-else-if="cabinetOptions.length">
                <button
                  v-for="(option, index) in cabinetOptions"
                  :key="option.value"
                  type="button"
                  class="cabinet-combo__option"
                  :class="{ 'is-active': index === activeIndex }"
                  :title="option.label"
                  @mousedown.prevent
                  @click="pickCabinet(index)"
                >
                  {{ option.label }}
                </button>
              </template>
              <div v-else class="cabinet-combo__hint">{{ searchError || '未找到匹配箱柜' }}</div>
            </div>
          </div>
        </NFormItem>
        <NFormItem label="管理编号">
          <div class="locations-field">
            <span class="locations-meta__warn">修改或删除原编号可能影响历史告警位置解析。</span>
            <div class="location-rows">
              <!-- 宝安适配（2026-11-24 用户拍板）：＋ 不再单独占行，跟在最后一行行尾；空列表才单独显示 -->
              <div v-for="(_, i) in locationRows" :key="i" class="location-row">
                <NInput
                  :ref="(el) => (rowInputs[i] = el as unknown as { focus: () => void })"
                  v-model:value="locationRows[i]"
                  placeholder="如 FY-ZY3-GF-P1#-1AA1"
                />
                <button
                  v-if="i === locationRows.length - 1"
                  type="button"
                  class="location-add"
                  title="新增一行管理编号"
                  @click="addLocationRow"
                >
                  ＋
                </button>
                <button
                  type="button"
                  class="location-row__btn location-row__btn--remove"
                  @click="removeLocationRow(i)"
                >
                  移除
                </button>
              </div>
            </div>
          </div>
        </NFormItem>
      </NForm>
    </ConfigDialog>
  </div>
</template>

<style scoped>
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
  flex: none;
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

/* 空列表时 ＋ 单独占位；有行时它跟在最后一行行尾（见模板） */
.locations-field > .location-add {
  align-self: flex-start;
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
