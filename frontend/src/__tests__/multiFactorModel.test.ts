import { describe, it, expect } from 'vitest';

// 多因子模型引擎测试
describe('多因子模型引擎', () => {
  describe('因子暴露度计算', () => {
    function factorExposure(returns: number[], factorReturns: number[]): number {
      if (returns.length !== factorReturns.length || returns.length === 0) return 0;
      const meanR = returns.reduce((a, b) => a + b, 0) / returns.length;
      const meanF = factorReturns.reduce((a, b) => a + b, 0) / factorReturns.length;
      let cov = 0, fVar = 0;
      for (let i = 0; i < returns.length; i++) {
        cov += (returns[i] - meanR) * (factorReturns[i] - meanF);
        fVar += (factorReturns[i] - meanF) ** 2;
      }
      return fVar === 0 ? 0 : cov / fVar;
    }

    it('完全跟随因子暴露度为1', () => {
      const factor = [0.01, 0.02, -0.01, 0.015];
      expect(factorExposure(factor, factor)).toBeCloseTo(1, 5);
    });

    it('2倍因子暴露度为2', () => {
      const factor = [0.01, 0.02, -0.01, 0.015];
      expect(factorExposure(factor.map(r => r * 2), factor)).toBeCloseTo(2, 5);
    });

    it('零因子方差返回0', () => {
      expect(factorExposure([1, 2, 3], [5, 5, 5])).toBe(0);
    });
  });

  describe('Fama-French三因子', () => {
    function famaFrenchAlpha(stockReturns: number[], marketReturns: number[], smbReturns: number[], hmlReturns: number[], beta: number, smbBeta: number, hmlBeta: number): number {
      if (stockReturns.length === 0) return 0;
      const avgStock = stockReturns.reduce((a, b) => a + b, 0) / stockReturns.length;
      const avgMarket = marketReturns.reduce((a, b) => a + b, 0) / marketReturns.length;
      const avgSMB = smbReturns.reduce((a, b) => a + b, 0) / smbReturns.length;
      const avgHML = hmlReturns.reduce((a, b) => a + b, 0) / hmlReturns.length;
      return avgStock - (beta * avgMarket + smbBeta * avgSMB + hmlBeta * avgHML);
    }

    it('零Alpha表示完全解释', () => {
      const mkt = [0.01, 0.02, 0.015, 0.01];
      const smb = [0.005, 0.01, 0.008, 0.005];
      const hml = [0.003, 0.006, 0.004, 0.003];
      const stock = mkt.map((m, i) => 1 * m + 0.5 * smb[i] + 0.3 * hml[i]);
      expect(famaFrenchAlpha(stock, mkt, smb, hml, 1, 0.5, 0.3)).toBeCloseTo(0, 5);
    });

    it('正Alpha表示超额收益', () => {
      const mkt = [0.01, 0.01, 0.01];
      const smb = [0.005, 0.005, 0.005];
      const hml = [0.003, 0.003, 0.003];
      const stock = [0.02, 0.02, 0.02];
      expect(famaFrenchAlpha(stock, mkt, smb, hml, 1, 0, 0)).toBeGreaterThan(0);
    });
  });

  describe('动量因子', () => {
    function momentumScore(prices: number[], lookback: number, skipDays = 1): number {
      if (prices.length < lookback + skipDays) return 0;
      const current = prices[prices.length - 1 - skipDays];
      const past = prices[prices.length - 1 - lookback];
      return (current - past) / past;
    }

    it('上涨价格正动量', () => {
      const prices = Array.from({ length: 30 }, (_, i) => 100 + i);
      expect(momentumScore(prices, 20)).toBeGreaterThan(0);
    });

    it('下跌价格负动量', () => {
      const prices = Array.from({ length: 30 }, (_, i) => 200 - i);
      expect(momentumScore(prices, 20)).toBeLessThan(0);
    });

    it('数据不足返回0', () => {
      expect(momentumScore([1, 2, 3], 20)).toBe(0);
    });
  });

  describe('价值因子', () => {
    function valueScore(pe: number, pb: number, divYield: number, weights = { pe: 0.4, pb: 0.4, div: 0.2 }): number {
      const peScore = pe > 0 ? 1 / pe : 0;
      const pbScore = pb > 0 ? 1 / pb : 0;
      return weights.pe * peScore + weights.pb * pbScore + weights.div * divYield;
    }

    it('低PE高价值', () => {
      expect(valueScore(5, 1, 0.03)).toBeGreaterThan(valueScore(50, 1, 0.03));
    });

    it('低PB高价值', () => {
      expect(valueScore(10, 0.5, 0.03)).toBeGreaterThan(valueScore(10, 5, 0.03));
    });

    it('高股息率高价值', () => {
      expect(valueScore(10, 1, 0.05)).toBeGreaterThan(valueScore(10, 1, 0.01));
    });

    it('负PE不贡献价值', () => {
      expect(valueScore(-1, 1, 0.03)).toBeLessThan(valueScore(10, 1, 0.03));
    });
  });

  describe('质量因子', () => {
    function qualityScore(metrics: { roe: number; debtToEquity: number; grossMargin: number; earningsGrowth: number }): number {
      const roeScore = Math.min(metrics.roe / 0.2, 1);
      const debtScore = Math.max(1 - metrics.debtToEquity / 2, 0);
      const marginScore = Math.min(metrics.grossMargin / 0.5, 1);
      const growthScore = Math.min(Math.max(metrics.earningsGrowth / 0.2, 0), 1);
      return (roeScore * 0.3 + debtScore * 0.25 + marginScore * 0.2 + growthScore * 0.25);
    }

    it('高ROE高质量', () => {
      const high = qualityScore({ roe: 0.25, debtToEquity: 0.5, grossMargin: 0.4, earningsGrowth: 0.15 });
      const low = qualityScore({ roe: 0.05, debtToEquity: 0.5, grossMargin: 0.4, earningsGrowth: 0.15 });
      expect(high).toBeGreaterThan(low);
    });

    it('低负债高质量', () => {
      const low = qualityScore({ roe: 0.15, debtToEquity: 0.2, grossMargin: 0.4, earningsGrowth: 0.15 });
      const high = qualityScore({ roe: 0.15, debtToEquity: 3, grossMargin: 0.4, earningsGrowth: 0.15 });
      expect(low).toBeGreaterThan(high);
    });

    it('分数在0-1之间', () => {
      const s = qualityScore({ roe: 0.15, debtToEquity: 1, grossMargin: 0.3, earningsGrowth: 0.1 });
      expect(s).toBeGreaterThanOrEqual(0);
      expect(s).toBeLessThanOrEqual(1);
    });
  });

  describe('规模因子', () => {
    function sizeCategory(marketCap: number): 'mega' | 'large' | 'mid' | 'small' | 'micro' {
      if (marketCap > 2000e8) return 'mega';
      if (marketCap > 500e8) return 'large';
      if (marketCap > 100e8) return 'mid';
      if (marketCap > 20e8) return 'small';
      return 'micro';
    }

    it('2000亿以上为超大盘', () => {
      expect(sizeCategory(3000e8)).toBe('mega');
    });

    it('20亿以下为微盘', () => {
      expect(sizeCategory(10e8)).toBe('micro');
    });

    it('边界值归类正确', () => {
      expect(sizeCategory(500.01e8)).toBe('large');
      expect(sizeCategory(500e8)).toBe('mid');
      expect(sizeCategory(499.99e8)).toBe('mid');
    });
  });

  describe('因子收益归因', () => {
    function factorAttribution(stockReturn: number, factors: { name: string; exposure: number; return: number }[]): { factorContribution: Record<string, number>; alpha: number } {
      const factorContribution: Record<string, number> = {};
      let totalFactorReturn = 0;
      for (const f of factors) {
        const contrib = f.exposure * f.return;
        factorContribution[f.name] = contrib;
        totalFactorReturn += contrib;
      }
      return { factorContribution, alpha: stockReturn - totalFactorReturn };
    }

    it('因子贡献之和加Alpha等于总收益', () => {
      const factors = [
        { name: 'market', exposure: 1.2, return: 0.05 },
        { name: 'size', exposure: -0.3, return: 0.02 },
      ];
      const result = factorAttribution(0.07, factors);
      const totalContrib = Object.values(result.factorContribution).reduce((a, b) => a + b, 0);
      expect(totalContrib + result.alpha).toBeCloseTo(0.07, 5);
    });

    it('完全归因时Alpha为零', () => {
      const factors = [{ name: 'market', exposure: 1, return: 0.05 }];
      expect(factorAttribution(0.05, factors).alpha).toBeCloseTo(0, 5);
    });

    it('正Alpha表示未被因子解释', () => {
      const factors = [{ name: 'market', exposure: 1, return: 0.03 }];
      expect(factorAttribution(0.05, factors).alpha).toBeGreaterThan(0);
    });
  });
});
