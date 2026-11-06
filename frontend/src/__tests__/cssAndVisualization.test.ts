/**
 * 生产绑定（M2 影子治理批次 40b）
 *
 * 绑定 import 与选型理由：
 * 1. utils/a11yEngine.ts:153 parseColor / :186 relativeLuminance / :197 calculateContrastRatio
 *    / :213 checkColorContrast — 唯一 WCAG 色彩实现。同名不同口径：该 parseColor 不解析 alpha、
 *    不认 rgba()（只认 #rgb/#rrggbb/rgb()），与上面 CSS Utility 段的内联 alpha 解析器契约不同，
 *    故内联段保留为规格、生产段单独覆盖真实契约。
 * 2. utils/customThemes.ts:61 PRESET_THEMES / :193 themeToCssVars — 主题单一来源与 CSS 变量生成器。
 * 3. styles/chart-theme.ts:10 CHART_COLORS — 图表色值单一来源（A股红涨绿跌）。
 * 4. utils/chartTheme.ts:109 LIGHT_THEME / :148 getKLineChartTheme — 图表主题兼容层；
 *    同名不同口径：styles/chart-theme.ts 是暗色静态常量，chartTheme.ts 是随 chartThemeManager 切换的主题对象。
 * 5. utils/correlationMatrix.ts:78 calculateCorrelation — 全库唯一导出的 Pearson 相关。
 * 6. utils/chartInteractionEngine.ts:86/95/126/147 createViewport/zoomViewport/panViewport/resetViewport
 *    — 唯一视口模型；其 minZoom=0.5，与下方 0.1 的 UI 规格缩放不同口径。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  parseColor as parseA11yColor,
  relativeLuminance,
  calculateContrastRatio,
  checkColorContrast,
} from '../utils/a11yEngine';
import { PRESET_THEMES, themeToCssVars } from '../utils/customThemes';
import { CHART_COLORS } from '../styles/chart-theme';
import { LIGHT_THEME, getKLineChartTheme } from '../utils/chartTheme';
import { calculateCorrelation } from '../utils/correlationMatrix';
import {
  createViewport,
  zoomViewport,
  panViewport,
  resetViewport,
} from '../utils/chartInteractionEngine';

// ===== CSS 工具函数 =====
// 生产无同契约导出：themeToCssVars 只生成主题变量块（--color-* 等），没有通用的
// cssVar(name,value) / cssVarRef(name) 导出；hexToRgba 与 colorMix 全库无导出；
// generateGradient 的渐变写死在 styles/design-system.css:94 变量里；
// responsiveValue 的生产版在 utils/responsiveUtils.ts:84，是 (width, 断点表) 查表契约。
// 下列函数保留为 CSS 规格内联。
describe('CSS Utility Functions', () => {
  const cssVar = (name: string, value: string): string => `--${name}: ${value};`;

  const cssVarRef = (name: string): string => `var(--${name})`;

  const hexToRgba = (hex: string, alpha: number): string => {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r},${g},${b},${alpha})`;
  };

  const parseColor = (color: string): { r: number; g: number; b: number; a: number } | null => {
    if (color.startsWith('#')) {
      const hex = color.slice(1);
      return {
        r: parseInt(hex.slice(0, 2), 16),
        g: parseInt(hex.slice(2, 4), 16),
        b: parseInt(hex.slice(4, 6), 16),
        a: 1,
      };
    }
    const rgbaMatch = color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/);
    if (rgbaMatch) {
      return {
        r: parseInt(rgbaMatch[1]),
        g: parseInt(rgbaMatch[2]),
        b: parseInt(rgbaMatch[3]),
        a: rgbaMatch[4] ? parseFloat(rgbaMatch[4]) : 1,
      };
    }
    return null;
  };

  const colorMix = (c1: string, c2: string, ratio: number): string => {
    const p1 = parseColor(c1);
    const p2 = parseColor(c2);
    if (!p1 || !p2) return c1;
    const r = Math.round(p1.r * (1 - ratio) + p2.r * ratio);
    const g = Math.round(p1.g * (1 - ratio) + p2.g * ratio);
    const b = Math.round(p1.b * (1 - ratio) + p2.b * ratio);
    return `rgb(${r},${g},${b})`;
  };

  const generateGradient = (colors: string[], direction: string = 'to right'): string => {
    return `linear-gradient(${direction}, ${colors.join(', ')})`;
  };

  const responsiveValue = (min: number, max: number, minVp: number, maxVp: number): string => {
    const slope = (max - min) / (maxVp - minVp);
    const yInt = min - slope * minVp;
    return `clamp(${min}px, ${yInt.toFixed(2)}px + ${(slope * 100).toFixed(2)}vw, ${max}px)`;
  };

  describe('CSS变量', () => {
    it('生成声明', () => {
      expect(cssVar('primary', '#3b82f6')).toBe('--primary: #3b82f6;');
    });

    it('生成引用', () => {
      expect(cssVarRef('primary')).toBe('var(--primary)');
    });

    it('嵌套引用', () => {
      expect(cssVarRef('theme-primary')).toBe('var(--theme-primary)');
    });
  });

  describe('颜色转换', () => {
    it('hex转rgba', () => {
      expect(hexToRgba('#ff0000', 0.5)).toBe('rgba(255,0,0,0.5)');
    });

    it('解析hex', () => {
      const c = parseColor('#3b82f6');
      expect(c?.r).toBe(59);
      expect(c?.g).toBe(130);
      expect(c?.b).toBe(246);
      expect(c?.a).toBe(1);
    });

    it('解析rgba', () => {
      const c = parseColor('rgba(255, 128, 0, 0.5)');
      expect(c?.r).toBe(255);
      expect(c?.g).toBe(128);
      expect(c?.a).toBe(0.5);
    });

    it('解析rgb', () => {
      const c = parseColor('rgb(100, 200, 50)');
      expect(c?.a).toBe(1);
    });

    it('无效颜色返回null', () => {
      expect(parseColor('invalid')).toBeNull();
    });

    it('颜色混合', () => {
      const mixed = colorMix('#000000', '#ffffff', 0.5);
      expect(mixed).toBe('rgb(128,128,128)');
    });

    it('混合ratio=0返回第一个', () => {
      expect(colorMix('#ff0000', '#0000ff', 0)).toBe('rgb(255,0,0)');
    });

    it('混合ratio=1返回第二个', () => {
      expect(colorMix('#ff0000', '#0000ff', 1)).toBe('rgb(0,0,255)');
    });
  });

  describe('渐变生成', () => {
    it('双色渐变', () => {
      expect(generateGradient(['#ff0000', '#0000ff'])).toBe('linear-gradient(to right, #ff0000, #0000ff)');
    });

    it('自定义方向', () => {
      expect(generateGradient(['#ff0000', '#0000ff'], 'to bottom')).toBe('linear-gradient(to bottom, #ff0000, #0000ff)');
    });

    it('多色渐变', () => {
      const g = generateGradient(['#ff0000', '#ffff00', '#00ff00']);
      expect(g).toContain('#ff0000');
      expect(g).toContain('#00ff00');
    });
  });

  describe('响应式值', () => {
    it('生成clamp表达式', () => {
      const val = responsiveValue(16, 24, 320, 1200);
      expect(val).toContain('clamp');
      expect(val).toContain('16px');
      expect(val).toContain('24px');
    });

    it('包含vw单位', () => {
      const val = responsiveValue(14, 20, 375, 1440);
      expect(val).toContain('vw');
    });
  });
});

// ===== 无障碍色彩（生产绑定）=====
// 绑定生产：utils/a11yEngine.ts:153/186/197/213
describe('无障碍色彩（生产 a11yEngine）', () => {
  it('解析两位hex且不含alpha通道', () => {
    expect(parseA11yColor('#3b82f6')).toEqual({ r: 59, g: 130, b: 246 });
  });

  it('解析三位短hex', () => {
    expect(parseA11yColor('#fff')).toEqual({ r: 255, g: 255, b: 255 });
  });

  it('解析rgb函数式', () => {
    expect(parseA11yColor('rgb(100, 200, 50)')).toEqual({ r: 100, g: 200, b: 50 });
  });

  it('不解析rgba（生产正则只认rgb）', () => {
    // 生产真实行为：parseColor 无 alpha 概念，rgba() 不匹配任何分支 → null。
    expect(parseA11yColor('rgba(255, 128, 0, 0.5)')).toBeNull();
  });

  it('无效颜色返回null', () => {
    expect(parseA11yColor('invalid')).toBeNull();
  });

  it('相对亮度黑白基准', () => {
    expect(relativeLuminance(255, 255, 255)).toBe(1);
    expect(relativeLuminance(0, 0, 0)).toBe(0);
  });

  it('黑白对比度为21', () => {
    expect(calculateContrastRatio('#000000', '#ffffff')).toBe(21);
  });

  it('同色对比度为1', () => {
    expect(calculateContrastRatio('#777777', '#777777')).toBe(1);
  });

  it('WCAG AA/AAA 判定', () => {
    const result = checkColorContrast('#000000', '#ffffff');
    expect(result.ratio).toBe(21);
    expect(result.passes.AA_normal).toBe(true);
    expect(result.passes.AAA_normal).toBe(true);
  });
});

// ===== 数据可视化辅助 =====
describe('Data Visualization Helpers', () => {
  // 生产无同契约导出：normalizeToRange / calculatePercentiles / generateAxisTicks /
  // formatAxisLabel / interpolateData / generateColorPalette 均无导出实现
  // （monteCarloEngine.ts:351 的 calculatePercentiles 未导出且入参是 pcts 数组；
  //  dataTransformUtils.ts:52 formatVolume 固定 2 位小数并带「手」后缀，且无 price/percent 分支；
  //  indicatorOverlayEngine.ts:245 interpolateAtTimestamp 按时间戳插值）。
  // 保留内联规格；calculateCorrelation 见下方生产绑定。
  const normalizeToRange = (values: number[], min: number = 0, max: number = 100): number[] => {
    if (values.length === 0) return [];
    const dataMin = Math.min(...values);
    const dataMax = Math.max(...values);
    if (dataMin === dataMax) return values.map(() => (min + max) / 2);
    return values.map(v => min + ((v - dataMin) / (dataMax - dataMin)) * (max - min));
  };

  const calculatePercentiles = (values: number[]): { p25: number; p50: number; p75: number; p90: number; p95: number } => {
    const sorted = [...values].sort((a, b) => a - b);
    if (sorted.length === 1) return { p25: sorted[0], p50: sorted[0], p75: sorted[0], p90: sorted[0], p95: sorted[0] };
    const percentile = (p: number) => {
      const idx = (p / 100) * (sorted.length - 1);
      const lower = Math.floor(idx);
      const frac = idx - lower;
      const upper = Math.min(lower + 1, sorted.length - 1);
      return sorted[lower] + (sorted[upper] - sorted[lower]) * frac;
    };
    return {
      p25: percentile(25),
      p50: percentile(50),
      p75: percentile(75),
      p90: percentile(90),
      p95: percentile(95),
    };
  };

  const generateAxisTicks = (min: number, max: number, count: number = 5): number[] => {
    if (count <= 1) return [min];
    const step = (max - min) / (count - 1);
    return Array.from({ length: count }, (_, i) => Math.round((min + step * i) * 100) / 100);
  };

  const formatAxisLabel = (value: number, type: 'price' | 'volume' | 'percent'): string => {
    switch (type) {
      case 'price': return value.toFixed(2);
      case 'volume':
        if (value >= 1e8) return (value / 1e8).toFixed(1) + '亿';
        if (value >= 1e4) return (value / 1e4).toFixed(1) + '万';
        return value.toString();
      case 'percent': return value.toFixed(1) + '%';
    }
  };

  const interpolateData = (data: (number | null)[]): number[] => {
    if (data.length === 0) return [];
    const result = [...data] as number[];
    for (let i = 0; i < result.length; i++) {
      if (result[i] === null) {
        let nextValid = i + 1;
        while (nextValid < result.length && result[nextValid] === null) nextValid++;
        if (nextValid < result.length) {
          const gap = nextValid - i + 1;
          for (let j = i; j < nextValid; j++) {
            result[j] = result[i - 1] + (result[nextValid] - result[i - 1]) * ((j - i + 1) / gap);
          }
        } else {
          for (let j = i; j < result.length; j++) result[j] = result[i - 1];
        }
      }
    }
    return result;
  };

  const generateColorPalette = (count: number): string[] => {
    const palette = ['#3b82f6', '#ef4444', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16', '#f97316', '#6366f1'];
    if (count <= palette.length) return palette.slice(0, count);
    const result = [...palette];
    for (let i = palette.length; i < count; i++) {
      const hue = (i * 137.5) % 360;
      result.push(`hsl(${hue}, 70%, 50%)`);
    }
    return result;
  };

  describe('归一化', () => {
    it('应映射到0-100', () => {
      const result = normalizeToRange([10, 20, 30], 0, 100);
      expect(result[0]).toBe(0);
      expect(result[2]).toBe(100);
    });

    it('全相同值返回中间值', () => {
      const result = normalizeToRange([5, 5, 5], 0, 100);
      expect(result.every(v => v === 50)).toBe(true);
    });

    it('空数组返回空', () => {
      expect(normalizeToRange([])).toEqual([]);
    });

    it('单值返回中间值', () => {
      expect(normalizeToRange([10])).toEqual([50]);
    });

    it('自定义范围', () => {
      const result = normalizeToRange([0, 100], 0, 10);
      expect(result).toEqual([0, 10]);
    });
  });

  describe('百分位', () => {
    it('p50应为中位数', () => {
      const p = calculatePercentiles([1, 2, 3, 4, 5]);
      expect(p.p50).toBe(3);
    });

    it('p25应为四分之一', () => {
      const p = calculatePercentiles([1, 2, 3, 4, 5]);
      expect(p.p25).toBe(2);
    });

    it('p75应为四分之三', () => {
      const p = calculatePercentiles([1, 2, 3, 4, 5]);
      expect(p.p75).toBe(4);
    });

    it('单值所有百分位相同', () => {
      const p = calculatePercentiles([10]);
      expect(p.p25).toBe(10);
      expect(p.p50).toBe(10);
    });
  });

  describe('坐标轴刻度', () => {
    it('应生成指定数量', () => {
      expect(generateAxisTicks(0, 100, 5).length).toBe(5);
    });

    it('首尾应正确', () => {
      const ticks = generateAxisTicks(0, 100, 5);
      expect(ticks[0]).toBe(0);
      expect(ticks[4]).toBe(100);
    });

    it('count=1返回最小值', () => {
      expect(generateAxisTicks(10, 20, 1)).toEqual([10]);
    });
  });

  describe('坐标标签格式化', () => {
    it('价格格式', () => {
      expect(formatAxisLabel(18.5, 'price')).toBe('18.50');
    });

    it('成交量亿级', () => {
      expect(formatAxisLabel(150000000, 'volume')).toContain('亿');
    });

    it('成交量万级', () => {
      expect(formatAxisLabel(50000, 'volume')).toContain('万');
    });

    it('百分比格式', () => {
      expect(formatAxisLabel(3.456, 'percent')).toBe('3.5%');
    });
  });

  describe('数据插值', () => {
    it('应填充null值', () => {
      const data = [1, null, null, 4] as (number | null)[];
      const result = interpolateData(data);
      expect(result.every(v => typeof v === 'number')).toBe(true);
    });

    it('首尾应保持', () => {
      const data = [1, null, 3] as (number | null)[];
      const result = interpolateData(data);
      expect(result[0]).toBe(1);
      expect(result[2]).toBe(3);
    });

    it('空数据返回空', () => {
      expect(interpolateData([])).toEqual([]);
    });

    it('无null值不变', () => {
      const data = [1, 2, 3];
      expect(interpolateData(data)).toEqual([1, 2, 3]);
    });
  });

  // 绑定生产：utils/correlationMatrix.ts:78 calculateCorrelation
  // 口径差异：生产对长度不匹配按 min 长度截断计算（分母仍用整列标准差），
  // 不是「长度不等直接返回0」；旧断言错在把 0 当成等长校验的返回值。
  // 本段不匹配用例截断后 n<2，结果同为 0，仅作回归护栏。
  describe('相关性计算', () => {
    it('完全正相关', () => {
      expect(calculateCorrelation([1, 2, 3], [10, 20, 30])).toBeCloseTo(1, 5);
    });

    it('完全负相关', () => {
      expect(calculateCorrelation([1, 2, 3], [30, 20, 10])).toBeCloseTo(-1, 5);
    });

    it('不相关', () => {
      expect(calculateCorrelation([1, 2, 3, 4], [1, 3, 2, 4])).toBeCloseTo(0.4, 0);
    });

    it('空数据返回0', () => {
      expect(calculateCorrelation([], [])).toBe(0);
    });

    it('长度不匹配返回0', () => {
      expect(calculateCorrelation([1, 2], [1])).toBe(0);
    });
  });

  describe('调色板生成', () => {
    it('小数量使用预设色', () => {
      expect(generateColorPalette(5).length).toBe(5);
    });

    it('大数量扩展', () => {
      expect(generateColorPalette(20).length).toBe(20);
    });

    it('每个颜色都是有效的hex或hsl', () => {
      const colors = generateColorPalette(10);
      colors.forEach(c => {
        expect(c.startsWith('#') || c.startsWith('hsl')).toBe(true);
      });
    });
  });
});

// ===== 图表主题（生产绑定）=====
// 绑定生产：styles/chart-theme.ts:10 CHART_COLORS、utils/chartTheme.ts:109/148、
//           utils/customThemes.ts:61/193
describe('图表主题（生产口径）', () => {
  it('A股红涨绿跌色值', () => {
    expect(CHART_COLORS.up).toBe('#cf2a2a');
    expect(CHART_COLORS.down).toBe('#1db468');
    expect(CHART_COLORS.flat).toBe('#64748b');
  });

  it('MA 色复用强调色', () => {
    expect(CHART_COLORS.ma5).toBe(CHART_COLORS.gold);
    expect(CHART_COLORS.ma10).toBe(CHART_COLORS.accent);
  });

  it('K线主题随涨跌方向取色', () => {
    const rise = getKLineChartTheme(true);
    const fall = getKLineChartTheme(false);
    expect(rise.color).toBe(LIGHT_THEME.rise);
    expect(rise.itemStyle.color0).toBe(LIGHT_THEME.fall);
    expect(fall.color).toBe(LIGHT_THEME.fall);
  });

  it('亮色主题涨跌基准色', () => {
    expect(LIGHT_THEME.rise).toBe('#EF4444');
    expect(LIGHT_THEME.fall).toBe('#22C55E');
  });

  it('预设主题齐全', () => {
    expect(PRESET_THEMES).toHaveLength(5);
    expect(PRESET_THEMES.map(t => t.id)).toEqual(['light', 'dark', 'trading', 'nature', 'warm']);
  });

  it('主题转CSS变量块', () => {
    const css = themeToCssVars(PRESET_THEMES[0]);
    expect(css.startsWith(':root {')).toBe(true);
    expect(css.endsWith('}')).toBe(true);
    expect(css).toContain('--color-primary: #1890ff;');
    expect(css).toContain('--chart-ma5: #faad14;');
    expect(css).toContain('--font-md: 14px;');
    expect(css).toContain('--space-xs: 4px;');
    expect(css).toContain('--border-radius: 6px;');
  });

  it('按传入主题生成变量', () => {
    expect(themeToCssVars(PRESET_THEMES[1])).toContain('--color-background: #141414;');
  });
});

// ===== 图表交互状态管理 =====
// 生产无同契约 reducer：交互引擎用 ChartViewport(xMin/xMax/yMin/yMax/zoom) 视口模型，
// 没有 selectedRange / crosshair / panOffset 这套 UI 状态 reducer。本段保留为交互规格。
// 注意同名不同口径：本段 zoom 夹取 [0.1, 10]，生产 zoomViewport 夹取 [0.5, 10]（见下方生产段）。
describe('Chart Interaction State', () => {
  interface ChartState {
    zoom: number;
    panOffset: number;
    selectedRange: { start: number; end: number } | null;
    crosshair: { x: number; y: number } | null;
    isDragging: boolean;
  }

  const createInitialState = (): ChartState => ({
    zoom: 1,
    panOffset: 0,
    selectedRange: null,
    crosshair: null,
    isDragging: false,
  });

  const zoomIn = (state: ChartState, factor: number = 1.2): ChartState => ({
    ...state,
    zoom: Math.min(state.zoom * factor, 10),
  });

  const zoomOut = (state: ChartState, factor: number = 1.2): ChartState => ({
    ...state,
    zoom: Math.max(state.zoom / factor, 0.1),
  });

  const pan = (state: ChartState, delta: number): ChartState => ({
    ...state,
    panOffset: state.panOffset + delta,
  });

  const selectRange = (state: ChartState, start: number, end: number): ChartState => ({
    ...state,
    selectedRange: { start: Math.min(start, end), end: Math.max(start, end) },
  });

  const clearSelection = (state: ChartState): ChartState => ({
    ...state,
    selectedRange: null,
  });

  const setCrosshair = (state: ChartState, x: number, y: number): ChartState => ({
    ...state,
    crosshair: { x, y },
  });

  const resetChart = (): ChartState => createInitialState();

  describe('初始状态', () => {
    it('zoom应为1', () => {
      expect(createInitialState().zoom).toBe(1);
    });

    it('无选区', () => {
      expect(createInitialState().selectedRange).toBeNull();
    });

    it('无十字光标', () => {
      expect(createInitialState().crosshair).toBeNull();
    });
  });

  describe('缩放', () => {
    it('放大增加zoom', () => {
      const state = zoomIn(createInitialState());
      expect(state.zoom).toBeCloseTo(1.2, 1);
    });

    it('缩小减少zoom', () => {
      const state = zoomOut(createInitialState());
      expect(state.zoom).toBeLessThan(1);
    });

    it('最大缩放10倍', () => {
      let state = createInitialState();
      for (let i = 0; i < 20; i++) state = zoomIn(state);
      expect(state.zoom).toBe(10);
    });

    it('最小缩放0.1', () => {
      let state = createInitialState();
      for (let i = 0; i < 20; i++) state = zoomOut(state);
      expect(state.zoom).toBe(0.1);
    });
  });

  describe('平移', () => {
    it('正偏移', () => {
      expect(pan(createInitialState(), 100).panOffset).toBe(100);
    });

    it('负偏移', () => {
      expect(pan(createInitialState(), -50).panOffset).toBe(-50);
    });

    it('累加偏移', () => {
      const state = pan(pan(createInitialState(), 100), 50);
      expect(state.panOffset).toBe(150);
    });
  });

  describe('选区', () => {
    it('选择范围', () => {
      const state = selectRange(createInitialState(), 10, 20);
      expect(state.selectedRange).toEqual({ start: 10, end: 20 });
    });

    it('自动排序起止', () => {
      const state = selectRange(createInitialState(), 20, 10);
      expect(state.selectedRange?.start).toBe(10);
      expect(state.selectedRange?.end).toBe(20);
    });

    it('清除选区', () => {
      const state = clearSelection(selectRange(createInitialState(), 10, 20));
      expect(state.selectedRange).toBeNull();
    });
  });

  describe('十字光标', () => {
    it('设置位置', () => {
      const state = setCrosshair(createInitialState(), 100, 50);
      expect(state.crosshair).toEqual({ x: 100, y: 50 });
    });

    it('更新位置', () => {
      const state = setCrosshair(setCrosshair(createInitialState(), 100, 50), 200, 75);
      expect(state.crosshair).toEqual({ x: 200, y: 75 });
    });
  });

  describe('重置', () => {
    it('应恢复初始状态', () => {
      let state = zoomIn(pan(selectRange(createInitialState(), 10, 20), 100));
      state = resetChart();
      expect(state.zoom).toBe(1);
      expect(state.panOffset).toBe(0);
      expect(state.selectedRange).toBeNull();
    });
  });

  describe('组合操作', () => {
    it('放大+平移', () => {
      const state = pan(zoomIn(createInitialState()), 50);
      expect(state.zoom).toBeCloseTo(1.2, 1);
      expect(state.panOffset).toBe(50);
    });

    it('缩放+选区+光标', () => {
      const state = setCrosshair(selectRange(zoomIn(createInitialState()), 5, 15), 100, 200);
      expect(state.zoom).toBeCloseTo(1.2, 1);
      expect(state.selectedRange).toEqual({ start: 5, end: 15 });
      expect(state.crosshair).toEqual({ x: 100, y: 200 });
    });
  });
});

// ===== 视口缩放与平移（生产绑定）=====
// 绑定生产：utils/chartInteractionEngine.ts:86 createViewport / :95 zoomViewport /
//           :126 panViewport / :147 resetViewport
describe('视口缩放与平移（生产口径）', () => {
  it('createViewport 初始 zoom 为1', () => {
    expect(createViewport(0, 100, 0, 100).zoom).toBe(1);
  });

  it('zoomViewport 上限10倍', () => {
    const viewport = zoomViewport(createViewport(0, 100, 0, 100), 20, { x: 50, y: 50 });
    expect(viewport.zoom).toBe(10);
  });

  it('zoomViewport 下限0.5倍', () => {
    // 与上面 UI 规格段的 0.1 不同：生产 DEFAULT_CONFIG.minZoom = 0.5。
    const viewport = zoomViewport(createViewport(0, 100, 0, 100), 0.01, { x: 50, y: 50 });
    expect(viewport.zoom).toBe(0.5);
  });

  it('以 center 为中心缩放', () => {
    const viewport = zoomViewport(createViewport(0, 100, 0, 100), 2, { x: 50, y: 50 });
    expect(viewport.xMin).toBeCloseTo(25, 5);
    expect(viewport.xMax).toBeCloseTo(75, 5);
    expect(viewport.yMin).toBeCloseTo(25, 5);
    expect(viewport.yMax).toBeCloseTo(75, 5);
  });

  it('panViewport 平移范围不动 zoom', () => {
    const viewport = panViewport(createViewport(0, 100, 0, 100), 10, -5);
    expect(viewport.xMin).toBe(10);
    expect(viewport.xMax).toBe(110);
    expect(viewport.yMin).toBe(-5);
    expect(viewport.yMax).toBe(95);
    expect(viewport.zoom).toBe(1);
  });

  it('resetViewport 恢复 zoom 并保留范围', () => {
    const zoomed = { ...createViewport(0, 200, 10, 90), zoom: 4 };
    const reset = resetViewport(zoomed);
    expect(reset.zoom).toBe(1);
    expect(reset.xMax).toBe(200);
    expect(reset.yMin).toBe(10);
  });
});

// ===== 设计系统 token 完整性（P0a）=====
// 设计系统审计发现 12 个变量「已使用但未定义」，浏览器会回退到初始值或空字符串，
// 暗色/浅色下都可能出现透明底、默认黑字。这里直接读 CSS 源文件锁定定义，防止再次漂移。
const designSystemCss = readFileSync(
  resolve(process.cwd(), 'src/styles/design-system.css'),
  'utf8',
);

describe('设计系统 token 完整性（P0a）', () => {
  const requiredTokens = [
    '--accent',
    '--bg-card',
    '--bg-page',
    '--bg-surface',
    '--border',
    '--color-bg-secondary',
    '--color-error',
    '--color-error-bg',
    '--color-highlight',
    '--text-disabled',
    '--text-muted',
    '--theme-primary',
  ];

  it.each(requiredTokens)('%s 已在 :root 定义', (token) => {
    expect(designSystemCss).toMatch(new RegExp(`${token}\\s*:`));
  });

  it('不再引用未定义的 --text', () => {
    expect(designSystemCss).not.toMatch(/var\(--text\)/);
  });

  it('浅色主题覆盖错误底色，避免沿用暗色高不透明度', () => {
    const lightBlock = designSystemCss.slice(designSystemCss.indexOf('[data-theme="light"]'));
    expect(lightBlock).toContain('--color-error-bg: rgba(244, 63, 94, 0.08)');
  });
});

// ===== 三页试点主题收口（P0a 续）=====
// 这组断言只锁「已经修掉的硬编码」与「必须使用设计令牌的关键位置」，不做全仓 hex 禁令：
// ECharts canvas、固定深色 tooltip、温度仪表盘等仍有合法 hex。
const readPilotFile = (relative: string): string =>
  readFileSync(resolve(process.cwd(), 'src', relative), 'utf8');

describe('三页试点主题收口', () => {
it('股票列表：统计卡、表头、涨跌胶囊不再硬编码浅色', () => {
  const src = readPilotFile('pages/StockListPage.tsx');
  expect(src).toContain("background: 'var(--bg-primary)'");
  expect(src).toContain('var(--color-up-bg)');
  expect(src).toContain('var(--color-down-bg)');
  expect(src).toContain("v > 0 ? '+' : ''");
  expect(src).not.toContain('#fafafa');
  expect(src).not.toContain('#eff6ff');
  expect(src).not.toContain("color={v >= 0 ? 'red' : 'green'}");
});

it('资金流向：暗色卡片改为令牌，0 值走中性色', () => {
  const src = readPilotFile('components/Market/CapitalFlowPanel.tsx');
  expect(src).toContain("background: 'var(--bg-secondary)'");
  expect(src).toContain('flowColor');
  expect(src).toContain('flowColor(retailNetFlow)');
  expect(src).toContain("value > 0 ? 'var(--color-up)' : value < 0 ? 'var(--color-down)' : 'var(--text-secondary)'");
  for (const legacy of ['#1a1a2e', '#e74c3c', '#2ecc71', '#94a3b8', '#3498db', '#2d2d44']) {
    expect(src).not.toContain(legacy);
  }
});

it('市场宽度：红涨绿跌与警示色改为令牌', () => {
  const src = readPilotFile('components/Market/MarketBreadthSection.tsx');
  expect(src).toContain("const COLOR_UP = 'var(--color-up)'");
  expect(src).toContain("const COLOR_DOWN = 'var(--color-down)'");
  expect(src).toContain("const WARN = 'var(--color-warning)'");
});

it('数据源角标：不再拼接 hex 透明度', () => {
  const src = readPilotFile('components/discover/DataSourceIndicator.tsx');
  expect(src).toContain("background: cfg.bg");
  expect(src).not.toContain("cfg.color + '1f'");
  expect(src).not.toContain("accent + '1a'");
});

it('antd：Alert 的 preset 背景显式映射到主题令牌', () => {
  const src = readPilotFile('components/Common/ThemeProvider.tsx');
  expect(src).toContain('colorWarningBg: warningBg');
  expect(src).toContain('colorErrorBg: errorBg');
  expect(src).toContain('colorSuccessBg: downBg');
  expect(src).toContain('colorInfoBg: accentLight');
});

it('三级文字与警示色不再使用低对比度值', () => {
  const lightAt = designSystemCss.indexOf('[data-theme="light"]');
  const darkBlock = designSystemCss.slice(0, lightAt);
  const lightBlock = designSystemCss.slice(lightAt);
  // 暗色 #5a6478 在 #161b26 卡片上仅 2.90:1；#7b8598 为 4.64:1。
  expect(darkBlock).toContain('--text-tertiary: #7b8598');
  // 亮色 #8b90a0 在 #f8f9fc 上仅 3.02:1；#6b7280 为 4.83:1。
  expect(lightBlock).toContain('--text-tertiary: #6b7280');
  // 亮色 #d97706 在近白底上约 3.3:1；#b45309 约 4.9:1。
  expect(lightBlock).toContain('--color-warning: #b45309');
  // 亮色正文/按钮底 #3b82f6 仅 3.49–3.68:1；#2563eb 为 5.17:1。
  expect(lightBlock).toContain('--accent-solid: #2563eb');
  // 亮色 #16a34a 在近白底仅 3.13:1；#15803d 为 5.02:1。
  expect(lightBlock).toContain('--color-down: #15803d');
  // AI 解读强调文字旧 #60a5fa 仅 2.41:1。
  expect(lightBlock).toContain('--color-highlight: #2563eb');
  // 亮色错误红 #f43f5e 仅 3.49:1；#be123c 为 6.4:1。
  expect(lightBlock).toContain('--color-error: #be123c');
  // 暗色 #3b82f6 配白字仅 3.68:1，实心主色按钮改用深色字（5.15:1）。
  expect(designSystemCss.slice(0, lightAt)).toContain('--text-on-accent: #0d1117');
  expect(lightBlock).toContain('--text-on-accent: #ffffff');
  // antd preset 绿/金/橙标签在亮色下文字加深
  expect(designSystemCss).toContain('[data-theme="light"] .ant-tag-green');
  expect(designSystemCss).toContain('[data-theme="light"] .ant-tag-gold');
  expect(designSystemCss).toContain('[data-theme="light"] .ant-tag-orange');
});

it('多信号面板与首页维度角标：颜色全部走令牌', () => {
  const panel = readPilotFile('components/AI/MultiSignalPanel.tsx');
  expect(panel).toContain("color: 'var(--color-down)'");
  expect(panel).toContain("color: 'var(--color-up)'");
  expect(panel).toContain("color: 'var(--color-warning)'");
  expect(panel).not.toMatch(/#(22c55e|ef4444|f59e0b|3b82f6)/);
  expect(panel).not.toContain('rgba(255,255,255,0.06)');
  const discover = readPilotFile('pages/DiscoverPage.tsx');
  expect(discover).toContain('getDimTone');
  expect(discover).not.toContain('getDimBg');
  expect(discover).not.toContain('getDimBorder');
});

it('情绪标签与估值分位标签：实心底/浅灰底不再造成低对比', () => {
  const sentiment = readPilotFile('components/Market/MarketSentiment.tsx');
  expect(sentiment).not.toContain("color: '#1890ff'");
  expect(sentiment).not.toContain('color={sentiment.color}');
  expect(sentiment).toContain('borderColor: sentiment.color');
  const valuation = readPilotFile('components/valuation/ValuationPanel.tsx');
  expect(valuation).toContain("color: 'var(--color-up)'");
  expect(valuation).toContain("color: 'var(--color-down)'");
  expect(valuation).not.toContain('#1db468');
  const breadth = readPilotFile('components/Market/MarketBreadthSection.tsx');
  expect(breadth).toContain("color: 'var(--text-inverse)'");
  const provider = readPilotFile('components/Common/ThemeProvider.tsx');
  expect(provider).toContain('colorTextLightSolid: textOnAccent');
});

it('平板 768：布局子项与信号来源标签不会把页面撑出视口', () => {
  const layout = readPilotFile('components/Layout/AppLayout.tsx');
  expect(layout).toContain('min-width: 0;');
  const detail = readPilotFile('pages/StockDetailPage.tsx');
  // md 断点下三列并排会挤爆 768；改为 992 以下堆叠
  expect(detail).not.toContain('<Col xs={24} md={6}>');
  expect(detail).toContain('<Col xs={24} lg={6}>');
  expect(detail).toContain('<Col xs={24} lg={9}>');
  const panel = readPilotFile('components/AI/MultiSignalPanel.tsx');
  expect(panel).toContain("maxWidth: '64%'");
  expect(panel).toContain("overflowWrap: 'anywhere'");
});

it('个股详情：AI 评分与维度卡不再写死涨跌色/暗色底', () => {
  const src = readPilotFile('pages/StockDetailPage.tsx');
  expect(src).toContain('scoreTone');
  expect(src).toContain("background: 'var(--bg-secondary)'");
  expect(src).not.toContain('#22c55e');
  expect(src).not.toContain("rgba(15,23,42,0.5)");
});
});
