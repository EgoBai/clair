import { describe, it, expect } from 'vitest';
import { InsiderTradingEngine } from '../utils/insiderTradingEngine';
import type { InsiderTrade } from '../utils/insiderTradingEngine';

describe('InsiderTradingEngine', () => {
  const engine = new InsiderTradingEngine();

  const today = new Date().toISOString().split('T')[0];
  const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];
  const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString().split('T')[0];

  const makeTrade = (overrides: Partial<InsiderTrade> = {}): InsiderTrade => ({
    insider: '张三',
    role: 'ceo',
    type: 'buy',
    shares: 10000,
    price: 50,
    date: today,
    isDerivative: false,
    ...overrides,
  });

  describe('信号分析', () => {
    it('应检测买入信号', () => {
      const trades = [
        makeTrade({ insider: 'A', type: 'buy', shares: 10000 }),
        makeTrade({ insider: 'B', type: 'buy', shares: 8000 }),
        makeTrade({ insider: 'C', type: 'buy', shares: 5000 }),
      ];
      const signal = engine.analyzeSignal(trades);
      expect(signal.direction).toBe('bullish');
      expect(signal.netShares).toBeGreaterThan(0);
    });

    it('应检测卖出信号', () => {
      const trades = [
        makeTrade({ insider: 'A', type: 'sell', shares: 10000 }),
        makeTrade({ insider: 'B', type: 'sell', shares: 8000 }),
        makeTrade({ insider: 'C', type: 'sell', shares: 5000 }),
      ];
      const signal = engine.analyzeSignal(trades);
      expect(signal.direction).toBe('bearish');
      expect(signal.netShares).toBeLessThan(0);
    });

    it('买卖平衡应为中性', () => {
      const trades = [
        makeTrade({ insider: 'A', type: 'buy', shares: 10000 }),
        makeTrade({ insider: 'B', type: 'sell', shares: 10000 }),
      ];
      const signal = engine.analyzeSignal(trades);
      expect(signal.direction).toBe('neutral');
    });

    it('应检测集群买入', () => {
      const trades = [
        makeTrade({ insider: 'A', type: 'buy', shares: 10000, date: today }),
        makeTrade({ insider: 'B', type: 'buy', shares: 8000, date: yesterday }),
        makeTrade({ insider: 'C', type: 'buy', shares: 5000, date: weekAgo }),
      ];
      const signal = engine.analyzeSignal(trades);
      expect(signal.clusterBuying).toBe(true);
    });

    it('应检测高管买入', () => {
      const trades = [
        makeTrade({ role: 'ceo', type: 'buy', shares: 10000 }),
        makeTrade({ role: 'cfo', type: 'buy', shares: 5000 }),
      ];
      const signal = engine.analyzeSignal(trades);
      expect(signal.highLevelBuying).toBe(true);
    });

    it('散户交易不触发高管买入', () => {
      const trades = [
        makeTrade({ role: 'largeShareholder', type: 'buy', shares: 10000 }),
      ];
      const signal = engine.analyzeSignal(trades);
      expect(signal.highLevelBuying).toBe(false);
    });

    it('空交易应返回中性', () => {
      const signal = engine.analyzeSignal([]);
      expect(signal.direction).toBe('neutral');
      expect(signal.strength).toBe(50);
    });

    it('衍生品交易应被排除', () => {
      const trades = [
        makeTrade({ type: 'buy', shares: 10000, isDerivative: true }),
      ];
      const signal = engine.analyzeSignal(trades);
      expect(signal.buyVolume).toBe(0);
    });

    it('强度应在0-100之间', () => {
      const buyTrades = Array.from({ length: 10 }, (_, i) =>
        makeTrade({ insider: `P${i}`, type: 'buy', shares: 10000 })
      );
      const signal = engine.analyzeSignal(buyTrades);
      expect(signal.strength).toBeGreaterThanOrEqual(0);
      expect(signal.strength).toBeLessThanOrEqual(100);
    });
  });

  describe('季度趋势', () => {
    it('应按季度分组', () => {
      const trades = [
        makeTrade({ date: '2024-01-15', type: 'buy' }),
        makeTrade({ date: '2024-04-20', type: 'sell' }),
        makeTrade({ date: '2024-07-10', type: 'buy' }),
      ];
      const trend = engine.quarterlyTrend(trades);
      expect(trend.length).toBe(3);
      expect(trend[0].period).toBe('2024-Q1');
      expect(trend[1].period).toBe('2024-Q2');
      expect(trend[2].period).toBe('2024-Q3');
    });

    it('应统计买卖数量', () => {
      const trades = [
        makeTrade({ date: '2024-01-15', type: 'buy' }),
        makeTrade({ date: '2024-01-20', type: 'buy' }),
        makeTrade({ date: '2024-01-25', type: 'sell' }),
      ];
      const trend = engine.quarterlyTrend(trades);
      expect(trend[0].buyCount).toBe(2);
      expect(trend[0].sellCount).toBe(1);
    });

    it('应计算平均价格', () => {
      const trades = [
        makeTrade({ date: '2024-01-15', type: 'buy', price: 48 }),
        makeTrade({ date: '2024-01-20', type: 'buy', price: 52 }),
      ];
      const trend = engine.quarterlyTrend(trades);
      expect(trend[0].avgBuyPrice).toBe(50);
    });

    it('空数据应返回空数组', () => {
      const trend = engine.quarterlyTrend([]);
      expect(trend).toEqual([]);
    });
  });

  describe('异常检测', () => {
    it('应检测超大交易', () => {
      const trades = [
        ...Array.from({ length: 10 }, () => makeTrade({ shares: 100 })),
        makeTrade({ shares: 50000 }), // >> average of ~4645
      ];
      const anomalies = engine.detectAnomalies(trades);
      expect(anomalies.length).toBeGreaterThan(0);
      expect(anomalies.some(a => a.severity === 'high')).toBe(true);
    });

    it('不足3条交易不检测异常', () => {
      const trades = [
        makeTrade({ shares: 10000 }),
        makeTrade({ shares: 50000 }),
      ];
      const anomalies = engine.detectAnomalies(trades);
      expect(anomalies).toEqual([]);
    });

    it('应检测密集交易', () => {
      const trades = [
        makeTrade({ date: '2024-01-01', shares: 1000 }),
        makeTrade({ date: '2024-01-02', shares: 1000 }),
        makeTrade({ date: '2024-01-03', shares: 1000 }),
      ];
      const anomalies = engine.detectAnomalies(trades);
      expect(anomalies.length).toBeGreaterThan(0);
    });
  });

  describe('边界情况', () => {
    it('单条交易不应报错', () => {
      expect(() => engine.analyzeSignal([makeTrade()])).not.toThrow();
    });

    it('同日多次交易不应报错', () => {
      const trades = [
        makeTrade({ date: today, shares: 5000 }),
        makeTrade({ date: today, shares: 3000 }),
      ];
      expect(() => engine.analyzeSignal(trades)).not.toThrow();
    });

    it('零股交易不应报错', () => {
      expect(() => engine.analyzeSignal([makeTrade({ shares: 0 })])).not.toThrow();
    });
  });
});
