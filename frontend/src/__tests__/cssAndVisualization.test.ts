import { describe, it, expect } from 'vitest';

// ===== CSS 工具函数 =====
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

// ===== 数据可视化辅助 =====
describe('Data Visualization Helpers', () => {
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
    let lastValid = 0;
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
      lastValid = i;
    }
    return result;
  };

  const calculateCorrelation = (x: number[], y: number[]): number => {
    const n = x.length;
    if (n < 2 || n !== y.length) return 0;
    const meanX = x.reduce((a, b) => a + b, 0) / n;
    const meanY = y.reduce((a, b) => a + b, 0) / n;
    let num = 0, denX = 0, denY = 0;
    for (let i = 0; i < n; i++) {
      const dx = x[i] - meanX, dy = y[i] - meanY;
      num += dx * dy;
      denX += dx * dx;
      denY += dy * dy;
    }
    const den = Math.sqrt(denX * denY);
    return den === 0 ? 0 : num / den;
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

// ===== 图表交互状态管理 =====
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
