<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { createPowerRoomScene } from '../three/powerRoomScene'
import config from '../config/power-rooms.json'

type Room = Parameters<typeof createPowerRoomScene>[1]
const rooms = config.rooms as Room[]

const containerRef = ref<HTMLElement | null>(null)
const currentId = ref('room-1')
let scene: ReturnType<typeof createPowerRoomScene> | null = null

const currentRoom = computed(() => rooms.find((r) => r.id === currentId.value) ?? rooms[0]!)
const totalCount = rooms.reduce((n, r) => n + r.rows.flat().length, 0)

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
    <!-- 左上：配电房分类卡片（样式对齐福永 CategoryPanel） -->
    <aside class="cat-panel" aria-label="配电房分类">
      <div class="cat-head">
        <span class="cat-title">配电房分类</span>
        <span class="cat-count">共 {{ totalCount }} 台</span>
      </div>
      <div class="cat-list">
        <button
          v-for="r in rooms"
          :key="r.id"
          type="button"
          class="cat-item"
          :class="{ active: r.id === currentId }"
          @click="mountRoom(r.id)"
        >
          {{ r.name }}
        </button>
      </div>
    </aside>

    <!-- 顶部中央：当前房名胶囊（对齐福永 status-tag） -->
    <div class="status-pill" aria-hidden="true">
      <span class="pulse-dot" />
      <span>{{ currentRoom.name }}</span>
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
.cat-panel {
  position: absolute;
  left: 24px;
  top: 16px;
  z-index: 12;
  width: max-content;
  max-width: 42vw;
  display: flex;
  flex-direction: column;
  gap: 10px;
  box-sizing: border-box;
  padding: 14px 12px;
  background: linear-gradient(165deg, rgba(255, 255, 255, 0.38), rgba(236, 244, 250, 0.18));
  backdrop-filter: blur(22px) saturate(165%);
  -webkit-backdrop-filter: blur(22px) saturate(165%);
  border: 1px solid rgba(255, 255, 255, 0.58);
  border-radius: 14px;
  box-shadow:
    0 10px 28px rgba(15, 36, 56, 0.12),
    inset 0 1px 0 rgba(255, 255, 255, 0.72);
}
.cat-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
  padding: 0 4px 2px;
}
.cat-title {
  font-size: 16px;
  font-weight: 700;
  color: #182635;
  white-space: nowrap;
}
.cat-count {
  font-size: 13px;
  color: #5a7188;
  white-space: nowrap;
}
.cat-list {
  flex: none;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.cat-item {
  box-sizing: border-box;
  padding: 10px 14px;
  text-align: left;
  border: 1px solid rgba(255, 255, 255, 0.55);
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.42);
  font-size: 15px;
  font-weight: 600;
  font-family: inherit;
  color: #24364a;
  white-space: nowrap;
  cursor: pointer;
  transition:
    background 0.15s,
    color 0.15s,
    border-color 0.15s,
    box-shadow 0.15s;
}
.cat-item:hover {
  background: rgba(82, 149, 232, 0.14);
  color: #2b7ce3;
  border-color: rgba(82, 149, 232, 0.35);
}
.cat-item.active {
  background: #2b7ce3;
  color: #fff;
  border-color: #2b7ce3;
  box-shadow: 0 0 0 3px rgba(43, 124, 227, 0.18);
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
