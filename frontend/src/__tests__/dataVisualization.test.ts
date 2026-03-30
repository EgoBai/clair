import { describe, it, expect } from 'vitest';

// 数据可视化工具测试
describe('Data Visualization Utilities', () => {
  // 颜色渐变计算
  const interpolateColor = (start: string, end: string, ratio: number): string => {
    const parseHex = (hex: string) => {
      const h = hex.replace('#', '');
      return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
    };
    const toHex = (r: number, g: number, b: number) =>
      '#' + [r, g, b].map(c => Math.round(Math.max(0, Math.min(255, c))).toString(16).padStart(2, '0')).join('');
    const [r1, g1, b1] = parseHex(start);
    const [r2, g2, b2] = parseHex(end);
    const r = Math.min(1, Math.max(0, ratio));
    return toHex(r1 + (r2 - r1) * r, g1 + (g2 - g1) * r, b1 + (b2 - b1) * r);
  };

  // 坐标轴刻度计算
  const calcAxisTicks = (min: number, max: number, tickCount: number = 5): number[] => {
    if (min >= max || tickCount < 2) return [min];
    const range = max - min;
    const roughStep = range / (tickCount - 1);
    const magnitude = Math.pow(10, Math.floor(Math.log10(roughStep)));
    const candidates = [1, 2, 5, 10].map(m => m * magnitude);
    const step = candidates.find(c => c >= roughStep) || candidates[candidates.length - 1];
    const ticks: number[] = [];
    let tick = Math.floor(min / step) * step;
    while (tick <= max + step * 0.01) {
      ticks.push(+tick.toFixed(10));
      tick += step;
    }
    return ticks;
  };

  // 图例颜色分配
  const assignColors = (items: string[], palette: string[]): Record<string, string> => {
    const result: Record<string, string> = {};
    items.forEach((item, i) => {
      result[item] = palette[i % palette.length];
    });
    return result;
  };

  // Tooltip 格式化
  const formatTooltipValue = (value: number, unit: string): string => {
    if (unit === 'percent') return `${(value * 100).toFixed(2)}%`;
    if (unit === 'billion') {
      if (Math.abs(value) >= 1e8) return (value / 1e8).toFixed(2) + '亿';
      if (Math.abs(value) >= 1e4) return (value / 1e4).toFixed(2) + '万';
      return value.toFixed(0);
    }
    if (unit === 'price') return value.toFixed(2);
    return String(value);
  };

  // 数据点到像素坐标
  const dataToPixel = (value: number, min: number, max: number, pixelRange: [number, number]): number => {
    if (max === min) return (pixelRange[0] + pixelRange[1]) / 2;
    const ratio = (value - min) / (max - min);
    return pixelRange[0] + ratio * (pixelRange[1] - pixelRange[0]);
  };

  // 像素到数据坐标
  const pixelToData = (pixel: number, min: number, max: number, pixelRange: [number, number]): number => {
    const range = pixelRange[1] - pixelRange[0];
    if (range === 0) return min;
    const ratio = (pixel - pixelRange[0]) / range;
    return min + ratio * (max - min);
  };

  // 柱状图宽度计算
  const calcBarWidth = (containerWidth: number, barCount: number, gap: number = 0.2): number => {
    if (barCount <= 0) return 0;
    const totalGap = (barCount - 1) * gap;
    return Math.max(1, (containerWidth - totalGap) / barCount);
  };

  describe('Color Interpolation', () => {
    it('should return start color at ratio 0', () => {
      expect(interpolateColor('#ff0000', '#0000ff', 0)).toBe('#ff0000');
    });

    it('should return end color at ratio 1', () => {
      expect(interpolateColor('#ff0000', '#0000ff', 1)).toBe('#0000ff');
    });

    it('should return midpoint color', () => {
      expect(interpolateColor('#000000', '#ffffff', 0.5)).toBe('#808080');
    });

    it('should handle ratio outside 0-1', () => {
      expect(interpolateColor('#000000', '#ffffff', -0.5)).toBe('#000000');
      expect(interpolateColor('#000000', '#ffffff', 1.5)).toBe('#ffffff');
    });

    it('should handle green to red', () => {
      const mid = interpolateColor('#00ff00', '#ff0000', 0.5);
      expect(mid).toMatch(/^#[0-9a-f]{6}$/);
    });
  });

  describe('Axis Ticks', () => {
    it('should generate ticks for 0-100', () => {
      const ticks = calcAxisTicks(0, 100, 5);
      expect(ticks.length).toBeGreaterThanOrEqual(3);
      expect(ticks[0]).toBeLessThanOrEqual(0);
      expect(ticks[ticks.length - 1]).toBeGreaterThanOrEqual(100);
    });

    it('should generate ticks for negative range', () => {
      const ticks = calcAxisTicks(-50, 50, 5);
      expect(ticks[0]).toBeLessThanOrEqual(-50);
      expect(ticks[ticks.length - 1]).toBeGreaterThanOrEqual(50);
    });

    it('should handle single value', () => {
      const ticks = calcAxisTicks(10, 10, 5);
      expect(ticks).toEqual([10]);
    });

    it('should handle reversed range', () => {
      const ticks = calcAxisTicks(100, 0, 5);
      expect(ticks).toEqual([100]);
    });

    it('should handle small range', () => {
      const ticks = calcAxisTicks(0, 1, 5);
      expect(ticks.length).toBeGreaterThanOrEqual(2);
    });

    it('should handle very large range', () => {
      const ticks = calcAxisTicks(0, 1000000, 5);
      expect(ticks.length).toBeGreaterThanOrEqual(3);
    });
  });

  describe('Color Assignment', () => {
    it('should assign colors from palette', () => {
      const colors = assignColors(['A', 'B', 'C'], ['#ff0000', '#00ff00', '#0000ff']);
      expect(colors['A']).toBe('#ff0000');
      expect(colors['B']).toBe('#00ff00');
      expect(colors['C']).toBe('#0000ff');
    });

    it('should cycle through palette', () => {
      const colors = assignColors(['A', 'B', 'C', 'D'], ['#ff0000', '#00ff00']);
      expect(colors['C']).toBe('#ff0000');
      expect(colors['D']).toBe('#00ff00');
    });

    it('should handle empty items', () => {
      expect(assignColors([], ['#ff0000'])).toEqual({});
    });
  });

  describe('Tooltip Formatting', () => {
    it('should format percent', () => {
      expect(formatTooltipValue(0.0525, 'percent')).toBe('5.25%');
    });

    it('should format price', () => {
      expect(formatTooltipValue(123.456, 'price')).toBe('123.46');
    });

    it('should format billion amounts', () => {
      expect(formatTooltipValue(5e8, 'billion')).toBe('5.00亿');
    });

    it('should format wan amounts', () => {
      expect(formatTooltipValue(50000, 'billion')).toBe('5.00万');
    });

    it('should format small amounts', () => {
      expect(formatTooltipValue(500, 'billion')).toBe('500');
    });

    it('should handle unknown unit', () => {
      expect(formatTooltipValue(42, 'unknown')).toBe('42');
    });
  });

  describe('Data to Pixel', () => {
    it('should map min to pixel start', () => {
      expect(dataToPixel(0, 0, 100, [0, 500])).toBe(0);
    });

    it('should map max to pixel end', () => {
      expect(dataToPixel(100, 0, 100, [0, 500])).toBe(500);
    });

    it('should map mid value', () => {
      expect(dataToPixel(50, 0, 100, [0, 500])).toBe(250);
    });

    it('should handle equal min max', () => {
      expect(dataToPixel(50, 50, 50, [0, 500])).toBe(250);
    });
  });

  describe('Pixel to Data', () => {
    it('should map pixel start to min', () => {
      expect(pixelToData(0, 0, 100, [0, 500])).toBeCloseTo(0, 5);
    });

    it('should map pixel end to max', () => {
      expect(pixelToData(500, 0, 100, [0, 500])).toBeCloseTo(100, 5);
    });

    it('should roundtrip with dataToPixel', () => {
      const value = 75;
      const pixel = dataToPixel(value, 0, 100, [0, 500]);
      expect(pixelToData(pixel, 0, 100, [0, 500])).toBeCloseTo(value, 5);
    });
  });

  describe('Bar Width', () => {
    it('should calculate bar width', () => {
      expect(calcBarWidth(500, 10)).toBeGreaterThan(0);
    });

    it('should handle single bar', () => {
      expect(calcBarWidth(500, 1)).toBe(500);
    });

    it('should handle zero bars', () => {
      expect(calcBarWidth(500, 0)).toBe(0);
    });

    it('should reduce width with more bars', () => {
      const w10 = calcBarWidth(500, 10);
      const w20 = calcBarWidth(500, 20);
      expect(w10).toBeGreaterThan(w20);
    });

    it('should respect minimum width', () => {
      expect(calcBarWidth(100, 1000)).toBeGreaterThanOrEqual(1);
    });
  });
});
