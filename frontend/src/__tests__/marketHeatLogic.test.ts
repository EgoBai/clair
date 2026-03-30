import { describe, it, expect } from 'vitest';

/**
 * 市场热力仪表盘测试
 * 测试热力图计算、颜色映射、板块聚合
 */
describe('Market Heat Dashboard Logic', () => {
  describe('Heatmap Color Mapping', () => {
    function getHeatColor(changePercent: number): string {
      if (changePercent >= 5) return '#dc2626';      // deep red
      if (changePercent >= 3) return '#ef4444';
      if (changePercent >= 1) return '#f87171';
      if (changePercent > 0) return '#fca5a5';
      if (changePercent === 0) return '#9ca3af';      // gray
      if (changePercent > -1) return '#86efac';
      if (changePercent > -3) return '#34d399';
      if (changePercent > -5) return '#10b981';
      return '#059669';                                // deep green
    }

    it('should return red for positive changes', () => {
      expect(getHeatColor(3.5)).toMatch(/#e[f8c]/);
      expect(getHeatColor(10)).toBe('#dc2626');
    });

    it('should return green for negative changes', () => {
      expect(getHeatColor(-3.5)).toMatch(/#(34|10|05|86)/);
      expect(getHeatColor(-10)).toBe('#059669');
    });

    it('should return gray for zero', () => {
      expect(getHeatColor(0)).toBe('#9ca3af');
    });

    it('should have 9 color levels', () => {
      const levels = [5, 3, 1, 0.5, 0, -0.5, -1, -3, -5];
      const colors = new Set(levels.map(l => getHeatColor(l)));
      expect(colors.size).toBe(9);
    });
  });

  describe('Treemap Size Calculation', () => {
    function calculateTreemapItems(
      items: Array<{ name: string; value: number }>,
      width: number,
      height: number
    ) {
      const total = items.reduce((sum, item) => sum + item.value, 0);
      if (total === 0) return [];

      let x = 0;
      return items.map(item => {
        const ratio = item.value / total;
        const itemWidth = width * ratio;
        return {
          ...item,
          x,
          y: 0,
          width: itemWidth,
          height,
          ratio,
        };
      });
    }

    it('should calculate proportional sizes', () => {
      const items = [
        { name: 'A', value: 300 },
        { name: 'B', value: 200 },
        { name: 'C', value: 500 },
      ];
      const result = calculateTreemapItems(items, 1000, 500);
      expect(result[0].ratio).toBe(0.3);
      expect(result[1].ratio).toBe(0.2);
      expect(result[2].ratio).toBe(0.5);
    });

    it('should fill total area', () => {
      const items = [{ name: 'A', value: 100 }, { name: 'B', value: 200 }];
      const result = calculateTreemapItems(items, 1000, 500);
      const totalRatio = result.reduce((s, r) => s + r.ratio, 0);
      expect(totalRatio).toBeCloseTo(1);
    });

    it('should handle empty items', () => {
      expect(calculateTreemapItems([], 1000, 500)).toEqual([]);
    });

    it('should handle zero total', () => {
      const items = [{ name: 'A', value: 0 }];
      expect(calculateTreemapItems(items, 1000, 500)).toEqual([]);
    });
  });

  describe('Sector Aggregation', () => {
    interface StockData {
      symbol: string;
      name: string;
      sector: string;
      changePercent: number;
      marketCap: number;
    }

    function aggregateBySector(stocks: StockData[]) {
      const sectors = new Map<string, { stocks: StockData[]; totalCap: number; avgChange: number }>();
      stocks.forEach(stock => {
        if (!sectors.has(stock.sector)) {
          sectors.set(stock.sector, { stocks: [], totalCap: 0, avgChange: 0 });
        }
        const sector = sectors.get(stock.sector)!;
        sector.stocks.push(stock);
        sector.totalCap += stock.marketCap;
      });
      sectors.forEach((sector) => {
        sector.avgChange = sector.stocks.reduce((s, st) => s + st.changePercent, 0) / sector.stocks.length;
      });
      return sectors;
    }

    const stocks: StockData[] = [
      { symbol: '600519', name: '茅台', sector: '白酒', changePercent: 2, marketCap: 20000 },
      { symbol: '000858', name: '五粮液', sector: '白酒', changePercent: 1, marketCap: 5000 },
      { symbol: '300750', name: '宁德', sector: '新能源', changePercent: -1, marketCap: 8000 },
    ];

    it('should aggregate stocks by sector', () => {
      const result = aggregateBySector(stocks);
      expect(result.size).toBe(2);
      expect(result.get('白酒')?.stocks.length).toBe(2);
      expect(result.get('新能源')?.stocks.length).toBe(1);
    });

    it('should calculate total market cap per sector', () => {
      const result = aggregateBySector(stocks);
      expect(result.get('白酒')?.totalCap).toBe(25000);
      expect(result.get('新能源')?.totalCap).toBe(8000);
    });

    it('should calculate average change per sector', () => {
      const result = aggregateBySector(stocks);
      expect(result.get('白酒')?.avgChange).toBe(1.5);
      expect(result.get('新能源')?.avgChange).toBe(-1);
    });
  });

  describe('Heat Score Calculation', () => {
    function calculateHeatScore(params: {
      changePercent: number;
      turnover: number;
      volume: number;
      stockCount: number;
    }) {
      const weights = { change: 0.35, turnover: 0.3, volume: 0.2, breadth: 0.15 };
      const normalizedChange = Math.min(Math.max(params.changePercent / 10, -1), 1);
      const normalizedTurnover = Math.min(params.turnover / 1e10, 1);
      const normalizedVolume = Math.min(params.volume / 1e9, 1);
      const normalizedBreadth = Math.min(params.stockCount / 200, 1);

      return (
        normalizedChange * weights.change +
        normalizedTurnover * weights.turnover +
        normalizedVolume * weights.volume +
        normalizedBreadth * weights.breadth
      ) * 100;
    }

    it('should return positive score for active sectors', () => {
      const score = calculateHeatScore({
        changePercent: 3, turnover: 5e9, volume: 5e8, stockCount: 100,
      });
      expect(score).toBeGreaterThan(0);
    });

    it('should return higher score for hotter sectors', () => {
      const hot = calculateHeatScore({ changePercent: 5, turnover: 1e10, volume: 1e9, stockCount: 200 });
      const cold = calculateHeatScore({ changePercent: 0.5, turnover: 1e8, volume: 1e7, stockCount: 10 });
      expect(hot).toBeGreaterThan(cold);
    });

    it('should cap score at 100', () => {
      const score = calculateHeatScore({ changePercent: 20, turnover: 1e11, volume: 1e10, stockCount: 500 });
      expect(score).toBeLessThanOrEqual(100);
    });
  });

  describe('Time Range Selection', () => {
    function getDateRange(range: '1d' | '5d' | '1m' | '3m' | '1y'): { start: Date; end: Date } {
      const end = new Date();
      const start = new Date();
      switch (range) {
        case '1d': start.setDate(end.getDate() - 1); break;
        case '5d': start.setDate(end.getDate() - 5); break;
        case '1m': start.setMonth(end.getMonth() - 1); break;
        case '3m': start.setMonth(end.getMonth() - 3); break;
        case '1y': start.setFullYear(end.getFullYear() - 1); break;
      }
      return { start, end };
    }

    it('should calculate 1 day range', () => {
      const { start, end } = getDateRange('1d');
      const diff = end.getTime() - start.getTime();
      expect(diff).toBeGreaterThanOrEqual(86400000 - 1000);
      expect(diff).toBeLessThanOrEqual(86400000 + 1000);
    });

    it('should calculate 5 day range', () => {
      const { start, end } = getDateRange('5d');
      const days = Math.round((end.getTime() - start.getTime()) / 86400000);
      expect(days).toBe(5);
    });

    it('should have start before end', () => {
      const ranges: Array<'1d' | '5d' | '1m' | '3m' | '1y'> = ['1d', '5d', '1m', '3m', '1y'];
      ranges.forEach(range => {
        const { start, end } = getDateRange(range);
        expect(start.getTime()).toBeLessThan(end.getTime());
      });
    });
  });
});
