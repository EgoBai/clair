import { describe, it, expect } from 'vitest';

// ===== 图表渲染优化 =====
describe('Chart Rendering Optimization', () => {
  const downsampleLTTB = (data: number[], targetPoints: number): number[] => {
    if (data.length <= targetPoints) return [...data];
    if (targetPoints < 3) return [data[0], data[data.length - 1]];
    const result: number[] = [data[0]];
    const bucketSize = (data.length - 2) / (targetPoints - 2);
    let prevIndex = 0;
    for (let i = 1; i < targetPoints - 1; i++) {
      const bucketStart = Math.floor((i - 1) * bucketSize) + 1;
      const bucketEnd = Math.min(Math.floor(i * bucketSize) + 1, data.length - 1);
      const nextBucketStart = Math.floor(i * bucketSize) + 1;
      const nextBucketEnd = Math.min(Math.floor((i + 1) * bucketSize) + 1, data.length - 1);
      let avgNext = 0;
      const nextCount = nextBucketEnd - nextBucketStart + 1;
      for (let j = nextBucketStart; j <= nextBucketEnd; j++) avgNext += data[j];
      avgNext /= nextCount;
      let maxArea = -1, maxIndex = bucketStart;
      for (let j = bucketStart; j <= bucketEnd; j++) {
        const area = Math.abs((data[j] - data[prevIndex]) * (j - prevIndex) - (avgNext - data[prevIndex]) * (nextBucketStart - prevIndex));
        if (area > maxArea) { maxArea = area; maxIndex = j; }
      }
      result.push(data[maxIndex]);
      prevIndex = maxIndex;
    }
    result.push(data[data.length - 1]);
    return result;
  };

  const calcHeatmapColor = (value: number, min: number, max: number): string => {
    if (max === min) return 'rgb(128, 128, 128)';
    const ratio = Math.max(0, Math.min(1, (value - min) / (max - min)));
    const r = Math.round(255 * ratio);
    const g = Math.round(255 * (1 - Math.abs(ratio - 0.5) * 2));
    const b = Math.round(255 * (1 - ratio));
    return `rgb(${r}, ${g}, ${b})`;
  };

  const calcTreemapLayout = (items: { name: string; value: number }[], width: number, height: number): { name: string; x: number; y: number; w: number; h: number }[] => {
    if (items.length === 0) return [];
    const total = items.reduce((s, i) => s + i.value, 0);
    if (total === 0) return items.map((item, i) => ({ name: item.name, x: 0, y: 0, w: 0, h: 0 }));
    const sorted = [...items].sort((a, b) => b.value - a.value);
    const result: { name: string; x: number; y: number; w: number; h: number }[] = [];
    let x = 0;
    for (const item of sorted) {
      const ratio = item.value / total;
      const w = width * ratio;
      result.push({ name: item.name, x, y: 0, w, h: height });
      x += w;
    }
    return result;
  };

  const generateColorPalette = (count: number, saturation: number = 70, lightness: number = 55): string[] => {
    const colors: string[] = [];
    const step = 360 / count;
    for (let i = 0; i < count; i++) {
      colors.push(`hsl(${Math.round(i * step)}, ${saturation}%, ${lightness}%)`);
    }
    return colors;
  };

  const calcAxisScale = (min: number, max: number, tickCount: number): { min: number; max: number; step: number; ticks: number[] } => {
    if (tickCount <= 1) return { min, max, step: max - min, ticks: [min] };
    const range = max - min;
    const roughStep = range / (tickCount - 1);
    const mag = Math.pow(10, Math.floor(Math.log10(roughStep)));
    const normalized = roughStep / mag;
    let step: number;
    if (normalized <= 1.5) step = 1 * mag;
    else if (normalized <= 3.5) step = 2 * mag;
    else if (normalized <= 7.5) step = 5 * mag;
    else step = 10 * mag;
    const niceMin = Math.floor(min / step) * step;
    const niceMax = Math.ceil(max / step) * step;
    const ticks: number[] = [];
    for (let v = niceMin; v <= niceMax + step * 0.01; v += step) {
      ticks.push(Math.round(v * 1e10) / 1e10);
    }
    return { min: niceMin, max: niceMax, step, ticks };
  };

  const formatAxisLabel = (value: number, unit: string = ''): string => {
    if (Math.abs(value) >= 1e12) return (value / 1e12).toFixed(1) + '万亿' + unit;
    if (Math.abs(value) >= 1e8) return (value / 1e8).toFixed(1) + '亿' + unit;
    if (Math.abs(value) >= 1e4) return (value / 1e4).toFixed(1) + '万' + unit;
    return value.toFixed(2) + unit;
  };

  describe('LTTB降采样', () => {
    it('不超过目标点数', () => {
      const data = Array.from({ length: 10000 }, (_, i) => Math.sin(i * 0.01) * 100);
      const result = downsampleLTTB(data, 500);
      expect(result.length).toBeLessThanOrEqual(500);
    });

    it('保留首尾点', () => {
      const data = [1, 5, 3, 8, 2, 7, 4, 9, 6, 10];
      const result = downsampleLTTB(data, 5);
      expect(result[0]).toBe(1);
      expect(result[result.length - 1]).toBe(10);
    });

    it('数据量小于目标返回全部', () => {
      const data = [1, 2, 3];
      expect(downsampleLTTB(data, 10)).toEqual([1, 2, 3]);
    });

    it('目标小于3返回首尾', () => {
      const data = [1, 2, 3, 4, 5];
      expect(downsampleLTTB(data, 2)).toEqual([1, 5]);
    });

    it('空数据返回空', () => {
      expect(downsampleLTTB([], 5)).toEqual([]);
    });

    it('不修改原数组', () => {
      const data = [1, 2, 3, 4, 5];
      const original = [...data];
      downsampleLTTB(data, 3);
      expect(data).toEqual(original);
    });
  });

  describe('热力图颜色', () => {
    it('最小值应为蓝色', () => {
      const color = calcHeatmapColor(0, 0, 100);
      expect(color).toContain('0, 0, 255');
    });

    it('最大值应为红色', () => {
      const color = calcHeatmapColor(100, 0, 100);
      expect(color).toContain('255');
    });

    it('中间值应为绿色', () => {
      const color = calcHeatmapColor(50, 0, 100);
      expect(color).toContain('255');
    });

    it('相同min和max返回灰色', () => {
      expect(calcHeatmapColor(5, 5, 5)).toBe('rgb(128, 128, 128)');
    });

    it('超出范围截断', () => {
      const color = calcHeatmapColor(150, 0, 100);
      expect(color).toContain('255');
    });

    it('负值处理', () => {
      const color = calcHeatmapColor(-50, -100, 0);
      expect(isFinite(parseInt(color.match(/\d+/)![0]))).toBe(true);
    });
  });

  describe('树图布局', () => {
    it('应返回正确数量', () => {
      const items = [{ name: 'A', value: 100 }, { name: 'B', value: 200 }];
      const layout = calcTreemapLayout(items, 800, 400);
      expect(layout.length).toBe(2);
    });

    it('总宽度等于画布宽度', () => {
      const items = [{ name: 'A', value: 100 }, { name: 'B', value: 300 }];
      const layout = calcTreemapLayout(items, 800, 400);
      const totalW = layout.reduce((s, l) => s + l.w, 0);
      expect(totalW).toBeCloseTo(800);
    });

    it('高度等于画布高度', () => {
      const items = [{ name: 'A', value: 100 }];
      const layout = calcTreemapLayout(items, 800, 400);
      expect(layout[0].h).toBe(400);
    });

    it('空数据返回空', () => {
      expect(calcTreemapLayout([], 800, 400)).toEqual([]);
    });

    it('大值占比大', () => {
      const items = [{ name: 'A', value: 900 }, { name: 'B', value: 100 }];
      const layout = calcTreemapLayout(items, 1000, 500);
      expect(layout[0].w).toBeGreaterThan(layout[1].w);
    });
  });

  describe('颜色调色板', () => {
    it('应返回指定数量', () => {
      expect(generateColorPalette(10).length).toBe(10);
    });

    it('HSL格式', () => {
      const colors = generateColorPalette(5);
      colors.forEach(c => expect(c).toMatch(/^hsl\(/));
    });

    it('单色', () => {
      expect(generateColorPalette(1).length).toBe(1);
    });

    it('颜色互不相同', () => {
      const colors = generateColorPalette(10);
      const unique = new Set(colors);
      expect(unique.size).toBe(10);
    });
  });

  describe('坐标轴刻度', () => {
    it('应生成合理刻度', () => {
      const scale = calcAxisScale(0, 100, 5);
      expect(scale.ticks.length).toBeGreaterThanOrEqual(3);
      expect(scale.min).toBeLessThanOrEqual(0);
      expect(scale.max).toBeGreaterThanOrEqual(100);
    });

    it('刻度等间距', () => {
      const scale = calcAxisScale(0, 100, 5);
      if (scale.ticks.length > 1) {
        const step = scale.ticks[1] - scale.ticks[0];
        for (let i = 2; i < scale.ticks.length; i++) {
          expect(Math.abs(scale.ticks[i] - scale.ticks[i - 1] - step)).toBeLessThan(0.01);
        }
      }
    });

    it('负数范围', () => {
      const scale = calcAxisScale(-50, 50, 5);
      expect(scale.min).toBeLessThanOrEqual(-50);
      expect(scale.max).toBeGreaterThanOrEqual(50);
    });

    it('小数范围', () => {
      const scale = calcAxisScale(0.1, 0.9, 5);
      expect(scale.step).toBeGreaterThan(0);
    });

    it('单刻度', () => {
      const scale = calcAxisScale(10, 20, 1);
      expect(scale.ticks.length).toBe(1);
    });
  });

  describe('轴标签格式化', () => {
    it('万亿级', () => {
      expect(formatAxisLabel(1.5e12)).toContain('万亿');
    });

    it('亿级', () => {
      expect(formatAxisLabel(5e8)).toContain('亿');
    });

    it('万级', () => {
      expect(formatAxisLabel(50000)).toContain('万');
    });

    it('普通数字', () => {
      const label = formatAxisLabel(123.456);
      expect(label).toContain('123.46');
    });

    it('带单位', () => {
      expect(formatAxisLabel(5e8, '元')).toContain('元');
    });
  });
});
