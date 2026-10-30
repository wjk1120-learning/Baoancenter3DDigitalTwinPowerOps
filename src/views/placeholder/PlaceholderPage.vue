<script setup lang="ts">
/** 模块未移植的占位页（照搬福永 PlaceholderPage，去掉 router 依赖） */
defineProps<{ name: string }>()
</script>

<template>
  <div class="placeholder">
    <div class="build-icon">
      <svg viewBox="0 0 24 24" width="48" height="48" fill="var(--primary-400)">
        <path
          d="M22.7 19 13.6 9.9c.9-2.3.4-5-1.5-6.9-2-2-5-2.4-7.4-1.3L9 6 6 9 1.6 4.7C.4 7.1.9 10.1 2.9 12.1c1.9 1.9 4.6 2.4 6.9 1.5l9.1 9.1c.4.4 1 .4 1.4 0l2.3-2.3c.5-.4.5-1.1.1-1.4z"
        />
      </svg>
    </div>
    <h2>{{ name }}</h2>
    <p>页面建设中，敬请期待</p>
  </div>
</template>

<style scoped>
.placeholder {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
}
.build-icon {
  opacity: 0.5;
}
.placeholder h2 {
  font-size: 28px;
  font-weight: 600;
  color: var(--title);
}
.placeholder p {
  font-size: 16px;
  color: var(--muted);
}
</style>
