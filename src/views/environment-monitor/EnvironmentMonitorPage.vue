<script setup lang="ts">
import { computed, onActivated, onDeactivated, onUnmounted, ref } from 'vue'
import { fetchCameraList } from '../../api/ezviz/ezviz'
import type { CameraVo } from '../../api/ezviz/types'
import { isInternalStaff } from '../../utils/operationsAccess'
import { readAuthUser } from '../../utils/session'
import CameraCard from './components/CameraCard.vue'
import CameraLedgerDrawer from './components/CameraLedgerDrawer.vue'
import PlaybackModal from './components/PlaybackModal.vue'

/**
 * 环境监控（§6 萤石视频墙，所有人可见；台账管理入口仅内部人员）：
 * - 台账 §6.1 拉取 + 激活期 300s 轮询（后端每轮逐台外呼萤石云查在线状态，5 分钟粒度
 *   对后端/萤石限流友好）+ 工具条手动刷新；轮询即失败重试：每次刷新清空失败名单，
 *   中途恢复的摄像头自动回来补位
 * - 「无画面隐藏」：online 非 true（离线/查询失败未知）不渲染；取流失败或播放器无画面
 *   （CameraCard 的 broken）记入失败名单，卡片消失其余补位
 * - 页签停流：页签即路由（App.vue keep-alive），页面的轮询随 onDeactivated 停、
 *   onActivated 恢复；拉流起停由 CameraCard 自己随激活传播处理
 * - 「摄像头管理」仅内部人员可见（userLevel !== 2，与后端 §6.2-6.4 的 403 口径对齐），
 *   按钮是抽屉唯一入口，挡按钮即挡功能
 */
defineOptions({ name: 'EnvironmentMonitorPage' })

/** 台账轮询周期（仅页面激活期运行） */
const POLL_INTERVAL_MS = 300_000

const cameras = ref<CameraVo[]>([])
const loading = ref(false)
/** 本轮周期内取流/播放失败的摄像头：不再渲染；轮询/手动刷新时清空重试 */
const brokenIds = ref<Set<number>>(new Set())
/** 台账管理抽屉（CameraLedgerDrawer，批次 5 接入） */
const ledgerOpen = ref(false)
/** 回放弹窗目标（§6.6） */
const playbackCamera = ref<CameraVo | null>(null)

/** 「摄像头管理」入口显隐：TopBar 同款非响应式读取（登录态变化靠整页刷新生效） */
const isInternal = isInternalStaff(readAuthUser())

let pollTimer: ReturnType<typeof setInterval> | null = null

async function loadCameras() {
  loading.value = true
  try {
    cameras.value = await fetchCameraList()
    brokenIds.value = new Set()
  } catch {
    // 拉取失败保留旧台账与失败名单，等待下轮轮询/手动重试（silent 接口不弹全局错误）
  } finally {
    loading.value = false
  }
}

function markBroken(id: number) {
  brokenIds.value = new Set(brokenIds.value).add(id)
}

/** 在线且未在失败名单的摄像头（无画面三态：离线/未知不渲染，坏流隐藏补位） */
const visibleCameras = computed(() =>
  cameras.value.filter((c) => c.online === true && !brokenIds.value.has(c.id)),
)

function startPoll() {
  if (pollTimer != null) return
  pollTimer = setInterval(() => void loadCameras(), POLL_INTERVAL_MS)
}
function stopPoll() {
  if (pollTimer != null) {
    clearInterval(pollTimer)
    pollTimer = null
  }
}

// onActivated 首次紧跟挂载（AlertCenterPage 同款），激活期才拉数+轮询
onActivated(() => {
  void loadCameras()
  startPoll()
})
onDeactivated(stopPoll)
onUnmounted(stopPoll)
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
          <span class="em-sub">
            在线画面 <b class="num">{{ visibleCameras.length }}</b> / 台账
            <b class="num">{{ cameras.length }}</b>
          </span>
        </div>
        <div class="em-actions">
          <button class="em-btn" :disabled="loading" @click="loadCameras()">
            {{ loading ? '刷新中…' : '刷新' }}
          </button>
          <button v-if="isInternal" class="em-btn em-btn-primary" @click="ledgerOpen = true">
            摄像头管理
          </button>
        </div>
      </header>

      <main class="em-wall">
        <CameraCard
          v-for="c in visibleCameras"
          :key="c.id"
          :camera="c"
          @broken="markBroken"
          @playback="playbackCamera = $event"
        />
        <div v-if="!loading && visibleCameras.length === 0" class="em-empty">
          暂无可用监控画面
        </div>
      </main>
    </div>

    <PlaybackModal :camera="playbackCamera" @close="playbackCamera = null" />
    <!-- 台账增删改仅内部人员可达（入口按钮已挡）；changed → 重拉台账联动视频墙 -->
    <CameraLedgerDrawer :open="ledgerOpen" @close="ledgerOpen = false" @changed="loadCameras()" />
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
.em-sub b {
  color: var(--primary);
  font-weight: 700;
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
</style>
