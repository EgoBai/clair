import { describe, it, expect } from 'vitest';
import {
  analyzeDarkPool,
  detectBlockTradeAlerts,
  analyzeVWAP,
  DarkPoolTrade,
} from '../utils/darkPoolEngine';

function makeTrades(n = 10): DarkPoolTrade[] {
  return Array.from({ length: n }, (_, i) => ({
    ticker: '600519',
    date: `2026-03-${String(i + 1).padStart(2, '0')}`,
    volume: 1e5 + Math.random() * 5e5,
    value: 1e8 + Math.random() * 5e8,
    price: 1800 + Math.random() * 50,
    vwap: 1800 + Math.random() * 30,
    discount: (Math.random() - 0.5) * 3,
    buyerType: 'institution' as const,
    sellerType: 'hedge_fund' as const,
  }));
}

describe('Dark Pool Engine', () => {
  describe('analyzeDarkPool', () => {
    it('应汇总暗池交易', () => {
      const result = analyzeDarkPool(makeTrades());
      expect(result.totalVolume).toBeGreaterThan(0);
      expect(result.totalValue).toBeGreaterThan(0);
    });

    it('应计算参与率', () => {
      const result = analyzeDarkPool(makeTrades());
      expect(result.participationRate).toBeGreaterThanOrEqual(0);
    });

    it('应分析机构活动', () => {
      const result = analyzeDarkPool(makeTrades());
      expect(['buy', 'sell', 'balanced']).toContain(result.institutionalActivity.dominantSide);
    });

    it('应判断信号', () => {
      const result = analyzeDarkPool(makeTrades());
      expect(['accumulation', 'distribution', 'neutral']).toContain(result.signal);
    });

    it('应计算信心度', () => {
      const result = analyzeDarkPool(makeTrades());
      expect(result.confidence).toBeGreaterThanOrEqual(0);
      expect(result.confidence).toBeLessThanOrEqual(1);
    });

    it('应处理空数据', () => {
      const result = analyzeDarkPool([]);
      expect(result.totalVolume).toBe(0);
      expect(result.signal).toBe('neutral');
    });
  });

  describe('detectBlockTradeAlerts', () => {
    it('应检测大宗交易', () => {
      const trades = makeTrades();
      trades[0].value = 1e9; // 超大额
      const alerts = detectBlockTradeAlerts(trades, 1e8);
      expect(alerts.length).toBeGreaterThan(0);
    });

    it('应评估重要性', () => {
      const trades = [{ ...makeTrades()[0], value: 1e9 }];
      const alerts = detectBlockTradeAlerts(trades, 1e8);
      expect(['high', 'medium', 'low']).toContain(alerts[0].significance);
    });

    it('应按金额排序', () => {
      const trades = makeTrades();
      trades[0].value = 1e10;
      trades[1].value = 1e9;
      const alerts = detectBlockTradeAlerts(trades, 1e8);
      for (let i = 1; i < alerts.length; i++) {
        expect(alerts[i - 1].value).toBeGreaterThanOrEqual(alerts[i].value);
      }
    });
  });

  describe('analyzeVWAP', () => {
    it('应计算VWAP', () => {
      const trades = [
        { price: 100, volume: 1000 },
        { price: 101, volume: 2000 },
        { price: 99, volume: 1500 },
      ];
      const result = analyzeVWAP('TEST', '2026-03-01', trades, 100);
      expect(result.vwap).toBeGreaterThan(0);
    });

    it('应计算偏离度', () => {
      const trades = [{ price: 100, volume: 1000 }];
      const result = analyzeVWAP('TEST', '2026-03-01', trades, 102);
      expect(result.deviation).toBeGreaterThan(0);
    });

    it('应给出信号', () => {
      const trades = [{ price: 100, volume: 1000 }];
      const result = analyzeVWAP('TEST', '2026-03-01', trades, 99);
      expect(['buy_below', 'sell_above', 'neutral']).toContain(result.signal);
    });
  });
});
