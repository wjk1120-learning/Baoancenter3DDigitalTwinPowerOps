<script setup lang="ts">
import { computed, nextTick, onActivated, onDeactivated, onMounted, onUnmounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import EnergyOverviewPanel from '../../panels/EnergyOverviewPanel.vue'
import AlertPanel from '../../panels/AlertPanel.vue'
import HealthPanel from '../../panels/HealthPanel.vue'
import TransformerPanel from '../../panels/TransformerPanel.vue'
import SceneLoadBar from './SceneLoadBar.vue'
import BuildingInfoCard from './BuildingInfoCard.vue'
import { createCampusScene } from '../../three/campus/sceneManager'
import { CAMPUS_BUILDINGS, CAMPUS_LAYOUT } from '../../config/campusConfig'

defineOptions({ name: 'HospitalOverviewPage' })

/**
 * 医院总览（4.6，福永 HospitalPage 同构，docs/3D园区一期方案.md）：
 * 中间 3D 园区铺底（Draco GLB 六栋 + 福永式环境），左右毛玻璃面板列悬浮贴边。
 * 园区引擎 = src/three/campus/（医院无关，楼栋/布局数据从 src/config/campusConfig 注入）。
 * 批2 交互：hover 高亮 → 点楼聚焦（相机飞近+其它楼隐藏）→ 信息卡；Esc/点空白/× 返回全景。
 * 中间状态区已撤（照搬福永，2026-11-17 拍板）。
 * 生命周期（DeviceDetailPage 同款，避免与配电房抢 WebGL）：失活彻底 dispose、
 * 激活重建（GLB 模板缓存模块级持久，重建只重摆位）。
 */

// ---- 3D 园区 ----
const sceneEl = ref<HTMLDivElement | null>(null)
const loadProgress = ref(0)
const sceneError = ref(false)
const selectedId = ref<number | null>(null)
const selectedName = ref('')
let scene: {
  dispose(): void
  focusBuilding(id: number): void
  backToCampus(): void
} | null = null

function initScene() {
  if (!sceneEl.value || scene) return
  sceneError.value = false
  loadProgress.value = 0
  try {
    scene = createCampusScene(sceneEl.value, {
      buildings: CAMPUS_BUILDINGS,
      layout: CAMPUS_LAYOUT,
      onProgress: (done, total) => (loadProgress.value = done / total),
      onPick: (pick) => {
        if (pick.kind === 'building' && pick.buildingId != null) {
          const cfg = CAMPUS_BUILDINGS.find((b) => b.id === pick.buildingId)
          if (!cfg) return
          selectedId.value = cfg.id
          selectedName.value = cfg.name
          scene?.focusBuilding(cfg.id)
        } else {
          clearSelection()
        }
      },
    })
  } catch (err) {
    console.warn('[HospitalOverview] 3D 场景初始化失败', err)
    sceneError.value = true
  }
}

function clearSelection() {
  selectedId.value = null
  selectedName.value = ''
  scene?.backToCampus()
}

const onKeydown = (ev: KeyboardEvent) => {
  if (ev.key === 'Escape' && selectedId.value != null) clearSelection()
}

function disposeScene() {
  scene?.dispose()
  scene = null
}

onMounted(() => {
  window.addEventListener('keydown', onKeydown)
  nextTick(initScene)
})
onActivated(() => {
  window.addEventListener('keydown', onKeydown)
  nextTick(initScene)
})
onDeactivated(() => {
  window.removeEventListener('keydown', onKeydown)
  disposeScene()
})
onUnmounted(() => {
  window.removeEventListener('keydown', onKeydown)
  disposeScene()
})

const router = useRouter()

/** 聚焦态：左右四面板淡出、信息卡淡入（福永聚焦收面板同款形态） */
const focused = computed(() => selectedId.value != null)

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
    <!-- 3D 园区：canvas 容器铺底（z0），加载进度条与失败遮罩叠在其上 -->
    <div ref="sceneEl" class="scene-host" />
    <SceneLoadBar :progress="loadProgress" />
    <div v-if="sceneError" class="scene-error">
      <p>3D 园区加载失败（WebGL 不可用或模型异常）</p>
      <button type="button" @click="disposeScene(); initScene()">重试</button>
    </div>

    <!-- 楼栋信息卡（点楼聚焦时淡入；× 关闭/Esc 返回全景） -->
    <Transition name="bic">
      <BuildingInfoCard
        v-if="selectedId != null"
        :key="selectedId"
        :building-id="selectedId"
        :building-name="selectedName"
        @close="clearSelection"
      />
    </Transition>

    <!-- 中间状态胶囊（福永同款：顶部居中；hud 展开交互随 3D 后补） -->
    <div class="status-tag">
      <span class="pulse-dot" />
      <span>医院环境正常</span>
    </div>

    <!-- 左侧浮动面板列 -->
    <aside class="side left" :class="{ 'side-hidden': focused }">
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
    <aside class="side right" :class="{ 'side-hidden': focused }">
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
  </div>
</template>

<style scoped>
.hospital {
  width: 100%;
  height: 100%;
  overflow: hidden;
  position: relative;
}
/* 3D 园区 canvas 容器：absolute 铺底；3D 初始化前露页面底色过渡 */
.scene-host {
  position: absolute;
  inset: 0;
  z-index: 0;
  background:
    radial-gradient(900px 520px at 50% 30%, rgba(76, 208, 232, 0.08), transparent 60%),
    linear-gradient(165deg, var(--bg-1), var(--bg-2));
}
.scene-error {
  position: absolute;
  left: 50%;
  top: 50%;
  transform: translate(-50%, -50%);
  z-index: 16;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  padding: 18px 26px;
  border-radius: 14px;
  background: rgba(96, 24, 30, 0.72);
  border: 1px solid rgba(229, 72, 77, 0.55);
  color: #ffd9da;
  font-size: 14px;
}
.scene-error button {
  padding: 6px 22px;
  border-radius: 8px;
  border: 1px solid rgba(255, 217, 218, 0.7);
  background: rgba(255, 255, 255, 0.08);
  color: #fff;
  font-size: 14px;
  cursor: pointer;
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
/* 聚焦态：面板淡出让位（pointer-events 同步关掉避免挡住信息卡点击） */
.side {
  transition: opacity 0.35s ease;
}
.side-hidden {
  opacity: 0;
  pointer-events: none;
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

/* 信息卡淡入/淡出（Transition name=bic 作用在子组件根元素上） */
.bic-enter-active {
  transition: opacity 0.35s ease, transform 0.35s ease;
}
.bic-leave-active {
  transition: opacity 0.3s ease, transform 0.3s ease;
}
.bic-enter-from,
.bic-leave-to {
  opacity: 0;
}
</style>
