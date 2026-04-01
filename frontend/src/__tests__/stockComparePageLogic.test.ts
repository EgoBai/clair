/**
 * 股票对比页逻辑测试
 * 覆盖对比指标计算、相对强弱、雷达图数据
 */

import { describe, it, expect } from 'vitest';

describe('股票对比页逻辑', () => {
  describe('归一化价格序列', () => {
    function normalizePrices(prices: number[], base: number = 100): number[] {
      if (prices.length === 0) return [];
      const first = prices[0];
      return prices.map(p => Math.round((p / first) * base * 100) / 100);
    }

    it('应以首日为基准归一化', () => {
      const result = normalizePrices([100, 110, 105, 120]);
      expect(result[0]).toBe(100);
      expect(result[1]).toBe(110);
      expect(result[2]).toBe(105);
      expect(result[3]).toBe(120);
    });

    it('不同起点可比较', () => {
      const a = normalizePrices([50, 55, 52]);
      const b = normalizePrices([200, 220, 208]);
      expect(a[0]).toBe(100);
      expect(b[0]).toBe(100);
      expect(a[1]).toBe(b[1]); // 都涨10%
    });

    it('空数组返回空', () => {
      expect(normalizePrices([])).toEqual([]);
    });
  });

  describe('相对强弱比率', () => {
    function calcRelativeStrength(pricesA: number[], pricesB: number[]): number[] {
      const len = Math.min(pricesA.length, pricesB.length);
      const rs: number[] = [];
      for (let i = 0; i < len; i++) {
        rs.push(Math.round((pricesA[i] / pricesB[i]) * 1000) / 1000);
      }
      return rs;
    }

    it('应正确计算RS比率', () => {
      const rs = calcRelativeStrength([100, 110, 120], [100, 105, 108]);
      expect(rs[0]).toBe(1);
      expect(rs[1]).toBeCloseTo(1.048, 2);
    });
  });

  describe('对比指标计算', () => {
    interface StockMetrics {
      symbol: string;
      totalReturn: number;
      volatility: number;
      maxDrawdown: number;
      sharpeRatio: number;
    }

    function rankMetrics(stocks: StockMetrics[]): Record<string, Record<string, number>> {
      const metrics: (keyof Omit<StockMetrics, 'symbol'>)[] = ['totalReturn', 'sharpeRatio'];
      const ranks: Record<string, Record<string, number>> = {};
      for (const m of metrics) {
        const sorted = [...stocks].sort((a, b) => b[m] - a[m]);
        sorted.forEach((s, i) => {
          if (!ranks[s.symbol]) ranks[s.symbol] = {};
          ranks[s.symbol][m] = i + 1;
        });
      }
      return ranks;
    }

    it('应正确排序排名', () => {
      const stocks: StockMetrics[] = [
        { symbol: 'A', totalReturn: 30, volatility: 15, maxDrawdown: 10, sharpeRatio: 1.5 },
        { symbol: 'B', totalReturn: 20, volatility: 20, maxDrawdown: 15, sharpeRatio: 0.8 },
        { symbol: 'C', totalReturn: 40, volatility: 25, maxDrawdown: 20, sharpeRatio: 1.2 },
      ];
      const ranks = rankMetrics(stocks);
      expect(ranks['C'].totalReturn).toBe(1);
      expect(ranks['A'].sharpeRatio).toBe(1);
      expect(ranks['B'].totalReturn).toBe(3);
    });
  });

  describe('雷达图数据', () => {
    function buildRadarData(stock: {
      profitability: number;
      growth: number;
      valuation: number;
      momentum: number;
      quality: number;
    }): { indicator: string; value: number }[] {
      return [
        { indicator: '盈利能力', value: stock.profitability },
        { indicator: '成长性', value: stock.growth },
        { indicator: '估值', value: stock.valuation },
        { indicator: '动量', value: stock.momentum },
        { indicator: '质量', value: stock.quality },
      ];
    }

    it('应包含5个维度', () => {
      const data = buildRadarData({
        profitability: 80, growth: 70, valuation: 60, momentum: 90, quality: 75,
      });
      expect(data).toHaveLength(5);
      expect(data.map(d => d.indicator)).toContain('盈利能力');
      expect(data.map(d => d.indicator)).toContain('动量');
    });
  });

  describe('涨跌幅对比表', () => {
    function buildCompareTable(stocks: { symbol: string; changes: Record<string, number> }[]): Record<string, { best: string; worst: string }> {
      const periods = Object.keys(stocks[0]?.changes || {});
      const result: Record<string, { best: string; worst: string }> = {};
      for (const period of periods) {
        let best = stocks[0], worst = stocks[0];
        for (const s of stocks) {
          if (s.changes[period] > best.changes[period]) best = s;
          if (s.changes[period] < worst.changes[period]) worst = s;
        }
        result[period] = { best: best.symbol, worst: worst.symbol };
      }
      return result;
    }

    it('应找出各期最优和最差', () => {
      const stocks = [
        { symbol: 'A', changes: { '1w': 5, '1m': 10, '3m': 20 } },
        { symbol: 'B', changes: { '1w': -2, '1m': 15, '3m': 8 } },
        { symbol: 'C', changes: { '1w': 3, '1m': 5, '3m': 25 } },
      ];
      const table = buildCompareTable(stocks);
      expect(table['1w'].best).toBe('A');
      expect(table['1w'].worst).toBe('B');
      expect(table['3m'].best).toBe('C');
    });
  });
});
