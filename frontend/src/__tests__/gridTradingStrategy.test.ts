import { describe, it, expect } from 'vitest';

// 网格交易策略引擎测试
describe('网格交易策略引擎', () => {
  describe('等差网格', () => {
    function arithmeticGrid(lower: number, upper: number, gridCount: number): number[] {
      if (gridCount < 2 || upper <= lower) return [];
      const step = (upper - lower) / (gridCount - 1);
      return Array.from({ length: gridCount }, (_, i) => lower + i * step);
    }

    it('生成正确数量的网格线', () => {
      expect(arithmeticGrid(10, 20, 5)).toHaveLength(5);
    });

    it('首尾等于边界', () => {
      const grid = arithmeticGrid(10, 20, 5);
      expect(grid[0]).toBe(10);
      expect(grid[4]).toBe(20);
    });

    it('网格间距相等', () => {
      const grid = arithmeticGrid(10, 20, 5);
      for (let i = 1; i < grid.length; i++) {
        expect(grid[i] - grid[i - 1]).toBeCloseTo(2.5, 5);
      }
    });

    it('上界小于下界返回空', () => {
      expect(arithmeticGrid(20, 10, 5)).toHaveLength(0);
    });

    it('网格数小于2返回空', () => {
      expect(arithmeticGrid(10, 20, 1)).toHaveLength(0);
    });
  });

  describe('等比网格', () => {
    function geometricGrid(lower: number, upper: number, gridCount: number): number[] {
      if (gridCount < 2 || upper <= lower || lower <= 0) return [];
      const ratio = Math.pow(upper / lower, 1 / (gridCount - 1));
      return Array.from({ length: gridCount }, (_, i) => lower * Math.pow(ratio, i));
    }

    it('生成正确数量的网格线', () => {
      expect(geometricGrid(10, 20, 5)).toHaveLength(5);
    });

    it('首尾等于边界', () => {
      const grid = geometricGrid(10, 20, 5);
      expect(grid[0]).toBeCloseTo(10, 5);
      expect(grid[4]).toBeCloseTo(20, 5);
    });

    it('相邻网格比例相等', () => {
      const grid = geometricGrid(10, 20, 5);
      const ratio = grid[1] / grid[0];
      for (let i = 2; i < grid.length; i++) {
        expect(grid[i] / grid[i - 1]).toBeCloseTo(ratio, 5);
      }
    });

    it('下界为零返回空', () => {
      expect(geometricGrid(0, 20, 5)).toHaveLength(0);
    });
  });

  describe('网格交易信号', () => {
    interface GridLevel { price: number; type: 'buy' | 'sell'; filled: boolean; }

    function gridSignals(currentPrice: number, gridLevels: GridLevel[]): { buySignals: number[]; sellSignals: number[] } {
      const buySignals: number[] = [], sellSignals: number[] = [];
      for (const level of gridLevels) {
        if (level.filled) continue;
        if (level.type === 'buy' && currentPrice <= level.price) buySignals.push(level.price);
        else if (level.type === 'sell' && currentPrice >= level.price) sellSignals.push(level.price);
      }
      return { buySignals, sellSignals };
    }

    it('价格低于买入线触发买入信号', () => {
      const levels: GridLevel[] = [
        { price: 10, type: 'buy', filled: false },
        { price: 15, type: 'sell', filled: false },
      ];
      expect(gridSignals(9, levels).buySignals).toContain(10);
    });

    it('价格高于卖出线触发卖出信号', () => {
      const levels: GridLevel[] = [
        { price: 10, type: 'buy', filled: false },
        { price: 15, type: 'sell', filled: false },
      ];
      expect(gridSignals(16, levels).sellSignals).toContain(15);
    });

    it('已成交的不触发信号', () => {
      const levels: GridLevel[] = [
        { price: 10, type: 'buy', filled: true },
        { price: 15, type: 'sell', filled: false },
      ];
      expect(gridSignals(9, levels).buySignals).toHaveLength(0);
    });

    it('价格在中间无信号', () => {
      const levels: GridLevel[] = [
        { price: 10, type: 'buy', filled: false },
        { price: 15, type: 'sell', filled: false },
      ];
      const r = gridSignals(12, levels);
      expect(r.buySignals).toHaveLength(0);
      expect(r.sellSignals).toHaveLength(0);
    });
  });

  describe('网格收益率估算', () => {
    function estimateGridReturn(gridCount: number, priceRange: [number, number], avgVolatility: number, commission: number): number {
      const [lower, upper] = priceRange;
      const gridSpacing = (upper - lower) / (gridCount - 1);
      const gridProfitRate = gridSpacing / ((upper + lower) / 2);
      const tradesPerGrid = avgVolatility / (gridSpacing / ((upper + lower) / 2));
      const profitPerTrade = gridProfitRate - commission * 2;
      return Math.max(0, profitPerTrade * tradesPerGrid * (gridCount - 1));
    }

    it('更多网格可能更高收益', () => {
      const r5 = estimateGridReturn(5, [10, 20], 0.02, 0.001);
      const r10 = estimateGridReturn(10, [10, 20], 0.02, 0.001);
      expect(r10).toBeGreaterThan(r5);
    });

    it('高佣金降低收益', () => {
      const low = estimateGridReturn(5, [10, 20], 0.02, 0.0005);
      const high = estimateGridReturn(5, [10, 20], 0.02, 0.01);
      expect(low).toBeGreaterThan(high);
    });

    it('收益非负', () => {
      expect(estimateGridReturn(5, [10, 20], 0.01, 0.001)).toBeGreaterThanOrEqual(0);
    });
  });

  describe('网格风险控制', () => {
    function gridRiskMetrics(price: number, gridLevels: number[], position: number, maxPosition: number): {
      utilization: number;
      distanceToNearest: number;
      riskLevel: 'low' | 'medium' | 'high';
    } {
      const utilization = position / maxPosition;
      const distances = gridLevels.map(l => Math.abs(l - price));
      const distanceToNearest = Math.min(...distances);
      let riskLevel: 'low' | 'medium' | 'high' = 'low';
      if (utilization > 0.8) riskLevel = 'high';
      else if (utilization > 0.5) riskLevel = 'medium';
      return { utilization, distanceToNearest, riskLevel };
    }

    it('高仓位为高风险', () => {
      expect(gridRiskMetrics(10, [8, 9, 10, 11, 12], 900, 1000).riskLevel).toBe('high');
    });

    it('低仓位为低风险', () => {
      expect(gridRiskMetrics(10, [8, 9, 10, 11, 12], 200, 1000).riskLevel).toBe('low');
    });

    it('利用率为比例', () => {
      expect(gridRiskMetrics(10, [8, 12], 500, 1000).utilization).toBe(0.5);
    });

    it('距离最近网格线', () => {
      expect(gridRiskMetrics(10.1, [8, 9, 10, 11, 12], 500, 1000).distanceToNearest).toBeCloseTo(0.1, 5);
    });
  });
});
