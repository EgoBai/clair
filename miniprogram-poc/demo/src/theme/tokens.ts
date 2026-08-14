/**
 * 设计令牌 —— TS 常量版
 * 单一事实来源：frontend/src/styles/theme.ts（值保持一致，供 JSX 内联色 / echarts option 使用）
 * 与 app.scss 的 CSS 变量一一对应（docs/01-design.md §2.1）
 */

export const colors = {
  page: '#0a0e1a',
  card: '#111827',
  cardHover: '#1a2332',
  surface: '#1e293b',
  border: '#2d3748',
  borderLight: '#374151',
  text: '#f1f5f9',
  textSecondary: '#94a3b8',
  textMuted: '#64748b',
  accent: '#3b82f6',
  accentLight: '#60a5fa',
  accentBg: '#1e3a5f',
  warning: '#f59e0b',
  up: '#ef4444',
  down: '#22c55e',
  flat: '#6b7280',
} as const

/** 涨跌色（与 theme.ts getPriceColor 一致） */
export function getPriceColor(change: number): string {
  if (change > 0) return colors.up
  if (change < 0) return colors.down
  return colors.flat
}

/** 涨跌符号（与 theme.ts getPriceSign 一致） */
export function getPriceSign(change: number): string {
  return change > 0 ? '+' : ''
}

/** 涨跌幅百分比字符串 */
export function formatPercent(num: number): string {
  return (num > 0 ? '+' : '') + Number(num).toFixed(2) + '%'
}
