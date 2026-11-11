<script setup lang="ts">
import { NDatePicker, NRadio, NRadioGroup } from 'naive-ui'
import { ref, watch } from 'vue'
import { fetchCameraPlaybackUrl } from '../../../api/ezviz/ezviz'
import type { CameraVo, PlaybackSource, PlayUrlVo } from '../../../api/ezviz/types'
import CameraPlayer from '../../../components/CameraPlayer.vue'

/**
 * 回放弹窗（§6.6）：来源（本地/云存储）+ 同日起止时间 → 取流 → CameraPlayer(pcRec) 播放。
 * 云存储平台规则「起止必须同一天」；本地录像按界面一致性同样限同天，起止时间格式
 * yyyy-MM-dd HH:mm:ss。弹窗关闭即卸载 CameraPlayer → 播放器实例销毁停流。
 * 取流为 silent 接口：失败原因在弹窗内展示（errMsg），不打全局错误。
 */
const props = defineProps<{ camera: CameraVo | null }>()
const emit = defineEmits<{ (e: 'close'): void }>()

const source = ref<PlaybackSource>('local')
/** datetimerange 时间戳对 */
const range = ref<[number, number] | null>(null)
const playUrl = ref<PlayUrlVo | null>(null)
const errMsg = ref('')
const loading = ref(false)

function fmt(n: number): string {
  const d = new Date(n)
  const p = (x: number) => String(x).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`
}

function reset() {
  playUrl.value = null
  errMsg.value = ''
  range.value = null
  source.value = 'local'
}

watch(
  () => props.camera,
  (v) => {
    if (v) reset()
  },
)

async function start() {
  errMsg.value = ''
  if (!props.camera) return
  if (!range.value) {
    errMsg.value = '请选择回放起止时间'
    return
  }
  const [a, b] = range.value
  if (new Date(a).toDateString() !== new Date(b).toDateString()) {
    errMsg.value = '回放起止须为同一天（云存储平台规则）'
    return
  }
  if (a >= b) {
    errMsg.value = '开始时间须早于结束时间'
    return
  }
  loading.value = true
  playUrl.value = null
  try {
    const vo = await fetchCameraPlaybackUrl(props.camera.id, source.value, fmt(a), fmt(b))
    if (vo && vo.url && vo.accessToken) playUrl.value = vo
    else errMsg.value = '取流失败：返回数据不完整'
  } catch (e) {
    errMsg.value = e instanceof Error ? e.message : '取流失败'
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <Teleport to="body">
    <div v-if="camera" class="pb-mask" @click.self="emit('close')">
      <div class="pb-panel glass-panel">
        <header class="pb-head">
          <h3>录像回放 · {{ camera.cameraName }}</h3>
          <button class="pb-close" @click="emit('close')">关闭</button>
        </header>

        <div class="pb-form">
          <NRadioGroup v-model:value="source">
            <NRadio value="local">本地录像</NRadio>
            <NRadio value="cloud">云存储录像</NRadio>
          </NRadioGroup>
          <NDatePicker
            v-model:value="range"
            type="datetimerange"
            clearable
            placeholder="选择回放起止（同一天）"
            :actions="null"
            style="width: 380px"
          />
          <button class="pb-start" :disabled="loading" @click="start">
            {{ loading ? '取流中…' : '开始回放' }}
          </button>
        </div>

        <div v-if="errMsg" class="pb-err">{{ errMsg }}</div>

        <div class="pb-stage">
          <CameraPlayer
            v-if="playUrl"
            :play-url="playUrl"
            template="pcRec"
            @error="errMsg = '回放无画面（设备不支持回放或不在录像时间范围）'"
          />
          <div v-else class="pb-empty">
            {{ loading ? '正在取流…' : '选择时间段后开始回放' }}
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.pb-mask {
  position: fixed;
  inset: 0;
  z-index: 200;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(10, 24, 40, 0.45);
  backdrop-filter: blur(3px);
}
.pb-panel {
  width: 900px;
  max-width: 92vw;
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 18px 20px;
  border-radius: var(--radius);
  background: var(--panel-solid);
  box-shadow: var(--shadow);
}
.pb-head {
  display: flex;
  align-items: center;
}
.pb-head h3 {
  margin: 0;
  font-size: 17px;
  color: var(--title);
}
.pb-close {
  margin-left: auto;
  height: 28px;
  padding: 0 14px;
  border: 1px solid var(--border-strong);
  border-radius: 6px;
  background: transparent;
  color: var(--muted);
  font-size: 13px;
  cursor: pointer;
}
.pb-close:hover {
  color: var(--primary);
  border-color: var(--primary-200);
}
.pb-form {
  display: flex;
  align-items: center;
  gap: 14px;
  flex-wrap: wrap;
}
.pb-start {
  height: 32px;
  padding: 0 16px;
  border: none;
  border-radius: 6px;
  background: var(--primary);
  color: var(--on-primary);
  font-size: 13px;
  font-weight: 600;
  font-family: inherit;
  cursor: pointer;
}
.pb-start:hover:not(:disabled) {
  background: var(--primary-600);
}
.pb-start:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}
.pb-err {
  padding: 8px 12px;
  border-radius: 6px;
  background: rgba(229, 72, 77, 0.08);
  border: 1px solid rgba(229, 72, 77, 0.35);
  color: var(--danger-text);
  font-size: 13px;
}
.pb-stage {
  height: 460px;
  border-radius: var(--radius-sm);
  overflow: hidden;
  background: #000;
}
.pb-empty {
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: rgba(255, 255, 255, 0.7);
  font-size: 14px;
  letter-spacing: 1px;
}
</style>
