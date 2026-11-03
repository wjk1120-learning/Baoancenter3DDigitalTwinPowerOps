import { defineConfig, loadEnv } from 'vite'
import vue from '@vitejs/plugin-vue'

// https://vite.dev/config/
export default defineConfig(({ command, mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const serving = command === 'serve'

  // 代理 target 可缺省：mock 开发（VITE_USE_MOCK=true）不出网络用不到代理；
  // 联调时在 .env.development 填 BZ_PROXY_TARGET / AUTH_PROXY_TARGET / WS_PROXY_TARGET
  const bz = env.BZ_PROXY_TARGET?.trim() ?? ''
  const auth = env.AUTH_PROXY_TARGET?.trim() ?? ''
  const ws = env.WS_PROXY_TARGET?.trim() ?? ''

  return {
    // 部署/开发统一挂在 /baozhongTwin/（与福永 /fuyongTwin/ 同款约定），路由与资源路径随 BASE_URL 走
    base: '/baozhongTwin/',
    plugins: [vue()],
    server: {
      port: 5251,
      host: true,
      proxy: serving
        ? {
            // REST：宝中数据后端（契约沿用福永；转发前缀与重写规则联调时定）
            ...(bz ? { '/bz-hospital': { target: bz, changeOrigin: true } } : {}),
            // 认证中心（logout / tickets / exchange）
            ...(auth ? { '/auth': { target: auth, changeOrigin: true } } : {}),
            // WebSocket：事件推送 /ws/event（能耗为轮询，无 WS）
            ...(ws
              ? {
                  '/ws': {
                    target: ws,
                    ws: true,
                    changeOrigin: true,
                    // 开发态 ws 代理易被中断，给足握手/空闲超时，减少静默断线
                    timeout: 60_000,
                  },
                }
              : {}),
          }
        : undefined,
    },
    build: {
      rollupOptions: {
        output: {
          manualChunks(id: string) {
            if (id.includes('node_modules/three/')) return 'three'
            if (id.includes('node_modules/vue')) return 'vue'
            if (id.includes('node_modules/naive-ui/')) return 'naiveui'
            return undefined
          },
        },
      },
    },
  }
})
