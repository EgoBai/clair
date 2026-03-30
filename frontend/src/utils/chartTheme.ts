/**
 * 主题感知的图表颜色方案
 * 根据当前主题返回适合的 ECharts 配色
 */

import { useResolvedTheme } from '../store/useAppStore';

// 亮色主题配色
const LIGHT_COLORS = {
  bg: '#ffffff',
  text: '#333333',
  textSecondary: '#999999',
  grid: '#f0f0f0',
  axis: '#e0e0e0',
  rise: '#EF4444',
  fall: '#22C55E',
  flat: '#6B7280',
  primary: '#3B82F6',
  volume: 'rgba(59, 130, 246, 0.5)',
  tooltip: 'rgba(255, 255, 255, 0.95)',
  tooltipBorder: '#e0e0e0',
  // 多色系列
  series: ['#3B82F6', '#EF4444', '#22C55E', '#F59E0B', '#8B5CF6', '#EC4899', '#06B6D4', '#84CC16'],
  // K线
  klineRise: '#EF4444',
  klineFall: '#22C55E',
  klineRiseBg: 'rgba(239, 68, 68, 0.08)',
  klineFallBg: 'rgba(34, 197, 94, 0.08)',
};

// 暗色主题配色
const DARK_COLORS = {
  bg: '#16213e',
  text: '#e0e0e0',
  textSecondary: '#6b6b8a',
  grid: '#2a2a4a',
  axis: '#3a3a5a',
  rise: '#EF4444',
  fall: '#22C55E',
  flat: '#6B7280',
  primary: '#3B82F6',
  volume: 'rgba(59, 130, 246, 0.4)',
  tooltip: 'rgba(22, 33, 62, 0.95)',
  tooltipBorder: '#3a3a5a',
  series: ['#60A5FA', '#F87171', '#4ADE80', '#FBBF24', '#A78BFA', '#F472B6', '#22D3EE', '#A3E635'],
  klineRise: '#F87171',
  klineFall: '#4ADE80',
  klineRiseBg: 'rgba(248, 113, 113, 0.1)',
  klineFallBg: 'rgba(74, 222, 128, 0.1)',
};

export type ThemeColors = typeof LIGHT_COLORS;

export function useChartColors(): ThemeColors {
  const theme = useResolvedTheme();
  return theme === 'dark' ? DARK_COLORS : LIGHT_COLORS;
}

/**
 * 获取 ECharts 基础配置
 */
export function useEChartsTheme() {
  const colors = useChartColors();

  return {
    backgroundColor: 'transparent',
    textStyle: { color: colors.text },
    title: { textStyle: { color: colors.text } },
    legend: { textStyle: { color: colors.textSecondary } },
    tooltip: {
      backgroundColor: colors.tooltip,
      borderColor: colors.tooltipBorder,
      textStyle: { color: colors.text },
    },
    xAxis: {
      axisLine: { lineStyle: { color: colors.axis } },
      axisLabel: { color: colors.textSecondary },
      splitLine: { lineStyle: { color: colors.grid } },
    },
    yAxis: {
      axisLine: { lineStyle: { color: colors.axis } },
      axisLabel: { color: colors.textSecondary },
      splitLine: { lineStyle: { color: colors.grid } },
    },
    colors: colors.series,
    _raw: colors,
  };
}

export { LIGHT_COLORS, DARK_COLORS };

// ==================== 兼容旧接口 ====================

export interface ChartTheme {
  name: string;
  bg: string;
  text: string;
  textSecondary: string;
  grid: string;
  axis: string;
  rise: string;
  fall: string;
  flat: string;
  primary: string;
  volume: string;
  series: string[];
}

export const LIGHT_THEME: ChartTheme = {
  name: 'light',
  ...LIGHT_COLORS,
};

export const DARK_THEME: ChartTheme = {
  name: 'dark',
  ...DARK_COLORS,
};

type ThemeListener = () => void;

class ChartThemeManager {
  private current: ChartTheme = LIGHT_THEME;
  private listeners: Set<ThemeListener> = new Set();

  get(): ChartTheme {
    return this.current;
  }

  set(theme: ChartTheme): void {
    this.current = theme;
    this.listeners.forEach(fn => fn());
  }

  subscribe(fn: ThemeListener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }
}

export const chartThemeManager = new ChartThemeManager();

const MA_COLORS = ['#3B82F6', '#F59E0B', '#EF4444', '#8B5CF6'];

export function getMAColor(index: number): string {
  return MA_COLORS[index % MA_COLORS.length];
}

export function getKLineChartTheme(rise: boolean) {
  const colors = chartThemeManager.get();
  return {
    color: rise ? colors.rise : colors.fall,
    borderColor: rise ? colors.rise : colors.fall,
    itemStyle: {
      color: rise ? colors.rise : colors.fall,
      borderColor: rise ? colors.rise : colors.fall,
      color0: colors.fall,
      borderColor0: colors.fall,
    },
  };
}
