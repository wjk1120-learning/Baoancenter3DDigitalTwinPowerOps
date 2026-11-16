<script setup lang="ts">
import { computed, onActivated, onMounted, onUnmounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { fetchHealthAverage } from '../../api/device/device'
import EnergyOverviewPanel from '../../panels/EnergyOverviewPanel.vue'
import AlertPanel from '../../panels/AlertPanel.vue'
import HealthPanel from '../../panels/HealthPanel.vue'
import TransformerPanel from '../../panels/TransformerPanel.vue'

defineOptions({ name: 'HospitalOverviewPage' })

/**
 * 医院总览（4.6，福永 HospitalPage 同构的无 3D 版，docs/医院总览页移植方案.md）：
 * 中间为 3D 园区预留挂载区（后补 3D 时铺底，本壳与面板零改动），左右毛玻璃面板列
 * 悬浮贴边（福永 .side 同款：宽 380、避开顶部栏）。本期楼栋相关不做。
 * 面板均自取数据：健康面板（§1.12+§1.13）已挂；能源/设备监测/告警面板随批次补挂。
 */
const HOSPITAL_NAME = '深圳市宝安中心医院'

const router = useRouter()

/** 中间状态区健康度大数字（§1.13；与右栏健康面板各拉一次，轻接口） */
const healthScore = ref<number | null>(null)
async function loadHealthScore() {
  healthScore.value = await fetchHealthAverage().catch(() => null)
}
onMounted(loadHealthScore)
onActivated(loadHealthScore)

/** 时钟（1s tick） */
const now = ref(new Date())
let clockTimer: number | null = null
onMounted(() => {
  clockTimer = window.setInterval(() => (now.value = new Date()), 1000)
})
onUnmounted(() => {
  if (clockTimer != null) window.clearInterval(clockTimer)
})
const dateText = computed(() => {
  const d = now.value
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
})
const timeText = computed(() => {
  const d = now.value
  const p = (n: number) => String(n).padStart(2, '0')
  return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`
})

/** 面板头图标（福永 PanelContainer registry 同款 path） */
const ICONS = {
  energy: 'M3 3h18v18H3zM3 9h18M9 21V9',
  transformer:
    'M12 9v-3m0 12v-3m3-3h3m-12 0h3M6.34 6.34l2.12 2.12m7.08 7.08 2.12 2.12M17.66 6.34l-2.12 2.12m-7.08 7.08 2.12 2.12M12 12m-3 0a3 3 0 1 0 6 0a3 3 0 1 0-6 0',
  health: 'M22 12h-4l-3 8-4-16-3 8H2',
  alert: 'M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9M13.7 21a2 2 0 0 1-3.4 0',
} as const
</script>

<template>
  <div class="hospital">
    <!-- 3D 园区预留挂载区（后补 3D 时场景铺底，absolute inset 0） -->
    <div class="scene-reserve" aria-hidden="true" />

    <!-- 中间状态胶囊（福永同款：顶部居中；hud 展开交互随 3D 后补） -->
    <div class="status-tag">
      <span class="pulse-dot" />
      <span>医院环境正常</span>
    </div>

    <!-- 左侧浮动面板列 -->
    <aside class="side left">
      <section class="panel-block glass-card" :style="{ flex: 0.7 }">
        <div class="card-head">
          <span class="card-ico">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path :d="ICONS.energy" />
            </svg>
          </span>
          <h3 class="card-title">能源运营总览</h3>
        </div>
        <div class="panel-body">
          <EnergyOverviewPanel />
        </div>
      </section>

      <section class="panel-block glass-card" :style="{ flex: 1.6 }">
        <div class="card-head">
          <span class="card-ico">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path :d="ICONS.transformer" />
            </svg>
          </span>
          <h3 class="card-title">主要设备监测</h3>
        </div>
        <div class="panel-body">
          <TransformerPanel />
        </div>
      </section>
    </aside>

    <!-- 右侧浮动面板列 -->
    <aside class="side right">
      <section class="panel-block glass-card" :style="{ flex: 1 }">
        <div class="card-head">
          <span class="card-ico">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path :d="ICONS.health" />
            </svg>
          </span>
          <h3 class="card-title">医院整体健康度</h3>
          <button type="button" class="card-sub" @click="router.push('/device')">更多 &gt;</button>
        </div>
        <div class="panel-body">
          <HealthPanel />
        </div>
      </section>

      <section class="panel-block glass-card" :style="{ flex: 2 }">
        <div class="card-head">
          <span class="card-ico">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path :d="ICONS.alert" />
            </svg>
          </span>
          <h3 class="card-title">告警信息</h3>
        </div>
        <div class="panel-body">
          <AlertPanel />
        </div>
      </section>
    </aside>

    <!-- 中间下部：医院名 / 全院健康度 / 时钟（3D 后补时上移至场景标签位） -->
    <div class="center-status">
      <h1 class="ho-name">{{ HOSPITAL_NAME }}</h1>
      <div class="ho-health">
        <span class="ho-health-num">{{ healthScore ?? '—' }}</span>
        <span class="ho-health-lbl">全院健康度</span>
      </div>
      <div class="ho-clock">
        <span class="ho-date">{{ dateText }}</span>
        <span class="ho-time">{{ timeText }}</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.hospital {
  width: 100%;
  height: 100%;
  overflow: hidden;
  position: relative;
}
/* 3D 园区预留挂载区：absolute 铺底，背景沿用页面底色（后补 3D 时由 canvas 覆盖） */
.scene-reserve {
  position: absolute;
  inset: 0;
  z-index: 0;
  background:
    radial-gradient(900px 520px at 50% 30%, rgba(76, 208, 232, 0.08), transparent 60%),
    linear-gradient(165deg, var(--bg-1), var(--bg-2));
}

/* 左右浮动面板：毛玻璃浮层，绝对定位避开顶部栏（福永 .side 同款） */
.side {
  position: absolute;
  top: calc(var(--topbar-height) + 16px);
  bottom: 24px;
  width: 380px;
  z-index: 10;
  display: flex;
  flex-direction: column;
  gap: var(--gutter);
}
.side.left {
  left: 24px;
}
.side.right {
  right: 24px;
}
.panel-block {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  padding: 18px var(--panel-padding) 16px;
}
.panel-body {
  flex: 1;
  min-height: 0;
  position: relative;
}
.body-placeholder {
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--muted);
  font-size: 14px;
  letter-spacing: 1px;
}

/* 中间状态胶囊（福永 status-tag 同款：顶部居中） */
.status-tag {
  position: absolute;
  top: calc(var(--topbar-height) + 14px);
  left: 50%;
  transform: translateX(-50%);
  z-index: 20;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 18px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.82);
  border: 1px solid rgba(255, 255, 255, 0.95);
  box-shadow: 0 8px 20px rgba(43, 108, 160, 0.12);
  font-size: 14px;
  font-weight: 600;
  color: var(--title);
}
.pulse-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--primary);
  box-shadow: 0 0 0 4px rgba(43, 124, 227, 0.14);
}

/* 中间下部状态：医院名 / 全院健康度 / 时钟 */
.center-status {
  position: absolute;
  left: 50%;
  bottom: 30px;
  transform: translateX(-50%);
  z-index: 12;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
}
.ho-name {
  margin: 0;
  font-size: 30px;
  font-weight: 700;
  color: var(--title);
  letter-spacing: 2px;
}
.ho-health {
  display: flex;
  align-items: baseline;
  gap: 10px;
}
.ho-health-num {
  font-size: 52px;
  font-weight: 700;
  color: var(--primary-700);
  font-family: var(--font-mono);
  line-height: 1;
}
.ho-health-lbl {
  font-size: 14px;
  color: var(--muted);
}
.ho-clock {
  display: flex;
  align-items: baseline;
  gap: 12px;
  font-family: var(--font-mono);
}
.ho-date {
  font-size: 15px;
  color: var(--muted);
}
.ho-time {
  font-size: 26px;
  font-weight: 700;
  color: var(--title);
}
</style>
