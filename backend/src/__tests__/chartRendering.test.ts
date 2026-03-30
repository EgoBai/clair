import { describe, it, expect } from 'vitest';

// 图表渲染逻辑测试

interface DataPoint {
  x: number;
  y: number;
  label?: string;
}

interface ChartConfig {
  width: number;
  height: number;
  padding: { top: number; right: number; bottom: number; left: number };
  gridLines: boolean;
  showLabels: boolean;
}

function calculateAxisRange(values: number[], padding = 0.05): { min: number; max: number } {
  if (values.length === 0) return { min: 0, max: 100 };
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  return {
    min: min - range * padding,
    max: max + range * padding,
  };
}

function scaleLinear(domain: [number, number], range: [number, number]): (value: number) => number {
  const [d0, d1] = domain;
  const [r0, r1] = range;
  const dSpan = d1 - d0;
  const rSpan = r1 - r0;
  if (dSpan === 0) return () => (r0 + r1) / 2;
  return (value: number) => r0 + ((value - d0) / dSpan) * rSpan;
}

function formatAxisTick(value: number, type: 'price' | 'volume' | 'percent' = 'price'): string {
  switch (type) {
    case 'price':
      return value.toFixed(2);
    case 'volume':
      if (value >= 1e8) return (value / 1e8).toFixed(1) + '亿';
      if (value >= 1e4) return (value / 1e4).toFixed(1) + '万';
      return value.toString();
    case 'percent':
      return value.toFixed(2) + '%';
  }
}

function generateGridLines(
  min: number,
  max: number,
  count = 5
): number[] {
  if (count <= 0 || min >= max) return [];
  const step = (max - min) / count;
  const lines: number[] = [];
  for (let i = 0; i <= count; i++) {
    lines.push(+(min + step * i).toFixed(4));
  }
  return lines;
}

function generateTimeLabels(
  startTime: number,
  endTime: number,
  interval: number,
  format: (ts: number) => string = (ts) => new Date(ts).toISOString().slice(11, 16)
): Array<{ value: number; label: string }> {
  const labels: Array<{ value: number; label: string }> = [];
  for (let t = startTime; t <= endTime; t += interval) {
    labels.push({ value: t, label: format(t) });
  }
  return labels;
}

function interpolateColor(color1: string, color2: string, ratio: number): string {
  const hex = (c: string) => parseInt(c, 16);
  const r1 = hex(color1.slice(1, 3));
  const g1 = hex(color1.slice(3, 5));
  const b1 = hex(color1.slice(5, 7));
  const r2 = hex(color2.slice(1, 3));
  const g2 = hex(color2.slice(3, 5));
  const b2 = hex(color2.slice(5, 7));
  
  const r = Math.round(r1 + (r2 - r1) * ratio);
  const g = Math.round(g1 + (g2 - g1) * ratio);
  const b = Math.round(b1 + (b2 - b1) * ratio);
  
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
}

function calculateTooltipPosition(
  mouseX: number,
  mouseY: number,
  tooltipW: number,
  tooltipH: number,
  containerW: number,
  containerH: number
): { x: number; y: number; flipX: boolean; flipY: boolean } {
  let x = mouseX + 15;
  let y = mouseY - tooltipH / 2;
  let flipX = false;
  let flipY = false;

  if (x + tooltipW > containerW) {
    x = mouseX - tooltipW - 15;
    flipX = true;
  }
  if (y < 0) {
    y = 0;
    flipY = true;
  }
  if (y + tooltipH > containerH) {
    y = containerH - tooltipH;
    flipY = true;
  }

  return { x: Math.max(0, x), y: Math.max(0, y), flipX, flipY };
}

function smoothCurve(points: DataPoint[], tension = 0.3): DataPoint[] {
  if (points.length < 3) return points;
  const result: DataPoint[] = [points[0]];
  for (let i = 1; i < points.length - 1; i++) {
    const prev = points[i - 1];
    const curr = points[i];
    const next = points[i + 1];
    result.push({
      x: curr.x,
      y: curr.y + tension * ((prev.y + next.y) / 2 - curr.y),
      label: curr.label,
    });
  }
  result.push(points[points.length - 1]);
  return result;
}

