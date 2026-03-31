import { describe, it, expect } from 'vitest';
import {
  calculateAmihud,
  calculateLiquidityMetrics,
  assessLiquidityRisk,
  tierByLiquidity,
  detectLiquidityCrisis,
  type LiquidityData,
  type LiquidityMetrics,
} from '../utils/liquidityRiskEngine';

function makeLiqData(overrides: Partial<LiquidityData> = {}): LiquidityData {
  return {
    ticker: '600519',
    date: '2026-03-31',
    volume: 5e7,
    turnover: 0.02,
    amount: 9e9,
    price: 1800,
    return: 0.01,
    bidAskSpread: 0.001,
    marketCap: 2e12,
    ...overrides,
  };
}

describe('Liquidity Risk Engine', () => {
  describe('calculateAmihud', () => {
    it('should return 0 for empty data', () => {
      expect(calculateAmihud([])).toBe(0);
    });

    it('should calculate non-negative value', () => {
      const data = [makeLiqData({ return: 0.02, amount: 1e9 }), makeLiqData({ return: -0.01, amount: 2e9 })];
      expect(calculateAmihud(data)).toBeGreaterThan(0);
    });

    it('should be higher for less liquid stocks', () => {
      const liquid = [makeLiqData({ return: 0.01, amount: 1e10 })];
      const illiquid = [makeLiqData({ return: 0.01, amount: 1e7 })];
      expect(calculateAmihud(illiquid)).toBeGreaterThan(calculateAmihud(liquid));
    });
  });

  describe('calculateLiquidityMetrics', () => {
    it('should return null for empty data', () => {
      expect(calculateLiquidityMetrics([])).toBeNull();
    });

    it('should calculate complete metrics', () => {
      const data = Array.from({ length: 20 }, () => makeLiqData());
      const metrics = calculateLiquidityMetrics(data);

      expect(metrics).not.toBeNull();
      expect(metrics!.ticker).toBe('600519');
      expect(metrics!.liquidityScore).toBeGreaterThanOrEqual(0);
      expect(metrics!.liquidityScore).toBeLessThanOrEqual(100);
      expect(['excellent', 'good', 'moderate', 'poor', 'illiquid']).toContain(metrics!.tier);
      expect(metrics!.dailyCapacity).toBeGreaterThan(0);
    });

    it('should score high-turnover stocks higher', () => {
      const highTurnover = Array.from({ length: 20 }, () =>
        makeLiqData({ turnover: 0.05, bidAskSpread: 0.0005 })
      );
      const lowTurnover = Array.from({ length: 20 }, () =>
        makeLiqData({ turnover: 0.001, bidAskSpread: 0.02 })
      );

      const high = calculateLiquidityMetrics(highTurnover)!;
      const low = calculateLiquidityMetrics(lowTurnover)!;
      expect(high.liquidityScore).toBeGreaterThan(low.liquidityScore);
    });
  });

  describe('assessLiquidityRisk', () => {
    it('should assess risk from metrics', () => {
      const metrics: LiquidityMetrics = {
        ticker: 'TEST',
        amihud: 0.05,
        avgTurnover: 0.001,
        avgVolume: 1e5,
        avgSpread: 0.02,
        volumeVolatility: 2,
        liquidityScore: 20,
        tier: 'poor',
        dailyCapacity: 100,
        liquidationDays: 50,
      };
      const risk = assessLiquidityRisk(metrics);

      expect(['high', 'critical']).toContain(risk.riskLevel);
      expect(risk.factors.filter(f => f.breached).length).toBeGreaterThan(0);
      expect(risk.recommendation.length).toBeGreaterThan(0);
    });

    it('should mark low risk for liquid stocks', () => {
      const metrics: LiquidityMetrics = {
        ticker: 'LIQUID',
        amihud: 0.0001,
        avgTurnover: 0.05,
        avgVolume: 1e8,
        avgSpread: 0.0005,
        volumeVolatility: 0.3,
        liquidityScore: 90,
        tier: 'excellent',
        dailyCapacity: 1e6,
        liquidationDays: 2,
      };
      const risk = assessLiquidityRisk(metrics);
      expect(risk.riskLevel).toBe('low');
    });
  });

  describe('tierByLiquidity', () => {
    it('should group stocks by tier', () => {
      const metrics = [
        { ticker: 'A', tier: 'excellent' as const, liquidityScore: 90 },
        { ticker: 'B', tier: 'excellent' as const, liquidityScore: 85 },
        { ticker: 'C', tier: 'poor' as const, liquidityScore: 30 },
      ].map(partial => ({
        ...partial,
        amihud: 0.001, avgTurnover: 0.02, avgVolume: 1e7,
        avgSpread: 0.001, volumeVolatility: 0.5,
        dailyCapacity: 1e5, liquidationDays: 5,
      }));

      const tiers = tierByLiquidity(metrics);
      expect(tiers.length).toBeGreaterThan(0);

      const excellent = tiers.find(t => t.tier === 'excellent');
      expect(excellent!.tickers).toContain('A');
      expect(excellent!.tickers).toContain('B');
    });
  });

  describe('detectLiquidityCrisis', () => {
    it('should return empty for insufficient data', () => {
      expect(detectLiquidityCrisis([makeLiqData()])).toEqual([]);
    });

    it('should detect volume surge', () => {
      const normal = Array.from({ length: 20 }, (_, i) =>
        makeLiqData({ date: `2026-03-${i + 1}`, volume: 1e7 })
      );
      const surge = makeLiqData({ date: '2026-03-21', volume: 5e8 });
      const signals = detectLiquidityCrisis([...normal, surge]);

      expect(signals.some(s => s.signal === 'volume_surge')).toBe(true);
    });

    it('should detect volume collapse', () => {
      const normal = Array.from({ length: 20 }, (_, i) =>
        makeLiqData({ date: `2026-03-${i + 1}`, volume: 1e7 })
      );
      const collapse = makeLiqData({ date: '2026-03-21', volume: 1e5 });
      const signals = detectLiquidityCrisis([...normal, collapse]);

      expect(signals.some(s => s.signal === 'volume_collapse')).toBe(true);
    });

    it('should detect spread widening', () => {
      const normal = Array.from({ length: 20 }, (_, i) =>
        makeLiqData({ date: `2026-03-${i + 1}`, bidAskSpread: 0.001 })
      );
      const wide = makeLiqData({ date: '2026-03-21', bidAskSpread: 0.01 });
      const signals = detectLiquidityCrisis([...normal, wide]);

      expect(signals.some(s => s.signal === 'spread_widening')).toBe(true);
    });
  });
});
