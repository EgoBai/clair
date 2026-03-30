import { describe, it, expect } from 'vitest';

// ==================== 高级数据可视化测试 ====================

interface DataPoint { label: string; value: number; color?: string; }

function calcTreemapLayout(data: DataPoint[], width: number, height: number): { x: number; y: number; w: number; h: number; label: string; value: number }[] {
  if (data.length === 0) return [];
  const total = data.reduce((s, d) => s + Math.abs(d.value), 0);
  if (total === 0) return data.map((d, i) => ({ x: 0, y: 0, w: width, h: height / data.length, label: d.label, value: d.value }));
  const sorted = [...data].sort((a, b) => Math.abs(b.value) - Math.abs(a.value));
  const result: { x: number; y: number; w: number; h: number; label: string; value: number }[] = [];
  let currentX = 0;
  for (const d of sorted) {
    const ratio = Math.abs(d.value) / total;
    const w = width * ratio;
    result.push({ x: currentX, y: 0, w, h: height, label: d.label, value: d.value });
    currentX += w;
  }
  return result;
}

function calcBubbleSize(values: number[], minSize: number = 10, maxSize: number = 100): number[] {
  if (values.length === 0) return [];
  const minVal = Math.min(...values);
  const maxVal = Math.max(...values);
  const range = maxVal - minVal;
  if (range === 0) return values.map(() => (minSize + maxSize) / 2);
  return values.map(v => minSize + ((v - minVal) / range) * (maxSize - minSize));
}

function calcGaugeValue(value: number, min: number, max: number): { angle: number; percentage: number; zone: string } {
  const clamped = Math.max(min, Math.min(max, value));
  const percentage = ((clamped - min) / (max - min)) * 100;
  const angle = -135 + (percentage / 100) * 270;
  let zone = 'normal';
  if (percentage < 20) zone = 'danger';
  else if (percentage < 40) zone = 'warning';
  else if (percentage > 80) zone = 'danger';
  else if (percentage > 60) zone = 'warning';
  return { angle, percentage, zone };
}

function calcSparkline(data: number[], width: number = 100, height: number = 30): { x: number; y: number }[] {
  if (data.length === 0) return [];
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  return data.map((v, i) => ({
    x: (i / (data.length - 1 || 1)) * width,
    y: height - ((v - min) / range) * height,
  }));
}

function calcColorGradient(value: number, min: number, max: number, colors: string[]): string {
  if (colors.length === 0) return '#000000';
  if (colors.length === 1) return colors[0];
  const ratio = max === min ? 0.5 : (value - min) / (max - min);
  const idx = Math.min(Math.floor(ratio * (colors.length - 1)), colors.length - 2);
  return colors[idx];
}

function formatAxisLabel(value: number, type: 'volume' | 'price' | 'percent' | 'marketCap'): string {
  switch (type) {
    case 'volume':
      if (value >= 1e8) return (value / 1e8).toFixed(1) + '亿';
      if (value >= 1e4) return (value / 1e4).toFixed(1) + '万';
      return value.toString();
    case 'marketCap':
      if (value >= 1e12) return (value / 1e12).toFixed(1) + '万亿';
      if (value >= 1e8) return (value / 1e8).toFixed(1) + '亿';
      if (value >= 1e4) return (value / 1e4).toFixed(1) + '万';
      return value.toString();
    case 'price':
      return value.toFixed(2);
    case 'percent':
      return (value * 100).toFixed(2) + '%';
    default:
      return value.toString();
  }
}

function calcMovingAverageCrossover(fast: number[], slow: number[]): { cross: 'golden' | 'death' | null; index: number }[] {
  const result: { cross: 'golden' | 'death' | null; index: number }[] = [];
  for (let i = 1; i < Math.min(fast.length, slow.length); i++) {
    if (fast[i - 1] <= slow[i - 1] && fast[i] > slow[i]) result.push({ cross: 'golden', index: i });
    else if (fast[i - 1] >= slow[i - 1] && fast[i] < slow[i]) result.push({ cross: 'death', index: i });
  }
  return result;
}

