import { describe, it, expect } from 'vitest';

// ===== 图表数据处理 =====
describe('Chart Data Processing', () => {
  interface OHLCV {
    date: string;
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
  }

  const calculateVWAP = (data: OHLCV[]): number[] => {
    let cumVolume = 0;
    let cumTPV = 0;
    return data.map(bar => {
      const tp = (bar.high + bar.low + bar.close) / 3;
      cumTPV += tp * bar.volume;
      cumVolume += bar.volume;
      return cumVolume > 0 ? cumTPV / cumVolume : 0;
    });
  };

  const resampleKLine = (data: OHLCV[], factor: number): OHLCV[] => {
    const result: OHLCV[] = [];
    for (let i = 0; i < data.length; i += factor) {
      const chunk = data.slice(i, i + factor);
      if (chunk.length === 0) continue;
      result.push({
        date: chunk[0].date,
        open: chunk[0].open,
        high: Math.max(...chunk.map(b => b.high)),
        low: Math.min(...chunk.map(b => b.low)),
        close: chunk[chunk.length - 1].close,
        volume: chunk.reduce((s, b) => s + b.volume, 0),
      });
    }
    return result;
  };

  const calculateVolumeProfile = (data: OHLCV[], bins: number = 10): { price: number; volume: number }[] => {
    const minPrice = Math.min(...data.map(b => b.low));
    const maxPrice = Math.max(...data.map(b => b.high));
    const binWidth = (maxPrice - minPrice) / bins;
    const profile = Array.from({ length: bins }, (_, i) => ({
      price: minPrice + binWidth * (i + 0.5),
      volume: 0,
    }));
    
    for (const bar of data) {
      const midPrice = (bar.high + bar.low) / 2;
      const binIndex = Math.min(Math.floor((midPrice - minPrice) / binWidth), bins - 1);
      if (binIndex >= 0) profile[binIndex].volume += bar.volume;
    }
    return profile;
  };

  const interpolateData = (data: number[], targetLength: number): number[] => {
    if (data.length === 0 || targetLength <= 0) return [];
    if (data.length === 1 || targetLength === 1) return [data[0]];
    const result: number[] = [];
    const ratio = (data.length - 1) / (targetLength - 1);
    for (let i = 0; i < targetLength; i++) {
      const idx = i * ratio;
      const floor = Math.floor(idx);
      const ceil = Math.min(floor + 1, data.length - 1);
      const frac = idx - floor;
      result.push(data[floor] * (1 - frac) + data[ceil] * frac);
    }
    return result;
  };

  const data: OHLCV[] = [
    { date: '2026-03-18', open: 100, high: 105, low: 98, close: 103, volume: 1e6 },
    { date: '2026-03-19', open: 103, high: 108, low: 102, close: 106, volume: 1.5e6 },
    { date: '2026-03-20', open: 106, high: 110, low: 104, close: 108, volume: 2e6 },
    { date: '2026-03-21', open: 108, high: 112, low: 106, close: 110, volume: 1.2e6 },
    { date: '2026-03-22', open: 110, high: 115, low: 108, close: 113, volume: 1.8e6 },
    { date: '2026-03-23', open: 113, high: 116, low: 111, close: 114, volume: 1.6e6 },
    { date: '2026-03-24', open: 114, high: 118, low: 112, close: 116, volume: 2.2e6 },
  ];

  it('应该计算VWAP', () => {
    const vwap = calculateVWAP(data);
    expect(vwap).toHaveLength(data.length);
    expect(vwap[0]).toBeGreaterThan(0);
    expect(Number.isFinite(vwap[0])).toBe(true);
  });

  it('应该重采样K线数据', () => {
    const resampled = resampleKLine(data, 2);
    expect(resampled.length).toBe(Math.ceil(data.length / 2));
    // 第一根合并了data[0]和data[1]
    expect(resampled[0].open).toBe(data[0].open);
    expect(resampled[0].high).toBe(Math.max(data[0].high, data[1].high));
    expect(resampled[0].close).toBe(data[1].close);
  });

  it('应该计算成交量分布', () => {
    const profile = calculateVolumeProfile(data, 5);
    expect(profile).toHaveLength(5);
    const totalVol = profile.reduce((s, p) => s + p.volume, 0);
    expect(totalVol).toBe(data.reduce((s, b) => s + b.volume, 0));
  });

  it('应该插值数据', () => {
    const result = interpolateData([0, 10, 20], 5);
    expect(result).toHaveLength(5);
    expect(result[0]).toBe(0);
    expect(result[4]).toBe(20);
    expect(result[2]).toBe(10);
  });

  it('应该处理空数据插值', () => {
    expect(interpolateData([], 10)).toEqual([]);
  });

  it('应该处理单点插值', () => {
    expect(interpolateData([42], 5)).toEqual([42]); // 单点无法插值，返回原始
  });

  it('应该重采样odd数据', () => {
    const oddData = data.slice(0, 3);
    const resampled = resampleKLine(oddData, 2);
    expect(resampled).toHaveLength(2);
  });

  it('应该处理factor=1重采样', () => {
    const resampled = resampleKLine(data, 1);
    expect(resampled).toHaveLength(data.length);
  });
});

