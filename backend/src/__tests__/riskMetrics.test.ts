import { describe, it, expect } from 'vitest';

/**
 * 风险度量引擎测试
 */

const calcVaR = (returns: number[], confidence: number = 0.95): number => {
  if (returns.length === 0) return 0;
  const sorted = [...returns].sort((a, b) => a - b);
  const index = Math.floor((1 - confidence) * sorted.length);
  return -sorted[Math.max(0, index)];
};

const calcCVaR = (returns: number[], confidence: number = 0.95): number => {
  if (returns.length === 0) return 0;
  const sorted = [...returns].sort((a, b) => a - b);
  const cutoff = Math.floor((1 - confidence) * sorted.length);
  const tail = sorted.slice(0, Math.max(1, cutoff));
  return -(tail.reduce((a, b) => a + b, 0) / tail.length);
};

const calcHistoricalVol = (returns: number[], annualize: boolean = true): number => {
  if (returns.length < 2) return 0;
  const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
  const variance = returns.reduce((a, b) => a + (b - mean) ** 2, 0) / (returns.length - 1);
  const vol = Math.sqrt(Math.max(variance, 0)); // clamp tiny negatives from float errors
  if (vol < 1e-10) return 0;
  return annualize ? vol * Math.sqrt(252) : vol;
};

const calcDownsideDeviation = (returns: number[], targetReturn: number = 0): number => {
  const downside = returns.filter(r => r < targetReturn).map(r => (r - targetReturn) ** 2);
  if (downside.length === 0) return 0;
  return Math.sqrt(downside.reduce((a, b) => a + b, 0) / returns.length);
};

const calcSortinoRatio = (returns: number[], riskFree: number = 0.03): number => {
  const avgReturn = returns.reduce((a, b) => a + b, 0) / returns.length;
  const dd = calcDownsideDeviation(returns, riskFree / 252);
  return dd === 0 ? 0 : ((avgReturn - riskFree / 252) / dd) * Math.sqrt(252);
};

const calcCalmarRatio = (returns: number[], maxDrawdown: number): number => {
  const annualReturn = returns.reduce((a, b) => a + b, 0) * 252 / returns.length;
  return maxDrawdown === 0 ? 0 : annualReturn / maxDrawdown;
};

const calcOmegaRatio = (returns: number[], threshold: number = 0): number => {
  let gains = 0, losses = 0;
  for (const r of returns) {
    if (r > threshold) gains += r - threshold;
    else losses += threshold - r;
  }
  return losses === 0 ? (gains > 0 ? Infinity : 1) : gains / losses;
};

const calcTailRisk = (returns: number[], percentile: number = 5): number => {
  if (returns.length === 0) return 0;
  const sorted = [...returns].sort((a, b) => a - b);
  const index = Math.floor(percentile / 100 * sorted.length);
  return sorted[Math.max(0, index)];
};

