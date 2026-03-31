import { describe, it, expect } from 'vitest';
import {
  evaluateEarningsPreview,
  evaluateDividendEvent,
  evaluateBonusEvent,
  evaluateRestructuringEvent,
  buildEventPortfolio,
  analyzeHistoricalEventImpact,
  type EventSignal,
} from '../utils/eventDrivenStrategyEngine';

describe('事件驱动策略引擎', () => {
  describe('evaluateEarningsPreview', () => {
    it('should evaluate positive preview', () => {
      const result = evaluateEarningsPreview('SH600001', '2026-01-15', 50, 20);
      expect(result.event.impact).toBe('positive');
      expect(result.expectedReturn).toBeGreaterThan(0);
    });

    it('should evaluate negative preview', () => {
      const result = evaluateEarningsPreview('SH600001', '2026-01-15', -60, -20);
      expect(result.event.impact).toBe('negative');
      expect(result.riskLevel).toBe('high');
    });

    it('should evaluate neutral preview', () => {
      const result = evaluateEarningsPreview('SH600001', '2026-01-15', 5, 3);
      expect(result.event.impact).toBe('neutral');
    });

    it('should include reasoning', () => {
      const result = evaluateEarningsPreview('SH600001', '2026-01-15', 50, 20);
      expect(result.reasoning).toContain('50');
    });
  });

  describe('evaluateDividendEvent', () => {
    it('should evaluate high yield dividend', () => {
      const result = evaluateDividendEvent('SH600001', '2026-03-01', 5, 100);
      expect(result.event.impact).toBe('positive');
      expect(result.confidence).toBeGreaterThan(0);
    });

    it('should evaluate low yield dividend', () => {
      const result = evaluateDividendEvent('SH600001', '2026-03-01', 0.5, 100);
      expect(result.event.impact).toBe('neutral');
    });

    it('should calculate dividend yield', () => {
      const result = evaluateDividendEvent('SH600001', '2026-03-01', 3, 100);
      expect(result.reasoning).toContain('3.0');
    });

    it('should have low risk level', () => {
      const result = evaluateDividendEvent('SH600001', '2026-03-01', 5, 100);
      expect(result.riskLevel).toBe('low');
    });
  });

  describe('evaluateBonusEvent', () => {
    it('should evaluate high bonus', () => {
      const result = evaluateBonusEvent('SH600001', '2026-04-01', 5, 10);
      expect(result.event.impact).toBe('positive');
    });

    it('should evaluate low bonus', () => {
      const result = evaluateBonusEvent('SH600001', '2026-04-01', 1, 2);
      expect(result.event.impact).toBe('neutral');
    });

    it('should include total ratio', () => {
      const result = evaluateBonusEvent('SH600001', '2026-04-01', 3, 7);
      expect(result.event.details.totalRatio).toBe(10);
    });
  });

  describe('evaluateRestructuringEvent', () => {
    it('should evaluate major restructuring', () => {
      const result = evaluateRestructuringEvent('SH600001', '2026-05-01', 100, false);
      expect(result.riskLevel).toBe('high');
    });

    it('should penalize related party', () => {
      const normal = evaluateRestructuringEvent('SH600001', '2026-05-01', 80, false);
      const related = evaluateRestructuringEvent('SH600001', '2026-05-01', 80, true);
      expect(normal.expectedReturn).toBeGreaterThan(related.expectedReturn);
    });
  });

  describe('buildEventPortfolio', () => {
    const signals: EventSignal[] = [
      evaluateEarningsPreview('SH001', '2026-01-15', 50, 20),
      evaluateDividendEvent('SH002', '2026-03-01', 5, 100),
      evaluateBonusEvent('SH003', '2026-04-01', 5, 10),
      evaluateEarningsPreview('SH004', '2026-01-20', -30, -15),
    ];

    it('should select top signals', () => {
      const portfolio = buildEventPortfolio(signals, 3);
      expect(portfolio.selected.length).toBeLessThanOrEqual(3);
    });

    it('should calculate expected return', () => {
      const portfolio = buildEventPortfolio(signals);
      expect(typeof portfolio.expectedReturn).toBe('number');
    });

    it('should determine risk profile', () => {
      const portfolio = buildEventPortfolio(signals);
      expect(['aggressive', 'balanced', 'conservative']).toContain(portfolio.riskProfile);
    });

    it('should calculate diversification', () => {
      const portfolio = buildEventPortfolio(signals);
      expect(portfolio.diversification).toBeGreaterThan(0);
      expect(portfolio.diversification).toBeLessThanOrEqual(1);
    });

    it('should handle empty signals', () => {
      const portfolio = buildEventPortfolio([]);
      expect(portfolio.selected).toHaveLength(0);
      expect(portfolio.expectedReturn).toBe(0);
    });
  });

  describe('analyzeHistoricalEventImpact', () => {
    const historicalEvents = [
      { type: 'earnings', return5d: 3, return10d: 5, return20d: 4 },
      { type: 'earnings', return5d: 2, return10d: 3, return20d: 1 },
      { type: 'dividend', return5d: 1, return10d: 2, return20d: 3 },
      { type: 'dividend', return5d: -1, return10d: 0, return20d: 1 },
    ];

    it('should analyze impact by event type', () => {
      const result = analyzeHistoricalEventImpact(historicalEvents);
      expect(result.length).toBeGreaterThan(0);
    });

    it('should include win rate', () => {
      const result = analyzeHistoricalEventImpact(historicalEvents);
      result.forEach(r => {
        expect(r.winRate).toBeGreaterThanOrEqual(0);
        expect(r.winRate).toBeLessThanOrEqual(1);
      });
    });

    it('should include sample size', () => {
      const result = analyzeHistoricalEventImpact(historicalEvents);
      result.forEach(r => {
        expect(r.sampleSize).toBeGreaterThan(0);
      });
    });

    it('should sort by avg return', () => {
      const result = analyzeHistoricalEventImpact(historicalEvents);
      for (let i = 1; i < result.length; i++) {
        expect(result[i - 1].avgReturn).toBeGreaterThanOrEqual(result[i].avgReturn);
      }
    });

    it('should handle empty events', () => {
      const result = analyzeHistoricalEventImpact([]);
      expect(result).toHaveLength(0);
    });
  });
});
