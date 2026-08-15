import { describe, it, expect } from 'vitest';
import {
  InsiderClusterEngine,
  type InsiderTrade,
} from '../utils/insiderClusterEngine';

/**
 * 内部人集群分析引擎测试 —— 导入真实模块 src/utils/insiderClusterEngine.ts
 *
 * 旧测试把 detectCluster / analyzeByRole / calculateInsiderSentiment 内联为独立函数，且与真实类存在
 * 多处行为差异：
 *  - 真实类构造函数默认 minClusterSize=3（旧默认 2），direction 规则为 buyCount>sellCount*2；
 *  - analyzeByRole 返回 netShares/signalStrength/weight，无 netDirection；
 *  - 真实类没有 calculateInsiderSentiment，只有 generateSignal。
 * 因此改为驱动真实 InsiderClusterEngine 实例。
 */

const DAY = 86400000;

function makeTrade(overrides: Partial<InsiderTrade> = {}): InsiderTrade {
  return {
    insider: 'Zhang',
    role: 'ceo',
    date: Date.now(),
    type: 'buy',
    shares: 10000,
    price: 50,
    amount: 500000,
    ...overrides,
  };
}

describe('内部人集群分析引擎 (InsiderClusterEngine)', () => {
  const engine = new InsiderClusterEngine(); // clusterWindow=30, minClusterSize=3

  describe('detectCluster', () => {
    it('在窗口内检测到集群', () => {
      const now = Date.now();
      const trades = [
        makeTrade({ date: now }),
        makeTrade({ date: now + DAY * 5, insider: 'Li', role: 'director' }),
        makeTrade({ date: now + DAY * 10, insider: 'Wang', role: 'cfo' }),
      ];
      const result = engine.detectCluster(trades);
      expect(result.detected).toBe(true);
      expect(result.clusterSize).toBe(3);
      expect(result.direction).toBe('buy');
      expect(result.avgTradeSize).toBeGreaterThan(0);
    });

    it('单笔交易不触发集群', () => {
      const result = engine.detectCluster([makeTrade()]);
      expect(result.detected).toBe(false);
      expect(result.clusterSize).toBe(0);
    });

    it('不足 minClusterSize 时 direction 为 mixed', () => {
      const now = Date.now();
      const trades = [
        makeTrade({ date: now, type: 'buy' }),
        makeTrade({ date: now + DAY, type: 'sell', insider: 'Li' }),
      ];
      const result = engine.detectCluster(trades);
      expect(result.detected).toBe(false);
      expect(result.direction).toBe('mixed');
    });

    it('显著性随集群规模增大而提高', () => {
      const now = Date.now();
      const small = engine.detectCluster([
        makeTrade({ date: now }),
        makeTrade({ date: now + DAY, insider: 'Li' }),
      ]);
      const large = engine.detectCluster([
        makeTrade({ date: now }),
        makeTrade({ date: now + DAY, insider: 'Li' }),
        makeTrade({ date: now + DAY * 2, insider: 'Wang' }),
        makeTrade({ date: now + DAY * 3, insider: 'Zhao' }),
      ]);
      expect(large.significance).toBeGreaterThan(small.significance);
      expect(large.detected).toBe(true);
    });
  });

  describe('detectTimingPattern', () => {
    it('空输入返回 normal', () => {
      const pattern = engine.detectTimingPattern([], []);
      expect(pattern.pattern).toBe('normal');
      expect(pattern.confidence).toBe(0);
    });

    it('公告前交易识别为 pre_announcement', () => {
      const now = Date.now();
      const announcement = now + DAY * 10;
      const pattern = engine.detectTimingPattern(
        [makeTrade({ date: now })],
        [announcement]
      );
      expect(pattern.pattern).toBe('pre_announcement');
      expect(pattern.daysBeforeEvent).toBeCloseTo(10, 1);
      expect(pattern.confidence).toBeGreaterThan(0);
    });
  });

  describe('analyzeByRole', () => {
    it('按角色分组并计算净股数与信号强度', () => {
      const trades = [
        makeTrade({ role: 'ceo', type: 'buy' }),
        makeTrade({ role: 'ceo', type: 'sell', insider: 'Li' }),
        makeTrade({ role: 'cfo', type: 'buy', insider: 'Wang' }),
      ];
      const result = engine.analyzeByRole(trades);
      const ceo = result.find(r => r.role === 'ceo');
      const cfo = result.find(r => r.role === 'cfo');
      expect(ceo?.buyCount).toBe(1);
      expect(ceo?.sellCount).toBe(1);
      expect(ceo?.netShares).toBe(0);
      expect(ceo?.signalStrength).toBe(0);
      expect(ceo?.weight).toBe(3);
      expect(cfo?.buyCount).toBe(1);
      expect(cfo?.netShares).toBe(10000);
      expect(cfo?.signalStrength).toBe(250);
      expect(cfo?.weight).toBe(2.5);
    });
  });

  describe('generateSignal', () => {
    it('集中增持生成 strong_buy 信号', () => {
      const now = Date.now();
      const trades = [
        makeTrade({ date: now }),
        makeTrade({ date: now + DAY, insider: 'Li', role: 'director' }),
        makeTrade({ date: now + DAY * 2, insider: 'Wang', role: 'cfo' }),
      ];
      const signal = engine.generateSignal(trades);
      expect(signal.signal).toContain('buy');
      expect(signal.clusterDetected).toBe(true);
      expect(signal.score).toBeGreaterThan(0);
      expect(signal.score).toBeLessThanOrEqual(100);
      expect(signal.reliability).toBeGreaterThanOrEqual(0);
      expect(signal.reliability).toBeLessThanOrEqual(1);
      expect(signal.recommendation).toContain('买入');
    });

    it('未达集群规模时信号不明确', () => {
      const trades = [
        makeTrade({ type: 'buy' }),
        makeTrade({ type: 'sell', insider: 'Li' }),
      ];
      const signal = engine.generateSignal(trades);
      expect(signal.clusterDetected).toBe(false);
      expect(signal.signal).toBe('neutral');
    });
  });
});
