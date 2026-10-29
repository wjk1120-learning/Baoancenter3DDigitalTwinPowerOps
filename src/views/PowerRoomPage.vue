<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'
import { createPowerRoomScene } from '../three/powerRoomScene'
import config from '../config/power-rooms.json'

const containerRef = ref<HTMLElement | null>(null)
let dispose: (() => void) | null = null

onMounted(() => {
  if (!containerRef.value) return
  // 首版：直接展示宝安第一间配电房
  const room = (config.rooms as { id: string }[]).find((r) => r.id === 'room-1')
  if (!room) throw new Error('配置中找不到 room-1')
  dispose = createPowerRoomScene(
    containerRef.value,
    room as Parameters<typeof createPowerRoomScene>[1],
    config.pitch,
  )
})
onUnmounted(() => dispose?.())
</script>

<template>
  <div ref="containerRef" class="scene" />
</template>

<style scoped>
.scene {
  width: 100%;
  height: 100%;
  position: relative;
}
</style>
