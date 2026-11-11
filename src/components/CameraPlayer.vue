<script lang="ts">
/** 实例序号必须模块级：<script setup> 内变量每实例独立，多实例同屏会撞容器 id */
let instanceSeq = 0
</script>

<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import type { EZUIKitPlayer } from 'ezuikit-js'
import type { PlayUrlVo } from '../api/ezviz/types'

/**
 * 可复用萤石播放器（EZUIKit v9 封装，放 components 供跨页面复用）：
 * 直播/回放同构——都传 PlayUrlVo（§6.5/§6.6 的 url + accessToken），换流即重建实例。
 * 「有画面/无画面」对外给确定信号（视频墙按 error 隐藏卡片、其余自动补位）：
 * - ok    → EVENTS.firstFrameDisplay（首帧已出画；play 事件在出画前就会触发，不作依据，
 *   实测协议错误下 play 照发、画面并没有）
 * - error → 初始化 handleError 回调，或 FIRST_FRAME_TIMEOUT_MS 内未出首帧（悬挂黑卡
 *   按无画面处理，属「没画面就隐藏」需求口径的一部分）
 * 解码库由 EZUIKit 默认从萤石开放平台 CDN 拉取（staticPath 仅本地加速可选项，不配）。
 * expose stop/play：页签切走停流、切回续播（keep-alive deactivated/activated 配套）。
 */
defineOptions({ name: 'CameraPlayer' })

const props = defineProps<{
  /** 取流结果；null = 尚未取到流（组件保持连接中，不初始化播放器） */
  playUrl: PlayUrlVo | null
  /** 播放模板：直播 pcLive（默认）/ 回放 pcRec */
  template?: 'pcLive' | 'pcRec'
}>()

const emit = defineEmits<{
  /** 画面确认可用 */
  (e: 'ok'): void
  /** 播放器报错 / 超时未出画面 */
  (e: 'error'): void
}>()

/** 首帧等待上限：超时按「无画面」上报 */
const FIRST_FRAME_TIMEOUT_MS = 20_000

const containerRef = ref<HTMLDivElement | null>(null)
const connecting = ref(false)

const containerId = `ezuikit-player-${++instanceSeq}-${Date.now().toString(36)}`
let player: EZUIKitPlayer | null = null
let firstFrameTimer: ReturnType<typeof setTimeout> | null = null
let okSent = false

function validUrl(v: PlayUrlVo | null): v is PlayUrlVo {
  return !!v && typeof v.url === 'string' && !!v.url && typeof v.accessToken === 'string' && !!v.accessToken
}

function clearFirstFrameTimer() {
  if (firstFrameTimer != null) {
    clearTimeout(firstFrameTimer)
    firstFrameTimer = null
  }
}

function armFirstFrameTimer() {
  clearFirstFrameTimer()
  firstFrameTimer = setTimeout(() => {
    if (!okSent) onBroken()
  }, FIRST_FRAME_TIMEOUT_MS)
}

/** 首帧已出画：置 ok 并默认静音（多路同屏默认无声，各卡用播放器自带控件单独开声） */
function markOk() {
  if (okSent) return
  okSent = true
  clearFirstFrameTimer()
  connecting.value = false
  try {
    void player?.closeSound()
  } catch {
    // 静音失败不阻断播放
  }
  emit('ok')
}

function onBroken() {
  clearFirstFrameTimer()
  connecting.value = false
  emit('error')
}

function destroyPlayer() {
  clearFirstFrameTimer()
  if (player) {
    try {
      player.destroy()
    } catch {
      // 实例未就绪时销毁可能报错，清理场景忽略即可
    }
    player = null
  }
}

async function buildPlayer(playUrl: PlayUrlVo, template: 'pcLive' | 'pcRec') {
  destroyPlayer()
  const el = containerRef.value
  if (!el) return
  connecting.value = true
  okSent = false
  armFirstFrameTimer()
  try {
    // 动态引入：大包隔离进页面异步 chunk，未进环境监控页不加载
    const { EZUIKitPlayer: Player } = await import('ezuikit-js')
    await nextTick()
    player = new Player({
      id: containerId,
      url: playUrl.url,
      accessToken: playUrl.accessToken,
      width: el.clientWidth || 480,
      height: el.clientHeight || 270,
      template,
      handleError: () => onBroken(),
    })
    player.eventEmitter.on(Player.EVENTS.firstFrameDisplay, markOk)
  } catch {
    onBroken()
  }
}

onMounted(() => {
  if (validUrl(props.playUrl)) void buildPlayer(props.playUrl, props.template ?? 'pcLive')
})

watch(
  () => props.playUrl,
  (v) => {
    if (validUrl(v)) void buildPlayer(v, props.template ?? 'pcLive')
    else destroyPlayer()
  },
)

onBeforeUnmount(destroyPlayer)

defineExpose({
  /** 停流（页签切走时父级调用） */
  stop: () => {
    try {
      void player?.stop()
    } catch {
      // 未在播放时停流报错，忽略
    }
  },
  /** 续播（页签切回时父级调用） */
  play: () => {
    try {
      void player?.play()
    } catch {
      // 流已失效时续播报错，交给播放器自身错误回调上报
    }
  },
})
</script>

<template>
  <div class="camera-player">
    <div :id="containerId" ref="containerRef" class="camera-player-box" />
    <div v-if="connecting" class="camera-player-mask">连接中…</div>
  </div>
</template>

<style scoped>
.camera-player {
  position: relative;
  width: 100%;
  height: 100%;
  overflow: hidden;
}
.camera-player-box {
  width: 100%;
  height: 100%;
}
.camera-player-mask {
  position: absolute;
  inset: 0;
  z-index: 3;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text);
  font-size: 13px;
  letter-spacing: 2px;
  background: var(--panel);
  pointer-events: none;
}
</style>

<style>
/* EZUIKit v9 播放时会弹「AI智能云存储」推广浮层（.aichat-root 全局单例挂 body，
 * 默认 opacity:0 藏显、弹出时 JS 改 inline opacity）。视频墙不需要 AI 对讲入口，
 * 显隐/交互四路全压制（它自带样式与 inline style 的优先级博弈，单条不稳）。 */
body .aichat-root {
  display: none !important;
  opacity: 0 !important;
  visibility: hidden !important;
  pointer-events: none !important;
}
</style>
