import { describe, it, expect } from 'vitest';

/**
 * 量化因子引擎 / 多因子模型逻辑测试
 */

describe('QuantFactorEngine', () => {
  describe('因子定义', () => {
    const factors = {
      momentum: { name: '动量', period: 20, weight: 0.25 },
      value: { name: '价值', metrics: ['PE', 'PB', 'PS'], weight: 0.20 },
      quality: { name: '质量', metrics: ['ROE', 'grossMargin', 'debtRatio'], weight: 0.20 },
      volatility: { name: '波动率', period: 60, weight: 0.15 },
      size: { name: '市值', weight: 0.10 },
      growth: { name: '成长', metrics: ['revenueGrowth', 'profitGrowth'], weight: 0.10 },
    };

    it('应该定义动量因子', () => {
      expect(factors.momentum.period).toBe(20);
    });

    it('应该定义价值因子', () => {
      expect(factors.value.metrics).toContain('PE');
    });

    it('应该定义质量因子', () => {
      expect(factors.quality.metrics).toContain('ROE');
    });

    it('因子权重之和应为1', () => {
      const totalWeight = Object.values(factors).reduce((s, f) => s + f.weight, 0);
      expect(totalWeight).toBeCloseTo(1, 2);
    });
  });

  describe('因子计算', () => {
    const calcMomentum = (prices: number[], period: number) => {
      if (prices.length < period) return null;
      return (prices[prices.length - 1] - prices[prices.length - period]) / prices[prices.length - period];
    };

    it('应该计算动量因子', () => {
      const prices = [100, 102, 105, 103, 110];
      const momentum = calcMomentum(prices, 5);
      expect(momentum).toBeCloseTo(0.1, 2);
    });

    it('数据不足时返回 null', () => {
      const prices = [100, 102];
      const momentum = calcMomentum(prices, 5);
      expect(momentum).toBeNull();
    });
  });

  describe('因子标准化', () => {
    const zScore = (values: number[]) => {
      const mean = values.reduce((a, b) => a + b) / values.length;
      const std = Math.sqrt(values.reduce((s, v) => s + (v - mean) ** 2, 0) / values.length);
      return values.map(v => (v - mean) / (std || 1));
    };

    it('应该计算 z-score', () => {
      const values = [10, 20, 30, 40, 50];
      const scores = zScore(values);
      expect(scores[2]).toBeCloseTo(0, 1);
    });

    it('z-score 均值应为0', () => {
      const values = [10, 20, 30, 40, 50];
      const scores = zScore(values);
      const mean = scores.reduce((a, b) => a + b) / scores.length;
      expect(mean).toBeCloseTo(0, 5);
    });
  });

  describe('因子合成', () => {
    const compositeScore = (factors: Record<string, number>, weights: Record<string, number>) => {
      let score = 0;
      let totalWeight = 0;
      for (const [key, value] of Object.entries(factors)) {
        if (weights[key]) {
          score += value * weights[key];
          totalWeight += weights[key];
        }
      }
      return totalWeight > 0 ? score / totalWeight : 0;
    };

    it('应该计算综合因子得分', () => {
      const factors = { momentum: 0.8, value: 0.6, quality: 0.9 };
      const weights = { momentum: 0.4, value: 0.3, quality: 0.3 };
      const score = compositeScore(factors, weights);
      expect(score).toBeCloseTo(0.77, 1);
    });
  });

  describe('因子分组回测', () => {
    it('应该将股票按因子分组', () => {
      const stocks = [
        { code: 'A', factorScore: 0.9 },
        { code: 'B', factorScore: 0.7 },
        { code: 'C', factorScore: 0.5 },
        { code: 'D', factorScore: 0.3 },
        { code: 'E', factorScore: 0.1 },
      ];
      const sorted = [...stocks].sort((a, b) => b.factorScore - a.factorScore);
      const quintile1 = sorted.slice(0, 2);
      const quintile5 = sorted.slice(-2);
      expect(quintile1[0].code).toBe('A');
      expect(quintile5[0].code).toBe('D');
    });
  });
});

describe('AlphaDecayEngine', () => {
  describe('Alpha 衰减检测', () => {
    const detectAlphaDecay = (returns: number[], windowSize: number) => {
      const half = Math.floor(returns.length / 2);
      const firstHalf = returns.slice(0, half);
      const secondHalf = returns.slice(half);
      const avg1 = firstHalf.reduce((a, b) => a + b) / firstHalf.length;
      const avg2 = secondHalf.reduce((a, b) => a + b) / secondHalf.length;
      return { early: avg1, recent: avg2, decay: avg2 < avg1 };
    };

    it('应该检测 alpha 衰减', () => {
      const returns = [0.02, 0.015, 0.01, 0.008, 0.005, 0.003, 0.001, 0.0005];
      const result = detectAlphaDecay(returns, 4);
      expect(result.decay).toBe(true);
    });

    it('无衰减时应该返回 false', () => {
      const returns = [0.01, 0.01, 0.01, 0.01, 0.01, 0.01, 0.01, 0.01];
      const result = detectAlphaDecay(returns, 4);
      expect(result.decay).toBe(false);
    });
  });
});
