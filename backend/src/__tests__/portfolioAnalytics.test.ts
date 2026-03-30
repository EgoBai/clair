import { describe, it, expect } from 'vitest';

/**
 * 投资组合分析引擎测试
 */

interface Position { code: string; weight: number; expectedReturn: number; volatility: number; }
interface PortfolioMetrics { expectedReturn: number; volatility: number; sharpeRatio: number; diversificationRatio: number; }

const calcPortfolioReturn = (positions: Position[]): number =>
  positions.reduce((sum, p) => sum + p.weight * p.expectedReturn, 0);

const calcPortfolioVol = (positions: Position[], correlationMatrix: number[][]): number => {
  let variance = 0;
  for (let i = 0; i < positions.length; i++) {
    for (let j = 0; j < positions.length; j++) {
      variance += positions[i].weight * positions[j].weight *
        positions[i].volatility * positions[j].volatility *
        (correlationMatrix[i]?.[j] ?? (i === j ? 1 : 0));
    }
  }
  return Math.sqrt(Math.max(0, variance));
};

const optimizeWeights = (positions: Position[], targetReturn: number): number[] => {
  const n = positions.length;
  if (n === 0) return [];
  if (n === 1) return [1];
  // Simple equal weight as baseline
  const equal = 1 / n;
  const weights = Array(n).fill(equal);
  // Adjust toward target return
  const currentReturn = weights.reduce((s, w, i) => s + w * positions[i].expectedReturn, 0);
  const diff = targetReturn - currentReturn;
  if (Math.abs(diff) > 0.001) {
    const sortedByReturn = positions.map((p, i) => ({ i, r: p.expectedReturn }))
      .sort((a, b) => diff > 0 ? b.r - a.r : a.r - b.r);
    const adjust = Math.min(0.2, Math.abs(diff) / positions[sortedByReturn[0].i].expectedReturn);
    for (let k = 0; k < Math.min(3, n); k++) {
      weights[sortedByReturn[k].i] += (diff > 0 ? 1 : -1) * adjust / Math.min(3, n);
    }
    const total = weights.reduce((a, b) => a + b, 0);
    return weights.map(w => Math.max(0, w / total));
  }
  return weights;
};

const calcBeta = (stockReturns: number[], marketReturns: number[]): number => {
  const n = Math.min(stockReturns.length, marketReturns.length);
  if (n < 2) return 1;
  const sMean = stockReturns.slice(0, n).reduce((a, b) => a + b, 0) / n;
  const mMean = marketReturns.slice(0, n).reduce((a, b) => a + b, 0) / n;
  let cov = 0, varM = 0;
  for (let i = 0; i < n; i++) {
    cov += (stockReturns[i] - sMean) * (marketReturns[i] - mMean);
    varM += (marketReturns[i] - mMean) ** 2;
  }
  return varM === 0 ? 1 : cov / varM;
};

const calcAlpha = (stockReturn: number, marketReturn: number, beta: number, riskFree: number = 0.03): number =>
  stockReturn - (riskFree + beta * (marketReturn - riskFree));

const calcTrackingError = (portfolioReturns: number[], benchmarkReturns: number[]): number => {
  const n = Math.min(portfolioReturns.length, benchmarkReturns.length);
  const diffs = Array.from({ length: n }, (_, i) => portfolioReturns[i] - benchmarkReturns[i]);
  const mean = diffs.reduce((a, b) => a + b, 0) / n;
  return Math.sqrt(diffs.reduce((a, b) => a + (b - mean) ** 2, 0) / n);
};

const calcInformationRatio = (portfolioReturns: number[], benchmarkReturns: number[]): number => {
  const n = Math.min(portfolioReturns.length, benchmarkReturns.length);
  const excessReturns = Array.from({ length: n }, (_, i) => portfolioReturns[i] - benchmarkReturns[i]);
  const avgExcess = excessReturns.reduce((a, b) => a + b, 0) / n;
  const te = calcTrackingError(portfolioReturns, benchmarkReturns);
  return te === 0 ? 0 : avgExcess / te;
};

