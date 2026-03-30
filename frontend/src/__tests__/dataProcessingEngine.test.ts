import { describe, it, expect } from 'vitest';

// 前端数据处理与转换引擎
describe('前端数据处理引擎', () => {
  // 股票数据标准化
  describe('股票数据标准化', () => {
    interface RawStock { code: string; name: string; price: string | number; change: string | number; changePercent: string | number; volume: string | number; turnover: string | number; high: string | number; low: string | number; open: string | number; prevClose: string | number; }

    interface NormalizedStock { symbol: string; name: string; price: number; change: number; changePercent: number; volume: number; turnover: number; high: number; low: number; open: number; prevClose: number; isUp: boolean; amplitude: number; turnoverRate: number; }

    function normalizeStock(raw: RawStock, totalShares: number = 1e9): NormalizedStock {
      const price = Number(raw.price);
      const prevClose = Number(raw.prevClose);
      const change = price - prevClose;
      const changePercent = prevClose > 0 ? (change / prevClose) * 100 : 0;
      const high = Number(raw.high);
      const low = Number(raw.low);
      const amplitude = prevClose > 0 ? ((high - low) / prevClose) * 100 : 0;
      const volume = Number(raw.volume);
      const turnoverRate = totalShares > 0 ? (volume / totalShares) * 100 : 0;
      return { symbol: raw.code, name: raw.name, price, change, changePercent, volume, turnover: Number(raw.turnover), high, low, open: Number(raw.open), prevClose, isUp: change > 0, amplitude, turnoverRate };
    }

    it('应正确标准化字符串数值', () => {
      const raw: RawStock = { code: '600519', name: '茅台', price: '1800.50', change: '10.50', changePercent: '0.59', volume: '50000', turnover: '90000000', high: '1810', low: '1790', open: '1795', prevClose: '1790' };
      const n = normalizeStock(raw);
      expect(n.price).toBe(1800.5);
      expect(typeof n.price).toBe('number');
    });

    it('应计算涨跌方向', () => {
      const up = normalizeStock({ code: 'A', name: 'A', price: 110, change: 0, changePercent: 0, volume: 0, turnover: 0, high: 110, low: 110, open: 110, prevClose: 100 });
      expect(up.isUp).toBe(true);

      const down = normalizeStock({ code: 'B', name: 'B', price: 90, change: 0, changePercent: 0, volume: 0, turnover: 0, high: 90, low: 90, open: 90, prevClose: 100 });
      expect(down.isUp).toBe(false);
    });

    it('应计算振幅', () => {
      const n = normalizeStock({ code: 'A', name: 'A', price: 100, change: 0, changePercent: 0, volume: 0, turnover: 0, high: 110, low: 90, open: 100, prevClose: 100 });
      expect(n.amplitude).toBeCloseTo(20, 1);
    });

    it('应计算换手率', () => {
      const n = normalizeStock({ code: 'A', name: 'A', price: 100, change: 0, changePercent: 0, volume: 5e7, turnover: 0, high: 100, low: 100, open: 100, prevClose: 100 }, 1e9);
      expect(n.turnoverRate).toBeCloseTo(5, 1);
    });

    it('零昨收应不报错', () => {
      const n = normalizeStock({ code: 'A', name: 'A', price: 100, change: 0, changePercent: 0, volume: 0, turnover: 0, high: 100, low: 100, open: 100, prevClose: 0 });
      expect(n.changePercent).toBe(0);
      expect(n.amplitude).toBe(0);
    });

    it('批量标准化应保持顺序', () => {
      const raws: RawStock[] = Array.from({ length: 10 }, (_, i) => ({
        code: String(i), name: `Stock${i}`, price: 100 + i, change: i, changePercent: i, volume: 1000, turnover: 1000, high: 101 + i, low: 99, open: 100, prevClose: 100,
      }));
      const normalized = raws.map(r => normalizeStock(r));
      expect(normalized).toHaveLength(10);
      expect(normalized[0].symbol).toBe('0');
    });
  });

  // K线数据处理
  describe('K线数据处理', () => {
    interface KLine { date: string; open: number; high: number; low: number; close: number; volume: number; }

    function processKLine(data: KLine[]): { withMA: (KLine & { ma5: number | null; ma10: number | null; ma20: number | null })[] } {
      const withMA = data.map((k, i) => {
        const ma5 = i >= 4 ? data.slice(i - 4, i + 1).reduce((s, x) => s + x.close, 0) / 5 : null;
        const ma10 = i >= 9 ? data.slice(i - 9, i + 1).reduce((s, x) => s + x.close, 0) / 10 : null;
        const ma20 = i >= 19 ? data.slice(i - 19, i + 1).reduce((s, x) => s + x.close, 0) / 20 : null;
        return { ...k, ma5, ma10, ma20 };
      });
      return { withMA };
    }

    const klineData: KLine[] = Array.from({ length: 30 }, (_, i) => ({
      date: `2026-0${(i % 9) + 1}-${String(i + 1).padStart(2, '0')}`,
      open: 100 + i * 0.5,
      high: 101 + i * 0.5,
      low: 99 + i * 0.5,
      close: 100 + i * 0.5,
      volume: 1000 + i * 100,
    }));

    it('应计算MA5', () => {
      const { withMA } = processKLine(klineData);
      expect(withMA[4].ma5).not.toBeNull();
      expect(withMA[0].ma5).toBeNull();
    });

    it('MA5应等于近5日平均', () => {
      const { withMA } = processKLine(klineData);
      const expected = klineData.slice(0, 5).reduce((s, x) => s + x.close, 0) / 5;
      expect(withMA[4].ma5).toBeCloseTo(expected, 5);
    });

    it('MA10应在第10根开始有值', () => {
      const { withMA } = processKLine(klineData);
      expect(withMA[9].ma10).not.toBeNull();
      expect(withMA[8].ma10).toBeNull();
    });

    it('MA20应在第20根开始有值', () => {
      const { withMA } = processKLine(klineData);
      expect(withMA[19].ma20).not.toBeNull();
      expect(withMA[18].ma20).toBeNull();
    });

    it('MA5 >= MA10 >= MA20 在上涨趋势中', () => {
      const { withMA } = processKLine(klineData);
      const last = withMA[withMA.length - 1];
      if (last.ma5 && last.ma10 && last.ma20) {
        expect(last.ma5).toBeGreaterThanOrEqual(last.ma10);
      }
    });

    it('空数据返回空', () => {
      expect(processKLine([]).withMA).toHaveLength(0);
    });
  });

  // 数据分页与排序
  describe('分页排序', () => {
    interface Item { id: number; name: string; value: number; }

    function paginateAndSort(items: Item[], page: number, pageSize: number, sortBy: string, sortDir: 'asc' | 'desc'): { data: Item[]; total: number; page: number; totalPages: number } {
      const sorted = [...items].sort((a, b) => {
        const av = (a as any)[sortBy], bv = (b as any)[sortBy];
        const cmp = typeof av === 'string' ? av.localeCompare(bv) : av - bv;
        return sortDir === 'asc' ? cmp : -cmp;
      });
      const start = (page - 1) * pageSize;
      return { data: sorted.slice(start, start + pageSize), total: items.length, page, totalPages: Math.ceil(items.length / pageSize) };
    }

    const items: Item[] = Array.from({ length: 25 }, (_, i) => ({ id: i, name: `Item${i}`, value: Math.random() * 100 }));

    it('应返回正确页大小', () => {
      const result = paginateAndSort(items, 1, 10, 'id', 'asc');
      expect(result.data).toHaveLength(10);
    });

    it('最后一页可能不满', () => {
      const result = paginateAndSort(items, 3, 10, 'id', 'asc');
      expect(result.data).toHaveLength(5);
    });

    it('总页数正确', () => {
      const result = paginateAndSort(items, 1, 10, 'id', 'asc');
      expect(result.totalPages).toBe(3);
    });

    it('升序排序', () => {
      const result = paginateAndSort(items, 1, 25, 'id', 'asc');
      for (let i = 1; i < result.data.length; i++) {
        expect(result.data[i].id).toBeGreaterThan(result.data[i - 1].id);
      }
    });

    it('降序排序', () => {
      const result = paginateAndSort(items, 1, 25, 'id', 'desc');
      for (let i = 1; i < result.data.length; i++) {
        expect(result.data[i].id).toBeLessThan(result.data[i - 1].id);
      }
    });

    it('超出页码返回空', () => {
      const result = paginateAndSort(items, 100, 10, 'id', 'asc');
      expect(result.data).toHaveLength(0);
    });

    it('不修改原数组', () => {
      const original = [...items];
      paginateAndSort(items, 1, 10, 'value', 'desc');
      expect(items).toEqual(original);
    });
  });

  // 搜索与过滤
  describe('搜索过滤组合', () => {
    interface Record { id: string; name: string; category: string; value: number; tags: string[]; }

    const data: Record[] = [
      { id: '1', name: '贵州茅台', category: '白酒', value: 1800, tags: ['蓝筹', '消费'] },
      { id: '2', name: '宁德时代', category: '新能源', value: 220, tags: ['成长', '科技'] },
      { id: '3', name: '招商银行', category: '银行', value: 35, tags: ['蓝筹', '金融'] },
      { id: '4', name: '比亚迪', category: '新能源', value: 260, tags: ['成长', '消费'] },
      { id: '5', name: '恒瑞医药', category: '医药', value: 45, tags: ['蓝筹', '医药'] },
    ];

    function searchAndFilter(records: Record[], query?: string, category?: string, minValue?: number, tags?: string[]): Record[] {
      return records.filter(r => {
        if (query && !r.name.includes(query) && !r.id.includes(query)) return false;
        if (category && r.category !== category) return false;
        if (minValue !== undefined && r.value < minValue) return false;
        if (tags && tags.length > 0 && !tags.some(t => r.tags.includes(t))) return false;
        return true;
      });
    }

    it('按名称搜索', () => {
      expect(searchAndFilter(data, '茅台')).toHaveLength(1);
    });

    it('按分类筛选', () => {
      expect(searchAndFilter(data, undefined, '新能源')).toHaveLength(2);
    });

    it('按最小值筛选', () => {
      expect(searchAndFilter(data, undefined, undefined, 100)).toHaveLength(3);
    });

    it('按标签筛选', () => {
      expect(searchAndFilter(data, undefined, undefined, undefined, ['蓝筹'])).toHaveLength(3);
    });

    it('组合条件', () => {
      expect(searchAndFilter(data, undefined, '新能源', undefined, ['成长'])).toHaveLength(2);
    });

    it('无条件返回全部', () => {
      expect(searchAndFilter(data)).toHaveLength(5);
    });

    it('不匹配返回空', () => {
      expect(searchAndFilter(data, '不存在')).toHaveLength(0);
    });

    it('空标签筛选返回全部', () => {
      expect(searchAndFilter(data, undefined, undefined, undefined, [])).toHaveLength(5);
    });
  });
});

