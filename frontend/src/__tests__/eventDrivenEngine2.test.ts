import { describe, it, expect } from 'vitest';
import {
  analyzeEventImpact,
  analyzeLockupExpiry,
  analyzeEarningsPreAnnouncement,
  buildEventCalendar,
  MarketEvent,
} from '../utils/eventDrivenEngine2';

function makeEvent(overrides: Partial<MarketEvent> = {}): MarketEvent {
  return {
    id: '1',
    ticker: '600519',
    type: 'earnings_pre',
    date: '2026-04-15',
    description: '业绩预告',
    impact: 'positive',
    magnitude: 5,
    confidence: 0.8,
    ...overrides,
  };
}

describe('Event Driven Engine 2', () => {
  describe('analyzeEventImpact', () => {
    it('应分析事件影响', () => {
      const result = analyzeEventImpact(makeEvent());
      expect(typeof result.expectedReturn).toBe('number');
    });

    it('应给出交易策略', () => {
      const result = analyzeEventImpact(makeEvent());
      expect(['buy', 'sell', 'hold', 'straddle', 'avoid']).toContain(result.tradingStrategy.action);
    });

    it('应计算风险收益比', () => {
      const result = analyzeEventImpact(makeEvent());
      expect(result.tradingStrategy.riskReward).toBeGreaterThan(0);
    });

    it('负面事件应建议卖出', () => {
      const result = analyzeEventImpact(makeEvent({ impact: 'negative', confidence: 0.9 }));
      expect(result.tradingStrategy.action).toBe('sell');
    });

    it('停牌应建议回避', () => {
      const result = analyzeEventImpact(makeEvent({ type: 'suspension', impact: 'neutral', confidence: 0.5 }));
      expect(result.tradingStrategy.action).toBe('avoid');
    });
  });

  describe('analyzeLockupExpiry', () => {
    it('应计算解禁比例', () => {
      const result = analyzeLockupExpiry('600519', '2026-04-15', 10000, 100000, 1500, 1800);
      expect(result.ratio).toBe(10);
    });

    it('应判断抛压', () => {
      const result = analyzeLockupExpiry('600519', '2026-04-15', 20000, 100000, 1000, 2000);
      expect(['high', 'moderate', 'low']).toContain(result.pressure);
    });

    it('应估算卖出比例', () => {
      const result = analyzeLockupExpiry('600519', '2026-04-15', 10000, 100000, 1500, 1800);
      expect(result.estimatedSelling).toBeGreaterThan(0);
      expect(result.estimatedSelling).toBeLessThanOrEqual(0.8);
    });

    it('应计算盈亏比', () => {
      const result = analyzeLockupExpiry('600519', '2026-04-15', 10000, 100000, 1500, 1800);
      expect(result.profitLoss).toBeCloseTo(0.2, 1); // (1800-1500)/1500 = 0.2
    });
  });

  describe('analyzeEarningsPreAnnouncement', () => {
    it('应判断预增信号', () => {
      const result = analyzeEarningsPreAnnouncement('600519', '预增', 60, '2026Q1');
      expect(['strong_bullish', 'bullish']).toContain(result.signal);
    });

    it('应判断预减信号', () => {
      const result = analyzeEarningsPreAnnouncement('600519', '预减', -60, '2026Q1');
      expect(['strong_bearish', 'bearish']).toContain(result.signal);
    });

    it('应判断扭亏信号', () => {
      const result = analyzeEarningsPreAnnouncement('600519', '扭亏', 100, '2026Q1');
      expect(['strong_bullish', 'bullish']).toContain(result.signal);
    });

    it('应判断首亏信号', () => {
      const result = analyzeEarningsPreAnnouncement('600519', '首亏', -100, '2026Q1');
      expect(['strong_bearish', 'bearish']).toContain(result.signal);
    });
  });

  describe('buildEventCalendar', () => {
    it('应构建事件日历', () => {
      const events = [
        makeEvent({ date: '2026-04-15', type: 'earnings_pre' }),
        makeEvent({ date: '2026-04-15', type: 'dividend', impact: 'neutral' }),
        makeEvent({ date: '2026-04-16', type: 'lockup_expiry', impact: 'negative' }),
      ];
      const calendar = buildEventCalendar(events);
      expect(calendar.length).toBe(2); // 2个不同日期
    });

    it('应评估风险等级', () => {
      const events = [
        makeEvent({ date: '2026-04-15', magnitude: 10 }),
        makeEvent({ date: '2026-04-15', magnitude: 12 }),
        makeEvent({ date: '2026-04-15', magnitude: 8 }),
      ];
      const calendar = buildEventCalendar(events);
      expect(['low', 'moderate', 'high', 'extreme']).toContain(calendar[0].riskLevel);
    });

    it('应排序日期', () => {
      const events = [
        makeEvent({ date: '2026-04-16' }),
        makeEvent({ date: '2026-04-15' }),
      ];
      const calendar = buildEventCalendar(events);
      expect(calendar[0].date).toBe('2026-04-15');
    });
  });
});
