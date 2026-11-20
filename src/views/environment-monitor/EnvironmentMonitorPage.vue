<script setup lang="ts">
import { computed, onActivated, ref } from 'vue'
import { fetchCameraList } from '../../api/ezviz/ezviz'
import type { CameraVo } from '../../api/ezviz/types'
import CameraCard from './components/CameraCard.vue'
import PlaybackModal from './components/PlaybackModal.vue'

/**
 * 环境监控（§6 萤石视频墙，所有人可见）：
 * - 进页/手动刷新 = 一轮「探测」：§6.1 拉台账 → online!==true 直接淘汰 → 存活者并发
 *   §6.5 取流建播放器（卡片已在墙内、被加载遮罩盖住）→ 首帧 ok / 取流失败 / 播放器
 *   报错 / 9s 无首帧，四种 settle 回报页面 → 全部 settle 撤遮罩，只留真实出画面的卡
 * - 「无画面不出现」：没出过首帧的摄像头从头到尾不可见；停留期中断流的卡直接消失
 * - 无轮询：探测完成后停留期零自动请求；重新探测 = 重进页面（keep-alive 切回也算）
 *   或点「刷新」。台账增删改移配置中心（页面不再有管理入口）
 * - 探测竞态：重探测整墙重建（卡片 key 带轮次），旧一轮卡片卸载后不再上报事件
 *   （CameraCard 的 disposed guard），不会污染新一轮名单
 */
defineOptions({ name: 'EnvironmentMonitorPage' })

/** 探测轮次（只增不减）：进模板 key 使重探测整墙重建，同时充当旧轮事件的失效序号 */
const round = ref(0)
/** 本轮探测候选（online===true），settle 后收窄为真实出画面名单 */
const cameras = ref<CameraVo[]>([])
/** 探测中：视频墙盖加载遮罩、刷新按钮禁用 */
const probing = ref(false)
/** 已判死的摄像头：探测中隐藏、settle 后剔除；播放在途中断流同样隐藏 */
const brokenIds = ref<Set<number>>(new Set())
/** 本轮已 settle（出画面或判死）的台账 id：每台只计首次，防 ok 后断流重复计数 */
const settledIds = new Set<number>()
/** 回放弹窗目标（§6.6） */
const playbackCamera = ref<CameraVo | null>(null)

/** 视频墙名单：探测中=全部候选（被遮罩盖住），探测完=出画面且未中断的 */
const visibleCameras = computed(() => cameras.value.filter((c) => !brokenIds.value.has(c.id)))

/** 一轮完整探测。台账拉取失败按空态静默收场（§6.1 silent，无全局报错） */
async function probeAll() {
  const seq = ++round.value
  probing.value = true
  cameras.value = []
  brokenIds.value = new Set()
  settledIds.clear()
  let ledger: CameraVo[]
  try {
    ledger = await fetchCameraList()
  } catch {
    if (seq === round.value) probing.value = false
    return
  }
  if (seq !== round.value) return
  cameras.value = ledger.filter((c) => c.online === true)
  if (cameras.value.length === 0) probing.value = false
}

/** 卡片 settle 上报：ok=已出画面；broken=取流失败/无首帧/播放中断 */
function markOk(id: number) {
  if (!probing.value || settledIds.has(id)) return
  settledIds.add(id)
  settleCheck()
}

function markBroken(id: number) {
  brokenIds.value = new Set(brokenIds.value).add(id)
  if (!probing.value || settledIds.has(id)) return
  settledIds.add(id)
  settleCheck()
}

/** 全部候选 settle：撤遮罩，名单收窄为真实出画面的摄像头 */
function settleCheck() {
  if (!probing.value || settledIds.size < cameras.value.length) return
  cameras.value = cameras.value.filter((c) => !brokenIds.value.has(c.id))
  brokenIds.value = new Set()
  probing.value = false
}

// keep-alive 激活即重探测：进页与切回页签同口径（onActivated 首次紧跟挂载，AlertCenterPage 同款）
onActivated(() => {
  void probeAll()
})
</script>

