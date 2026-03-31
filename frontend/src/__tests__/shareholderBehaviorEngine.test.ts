import { describe, it, expect } from 'vitest';
import {
  analyzeShareholderBehavior,
  analyzeBuyback,
  analyzePledge,
  type ShareholderEvent,
} from '../utils/shareholderBehaviorEngine';

function makeEvent(overrides: Partial<ShareholderEvent> = {}): ShareholderEvent {
  return {
    date: '2025-03-15',
    code: '000001.SZ',
    shareholderName: '张三',
    shareholderType: 'major',
    action: 'increase',
    shares: 100,
    price: 10,
    ratio: 0.01,
    holdingAfter: 0.15,
    reason: '看好公司发展',
    ...overrides,
  };
}

describe('shareholderBehaviorEngine', () => {
  describe('analyzeShareholderBehavior', () => {
    it('should detect bullish signal on increases', () => {
      const events = [
        makeEvent({ action: 'increase', shares: 500 }),
        makeEvent({ action: 'increase', shares: 300 }),
      ];
      const result = analyzeShareholderBehavior('000001.SZ', events);
      expect(result.overallSignal).toBe('bullish');
    });

    it('should detect bearish signal on decreases', () => {
      const events = [
        makeEvent({ action: 'decrease', shares: 500 }),
        makeEvent({ action: 'decrease', shares: 300 }),
      ];
      const result = analyzeShareholderBehavior('000001.SZ', events);
      expect(result.overallSignal).toBe('bearish');
    });

    it('should calculate insider sentiment', () => {
      const events = [makeEvent({ action: 'increase', shares: 200 })];
      const result = analyzeShareholderBehavior('000001.SZ', events);
      expect(result.insiderSentiment).toBe(1);
    });

    it('should assess pledge risk', () => {
      const events = [makeEvent({ action: 'pledge', ratio: 0.3 })];
      const result = analyzeShareholderBehavior('000001.SZ', events);
      expect(result.pledgeRisk).toBeGreaterThan(0);
    });

    it('should detect buyback signal', () => {
      const events = [makeEvent({ action: 'buyback', shares: 200, price: 10 })];
      const result = analyzeShareholderBehavior('000001.SZ', events);
      expect(result.buybackSignal.active).toBe(true);
    });

    it('should include key insights', () => {
      const events = [makeEvent({ action: 'increase', shareholderType: 'executive', shares: 100 })];
      const result = analyzeShareholderBehavior('000001.SZ', events);
      expect(result.keyInsights.length).toBeGreaterThan(0);
    });

    it('should include risk factors for high pledge', () => {
      const events = [makeEvent({ action: 'pledge', ratio: 0.4 })];
      const result = analyzeShareholderBehavior('000001.SZ', events);
      expect(result.riskFactors.length).toBeGreaterThan(0);
    });
  });

  describe('analyzeBuyback', () => {
    it('should detect buyback', () => {
      const events = [makeEvent({ action: 'buyback', shares: 100, price: 12 })];
      const result = analyzeBuyback('000001.SZ', events, 10);
      expect(result.announced).toBe(true);
      expect(result.isAccretive).toBe(true);
    });

    it('should calculate price vs buyback', () => {
      const events = [makeEvent({ action: 'buyback', shares: 100, price: 10 })];
      const result = analyzeBuyback('000001.SZ', events, 12);
      expect(result.priceVsBuyback).toBeGreaterThan(0);
    });

    it('should signal positive for buyback below cost', () => {
      const events = [makeEvent({ action: 'buyback', shares: 100, price: 15 })];
      const result = analyzeBuyback('000001.SZ', events, 10);
      expect(['strong_positive', 'positive']).toContain(result.signal);
      expect(result.isAccretive).toBe(true);
    });

    it('should handle no buyback', () => {
      const result = analyzeBuyback('000001.SZ', [], 10);
      expect(result.announced).toBe(false);
    });
  });

  describe('analyzePledge', () => {
    it('should calculate total pledge ratio', () => {
      const events = [
        makeEvent({ action: 'pledge', ratio: 0.2 }),
        makeEvent({ action: 'pledge', ratio: 0.15 }),
      ];
      const result = analyzePledge('000001.SZ', events);
      expect(result.totalPledgedRatio).toBeCloseTo(0.35, 2);
    });

    it('should assign danger alert for high pledge', () => {
      const events = [makeEvent({ action: 'pledge', ratio: 0.6 })];
      const result = analyzePledge('000001.SZ', events);
      expect(result.alertLevel).toBe('danger');
    });

    it('should assess margin call risk', () => {
      const events = [makeEvent({ action: 'pledge', ratio: 0.3 })];
      const result = analyzePledge('000001.SZ', events);
      expect(result.marginCallRisk).toBeGreaterThan(0);
    });

    it('should detect near warning line', () => {
      const events = [makeEvent({ action: 'pledge', ratio: 0.45 })];
      const result = analyzePledge('000001.SZ', events);
      expect(result.nearWarningLine).toBe(true);
    });
  });
});
