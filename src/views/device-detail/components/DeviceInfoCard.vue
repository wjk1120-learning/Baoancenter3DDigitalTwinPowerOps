<script setup lang="ts">
defineProps<{
  name: string
  deviceNumber: string
  deviceType: string
  commissionDate: string
}>()
</script>

<template>
  <div class="info-card glass-panel">
    <div class="card-title">设备基本信息</div>
    <div class="info-head">
      <h3 class="device-name">{{ name }}</h3>
    </div>
    <div class="info-grid">
      <div class="info-field">
        <span class="k">设备编号</span><span class="v mono">{{ deviceNumber || '—' }}</span>
      </div>
      <div class="info-field">
        <span class="k">设备类型</span>
        <span class="v"><span class="dtag">{{ deviceType || '—' }}</span></span>
      </div>
      <div class="info-field">
        <span class="k">投运日期</span><span class="v mono">{{ commissionDate || '—' }}</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.info-card {
  padding: 16px 18px;
  border-radius: var(--radius);
  box-shadow: var(--card-shadow);
  overflow: hidden;
  flex: none;
}
.card-title {
  font-size: 18px;
  font-weight: 700;
  color: var(--title);
  margin-bottom: 14px;
  position: relative;
  padding-left: 12px;
}
.card-title::before {
  content: '';
  position: absolute;
  left: 0;
  top: 50%;
  transform: translateY(-50%);
  width: 3px;
  height: 16px;
  background: var(--primary);
  border-radius: 2px;
}
.info-head {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 14px;
  padding-bottom: 12px;
  border-bottom: 1px solid var(--border);
}
.device-name {
  font-size: 18px;
  font-weight: 700;
  color: var(--title);
  line-height: 1.35;
  word-break: break-all;
  margin: 0;
  padding: 4px 12px;
  border-radius: 8px;
  background: var(--primary-50);
}
.info-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0 16px;
}
.info-field {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 9px 0;
  border-bottom: 1px dashed var(--border);
}
.info-field .k {
  color: var(--muted);
  font-size: 14px;
}
.info-field .v {
  color: var(--title);
  font-weight: 600;
  font-size: 16px;
}
.mono {
  font-family: var(--font-mono);
  font-size: 14px;
}
.dtag {
  display: inline-block;
  padding: 3px 10px;
  border-radius: 4px;
  font-size: 13px;
  font-weight: 600;
  color: var(--primary-700);
  background: var(--primary-50);
}
</style>
