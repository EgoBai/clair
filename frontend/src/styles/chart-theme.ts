/**
 * 澄观图表主题 — 统一管理所有ECharts图表的颜色和样式
 * 暗色主题: BG=#0f172a CARD=#1e293b
 */

// === 基础色板 ===
export const CHART_COLORS = {
  // 涨跌色(中国A股惯例)
  up: '#cf2a2a',        // 红涨
  down: '#1db468',      // 绿跌
  flat: '#64748b',      // 平盘

  // 强调色
  accent: '#3b82f6',    // 蓝色
  gold: '#f59e0b',      // 金色
  purple: '#8b5cf6',    // 紫色
  pink: '#ec4899',      // 粉色

  // MA均线色
  ma5: '#f59e0b',
  ma10: '#3b82f6',
  ma20: '#8b5cf6',
  ma60: '#ec4899',

  // 背景色
  bg: '#0f172a',
  cardBg: '#1e293b',
  border: 'rgba(148,163,184,0.1)',

  // 文字色
  text: '#f8fafc',
  textSec: '#94a3b8',
  textMuted: '#64748b',
} as const;

// === Tooltip配置 ===
export const TOOLTIP_DARK = {
  backgroundColor: 'rgba(30,41,59,0.96)',
  borderColor: 'rgba(148,163,184,0.2)',
  borderWidth: 1,
  textStyle: { fontSize: 12, color: '#f8fafc' },
} as const;

// === 网格配置 ===
export const GRID_CONFIG = {
  left: '10%',
  right: '8%',
  top: '12%',
  bottom: '2%',
} as const;

// === 坐标轴配置 ===
export const AXIS_CONFIG = {
  axisLine: { lineStyle: { color: 'rgba(148,163,184,0.2)' } },
  axisTick: { show: false },
  axisLabel: { color: '#94a3b8', fontSize: 11 },
  splitLine: { lineStyle: { color: 'rgba(148,163,184,0.08)' } },
} as const;

// === 雷达图配置 ===
export const RADAR_CONFIG = {
  shape: 'polygon' as const,
  splitNumber: 5,
  axisName: { color: '#94a3b8', fontSize: 12 },
  splitLine: { lineStyle: { color: 'rgba(148,163,184,0.15)' } },
  splitArea: { areaStyle: { color: ['rgba(59,130,246,0.02)', 'rgba(59,130,246,0.05)'] } },
  axisLine: { lineStyle: { color: 'rgba(148,163,184,0.2)' } },
} as const;

// === K线图配置 ===
export const KLINE_CONFIG = {
  itemStyle: {
    color: '#cf2a2a',       // 阳线(涨)
    color0: '#1db468',      // 阴线(跌)
    borderColor: '#cf2a2a',
    borderColor0: '#1db468',
  },
  barWidth: '55%',
} as const;

// === 导出图片配置 ===
export const EXPORT_CONFIG = {
  backgroundColor: '#0f172a',
  pixelRatio: 2,
} as const;
