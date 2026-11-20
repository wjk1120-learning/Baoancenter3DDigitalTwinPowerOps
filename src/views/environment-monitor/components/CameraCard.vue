<script setup lang="ts">
import { onActivated, onBeforeUnmount, onDeactivated, onMounted, ref } from 'vue'
import { captureCamera, fetchCameraLiveUrl } from '../../../api/ezviz/ezviz'
import type { CameraVo, PlayUrlVo } from '../../../api/ezviz/types'
import { globalMessage } from '../../../utils/message'
import CameraPlayer from '../../../components/CameraPlayer.vue'

/**
 * 视频墙单卡：按台账项取流（§6.5，protocol=1 + quality=2 流畅）喂给 CameraPlayer。
 * settle 口径三来源统一上报父页：取流接口失败 / 取流结果缺 url·accessToken / 播放器
 * 无画面（CameraPlayer 的 error）→ broken；首帧出画（CameraPlayer 的 ok）→ ok。
 * 父页以 ok/broken 统计探测进度，settle 完只留 ok 的卡（探测判死的不出现、
 * 播放在途中断流的直接隐藏，重进页面或刷新才重试）。
 * 页签切走 stop、切回 play：本卡片在页面 keep-alive 组件树内，activated/deactivated
 * 会传播到卡片；流地址不重取（避免每次切页签整墙重取流闪烁）。
 * 悬浮工具条：抓拍（§6.7，返回图有时效仅当场看，预览盖在卡内）/ 回放（页面级弹窗）。
 */
defineOptions({ name: 'CameraCard' })

const props = defineProps<{
  camera: CameraVo
  /** 首帧等待上限（ms）：探测轮传 9000 收紧判死，回放等默认 20000 */
  firstFrameTimeoutMs?: number
}>()
const emit = defineEmits<{
  (e: 'broken', id: number): void
  (e: 'ok', id: number): void
  (e: 'playback', camera: CameraVo): void
}>()

const playUrl = ref<PlayUrlVo | null>(null)
const playerRef = ref<InstanceType<typeof CameraPlayer> | null>(null)

/** 卸载后不再上报事件：重探测整墙重建时，旧卡在途的取流响应不得污染新一轮名单 */
let disposed = false
onBeforeUnmount(() => {
  disposed = true
})

/** 抓拍：capturing 防重入；返回的托管图 URL 有时效，仅当场预览不转存 */
const capturing = ref(false)
const captureUrl = ref('')

async function loadStream() {
  try {
    const vo = await fetchCameraLiveUrl(props.camera.id)
    if (disposed) return
    if (vo && vo.url && vo.accessToken) playUrl.value = vo
    else emit('broken', props.camera.id)
  } catch {
    if (disposed) return
    emit('broken', props.camera.id)
  }
}

/** 播放器报错/超时无画面（含播放在途中断流），卸载后忽略 */
function onPlayerError() {
  if (disposed) return
  emit('broken', props.camera.id)
}

async function onCapture() {
  if (capturing.value) return
  capturing.value = true
  try {
    const url = await captureCamera(props.camera.id)
    if (typeof url === 'string' && url) captureUrl.value = url
    else globalMessage()?.error('抓拍失败：返回数据不完整')
  } catch (e) {
    globalMessage()?.error(e instanceof Error ? e.message : '抓拍失败')
  } finally {
    capturing.value = false
  }
}

onMounted(loadStream)
onActivated(() => playerRef.value?.play())
onDeactivated(() => playerRef.value?.stop())
</script>

<template>
  <div class="camera-card glass-card">
    <div class="cam-head">
      <span class="cam-name" :title="camera.cameraName">{{ camera.cameraName }}</span>
      <span class="cam-loc" :title="camera.locationDesc || ''">
        {{ camera.locationDesc || '—' }}
      </span>
    </div>
    <div class="cam-body">
      <CameraPlayer
        ref="playerRef"
        :play-url="playUrl"
        :first-frame-timeout-ms="firstFrameTimeoutMs"
        @ok="emit('ok', camera.id)"
        @error="onPlayerError"
      />
      <div class="cam-toolbar">
        <button class="cam-tool" :disabled="capturing" @click="onCapture">
          {{ capturing ? '抓拍中…' : '抓拍' }}
        </button>
        <button class="cam-tool" @click="emit('playback', props.camera)">回放</button>
      </div>
      <div v-if="captureUrl" class="cam-capture">
        <div class="cam-capture-head">
          <span>抓拍画面（图片有时效，请当场保存）</span>
          <button class="cam-capture-close" @click="captureUrl = ''">关闭</button>
        </div>
        <img class="cam-capture-img" :src="captureUrl" alt="抓拍画面" />
      </div>
    </div>
  </div>
</template>

<style scoped>
.camera-card {
  display: flex;
  flex-direction: column;
  min-width: 0;
  padding: 12px 14px 14px;
}
.cam-head {
  flex: none;
  display: flex;
  align-items: baseline;
  gap: 10px;
  margin-bottom: 10px;
  min-width: 0;
}
.cam-name {
  font-size: 16px;
  font-weight: 700;
  color: var(--title);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.cam-loc {
  margin-left: auto;
  flex: none;
  max-width: 46%;
  font-size: 13px;
  color: var(--muted);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.cam-body {
  position: relative;
  flex: 1;
  min-height: 0;
  border-radius: var(--radius-sm);
  overflow: hidden;
  background: #000;
}

/* 悬浮工具条：hover 卡片浮现于画面右上角 */
.cam-toolbar {
  position: absolute;
  top: 8px;
  right: 8px;
  z-index: 4;
  display: flex;
  gap: 6px;
  opacity: 0;
  transition: opacity 0.18s;
}
.camera-card:hover .cam-toolbar {
  opacity: 1;
}
.cam-tool {
  height: 28px;
  padding: 0 12px;
  border: 1px solid rgba(255, 255, 255, 0.55);
  border-radius: 6px;
  background: rgba(15, 30, 48, 0.72);
  color: #fff;
  font-size: 12px;
  font-family: inherit;
  cursor: pointer;
  backdrop-filter: blur(6px);
  transition: background 0.15s;
}
.cam-tool:hover:not(:disabled) {
  background: rgba(43, 124, 227, 0.85);
}
.cam-tool:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

/* 抓拍预览：盖在画面上，当场看图 */
.cam-capture {
  position: absolute;
  inset: 0;
  z-index: 6;
  display: flex;
  flex-direction: column;
  background: rgba(6, 16, 28, 0.86);
  backdrop-filter: blur(4px);
}
.cam-capture-head {
  flex: none;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 12px;
  font-size: 12px;
  color: rgba(255, 255, 255, 0.85);
}
.cam-capture-close {
  border: 1px solid rgba(255, 255, 255, 0.4);
  border-radius: 6px;
  background: transparent;
  color: #fff;
  font-size: 12px;
  padding: 2px 10px;
  cursor: pointer;
}
.cam-capture-close:hover {
  background: rgba(43, 124, 227, 0.6);
}
.cam-capture-img {
  flex: 1;
  min-height: 0;
  width: 100%;
  object-fit: contain;
}
</style>

