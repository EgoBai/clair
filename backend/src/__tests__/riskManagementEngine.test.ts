import { describe, it, expect } from 'vitest';

// 风险管理引擎测试
describe('风险管理引擎', () => {
  describe('VaR计算', () => {
    const calcVaR = (returns: number[], confidence: number): number => {
      if (returns.length === 0) return 0;
      const sorted = [...returns].sort((a, b) => a - b);
      const index = Math.floor((1 - confidence) * sorted.length);
      return -sorted[Math.min(index, sorted.length - 1)];
    };

    it('95% VaR', () => {
      const returns = Array.from({ length: 100 }, (_, i) => (i - 50) / 1000);
      const var95 = calcVaR(returns, 0.95);
      expect(var95).toBeGreaterThan(0);
    });

    it('99% VaR 更严格', () => {
      const returns = Array.from({ length: 100 }, (_, i) => (i - 50) / 1000);
      const var95 = calcVaR(returns, 0.95);
      const var99 = calcVaR(returns, 0.99);
      expect(var99).toBeGreaterThanOrEqual(var95);
    });

    it('空数组返回0', () => {
      expect(calcVaR([], 0.95)).toBe(0);
    });

    it('正收益VaR为负', () => {
      const returns = [0.01, 0.02, 0.03, 0.04, 0.05];
      expect(calcVaR(returns, 0.95)).toBeLessThan(0);
    });
  });

  describe('最大回撤', () => {
    const calcMaxDrawdown = (prices: number[]): { maxDD: number; peak: number; trough: number } => {
      let peak = prices[0];
      let maxDD = 0;
      let peakIdx = 0;
      let troughIdx = 0;

      for (let i = 1; i < prices.length; i++) {
        if (prices[i] > peak) {
          peak = prices[i];
          peakIdx = i;
        }
        const dd = (peak - prices[i]) / peak;
        if (dd > maxDD) {
          maxDD = dd;
          troughIdx = i;
        }
      }
      return { maxDD, peak: peakIdx, trough: troughIdx };
    };

    it('单边上涨无回撤', () => {
      const prices = [10, 11, 12, 13, 14];
      expect(calcMaxDrawdown(prices).maxDD).toBe(0);
    });

    it('单边下跌全回撤', () => {
      const prices = [10, 9, 8, 7, 6];
      const result = calcMaxDrawdown(prices);
      expect(result.maxDD).toBeCloseTo(0.4);
    });

    it('回撤峰值在下跌前', () => {
      const prices = [10, 15, 12, 18, 10];
      const result = calcMaxDrawdown(prices);
      expect(result.maxDD).toBeGreaterThan(0);
      expect(result.peak).toBeLessThan(result.trough);
    });

    it('单价格无回撤', () => {
      expect(calcMaxDrawdown([10]).maxDD).toBe(0);
    });

    it('V型回撤', () => {
      const prices = [10, 15, 5, 20];
      const result = calcMaxDrawdown(prices);
      expect(result.maxDD).toBeCloseTo(2 / 3);
    });
  });

  describe('夏普比率', () => {
    const calcSharpe = (returns: number[], riskFreeRate: number): number => {
      if (returns.length === 0) return 0;
      const avgReturn = returns.reduce((a, b) => a + b, 0) / returns.length;
      const excess = avgReturn - riskFreeRate / 252;
      const std = Math.sqrt(
        returns.reduce((a, b) => a + (b - avgReturn) ** 2, 0) / returns.length
      );
      return std > 1e-10 ? (excess / std) * Math.sqrt(252) : 0;
    };

    it('正收益正夏普', () => {
      const returns = Array.from({ length: 100 }, () => 0.001 + Math.random() * 0.002);
      expect(calcSharpe(returns, 0.02)).toBeGreaterThan(0);
    });

    it('零波动率为0', () => {
      const returns = Array(100).fill(0.001);
      const sharpe = calcSharpe(returns, 0);
      expect(sharpe).toBeCloseTo(0, 0); // 不是精确0因为有excess
    });

    it('空数组返回0', () => {
      expect(calcSharpe([], 0.02)).toBe(0);
    });

    it('高无风险利率降低夏普', () => {
      const returns = Array.from({ length: 100 }, (_, i) => 0.001 + (i % 10) * 0.0001);
      const s1 = calcSharpe(returns, 0.01);
      const s2 = calcSharpe(returns, 0.10);
      expect(s1).toBeGreaterThan(s2);
    });
  });

  describe('Beta系数', () => {
    const calcBeta = (stockReturns: number[], marketReturns: number[]): number => {
      const n = Math.min(stockReturns.length, marketReturns.length);
      const stockMean = stockReturns.slice(0, n).reduce((a, b) => a + b, 0) / n;
      const marketMean = marketReturns.slice(0, n).reduce((a, b) => a + b, 0) / n;

      let cov = 0, varM = 0;
      for (let i = 0; i < n; i++) {
        cov += (stockReturns[i] - stockMean) * (marketReturns[i] - marketMean);
        varM += (marketReturns[i] - marketMean) ** 2;
      }
      return varM > 0 ? cov / varM : 0;
    };

    it('Beta=1同向等幅', () => {
      const market = [0.01, -0.02, 0.03, -0.01, 0.02];
      expect(calcBeta(market, market)).toBeCloseTo(1);
    });

    it('Beta>1高波动', () => {
      const market = [0.01, -0.01, 0.02, -0.02, 0.01];
      const stock = market.map(r => r * 2);
      expect(calcBeta(stock, market)).toBeCloseTo(2);
    });

    it('Beta<0反向相关', () => {
      const market = [0.01, -0.01, 0.02, -0.02, 0.01];
      const stock = market.map(r => -r);
      expect(calcBeta(stock, market)).toBeCloseTo(-1);
    });

    it('零方差返回0', () => {
      const flat = [0.01, 0.01, 0.01];
      expect(calcBeta(flat, flat)).toBe(0);
    });
  });

  describe('持仓集中度', () => {
    const calcConcentration = (weights: number[]): { hhi: number; topN: number; effectiveN: number } => {
      const hhi = weights.reduce((s, w) => s + w ** 2, 0);
      const sorted = [...weights].sort((a, b) => b - a);
      const top3 = sorted.slice(0, 3).reduce((s, w) => s + w, 0);
      const effectiveN = hhi > 0 ? 1 / hhi : 0;
      return { hhi, topN: top3, effectiveN };
    };

    it('等权重分散度最高', () => {
      const equal = Array(10).fill(0.1);
      const result = calcConcentration(equal);
      expect(result.effectiveN).toBeCloseTo(10);
    });

    it('单一持仓集中度最高', () => {
      const concentrated = [1, 0, 0, 0, 0];
      const result = calcConcentration(concentrated);
      expect(result.hhi).toBe(1);
      expect(result.effectiveN).toBeCloseTo(1);
    });

    it('top3占比', () => {
      const weights = [0.5, 0.3, 0.1, 0.05, 0.05];
      const result = calcConcentration(weights);
      expect(result.topN).toBeCloseTo(0.9);
    });

    it('空权重', () => {
      const result = calcConcentration([]);
      expect(result.hhi).toBe(0);
      expect(result.effectiveN).toBe(0);
    });
  });

  describe('止盈止损', () => {
    const checkStopLoss = (entryPrice: number, currentPrice: number, stopLossPct: number): boolean => {
      return (entryPrice - currentPrice) / entryPrice >= stopLossPct;
    };

    const checkTakeProfit = (entryPrice: number, currentPrice: number, takeProfitPct: number): boolean => {
      return (currentPrice - entryPrice) / entryPrice >= takeProfitPct;
    };

    it('触发止损', () => {
      expect(checkStopLoss(10, 9, 0.05)).toBe(true);  // 10% loss, > 5% threshold
    });

    it('未触发止损', () => {
      expect(checkStopLoss(10, 9.8, 0.05)).toBe(false);  // 2% loss, < 5%
    });

    it('触发止盈', () => {
      expect(checkTakeProfit(10, 11, 0.05)).toBe(true);  // 10% gain, > 5%
    });

    it('未触发止盈', () => {
      expect(checkTakeProfit(10, 10.3, 0.05)).toBe(false);  // 3% gain, < 5%
    });

    it('精确触发边界', () => {
      expect(checkStopLoss(10, 9.5, 0.05)).toBe(true);  // exactly 5%
      expect(checkTakeProfit(10, 10.5, 0.05)).toBe(true);  // exactly 5%
    });
  });

  describe('风险价值贡献', () => {
    const calcRiskContribution = (weights: number[], covMatrix: number[][]) => {
      const n = weights.length;
      const portfolioVar = weights.reduce((s, wi, i) =>
        s + wi * weights.reduce((t, wj, j) =>
          t + wj * covMatrix[i][j], 0), 0);

      return weights.map((w, i) => {
        const marginal = weights.reduce((s, wj, j) => s + wj * covMatrix[i][j], 0);
        return portfolioVar > 0 ? (w * marginal) / portfolioVar : 0;
      });
    };

    it('等权对称资产贡献相等', () => {
      const cov = [[0.04, 0.01], [0.01, 0.04]];
      const rc = calcRiskContribution([0.5, 0.5], cov);
      expect(rc[0]).toBeCloseTo(rc[1]!);
    });

    it('风险贡献总和为1', () => {
      const cov = [[0.04, 0.02, 0.01], [0.02, 0.09, 0.03], [0.01, 0.03, 0.16]];
      const rc = calcRiskContribution([0.4, 0.3, 0.3], cov);
      const sum = rc.reduce((a, b) => a + b, 0);
      expect(sum).toBeCloseTo(1);
    });

    it('零权重零贡献', () => {
      const cov = [[0.04, 0.01], [0.01, 0.04]];
      const rc = calcRiskContribution([0, 1], cov);
      expect(rc[0]).toBeCloseTo(0);
    });
  });

  describe('压力测试', () => {
    const stressTest = (
      portfolioValue: number,
      shocks: { factor: string; change: number; exposure: number }[]
    ) => {
      const impacts = shocks.map(s => ({
        factor: s.factor,
        pnl: portfolioValue * s.exposure * s.change,
        pctChange: s.exposure * s.change,
      }));
      const totalPnl = impacts.reduce((s, i) => s + i.pnl, 0);
      return { impacts, totalPnl, totalPct: totalPnl / portfolioValue };
    };

    it('计算单因子冲击', () => {
      const result = stressTest(1000000, [
        { factor: 'equity', change: -0.10, exposure: 0.6 },
      ]);
      expect(result.totalPnl).toBe(-60000);
    });

    it('多因子叠加', () => {
      const result = stressTest(1000000, [
        { factor: 'equity', change: -0.10, exposure: 0.5 },
        { factor: 'bond', change: 0.02, exposure: 0.3 },
        { factor: 'fx', change: -0.05, exposure: 0.2 },
      ]);
      expect(result.totalPnl).toBe(-50000 + 6000 - 10000);
    });

    it('空冲击为零', () => {
      const result = stressTest(1000000, []);
      expect(result.totalPnl).toBe(0);
    });

    it('正向冲击盈利', () => {
      const result = stressTest(1000000, [
        { factor: 'equity', change: 0.10, exposure: 0.8 },
      ]);
      expect(result.totalPnl).toBe(80000);
    });
  });
});
