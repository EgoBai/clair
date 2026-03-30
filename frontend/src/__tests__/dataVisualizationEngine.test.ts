import { describe, it, expect } from 'vitest';

// 数据可视化引擎测试
describe('数据可视化引擎', () => {
  describe('坐标轴刻度计算', () => {
    const calcTicks = (min: number, max: number, count: number): number[] => {
      const range = max - min;
      if (range <= 0 || count <= 0) return [];
      const rough = range / count;
      const magnitude = Math.pow(10, Math.floor(Math.log10(rough)));
      const candidates = [1, 2, 5, 10].map(m => m * magnitude);
      const step = candidates.find(c => range / c <= count * 1.5) || candidates[candidates.length - 1];
      const ticks: number[] = [];
      let tick = Math.ceil(min / step) * step;
      while (tick <= max) {
        ticks.push(Math.round(tick * 1e6) / 1e6);
        tick += step;
      }
      return ticks;
    };

    it('0-100产生合理刻度', () => {
      const ticks = calcTicks(0, 100, 5);
      expect(ticks.length).toBeGreaterThanOrEqual(3);
      expect(ticks[0]).toBeGreaterThanOrEqual(0);
      expect(ticks[ticks.length - 1]).toBeLessThanOrEqual(100);
    });

    it('刻度递增', () => {
      const ticks = calcTicks(0, 50, 5);
      for (let i = 1; i < ticks.length; i++) {
        expect(ticks[i]).toBeGreaterThan(ticks[i - 1]);
      }
    });

    it('空范围返回空', () => {
      expect(calcTicks(10, 10, 5)).toEqual([]);
    });

    it('负数范围', () => {
      const ticks = calcTicks(-50, 50, 5);
      expect(ticks[0]).toBeLessThanOrEqual(0);
      expect(ticks[ticks.length - 1]).toBeGreaterThanOrEqual(0);
    });

    it('小数范围', () => {
      const ticks = calcTicks(0.1, 0.9, 5);
      expect(ticks.length).toBeGreaterThan(0);
    });

    it('count=1', () => {
      const ticks = calcTicks(0, 100, 1);
      expect(ticks.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('数据插值', () => {
    const linearInterpolate = (
      data: { x: number; y: number }[],
      targetX: number
    ): number | null => {
      if (data.length === 0) return null;
      if (data.length === 1) return data[0].y;

      const sorted = [...data].sort((a, b) => a.x - b.x);
      if (targetX <= sorted[0].x) return sorted[0].y;
      if (targetX >= sorted[sorted.length - 1].x) return sorted[sorted.length - 1].y;

      for (let i = 0; i < sorted.length - 1; i++) {
        if (targetX >= sorted[i].x && targetX <= sorted[i + 1].x) {
          const t = (targetX - sorted[i].x) / (sorted[i + 1].x - sorted[i].x);
          return sorted[i].y + t * (sorted[i + 1].y - sorted[i].y);
        }
      }
      return null;
    };

    it('精确点返回精确值', () => {
      const data = [{ x: 0, y: 0 }, { x: 10, y: 100 }];
      expect(linearInterpolate(data, 0)).toBe(0);
      expect(linearInterpolate(data, 10)).toBe(100);
    });

    it('中点插值', () => {
      const data = [{ x: 0, y: 0 }, { x: 10, y: 100 }];
      expect(linearInterpolate(data, 5)).toBe(50);
    });

    it('超出范围截断', () => {
      const data = [{ x: 0, y: 0 }, { x: 10, y: 100 }];
      expect(linearInterpolate(data, -5)).toBe(0);
      expect(linearInterpolate(data, 15)).toBe(100);
    });

    it('空数据返回null', () => {
      expect(linearInterpolate([], 5)).toBeNull();
    });

    it('单点返回自身', () => {
      expect(linearInterpolate([{ x: 5, y: 42 }], 3)).toBe(42);
    });

    it('非等距插值', () => {
      const data = [{ x: 0, y: 0 }, { x: 5, y: 10 }, { x: 10, y: 30 }];
      expect(linearInterpolate(data, 2.5)).toBe(5);
      expect(linearInterpolate(data, 7.5)).toBe(20);
    });
  });

  describe('颜色处理', () => {
    const hexToRgb = (hex: string): { r: number; g: number; b: number } | null => {
      const match = hex.replace('#', '').match(/^([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i);
      if (!match) return null;
      return {
        r: parseInt(match[1], 16),
        g: parseInt(match[2], 16),
        b: parseInt(match[3], 16),
      };
    };

    const rgbToHex = (r: number, g: number, b: number): string => {
      return '#' + [r, g, b].map(v =>
        Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')
      ).join('');
    };

    const lerpColor = (a: string, b: string, t: number): string => {
      const cA = hexToRgb(a)!;
      const cB = hexToRgb(b)!;
      return rgbToHex(
        cA.r + (cB.r - cA.r) * t,
        cA.g + (cB.g - cA.g) * t,
        cA.b + (cB.b - cA.b) * t,
      );
    };

    it('hex转rgb', () => {
      expect(hexToRgb('#ff0000')).toEqual({ r: 255, g: 0, b: 0 });
      expect(hexToRgb('#00ff00')).toEqual({ r: 0, g: 255, b: 0 });
      expect(hexToRgb('#0000ff')).toEqual({ r: 0, g: 0, b: 255 });
    });

    it('无效hex返回null', () => {
      expect(hexToRgb('invalid')).toBeNull();
      expect(hexToRgb('#xyz')).toBeNull();
    });

    it('rgb转hex', () => {
      expect(rgbToHex(255, 0, 0)).toBe('#ff0000');
      expect(rgbToHex(0, 255, 0)).toBe('#00ff00');
    });

    it('颜色插值', () => {
      expect(lerpColor('#000000', '#ffffff', 0)).toBe('#000000');
      expect(lerpColor('#000000', '#ffffff', 1)).toBe('#ffffff');
      expect(lerpColor('#000000', '#ffffff', 0.5)).toBe('#7f7f7f');
    });

    it('无#号也解析', () => {
      expect(hexToRgb('ff0000')).toEqual({ r: 255, g: 0, b: 0 });
    });

    it('溢出截断', () => {
      expect(rgbToHex(-10, 300, 128)).toBe('#00ff80');
    });
  });

  describe('图表数据聚合', () => {
    const aggregate = <T>(
      data: T[],
      groupFn: (item: T) => string,
      valueFn: (item: T) => number,
      method: 'sum' | 'avg' | 'max' | 'min' | 'count'
    ) => {
      const groups = new Map<string, number[]>();
      for (const item of data) {
        const key = groupFn(item);
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key)!.push(valueFn(item));
      }
      const result: Record<string, number> = {};
      for (const [key, values] of groups) {
        switch (method) {
          case 'sum': result[key] = values.reduce((a, b) => a + b, 0); break;
          case 'avg': result[key] = values.reduce((a, b) => a + b, 0) / values.length; break;
          case 'max': result[key] = Math.max(...values); break;
          case 'min': result[key] = Math.min(...values); break;
          case 'count': result[key] = values.length; break;
        }
      }
      return result;
    };

    const data = [
      { sector: 'bank', volume: 100 },
      { sector: 'bank', volume: 200 },
      { sector: 'tech', volume: 300 },
      { sector: 'tech', volume: 400 },
    ];

    it('求和聚合', () => {
      const result = aggregate(data, d => d.sector, d => d.volume, 'sum');
      expect(result.bank).toBe(300);
      expect(result.tech).toBe(700);
    });

    it('平均聚合', () => {
      const result = aggregate(data, d => d.sector, d => d.volume, 'avg');
      expect(result.bank).toBe(150);
      expect(result.tech).toBe(350);
    });

    it('最大值聚合', () => {
      const result = aggregate(data, d => d.sector, d => d.volume, 'max');
      expect(result.bank).toBe(200);
      expect(result.tech).toBe(400);
    });

    it('最小值聚合', () => {
      const result = aggregate(data, d => d.sector, d => d.volume, 'min');
      expect(result.bank).toBe(100);
      expect(result.tech).toBe(300);
    });

    it('计数聚合', () => {
      const result = aggregate(data, d => d.sector, d => d.volume, 'count');
      expect(result.bank).toBe(2);
      expect(result.tech).toBe(2);
    });

    it('空数据返回空', () => {
      expect(aggregate([], d => '', d => 0, 'sum')).toEqual({});
    });
  });

  describe('热力图数据处理', () => {
    const generateHeatmap = (
      data: number[][],
      colorFn: (value: number, min: number, max: number) => string
    ) => {
      const flat = data.flat();
      const min = Math.min(...flat);
      const max = Math.max(...flat);
      return data.map(row =>
        row.map(value => ({
          value,
          color: colorFn(value, min, max),
          normalized: max > min ? (value - min) / (max - min) : 0.5,
        }))
      );
    };

    const defaultColorFn = (value: number, min: number, max: number): string => {
      const t = max > min ? (value - min) / (max - min) : 0.5;
      const r = Math.round(255 * t);
      const b = Math.round(255 * (1 - t));
      return `rgb(${r}, 0, ${b})`;
    };

    it('生成热力图数据', () => {
      const data = [[1, 2], [3, 4]];
      const result = generateHeatmap(data, defaultColorFn);
      expect(result).toHaveLength(2);
      expect(result[0]).toHaveLength(2);
    });

    it('最小值蓝色', () => {
      const data = [[0, 5], [10, 20]];
      const result = generateHeatmap(data, defaultColorFn);
      expect(result[0][0].normalized).toBe(0);
    });

    it('最大值红色', () => {
      const data = [[0, 5], [10, 20]];
      const result = generateHeatmap(data, defaultColorFn);
      expect(result[1][1].normalized).toBe(1);
    });

    it('所有值相同normalized=0.5', () => {
      const data = [[5, 5], [5, 5]];
      const result = generateHeatmap(data, defaultColorFn);
      expect(result[0][0].normalized).toBe(0.5);
    });

    it('保留原始值', () => {
      const data = [[10, 20], [30, 40]];
      const result = generateHeatmap(data, defaultColorFn);
      expect(result[1][1].value).toBe(40);
    });
  });

  describe('雷达图数据', () => {
    const normalizeRadar = (
      data: { label: string; value: number; max: number }[]
    ) => {
      return data.map(d => ({
        label: d.label,
        value: d.value,
        max: d.max,
        normalized: d.max > 0 ? Math.min(d.value / d.max, 1) : 0,
        points: calcPolygonPoints(
          data.map(item => item.max > 0 ? Math.min(item.value / item.max, 1) : 0)
        ),
      }));
    };

    const calcPolygonPoints = (values: number[], cx = 100, cy = 100, r = 80): string => {
      const n = values.length;
      if (n < 3) return '';
      return values.map((v, i) => {
        const angle = (Math.PI * 2 * i) / n - Math.PI / 2;
        const x = cx + r * v * Math.cos(angle);
        const y = cy + r * v * Math.sin(angle);
        return `${x},${y}`;
      }).join(' ');
    };

    it('归一化到0-1', () => {
      const data = [
        { label: 'A', value: 50, max: 100 },
        { label: 'B', value: 75, max: 100 },
        { label: 'C', value: 100, max: 100 },
      ];
      const result = normalizeRadar(data);
      expect(result[0].normalized).toBe(0.5);
      expect(result[1].normalized).toBe(0.75);
      expect(result[2].normalized).toBe(1);
    });

    it('超出max截断为1', () => {
      const data = [{ label: 'A', value: 150, max: 100 }];
      expect(normalizeRadar(data)[0].normalized).toBe(1);
    });

    it('零max返回0', () => {
      const data = [{ label: 'A', value: 10, max: 0 }];
      expect(normalizeRadar(data)[0].normalized).toBe(0);
    });

    it('生成多边形点', () => {
      const points = calcPolygonPoints([1, 1, 1], 100, 100, 80);
      expect(points.split(' ')).toHaveLength(3);
    });

    it('空值不生成点', () => {
      expect(calcPolygonPoints([])).toBe('');
    });
  });

  describe('趋势线计算', () => {
    const calcTrendLine = (points: { x: number; y: number }[]) => {
      const n = points.length;
      if (n < 2) return null;
      const sumX = points.reduce((s, p) => s + p.x, 0);
      const sumY = points.reduce((s, p) => s + p.y, 0);
      const sumXY = points.reduce((s, p) => s + p.x * p.y, 0);
      const sumX2 = points.reduce((s, p) => s + p.x * p.x, 0);
      const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
      const intercept = (sumY - slope * sumX) / n;
      return { slope, intercept, predict: (x: number) => slope * x + intercept };
    };

    it('完全线性数据', () => {
      const points = [{ x: 0, y: 0 }, { x: 1, y: 2 }, { x: 2, y: 4 }, { x: 3, y: 6 }];
      const trend = calcTrendLine(points);
      expect(trend).not.toBeNull();
      expect(trend!.slope).toBeCloseTo(2);
      expect(trend!.intercept).toBeCloseTo(0);
    });

    it('预测值', () => {
      const points = [{ x: 0, y: 10 }, { x: 1, y: 20 }, { x: 2, y: 30 }];
      const trend = calcTrendLine(points);
      expect(trend!.predict(5)).toBeCloseTo(60);
    });

    it('单点返回null', () => {
      expect(calcTrendLine([{ x: 0, y: 0 }])).toBeNull();
    });

    it('水平线slope=0', () => {
      const points = [{ x: 0, y: 5 }, { x: 1, y: 5 }, { x: 2, y: 5 }];
      const trend = calcTrendLine(points);
      expect(trend!.slope).toBeCloseTo(0);
    });
  });
});
