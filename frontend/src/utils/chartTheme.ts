/**
 * ECharts 自定义主题系统
 * 支持红涨绿跌（A股标准）、暗色模式、高对比度
 * 参考 TradingView 的图表视觉标准
 */

// ==================== 类型定义 ====================

export interface ChartThemeColors {
  rise: string;        // 涨（红）
  fall: string;        // 跌（绿）
  flat: string;        // 平盘
  riseBg: string;      // 涨背景
  fallBg: string;      // 跌背景
  primary: string;     // 主色
  secondary: string;   // 次要色
  bg: string;          // 背景
  surface: string;     // 表面
  text: string;        // 文字
  textSecondary: string; // 次要文字
  border: string;      // 边框
  grid: string;        // 网格线
  axisLabel: string;   // 坐标轴标签
  crosshair: string;   // 十字线
  tooltip: string;     // 提示框背景
  tooltipText: string; // 提示框文字
}

export interface ChartTheme {
  name: string;
  colors: ChartThemeColors;
  candlestick: {
    upColor: string;
    upBorderColor: string;
    downColor: string;
    downBorderColor: string;
  };
  volume: {
    upColor: string;
    downColor: string;
  };
  indicators: {
    ma: string[];      // MA线颜色（5/10/20/60）
    macd: {
      dif: string;
      dea: string;
      upBar: string;
      downBar: string;
    };
    kdj: {
      k: string;
      d: string;
      j: string;
    };
    rsi: string[];
    boll: {
      upper: string;
      mid: string;
      lower: string;
      fill: string;
    };
  };
}

// ==================== 主题定义 ====================

export const LIGHT_THEME: ChartTheme = {
  name: 'light',
  colors: {
    rise: '#EF4444',
    fall: '#22C55E',
    flat: '#6B7280',
    riseBg: '#FEF2F2',
    fallBg: '#F0FDF4',
    primary: '#3B82F6',
    secondary: '#8B5CF6',
    bg: '#FFFFFF',
    surface: '#F9FAFB',
    text: '#111827',
    textSecondary: '#6B7280',
    border: '#E5E7EB',
    grid: '#F3F4F6',
    axisLabel: '#9CA3AF',
    crosshair: '#374151',
    tooltip: 'rgba(17, 24, 39, 0.9)',
    tooltipText: '#FFFFFF',
  },
  candlestick: {
    upColor: '#EF4444',
    upBorderColor: '#EF4444',
    downColor: '#22C55E',
    downBorderColor: '#22C55E',
  },
  volume: {
    upColor: 'rgba(239, 68, 68, 0.5)',
    downColor: 'rgba(34, 197, 94, 0.5)',
  },
  indicators: {
    ma: ['#F59E0B', '#3B82F6', '#EC4899', '#8B5CF6'],
    macd: {
      dif: '#F59E0B',
      dea: '#3B82F6',
      upBar: '#EF4444',
      downBar: '#22C55E',
    },
    kdj: {
      k: '#F59E0B',
      d: '#3B82F6',
      j: '#EC4899',
    },
    rsi: ['#EF4444', '#F59E0B', '#3B82F6'],
    boll: {
      upper: '#EF4444',
      mid: '#3B82F6',
      lower: '#22C55E',
      fill: 'rgba(59, 130, 246, 0.05)',
    },
  },
};

