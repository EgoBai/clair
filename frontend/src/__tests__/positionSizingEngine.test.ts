import { describe, it, expect } from 'vitest';

/**
 * 仓位管理引擎测试
 * Kelly公式 / 固定比例 / ATR仓位 / 风险预算
 */

interface PositionParams {
  capital: number;
  entryPrice: number;
  stopLoss: number;
  winRate: number;
  avgWin: number;
  avgLoss: number;
  atr: number;
  maxRiskPct: number;
}

function kellySize(params: PositionParams): { shares: number; pct: number; fKelly: number } {
  const { capital, winRate, avgWin, avgLoss, entryPrice } = params;
  if (avgLoss <= 0 || entryPrice <= 0) return { shares: 0, pct: 0, fKelly: 0 };
  const b = avgWin / avgLoss;
  const fKelly = winRate - (1 - winRate) / b;
  const halfKelly = Math.max(0, fKelly * 0.5);
  const position = capital * halfKelly;
  const shares = Math.floor(position / entryPrice / 100) * 100;
  return {
    shares: Math.max(0, shares),
    pct: Math.round(halfKelly * 10000) / 100,
    fKelly: Math.round(fKelly * 10000) / 10000,
  };
}

function fixedPctSize(capital: number, entryPrice: number, riskPct: number = 2): number {
  const position = capital * riskPct / 100;
  return Math.floor(position / entryPrice / 100) * 100;
}

function atrSize(capital: number, entryPrice: number, atr: number, atrMultiplier: number = 2, riskPct: number = 1): number {
  if (atr <= 0 || entryPrice <= 0) return 0;
  const riskAmount = capital * riskPct / 100;
  const stopDistance = atr * atrMultiplier;
  const shares = Math.floor(riskAmount / stopDistance / 100) * 100;
  return Math.max(0, shares);
}

function riskBudgetSize(capital: number, entryPrice: number, stopLoss: number, maxRiskPct: number = 2): number {
  if (entryPrice <= stopLoss || entryPrice <= 0) return 0;
  const riskAmount = capital * maxRiskPct / 100;
  const riskPerShare = entryPrice - stopLoss;
  const shares = Math.floor(riskAmount / riskPerShare / 100) * 100;
  return Math.max(0, shares);
}

function calculatePosition(params: PositionParams) {
  const kelly = kellySize(params);
  const fixed = fixedPctSize(params.capital, params.entryPrice, params.maxRiskPct);
  const atr = atrSize(params.capital, params.entryPrice, params.atr);
  const risk = riskBudgetSize(params.capital, params.entryPrice, params.stopLoss, params.maxRiskPct);
  const recommended = Math.min(kelly.shares, fixed, atr, risk);
  return {
    kellyShares: kelly.shares,
    kellyPct: kelly.pct,
    fixedPctShares: fixed,
    atrShares: atr,
    riskBudgetShares: risk,
    recommendedShares: recommended,
    recommendedPct: parseFloat(((recommended * params.entryPrice) / params.capital * 100).toFixed(2)),
    riskAmount: parseFloat((recommended * (params.entryPrice - params.stopLoss)).toFixed(2)),
    maxLoss: parseFloat((recommended * (params.entryPrice - params.stopLoss)).toFixed(2)),
  };
}

describe('仓位管理引擎', () => {
  const baseParams: PositionParams = {
    capital: 1000000,
    entryPrice: 50,
    stopLoss: 48,
    winRate: 0.6,
    avgWin: 5,
    avgLoss: 3,
    atr: 1.5,
    maxRiskPct: 2,
  };

  describe('kellySize', () => {
    it('should calculate positive position for favorable odds', () => {
      const result = kellySize(baseParams);
      expect(result.shares).toBeGreaterThan(0);
      expect(result.pct).toBeGreaterThan(0);
    });

    it('should return 0 for negative edge', () => {
      const result = kellySize({ ...baseParams, winRate: 0.3, avgWin: 2, avgLoss: 5 });
      expect(result.shares).toBe(0);
    });

    it('should return 0 for zero avgLoss', () => {
      const result = kellySize({ ...baseParams, avgLoss: 0 });
      expect(result.shares).toBe(0);
    });

    it('should use half-Kelly for conservative sizing', () => {
      const result = kellySize(baseParams);
      expect(result.pct).toBeLessThanOrEqual(50);
    });

    it('should round to lot size (100 shares)', () => {
      const result = kellySize(baseParams);
      expect(result.shares % 100).toBe(0);
    });
  });

  describe('fixedPctSize', () => {
    it('should calculate fixed percentage position', () => {
      const shares = fixedPctSize(1000000, 50, 2);
      // 1000000 * 0.02 / 50 = 400 shares → floor to 400
      expect(shares).toBe(400);
    });

    it('should return 0 for very high price', () => {
      const shares = fixedPctSize(1000, 100000, 2);
      expect(shares).toBe(0);
    });
  });

  describe('atrSize', () => {
    it('should calculate ATR-based position', () => {
      const shares = atrSize(1000000, 50, 1.5, 2, 1);
      // riskAmount = 10000, stopDistance = 3, shares = floor(10000/3/100)*100 = 3300
      expect(shares).toBeGreaterThan(0);
      expect(shares % 100).toBe(0);
    });

    it('should return 0 for zero ATR', () => {
      expect(atrSize(1000000, 50, 0)).toBe(0);
    });

    it('should reduce position with higher ATR multiplier', () => {
      const small = atrSize(1000000, 50, 1.5, 4, 1);
      const large = atrSize(1000000, 50, 1.5, 2, 1);
      expect(small).toBeLessThanOrEqual(large);
    });
  });

  describe('riskBudgetSize', () => {
    it('should calculate risk-budgeted position', () => {
      const shares = riskBudgetSize(1000000, 50, 48, 2);
      // riskAmount = 20000, riskPerShare = 2, shares = floor(20000/2/100)*100 = 10000
      expect(shares).toBe(10000);
    });

    it('should return 0 when stopLoss >= entry', () => {
      expect(riskBudgetSize(1000000, 50, 50, 2)).toBe(0);
      expect(riskBudgetSize(1000000, 50, 52, 2)).toBe(0);
    });
  });

  describe('calculatePosition', () => {
    it('should return all position methods', () => {
      const result = calculatePosition(baseParams);
      expect(result.kellyShares).toBeGreaterThanOrEqual(0);
      expect(result.fixedPctShares).toBeGreaterThanOrEqual(0);
      expect(result.atrShares).toBeGreaterThanOrEqual(0);
      expect(result.riskBudgetShares).toBeGreaterThanOrEqual(0);
      expect(result.recommendedShares).toBeLessThanOrEqual(result.kellyShares);
      expect(result.recommendedShares).toBeLessThanOrEqual(result.fixedPctShares);
    });

    it('should calculate risk amount', () => {
      const result = calculatePosition(baseParams);
      expect(result.riskAmount).toBeGreaterThanOrEqual(0);
    });
  });
});