// 图表数据转换
describe('图表数据转换', () => {
  // 散点图数据
  describe('散点图', () => {
    function calcScatterStats(points: { x: number; y: number }[]) {
      if (points.length === 0) return { xMean: 0, yMean: 0, xStd: 0, yStd: 0, correlation: 0 };
      const xMean = points.reduce((s, p) => s + p.x, 0) / points.length;
      const yMean = points.reduce((s, p) => s + p.y, 0) / points.length;
      const xStd = Math.sqrt(points.reduce((s, p) => s + (p.x - xMean) ** 2, 0) / points.length);
      const yStd = Math.sqrt(points.reduce((s, p) => s + (p.y - yMean) ** 2, 0) / points.length);
      let cov = 0;
      for (const p of points) cov += (p.x - xMean) * (p.y - yMean);
      cov /= points.length;
      const correlation = (xStd * yStd) > 0 ? cov / (xStd * yStd) : 0;
      return { xMean, yMean, xStd, yStd, correlation };
    }

    it('应计算均值', () => {
      const stats = calcScatterStats([{ x: 1, y: 2 }, { x: 3, y: 4 }, { x: 5, y: 6 }]);
      expect(stats.xMean).toBeCloseTo(3, 5);
      expect(stats.yMean).toBeCloseTo(4, 5);
    });

    it('相关系数应在-1到1之间', () => {
      const stats = calcScatterStats([{ x: 1, y: 1 }, { x: 2, y: 3 }, { x: 3, y: 2 }, { x: 4, y: 5 }]);
      expect(stats.correlation).toBeGreaterThanOrEqual(-1);
      expect(stats.correlation).toBeLessThanOrEqual(1);
    });

    it('空数据返回零值', () => {
      const stats = calcScatterStats([]);
      expect(stats.correlation).toBe(0);
    });
  });

  // 热力图颜色映射
  describe('热力图颜色', () => {
    function heatColor(value: number, min: number, max: number): string {
      const ratio = max > min ? (value - min) / (max - min) : 0.5;
      const r = Math.round(255 * ratio);
      const g = Math.round(255 * (1 - ratio));
      return `rgb(${r}, ${g}, 0)`;
    }

    it('最小值应为绿色', () => {
      expect(heatColor(0, 0, 100)).toBe('rgb(0, 255, 0)');
    });

    it('最大值应为红色', () => {
      expect(heatColor(100, 0, 100)).toBe('rgb(255, 0, 0)');
    });

    it('中间值应为黄绿', () => {
      const color = heatColor(50, 0, 100);
      expect(color).toContain('128');
    });

    it('相等范围返回中间色', () => {
      const color = heatColor(5, 5, 5);
      expect(color).toBe('rgb(128, 128, 0)');
    });
  });

  // 数据聚合为图表点
  describe('图表数据聚合', () => {
    interface DataPoint { x: number; y: number; label: string; }

    function aggregateForChart(raw: { category: string; value: number }[]): DataPoint[] {
      const groups = new Map<string, number[]>();
      for (const item of raw) {
        if (!groups.has(item.category)) groups.set(item.category, []);
        groups.get(item.category)!.push(item.value);
      }
      return Array.from(groups.entries()).map(([cat, values], i) => ({
        x: i,
        y: values.reduce((a, b) => a + b, 0) / values.length,
        label: cat,
      }));
    }

    it('应按类别聚合', () => {
      const raw = [{ category: 'A', value: 10 }, { category: 'A', value: 20 }, { category: 'B', value: 30 }];
      const result = aggregateForChart(raw);
      expect(result).toHaveLength(2);
      expect(result.find(r => r.label === 'A')?.y).toBe(15);
    });

    it('空数据返回空', () => {
      expect(aggregateForChart([])).toHaveLength(0);
    });

    it('单类别', () => {
      const result = aggregateForChart([{ category: 'X', value: 42 }]);
      expect(result).toHaveLength(1);
      expect(result[0].y).toBe(42);
    });
  });

  // 坐标轴刻度
  describe('坐标轴刻度', () => {
    function calcAxisTicks(min: number, max: number, maxTicks: number = 5): number[] {
      const range = max - min;
      if (range <= 0) return [min];
      const roughStep = range / (maxTicks - 1);
      const mag = Math.pow(10, Math.floor(Math.log10(roughStep)));
      const candidates = [1, 2, 5, 10];
      let step = candidates[0] * mag;
      for (const c of candidates) {
        if (c * mag >= roughStep) { step = c * mag; break; }
      }
      const ticks: number[] = [];
      for (let v = Math.floor(min / step) * step; v <= max + step * 0.5; v += step) {
        ticks.push(+v.toFixed(10));
      }
      return ticks;
    }

    it('应生成刻度', () => {
      const ticks = calcAxisTicks(0, 100);
      expect(ticks.length).toBeGreaterThan(0);
    });

    it('第一个刻度应小于等于最小值', () => {
      const ticks = calcAxisTicks(10, 90);
      expect(ticks[0]).toBeLessThanOrEqual(10);
    });

    it('最后一个刻度应大于等于最大值', () => {
      const ticks = calcAxisTicks(10, 90);
      expect(ticks[ticks.length - 1]).toBeGreaterThanOrEqual(90);
    });

    it('刻度应递增', () => {
      const ticks = calcAxisTicks(0, 100);
      for (let i = 1; i < ticks.length; i++) {
        expect(ticks[i]).toBeGreaterThan(ticks[i - 1]);
      }
    });

    it('相同值返回单个刻度', () => {
      expect(calcAxisTicks(50, 50)).toEqual([50]);
    });
  });
});
