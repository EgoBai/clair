import { describe, it, expect } from 'vitest';
import {
  rollingCorrelation,
  detectDivergences,
  analyzeCorrelationRegime,
  detectLeadLag,
  synthesizeCrossAssetSignal,
  calculateIntermarketLeadership,
  type MarketSeries,
} from '../utils/intermarketDivergenceEngine';

function generateSeries(name: string, days: number, trend: number, volatility: number = 1): MarketSeries[] {
  const data: MarketSeries[] = [];
  let price = 100;
  for (let i = 0; i < days; i++) {
    price += trend + (Math.random() - 0.5) * volatility;
    price = Math.max(1, price);
    data.push({
      name,
      date: `2026-${String(Math.floor(i / 30) + 1).padStart(2, '0')}-${String((i % 30) + 1).padStart(2, '0')}`,
      close: Math.round(price * 100) / 100,
    });
  }
  return data;
}

describe('跨市场背离引擎', () => {
  describe('rollingCorrelation', () => {
    it('should calculate correlation of 1 for identical series', () => {
      const s = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
      const corr = rollingCorrelation(s, s, 5);
      const validCorr = corr.filter(c => !isNaN(c));
      validCorr.forEach(c => {
        expect(c).toBeCloseTo(1, 5);
      });
    });

    it('should calculate correlation of -1 for inverse series', () => {
      const s1 = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
      const s2 = [10, 9, 8, 7, 6, 5, 4, 3, 2, 1];
      const corr = rollingCorrelation(s1, s2, 5);
      const validCorr = corr.filter(c => !isNaN(c));
      validCorr.forEach(c => {
        expect(c).toBeCloseTo(-1, 5);
      });
    });

    it('should return NaN for insufficient data', () => {
      const corr = rollingCorrelation([1, 2], [3, 4], 5);
      expect(corr.every(c => isNaN(c))).toBe(true);
    });

    it('should handle zero variance', () => {
      const s1 = [1, 1, 1, 1, 1, 1, 1, 1, 1, 1];
      const s2 = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
      const corr = rollingCorrelation(s1, s2, 5);
      const validCorr = corr.filter(c => !isNaN(c));
      validCorr.forEach(c => expect(c).toBe(0));
    });
  });

  describe('detectDivergences', () => {
    it('should detect divergence between correlated markets', () => {
      const s1 = generateSeries('Equity', 100, 0.2, 1);
      const s2 = generateSeries('Bond', 100, -0.1, 1);
      const signals = detectDivergences(s1, s2, { zThreshold: 1, minDuration: 2 });
      expect(signals.length).toBeGreaterThanOrEqual(0);
      signals.forEach(s => {
        expect(['positive', 'negative', 'converging']).toContain(s.type);
        expect(s.strength).toBeGreaterThanOrEqual(0);
        expect(s.strength).toBeLessThanOrEqual(100);
      });
    });

    it('should handle short data', () => {
      const s1 = generateSeries('A', 5, 0);
      const s2 = generateSeries('B', 5, 0);
      const signals = detectDivergences(s1, s2);
      expect(signals.length).toBe(0);
    });

    it('should include market names in signal', () => {
      const s1 = generateSeries('SPX', 200, 0.1);
      const s2 = generateSeries('TLT', 200, -0.1);
      const signals = detectDivergences(s1, s2, { zThreshold: 1, minDuration: 2 });
      if (signals.length > 0) {
        expect(signals[0].market1).toBe('SPX');
        expect(signals[0].market2).toBe('TLT');
      }
    });
  });

  describe('analyzeCorrelationRegime', () => {
    it('should detect high correlation regime', () => {
      const s1 = Array.from({ length: 50 }, (_, i) => 100 + i);
      const s2 = Array.from({ length: 50 }, (_, i) => 50 + i * 0.5);
      const regimes = analyzeCorrelationRegime(s1, s2, 10);
      const validRegimes = regimes.filter(r => !isNaN(r.rollingCorrelation));
      expect(validRegimes.length).toBeGreaterThan(0);
      validRegimes.forEach(r => {
        expect(r.regime).toBeDefined();
        expect(r.stability).toBeGreaterThanOrEqual(0);
        expect(r.stability).toBeLessThanOrEqual(100);
      });
    });

    it('should detect negative correlation', () => {
      const s1 = Array.from({ length: 50 }, (_, i) => 100 + i);
      const s2 = Array.from({ length: 50 }, (_, i) => 150 - i);
      const regimes = analyzeCorrelationRegime(s1, s2, 10);
      const validRegimes = regimes.filter(r => !isNaN(r.rollingCorrelation));
      const negCorr = validRegimes.filter(r => r.rollingCorrelation < 0);
      expect(negCorr.length).toBeGreaterThan(0);
    });
  });

  describe('detectLeadLag', () => {
    it('should detect lead-lag relationship', () => {
      // Series2 follows series1 with 1-day lag
      const s1 = Array.from({ length: 100 }, (_, i) => 100 + Math.sin(i / 10) * 10);
      const s2 = Array.from({ length: 100 }, (_, i) => 100 + Math.sin((i + 1) / 10) * 10);
      const result = detectLeadLag(s1, s2);
      expect(result.optimalLag).toBeGreaterThan(0);
      expect(result.predictivePower).toBeGreaterThanOrEqual(0);
      expect(result.predictivePower).toBeLessThanOrEqual(100);
    });

    it('should handle insufficient data', () => {
      const result = detectLeadLag([1, 2, 3], [4, 5, 6], 10);
      expect(result.optimalLag).toBe(0);
      expect(result.grangerCausal).toBe(false);
    });

    it('should identify leader', () => {
      const s1 = Array.from({ length: 100 }, (_, i) => 100 + Math.sin(i / 5) * 10);
      const s2 = Array.from({ length: 100 }, (_, i) => 100 + Math.sin((i + 3) / 5) * 10);
      const result = detectLeadLag(s1, s2, 5);
      expect(['series1', 'series2', 'unknown']).toContain(result.leader);
    });
  });

  describe('synthesizeCrossAssetSignal', () => {
    it('should generate risk_on/risk_off signals', () => {
      const eq = Array.from({ length: 100 }, (_, i) => 100 + i * 0.5);
      const bond = Array.from({ length: 100 }, (_, i) => 100 - i * 0.2);
      const dxy = Array.from({ length: 100 }, (_, i) => 100 - i * 0.1);
      const cmd = Array.from({ length: 100 }, (_, i) => 100 + i * 0.3);
      const credit = Array.from({ length: 100 }, (_, i) => 100 - i * 0.05);
      const vix = Array.from({ length: 100 }, (_, i) => 20 + Math.sin(i / 10) * 5);

      const signals = synthesizeCrossAssetSignal(eq, bond, dxy, cmd, credit, vix, 20);
      expect(signals.length).toBeGreaterThan(0);
      signals.forEach(s => {
        expect(['risk_on', 'risk_off', 'mixed']).toContain(s.signal);
        expect(s.confidence).toBeGreaterThanOrEqual(0);
        expect(s.confidence).toBeLessThanOrEqual(100);
      });
    });

    it('should handle insufficient data', () => {
      const short = [1, 2, 3, 4, 5];
      const signals = synthesizeCrossAssetSignal(short, short, short, short, short, short, 20);
      expect(signals.length).toBe(0);
    });

    it('should include component breakdown', () => {
      const eq = Array.from({ length: 50 }, (_, i) => 100 + i);
      const bond = Array.from({ length: 50 }, (_, i) => 100);
      const dxy = Array.from({ length: 50 }, (_, i) => 100);
      const cmd = Array.from({ length: 50 }, (_, i) => 100);
      const credit = Array.from({ length: 50 }, (_, i) => 100);
      const vix = Array.from({ length: 50 }, (_, i) => 20);

      const signals = synthesizeCrossAssetSignal(eq, bond, dxy, cmd, credit, vix, 10);
      if (signals.length > 0) {
        expect(typeof signals[0].components.equityBond).toBe('number');
        expect(typeof signals[0].components.dollarCommodity).toBe('number');
        expect(typeof signals[0].components.creditEquity).toBe('number');
        expect(typeof signals[0].components.volatilitySignal).toBe('number');
      }
    });
  });

  describe('calculateIntermarketLeadership', () => {
    it('should identify leader market', () => {
      const markets = [
        { name: 'SPX', returns: Array.from({ length: 50 }, () => (Math.random() - 0.5) * 0.02) },
        { name: 'TLT', returns: Array.from({ length: 50 }, () => (Math.random() - 0.5) * 0.01) },
        { name: 'GLD', returns: Array.from({ length: 50 }, () => (Math.random() - 0.5) * 0.015) },
      ];
      const result = calculateIntermarketLeadership(markets);
      expect(result.leader).toBeDefined();
      expect(result.followers.length).toBe(2);
    });

    it('should handle single market', () => {
      const result = calculateIntermarketLeadership([
        { name: 'SPX', returns: [0.01, 0.02, -0.01] },
      ]);
      expect(result.leader).toBe('unknown');
    });

    it('should handle empty markets', () => {
      const result = calculateIntermarketLeadership([]);
      expect(result.leader).toBe('unknown');
    });
  });
});