// ===== 颜色系统 =====
describe('Color System', () => {
  const getChangeColor = (change: number, isAStock: boolean = true): string => {
    if (isAStock) {
      if (change > 0) return '#ff4d4f'; // 红涨
      if (change < 0) return '#52c41a'; // 绿跌
      return '#8c8c8c';
    } else {
      if (change > 0) return '#52c41a';
      if (change < 0) return '#ff4d4f';
      return '#8c8c8c';
    }
  };

  const hexToRgba = (hex: string, alpha: number): string => {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  };

  const blendColors = (color1: string, color2: string, ratio: number): string => {
    const r1 = parseInt(color1.slice(1, 3), 16);
    const g1 = parseInt(color1.slice(3, 5), 16);
    const b1 = parseInt(color1.slice(5, 7), 16);
    const r2 = parseInt(color2.slice(1, 3), 16);
    const g2 = parseInt(color2.slice(3, 5), 16);
    const b2 = parseInt(color2.slice(5, 7), 16);
    const r = Math.round(r1 * (1 - ratio) + r2 * ratio);
    const g = Math.round(g1 * (1 - ratio) + g2 * ratio);
    const b = Math.round(b1 * (1 - ratio) + b2 * ratio);
    return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
  };

  it('A股应该红涨绿跌', () => {
    expect(getChangeColor(5, true)).toBe('#ff4d4f');
    expect(getChangeColor(-5, true)).toBe('#52c41a');
    expect(getChangeColor(0, true)).toBe('#8c8c8c');
  });

  it('美股应该绿涨红跌', () => {
    expect(getChangeColor(5, false)).toBe('#52c41a');
    expect(getChangeColor(-5, false)).toBe('#ff4d4f');
  });

  it('应该转换hex到rgba', () => {
    expect(hexToRgba('#ff0000', 0.5)).toBe('rgba(255, 0, 0, 0.5)');
    expect(hexToRgba('#00ff00', 1)).toBe('rgba(0, 255, 0, 1)');
  });

  it('应该混合颜色', () => {
    expect(blendColors('#ff0000', '#0000ff', 0)).toBe('#ff0000');
    expect(blendColors('#ff0000', '#0000ff', 1)).toBe('#0000ff');
    expect(blendColors('#ff0000', '#0000ff', 0.5)).toBe('#800080');
  });
});

// ===== 响应式布局计算 =====
describe('Responsive Layout Calculations', () => {
  const getBreakpoint = (width: number): 'xs' | 'sm' | 'md' | 'lg' | 'xl' | 'xxl' => {
    if (width < 480) return 'xs';
    if (width < 576) return 'sm';
    if (width < 768) return 'md';
    if (width < 992) return 'lg';
    if (width < 1200) return 'xl';
    return 'xxl';
  };

  const getGridColumns = (breakpoint: string): number => {
    switch (breakpoint) {
      case 'xs': return 1;
      case 'sm': return 1;
      case 'md': return 2;
      case 'lg': return 3;
      case 'xl': return 4;
      case 'xxl': return 4;
      default: return 4;
    }
  };

  const calcSidebarWidth = (collapsed: boolean, breakpoint: string): number => {
    if (breakpoint === 'xs' || breakpoint === 'sm') return 0;
    return collapsed ? 64 : 240;
  };

  it('应该正确识别断点', () => {
    expect(getBreakpoint(375)).toBe('xs');
    expect(getBreakpoint(500)).toBe('sm');
    expect(getBreakpoint(700)).toBe('md');
    expect(getBreakpoint(900)).toBe('lg');
    expect(getBreakpoint(1100)).toBe('xl');
    expect(getBreakpoint(1400)).toBe('xxl');
  });

  it('应该根据断点计算列数', () => {
    expect(getGridColumns('xs')).toBe(1);
    expect(getGridColumns('md')).toBe(2);
    expect(getGridColumns('lg')).toBe(3);
    expect(getGridColumns('xxl')).toBe(4);
  });

  it('移动端应该隐藏侧边栏', () => {
    expect(calcSidebarWidth(false, 'xs')).toBe(0);
    expect(calcSidebarWidth(false, 'sm')).toBe(0);
  });

  it('桌面端应该显示侧边栏', () => {
    expect(calcSidebarWidth(false, 'lg')).toBe(240);
    expect(calcSidebarWidth(true, 'lg')).toBe(64);
  });

  it('应该处理边界值', () => {
    expect(getBreakpoint(479)).toBe('xs');
    expect(getBreakpoint(480)).toBe('sm');
    expect(getBreakpoint(767)).toBe('md');
    expect(getBreakpoint(768)).toBe('lg');
  });
});