export const DARK_THEME: ChartTheme = {
  name: 'dark',
  colors: {
    rise: '#EF4444',
    fall: '#22C55E',
    flat: '#9CA3AF',
    riseBg: 'rgba(239, 68, 68, 0.1)',
    fallBg: 'rgba(34, 197, 94, 0.1)',
    primary: '#60A5FA',
    secondary: '#A78BFA',
    bg: '#111827',
    surface: '#1F2937',
    text: '#F9FAFB',
    textSecondary: '#9CA3AF',
    border: '#374151',
    grid: '#1F2937',
    axisLabel: '#6B7280',
    crosshair: '#D1D5DB',
    tooltip: 'rgba(255, 255, 255, 0.95)',
    tooltipText: '#111827',
  },
  candlestick: {
    upColor: '#EF4444',
    upBorderColor: '#EF4444',
    downColor: '#22C55E',
    downBorderColor: '#22C55E',
  },
  volume: {
    upColor: 'rgba(239, 68, 68, 0.6)',
    downColor: 'rgba(34, 197, 94, 0.6)',
  },
  indicators: {
    ma: ['#FBBF24', '#60A5FA', '#F472B6', '#A78BFA'],
    macd: {
      dif: '#FBBF24',
      dea: '#60A5FA',
      upBar: '#EF4444',
      downBar: '#22C55E',
    },
    kdj: {
      k: '#FBBF24',
      d: '#60A5FA',
      j: '#F472B6',
    },
    rsi: ['#EF4444', '#FBBF24', '#60A5FA'],
    boll: {
      upper: '#EF4444',
      mid: '#60A5FA',
      lower: '#22C55E',
      fill: 'rgba(96, 165, 250, 0.05)',
    },
  },
};

// ==================== 主题管理器 ====================

class ChartThemeManager {
  private current: ChartTheme = LIGHT_THEME;
  private listeners: Set<(theme: ChartTheme) => void> = new Set();

  get(): ChartTheme {
    return this.current;
  }

  set(theme: ChartTheme): void {
    this.current = theme;
    this.listeners.forEach(fn => fn(theme));
  }

  subscribe(fn: (theme: ChartTheme) => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  detect(): 'light' | 'dark' {
    if (typeof window !== 'undefined') {
      const isDark = window.matchMedia?.('(prefers-color-scheme: dark)').matches;
      const dataTheme = document.documentElement.getAttribute('data-theme');
      if (dataTheme === 'dark' || (!dataTheme && isDark)) return 'dark';
    }
    return 'light';
  }

  autoDetect(): void {
    const mode = this.detect();
    this.set(mode === 'dark' ? DARK_THEME : LIGHT_THEME);
  }
}

export const chartThemeManager = new ChartThemeManager();

// ==================== 工具函数 ====================

/**
 * 获取当前主题的 ECharts 全局配置
 */
export function getEChartsThemeOption(): Record<string, any> {
  const theme = chartThemeManager.get();
  return {
    backgroundColor: 'transparent',
    textStyle: { color: theme.colors.text },
    title: { textStyle: { color: theme.colors.text } },
    legend: { textStyle: { color: theme.colors.textSecondary } },
    tooltip: {
      backgroundColor: theme.colors.tooltip,
      borderColor: theme.colors.border,
      textStyle: { color: theme.colors.tooltipText },
    },
    axisPointer: {
      lineStyle: { color: theme.colors.crosshair },
      crossStyle: { color: theme.colors.crosshair },
      label: { backgroundColor: theme.colors.tooltip },
    },
  };
}

/**
 * 生成 K线图标准配置
 */
export function getKLineChartTheme(isUp: boolean): {
  color: string;
  borderColor: string;
  itemStyle: { color: string; borderColor: string; borderWidth: number };
} {
  const theme = chartThemeManager.get();
  return {
    color: isUp ? theme.candlestick.upColor : theme.candlestick.downColor,
    borderColor: isUp ? theme.candlestick.upBorderColor : theme.candlestick.downBorderColor,
    itemStyle: {
      color: isUp ? theme.candlestick.upColor : theme.candlestick.downColor,
      borderColor: isUp ? theme.candlestick.upBorderColor : theme.candlestick.downBorderColor,
      borderWidth: 1,
    },
  };
}

/**
 * 获取MA均线颜色
 */
export function getMAColor(index: number): string {
  const theme = chartThemeManager.get();
  return theme.indicators.ma[index % theme.indicators.ma.length];
}