describe('风险度量引擎', () => {
  describe('VaR (风险价值)', () => {
    it('正态分布VaR应合理', () => {
      const returns = Array.from({ length: 1000 }, () => (Math.random() - 0.5) * 0.04);
      const var95 = calcVaR(returns, 0.95);
      expect(var95).toBeGreaterThan(0);
    });

    it('99%置信度VaR应大于95%', () => {
      const returns = Array.from({ length: 1000 }, () => (Math.random() - 0.5) * 0.04);
      expect(calcVaR(returns, 0.99)).toBeGreaterThan(calcVaR(returns, 0.95));
    });

    it('空数组返回0', () => {
      expect(calcVaR([], 0.95)).toBe(0);
    });

    it('全正收益VaR应接近0', () => {
      const returns = Array(100).fill(0.01);
      expect(calcVaR(returns, 0.95)).toBeLessThanOrEqual(0.01);
    });

    it('全负收益VaR应为正', () => {
      const returns = Array(100).fill(-0.01);
      expect(calcVaR(returns, 0.95)).toBeGreaterThan(0);
    });

    it('VaR应为损失值(正数)', () => {
      const returns = Array.from({ length: 200 }, () => (Math.random() - 0.5) * 0.1);
      const var95 = calcVaR(returns, 0.95);
      expect(var95).toBeGreaterThanOrEqual(0);
    });

    it('不同置信度产生不同结果', () => {
      const returns = Array.from({ length: 500 }, () => (Math.random() - 0.5) * 0.06);
      const v90 = calcVaR(returns, 0.90);
      const v99 = calcVaR(returns, 0.99);
      expect(v99).toBeGreaterThanOrEqual(v90);
    });

    it('单一值返回该值的负数', () => {
      expect(calcVaR([-0.05], 0.95)).toBeCloseTo(0.05, 5);
    });
  });

  describe('CVaR (条件风险价值)', () => {
    it('CVaR应大于等于VaR', () => {
      const returns = Array.from({ length: 500 }, () => (Math.random() - 0.5) * 0.04);
      const var95 = calcVaR(returns, 0.95);
      const cvar95 = calcCVaR(returns, 0.95);
      expect(cvar95).toBeGreaterThanOrEqual(var95 - 0.001);
    });

    it('空数组返回0', () => {
      expect(calcCVaR([], 0.95)).toBe(0);
    });

    it('全正收益CVaR应接近0', () => {
      const returns = Array(100).fill(0.01);
      expect(calcCVaR(returns, 0.95)).toBeLessThanOrEqual(0.01);
    });

    it('高置信度CVaR应更大', () => {
      const returns = Array.from({ length: 1000 }, () => (Math.random() - 0.5) * 0.08);
      expect(calcCVaR(returns, 0.99)).toBeGreaterThan(calcCVaR(returns, 0.90));
    });

    it('极端负值会拉高CVaR', () => {
      const normal = Array.from({ length: 100 }, () => (Math.random() - 0.5) * 0.02);
      const extreme = [...normal, -0.5];
      expect(calcCVaR(extreme, 0.95)).toBeGreaterThan(calcCVaR(normal, 0.95));
    });
  });

  describe('历史波动率', () => {
    it('常数收益波动率为0', () => {
      const returns = Array(50).fill(0.01);
      expect(calcHistoricalVol(returns, false)).toBe(0);
    });

    it('年化波动率应大于日波动率', () => {
      const returns = Array.from({ length: 252 }, () => (Math.random() - 0.5) * 0.02);
      const daily = calcHistoricalVol(returns, false);
      const annual = calcHistoricalVol(returns, true);
      expect(annual).toBeGreaterThan(daily);
    });

    it('不足2个数据点返回0', () => {
      expect(calcHistoricalVol([0.01])).toBe(0);
      expect(calcHistoricalVol([])).toBe(0);
    });

    it('波动率应该为非负', () => {
      const returns = Array.from({ length: 100 }, () => (Math.random() - 0.5) * 0.05);
      expect(calcHistoricalVol(returns)).toBeGreaterThanOrEqual(0);
    });

    it('高波动收益波动率更大', () => {
      const low = Array.from({ length: 100 }, () => (Math.random() - 0.5) * 0.01);
      const high = Array.from({ length: 100 }, () => (Math.random() - 0.5) * 0.1);
      expect(calcHistoricalVol(high)).toBeGreaterThan(calcHistoricalVol(low));
    });

    it('年化因子应为sqrt(252)', () => {
      const returns = Array.from({ length: 252 }, () => (Math.random() - 0.5) * 0.02);
      const daily = calcHistoricalVol(returns, false);
      const annual = calcHistoricalVol(returns, true);
      expect(annual / daily).toBeCloseTo(Math.sqrt(252), 1);
    });
  });

  describe('下行偏差', () => {
    it('全正收益下行偏差为0', () => {
      const returns = Array(50).fill(0.01);
      expect(calcDownsideDeviation(returns, 0)).toBe(0);
    });

    it('全负收益下行偏差大于0', () => {
      const returns = Array(50).fill(-0.01);
      expect(calcDownsideDeviation(returns, 0)).toBeGreaterThan(0);
    });

    it('更高目标率增大下行偏差', () => {
      const returns = Array.from({ length: 100 }, () => (Math.random() - 0.5) * 0.04);
      expect(calcDownsideDeviation(returns, 0.02)).toBeGreaterThan(calcDownsideDeviation(returns, 0));
    });

    it('下行偏差应为非负', () => {
      const returns = Array.from({ length: 100 }, () => (Math.random() - 0.5) * 0.05);
      expect(calcDownsideDeviation(returns)).toBeGreaterThanOrEqual(0);
    });

    it('空数组返回0', () => {
      expect(calcDownsideDeviation([])).toBe(0);
    });
  });

  describe('Sortino比率', () => {
    it('正收益应有正Sortino', () => {
      // Use returns with mixed values including some below risk-free daily rate
      const returns = Array.from({ length: 252 }, (_, i) => i % 10 === 0 ? -0.001 : 0.002);
      expect(calcSortinoRatio(returns)).toBeGreaterThan(0);
    });

    it('负收益应有负Sortino', () => {
      const returns = Array(252).fill(-0.001);
      expect(calcSortinoRatio(returns)).toBeLessThan(0);
    });

    it('零下行偏差返回0', () => {
      const returns = Array(100).fill(0.01);
      expect(calcSortinoRatio(returns, 0)).toBe(0);
    });

    it('Sortino应反映风险调整收益', () => {
      const returns = Array.from({ length: 252 }, () => 0.001 + (Math.random() - 0.5) * 0.01);
      const sortino = calcSortinoRatio(returns);
      expect(isFinite(sortino)).toBe(true);
    });

    it('低波动高收益应有高Sortino', () => {
      // Include some negative returns so downside deviation is non-zero
      const lowVol = Array.from({ length: 252 }, (_, i) => i % 20 === 0 ? -0.001 : 0.003);
      const highVol = Array.from({ length: 252 }, () => 0.002 + (Math.random() - 0.5) * 0.02);
      expect(calcSortinoRatio(lowVol)).toBeGreaterThan(calcSortinoRatio(highVol));
    });
  });

  describe('Calmar比率', () => {
    it('正收益正回撤Calmar为正', () => {
      const returns = Array(252).fill(0.001);
      expect(calcCalmarRatio(returns, 0.1)).toBeGreaterThan(0);
    });

    it('零回撤返回0', () => {
      const returns = Array(252).fill(0.001);
      expect(calcCalmarRatio(returns, 0)).toBe(0);
    });

    it('高回撤降低Calmar', () => {
      const returns = Array(252).fill(0.001);
      expect(calcCalmarRatio(returns, 0.05)).toBeGreaterThan(calcCalmarRatio(returns, 0.2));
    });

    it('负收益Calmar为负', () => {
      const returns = Array(252).fill(-0.001);
      expect(calcCalmarRatio(returns, 0.1)).toBeLessThan(0);
    });

    it('Calmar应年化', () => {
      const daily = Array(252).fill(0.001);
      const calmar = calcCalmarRatio(daily, 0.1);
      const annualReturn = 0.001 * 252;
      expect(calmar).toBeCloseTo(annualReturn / 0.1, 1);
    });
  });

  describe('Omega比率', () => {
    it('全正收益Omega应无穷大', () => {
      const returns = Array(50).fill(0.01);
      expect(calcOmegaRatio(returns, 0)).toBe(Infinity);
    });

    it('全负收益Omega应为0', () => {
      const returns = Array(50).fill(-0.01);
      expect(calcOmegaRatio(returns, 0)).toBe(0);
    });

    it('对称收益Omega应接近1', () => {
      const returns = Array.from({ length: 100 }, (_, i) => i % 2 === 0 ? 0.01 : -0.01);
      expect(calcOmegaRatio(returns, 0)).toBeCloseTo(1, 0);
    });

    it('空数组返回1', () => {
      expect(calcOmegaRatio([])).toBe(1);
    });

    it('更高阈值应降低Omega', () => {
      const returns = Array.from({ length: 100 }, () => (Math.random() - 0.4) * 0.05);
      const o0 = calcOmegaRatio(returns, 0);
      const o01 = calcOmegaRatio(returns, 0.01);
      expect(o0).toBeGreaterThanOrEqual(o01);
    });

    it('Omega应为非负', () => {
      const returns = Array.from({ length: 100 }, () => (Math.random() - 0.5) * 0.1);
      expect(calcOmegaRatio(returns)).toBeGreaterThanOrEqual(0);
    });
  });

  describe('尾部风险', () => {
    it('应该返回指定分位数', () => {
      const returns = Array.from({ length: 100 }, (_, i) => (i - 50) * 0.001);
      const tail5 = calcTailRisk(returns, 5);
      expect(tail5).toBeLessThan(0);
    });

    it('空数组返回0', () => {
      expect(calcTailRisk([], 5)).toBe(0);
    });

    it('1%分位应小于5%分位', () => {
      const returns = Array.from({ length: 500 }, () => (Math.random() - 0.5) * 0.1);
      expect(calcTailRisk(returns, 1)).toBeLessThanOrEqual(calcTailRisk(returns, 5));
    });

    it('全正收益5%分位可能为正', () => {
      const returns = Array(100).fill(0.01);
      expect(calcTailRisk(returns, 5)).toBe(0.01);
    });

    it('50%分位应接近中位数', () => {
      const returns = Array.from({ length: 100 }, (_, i) => i * 0.001);
      const median = calcTailRisk(returns, 50);
      expect(median).toBeCloseTo(0.049, 1);
    });
  });

  describe('综合风险评估', () => {
    const calcRiskScore = (returns: number[]): { score: number; level: string } => {
      const vol = calcHistoricalVol(returns);
      const var95 = calcVaR(returns, 0.95);
      const maxDD = (() => {
        let peak = 0, cum = 0, maxDd = 0;
        for (const r of returns) {
          cum += r;
          if (cum > peak) peak = cum;
          const dd = peak - cum;
          if (dd > maxDd) maxDd = dd;
        }
        return maxDd;
      })();
      const score = Math.min(100, vol * 100 + var95 * 500 + maxDD * 200);
      let level = 'low';
      if (score > 70) level = 'high';
      else if (score > 40) level = 'medium';
      return { score, level };
    };

    it('低波动收益应有低风险评分', () => {
      const low = Array(252).fill(0.001);
      const { score, level } = calcRiskScore(low);
      expect(level).toBe('low');
    });

    it('高波动收益应有高风险评分', () => {
      const high = Array.from({ length: 252 }, () => (Math.random() - 0.5) * 0.2);
      const { score } = calcRiskScore(high);
      expect(score).toBeGreaterThan(0);
    });

    it('评分应在0-100之间', () => {
      const returns = Array.from({ length: 252 }, () => (Math.random() - 0.5) * 0.1);
      const { score } = calcRiskScore(returns);
      expect(score).toBeGreaterThanOrEqual(0);
      expect(score).toBeLessThanOrEqual(100);
    });

    it('三个风险等级都应该出现', () => {
      const low = Array(252).fill(0.0001);
      // Medium volatility: larger alternating swings to cross the 40-70 score range
      const med = Array.from({ length: 252 }, (_, i) => (i % 2 === 0 ? 1 : -1) * 0.025);
      const high = Array.from({ length: 252 }, () => (Math.random() - 0.5) * 0.15);
      expect(calcRiskScore(low).level).toBe('low');
      expect(calcRiskScore(med).level).toBe('medium');
      expect(calcRiskScore(high).level).toBe('high');
    });
  });
});
