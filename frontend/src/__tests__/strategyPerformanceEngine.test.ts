import { describe, it, expect } from 'vitest';
import {
  calculatePerformance,
  sectorAttribution,
  analyzeDrawdowns,
  tradeAttribution,
  type DailyReturn,
  type Trade,
} from '../utils/strategyPerformanceEngine';

function makeReturn(overrides: Partial<DailyReturn> = {}): DailyReturn {
  return {
    date: '2026-01-01',
    strategyReturn: 0.01,
    benchmarkReturn: 0.005,
    positions: [{ ticker: '600519', weight: 0.5, return: 0.02 }],
    ...overrides,
  };
}

function makeTrade(overrides: Partial<Trade> = {}): Trade {
  return {
    ticker: '600519',
    side: 'buy',
    price: 100,
    quantity: 100,
    date: '2026-01-01',
    sector: '白酒',
    fees: 5,
    ...overrides,
  };
}

describe('Strategy Performance Engine', () => {
  describe('calculatePerformance', () => {
    it('should return zero metrics for empty returns', () => {
      const metrics = calculatePerformance([]);
      expect(metrics.totalReturn).toBe(0);
      expect(metrics.sharpeRatio).toBe(0);
    });

    it('should calculate total return', () => {
      const returns = [
        makeReturn({ strategyReturn: 0.01 }),
        makeReturn({ strategyReturn: 0.02 }),
        makeReturn({ strategyReturn: -0.005 }),
      ];
      const metrics = calculatePerformance(returns);

      // (1.01 * 1.02 * 0.995) - 1 = 0.0248...
      expect(metrics.totalReturn).toBeCloseTo(0.0249, 2);
    });

    it('should calculate volatility', () => {
      const returns = Array.from({ length: 30 }, (_, i) =>
        makeReturn({ strategyReturn: (i % 2 === 0 ? 0.01 : -0.01) })
      );
      const metrics = calculatePerformance(returns);
      expect(metrics.volatility).toBeGreaterThan(0);
    });

    it('should calculate Sharpe ratio', () => {
      const returns = Array.from({ length: 30 }, () =>
        makeReturn({ strategyReturn: 0.005 })
      );
      const metrics = calculatePerformance(returns);
      expect(metrics.sharpeRatio).toBeGreaterThan(0);
    });

    it('should calculate max drawdown', () => {
      const returns = [
        makeReturn({ strategyReturn: 0.1 }),
        makeReturn({ strategyReturn: 0.1 }),
        makeReturn({ strategyReturn: -0.15 }),
        makeReturn({ strategyReturn: -0.1 }),
      ];
      const metrics = calculatePerformance(returns);
      expect(metrics.maxDrawdown).toBeGreaterThan(0);
    });

    it('should calculate win rate', () => {
      const returns = [
        makeReturn({ strategyReturn: 0.01 }),
        makeReturn({ strategyReturn: 0.02 }),
        makeReturn({ strategyReturn: -0.005 }),
      ];
      const metrics = calculatePerformance(returns);
      expect(metrics.winRate).toBeCloseTo(2/3, 2);
    });

    it('should calculate beta', () => {
      const returns = Array.from({ length: 20 }, (_, i) =>
        makeReturn({
          strategyReturn: i * 0.001,
          benchmarkReturn: i * 0.0005,
        })
      );
      const metrics = calculatePerformance(returns);
      expect(typeof metrics.beta).toBe('number');
      expect(typeof metrics.alpha).toBe('number');
    });

    it('should calculate Sortino ratio', () => {
      const returns = Array.from({ length: 30 }, (_, i) =>
        makeReturn({ strategyReturn: i % 3 === 0 ? -0.005 : 0.01 })
      );
      const metrics = calculatePerformance(returns);
      expect(typeof metrics.sortinoRatio).toBe('number');
    });

    it('should calculate profit factor', () => {
      const returns = [
        makeReturn({ strategyReturn: 0.02 }),
        makeReturn({ strategyReturn: 0.01 }),
        makeReturn({ strategyReturn: -0.005 }),
      ];
      const metrics = calculatePerformance(returns);
      expect(metrics.profitFactor).toBeGreaterThan(0);
    });
  });

  describe('sectorAttribution', () => {
    it('should calculate sector contributions', () => {
      const returns = [
        makeReturn({
          positions: [
            { ticker: '科技', weight: 0.5, return: 0.02 },
            { ticker: '金融', weight: 0.5, return: -0.01 },
          ],
        }),
      ];
      const benchWeights = new Map([
        ['科技', 0.3],
        ['金融', 0.7],
      ]);

      const result = sectorAttribution(returns, benchWeights);
      expect(result.length).toBeGreaterThan(0);
      result.forEach(s => {
        expect(typeof s.contribution).toBe('number');
        expect(typeof s.selection).toBe('number');
        expect(typeof s.allocation).toBe('number');
      });
    });
  });

  describe('analyzeDrawdowns', () => {
    it('should identify drawdowns', () => {
      const returns = [
        makeReturn({ strategyReturn: 0.1 }),
        makeReturn({ strategyReturn: 0.1 }),
        makeReturn({ strategyReturn: -0.15 }),
        makeReturn({ strategyReturn: 0.1 }),
        makeReturn({ strategyReturn: 0.1 }),
      ];
      const result = analyzeDrawdowns(returns);

      expect(result.maxDrawdown).toBeGreaterThan(0);
      expect(result.drawdowns.length).toBeGreaterThan(0);
    });

    it('should track current drawdown', () => {
      const returns = [
        makeReturn({ strategyReturn: 0.1 }),
        makeReturn({ strategyReturn: -0.1 }),
      ];
      const result = analyzeDrawdowns(returns);
      expect(result.currentDrawdown).toBeGreaterThan(0);
    });

    it('should handle no drawdown', () => {
      const returns = [
        makeReturn({ strategyReturn: 0.01 }),
        makeReturn({ strategyReturn: 0.02 }),
        makeReturn({ strategyReturn: 0.01 }),
      ];
      const result = analyzeDrawdowns(returns);
      expect(result.maxDrawdown).toBe(0);
    });
  });

  describe('tradeAttribution', () => {
    it('should calculate trade statistics', () => {
      const trades = [
        makeTrade({ ticker: 'A', side: 'buy', price: 100, quantity: 100 }),
        makeTrade({ ticker: 'A', side: 'sell', price: 110, quantity: 100 }),
        makeTrade({ ticker: 'B', side: 'buy', price: 50, quantity: 200 }),
        makeTrade({ ticker: 'B', side: 'sell', price: 45, quantity: 200 }),
      ];
      const result = tradeAttribution(trades);

      expect(result.totalTrades).toBeGreaterThan(0);
      expect(result.winningTrades).toBeGreaterThan(0);
      expect(result.losingTrades).toBeGreaterThan(0);
      expect(result.bestTrade.pnl).toBeGreaterThan(0);
      expect(result.worstTrade.pnl).toBeLessThan(0);
    });

    it('should group by sector', () => {
      const trades = [
        makeTrade({ sector: '科技' }),
        makeTrade({ sector: '金融', ticker: 'X' }),
      ];
      const result = tradeAttribution(trades);
      expect(result.bySector.length).toBeGreaterThan(0);
    });

    it('should handle empty trades', () => {
      const result = tradeAttribution([]);
      expect(result.totalTrades).toBe(0);
    });
  });
});
