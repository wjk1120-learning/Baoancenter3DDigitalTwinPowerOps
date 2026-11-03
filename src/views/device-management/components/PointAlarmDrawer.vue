<script setup lang="ts">
import { ref, watch } from 'vue'
import { NDrawer, NDrawerContent } from 'naive-ui'
import type { DeviceDetail, MeasInfo } from '../../../api/device/types'
import { fetchMeasurements } from '../../../api/device/device'
import { fetchDeviceHistoryEvents } from '../../../api/event/event'
import type { EventBrief } from '../../../api/event/types'

/**
 * 点位告警抽屉（4.2④，按需请求）：设备测点实时值（§1.11）+ 历史告警（§3.3）。
 * 仅在设备被点击时拉取，抽屉关闭即清状态。
 */
const props = defineProps<{ device: DeviceDetail | null }>()
const emit = defineEmits<{ close: [] }>()

const meas = ref<MeasInfo[]>([])
const measLoading = ref(false)
const alarms = ref<EventBrief[]>([])
const alarmsLoading = ref(false)

async function load(deviceId: number) {
  measLoading.value = true
  alarmsLoading.value = true
  const [m, a] = await Promise.allSettled([
    fetchMeasurements(deviceId),
    fetchDeviceHistoryEvents(deviceId),
  ])
  meas.value = m.status === 'fulfilled' ? m.value : []
  measLoading.value = false
  alarms.value = a.status === 'fulfilled' ? a.value : []
  alarmsLoading.value = false
}

watch(
  () => props.device,
  (d) => {
    if (d) void load(d.deviceId)
  },
  { immediate: true },
)

const measTypeText = (t: number) => (t === 1 ? '温控' : '仪表')
</script>

<template>
  <NDrawer
    :show="!!props.device"
    :width="480"
    placement="right"
    @update:show="(v: boolean) => !v && emit('close')"
  >
    <NDrawerContent title="点位与告警" closable @close="emit('close')">
      <div class="pa-body">
        <div class="pa-dev">
          <span class="pa-name">{{ props.device?.deviceName ?? '—' }}</span>
          <span class="pa-cab mono">{{ props.device?.superName ?? '' }}</span>
        </div>

        <section class="pa-sec">
          <h4 class="pa-title">实时测点（§1.11）</h4>
          <table class="pa-table">
            <thead>
              <tr><th>测点名称</th><th>类型</th><th>当前值</th></tr>
            </thead>
            <tbody>
              <tr v-for="m in meas" :key="m.measID">
                <td>{{ m.measName }}</td>
                <td>{{ measTypeText(m.measType) }}</td>
                <td class="mono">{{ m.measVal }}</td>
              </tr>
              <tr v-if="!measLoading && !meas.length">
                <td colspan="3" class="pa-empty">无测点数据</td>
              </tr>
            </tbody>
          </table>
          <p v-if="measLoading" class="pa-hint">测点加载中…</p>
        </section>

        <section class="pa-sec">
          <h4 class="pa-title">历史告警（§3.3，共 {{ alarms.length }} 条）</h4>
          <ul class="pa-alarms">
            <li v-for="a in alarms" :key="a.eventId">
              <span class="pa-time mono">{{ a.timeStr }}</span>
              <span class="pa-desc">{{ a.description }}</span>
              <span class="pa-st" :class="{ done: a.handleStatus === 1 }">
                {{ a.handleStatus === 1 ? '已处理' : '未处理' }}
              </span>
            </li>
            <li v-if="!alarmsLoading && !alarms.length" class="pa-empty">该设备暂无历史告警</li>
          </ul>
          <p v-if="alarmsLoading" class="pa-hint">告警加载中…</p>
        </section>
      </div>
    </NDrawerContent>
  </NDrawer>
</template>

<style scoped>
.pa-body {
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.pa-dev {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 10px 14px;
  background: var(--primary-50);
  border-radius: 8px;
}
.pa-name {
  font-size: 16px;
  font-weight: 700;
  color: var(--title);
}
.pa-cab {
  font-size: 13px;
  color: var(--muted);
}
.pa-sec {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.pa-title {
  margin: 0;
  font-size: 15px;
  font-weight: 700;
  color: var(--primary-600);
}
.pa-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 14px;
}
.pa-table th,
.pa-table td {
  padding: 6px 8px;
  border-bottom: 1px solid var(--border);
  text-align: left;
}
.pa-table th {
  background: var(--primary-50);
  color: var(--title);
  font-weight: 600;
}
.mono {
  font-family: var(--font-mono);
}
.pa-alarms {
  margin: 0;
  padding: 0;
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 6px;
  font-size: 14px;
}
.pa-alarms li {
  display: flex;
  align-items: baseline;
  gap: 8px;
  padding: 6px 8px;
  background: var(--primary-50);
  border-radius: 6px;
}
.pa-time {
  flex: none;
  font-size: 12px;
  color: var(--muted);
}
.pa-desc {
  flex: 1;
  min-width: 0;
  color: var(--text);
}
.pa-st {
  flex: none;
  font-size: 12px;
  color: var(--danger-text);
}
.pa-st.done {
  color: var(--muted);
}
.pa-empty {
  color: var(--muted);
  text-align: center;
  padding: 10px;
}
.pa-hint {
  margin: 0;
  font-size: 12px;
  color: var(--muted);
}
</style>