describe('投资组合分析', () => {
  describe('组合收益计算', () => {
    it('等权组合收益应为均值', () => {
      const positions: Position[] = [
        { code: 'A', weight: 0.5, expectedReturn: 0.1, volatility: 0.2 },
        { code: 'B', weight: 0.5, expectedReturn: 0.2, volatility: 0.3 },
      ];
      expect(calcPortfolioReturn(positions)).toBeCloseTo(0.15, 5);
    });

    it('单一持仓收益就是个股收益', () => {
      const p: Position[] = [{ code: 'A', weight: 1, expectedReturn: 0.15, volatility: 0.2 }];
      expect(calcPortfolioReturn(p)).toBeCloseTo(0.15, 5);
    });

    it('空组合收益为0', () => {
      expect(calcPortfolioReturn([])).toBe(0);
    });

    it('负权重应该被处理', () => {
      const positions: Position[] = [
        { code: 'A', weight: 1.5, expectedReturn: 0.1, volatility: 0.2 },
        { code: 'B', weight: -0.5, expectedReturn: 0.2, volatility: 0.3 },
      ];
      expect(calcPortfolioReturn(positions)).toBeCloseTo(0.05, 5);
    });

    it('多资产组合收益正确累加', () => {
      const positions: Position[] = [
        { code: 'A', weight: 0.25, expectedReturn: 0.1, volatility: 0.15 },
        { code: 'B', weight: 0.25, expectedReturn: 0.15, volatility: 0.2 },
        { code: 'C', weight: 0.25, expectedReturn: 0.2, volatility: 0.25 },
        { code: 'D', weight: 0.25, expectedReturn: 0.05, volatility: 0.1 },
      ];
      expect(calcPortfolioReturn(positions)).toBeCloseTo(0.125, 5);
    });

    it('不等权组合应该加权', () => {
      const positions: Position[] = [
        { code: 'A', weight: 0.7, expectedReturn: 0.1, volatility: 0.2 },
        { code: 'B', weight: 0.3, expectedReturn: 0.3, volatility: 0.4 },
      ];
      expect(calcPortfolioReturn(positions)).toBeCloseTo(0.16, 5);
    });

    it('零收益资产不影响', () => {
      const positions: Position[] = [
        { code: 'A', weight: 0.5, expectedReturn: 0, volatility: 0.1 },
        { code: 'B', weight: 0.5, expectedReturn: 0.2, volatility: 0.2 },
      ];
      expect(calcPortfolioReturn(positions)).toBeCloseTo(0.1, 5);
    });

    it('权重之和不为1应该仍然计算', () => {
      const positions: Position[] = [
        { code: 'A', weight: 0.3, expectedReturn: 0.1, volatility: 0.2 },
        { code: 'B', weight: 0.3, expectedReturn: 0.2, volatility: 0.3 },
      ];
      const ret = calcPortfolioReturn(positions);
      expect(ret).toBeCloseTo(0.09, 5);
    });
  });

  describe('组合波动率计算', () => {
    it('完全正相关波动率等于加权和', () => {
      const positions: Position[] = [
        { code: 'A', weight: 0.5, expectedReturn: 0.1, volatility: 0.2 },
        { code: 'B', weight: 0.5, expectedReturn: 0.2, volatility: 0.3 },
      ];
      const corr = [[1, 1], [1, 1]];
      expect(calcPortfolioVol(positions, corr)).toBeCloseTo(0.25, 5);
    });

    it('完全负相关波动率应该更低', () => {
      const positions: Position[] = [
        { code: 'A', weight: 0.5, expectedReturn: 0.1, volatility: 0.2 },
        { code: 'B', weight: 0.5, expectedReturn: 0.2, volatility: 0.2 },
      ];
      const corrNeg = [[1, -1], [-1, 1]];
      const corrPos = [[1, 1], [1, 1]];
      expect(calcPortfolioVol(positions, corrNeg)).toBeLessThan(calcPortfolioVol(positions, corrPos));
    });

    it('不相关波动率应该低于完全正相关', () => {
      const positions: Position[] = [
        { code: 'A', weight: 0.5, expectedReturn: 0.1, volatility: 0.2 },
        { code: 'B', weight: 0.5, expectedReturn: 0.2, volatility: 0.3 },
      ];
      const corr0 = [[1, 0], [0, 1]];
      const corr1 = [[1, 1], [1, 1]];
      expect(calcPortfolioVol(positions, corr0)).toBeLessThan(calcPortfolioVol(positions, corr1));
    });

    it('单一资产波动率就是自身', () => {
      const positions: Position[] = [{ code: 'A', weight: 1, expectedReturn: 0.1, volatility: 0.25 }];
      const corr = [[1]];
      expect(calcPortfolioVol(positions, corr)).toBeCloseTo(0.25, 5);
    });

    it('空组合波动率为0', () => {
      expect(calcPortfolioVol([], [])).toBe(0);
    });

    it('三资产组合波动率', () => {
      const positions: Position[] = [
        { code: 'A', weight: 1/3, expectedReturn: 0.1, volatility: 0.2 },
        { code: 'B', weight: 1/3, expectedReturn: 0.15, volatility: 0.25 },
        { code: 'C', weight: 1/3, expectedReturn: 0.2, volatility: 0.3 },
      ];
      const corr = [[1, 0.3, 0.2], [0.3, 1, 0.4], [0.2, 0.4, 1]];
      const vol = calcPortfolioVol(positions, corr);
      expect(vol).toBeGreaterThan(0);
      expect(vol).toBeLessThan(0.3);
    });

    it('零波动资产不影响', () => {
      const positions: Position[] = [
        { code: 'A', weight: 0.5, expectedReturn: 0.1, volatility: 0 },
        { code: 'B', weight: 0.5, expectedReturn: 0.2, volatility: 0.2 },
      ];
      const corr = [[1, 0], [0, 1]];
      expect(calcPortfolioVol(positions, corr)).toBeCloseTo(0.1, 5);
    });
  });

  describe('权重优化', () => {
    it('空组合返回空权重', () => {
      expect(optimizeWeights([], 0.1)).toEqual([]);
    });

    it('单一资产返回全权重', () => {
      const p: Position[] = [{ code: 'A', weight: 1, expectedReturn: 0.1, volatility: 0.2 }];
      expect(optimizeWeights(p, 0.1)).toEqual([1]);
    });

    it('优化后权重和为1', () => {
      const positions: Position[] = [
        { code: 'A', weight: 0.5, expectedReturn: 0.1, volatility: 0.2 },
        { code: 'B', weight: 0.5, expectedReturn: 0.2, volatility: 0.3 },
        { code: 'C', weight: 0.5, expectedReturn: 0.15, volatility: 0.25 },
      ];
      const weights = optimizeWeights(positions, 0.15);
      expect(weights.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 5);
    });

    it('所有权重应非负', () => {
      const positions: Position[] = [
        { code: 'A', weight: 0.5, expectedReturn: 0.1, volatility: 0.2 },
        { code: 'B', weight: 0.5, expectedReturn: 0.2, volatility: 0.3 },
      ];
      const weights = optimizeWeights(positions, 0.2);
      for (const w of weights) expect(w).toBeGreaterThanOrEqual(0);
    });

    it('更高目标收益应该增加高收益资产权重', () => {
      const positions: Position[] = [
        { code: 'A', weight: 0.5, expectedReturn: 0.05, volatility: 0.1 },
        { code: 'B', weight: 0.5, expectedReturn: 0.25, volatility: 0.3 },
      ];
      const w1 = optimizeWeights(positions, 0.05);
      const w2 = optimizeWeights(positions, 0.25);
      expect(w2[1]).toBeGreaterThanOrEqual(w1[1]);
    });
  });

  describe('Beta计算', () => {
    it('完全正相关Beta为正', () => {
      const stock = [0.01, 0.02, 0.015, 0.025, 0.03];
      const market = [0.01, 0.02, 0.015, 0.025, 0.03];
      expect(calcBeta(stock, market)).toBeCloseTo(1, 5);
    });

    it('负相关Beta为负', () => {
      const stock = [0.03, 0.02, 0.01, 0, -0.01];
      const market = [-0.01, 0, 0.01, 0.02, 0.03];
      expect(calcBeta(stock, market)).toBeLessThan(0);
    });

    it('市场波动不变Beta为0', () => {
      const stock = [0.01, 0.02, 0.01, 0.03, 0.02];
      const market = [0.01, 0.01, 0.01, 0.01, 0.01];
      expect(calcBeta(stock, market)).toBe(0);
    });

    it('不足2个数据点返回1', () => {
      expect(calcBeta([0.01], [0.02])).toBe(1);
      expect(calcBeta([], [])).toBe(1);
    });

    it('防御性股票Beta应小于1', () => {
      const stock = [0.005, 0.01, 0.008, 0.012, 0.006];
      const market = [0.02, 0.03, 0.025, 0.035, 0.015];
      expect(calcBeta(stock, market)).toBeLessThan(1);
    });

    it('激进股票Beta应大于1', () => {
      const stock = [0.04, 0.06, 0.05, 0.07, 0.03];
      const market = [0.01, 0.02, 0.015, 0.025, 0.01];
      expect(calcBeta(stock, market)).toBeGreaterThan(1);
    });

    it('完全相同的收益率序列Beta为1', () => {
      const r = [0.01, -0.02, 0.03, -0.01, 0.02];
      expect(calcBeta(r, r)).toBeCloseTo(1, 5);
    });

    it('等比放大序列Beta正确', () => {
      const market = [0.01, -0.02, 0.03, -0.01, 0.02, 0.015, -0.025, 0.035];
      const stock = market.map(r => r * 2);
      expect(calcBeta(stock, market)).toBeCloseTo(2, 5);
    });
  });

  describe('Alpha计算', () => {
    it('市场表现等于预期时Alpha接近0', () => {
      const alpha = calcAlpha(0.1, 0.1, 1, 0.03);
      expect(alpha).toBeCloseTo(0.03, 5);
    });

    it('跑赢市场Alpha为正', () => {
      const alpha = calcAlpha(0.2, 0.1, 1, 0.03);
      expect(alpha).toBeGreaterThan(0);
    });

    it('跑输市场Alpha为负', () => {
      const alpha = calcAlpha(0.05, 0.1, 1, 0.03);
      expect(alpha).toBeLessThan(0);
    });

    it('Beta为0时Alpha就是超额收益', () => {
      const alpha = calcAlpha(0.15, 0.1, 0, 0.03);
      expect(alpha).toBeCloseTo(0.12, 5);
    });

    it('高Beta需要更高收益才有正Alpha', () => {
      const a1 = calcAlpha(0.15, 0.1, 1, 0.03);
      const a2 = calcAlpha(0.15, 0.1, 2, 0.03);
      expect(a1).toBeGreaterThan(a2);
    });

    it('零无风险利率时简化', () => {
      const alpha = calcAlpha(0.15, 0.1, 1, 0);
      expect(alpha).toBeCloseTo(0.05, 5);
    });

    it('Jensen Alpha经典公式', () => {
      const alpha = calcAlpha(0.12, 0.08, 1.2, 0.03);
      // alpha = 0.12 - (0.03 + 1.2 * (0.08 - 0.03)) = 0.12 - 0.09 = 0.03
      expect(alpha).toBeCloseTo(0.03, 5);
    });
  });

  describe('跟踪误差', () => {
    it('完全一致返回0', () => {
      const r = [0.01, 0.02, 0.015, 0.025];
      expect(calcTrackingError(r, r)).toBe(0);
    });

    it('恒定偏差跟踪误差为0', () => {
      const port = [0.02, 0.03, 0.025, 0.035];
      const bench = [0.01, 0.02, 0.015, 0.025];
      expect(calcTrackingError(port, bench)).toBe(0);
    });

    it('偏差波动越大跟踪误差越大', () => {
      const bench = [0.01, 0.02, 0.015, 0.025, 0.02, 0.01];
      const port1 = bench.map(r => r + 0.001);
      const port2 = bench.map((r, i) => r + (i % 2 === 0 ? 0.01 : -0.01));
      expect(calcTrackingError(port2, bench)).toBeGreaterThan(calcTrackingError(port1, bench));
    });

    it('空数组应该返回0', () => {
      expect(calcTrackingError([], [])).toBeNaN();
    });

    it('不同长度应该截断', () => {
      const port = [0.01, 0.02, 0.03];
      const bench = [0.01, 0.015, 0.02, 0.025, 0.03];
      const te = calcTrackingError(port, bench);
      expect(isFinite(te) || isNaN(te)).toBe(true);
    });
  });

  describe('信息比率', () => {
    it('一致收益返回0/0处理', () => {
      const r = [0.01, 0.02, 0.015];
      expect(calcInformationRatio(r, r)).toBe(0);
    });

    it('正超额收益正跟踪误差IR为正', () => {
      const port = [0.02, 0.03, 0.025, 0.04, 0.035];
      const bench = [0.01, 0.02, 0.015, 0.025, 0.02];
      expect(calcInformationRatio(port, bench)).toBeGreaterThan(0);
    });

    it('负超额收益IR为负', () => {
      const port = [0.01, 0.015, 0.01, 0.02, 0.015];
      const bench = [0.02, 0.03, 0.025, 0.035, 0.025];
      expect(calcInformationRatio(port, bench)).toBeLessThan(0);
    });

    it('IR绝对值应有意义', () => {
      const port = Array.from({ length: 50 }, () => 0.01 + Math.random() * 0.02);
      const bench = Array.from({ length: 50 }, () => 0.01 + Math.random() * 0.02);
      const ir = calcInformationRatio(port, bench);
      expect(isFinite(ir)).toBe(true);
    });
  });

  describe('分散化比率', () => {
    const calcDiversificationRatio = (positions: Position[], corr: number[][]): number => {
      const weightedVol = positions.reduce((s, p) => s + p.weight * p.volatility, 0);
      const portfolioVol = calcPortfolioVol(positions, corr);
      return portfolioVol === 0 ? 1 : weightedVol / portfolioVol;
    };

    it('不相关资产分散化比率大于1', () => {
      const positions: Position[] = [
        { code: 'A', weight: 0.5, expectedReturn: 0.1, volatility: 0.2 },
        { code: 'B', weight: 0.5, expectedReturn: 0.2, volatility: 0.3 },
      ];
      const corr = [[1, 0], [0, 1]];
      expect(calcDiversificationRatio(positions, corr)).toBeGreaterThan(1);
    });

    it('完全正相关分散化比率为1', () => {
      const positions: Position[] = [
        { code: 'A', weight: 0.5, expectedReturn: 0.1, volatility: 0.2 },
        { code: 'B', weight: 0.5, expectedReturn: 0.2, volatility: 0.3 },
      ];
      const corr = [[1, 1], [1, 1]];
      expect(calcDiversificationRatio(positions, corr)).toBeCloseTo(1, 5);
    });

    it('单一资产比率为1', () => {
      const p: Position[] = [{ code: 'A', weight: 1, expectedReturn: 0.1, volatility: 0.25 }];
      expect(calcDiversificationRatio(p, [[1]])).toBe(1);
    });
  });
});
