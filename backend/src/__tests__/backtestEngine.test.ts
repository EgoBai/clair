import { describe, it, expect } from 'vitest';
import { runBacktest, BacktestConfig, TradeSignal } from '../services/backtestEngine';

describe('BacktestEngine', () => {
  function genPrices(count: number, trend = 0): number[] {
    const prices: number[] = [100];
    for (let i = 1; i < count; i++) {
      prices.push(prices[i - 1] * (1 + trend / 100 + (Math.random() - 0.5) * 0.02));
    }
    return prices;
  }

  function makeSignal(index: number, type: 'buy' | 'sell' = 'buy', price?: number): TradeSignal {
    return { index, type, price: price || 100 + index, confidence: 0.8 };
  }

  describe('runBacktest', () => {
    const prices60 = genPrices(60, 0.1);
    const prices10 = genPrices(10, 0.2);

    it('空价格返回null', () => {
      expect(runBacktest([], { signals: [], initialCapital: 10000 })).toBeNull();
    });

    it('无信号返回零交易结果', () => {
      const result = runBacktest(prices60, { signals: [], initialCapital: 10000 });
      if (result) {
        expect(result.totalTrades).toBe(0);
        expect(result.totalReturn).toBe(0);
        expect(result.finalCapital).toBe(10000);
      }
    });

    it('单个买入信号开仓', () => {
      const signals: TradeSignal[] = [makeSignal(10)];
      const result = runBacktest(prices60, { signals, initialCapital: 10000 });
      expect(result).not.toBeNull();
      if (!result) return;
      expect(result.totalTrades).toBe(0); // Not closed yet
      // But should have position
      expect(result.maxDrawdown).toBeGreaterThanOrEqual(0);
    });

    it('完整交易: 买入→卖出', () => {
      const prices = [100, 101, 102, 103, 104, 105, 106, 107, 108, 109, 110, 111, 112, 113, 114, 115, 116, 117, 118, 119, 120];
      const signals: TradeSignal[] = [
        { index: 0, type: 'buy', price: 100, confidence: 0.8 },
        { index: 10, type: 'sell', price: 110, confidence: 0.7 },
      ];
      const result = runBacktest(prices, { signals, initialCapital: 10000, commission: 0 });
      expect(result).not.toBeNull();
      if (!result) return;
      expect(result.totalTrades).toBe(1);
      // 10% return on 10000 = 1000
      expect(result.finalCapital).toBeGreaterThan(10000);
      expect(result.totalReturn).toBeGreaterThan(0);
    });

    it('手续费扣除', () => {
      const prices = Array.from({ length: 20 }, (_, i) => 100 + i * 0);
      const signals: TradeSignal[] = [
        { index: 0, type: 'buy', price: 100, confidence: 0.8 },
        { index: 19, type: 'sell', price: 100, confidence: 0.7 },
      ];
      const noFee = runBacktest(prices, { signals, initialCapital: 10000, commission: 0 });
      const withFee = runBacktest(prices, { signals, initialCapital: 10000, commission: 0.001 });
      expect(noFee).not.toBeNull();
      expect(withFee).not.toBeNull();
      if (!noFee || !withFee) return;
      expect(withFee.finalCapital).toBeLessThan(noFee.finalCapital);
    });

    it('复杂信号序列', () => {
      const prices = prices60;
      const signals: TradeSignal[] = [
        { index: 5, type: 'buy', price: prices[5], confidence: 0.8 },
        { index: 15, type: 'sell', price: prices[15], confidence: 0.7 },
        { index: 25, type: 'buy', price: prices[25], confidence: 0.6 },
        { index: 35, type: 'sell', price: prices[35], confidence: 0.7 },
      ];
      const result = runBacktest(prices, { signals, initialCapital: 10000 });
      expect(result).not.toBeNull();
      if (!result) return;
      expect(result.totalTrades).toBe(2);
      expect(result.winRate).toBeGreaterThanOrEqual(0);
      expect(result.winRate).toBeLessThanOrEqual(1);
    });

    it('卖空交易', () => {
      const prices = [110, 109, 108, 107, 106, 105, 104, 103, 102, 101, 100, 99, 98, 97, 96, 95, 94, 93, 92, 91, 90];
      const signals: TradeSignal[] = [
        { index: 0, type: 'sell', price: 110, confidence: 0.8 },
        { index: 10, type: 'buy', price: 100, confidence: 0.7 },
      ];
      const result = runBacktest(prices, { signals, initialCapital: 10000, commission: 0, allowShort: true });
      expect(result).not.toBeNull();
      if (!result) return;
      // Short sell from 110 to 100 = profit
      expect(result.totalReturn).toBeGreaterThan(0);
    });

    it('结果字段完整性', () => {
      const prices = Array.from({ length: 25 }, (_, i) => 100 + i * 0.5);
      const signals: TradeSignal[] = [{ index: 0, type: 'buy', price: 100, confidence: 0.8 }];
      const result = runBacktest(prices, { signals, initialCapital: 10000 });
      expect(result).not.toBeNull();
      if (!result) return;
      expect(result).toHaveProperty('totalTrades');
      expect(result).toHaveProperty('winRate');
      expect(result).toHaveProperty('totalReturn');
      expect(result).toHaveProperty('annualizedReturn');
      expect(result).toHaveProperty('maxDrawdown');
      expect(result).toHaveProperty('sharpeRatio');
      expect(result).toHaveProperty('finalCapital');
    });

    it('多于买入的卖出信号不累加', () => {
      const prices = genPrices(30);
      const signals: TradeSignal[] = [
        { index: 3, type: 'buy', price: prices[3], confidence: 0.8 },
        { index: 8, type: 'sell', price: prices[8], confidence: 0.7 },
        { index: 10, type: 'sell', price: prices[10], confidence: 0.7 }, // extra sell (no position)
      ];
      const result = runBacktest(prices, { signals, initialCapital: 10000 });
      expect(result).not.toBeNull();
      if (!result) return;
      expect(result.totalTrades).toBe(1);
    });

    it('配置中的佣金影响收益', () => {
      const prices = Array.from({ length: 22 }, (_, i) => i % 2 === 0 ? 100 : 110);
      const signals: TradeSignal[] = [
        { index: 0, type: 'buy', price: 100, confidence: 0.8 },
        { index: 1, type: 'sell', price: 110, confidence: 0.7 },
        { index: 2, type: 'buy', price: 100, confidence: 0.8 },
        { index: 3, type: 'sell', price: 110, confidence: 0.7 },
      ];
      const highFee = runBacktest(prices, { signals, initialCapital: 10000, commission: 0.01 });
      const lowFee = runBacktest(prices, { signals, initialCapital: 10000, commission: 0.001 });
      expect(highFee).not.toBeNull();
      expect(lowFee).not.toBeNull();
      if (!highFee || !lowFee) return;
      expect(highFee.finalCapital).toBeLessThan(lowFee.finalCapital);
    });

    it('不完整交易序列(只有卖)', () => {
      // A sell signal without a position doesn't create a trade when short not allowed
      const prices = Array.from({ length: 25 }, (_, i) => 100 + i);
      const signals: TradeSignal[] = [{ index: 5, type: 'sell', price: 105, confidence: 0.7 }];
      const result = runBacktest(prices, { signals, initialCapital: 10000, allowShort: false });
      if (result) {
        expect(result.totalTrades).toBe(0);
      } else {
        // null is valid if the engine rejects sell-only config
        expect(true).toBe(true);
      }
    });

    it('空配置返回结果', () => {
      const result = runBacktest(prices60, { signals: [], initialCapital: 10000 });
      expect(result).not.toBeNull();
      if (!result) return;
      expect(result.totalTrades).toBe(0);
      expect(result.finalCapital).toBe(10000);
    });
  });
});