function detectAnomalies(data: number[], threshold: number = 2): { index: number; value: number; zScore: number }[] {
  const mean = data.reduce((a, b) => a + b, 0) / data.length;
  const std = Math.sqrt(data.reduce((a, b) => a + (b - mean) ** 2, 0) / data.length);
  if (std === 0) return [];
  return data.map((v, i) => ({ index: i, value: v, zScore: (v - mean) / std })).filter(d => Math.abs(d.zScore) > threshold);
}

describe('高级数据可视化', () => {
  describe('Treemap布局', () => {
    it('应该正确布局', () => {
      const data: DataPoint[] = [
        { label: 'A', value: 100 }, { label: 'B', value: 50 }, { label: 'C', value: 25 },
      ];
      const layout = calcTreemapLayout(data, 400, 300);
      expect(layout.length).toBe(3);
    });

    it('总面积应该等于容器面积', () => {
      const data: DataPoint[] = [{ label: 'A', value: 100 }, { label: 'B', value: 100 }];
      const layout = calcTreemapLayout(data, 400, 300);
      const totalArea = layout.reduce((s, r) => s + r.w * r.h, 0);
      expect(totalArea).toBeCloseTo(400 * 300, 0);
    });

    it('空数据不应该崩溃', () => {
      expect(calcTreemapLayout([], 100, 100)).toEqual([]);
    });

    it('最大值应该占最大面积', () => {
      const data: DataPoint[] = [{ label: 'A', value: 10 }, { label: 'B', value: 100 }];
      const layout = calcTreemapLayout(data, 200, 100);
      const maxItem = layout.find(r => r.label === 'B')!;
      const minItem = layout.find(r => r.label === 'A')!;
      expect(maxItem.w).toBeGreaterThan(minItem.w);
    });
  });

  describe('气泡大小', () => {
    it('应该在指定范围内', () => {
      const sizes = calcBubbleSize([1, 2, 3, 4, 5], 10, 50);
      for (const s of sizes) {
        expect(s).toBeGreaterThanOrEqual(10);
        expect(s).toBeLessThanOrEqual(50);
      }
    });

    it('最小值应该映射到最小尺寸', () => {
      const sizes = calcBubbleSize([1, 5, 10], 20, 80);
      expect(sizes[0]).toBe(20);
    });

    it('最大值应该映射到最大尺寸', () => {
      const sizes = calcBubbleSize([1, 5, 10], 20, 80);
      expect(sizes[2]).toBe(80);
    });

    it('空数组不应该崩溃', () => {
      expect(calcBubbleSize([])).toEqual([]);
    });

    it('相同值应该返回中间尺寸', () => {
      const sizes = calcBubbleSize([5, 5, 5], 10, 50);
      expect(sizes.every(s => s === 30)).toBe(true);
    });
  });

  describe('仪表盘', () => {
    it('应该正确计算百分比', () => {
      const gauge = calcGaugeValue(50, 0, 100);
      expect(gauge.percentage).toBe(50);
    });

    it('角度应该在范围内', () => {
      const gauge = calcGaugeValue(50, 0, 100);
      expect(gauge.angle).toBeGreaterThanOrEqual(-135);
      expect(gauge.angle).toBeLessThanOrEqual(135);
    });

    it('低值应该标记为危险区', () => {
      const gauge = calcGaugeValue(5, 0, 100);
      expect(gauge.zone).toBe('danger');
    });

    it('高值应该标记为危险区', () => {
      const gauge = calcGaugeValue(95, 0, 100);
      expect(gauge.zone).toBe('danger');
    });

    it('中间值应该是正常区', () => {
      const gauge = calcGaugeValue(50, 0, 100);
      expect(gauge.zone).toBe('normal');
    });

    it('超出范围应该被截断', () => {
      const gauge = calcGaugeValue(150, 0, 100);
      expect(gauge.percentage).toBe(100);
    });
  });

  describe('Sparkline', () => {
    it('应该返回正确数量的点', () => {
      expect(calcSparkline([1, 2, 3]).length).toBe(3);
    });

    it('空数据不应该崩溃', () => {
      expect(calcSparkline([])).toEqual([]);
    });

    it('Y轴应该在容器高度内', () => {
      const points = calcSparkline([10, 20, 30, 40, 50], 100, 30);
      for (const p of points) {
        expect(p.y).toBeGreaterThanOrEqual(0);
        expect(p.y).toBeLessThanOrEqual(30);
      }
    });

    it('X轴应该在容器宽度内', () => {
      const points = calcSparkline([10, 20, 30], 100, 30);
      for (const p of points) {
        expect(p.x).toBeGreaterThanOrEqual(0);
        expect(p.x).toBeLessThanOrEqual(100);
      }
    });
  });

  describe('颜色渐变', () => {
    it('应该返回颜色数组中的值', () => {
      const colors = ['#ff0000', '#00ff00', '#0000ff'];
      expect(colors).toContain(calcColorGradient(50, 0, 100, colors));
    });

    it('空颜色应该返回黑色', () => {
      expect(calcColorGradient(50, 0, 100, [])).toBe('#000000');
    });

    it('单色应该返回自身', () => {
      expect(calcColorGradient(50, 0, 100, ['#fff'])).toBe('#fff');
    });
  });

  describe('坐标轴标签格式化', () => {
    it('成交量应该格式化为亿/万', () => {
      expect(formatAxisLabel(1.5e8, 'volume')).toContain('亿');
      expect(formatAxisLabel(5e4, 'volume')).toContain('万');
    });

    it('市值应该格式化为万亿/亿', () => {
      expect(formatAxisLabel(1.5e12, 'marketCap')).toContain('万亿');
      expect(formatAxisLabel(5e8, 'marketCap')).toContain('亿');
    });

    it('价格应该显示两位小数', () => {
      expect(formatAxisLabel(123.456, 'price')).toBe('123.46');
    });

    it('百分比应该显示百分号', () => {
      expect(formatAxisLabel(0.05, 'percent')).toBe('5.00%');
    });
  });

  describe('均线交叉检测', () => {
    it('应该检测金叉', () => {
      const fast = [4, 5, 6, 7, 8];
      const slow = [7, 6.5, 6, 5.5, 5];
      const crosses = calcMovingAverageCrossover(fast, slow);
      expect(crosses.some(c => c.cross === 'golden')).toBe(true);
    });

    it('应该检测死叉', () => {
      const fast = [8, 7, 6, 5, 4];
      const slow = [5, 5.5, 6, 6.5, 7];
      const crosses = calcMovingAverageCrossover(fast, slow);
      expect(crosses.some(c => c.cross === 'death')).toBe(true);
    });

    it('不交叉不应该有信号', () => {
      const fast = [1, 2, 3, 4, 5];
      const slow = [6, 7, 8, 9, 10];
      expect(calcMovingAverageCrossover(fast, slow).length).toBe(0);
    });
  });

  describe('异常检测', () => {
    it('应该检测异常值', () => {
      const data = [1, 1, 1, 1, 1, 1, 1, 1, 1, 100];
      const anomalies = detectAnomalies(data);
      expect(anomalies.length).toBeGreaterThan(0);
      expect(anomalies[0].index).toBe(9);
    });

    it('正常数据不应该检测到异常', () => {
      const data = [10, 11, 10, 12, 11, 10, 11, 12, 10, 11];
      const anomalies = detectAnomalies(data, 3);
      expect(anomalies.length).toBe(0);
    });

    it('相同数据不应该检测到异常', () => {
      expect(detectAnomalies([5, 5, 5, 5]).length).toBe(0);
    });
  });
});
