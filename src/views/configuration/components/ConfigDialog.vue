<script setup lang="ts">
// 配置中心双模式弹窗（照搬福永配置中心参考包）：danger 主按钮红/文案「确认删除」，saving 锁关闭，错误就地红条。
// 宝安定制（2026-11-24 用户拍板，偏离福永原版）：danger 弹窗出错后禁用确认按钮——
// 删除弹窗无可改输入，后端已判不可删，再点必然重复无效请求；编辑/新增弹窗不禁用，
// 用户改完输入仍需原弹窗重试保存。
import { NAlert, NButton, NModal, NSpace } from 'naive-ui'

defineProps<{ show: boolean; title: string; saving: boolean; error: string; danger?: boolean; disabled?: boolean; action?: string; wide?: boolean }>()
defineEmits<{ close: []; submit: [] }>()
</script>

<template>
  <NModal
    :show="show" :title="title" preset="card" :class="wide ? 'config-modal config-modal--wide' : 'config-modal'"
    :mask-closable="false" :closable="!saving" :close-on-esc="!saving"
    @update:show="(value) => { if (!value && !saving) $emit('close') }">
    <NAlert v-if="error" type="error">{{ error }}</NAlert>
    <slot />
    <template #footer>
      <NSpace justify="end">
        <NButton :disabled="saving" @click="$emit('close')">取消</NButton>
        <NButton
          :type="danger ? 'error' : 'primary'" :loading="saving"
          :disabled="disabled || (danger && !!error)"
          @click="$emit('submit')">{{ action ?? (danger ? '确认删除' : '保存') }}</NButton>
      </NSpace>
    </template>
  </NModal>
</template>
