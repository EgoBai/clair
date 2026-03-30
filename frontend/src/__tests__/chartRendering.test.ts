import { describe, it, expect } from 'vitest';

/**
 * 图表渲染逻辑测试
 */

interface Point { x: number; y: number; }

function linearScale(domain: [number, number], range: [number, number], value: number): number {
  const ratio = (value - domain[0]) / (domain[1] - domain[0]);
  return range[0] + ratio * (range[1] - range[0]);
}

function calcNiceScale(min: number, max: number, ticks = 5): { min: number; max: number; step: number } {
  const range = max - min;
  const rough = range / ticks;
  const magnitude = Math.pow(10, Math.floor(Math.log10(rough)));
  const normalized = rough / magnitude;
  let step: number;
  if (normalized <= 1.5) step = magnitude;
  else if (normalized <= 3) step = 2 * magnitude;
  else if (normalized <= 7) step = 5 * magnitude;
  else step = 10 * magnitude;
  return {
    min: Math.floor(min / step) * step,
    max: Math.ceil(max / step) * step,
    step,
  };
}

function interpolatePoints(points: Point[], steps: number): Point[] {
  if (points.length < 2) return points;
  const result: Point[] = [];
  for (let i = 0; i < points.length - 1; i++) {
    for (let s = 0; s < steps; s++) {
      const t = s / steps;
      result.push({
        x: points[i].x + t * (points[i + 1].x - points[i].x),
        y: points[i].y + t * (points[i + 1].y - points[i].y),
      });
    }
  }
  result.push(points[points.length - 1]);
  return result;
}

function smoothPath(points: Point[]): string {
  if (points.length === 0) return '';
  if (points.length === 1) return `M ${points[0].x} ${points[0].y}`;
  let d = `M ${points[0].x} ${points[0].y}`;
  for (let i = 1; i < points.length; i++) {
    const prev = points[i - 1];
    const curr = points[i];
    const cpx = (prev.x + curr.x) / 2;
    d += ` C ${cpx} ${prev.y}, ${cpx} ${curr.y}, ${curr.x} ${curr.y}`;
  }
  return d;
}

function calcBarWidth(totalWidth: number, barCount: number, padding = 0.1): number {
  const available = totalWidth * (1 - padding * 2);
  return available / barCount * 0.8;
}

function formatAxisLabel(value: number, type: 'price' | 'volume' | 'percent'): string {
  switch (type) {
    case 'price': return value.toFixed(2);
    case 'volume':
      if (value >= 1e8) return (value / 1e8).toFixed(1) + '亿';
      if (value >= 1e4) return (value / 1e4).toFixed(1) + '万';
      return value.toString();
    case 'percent': return value.toFixed(2) + '%';
    default: return value.toString();
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

describe('图表渲染逻辑', () => {
  describe('线性映射', () => {
    it('域到范围映射', () => {
      expect(linearScale([0, 100], [0, 500], 50)).toBe(250);
    });

    it('边界值', () => {
      expect(linearScale([0, 100], [0, 500], 0)).toBe(0);
      expect(linearScale([0, 100], [0, 500], 100)).toBe(500);
    });

    it('反转范围', () => {
      expect(linearScale([0, 100], [500, 0], 50)).toBe(250);
    });

    it('负值域', () => {
      expect(linearScale([-100, 100], [0, 200], 0)).toBe(100);
    });
  });

  describe('Nice Scale', () => {
    it('基本计算', () => {
      const scale = calcNiceScale(1.2, 8.7);
      expect(scale.min).toBeLessThanOrEqual(1.2);
      expect(scale.max).toBeGreaterThanOrEqual(8.7);
    });

    it('step为正数', () => {
      const scale = calcNiceScale(0, 100);
      expect(scale.step).toBeGreaterThan(0);
    });

    it('对称域', () => {
      const scale = calcNiceScale(-5, 5);
      expect(scale.min).toBeLessThanOrEqual(-5);
      expect(scale.max).toBeGreaterThanOrEqual(5);
    });

    it('小数值', () => {
      const scale = calcNiceScale(0.001, 0.01);
      expect(scale.step).toBeGreaterThan(0);
    });
  });

  describe('路径插值', () => {
    it('基本插值', () => {
      const points = [{ x: 0, y: 0 }, { x: 10, y: 10 }];
      const interp = interpolatePoints(points, 2);
      expect(interp.length).toBe(3); // 2 intervals * 2 steps + last point (but step 0 and 1 per interval)
    });

    it('单点返回原样', () => {
      const points = [{ x: 5, y: 5 }];
      expect(interpolatePoints(points, 10)).toEqual(points);
    });

    it('空数组', () => {
      expect(interpolatePoints([], 5)).toEqual([]);
    });
  });

  describe('平滑路径', () => {
    it('贝塞尔曲线', () => {
      const points = [{ x: 0, y: 0 }, { x: 50, y: 30 }, { x: 100, y: 10 }];
      const path = smoothPath(points);
      expect(path).toContain('M 0 0');
      expect(path).toContain('C');
    });

    it('单点', () => {
      expect(smoothPath([{ x: 5, y: 5 }])).toBe('M 5 5');
    });

    it('空数组', () => {
      expect(smoothPath([])).toBe('');
    });
  });

  describe('柱状图宽度', () => {
    it('基本计算', () => {
      const w = calcBarWidth(1000, 10);
      expect(w).toBeGreaterThan(0);
      expect(w).toBeLessThan(100);
    });

    it('单柱', () => {
      const w = calcBarWidth(100, 1);
      expect(w).toBe(80 * 0.8); // available=100*0.8=80
    });

    it('有内边距', () => {
      const w1 = calcBarWidth(100, 5, 0.1);
      const w2 = calcBarWidth(100, 5, 0.3);
      expect(w1).toBeGreaterThan(w2);
    });
  });

  describe('坐标轴标签', () => {
    it('价格格式化', () => {
      expect(formatAxisLabel(10.5, 'price')).toBe('10.50');
    });

    it('成交量亿', () => {
      expect(formatAxisLabel(150000000, 'volume')).toBe('1.5亿');
    });

    it('成交量万', () => {
      expect(formatAxisLabel(150000, 'volume')).toBe('15.0万');
    });

    it('百分比', () => {
      expect(formatAxisLabel(3.5, 'percent')).toBe('3.50%');
    });

    it('小成交量', () => {
      expect(formatAxisLabel(500, 'volume')).toBe('500');
    });
  });

  describe('clamp', () => {
    it('范围内不变', () => {
      expect(clamp(5, 0, 10)).toBe(5);
    });

    it('低于下限', () => {
      expect(clamp(-5, 0, 10)).toBe(0);
    });

    it('高于上限', () => {
      expect(clamp(15, 0, 10)).toBe(10);
    });

    it('等于边界', () => {
      expect(clamp(0, 0, 10)).toBe(0);
      expect(clamp(10, 0, 10)).toBe(10);
    });
  });

  describe('lerp', () => {
    it('中点', () => {
      expect(lerp(0, 100, 0.5)).toBe(50);
    });

    it('起点', () => {
      expect(lerp(0, 100, 0)).toBe(0);
    });

    it('终点', () => {
      expect(lerp(0, 100, 1)).toBe(100);
    });

    it('外推', () => {
      expect(lerp(0, 100, 2)).toBe(200);
    });
  });
});
