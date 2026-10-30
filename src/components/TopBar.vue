<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { navConfig } from '../config/navConfig'
import { usePageTabs } from '../store/pageTabs'
import PageTabs from './PageTabs.vue'
import logoUrl from '../assets/logo.png'

/**
 * 顶部栏（视觉照搬福永 TopBar）：品牌 + 页内标签条 + 导航下拉 + 时钟 + 全屏。
 * 宝安差异：无 router/pinia/naive-ui/登录——下拉菜单自写，用户名与退出按钮
 * 等登录模块移植后再补。
 */
const { activePath, open } = usePageTabs()

const currentNavName = computed(
  () => navConfig.find((i) => i.route === activePath.value)?.name ?? navConfig[0]!.name,
)

const navOpen = ref(false)
const navRoot = ref<HTMLElement | null>(null)

function handleNavSelect(route: string) {
  const item = navConfig.find((i) => i.route === route)
  if (!item) return
  open(item.route, item.name, item.id)
  navOpen.value = false
}

function onDocClick(e: MouseEvent) {
  if (navRoot.value && !navRoot.value.contains(e.target as Node)) navOpen.value = false
}

const isFullscreen = ref(false)

function toggleFullscreen() {
  if (document.fullscreenElement) {
    document.exitFullscreen()
  } else if (document.documentElement.requestFullscreen) {
    document.documentElement.requestFullscreen().catch(() => {})
  }
}

function onFullscreenChange() {
  isFullscreen.value = !!document.fullscreenElement
}

const now = ref(new Date())
const pad = (n: number) => String(n).padStart(2, '0')
const dateText = computed(() => {
  const d = now.value
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
})
const weekText = computed(() => {
  const wd = ['日', '一', '二', '三', '四', '五', '六'][now.value.getDay()]
  return `星期${wd}`
})
const timeText = computed(() => {
  const d = now.value
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
})

let clockTimer: ReturnType<typeof setInterval> | undefined

onMounted(() => {
  document.addEventListener('fullscreenchange', onFullscreenChange)
  document.addEventListener('click', onDocClick)
  clockTimer = setInterval(() => {
    now.value = new Date()
  }, 1000)
})
onBeforeUnmount(() => {
  document.removeEventListener('fullscreenchange', onFullscreenChange)
  document.removeEventListener('click', onDocClick)
  if (clockTimer) clearInterval(clockTimer)
})
</script>

<template>
  <header class="topbar">
    <div class="brand">
      <!-- logo 暂用福永图占位，待换成宝安中心医院自己的 -->
      <img :src="logoUrl" class="brand-logo" alt="宝安中心医院" />
      <span class="title">宝安中心医院电力智能运维平台</span>
    </div>

    <PageTabs />

    <div class="tools">
      <div ref="navRoot" class="nav-wrap">
        <button class="nav-dropdown-btn" :class="{ 'is-open': navOpen }" @click="navOpen = !navOpen">
          <span>{{ currentNavName }}</span>
          <svg
            class="nav-dropdown-arrow"
            :class="{ 'is-open': navOpen }"
            viewBox="0 0 24 24"
            fill="currentColor"
          >
            <path d="M7 10l5 5 5-5z" />
          </svg>
        </button>
        <ul v-if="navOpen" class="nav-menu">
          <li
            v-for="item in navConfig"
            :key="item.id"
            :class="{ current: item.route === activePath }"
            @click="handleNavSelect(item.route)"
          >
            {{ item.name }}
          </li>
        </ul>
      </div>
      <div class="clock">
        <div class="clock-block date-block">
          <svg viewBox="0 0 24 24" fill="currentColor">
            <path
              d="M19 4h-1V2h-2v2H8V2H6v2H5c-1.11 0-2 .9-2 2v14c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 16H5V9h14v11zM7 11h5v4H7z"
            />
          </svg>
          <div class="date-texts">
            <span class="date">{{ dateText }}</span>
            <span class="week">{{ weekText }}</span>
          </div>
        </div>
        <div class="clock-block time-block">
          <svg viewBox="0 0 24 24" fill="currentColor">
            <path
              d="M11.99 2C6.47 2 2 6.48 2 12s4.47 10 9.99 10C17.52 22 22 17.52 22 12S17.52 2 11.99 2zM12 20c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8zm.5-13H11v6l5.25 3.15.75-1.23-4.5-2.67z"
            />
          </svg>
          <span class="time">{{ timeText }}</span>
        </div>
      </div>
      <button
        class="tb-btn fullscreen"
        :title="isFullscreen ? '退出全屏' : '进入全屏'"
        @click="toggleFullscreen"
      >
        <svg v-if="!isFullscreen" viewBox="0 0 24 24" fill="currentColor">
          <path
            d="M7 14H5v5h5v-2H7v-3zm-2-4h2V7h3V5H5v5zm12 7h-3v2h5v-5h-2v3zM14 5v2h3v3h2V5h-5z"
          />
        </svg>
        <svg v-else viewBox="0 0 24 24" fill="currentColor">
          <path d="M5 16h3v3h2v-5H5v2zm3-8H5v2h5V5H8v3zm6 11h2v-3h3v-2h-5v5zm2-11V5h-2v5h5V8h-3z" />
        </svg>
      </button>
    </div>
  </header>
