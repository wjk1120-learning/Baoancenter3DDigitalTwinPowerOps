import eslintConfigPrettier from 'eslint-config-prettier'
import { defineConfigWithVueTs, vueTsConfigs } from '@vue/eslint-config-typescript'
import pluginVue from 'eslint-plugin-vue'

export default defineConfigWithVueTs(
  {
    name: 'baoan/files-to-lint',
    files: ['src/**/*.{ts,vue}'],
  },
  {
    name: 'baoan/ignores',
    // scripts/ 是用户维护的运维脚本，本轮 lint 范围只覆盖 src；
    // docs/ 含只读参考包（福永配置中心参考），不属于本项目源码
    ignores: ['dist/**', 'node_modules/**', 'public/**', 'scripts/**', 'docs/**'],
  },
  // 只开防错规则（essential），风格全部交给 Prettier
  pluginVue.configs['flat/essential'],
  vueTsConfigs.recommended,
  // 格式交给 Prettier：关掉与格式冲突的 ESLint 规则
  eslintConfigPrettier,
)
