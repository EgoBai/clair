import { describe, it, expect } from 'vitest';

describe('尾部风险与极端事件引擎', () => {
  // Value at Risk (Parametric)
  function parametricVaR(returns: number[], confidence = 0.99) {
    const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
    const std = Math.sqrt(returns.reduce((s, r) => s + (r - mean) ** 2, 0) / returns.length);
    const zScore = confidence === 0.99 ? 2.326 : confidence === 0.95 ? 1.645 : 1.282;
    return Math.abs(mean - zScore * std);
  }

  // Cornish-Fisher VaR (调整偏度峰度)
  function cornishFisherVaR(returns: number[], confidence = 0.99) {
    const n = returns.length;
    const mean = returns.reduce((a, b) => a + b, 0) / n;
    const std = Math.sqrt(returns.reduce((s, r) => s + (r - mean) ** 2, 0) / n);
    const skew = returns.reduce((s, r) => s + ((r - mean) / std) ** 3, 0) / n;
    const kurt = returns.reduce((s, r) => s + ((r - mean) / std) ** 4, 0) / n - 3;
    let z = confidence === 0.99 ? 2.326 : 1.645;
    z = z + (z ** 2 - 1) * skew / 6 + (z ** 3 - 3 * z) * kurt / 24 - (2 * z ** 3 - 5 * z) * skew ** 2 / 36;
    return Math.abs(mean - z * std);
  }

  // Expected Shortfall (CVaR)
  function expectedShortfall(returns: number[], confidence = 0.99) {
    const sorted = [...returns].sort((a, b) => a - b);
    const cutoff = Math.floor((1 - confidence) * sorted.length);
    const tail = sorted.slice(0, Math.max(cutoff, 1));
    return Math.abs(tail.reduce((a, b) => a + b, 0) / tail.length);
  }

  // Extreme Value Theory (GEV)
  function gevFit(returns: number[], threshold = 0.02) {
    const exceedances = returns.filter(r => Math.abs(r) > threshold).map(r => Math.abs(r) - threshold);
    if (exceedances.length < 5) return { shape: 0, scale: 0, location: threshold };
    const mean = exceedances.reduce((a, b) => a + b, 0) / exceedances.length;
    const variance = exceedances.reduce((s, v) => s + (v - mean) ** 2, 0) / exceedances.length;
    return {
      shape: -0.1, // Simplified - in practice, use MLE
      scale: Math.sqrt(6 * variance) / Math.PI,
      location: threshold,
      exceedanceCount: exceedances.length,
    };
  }

  // Tail Risk Ratio
  function tailRiskRatio(returns: number[]) {
    const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
    const std = Math.sqrt(returns.reduce((s, r) => s + (r - mean) ** 2, 0) / returns.length);
    const leftTail = returns.filter(r => r < mean - 2 * std).length / returns.length;
    const rightTail = returns.filter(r => r > mean + 2 * std).length / returns.length;
    return { leftTail, rightTail, ratio: leftTail + rightTail > 0 ? leftTail / (leftTail + rightTail) : 0.5 };
  }

  // Max Drawdown Duration
  function maxDrawdownStats(prices: number[]) {
    if (prices.length < 2) return { maxDD: 0, maxDuration: 0, recoveryDays: 0 };
    let peak = prices[0], maxDD = 0, duration = 0, maxDuration = 0, inDrawdown = false, recoveryDays = 0;
    for (let i = 1; i < prices.length; i++) {
      if (prices[i] > peak) {
        if (inDrawdown) recoveryDays++;
        peak = prices[i];
        duration = 0;
        inDrawdown = false;
      } else {
        inDrawdown = true;
        duration++;
        maxDuration = Math.max(maxDuration, duration);
        maxDD = Math.max(maxDD, (peak - prices[i]) / peak);
      }
    }
    return { maxDD, maxDuration, recoveryDays };
  }

  // Stress Test
  function stressTest(portfolio: { weight: number; beta: number }[], marketShock = -0.2, rateShock = 0.02) {
    const equityImpact = portfolio.reduce((s, p) => s + p.weight * p.beta * marketShock, 0);
    const durationImpact = portfolio.reduce((s, p) => s + p.weight * -5 * rateShock, 0);
    return {
      equityShock: equityImpact,
      rateShock: durationImpact,
      totalShock: equityImpact + durationImpact,
      worstCase: Math.min(equityImpact, durationImpact) * 1.5,
    };
  }

  const normalReturns = Array.from({ length: 200 }, () => (Math.random() - 0.5) * 0.02);
  const fatTailReturns = [...normalReturns, -0.15, -0.12, 0.13, -0.08, -0.06];
  const prices = Array.from({ length: 200 }, (_, i) => 100 + i * 0.1 + Math.sin(i / 10) * 10);

  describe('参数VaR', () => {
    it('99% VaR > 95% VaR', () => {
      const var99 = parametricVaR(normalReturns, 0.99);
      const var95 = parametricVaR(normalReturns, 0.95);
      expect(var99).toBeGreaterThan(var95);
    });

    it('VaR非负', () => {
      expect(parametricVaR(normalReturns)).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Cornish-Fisher VaR', () => {
    it('调整偏度峰度后VaR', () => {
      const cfVar = cornishFisherVaR(fatTailReturns, 0.99);
      expect(cfVar).toBeGreaterThan(0);
      // Fat tails should increase VaR
      const paramVar = parametricVaR(normalReturns, 0.99);
      expect(cfVar).toBeGreaterThan(paramVar - 0.001);
    });
  });

  describe('期望损失(ES)', () => {
    it('ES >= VaR', () => {
      const var95 = parametricVaR(normalReturns, 0.95);
      const es95 = expectedShortfall(normalReturns, 0.95);
      expect(es95).toBeGreaterThanOrEqual(var95 - 0.001);
    });

    it('ES非负', () => {
      expect(expectedShortfall(normalReturns)).toBeGreaterThanOrEqual(0);
    });
  });

  describe('极值理论', () => {
    it('GEV拟合', () => {
      const gev = gevFit(fatTailReturns, 0.02);
      expect(gev.exceedanceCount).toBeGreaterThan(0);
      expect(gev.scale).toBeGreaterThanOrEqual(0);
    });
  });

  describe('尾部风险比率', () => {
    it('左尾右尾比例', () => {
      const tail = tailRiskRatio(fatTailReturns);
      expect(tail.leftTail).toBeGreaterThanOrEqual(0);
      expect(tail.rightTail).toBeGreaterThanOrEqual(0);
      expect(tail.ratio).toBeGreaterThanOrEqual(0);
      expect(tail.ratio).toBeLessThanOrEqual(1);
    });
  });

  describe('最大回撤统计', () => {
    it('回撤非负', () => {
      const stats = maxDrawdownStats(prices);
      expect(stats.maxDD).toBeGreaterThanOrEqual(0);
      expect(stats.maxDuration).toBeGreaterThanOrEqual(0);
    });

    it('单调递增价格回撤为0', () => {
      const rising = Array.from({ length: 20 }, (_, i) => 100 + i);
      const stats = maxDrawdownStats(rising);
      expect(stats.maxDD).toBe(0);
    });
  });

  describe('压力测试', () => {
    it('计算冲击', () => {
      const portfolio = [
        { weight: 0.6, beta: 1.2 },
        { weight: 0.4, beta: 0.8 },
      ];
      const stress = stressTest(portfolio, -0.2, 0.02);
      expect(stress.equityShock).toBeLessThan(0);
      expect(typeof stress.totalShock).toBe('number');
    });
  });
});
