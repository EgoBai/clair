import { describe, it, expect } from 'vitest';
import {
  classifyEventImpact,
  calculateEventImpact,
  analyzeEventPatterns,
  buildEventCalendar,
  calculateCatalystScore,
  predictEarningsReaction,
  detectEventClusters,
  type StockEvent,
  type EventImpact,
} from '../utils/eventDrivenEngine';

describe('EventDrivenEngine', () => {
  const earningsEvent: StockEvent = {
    ticker: '000001',
    type: 'earnings',
    date: '2024-03-15',
    description: 'Q1财报超预期',
    importance: 'high',
    sentiment: 'positive',
    data: { eps: 1.5, estimate: 1.2 },
  };

  const maEvent: StockEvent = {
    ticker: '000002',
    type: 'ma',
    date: '2024-03-20',
    description: '重大并购',
    importance: 'high',
    sentiment: 'positive',
    data: { sector: '科技' },
  };

  const negativeEvent: StockEvent = {
    ticker: '000003',
    type: 'policy',
    date: '2024-03-10',
    description: '行业监管加强',
    importance: 'medium',
    sentiment: 'negative',
    data: { sector: '教育' },
  };

  describe('classifyEventImpact', () => {
    it('should return positive score for positive events', () => {
      const score = classifyEventImpact(earningsEvent);
      expect(score).toBeGreaterThan(0);
    });

    it('should return negative score for negative events', () => {
      const score = classifyEventImpact(negativeEvent);
      expect(score).toBeLessThan(0);
    });

    it('should return 0 for neutral events', () => {
      const neutral: StockEvent = { ...earningsEvent, sentiment: 'neutral' };
      expect(classifyEventImpact(neutral)).toBe(0);
    });

    it('should weight high importance higher', () => {
      const high: StockEvent = { ...earningsEvent, importance: 'high' };
      const low: StockEvent = { ...earningsEvent, importance: 'low' };
      expect(Math.abs(classifyEventImpact(high))).toBeGreaterThan(Math.abs(classifyEventImpact(low)));
    });

    it('should weight black swan events highest', () => {
      const blackSwan: StockEvent = { ...earningsEvent, type: 'black_swan' };
      const earnings: StockEvent = { ...earningsEvent, type: 'earnings' };
      expect(Math.abs(classifyEventImpact(blackSwan))).toBeGreaterThan(Math.abs(classifyEventImpact(earnings)));
    });
  });

  describe('calculateEventImpact', () => {
    it('should calculate pre and post event returns', () => {
      const impact = calculateEventImpact(
        earningsEvent,
        [10, 10.5, 11],
        [11, 11.5, 12],
        [100, 101, 102]
      );
      expect(impact.preEventReturn).toBeCloseTo(0.1, 1);
      expect(impact.postEventReturn).toBeCloseTo(1/11, 2);
    });

    it('should calculate abnormal return', () => {
      const impact = calculateEventImpact(
        earningsEvent,
        [10, 11],
        [11, 13],
        [100, 101]
      );
      expect(typeof impact.abnormalReturn).toBe('number');
    });

    it('should include volatility change', () => {
      const impact = calculateEventImpact(
        earningsEvent,
        [10, 10.1, 10.2, 10.3],
        [11, 11.5, 12, 12.5],
        [100, 101, 102, 103]
      );
      expect(typeof impact.volatilityChange).toBe('number');
    });

    it('should calculate impact score', () => {
      const impact = calculateEventImpact(
        earningsEvent,
        [10, 11],
        [11, 12],
        [100, 101]
      );
      expect(impact.impactScore).toBeGreaterThan(0);
    });

    it('should handle insufficient data', () => {
      const impact = calculateEventImpact(earningsEvent, [10], [11], [100]);
      expect(impact.preEventReturn).toBe(0);
      expect(impact.postEventReturn).toBe(0);
    });
  });

  describe('analyzeEventPatterns', () => {
    it('should analyze patterns from impacts', () => {
      const impacts: EventImpact[] = [
        calculateEventImpact(earningsEvent, [10, 11], [11, 12], [100, 101]),
        calculateEventImpact(negativeEvent, [10, 11], [11, 10], [100, 101]),
      ];
      const patterns = analyzeEventPatterns(impacts);
      expect(patterns.length).toBeGreaterThan(0);
    });

    it('should include win rate', () => {
      const impacts: EventImpact[] = [
        calculateEventImpact(earningsEvent, [10, 11], [11, 12], [100, 101]),
      ];
      const patterns = analyzeEventPatterns(impacts);
      for (const p of patterns) {
        expect(p.winRate).toBeGreaterThanOrEqual(0);
        expect(p.winRate).toBeLessThanOrEqual(1);
      }
    });

    it('should sort by absolute impact', () => {
      const impacts: EventImpact[] = [
        calculateEventImpact(earningsEvent, [10, 11], [11, 12], [100, 101]),
        calculateEventImpact(maEvent, [10, 11], [11, 14], [100, 101]),
      ];
      const patterns = analyzeEventPatterns(impacts);
      for (let i = 1; i < patterns.length; i++) {
        expect(Math.abs(patterns[i - 1].avgImpact)).toBeGreaterThanOrEqual(Math.abs(patterns[i].avgImpact));
      }
    });
  });

  describe('buildEventCalendar', () => {
    it('should build calendar for date range', () => {
      const calendar = buildEventCalendar(
        [earningsEvent, maEvent, negativeEvent],
        '2024-03-01',
        '2024-03-31'
      );
      expect(calendar.length).toBeGreaterThan(0);
    });

    it('should classify market impact', () => {
      const calendar = buildEventCalendar(
        [earningsEvent, maEvent],
        '2024-03-15',
        '2024-03-20'
      );
      for (const day of calendar) {
        expect(['high', 'medium', 'low']).toContain(day.marketImpact);
      }
    });

    it('should include affected sectors', () => {
      const calendar = buildEventCalendar(
        [earningsEvent, maEvent],
        '2024-03-01',
        '2024-03-31'
      );
      for (const day of calendar) {
        expect(Array.isArray(day.affectedSectors)).toBe(true);
      }
    });

    it('should return empty for no events in range', () => {
      const calendar = buildEventCalendar([earningsEvent], '2024-04-01', '2024-04-30');
      expect(calendar.length).toBe(0);
    });
  });

  describe('calculateCatalystScore', () => {
    it('should calculate catalyst score', () => {
      const score = calculateCatalystScore('000001', [earningsEvent], []);
      expect(score.score).toBeGreaterThanOrEqual(0);
      expect(score.score).toBeLessThanOrEqual(100);
    });

    it('should return valid recommendation', () => {
      const score = calculateCatalystScore('000001', [earningsEvent], []);
      expect(['strong_positive', 'positive', 'neutral', 'negative', 'strong_negative']).toContain(score.recommendation);
    });

    it('should factor in historical impacts', () => {
      const histImpact = calculateEventImpact(earningsEvent, [10, 11], [11, 13], [100, 101]);
      const score = calculateCatalystScore('000001', [earningsEvent], [histImpact]);
      expect(score.historicalImpact).toBeDefined();
    });

    it('should boost score for positive upcoming events', () => {
      const neutral = calculateCatalystScore('000001', [], []);
      const positive = calculateCatalystScore('000001', [earningsEvent], []);
      expect(positive.score).toBeGreaterThan(neutral.score);
    });
  });

  describe('predictEarningsReaction', () => {
    it('should predict direction for positive surprise', () => {
      const result = predictEarningsReaction(1.5, 1.0, [0.1, 0.05, 0.2, 0.08]);
      expect(result.direction).toBe('up');
    });

    it('should predict direction for negative surprise', () => {
      const result = predictEarningsReaction(0.5, 1.0, [0.1, 0.05, 0.2, 0.08]);
      expect(result.direction).toBe('down');
    });

    it('should include confidence score', () => {
      const result = predictEarningsReaction(1.5, 1.0, [0.1, 0.05]);
      expect(result.confidence).toBeGreaterThanOrEqual(0);
      expect(result.confidence).toBeLessThanOrEqual(1);
    });

    it('should use default multiplier without history', () => {
      const result = predictEarningsReaction(1.2, 1.0, []);
      expect(result.expectedMove).toBeDefined();
    });

    it('should handle zero estimate', () => {
      const result = predictEarningsReaction(0.5, 0, []);
      expect(result.expectedMove).toBe(0);
    });
  });

  describe('detectEventClusters', () => {
    it('should detect clusters of events', () => {
      const events: StockEvent[] = [
        { ...earningsEvent, date: '2024-03-15' },
        { ...maEvent, date: '2024-03-16' },
        { ...negativeEvent, date: '2024-03-17' },
      ];
      const clusters = detectEventClusters(events);
      expect(clusters.length).toBeGreaterThan(0);
    });

    it('should sort by cluster score', () => {
      const events: StockEvent[] = [
        { ...earningsEvent, date: '2024-03-15' },
        { ...maEvent, date: '2024-03-16' },
        { ...negativeEvent, date: '2024-03-25' },
      ];
      const clusters = detectEventClusters(events);
      for (let i = 1; i < clusters.length; i++) {
        expect(Math.abs(clusters[i - 1].clusterScore)).toBeGreaterThanOrEqual(
          Math.abs(clusters[i].clusterScore)
        );
      }
    });

    it('should return empty for single events', () => {
      const clusters = detectEventClusters([earningsEvent]);
      expect(clusters.length).toBe(0);
    });

    it('should respect window size', () => {
      const events: StockEvent[] = [
        { ...earningsEvent, date: '2024-03-15' },
        { ...maEvent, date: '2024-03-20' },
      ];
      const narrowClusters = detectEventClusters(events, 3);
      expect(narrowClusters.length).toBe(0);
      
      const wideClusters = detectEventClusters(events, 10);
      expect(wideClusters.length).toBeGreaterThan(0);
    });
  });
});
