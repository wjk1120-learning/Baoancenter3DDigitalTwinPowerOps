<script setup lang="ts">
import { computed, onActivated, onBeforeUnmount, onDeactivated, onMounted, ref } from 'vue'
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

/** 位置副标题：与名称相同/为空时不显示（台账常把两者填成一样，双行重复难看） */
const locText = computed(() => {
  const loc = (props.camera.locationDesc || '').trim()
  return loc && loc !== props.camera.cameraName ? loc : ''
})

/** 卸载后不再上报事件：重探测整墙重建时，旧卡在途的取流响应不得污染新一轮名单 */
let disposed = false
onBeforeUnmount(() => {
  disposed = true
})

/** 抓拍：capturing 防重入；返回的托管图 URL 有时效，仅当场预览不转存 */
const capturing = ref(false)
const captureUrl = ref('')

/** 保存抓拍图（2026-11-25 用户反馈：预览没有保存入口）：blob 下载成本地文件；
 *  萤石托管图跨域 fetch 被拒时退化为新窗口打开（手动右键另存，链接有时效别拖） */
async function saveCapture() {
  if (!captureUrl.value) return
  const d = new Date()
  const p = (n: number) => String(n).padStart(2, '0')
  const stamp = `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`
  const name = `抓拍_${props.camera.cameraName}_${stamp}.jpg`.replace(/[\\/:*?"<>|]/g, '_')
  try {
    const res = await fetch(captureUrl.value)
    if (!res.ok) throw new Error(String(res.status))
    const url = URL.createObjectURL(await res.blob())
    const a = document.createElement('a')
    a.href = url
    a.download = name
    a.click()
    URL.revokeObjectURL(url)
    globalMessage()?.success('抓拍图片已保存')
  } catch {
    window.open(captureUrl.value, '_blank')
    globalMessage()?.warning('图片跨域受限，已在新窗口打开，请右键「图片另存为」')
  }
}

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
      <div class="cam-title">
        <span class="cam-name" :title="camera.cameraName">{{ camera.cameraName }}</span>
        <span v-if="locText" class="cam-loc" :title="locText">{{ locText }}</span>
      </div>
      <!-- 动作钮在播放器外（2026-11-25 用户拍板：与 EZUIKit 原生控件并存互不遮挡） -->
      <div class="cam-actions">
        <button class="cam-tool" :disabled="capturing" @click="onCapture">
          {{ capturing ? '抓拍中…' : '抓拍' }}
        </button>
        <button class="cam-tool" @click="emit('playback', props.camera)">回放</button>
      </div>
    </div>
    <div class="cam-body">
      <CameraPlayer
        ref="playerRef"
        :play-url="playUrl"
        :first-frame-timeout-ms="firstFrameTimeoutMs"
        @ok="emit('ok', camera.id)"
        @error="onPlayerError"
      />
      <div v-if="captureUrl" class="cam-capture">
        <div class="cam-capture-head">
          <span>抓拍画面（图片有时效，请当场保存）</span>
          <div class="cam-capture-ops">
            <button class="cam-capture-close" @click="saveCapture">保存</button>
            <button class="cam-capture-close" @click="captureUrl = ''">关闭</button>
          </div>
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
  padding: 12px 16px;
}
.cam-head {
  flex: none;
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 8px;
  min-width: 0;
}
/* 名称 + 位置两行（位置与名称相同/为空时不渲染，避免台账双写造成的整行重复） */
.cam-title {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
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
  font-size: 12px;
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
  /* 首帧前的底色：深蓝取令牌（播放中由视频画面覆盖，letterbox 与湖水蓝体系同调） */
  background: var(--primary-800);
}

/* 动作钮：设计系统胶囊（同 ConfigActionButton 蓝系），位于头部右侧 */
.cam-actions {
  flex: none;
  display: flex;
  gap: 8px;
}
.cam-tool {
  height: 26px;
  padding: 0 12px;
  border: 1px solid var(--primary-100);
  border-radius: var(--radius-sm);
  background: var(--primary-50);
  color: var(--primary-600);
  font: inherit;
  font-size: 12px;
  line-height: 1;
  white-space: nowrap;
  cursor: pointer;
  transition: background-color 0.2s, border-color 0.2s, color 0.2s;
}
.cam-tool:hover:not(:disabled) {
  color: var(--primary-700);
  background: var(--primary-100);
  border-color: var(--primary-200);
}
.cam-tool:active:not(:disabled) {
  color: var(--on-primary);
  background: var(--primary-400);
  border-color: var(--primary-400);
}
.cam-tool:focus-visible {
  outline: 2px solid var(--primary);
  outline-offset: 1px;
}
.cam-tool:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}
@media (prefers-reduced-motion: reduce) {
  .cam-tool {
    transition: none;
  }
}

/* 抓拍预览：盖在画面上，当场看图（实色深蓝底取自令牌，去玻璃拟态） */
.cam-capture {
  position: absolute;
  inset: 0;
  z-index: 6;
  display: flex;
  flex-direction: column;
  background: var(--primary-800);
}
.cam-capture-head {
  flex: none;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 12px;
  font-size: 12px;
  color: var(--on-primary);
}
.cam-capture-close {
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--on-primary);
  font-size: 12px;
  padding: 2px 8px;
  cursor: pointer;
}
.cam-capture-ops {
  display: flex;
  gap: 8px;
}
.cam-capture-close:hover {
  background: var(--primary-600);
}
.cam-capture-img {
  flex: 1;
  min-height: 0;
  width: 100%;
  object-fit: contain;
}
</style>

