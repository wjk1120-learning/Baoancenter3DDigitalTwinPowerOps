import { defineConfig } from 'vitest/config'

// 自动化单测放根级 tests/（按用户要求 .gitignore 排除、不入库）；src/tests/ 留给调试页。
// node 环境只跑纯函数，不进 DOM/WebGL
export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
  },
})
