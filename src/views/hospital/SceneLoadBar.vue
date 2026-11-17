<script setup lang="ts">
/** 3D 园区加载进度条（福永 SceneLoadBar 同款玻璃条；docs/3D园区一期方案.md 批1） */
defineProps<{ progress: number }>()
</script>

<template>
  <Transition name="loadbar">
    <div v-if="progress < 1" class="scene-loadbar">
      <div class="bar">
        <div class="fill" :style="{ width: `${Math.round(progress * 100)}%` }" />
      </div>
      <span class="txt">园区加载中 {{ Math.round(progress * 100) }}%</span>
    </div>
  </Transition>
</template>

<style scoped>
.scene-loadbar {
  position: absolute;
  left: 50%;
  top: 50%;
  transform: translate(-50%, -50%);
  z-index: 15;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  padding: 14px 26px;
  border-radius: 14px;
  background: rgba(13, 32, 54, 0.55);
  border: 1px solid rgba(255, 255, 255, 0.35);
  backdrop-filter: blur(8px);
  box-shadow: 0 8px 24px rgba(5, 15, 30, 0.35);
}
.bar {
  width: 260px;
  height: 6px;
  border-radius: 3px;
  background: rgba(255, 255, 255, 0.18);
  overflow: hidden;
}
.fill {
  height: 100%;
  border-radius: 3px;
  background: linear-gradient(90deg, #2b7ce3, #4cd0e8);
  transition: width 0.3s ease;
}
.txt {
  font-size: 13px;
  color: rgba(255, 255, 255, 0.92);
  letter-spacing: 1px;
}
.loadbar-leave-active {
  transition: opacity 0.4s ease;
}
.loadbar-leave-to {
  opacity: 0;
}
</style>
