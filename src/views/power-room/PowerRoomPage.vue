<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import CategoryPanel from './components/CategoryPanel.vue'
import { createPowerRoomScene } from './engine/scene'
import config from './data/power-rooms.json'

type Room = Parameters<typeof createPowerRoomScene>[1]
const rooms = config.rooms as Room[]

const containerRef = ref<HTMLElement | null>(null)
const currentId = ref('room-1')
let scene: ReturnType<typeof createPowerRoomScene> | null = null

const options = rooms.map((r) => ({ label: r.name, value: r.id }))
const totalCount = rooms.reduce((n, r) => n + r.rows.flat().length, 0)
const currentName = computed(() => rooms.find((r) => r.id === currentId.value)?.name ?? '')

function mountRoom(id: string) {
  const room = rooms.find((r) => r.id === id)
  if (!room || !containerRef.value) return
  scene?.dispose()
  scene = createPowerRoomScene(containerRef.value, room, config.pitch)
  currentId.value = id
}

onMounted(() => mountRoom('room-1'))
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
  top: 14px;
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