</template>

<style scoped>
.topbar {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  z-index: 30;
  height: var(--topbar-height);
  display: flex;
  align-items: center;
  padding: 0 24px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.85);
  background: rgba(255, 255, 255, 0.55);
  backdrop-filter: blur(22px) saturate(160%);
  -webkit-backdrop-filter: blur(22px) saturate(160%);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.9),
    0 1px 0 rgba(43, 108, 160, 0.06);
}

.topbar::before {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 3px;
  background: linear-gradient(90deg, var(--primary-200), var(--primary) 50%, var(--primary-600));
  box-shadow: 0 1px 6px rgba(43, 124, 227, 0.35);
}

.brand {
  flex: none;
  display: flex;
  align-items: center;
  margin-right: 32px;
}
.brand-logo {
  height: 40px;
  width: auto;
  margin-right: 12px;
  object-fit: contain;
}
.title {
  font-size: 24px;
  font-weight: 700;
  background: linear-gradient(90deg, var(--primary), var(--cyan-deep));
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
  letter-spacing: 2px;
  white-space: nowrap;
}

.nav-wrap {
  position: relative;
  flex: none;
}
.nav-dropdown-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  height: 38px;
  padding: 0 16px;
  border: 1px solid var(--primary);
  border-radius: var(--radius-sm);
  background: var(--primary);
  color: #fff;
  font-size: 15px;
  font-weight: 600;
  cursor: pointer;
  white-space: nowrap;
  box-shadow: 0 6px 16px rgba(43, 108, 160, 0.18);
  transition:
    background 0.18s,
    color 0.18s,
    border-color 0.18s,
    transform 0.12s;
}
.nav-dropdown-btn:hover,
.nav-dropdown-btn.is-open {
  background: rgba(255, 255, 255, 0.92);
  color: var(--primary);
  border-color: var(--primary);
  backdrop-filter: blur(14px);
  -webkit-backdrop-filter: blur(14px);
}
.nav-dropdown-btn:active {
  transform: scale(0.97);
}
.nav-dropdown-arrow {
  width: 22px;
  height: 22px;
  color: inherit;
  flex-shrink: 0;
  transform: rotate(-90deg);
  transform-origin: center;
  transition:
    transform 0.22s ease,
    color 0.18s;
}
.nav-dropdown-arrow.is-open {
  transform: rotate(0deg);
}
.nav-menu {
  position: absolute;
  top: calc(100% + 8px);
  left: 0;
  min-width: 132px;
  margin: 0;
  padding: 6px;
  list-style: none;
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.96);
  backdrop-filter: blur(18px);
  -webkit-backdrop-filter: blur(18px);
  border: 1px solid var(--border);
  box-shadow: var(--shadow);
  z-index: 40;
}
.nav-menu li {
  padding: 9px 14px;
  border-radius: 8px;
  font-size: 15px;
  color: var(--text);
  cursor: pointer;
  transition:
    background 0.15s,
    color 0.15s;
}
.nav-menu li:hover {
  background: var(--primary-50);
  color: var(--primary);
}
.nav-menu li.current {
  color: var(--primary);
  font-weight: 600;
}

.tools {
  margin-left: auto;
  display: flex;
  align-items: center;
  gap: 12px;
}
.clock {
  display: flex;
  align-items: center;
  gap: 10px;
  white-space: nowrap;
}
.clock-block {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}
.date-block {
  display: inline-flex;
  align-items: center;
  gap: 10px;
}
.date-block svg {
  width: 22px;
  height: 22px;
  color: var(--primary);
}
.date-texts {
  display: flex;
  flex-direction: column;
  line-height: 1.25;
}
.date {
  color: var(--muted);
  font-size: 16px;
  font-weight: 600;
  letter-spacing: 0.5px;
}
.week {
  color: var(--muted);
  font-size: 13px;
}
.time-block {
  color: var(--primary-600);
}
.time-block svg {
  width: 22px;
  height: 22px;
  color: var(--primary);
}
.time {
  font-family: var(--font-mono);
  font-size: 18px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  letter-spacing: 1px;
}
.tb-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  padding: 0;
  border: none;
  border-radius: var(--radius-sm);
  background: transparent;
  cursor: pointer;
  transition: all 0.2s;
  user-select: none;
}
.tb-btn svg {
  width: 24px;
  height: 24px;
  color: var(--primary);
}
.tb-btn.fullscreen svg {
  width: 28px;
  height: 28px;
}
.tb-btn:hover {
  background: var(--primary-50);
}
.tb-btn:active {
  transform: scale(0.96);
}
</style>
