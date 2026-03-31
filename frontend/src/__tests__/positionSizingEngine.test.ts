import { describe, it, expect } from 'vitest';
import { PositionSizingEngine } from '../utils/positionSizingEngine';
import type { PositionParams } from '../utils/positionSizingEngine';

describe('PositionSizingEngine', () => {
  const engine = new PositionSizingEngine();

  const params: PositionParams = {
    capital: 1000000,
    entryPrice: 50,
    stopLoss: 45,
    winRate: 0.6,
    avgWin: 8,
    avgLoss: 4,
    atr: 2.5,
    maxRiskPct: 2,
  };

  describe('Kelly公式', () => {
    it('应计算Kelly仓位', () => {
      const result = engine.kellySize(params);
      expect(result.shares).toBeGreaterThan(0);
      expect(result.pct).toBeGreaterThan(0);
    });

    it('高胜率应有更大仓位', () => {
      const low = engine.kellySize({ ...params, winRate: 0.4 });
      const high = engine.kellySize({ ...params, winRate: 0.8 });
      expect(high.shares).toBeGreaterThanOrEqual(low.shares);
    });

    it('负Kelly(f<0)应返回0', () => {
      const neg: PositionParams = { ...params, winRate: 0.3, avgWin: 2, avgLoss: 10 };
      const result = engine.kellySize(neg);
      expect(result.shares).toBe(0);
    });

    it('零损失应返回0', () => {
      const result = engine.kellySize({ ...params, avgLoss: 0 });
      expect(result.shares).toBe(0);
    });

    it('fKelly应反映数学期望', () => {
      const result = engine.kellySize(params);
      expect(result.fKelly).toBeGreaterThan(0); // 正期望
    });
  });

  describe('固定比例法', () => {
    it('应按比例计算', () => {
      const shares = engine.fixedPctSize(1000000, 50, 2);
      expect(shares).toBeGreaterThan(0);
      // 1000000 * 0.02 / 50 = 400 → floor to 400
      expect(shares).toBe(400);
    });

    it('应为100的倍数', () => {
      const shares = engine.fixedPctSize(1000000, 33, 3);
      expect(shares % 100).toBe(0);
    });

    it('极小资金应返回0', () => {
      const shares = engine.fixedPctSize(1, 50, 0.001);
      expect(shares).toBe(0);
    });
  });

  describe('ATR仓位法', () => {
    it('应按ATR计算', () => {
      const shares = engine.atrSize(params);
      expect(shares).toBeGreaterThan(0);
    });

    it('零ATR应返回0', () => {
      const shares = engine.atrSize({ ...params, atr: 0 });
      expect(shares).toBe(0);
    });

    it('高ATR应有更少股数', () => {
      const low = engine.atrSize({ ...params, atr: 1 });
      const high = engine.atrSize({ ...params, atr: 5 });
      expect(high).toBeLessThan(low);
    });
  });

  describe('风险预算法', () => {
    it('应按止损计算', () => {
      const shares = engine.riskBudgetSize(params.capital, params.entryPrice, params.stopLoss, params.maxRiskPct);
      expect(shares).toBeGreaterThan(0);
    });

    it('止损>=入场价应返回0', () => {
      const shares = engine.riskBudgetSize(1000000, 50, 55, 2);
      expect(shares).toBe(0);
    });

    it('应为100的倍数', () => {
      const shares = engine.riskBudgetSize(params.capital, params.entryPrice, params.stopLoss, params.maxRiskPct);
      expect(shares % 100).toBe(0);
    });
  });

  describe('综合计算', () => {
    it('应返回所有方法的结果', () => {
      const result = engine.calculatePosition(params);
      expect(result.kellyShares).toBeGreaterThanOrEqual(0);
      expect(result.fixedPctShares).toBeGreaterThanOrEqual(0);
      expect(result.atrShares).toBeGreaterThanOrEqual(0);
      expect(result.riskBudgetShares).toBeGreaterThanOrEqual(0);
      expect(result.recommendedShares).toBeGreaterThanOrEqual(0);
    });

    it('推荐仓位应不超过各方法', () => {
      const result = engine.calculatePosition(params);
      const allPositive = [result.kellyShares, result.fixedPctShares, result.atrShares, result.riskBudgetShares].filter(s => s > 0);
      if (allPositive.length > 0) {
        expect(result.recommendedShares).toBeLessThanOrEqual(Math.min(...allPositive));
      }
    });

    it('风险金额应为正', () => {
      const result = engine.calculatePosition(params);
      expect(result.riskAmount).toBeGreaterThanOrEqual(0);
    });

    it('仓位比例应在0-100之间', () => {
      const result = engine.calculatePosition(params);
      expect(result.recommendedPct).toBeGreaterThanOrEqual(0);
      expect(result.recommendedPct).toBeLessThanOrEqual(100);
    });

    it('期望值应可计算', () => {
      const result = engine.calculatePosition(params);
      expect(typeof result.expectedValue).toBe('number');
    });
  });

  describe('边界情况', () => {
    it('零资金不应报错', () => {
      expect(() => engine.calculatePosition({ ...params, capital: 0 })).not.toThrow();
    });

    it('零入场价不应报错', () => {
      expect(() => engine.calculatePosition({ ...params, entryPrice: 0 })).not.toThrow();
    });

    it('100%胜率不应报错', () => {
      const result = engine.calculatePosition({ ...params, winRate: 1 });
      expect(result.recommendedShares).toBeGreaterThanOrEqual(0);
    });

    it('0%胜率不应报错', () => {
      const result = engine.calculatePosition({ ...params, winRate: 0 });
      expect(result.kellyShares).toBe(0);
    });
  });
});
