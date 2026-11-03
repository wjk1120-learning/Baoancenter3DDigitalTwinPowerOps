import type { GlobalThemeOverrides } from 'naive-ui'

/** Naive UI 主题覆盖：对齐 DESIGN.md 医疗白·湖水蓝配色 */
export const themeOverrides: GlobalThemeOverrides = {
  common: {
    primaryColor: '#2B7CE3',
    primaryColorHover: '#5295E8',
    primaryColorPressed: '#174E93',
    primaryColorSuppl: '#5295E8',
    infoColor: '#2B7CE3',
    infoColorHover: '#5295E8',
    infoColorPressed: '#174E93',
    successColor: '#2FA36B',
    warningColor: '#F5A623',
    errorColor: '#E5484D',
    borderRadius: '8px',
    fontFamily:
      "'Source Han Sans SC', '思源黑体', 'Noto Sans CJK SC', 'Microsoft YaHei', system-ui, sans-serif",
    fontFamilyMono: "'JetBrains Mono', 'Source Han Sans SC', 'Microsoft YaHei', monospace",
  },
  DataTable: {
    thColor: '#eff6fc',
    tdColorHover: '#eff6fc',
    fontSize: '14px',
  },
  Select: {
    menuBoxShadow: '0 8px 22px rgba(43, 108, 160, 0.14)',
    peers: {
      InternalSelection: {
        borderRadius: '8px',
        color: '#FFFFFF',
        colorActive: '#FFFFFF',
        textColor: '#33485F',
        placeholderColor: '#5D7189',
        caretColor: '#2B7CE3',
        arrowColor: '#5D7189',
        border: '1px solid #B9CEE9',
        borderHover: '1px solid #7FB0E8',
        borderActive: '1px solid #2B7CE3',
        borderFocus: '1px solid #2B7CE3',
        boxShadowFocus: '0 0 0 3px #EAF3FB',
      },
      InternalSelectMenu: {
        borderRadius: '8px',
        color: '#FFFFFF',
        optionFontSizeMedium: '13px',
        optionTextColor: '#33485F',
        optionTextColorActive: '#FFFFFF',
        optionColorPending: '#EAF3FB',
        optionColorActive: '#2B7CE3',
        optionColorActivePending: '#2B7CE3',
        optionCheckColor: '#FFFFFF',
      },
    },
  },
}
