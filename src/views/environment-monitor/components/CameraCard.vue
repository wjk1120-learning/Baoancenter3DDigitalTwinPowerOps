<script setup lang="ts">
import { onActivated, onDeactivated, onMounted, ref } from 'vue'
import { captureCamera, fetchCameraLiveUrl } from '../../../api/ezviz/ezviz'
import type { CameraVo, PlayUrlVo } from '../../../api/ezviz/types'
import { globalMessage } from '../../../utils/message'
import CameraPlayer from '../../../components/CameraPlayer.vue'

/**
 * 视频墙单卡：按台账项取流（§6.5，protocol=1 + quality=2 流畅）喂给 CameraPlayer。
 * 失败口径三来源统一上报 broken（父页记失败名单隐藏卡片、其余补位）：
 * 取流接口失败 / 取流结果缺 url·accessToken / 播放器无画面（CameraPlayer 的 error）。
 * 页签切走 stop、切回 play：本卡片在页面 keep-alive 组件树内，activated/deactivated
 * 会传播到卡片；流地址不重取（失效由播放器 error → broken → 台账轮询重试闭环，
 * 避免每次切页签整墙重取流闪烁）。
 * 悬浮工具条：抓拍（§6.7，返回图有时效仅当场看，预览盖在卡内）/ 回放（页面级弹窗）。
 */
defineOptions({ name: 'CameraCard' })

const props = defineProps<{ camera: CameraVo }>()
const emit = defineEmits<{
  (e: 'broken', id: number): void
  (e: 'playback', camera: CameraVo): void
}>()

const playUrl = ref<PlayUrlVo | null>(null)
const playerRef = ref<InstanceType<typeof CameraPlayer> | null>(null)

/** 抓拍：capturing 防重入；返回的托管图 URL 有时效，仅当场预览不转存 */
const capturing = ref(false)
const captureUrl = ref('')

async function loadStream() {
  try {
    const vo = await fetchCameraLiveUrl(props.camera.id)
    if (vo && vo.url && vo.accessToken) playUrl.value = vo
    else emit('broken', props.camera.id)
  } catch {
    emit('broken', props.camera.id)
  }
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
      <CameraPlayer ref="playerRef" :play-url="playUrl" @error="emit('broken', camera.id)" />
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

