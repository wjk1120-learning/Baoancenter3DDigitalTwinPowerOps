<script setup lang="ts">
import { useMessage } from 'naive-ui'
import { bindGlobalMessage } from '../utils/message'

// 挂在 NMessageProvider 内，向全局暴露 message 实例（请求层 toast 用；渲染一个隐藏节点）
bindGlobalMessage(useMessage())
</script>

<template>
  <div class="message-bridge" hidden />
</template>
