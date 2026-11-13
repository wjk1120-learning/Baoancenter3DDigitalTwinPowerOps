/** 图表颜色统一从 CSS 设计令牌读取，改主题时图表自动跟随，避免硬编码散落各处 */
const rootVar = (name: string, fallback: string): string => {
  if (typeof window === 'undefined') return fallback
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback
}

export const chartColors = {
  primary: rootVar('--primary', '#2B7CE3'),
  primary400: rootVar('--primary-400', '#5295E8'),
  primary700: rootVar('--primary-700', '#174E93'),
  title: rootVar('--title', '#1F3A5F'),
  muted: rootVar('--muted', '#5D7189'),
  border: rootVar('--border', '#D6E4F5'),
  borderStrong: rootVar('--border-strong', '#B9CEE9'),
  primary50: rootVar('--primary-50', '#EAF3FB'),
  teal: rootVar('--teal', '#17A2B8'),
  auxBlue: rootVar('--aux-blue', '#5AA1F5'),
  warn: rootVar('--warn', '#F5A623'),
  danger: rootVar('--danger', '#E5484D'),
}

/** 把令牌色值（#hex 或 rgb()）转成带透明度的 rgba；getComputedStyle 对自定义属性可能回 hex 原文 */
export function withAlpha(color: string, alpha: number): string {
  const hex = color.match(/^#([0-9a-f]{6})$/i)
  if (hex) {
    const n = parseInt(hex[1]!, 16)
    return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`
  }
  const m = color.match(/\d+(\.\d+)?/g)
  if (!m || m.length < 3) return color
  return `rgba(${m[0]}, ${m[1]}, ${m[2]}, ${alpha})`
}
