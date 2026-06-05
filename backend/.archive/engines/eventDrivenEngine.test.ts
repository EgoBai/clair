import { describe, it, expect } from 'vitest';
import {
  analyzeEventImpact,
  detectEventClusters,
  calculateEventRiskScore,
  prioritizeEvents,
  MarketEvent,
} from '../services/eventDrivenEngine';

describe('事件驱动策略引擎', () => {
  const mockEvent: MarketEvent = {
    type: 'earnings',
    symbol: '600519.SH',
    timestamp: new Date('2024-01-15T10:00:00'),
    data: { eps: 25.5, revenue: 1200 },
    impact: 'positive',
    magnitude: 0.8,
  };

  describe('事件影响分析', () => {
    it('应分析财报事件信号', () => {
      const signal = analyzeEventImpact(mockEvent, 1800);
      expect(signal.symbol).toBe('600519.SH');
      expect(signal.direction).toBe('long');
      expect(signal.confidence).toBeGreaterThan(0.5);
    });

    it('负面财报应生成空头信号', () => {
      const negativeEvent = { ...mockEvent, impact: 'negative' as const };
      const signal = analyzeEventImpact(negativeEvent, 1800);
      expect(signal.direction).toBe('short');
    });

    it('分红事件应生成多头信号', () => {
      const dividendEvent: MarketEvent = { ...mockEvent, type: 'dividend', impact: 'positive' };
      const signal = analyzeEventImpact(dividendEvent, 1800);
      expect(signal.direction).toBe('long');
      expect(signal.riskLevel).toBe('low');
    });

    it('停牌事件应为中性', () => {
      const haltEvent: MarketEvent = { ...mockEvent, type: 'halt', impact: 'neutral' };
      const signal = analyzeEventImpact(haltEvent, 1800);
      expect(signal.direction).toBe('neutral');
      expect(signal.riskLevel).toBe('high');
    });

    it('合并事件应有长持续时间', () => {
      const mergerEvent: MarketEvent = { ...mockEvent, type: 'merger', impact: 'positive' };
      const signal = analyzeEventImpact(mergerEvent, 1800);
      expect(signal.expectedDuration).toBeGreaterThan(100);
    });

    it('应设置止损止盈', () => {
      const signal = analyzeEventImpact(mockEvent, 1800);
      expect(signal.stopLoss).toBeDefined();
      expect(signal.takeProfit).toBeDefined();
      if (signal.direction === 'long') {
        expect(signal.stopLoss!).toBeLessThan(1800);
        expect(signal.takeProfit!).toBeGreaterThan(1800);
      }
    });

    it('政策事件应有中等风险', () => {
      const policyEvent: MarketEvent = { ...mockEvent, type: 'policy', impact: 'positive' };
      const signal = analyzeEventImpact(policyEvent, 10);
      expect(signal.riskLevel).toBe('medium');
    });

    it('大宗交易方向应基于价格', () => {
      const blockAbove: MarketEvent = { ...mockEvent, type: 'block_trade', data: { price: 1850 } };
      const signalAbove = analyzeEventImpact(blockAbove, 1800);
      expect(signalAbove.direction).toBe('long');

      const blockBelow: MarketEvent = { ...mockEvent, type: 'block_trade', data: { price: 1750 } };
      const signalBelow = analyzeEventImpact(blockBelow, 1800);
      expect(signalBelow.direction).toBe('short');
    });

    it('信心值不应超过0.95', () => {
      const highMag: MarketEvent = { ...mockEvent, magnitude: 1.0 };
      const signal = analyzeEventImpact(highMag, 1800);
      expect(signal.confidence).toBeLessThanOrEqual(0.95);
    });

    it('应包含原因说明', () => {
      const signal = analyzeEventImpact(mockEvent, 1800);
      expect(signal.reason).toContain('earnings');
    });

    it('调仓事件应有低风险', () => {
      const rebalEvent: MarketEvent = { ...mockEvent, type: 'index_rebalance', impact: 'positive' };
      const signal = analyzeEventImpact(rebalEvent, 10);
      expect(signal.riskLevel).toBe('low');
    });

    it('拆股事件应为多头', () => {
      const splitEvent: MarketEvent = { ...mockEvent, type: 'split' };
      const signal = analyzeEventImpact(splitEvent, 100);
      expect(signal.direction).toBe('long');
    });
  });

  describe('事件聚类检测', () => {
    it('无事件应返回空聚类', () => {
      expect(detectEventClusters([])).toEqual([]);
    });

    it('单事件不形成聚类', () => {
      expect(detectEventClusters([mockEvent])).toEqual([]);
    });

    it('应检测时间窗口内聚类', () => {
      const events: MarketEvent[] = [
        { ...mockEvent, timestamp: new Date('2024-01-15T10:00:00') },
        { ...mockEvent, timestamp: new Date('2024-01-15T10:30:00'), type: 'policy' },
        { ...mockEvent, timestamp: new Date('2024-01-15T11:00:00'), type: 'dividend' },
      ];
      const clusters = detectEventClusters(events, 60);
      expect(clusters.length).toBe(1);
      expect(clusters[0].events.length).toBe(3);
    });

    it('时间窗口外事件应分开', () => {
      const events: MarketEvent[] = [
        { ...mockEvent, timestamp: new Date('2024-01-15T10:00:00') },
        { ...mockEvent, timestamp: new Date('2024-01-15T10:30:00'), type: 'policy' },
        { ...mockEvent, timestamp: new Date('2024-01-15T14:00:00'), type: 'dividend' },
        { ...mockEvent, timestamp: new Date('2024-01-15T14:30:00'), type: 'split' },
      ];
      const clusters = detectEventClusters(events, 60);
      expect(clusters.length).toBe(2);
    });

    it('应收集聚类中的标的', () => {
      const events: MarketEvent[] = [
        { ...mockEvent, timestamp: new Date('2024-01-15T10:00:00') },
        { ...mockEvent, symbol: '000858.SZ', timestamp: new Date('2024-01-15T10:30:00') },
      ];
      const clusters = detectEventClusters(events, 60);
      expect(clusters[0].symbols.length).toBe(2);
    });
  });

  describe('风险评分', () => {
    it('无事件应返回0风险', () => {
      expect(calculateEventRiskScore([])).toBe(0);
    });

    it('财报事件应有高风险', () => {
      const risk = calculateEventRiskScore([mockEvent]);
      expect(risk).toBeGreaterThan(0.5);
    });

    it('分红事件应有低风险', () => {
      const dividend: MarketEvent = { ...mockEvent, type: 'dividend', magnitude: 0.3 };
      const risk = calculateEventRiskScore([dividend]);
      expect(risk).toBeLessThan(0.3);
    });

    it('多个事件应平均风险', () => {
      const events = [mockEvent, { ...mockEvent, type: 'dividend' as const, magnitude: 0.3 }];
      const risk = calculateEventRiskScore(events);
      expect(risk).toBeGreaterThan(0);
      expect(risk).toBeLessThan(1);
    });
  });

  describe('事件优先级排序', () => {
    it('应按优先级排序', () => {
      const events: MarketEvent[] = [
        { ...mockEvent, type: 'split', magnitude: 0.5 },
        { ...mockEvent, type: 'halt', magnitude: 0.8 },
        { ...mockEvent, type: 'earnings', magnitude: 0.7 },
      ];
      const sorted = prioritizeEvents(events);
      expect(sorted[0].type).toBe('halt');
      expect(sorted[1].type).toBe('earnings');
    });

    it('空事件应返回空', () => {
      expect(prioritizeEvents([])).toEqual([]);
    });

    it('不应修改原数组', () => {
      const events = [{ ...mockEvent, type: 'split' as const }, { ...mockEvent, type: 'halt' as const }];
      const original = [...events];
      prioritizeEvents(events);
      expect(events[0].type).toBe(original[0].type);
    });
  });
});
