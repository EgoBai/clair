import { describe, it, expect } from 'vitest';

describe('Portfolio Analytics Engine', () => {
  // 收益率计算
  const simpleReturn = (buy: number, sell: number): number => (sell - buy) / buy;
  const logReturn = (buy: number, sell: number): number => Math.log(sell / buy);
  const annualizedReturn = (totalReturn: number, days: number): number => Math.pow(1 + totalReturn, 365 / days) - 1;

  describe('收益率计算', () => {
    it('简单收益率', () => expect(simpleReturn(100, 110)).toBeCloseTo(0.1));
    it('负收益率', () => expect(simpleReturn(100, 90)).toBeCloseTo(-0.1));
    it('零收益率', () => expect(simpleReturn(100, 100)).toBe(0));
    it('翻倍', () => expect(simpleReturn(50, 100)).toBe(1));
    it('归零', () => expect(simpleReturn(100, 0)).toBe(-1));
    it('对数收益率正', () => expect(logReturn(100, 110)).toBeGreaterThan(0));
    it('对数收益率负', () => expect(logReturn(100, 90)).toBeLessThan(0));
    it('对数收益率零', () => expect(logReturn(100, 100)).toBeCloseTo(0));
    it('年化收益率1年', () => expect(annualizedReturn(0.1, 365)).toBeCloseTo(0.1));
    it('年化收益率半年', () => {
      const r = annualizedReturn(0.05, 182);
      expect(r).toBeGreaterThan(0.05);
    });
    it('年化收益率2年', () => {
      const r = annualizedReturn(0.21, 730);
      expect(r).toBeCloseTo(0.1, 1);
    });
    it('年化负收益', () => expect(annualizedReturn(-0.1, 365)).toBeCloseTo(-0.1));
  });

  // 组合权重
  const normalizeWeights = (weights: number[]): number[] => {
    const sum = weights.reduce((a, b) => a + b, 0);
    return sum === 0 ? weights.map(() => 0) : weights.map(w => w / sum);
  };

  const portfolioReturn = (weights: number[], returns: number[]): number =>
    weights.reduce((sum, w, i) => sum + w * returns[i], 0);

  const portfolioVariance = (weights: number[], covariance: number[][]): number => {
    let variance = 0;
    for (let i = 0; i < weights.length; i++)
      for (let j = 0; j < weights.length; j++)
        variance += weights[i] * weights[j] * covariance[i][j];
    return variance;
  };

  describe('组合权重', () => {
    it('归一化', () => {
      const w = normalizeWeights([1, 2, 3]);
      expect(w.reduce((a, b) => a + b, 0)).toBeCloseTo(1);
    });
    it('全零', () => expect(normalizeWeights([0, 0, 0])).toEqual([0, 0, 0]));
    it('单元素', () => expect(normalizeWeights([5])).toEqual([1]));
    it('负权重归一化', () => {
      const w = normalizeWeights([-1, 2]);
      expect(w.reduce((a, b) => a + b, 0)).toBeCloseTo(1);
    });
    it('组合收益', () => {
      const r = portfolioReturn([0.5, 0.5], [0.1, 0.2]);
      expect(r).toBeCloseTo(0.15);
    });
    it('组合收益全仓', () => {
      const r = portfolioReturn([1], [0.1]);
      expect(r).toBeCloseTo(0.1);
    });
    it('组合方差', () => {
      const cov = [[0.04, 0.01], [0.01, 0.09]];
      const v = portfolioVariance([0.5, 0.5], cov);
      expect(v).toBeCloseTo(0.035);
    });
    it('单资产方差', () => {
      const cov = [[0.04]];
      expect(portfolioVariance([1], cov)).toBeCloseTo(0.04);
    });
  });

  // 夏普比率
  const sharpeRatio = (returns: number[], riskFreeRate: number = 0.02): number => {
    const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
    const std = Math.sqrt(returns.reduce((a, b) => a + (b - mean) ** 2, 0) / returns.length);
    return std < 1e-10 ? 0 : (mean - riskFreeRate) / std;
  };

  describe('夏普比率', () => {
    it('正夏普', () => {
      const s = sharpeRatio([0.1, 0.12, 0.08], 0);
      expect(s).toBeGreaterThan(0);
    });
    it('负夏普', () => {
      const s = sharpeRatio([-0.1, -0.05, -0.08], 0);
      expect(s).toBeLessThan(0);
    });
    it('零波动夏普为零', () => {
      const s = sharpeRatio([0.05, 0.05, 0.05], 0.05);
      expect(s).toBe(0); // std is 0, returns 0
    });
    it('高波动低夏普', () => {
      const s = sharpeRatio([0.5, -0.5, 0.5, -0.5], 0);
      expect(Math.abs(s)).toBeLessThan(2);
    });
  });

  // 最大回撤
  const maxDrawdown = (values: number[]): { maxDd: number; peak: number; trough: number } => {
    let peak = values[0], maxDd = 0, peakIdx = 0, troughIdx = 0;
    for (let i = 1; i < values.length; i++) {
      if (values[i] > peak) { peak = values[i]; peakIdx = i; }
      const dd = (peak - values[i]) / peak;
      if (dd > maxDd) { maxDd = dd; troughIdx = i; }
    }
    return { maxDd, peak: peakIdx, trough: troughIdx };
  };

  describe('最大回撤', () => {
    it('下跌回撤', () => {
      const { maxDd } = maxDrawdown([100, 110, 90, 95, 80, 100]);
      expect(maxDd).toBeCloseTo(0.273, 1);
    });
    it('无回撤', () => {
      const { maxDd } = maxDrawdown([100, 110, 120, 130]);
      expect(maxDd).toBe(0);
    });
    it('单元素', () => {
      const { maxDd } = maxDrawdown([100]);
      expect(maxDd).toBe(0);
    });
    it('全跌', () => {
      const { maxDd } = maxDrawdown([100, 80, 60, 40]);
      expect(maxDd).toBeCloseTo(0.6);
    });
    it('V形回撤', () => {
      const { maxDd } = maxDrawdown([100, 50, 100]);
      expect(maxDd).toBeCloseTo(0.5);
    });
    it('回撤不超过100%', () => {
      const { maxDd } = maxDrawdown([100, 1]);
      expect(maxDd).toBeLessThan(1);
    });
  });

  // Beta系数
  const beta = (assetReturns: number[], marketReturns: number[]): number => {
    const n = assetReturns.length;
    const assetMean = assetReturns.reduce((a, b) => a + b, 0) / n;
    const marketMean = marketReturns.reduce((a, b) => a + b, 0) / n;
    let cov = 0, varM = 0;
    for (let i = 0; i < n; i++) {
      cov += (assetReturns[i] - assetMean) * (marketReturns[i] - marketMean);
      varM += (marketReturns[i] - marketMean) ** 2;
    }
    return varM === 0 ? 0 : cov / varM;
  };

  describe('Beta系数', () => {
    it('与市场同步beta=1', () => {
      const m = [0.01, 0.02, -0.01, 0.03];
      expect(beta(m, m)).toBeCloseTo(1);
    });
    it('放大波动beta>1', () => {
      const m = [0.01, 0.02, -0.01, 0.03];
      const a = m.map(r => r * 2);
      expect(beta(a, m)).toBeCloseTo(2);
    });
    it('反向beta<0', () => {
      const m = [0.01, 0.02, -0.01, 0.03];
      const a = m.map(r => -r);
      expect(beta(a, m)).toBeCloseTo(-1);
    });
    it('市场零波动', () => {
      const m = [0.01, 0.01, 0.01];
      const a = [0.02, 0.03, 0.01];
      expect(beta(a, m)).toBe(0);
    });
  });

  // Alpha系数
  const alpha = (assetReturns: number[], marketReturns: number[], rf: number = 0): number => {
    const b = beta(assetReturns, marketReturns);
    const assetMean = assetReturns.reduce((a, bb) => a + bb, 0) / assetReturns.length;
    const marketMean = marketReturns.reduce((a, bb) => a + bb, 0) / marketReturns.length;
    return assetMean - (rf + b * (marketMean - rf));
  };

  describe('Alpha系数', () => {
    it('超额收益为正', () => {
      const a = alpha([0.03, 0.04, 0.02], [0.01, 0.02, 0.01], 0);
      expect(a).toBeGreaterThan(0);
    });
    it('基准同步alpha≈0', () => {
      const m = [0.01, 0.02, 0.015];
      expect(alpha(m, m, 0)).toBeCloseTo(0);
    });
  });

  // 信息比率
  const informationRatio = (portfolioReturns: number[], benchmarkReturns: number[]): number => {
    const diff = portfolioReturns.map((r, i) => r - benchmarkReturns[i]);
    const mean = diff.reduce((a, b) => a + b, 0) / diff.length;
    const std = Math.sqrt(diff.reduce((a, b) => a + (b - mean) ** 2, 0) / diff.length);
    return std === 0 ? 0 : mean / std;
  };

  describe('信息比率', () => {
    it('超额稳定为正', () => {
      const ir = informationRatio([0.03, 0.04, 0.03], [0.01, 0.02, 0.01]);
      expect(ir).toBeGreaterThan(0);
    });
    it('完全同步为零', () => {
      const r = [0.01, 0.02, 0.03];
      expect(informationRatio(r, r)).toBe(0);
    });
    it('跑输为负', () => {
      const ir = informationRatio([0.01, 0.015, 0.01], [0.03, 0.04, 0.03]);
      expect(ir).toBeLessThan(0);
    });
  });

  // 索提诺比率
  const sortinoRatio = (returns: number[], target: number = 0): number => {
    const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
    const downside = returns.filter(r => r < target);
    if (downside.length === 0) return Infinity;
    const downsideStd = Math.sqrt(downside.reduce((a, b) => a + (b - target) ** 2, 0) / downside.length);
    return downsideStd === 0 ? 0 : (mean - target) / downsideStd;
  };

  describe('索提诺比率', () => {
    it('全部正收益', () => {
      expect(sortinoRatio([0.01, 0.02, 0.03], 0)).toBe(Infinity);
    });
    it('混合收益', () => {
      const s = sortinoRatio([0.05, -0.02, 0.03, -0.01], 0);
      expect(s).toBeGreaterThan(0);
    });
    it('全部负收益', () => {
      const s = sortinoRatio([-0.01, -0.02, -0.03], 0);
      expect(s).toBeLessThan(0);
    });
  });

  // 再平衡
  const rebalance = (current: number[], target: number[], totalValue: number): number[] => {
    const targetValues = target.map(w => w * totalValue);
    const currentValues = current.map(w => w * totalValue);
    return targetValues.map((tv, i) => tv - currentValues[i]);
  };

  describe('再平衡', () => {
    it('偏差归零', () => {
      const trades = rebalance([0.5, 0.5], [0.5, 0.5], 100);
      expect(trades.every(t => t === 0)).toBe(true);
    });
    it('需要调仓', () => {
      const trades = rebalance([0.8, 0.2], [0.5, 0.5], 100);
      expect(trades[0]).toBeLessThan(0);
      expect(trades[1]).toBeGreaterThan(0);
    });
    it('调仓金额总和为零', () => {
      const trades = rebalance([0.7, 0.3], [0.4, 0.6], 1000);
      expect(trades.reduce((a, b) => a + b, 0)).toBeCloseTo(0);
    });
    it('全额换仓', () => {
      const trades = rebalance([1, 0], [0, 1], 100);
      expect(trades[0]).toBe(-100);
      expect(trades[1]).toBe(100);
    });
  });
});
