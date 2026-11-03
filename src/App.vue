<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import TopBar from './components/TopBar.vue'
import { usePageTabsStore } from './store/pageTabs'
import { navConfig } from './config/navConfig'

const route = useRoute()
const pageTabs = usePageTabsStore()

/** 路由变化同步页签：宝中路由与 navConfig 同源，反查即可（福永 App.vue 同款机制） */
function syncTabFromRoute() {
  const item = navConfig.find((i) => i.route === route.path)
  if (item) pageTabs.open(item.route, item.name, item.id)
}
watch(() => route.path, syncTabFromRoute, { immediate: true })

// keep-alive 按组件名匹配：页面实装一个加一个（与 router REAL_PAGES 同步登记）
const keepAliveInclude = ['PowerRoomPage', 'AlertCenterPage']

// 整个应用作为 1920×1080 画布等比缩放居中（16:9 铺满，其他比例留对称边）
const scale = ref(1)
function fit() {
  scale.value = Math.min(window.innerWidth / 1920, window.innerHeight / 1080)
}
let ro: ResizeObserver | null = null

onMounted(() => {
  fit()
  ro = new ResizeObserver(fit)
  ro.observe(document.documentElement)
})
onBeforeUnmount(() => ro?.disconnect())
</script>

<template>
  <div class="app-shell">
    <div class="stage" :style="{ transform: `scale(${scale})` }">
      <!-- 内容区铺满整个 1920×1080（3D 全屏铺底） -->
      <main class="app-main">
        <router-view v-slot="{ Component }">
          <keep-alive :include="keepAliveInclude">
            <component :is="Component" />
          </keep-alive>
        </router-view>
      </main>
      <TopBar />
    </div>
  </div>
</template>

<style scoped>
.app-shell {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
}
.stage {
  width: 1920px;
  height: 1080px;
  flex: none;
  position: relative;
}
.app-main {
  position: absolute;
  inset: 0;
  overflow: hidden;
}
</style>