function calculateBarWidth(totalWidth: number, barCount: number, gapRatio = 0.2): number {
  if (barCount <= 0) return 0;
  const totalGap = totalWidth * gapRatio;
  const availableWidth = totalWidth - totalGap;
  return availableWidth / barCount;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

describe('图表渲染逻辑', () => {
  describe('坐标轴范围', () => {
    it('带padding的范围', () => {
      const range = calculateAxisRange([10, 20, 30]);
      expect(range.min).toBeLessThan(10);
      expect(range.max).toBeGreaterThan(30);
    });

    it('相同值范围', () => {
      const range = calculateAxisRange([10, 10, 10]);
      expect(range.min).toBeLessThan(10);
      expect(range.max).toBeGreaterThan(10);
    });

    it('空数组', () => {
      const range = calculateAxisRange([]);
      expect(range.min).toBe(0);
      expect(range.max).toBe(100);
    });

    it('负值范围', () => {
      const range = calculateAxisRange([-50, -10, -30]);
      expect(range.min).toBeLessThan(-50);
      expect(range.max).toBeGreaterThan(-10);
    });
  });

  describe('线性比例尺', () => {
    it('标准映射', () => {
      const scale = scaleLinear([0, 100], [0, 500]);
      expect(scale(0)).toBe(0);
      expect(scale(50)).toBe(250);
      expect(scale(100)).toBe(500);
    });

    it('反向范围', () => {
      const scale = scaleLinear([0, 100], [500, 0]);
      expect(scale(0)).toBe(500);
      expect(scale(100)).toBe(0);
    });

    it('零域宽返回中点', () => {
      const scale = scaleLinear([50, 50], [0, 100]);
      expect(scale(50)).toBe(50);
    });

    it('域外值外推', () => {
      const scale = scaleLinear([0, 100], [0, 200]);
      expect(scale(150)).toBe(300);
      expect(scale(-50)).toBe(-100);
    });
  });

  describe('坐标轴标签格式化', () => {
    it('价格格式化', () => {
      expect(formatAxisTick(10.5, 'price')).toBe('10.50');
      expect(formatAxisTick(100, 'price')).toBe('100.00');
    });

    it('成交量亿级', () => {
      expect(formatAxisTick(1.5e8, 'volume')).toBe('1.5亿');
    });

    it('成交量万级', () => {
      expect(formatAxisTick(50000, 'volume')).toBe('5.0万');
    });

    it('成交量个位', () => {
      expect(formatAxisTick(500, 'volume')).toBe('500');
    });

    it('百分比格式化', () => {
      expect(formatAxisTick(5.25, 'percent')).toBe('5.25%');
      expect(formatAxisTick(-3.1, 'percent')).toBe('-3.10%');
    });
  });

  describe('网格线生成', () => {
    it('标准网格线', () => {
      const lines = generateGridLines(0, 100, 5);
      expect(lines.length).toBe(6);
      expect(lines[0]).toBe(0);
      expect(lines[5]).toBe(100);
    });

    it('单条网格线', () => {
      const lines = generateGridLines(0, 100, 1);
      expect(lines.length).toBe(2);
    });

    it('零条返回空', () => {
      expect(generateGridLines(0, 100, 0)).toEqual([]);
    });

    it('min>=max返回空', () => {
      expect(generateGridLines(100, 50, 5)).toEqual([]);
    });

    it('精度正确', () => {
      const lines = generateGridLines(0, 3, 3);
      expect(lines[1]).toBeCloseTo(1, 3);
    });
  });

  describe('时间标签', () => {
    it('生成标签列表', () => {
      const labels = generateTimeLabels(0, 10000, 2000);
      expect(labels.length).toBe(6);
    });

    it('时间戳递增', () => {
      const labels = generateTimeLabels(0, 5000, 1000);
      for (let i = 1; i < labels.length; i++) {
        expect(labels[i].value).toBeGreaterThan(labels[i - 1].value);
      }
    });

    it('自定义格式化', () => {
      const labels = generateTimeLabels(0, 2000, 1000, (ts) => `T${ts}`);
      expect(labels[0].label).toBe('T0');
      expect(labels[1].label).toBe('T1000');
    });
  });

  describe('颜色插值', () => {
    it('起点色', () => {
      expect(interpolateColor('#ff0000', '#00ff00', 0)).toBe('#ff0000');
    });

    it('终点色', () => {
      expect(interpolateColor('#ff0000', '#00ff00', 1)).toBe('#00ff00');
    });

    it('中间色', () => {
      const color = interpolateColor('#000000', '#ffffff', 0.5);
      expect(color).toMatch(/^#[0-9a-f]{6}$/);
    });
  });

  describe('Tooltip定位', () => {
    it('默认右侧', () => {
      const pos = calculateTooltipPosition(100, 100, 100, 50, 800, 600);
      expect(pos.x).toBe(115);
      expect(pos.flipX).toBe(false);
    });

    it('右边界翻转', () => {
      const pos = calculateTooltipPosition(750, 100, 100, 50, 800, 600);
      expect(pos.flipX).toBe(true);
      expect(pos.x).toBeLessThan(750);
    });

    it('上边界钳制', () => {
      const pos = calculateTooltipPosition(100, 10, 100, 50, 800, 600);
      expect(pos.y).toBeGreaterThanOrEqual(0);
    });

    it('下边界钳制', () => {
      const pos = calculateTooltipPosition(100, 590, 100, 50, 800, 600);
      expect(pos.y + 50).toBeLessThanOrEqual(600);
    });
  });

  describe('曲线平滑', () => {
    it('平滑不改变端点', () => {
      const points: DataPoint[] = [
        { x: 0, y: 10 },
        { x: 1, y: 20 },
        { x: 2, y: 15 },
        { x: 3, y: 30 },
      ];
      const smoothed = smoothCurve(points);
      expect(smoothed[0]).toEqual(points[0]);
      expect(smoothed[smoothed.length - 1]).toEqual(points[points.length - 1]);
    });

    it('不足3点原样返回', () => {
      const points: DataPoint[] = [{ x: 0, y: 10 }, { x: 1, y: 20 }];
      expect(smoothCurve(points)).toEqual(points);
    });

    it('结果长度不变', () => {
      const points: DataPoint[] = [
        { x: 0, y: 10 },
        { x: 1, y: 20 },
        { x: 2, y: 15 },
      ];
      expect(smoothCurve(points).length).toBe(3);
    });
  });

  describe('柱状图宽度', () => {
    it('标准计算', () => {
      const w = calculateBarWidth(500, 10, 0.2);
      expect(w).toBe(40);
    });

    it('零柱数返回0', () => {
      expect(calculateBarWidth(500, 0)).toBe(0);
    });

    it('零间隙', () => {
      const w = calculateBarWidth(500, 5, 0);
      expect(w).toBe(100);
    });
  });

  describe('值钳制', () => {
    it('范围内不变', () => {
      expect(clamp(50, 0, 100)).toBe(50);
    });

    it('低于最小值', () => {
      expect(clamp(-10, 0, 100)).toBe(0);
    });

    it('高于最大值', () => {
      expect(clamp(150, 0, 100)).toBe(100);
    });

    it('等于边界', () => {
      expect(clamp(0, 0, 100)).toBe(0);
      expect(clamp(100, 0, 100)).toBe(100);
    });
  });
});
