import { describe, it, expect } from 'vitest';
import { InsiderClusterEngine, InsiderTrade } from '../utils/insiderClusterEngine';

describe('Insider Cluster Engine', () => {
  const engine = new InsiderClusterEngine(30, 3);

  const makeTrades = (count: number, type: 'buy' | 'sell' = 'buy'): InsiderTrade[] => {
    const base = Date.now() - 30 * 86400000;
    return Array.from({ length: count }, (_, i) => ({
      insider: `insider_${i}`,
      role: (['ceo', 'cfo', 'director', 'officer'] as const)[i % 4],
      date: base + i * 2 * 86400000,
      type,
      shares: 10000 + Math.floor(Math.random() * 50000),
      price: 10 + Math.random() * 5,
      amount: 100000 + Math.random() * 500000,
    }));
  };

  describe('detectCluster', () => {
    it('应检测买入集群', () => {
      const trades = makeTrades(5, 'buy');
      const result = engine.detectCluster(trades);
      expect(result.detected).toBe(true);
      expect(result.clusterSize).toBe(5);
      expect(result.direction).toBe('buy');
    });

    it('数据不足应返回未检测', () => {
      const trades = makeTrades(2, 'buy');
      const result = engine.detectCluster(trades);
      expect(result.detected).toBe(false);
    });

    it('显著性应在0-100之间', () => {
      const trades = makeTrades(5, 'buy');
      const result = engine.detectCluster(trades);
      expect(result.significance).toBeGreaterThanOrEqual(0);
      expect(result.significance).toBeLessThanOrEqual(100);
    });
  });

  describe('detectTimingPattern', () => {
    it('应识别时序模式', () => {
      const trades = makeTrades(5, 'buy');
      const events = [Date.now() - 15 * 86400000];
      const result = engine.detectTimingPattern(trades, events);
      expect(['pre_announcement', 'post_announcement', 'quarter_end', 'normal']).toContain(result.pattern);
      expect(result.confidence).toBeGreaterThanOrEqual(0);
    });

    it('空数据应返回normal', () => {
      const result = engine.detectTimingPattern([], []);
      expect(result.pattern).toBe('normal');
    });
  });

  describe('analyzeByRole', () => {
    it('应按角色分析', () => {
      const trades = makeTrades(8, 'buy');
      const result = engine.analyzeByRole(trades);
      expect(result.length).toBeGreaterThan(0);
      for (const r of result) {
        expect(r.buyCount + r.sellCount).toBeGreaterThan(0);
        expect(r.weight).toBeGreaterThan(0);
      }
    });

    it('CEO权重应最高', () => {
      const trades = makeTrades(8, 'buy');
      const result = engine.analyzeByRole(trades);
      const ceo = result.find(r => r.role === 'ceo');
      const officer = result.find(r => r.role === 'officer');
      if (ceo && officer) {
        expect(ceo.weight).toBeGreaterThan(officer.weight);
      }
    });
  });

  describe('generateSignal', () => {
    it('应生成买入信号', () => {
      const trades = makeTrades(8, 'buy');
      const signal = engine.generateSignal(trades);
      expect(['strong_buy', 'buy', 'neutral', 'sell', 'strong_sell']).toContain(signal.signal);
      expect(signal.score).toBeGreaterThanOrEqual(0);
      expect(signal.score).toBeLessThanOrEqual(100);
    });

    it('应生成卖出信号', () => {
      const trades = makeTrades(8, 'sell');
      const signal = engine.generateSignal(trades);
      expect(['strong_buy', 'buy', 'neutral', 'sell', 'strong_sell']).toContain(signal.signal);
    });

    it('可靠性应在0-1之间', () => {
      const trades = makeTrades(5, 'buy');
      const signal = engine.generateSignal(trades);
      expect(signal.reliability).toBeGreaterThanOrEqual(0);
      expect(signal.reliability).toBeLessThanOrEqual(1);
    });
  });
});
