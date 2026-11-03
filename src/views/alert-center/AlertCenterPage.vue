<script setup lang="ts">
import { eventLevelLabel, groupLatestTime } from '../../api/event/mappers'
import { useAlertCenter } from './composables/useAlertCenter'

// 告警中心（4.1② 骨架：统计条 + 分组列表；分组展开/图表/详情抽屉/处理随 4.1③ 补）
defineOptions({ name: 'AlertCenterPage' })

const { stats, groups, loading, error, refresh } = useAlertCenter()
</script>

<template>
  <div class="page">
    <header class="stats-bar">
      <div class="stat">
        <span class="num">{{ stats?.totalEvents ?? '—' }}</span>
        <span class="cap">告警总数</span>
      </div>
      <div class="stat">
        <span class="num warn-text">{{ stats?.unhandledEvents ?? '—' }}</span>
        <span class="cap">未处理</span>
      </div>
      <div class="stat">
        <span class="num">{{ stats?.handleRate ?? '—' }}<i v-if="stats?.handleRate != null" class="unit">%</i></span>
        <span class="cap">处理率</span>
      </div>
      <div class="stat">
        <span class="num danger-text">{{ stats?.urgentCount ?? '—' }}</span>
        <span class="cap">紧急</span>
      </div>
      <div class="stat">
        <span class="num">{{ stats?.criticalCount ?? '—' }}</span>
        <span class="cap">严重</span>
      </div>
      <button class="refresh" :disabled="loading" @click="refresh(true)">
        {{ loading ? '加载中…' : '刷新' }}
      </button>
    </header>

    <main class="groups">
      <p v-if="error" class="tip">加载失败：{{ error }}</p>
      <p v-if="!loading && !groups.length && !error" class="tip">暂无告警</p>

      <section v-for="g in groups" :key="g.deviceName" class="group">
        <header class="group-head">
          <span class="device">{{ g.deviceName }}</span>
          <span class="badge" :class="g.highestLevel === 1 ? 'error' : 'warn'">
            {{ eventLevelLabel(g.highestLevel) }}
          </span>
          <span class="meta">共 {{ g.count }} 条 · 最新 {{ groupLatestTime(g) }}</span>
        </header>
        <ul class="events">
          <li v-for="e in g.events.slice(0, 3)" :key="e.eventId">
            <span class="time">{{ e.timeStr }}</span>
            <span class="desc">{{ e.description }}</span>
            <span class="status" :class="{ done: e.handleStatus === 1 }">
              {{ e.handleStatus === 1 ? '已处理' : '未处理' }}
            </span>
          </li>
        </ul>
        <p v-if="g.events.length > 3" class="more">还有 {{ g.events.length - 3 }} 条…</p>
      </section>
    </main>
  </div>
</template>

<style scoped>
.page {
  position: absolute;
  inset: 0;
  top: var(--topbar-height);
  padding: 16px 24px 24px;
  overflow: auto;
}
.stats-bar {
  display: flex;
  align-items: stretch;
  gap: 12px;
  flex-wrap: wrap;
  margin-bottom: 14px;
}
.stat {
  flex: none;
  min-width: 110px;
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 10px 18px;
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.72);
  border: 1px solid rgba(255, 255, 255, 0.95);
  box-shadow: 0 4px 12px rgba(43, 108, 160, 0.08);
}
.num {
  font-family: var(--font-mono);
  font-size: 24px;
  font-weight: 700;
  color: var(--title);
}
.num .unit {
  font-style: normal;
  font-size: 14px;
  margin-left: 2px;
}
.warn-text {
  color: var(--warn-text);
}
.danger-text {
  color: var(--danger);
}
.cap {
  font-size: 12px;
  color: var(--muted);
}
.refresh {
  margin-left: auto;
  align-self: center;
  padding: 8px 18px;
  border: 1px solid var(--primary);
  border-radius: 8px;
  background: #fff;
  color: var(--primary);
  font-size: 14px;
  cursor: pointer;
}
.refresh:hover {
  background: var(--primary-50);
}
.refresh:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.groups {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.tip {
  padding: 24px;
  text-align: center;
  color: var(--muted);
  font-size: 15px;
}
.group {
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.72);
  border: 1px solid rgba(255, 255, 255, 0.95);
  box-shadow: 0 4px 12px rgba(43, 108, 160, 0.08);
  overflow: hidden;
}
.group-head {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 16px;
  border-bottom: 1px solid var(--primary-50);
}
.device {
  font-size: 16px;
  font-weight: 700;
  color: var(--title);
}
.badge {
  flex: none;
  font-size: 12px;
  font-weight: 700;
  padding: 2px 10px;
  border-radius: 999px;
}
.badge.error {
  color: var(--danger-text);
  background: rgba(229, 72, 77, 0.14);
}
.badge.warn {
  color: var(--warn-text);
  background: rgba(232, 168, 56, 0.16);
}
.meta {
  margin-left: auto;
  font-size: 12px;
  color: var(--muted);
}
.events {
  margin: 0;
  padding: 4px 16px;
  list-style: none;
}
.events li {
  display: flex;
  align-items: baseline;
  gap: 12px;
  padding: 7px 0;
  font-size: 14px;
  border-bottom: 1px dashed var(--primary-50);
}
.events li:last-child {
  border-bottom: none;
}
.time {
  flex: none;
  font-family: var(--font-mono);
  font-size: 13px;
  color: var(--muted);
}
.desc {
  flex: 1;
  min-width: 0;
  color: var(--text);
}
.status {
  flex: none;
  font-size: 12px;
  color: var(--warn-text);
}
.status.done {
  color: var(--muted);
}
.more {
  margin: 0;
  padding: 6px 16px 10px;
  font-size: 12px;
  color: var(--muted);
}
</style>