// ===== 动画时序计算 =====
describe('Animation Timing', () => {
  const easeInOut = (t: number): number => t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
  const easeOut = (t: number): number => t * (2 - t);
  const easeIn = (t: number): number => t * t;
  const linear = (t: number): number => t;

  const animate = (from: number, to: number, progress: number, easing: (t: number) => number = easeInOut): number => {
    const t = Math.max(0, Math.min(1, progress));
    return from + (to - from) * easing(t);
  };

  const calcAnimationDuration = (distance: number, speed: number = 300): number => {
    return Math.max(100, Math.min(1000, distance / speed * 1000));
  };

  it('应该计算easeInOut', () => {
    expect(easeInOut(0)).toBe(0);
    expect(easeInOut(0.5)).toBe(0.5);
    expect(easeInOut(1)).toBe(1);
  });

  it('应该计算easeOut', () => {
    expect(easeOut(0)).toBe(0);
    expect(easeOut(1)).toBe(1);
    expect(easeOut(0.5)).toBe(0.75);
  });

  it('应该计算easeIn', () => {
    expect(easeIn(0)).toBe(0);
    expect(easeIn(1)).toBe(1);
    expect(easeIn(0.5)).toBe(0.25);
  });

  it('应该计算动画值', () => {
    expect(animate(0, 100, 0)).toBe(0);
    expect(animate(0, 100, 1)).toBe(100);
    expect(animate(0, 100, 0.5)).toBe(50);
  });

  it('应该钳制进度范围', () => {
    expect(animate(0, 100, -0.5)).toBe(0);
    expect(animate(0, 100, 1.5)).toBe(100);
  });

  it('应该计算动画时长', () => {
    expect(calcAnimationDuration(300)).toBe(1000);
    expect(calcAnimationDuration(100)).toBeCloseTo(333, 0);
    expect(calcAnimationDuration(0)).toBe(100); // 最小时长
  });
});

// ===== 数据表格虚拟化 =====
describe('Virtual List Calculations', () => {
  const calcVisibleRange = (
    scrollTop: number,
    containerHeight: number,
    itemHeight: number,
    totalItems: number,
    overscan: number = 5
  ): { start: number; end: number; offsetY: number } => {
    const start = Math.max(0, Math.floor(scrollTop / itemHeight) - overscan);
    const visibleCount = Math.ceil(containerHeight / itemHeight);
    const end = Math.min(totalItems, start + visibleCount + overscan * 2);
    return { start, end, offsetY: start * itemHeight };
  };

  it('应该计算初始可见范围', () => {
    const range = calcVisibleRange(0, 500, 40, 1000);
    expect(range.start).toBe(0);
    expect(range.end).toBeGreaterThan(0);
    expect(range.offsetY).toBe(0);
  });

  it('应该计算滚动后的可见范围', () => {
    const range = calcVisibleRange(4000, 500, 40, 1000);
    expect(range.start).toBeGreaterThan(0);
    expect(range.offsetY).toBe(range.start * 40);
  });

  it('应该处理边界情况', () => {
    const range = calcVisibleRange(0, 500, 40, 10);
    expect(range.end).toBeLessThanOrEqual(10);
  });

  it('应该包含overscan项', () => {
    const range = calcVisibleRange(400, 400, 40, 1000, 3);
    const visibleCount = Math.ceil(400 / 40);
    expect(range.end - range.start).toBeGreaterThanOrEqual(visibleCount);
  });

  it('应该处理总项数小于可见项数', () => {
    const range = calcVisibleRange(0, 1000, 40, 5);
    expect(range.end).toBe(5);
  });

  it('应该计算offsetY', () => {
    const range = calcVisibleRange(800, 400, 40, 1000);
    expect(range.offsetY).toBe(range.start * 40);
  });
});
