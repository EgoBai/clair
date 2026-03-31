import { describe, it, expect } from 'vitest';
import { analyzeEarningsRevisions, revisionMomentumScore, EarningsEstimate } from '../utils/earningsRevisionEngine';

describe('盈利预期修正引擎', () => {
  const estimates: EarningsEstimate[] = [
    { analyst: 'A1', date: '2026-01-15', epsEstimate: 1.5, revenueEstimate: 100, previousEps: 1.4 },
    { analyst: 'A2', date: '2026-01-15', epsEstimate: 1.6, revenueEstimate: 105, previousEps: 1.4 },
    { analyst: 'A1', date: '2026-02-15', epsEstimate: 1.7, revenueEstimate: 110, previousEps: 1.5 },
    { analyst: 'A2', date: '2026-02-15', epsEstimate: 1.8, revenueEstimate: 112, previousEps: 1.6 },
    { analyst: 'A3', date: '2026-03-15', epsEstimate: 1.9, revenueEstimate: 115, previousEps: 1.7 },
  ];

  describe('analyzeEarningsRevisions', () => {
    it('should analyze upward revision', () => {
      const result = analyzeEarningsRevisions('TEST', estimates);
      expect(result.symbol).toBe('TEST');
      expect(result.revisionDirection).toBe('up');
      expect(result.revisionMagnitude).toBeGreaterThan(0);
    });

    it('should calculate consensus', () => {
      const result = analyzeEarningsRevisions('TEST', estimates);
      expect(result.currentConsensus).toBeGreaterThan(0);
      expect(result.analystCount).toBe(5);
    });

    it('should calculate dispersion', () => {
      const result = analyzeEarningsRevisions('TEST', estimates);
      expect(result.dispersion).toBeGreaterThanOrEqual(0);
      expect(result.dispersionRatio).toBeGreaterThanOrEqual(0);
    });

    it('should handle empty estimates', () => {
      const result = analyzeEarningsRevisions('EMPTY', []);
      expect(result.currentConsensus).toBe(0);
      expect(result.analystCount).toBe(0);
      expect(result.revisionDirection).toBe('stable');
    });

    it('should track revision history', () => {
      const result = analyzeEarningsRevisions('TEST', estimates);
      expect(result.revisionHistory.length).toBeGreaterThan(0);
      result.revisionHistory.forEach(h => {
        expect(h.date).toBeDefined();
        expect(typeof h.consensus).toBe('number');
      });
    });

    it('should detect downward revision', () => {
      const downEstimates: EarningsEstimate[] = [
        { analyst: 'A1', date: '2026-01-15', epsEstimate: 2.0, revenueEstimate: 100 },
        { analyst: 'A1', date: '2026-03-15', epsEstimate: 1.5, revenueEstimate: 90 },
      ];
      const result = analyzeEarningsRevisions('DOWN', downEstimates);
      expect(result.revisionDirection).toBe('down');
    });

    it('should calculate bullish ratio', () => {
      const result = analyzeEarningsRevisions('TEST', estimates);
      expect(result.bullishRatio).toBeGreaterThanOrEqual(0);
      expect(result.bullishRatio).toBeLessThanOrEqual(1);
    });

    it('should calculate upside/downside estimates', () => {
      const result = analyzeEarningsRevisions('TEST', estimates);
      expect(result.upsideEstimate).toBeGreaterThanOrEqual(result.downsideEstimate);
    });
  });

  describe('revisionMomentumScore', () => {
    it('should return score 0-100', () => {
      const result = analyzeEarningsRevisions('TEST', estimates);
      const score = revisionMomentumScore(result);
      expect(score).toBeGreaterThanOrEqual(0);
      expect(score).toBeLessThanOrEqual(100);
    });

    it('should give higher score for upward revisions', () => {
      const up = analyzeEarningsRevisions('UP', estimates);
      const downEstimates: EarningsEstimate[] = [
        { analyst: 'A1', date: '2026-01-15', epsEstimate: 2.0, revenueEstimate: 100 },
        { analyst: 'A1', date: '2026-03-15', epsEstimate: 1.0, revenueEstimate: 80 },
      ];
      const down = analyzeEarningsRevisions('DOWN', downEstimates);
      expect(revisionMomentumScore(up)).toBeGreaterThan(revisionMomentumScore(down));
    });
  });
});
