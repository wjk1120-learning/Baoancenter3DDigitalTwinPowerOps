<script setup lang="ts" generic="T">
// 配置中心列表卡片（照搬福永配置中心参考包）：纯前端分页每页 11 条，空值渲染「—」，错误整卡换重试
import { computed, ref, watch } from 'vue'
import { NAlert, NButton, NEmpty, NPagination, NSpin, NTable } from 'naive-ui'

const props = defineProps<{
  title: string
  headers: string[]
  rows: T[]
  rowKey: (row: T) => string | number
  cells: (row: T) => (string | number | null | undefined)[]
  loading: boolean
  error: string
  actions?: boolean
  widths?: (number | string)[]
  actionsWidth?: number | string
  cellAlign?: ('left' | 'center' | 'right')[]
}>()
defineSlots<{ actions(props: { row: T }): unknown; toolbar(): unknown }>()
defineEmits<{ reload: [] }>()

const columnWidths = computed(() =>
  (props.widths ?? []).map((width) => (typeof width === 'number' ? `${width}px` : width)),
)
const actionsColumnWidth = computed(() =>
  props.actionsWidth == null
    ? ''
    : typeof props.actionsWidth === 'number' ? `${props.actionsWidth}px` : props.actionsWidth,
)

const page = ref(1)
const size = 11
watch(() => props.rows, () => { page.value = 1 })
const visible = computed(() => props.rows.slice((page.value - 1) * size, page.value * size))
</script>

<template>
  <NAlert v-if="error" type="error">
    {{ error }}
    <NButton text type="primary" @click="$emit('reload')">重试</NButton>
  </NAlert>
  <section v-else class="config-card">
    <header class="config-card__header">
      <h2 class="config-card__title">{{ title }}</h2>
      <div v-if="$slots.toolbar" class="config-card__actions"><slot name="toolbar" /></div>
    </header>
    <NSpin :show="loading">
      <NTable v-if="rows.length" single-line>
        <colgroup v-if="columnWidths.length || actionsColumnWidth">
          <col
            v-for="(header, index) in headers"
            :key="header"
            :style="columnWidths[index] ? { width: columnWidths[index] } : undefined" />
          <col v-if="actionsColumnWidth" :style="{ width: actionsColumnWidth }" />
        </colgroup>
        <thead><tr>
          <th v-for="header in headers" :key="header" scope="col">{{ header }}</th>
          <th v-if="actions" scope="col">操作</th>
        </tr></thead>
        <tbody>
          <tr v-for="row in visible" :key="rowKey(row)">
            <td
              v-for="(cell, index) in cells(row)"
              :key="index"
              :style="cellAlign?.[index] ? { textAlign: cellAlign[index] } : undefined">{{ cell ?? '—' }}</td>
            <td v-if="actions"><slot name="actions" :row="row" /></td>
          </tr>
        </tbody>
      </NTable>
      <NEmpty v-else class="config-table-empty" :description="loading ? '正在加载…' : '暂无记录'" />
    </NSpin>
    <div v-if="rows.length" class="config-table-footer">
      <span>共 {{ rows.length }} 条记录</span>
      <NPagination
        v-model:page="page"
        :item-count="rows.length"
        :page-size="size" />
    </div>
  </section>
</template>

<style scoped>
.n-table th,
.n-table td { text-align: center; }
td { overflow-wrap: anywhere; white-space: pre-line; }
.config-table-empty { padding: 56px 0; }
.config-card {
  flex: 1 0 auto;
  display: flex;
  flex-direction: column;
  background: var(--panel-solid);
  border: 1px solid var(--border);
  border-radius: 10px;
  padding: 16px 16px 14px;
}
.config-card__header { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 12px; }
.config-card__title { margin: 0; font-size: 17px; font-weight: 600; color: var(--title); }
.config-card__actions { display: flex; align-items: center; gap: 8px; }
.config-card > .n-spin-container { flex: 1 0 auto; }
.config-table-footer { display: flex; justify-content: space-between; align-items: center; margin-top: auto; padding-top: 16px; }
</style>
