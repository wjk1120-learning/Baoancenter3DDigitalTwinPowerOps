<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import TopBar from './components/TopBar.vue'
import PowerRoomPage from './views/power-room/PowerRoomPage.vue'
import PlaceholderPage from './views/placeholder/PlaceholderPage.vue'
import { navConfig } from './config/navConfig'
import { usePageTabs } from './store/pageTabs'

/**
 * 应用壳：1920×1080 舞台等比缩放居中（福永 App.vue 同款机制）+ TopBar + 页内标签切换。
 * 暂无 router，activePath 直接决定渲染哪个视图；引入 router 后 v-if 换 <router-view>。
 */
const { activePath, open } = usePageTabs()

// 启动开配电房标签（目前唯一实页；其余导航项为占位页）
const powerRoom = navConfig.find((i) => i.id === 'power-room')!
open(powerRoom.route, powerRoom.name, powerRoom.id)

/** 当前激活的导航项（决定占位页标题；运维平台外链项不会进 activePath） */
const currentNav = computed(() => navConfig.find((i) => i.route === activePath.value))

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
        <PowerRoomPage v-if="activePath === '/power-room'" />
        <PlaceholderPage v-else-if="currentNav" :name="currentNav.name" />
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