<template>
  <div class="em-page">
    <div class="em-bg" aria-hidden="true">
      <div class="em-bg-grid" />
      <div class="em-bg-glow a" />
      <div class="em-bg-glow b" />
    </div>

    <div class="em-wrap">
      <header class="em-header glass-panel">
        <div class="em-title">
          <h2>环境监控</h2>
          <span class="em-sub">实时查看各区域摄像头画面，支持抓拍与录像回放</span>
        </div>
        <div class="em-actions">
          <button class="em-btn" :disabled="probing" @click="probeAll()">
            {{ probing ? '检测中…' : '刷新' }}
          </button>
        </div>
      </header>

      <main class="em-wall">
        <CameraCard
          v-for="c in visibleCameras"
          :key="`${round}-${c.id}`"
          :camera="c"
          @broken="markBroken"
          @ok="markOk"
          @playback="playbackCamera = $event"
        />
        <div v-if="!probing && visibleCameras.length === 0" class="em-empty">
          暂无可用监控画面
        </div>
        <!-- 探测遮罩：盖住墙内建中的播放器，全部 settle 才撤 -->
        <div v-if="probing" class="em-probing">
          <span class="em-probing-spin" aria-hidden="true" />
          <span class="em-probing-text">正在检测摄像头连接…</span>
        </div>
      </main>
    </div>

    <PlaybackModal :camera="playbackCamera" @close="playbackCamera = null" />
  </div>
</template>

<style scoped>
.em-page {
  width: 100%;
  height: 100%;
  overflow: hidden;
  position: relative;
}
.em-bg {
  position: absolute;
  inset: 0;
  z-index: 0;
  background:
    radial-gradient(900px 520px at 12% 6%, rgba(76, 208, 232, 0.11), transparent 58%),
    radial-gradient(780px 480px at 92% 94%, rgba(43, 124, 227, 0.09), transparent 58%),
    linear-gradient(165deg, var(--bg-1), var(--bg-2));
}
.em-bg-grid {
  position: absolute;
  inset: 0;
  opacity: 0.22;
  background-image:
    linear-gradient(rgba(43, 124, 227, 0.05) 1px, transparent 1px),
    linear-gradient(90deg, rgba(43, 124, 227, 0.05) 1px, transparent 1px);
  background-size: 48px 48px;
}
.em-bg-glow {
  position: absolute;
  border-radius: 50%;
  filter: blur(80px);
  opacity: 0.35;
  pointer-events: none;
}
.em-bg-glow.a {
  width: 420px;
  height: 420px;
  top: -120px;
  left: -100px;
  background: var(--primary);
}
.em-bg-glow.b {
  width: 380px;
  height: 380px;
  bottom: -120px;
  right: -100px;
  background: var(--teal);
}

.em-wrap {
  position: relative;
  z-index: 5;
  height: 100%;
  display: flex;
  flex-direction: column;
  padding: calc(var(--topbar-height) + 14px) 18px 18px;
  gap: 14px;
}
.em-header {
  flex: none;
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 12px 18px;
  border-radius: var(--radius);
}
.em-title {
  display: flex;
  align-items: baseline;
  gap: 12px;
  min-width: 0;
}
.em-title h2 {
  margin: 0;
  font-size: 20px;
  font-weight: 700;
  color: var(--title);
  letter-spacing: 1px;
}
.em-sub {
  font-size: 13px;
  color: var(--muted);
}
.em-actions {
  margin-left: auto;
  display: flex;
  align-items: center;
  gap: 10px;
}
.em-btn {
  height: 32px;
  padding: 0 16px;
  border: 1px solid var(--border-strong);
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.85);
  color: var(--primary);
  font-size: 13px;
  font-weight: 600;
  font-family: inherit;
  cursor: pointer;
  transition:
    background 0.18s,
    color 0.18s,
    border-color 0.18s;
}
.em-btn:hover:not(:disabled) {
  background: var(--primary-50);
  border-color: var(--primary-200);
}
.em-btn:active:not(:disabled) {
  transform: scale(0.97);
}
.em-btn:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}
.em-btn-primary {
  background: var(--primary);
  border-color: var(--primary);
  color: var(--on-primary);
}
.em-btn-primary:hover:not(:disabled) {
  background: var(--primary-600);
  border-color: var(--primary-600);
}

.em-wall {
  position: relative;
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(560px, 1fr));
  grid-auto-rows: min-content;
  gap: 14px;
  align-content: start;
}
.em-wall > :deep(.camera-card) {
  aspect-ratio: 16 / 9;
}
.em-empty {
  grid-column: 1 / -1;
  padding: 60px 0;
  text-align: center;
  color: var(--muted);
  font-size: 15px;
  letter-spacing: 1px;
}

/* 探测遮罩：不透明盖住墙内建中的播放器，settle 完才撤 */
.em-probing {
  position: absolute;
  inset: 0;
  z-index: 6;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 14px;
  background: linear-gradient(165deg, var(--bg-1), var(--bg-2));
}
.em-probing-spin {
  width: 36px;
  height: 36px;
  border: 3px solid var(--primary-200);
  border-top-color: transparent;
  border-radius: 50%;
  animation: em-spin 0.9s linear infinite;
}
.em-probing-text {
  color: var(--muted);
  font-size: 14px;
  letter-spacing: 2px;
}
@keyframes em-spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
