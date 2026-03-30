import { describe, it, expect } from 'vitest';

// 量化因子模型测试
describe('量化因子模型', () => {
  describe('Fama-French三因子', () => {
    const calcThreeFactor = (
      marketReturn: number,
      smbReturn: number,
      hmlReturn: number,
      beta: number,
      smbBeta: number,
      hmlBeta: number,
      alpha: number
    ) => {
      return alpha + beta * marketReturn + smbBeta * smbReturn + hmlBeta * hmlReturn;
    };

    it('纯市场因子', () => {
      const result = calcThreeFactor(0.10, 0, 0, 1, 0, 0, 0);
      expect(result).toBeCloseTo(0.10);
    });

    it('SMB因子贡献', () => {
      const result = calcThreeFactor(0, 0.05, 0, 0, 1.2, 0, 0);
      expect(result).toBeCloseTo(0.06);
    });

    it('HML因子贡献', () => {
      const result = calcThreeFactor(0, 0, 0.03, 0, 0, 0.8, 0);
      expect(result).toBeCloseTo(0.024);
    });

    it('Alpha为常数项', () => {
      const result = calcThreeFactor(0, 0, 0, 0, 0, 0, 0.02);
      expect(result).toBe(0.02);
    });

    it('三因子叠加', () => {
      const result = calcThreeFactor(0.08, 0.03, 0.02, 1, 0.5, 0.3, 0.01);
      expect(result).toBeCloseTo(0.01 + 0.08 + 0.015 + 0.006);
    });

    it('负因子暴露', () => {
      const result = calcThreeFactor(0.05, -0.03, 0, -0.5, 0, 0, 0);
      expect(result).toBeCloseTo(-0.025); // -0.5 * 0.05
    });
  });

  describe('动量因子', () => {
    const calcMomentum = (prices: number[], lookback: number, skip: number = 0): number => {
      if (prices.length < lookback + skip + 1) return 0;
      const current = prices[prices.length - 1 - skip];
      const past = prices[prices.length - 1 - lookback - skip];
      return (current - past) / past;
    };

    it('上涨动量为正', () => {
      const prices = [10, 11, 12, 13, 14, 15];
      expect(calcMomentum(prices, 5)).toBeCloseTo(0.5);
    });

    it('下跌动量为负', () => {
      const prices = [15, 14, 13, 12, 11, 10];
      expect(calcMomentum(prices, 5)).toBeCloseTo(-1 / 3);
    });

    it('跳过最近N天', () => {
      const prices = [10, 10, 10, 10, 20, 30, 40];
      const mom = calcMomentum(prices, 3, 1); // 跳过最后1天
      expect(mom).toBeCloseTo(1); // 20 vs 10
    });

    it('数据不足返回0', () => {
      expect(calcMomentum([10, 11], 5)).toBe(0);
    });
  });

  describe('波动率因子', () => {
    const calcVolatilityFactor = (returns: number[], window: number): number[] => {
      const result: number[] = [];
      for (let i = window - 1; i < returns.length; i++) {
        const slice = returns.slice(i - window + 1, i + 1);
        const mean = slice.reduce((a, b) => a + b, 0) / window;
        const variance = slice.reduce((a, b) => a + (b - mean) ** 2, 0) / window;
        result.push(Math.sqrt(variance));
      }
      return result;
    };

    it('恒定收益波动率为0', () => {
      const returns = [0.01, 0.01, 0.01, 0.01, 0.01];
      const vol = calcVolatilityFactor(returns, 3);
      expect(vol[vol.length - 1]).toBe(0);
    });

    it('高波动数据波动率大', () => {
      const low = calcVolatilityFactor([0.01, 0.01, 0.01, 0.01, 0.01], 3);
      const high = calcVolatilityFactor([0.05, -0.05, 0.05, -0.05, 0.05], 3);
      expect(high[high.length - 1]).toBeGreaterThan(low[low.length - 1]);
    });

    it('结果数组长度正确', () => {
      const returns = Array(10).fill(0.01);
      expect(calcVolatilityFactor(returns, 5)).toHaveLength(6);
    });
  });

  describe('价值因子', () => {
    const calcValueScore = (data: {
      pe: number; pb: number; ps: number; divYield: number;
    }, weights = { pe: 0.3, pb: 0.3, ps: 0.2, div: 0.2 }) => {
      // 标准化: 越低越好(除股息率)
      const peScore = data.pe > 0 ? 1 / data.pe : 0;
      const pbScore = data.pb > 0 ? 1 / data.pb : 0;
      const psScore = data.ps > 0 ? 1 / data.ps : 0;
      return peScore * weights.pe + pbScore * weights.pb +
             psScore * weights.ps + data.divYield * weights.div;
    };

    it('低PE高价值得分', () => {
      const low = calcValueScore({ pe: 5, pb: 1, ps: 1, divYield: 0.03 });
      const high = calcValueScore({ pe: 50, pb: 1, ps: 1, divYield: 0.03 });
      expect(low).toBeGreaterThan(high);
    });

    it('高股息高得分', () => {
      const low = calcValueScore({ pe: 10, pb: 1, ps: 1, divYield: 0.01 });
      const high = calcValueScore({ pe: 10, pb: 1, ps: 1, divYield: 0.05 });
      expect(high).toBeGreaterThan(low);
    });

    it('负PE不得分', () => {
      const score = calcValueScore({ pe: -5, pb: 1, ps: 1, divYield: 0.03 });
      expect(score).toBeGreaterThan(0); // pb和div还在贡献
    });

    it('零值不报错', () => {
      const score = calcValueScore({ pe: 0, pb: 0, ps: 0, divYield: 0 });
      expect(score).toBe(0);
    });
  });

  describe('质量因子', () => {
    const calcQualityScore = (data: {
      roe: number; grossMargin: number; debtToEquity: number;
      earningsGrowth: number; revenueGrowth: number;
    }) => {
      return (
        Math.min(data.roe / 0.20, 2) * 0.25 +
        Math.min(data.grossMargin / 0.40, 2) * 0.20 +
        Math.max(0, 1 - data.debtToEquity) * 0.20 +
        Math.min(Math.max(data.earningsGrowth, 0) / 0.15, 2) * 0.20 +
        Math.min(Math.max(data.revenueGrowth, 0) / 0.10, 2) * 0.15
      );
    };

    it('高质量公司得分高', () => {
      const high = calcQualityScore({
        roe: 0.25, grossMargin: 0.50, debtToEquity: 0.3,
        earningsGrowth: 0.20, revenueGrowth: 0.15,
      });
      const low = calcQualityScore({
        roe: 0.05, grossMargin: 0.10, debtToEquity: 2.0,
        earningsGrowth: -0.10, revenueGrowth: -0.05,
      });
      expect(high).toBeGreaterThan(low);
    });

    it('得分有上界', () => {
      const perfect = calcQualityScore({
        roe: 1.0, grossMargin: 1.0, debtToEquity: 0,
        earningsGrowth: 1.0, revenueGrowth: 1.0,
      });
      expect(perfect).toBeLessThanOrEqual(1.01); // 允许浮点误差
    });

    it('负增长不得分', () => {
      const neg = calcQualityScore({
        roe: 0.15, grossMargin: 0.30, debtToEquity: 0.5,
        earningsGrowth: -0.5, revenueGrowth: -0.3,
      });
      const zero = calcQualityScore({
        roe: 0.15, grossMargin: 0.30, debtToEquity: 0.5,
        earningsGrowth: 0, revenueGrowth: 0,
      });
      expect(neg).toBe(zero); // 负增长截断为0
    });
  });

  describe('因子收益归因', () => {
    const factorAttribution = (
      portfolioReturn: number,
      factorReturns: Record<string, number>,
      exposures: Record<string, number>,
      riskFreeRate: number
    ) => {
      let factorContribution = 0;
      const breakdown: Record<string, number> = {};
      for (const [factor, exposure] of Object.entries(exposures)) {
        const contrib = exposure * (factorReturns[factor] || 0);
        breakdown[factor] = contrib;
        factorContribution += contrib;
      }
      const alpha = portfolioReturn - riskFreeRate - factorContribution;
      return { breakdown, factorContribution, alpha };
    };

    it('归因分解总和等于超额收益', () => {
      const result = factorAttribution(
        0.12,
        { market: 0.08, smb: 0.02, hml: -0.01 },
        { market: 1, smb: 0.5, hml: 0.3 },
        0.02
      );
      const sum = Object.values(result.breakdown).reduce((a, b) => a + b, 0) + result.alpha + 0.02;
      expect(sum).toBeCloseTo(0.12);
    });

    it('纯Alpha策略', () => {
      const result = factorAttribution(
        0.05,
        { market: 0 },
        { market: 0 },
        0
      );
      expect(result.alpha).toBeCloseTo(0.05);
    });

    it('因子贡献可正可负', () => {
      const result = factorAttribution(
        0.05,
        { market: 0.10, hedge: -0.05 },
        { market: 1, hedge: 1 },
        0
      );
      expect(result.breakdown['market']).toBeCloseTo(0.10);
      expect(result.breakdown['hedge']).toBeCloseTo(-0.05);
    });
  });

  describe('因子IC分析', () => {
    const calcIC = (predicted: number[], actual: number[]): number => {
      const n = Math.min(predicted.length, actual.length);
      if (n < 2) return 0;
      const rankPred = rankArray(predicted.slice(0, n));
      const rankAct = rankArray(actual.slice(0, n));
      const meanP = rankPred.reduce((a, b) => a + b, 0) / n;
      const meanA = rankAct.reduce((a, b) => a + b, 0) / n;
      let cov = 0, varP = 0, varA = 0;
      for (let i = 0; i < n; i++) {
        cov += (rankPred[i] - meanP) * (rankAct[i] - meanA);
        varP += (rankPred[i] - meanP) ** 2;
        varA += (rankAct[i] - meanA) ** 2;
      }
      return varP > 0 && varA > 0 ? cov / Math.sqrt(varP * varA) : 0;
    };

    const rankArray = (arr: number[]): number[] => {
      const indexed = arr.map((v, i) => ({ v, i }));
      indexed.sort((a, b) => a.v - b.v);
      const ranks = new Array(arr.length);
      indexed.forEach((item, rank) => { ranks[item.i] = rank + 1; });
      return ranks;
    };

    it('完全正相关IC=1', () => {
      const pred = [1, 2, 3, 4, 5];
      const actual = [10, 20, 30, 40, 50];
      expect(calcIC(pred, actual)).toBeCloseTo(1);
    });

    it('完全负相关IC=-1', () => {
      const pred = [1, 2, 3, 4, 5];
      const actual = [50, 40, 30, 20, 10];
      expect(calcIC(pred, actual)).toBeCloseTo(-1);
    });

    it('恒定值IC=0', () => {
      const pred = [1, 1, 1, 1, 1];
      const actual = [1, 2, 3, 4, 5];
      expect(calcIC(pred, actual)).toBe(0);
    });

    it('空数组返回0', () => {
      expect(calcIC([], [])).toBe(0);
    });

    it('单元素返回0', () => {
      expect(calcIC([1], [2])).toBe(0);
    });
  });
});
