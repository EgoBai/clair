import { describe, it, expect } from 'vitest';

// 风险管理引擎测试
describe('风险管理引擎', () => {
  describe('VaR计算', () => {
    function historicalVaR(returns: number[], confidence: number): number {
      if (returns.length === 0) return 0;
      const sorted = [...returns].sort((a, b) => a - b);
      const index = Math.floor((1 - confidence) * sorted.length);
      return -sorted[Math.min(index, sorted.length - 1)];
    }

    function parametricVaR(mean: number, stdDev: number, confidence: number): number {
      const zScores: Record<number, number> = { 0.9: 1.282, 0.95: 1.645, 0.99: 2.326 };
      const z = zScores[confidence] || 1.645;
      return -(mean - z * stdDev);
    }

    it('历史VaR为正', () => {
      const returns = Array.from({ length: 100 }, () => (Math.random() - 0.5) * 0.04);
      expect(historicalVaR(returns, 0.95)).toBeGreaterThanOrEqual(0);
    });

    it('更高置信度VaR更大', () => {
      const returns = Array.from({ length: 100 }, (_, i) => (i - 50) / 5000);
      expect(historicalVaR(returns, 0.99)).toBeGreaterThanOrEqual(historicalVaR(returns, 0.95));
    });

    it('空数据返回零', () => {
      expect(historicalVaR([], 0.95)).toBe(0);
    });

    it('参数VaR随波动率增大', () => {
      expect(parametricVaR(0, 0.02, 0.95)).toBeLessThan(parametricVaR(0, 0.04, 0.95));
    });

    it('参数VaR为正', () => {
      expect(parametricVaR(0.001, 0.02, 0.95)).toBeGreaterThan(0);
    });
  });

  describe('CVaR/ES计算', () => {
    function expectedShortfall(returns: number[], confidence: number): number {
      if (returns.length === 0) return 0;
      const sorted = [...returns].sort((a, b) => a - b);
      const cutoff = Math.floor((1 - confidence) * sorted.length);
      const tail = sorted.slice(0, cutoff + 1);
      if (tail.length === 0) return 0;
      return -tail.reduce((a, b) => a + b, 0) / tail.length;
    }

    it('ES大于等于VaR', () => {
      const returns = Array.from({ length: 100 }, () => (Math.random() - 0.5) * 0.04);
      const sorted = [...returns].sort((a, b) => a - b);
      const varIndex = Math.floor(0.05 * sorted.length);
      const var95 = -sorted[varIndex];
      const es95 = expectedShortfall(returns, 0.95);
      expect(es95).toBeGreaterThanOrEqual(var95 * 0.9);
    });

    it('空数据返回零', () => {
      expect(expectedShortfall([], 0.95)).toBe(0);
    });

    it('ES为正', () => {
      const returns = Array.from({ length: 100 }, () => (Math.random() - 0.5) * 0.04);
      expect(expectedShortfall(returns, 0.95)).toBeGreaterThanOrEqual(0);
    });
  });

  describe('止损策略', () => {
    function trailingStop(currentPrice: number, highestPrice: number, stopPercent: number): { triggered: boolean; stopPrice: number } {
      const stopPrice = highestPrice * (1 - stopPercent);
      return { triggered: currentPrice <= stopPrice, stopPrice };
    }

    function fixedStop(currentPrice: number, entryPrice: number, stopPercent: number): { triggered: boolean; stopPrice: number } {
      const stopPrice = entryPrice * (1 - stopPercent);
      return { triggered: currentPrice <= stopPrice, stopPrice };
    }

    it('追踪止损触发', () => {
      expect(trailingStop(90, 100, 0.05).triggered).toBe(true);
    });

    it('追踪止损未触发', () => {
      expect(trailingStop(96, 100, 0.05).triggered).toBe(false);
    });

    it('固定止损触发', () => {
      expect(fixedStop(94, 100, 0.05).triggered).toBe(true);
    });

    it('固定止损未触发', () => {
      expect(fixedStop(96, 100, 0.05).triggered).toBe(false);
    });

    it('追踪止损价随最高价上升', () => {
      const s1 = trailingStop(100, 100, 0.05);
      const s2 = trailingStop(100, 110, 0.05);
      expect(s2.stopPrice).toBeGreaterThan(s1.stopPrice);
    });
  });

  describe('仓位管理', () => {
    function kellyCriterion(winRate: number, winLossRatio: number): number {
      if (winLossRatio === 0) return 0;
      const kelly = winRate - (1 - winRate) / winLossRatio;
      return Math.max(0, Math.min(kelly, 1));
    }

    function fixedFractional(capital: number, riskPerTrade: number, stopLoss: number): number {
      if (stopLoss === 0) return 0;
      const riskAmount = capital * riskPerTrade;
      return Math.floor(riskAmount / stopLoss);
    }

    it('Kelly公式正结果', () => {
      expect(kellyCriterion(0.6, 2)).toBeGreaterThan(0);
    });

    it('Kelly公式负结果返回0', () => {
      expect(kellyCriterion(0.3, 1)).toBe(0);
    });

    it('Kelly在0-1之间', () => {
      const k = kellyCriterion(0.55, 1.5);
      expect(k).toBeGreaterThanOrEqual(0);
      expect(k).toBeLessThanOrEqual(1);
    });

    it('零盈亏比返回0', () => {
      expect(kellyCriterion(0.6, 0)).toBe(0);
    });

    it('固定分数法计算仓位', () => {
      expect(fixedFractional(100000, 0.02, 500)).toBe(4);
    });

    it('零止损返回零仓位', () => {
      expect(fixedFractional(100000, 0.02, 0)).toBe(0);
    });
  });

  describe('压力测试', () => {
    interface Position { symbol: string; weight: number; beta: number; }

    function stressTest(positions: Position[], scenario: { marketReturn: number; volatilityMultiplier: number }): { portfolioImpact: number; worstPosition: string } {
      let totalImpact = 0;
      let maxImpact = 0;
      let worstPosition = '';
      for (const pos of positions) {
        const impact = pos.weight * pos.beta * scenario.marketReturn;
        totalImpact += impact;
        if (impact < maxImpact) { maxImpact = impact; worstPosition = pos.symbol; }
      }
      return { portfolioImpact: totalImpact, worstPosition };
    }

    it('市场下跌组合受影响', () => {
      const positions: Position[] = [
        { symbol: 'A', weight: 0.5, beta: 1.2 },
        { symbol: 'B', weight: 0.5, beta: 0.8 },
      ];
      const result = stressTest(positions, { marketReturn: -0.2, volatilityMultiplier: 2 });
      expect(result.portfolioImpact).toBeLessThan(0);
    });

    it('市场上涨组合正收益', () => {
      const positions: Position[] = [
        { symbol: 'A', weight: 1, beta: 1 },
      ];
      const result = stressTest(positions, { marketReturn: 0.1, volatilityMultiplier: 1 });
      expect(result.portfolioImpact).toBeCloseTo(0.1, 5);
    });

    it('空组合零影响', () => {
      expect(stressTest([], { marketReturn: -0.5, volatilityMultiplier: 3 }).portfolioImpact).toBe(0);
    });
  });
});
