<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import CategoryPanel from './components/CategoryPanel.vue'
import { createPowerRoomScene } from './engine/scene'
import { superNameFor, type PowerRoomsFile } from './data/powerRoom'
import config from './data/power-rooms.json'
import { useDeviceCatalogStore } from '../../store/deviceCatalog'
import { usePageTabsStore } from '../../store/pageTabs'
import { globalMessage } from '../../utils/message'

// keep-alive include 按组件名匹配（福永同款）
defineOptions({ name: 'PowerRoomPage' })

// JSON 导入的 model 字段是宽泛 string，断言成 schema 类型（校验由 npm run check 兜底）
const { pitch, rooms } = config as PowerRoomsFile

const containerRef = ref<HTMLElement | null>(null)
const currentId = ref('room-1')
let scene: ReturnType<typeof createPowerRoomScene> | null = null

const catalog = useDeviceCatalogStore()
const pageTabs = usePageTabsStore()
const router = useRouter()

const options = rooms.map((r) => ({ label: r.name, value: r.id }))
const totalCount = rooms.reduce((n, r) => n + r.rows.flat().length, 0)
const currentName = computed(() => rooms.find((r) => r.id === currentId.value)?.name ?? '')

function mountRoom(id: string) {
  const room = rooms.find((r) => r.id === id)
  if (!room || !scene) return
  scene.setRoom(room)
  currentId.value = id
}

/** 点柜跳设备详情：柜名按同源规则拼出台账 superName（mock 与目录共用 superNameFor）→ superId */
async function onCabinetClick(cab: { code: string; name: string }) {
  if (!catalog.cabinets.length) await catalog.load().catch(() => {})
  const superName = superNameFor(currentId.value, cab.name)
  const hit = catalog.cabinets.find((c) => c.superName === superName)
  if (!hit) {
    globalMessage()?.warning(`柜 ${cab.name} 未接入设备台账，暂不能查看详情`)
    return
  }
  pageTabs.open('/device-detail?superId=' + hit.id, '设备详情', 'device-detail')
  void router.push({
    path: '/device-detail',
    query: { superId: String(hit.id), from: 'power' },
  })
}

onMounted(() => {
  if (!containerRef.value) return
  // 引擎常驻：渲染器/相机/灯光只建一次，切房走 setRoom（模型模板也跨房缓存）
  scene = createPowerRoomScene(containerRef.value, pitch, { onCabinetClick })
  mountRoom('room-1')
  // 台账目录后台预取：首次点柜即可直接命中 superId
  if (!catalog.cabinets.length) void catalog.load().catch(() => {})
})
onUnmounted(() => scene?.dispose())
</script>

<template>
  <div class="page">
    <CategoryPanel
      :options="options"
      :count="totalCount"
      :selected="currentId"
      @select="mountRoom"
    />
    <div class="status-pill" aria-hidden="true">
      <span class="pulse-dot" />
      <span>{{ currentName }}</span>
    </div>
    <div ref="containerRef" class="scene" />
  </div>
</template>

<style scoped>
.page {
  width: 100%;
  height: 100%;
  position: relative;
}
.status-pill {
  position: absolute;
  top: calc(var(--topbar-height) + 14px);
  left: 50%;
  transform: translateX(-50%);
  z-index: 20;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  width: max-content;
  max-width: calc(100% - 48px);
  padding: 6px 14px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.72);
  backdrop-filter: blur(14px);
  -webkit-backdrop-filter: blur(14px);
  border: 1px solid rgba(255, 255, 255, 0.95);
  box-shadow: 0 6px 16px rgba(43, 108, 160, 0.1);
  font-size: 16px;
  font-weight: 600;
  color: #182635;
  white-space: nowrap;
  line-height: 1.25;
}
.pulse-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #2b7ce3;
  animation: pill-pulse 2s infinite;
}
@keyframes pill-pulse {
  0%,
  100% {
    box-shadow: 0 0 0 4px rgba(43, 124, 227, 0.14);
  }
  50% {
    box-shadow: 0 0 0 6px rgba(43, 124, 227, 0.05);
  }
}
.scene {
  width: 100%;
  height: 100%;
  position: relative;
}
</style>
