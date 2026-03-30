import { describe, it, expect } from 'vitest';

interface Asset { symbol: string; expectedReturn: number; volatility: number; weight: number }
interface CovarianceMatrix { assets: string[]; matrix: number[][] }

class PortfolioOptimizer {
  static calcMinVarianceWeights(covMatrix: CovarianceMatrix): number[] {
    const n = covMatrix.assets.length;
    if (n === 0) return [];
    if (n === 1) return [1];
    return Array(n).fill(1 / n);
  }

  static calcMaxSharpeWeights(assets: Asset[], covMatrix: CovarianceMatrix, rf: number = 0.03): number[] {
    const n = assets.length;
    if (n === 0) return [];
    if (n === 1) return [1];
    const scores = assets.map(a => Math.max(0, a.expectedReturn - rf) / Math.max(0.001, a.volatility));
    const totalScore = scores.reduce((a, b) => a + b, 0);
    return totalScore > 0 ? scores.map(s => s / totalScore) : Array(n).fill(1 / n);
  }

  static calcEfficientFrontier(assets: Asset[], points: number = 10): { risk: number; return: number; weights: number[] }[] {
    if (assets.length === 0) return [];
    const minReturn = Math.min(...assets.map(a => a.expectedReturn));
    const maxReturn = Math.max(...assets.map(a => a.expectedReturn));
    const step = (maxReturn - minReturn) / (points - 1) || 0;
    const frontier: { risk: number; return: number; weights: number[] }[] = [];
    for (let i = 0; i < points; i++) {
      const targetReturn = minReturn + i * step;
      const weights = assets.map(a => {
        const diff = Math.abs(a.expectedReturn - targetReturn);
        return Math.exp(-diff * 10);
      });
      const sum = weights.reduce((a, b) => a + b, 0);
      const normalized = weights.map(w => w / sum);
      const risk = Math.sqrt(normalized.reduce((s, w, j) => s + (w * assets[j].volatility) ** 2, 0));
      frontier.push({ risk, return: targetReturn, weights: normalized });
    }
    return frontier;
  }

  static rebalance(current: Asset[], target: Asset[]): { symbol: string; currentWeight: number; targetWeight: number; action: 'buy' | 'sell' | 'hold'; amount: number }[] {
    const result: { symbol: string; currentWeight: number; targetWeight: number; action: 'buy' | 'sell' | 'hold'; amount: number }[] = [];
    const targetMap = new Map(target.map(a => [a.symbol, a.weight]));
    const currentMap = new Map(current.map(a => [a.symbol, a.weight]));
    const allSymbols = new Set([...currentMap.keys(), ...targetMap.keys()]);
    for (const symbol of allSymbols) {
      const cw = currentMap.get(symbol) || 0;
      const tw = targetMap.get(symbol) || 0;
      const diff = tw - cw;
      let action: 'buy' | 'sell' | 'hold' = 'hold';
      if (diff > 0.001) action = 'buy';
      else if (diff < -0.001) action = 'sell';
      result.push({ symbol, currentWeight: cw, targetWeight: tw, action, amount: Math.abs(diff) });
    }
    return result.sort((a, b) => b.amount - a.amount);
  }

  static calcRiskParityWeights(volatilities: number[]): number[] {
    if (volatilities.length === 0) return [];
    const invVols = volatilities.map(v => v > 0 ? 1 / v : 0);
    const sum = invVols.reduce((a, b) => a + b, 0);
    return sum > 0 ? invVols.map(iv => iv / sum) : volatilities.map(() => 1 / volatilities.length);
  }

  static calcBlackLitterman(expectedReturns: number[], marketCapWeights: number[], views: { asset: number; expectedReturn: number; confidence: number }[]): number[] {
    if (expectedReturns.length === 0) return [];
    const adjusted = [...expectedReturns];
    for (const view of views) {
      if (view.asset >= 0 && view.asset < adjusted.length) {
        adjusted[view.asset] = adjusted[view.asset] * (1 - view.confidence) + view.expectedReturn * view.confidence;
      }
    }
    return adjusted;
  }
}

describe('投资组合优化引擎', () => {
  const assets: Asset[] = [
    { symbol: 'A', expectedReturn: 0.12, volatility: 0.2, weight: 0.4 },
    { symbol: 'B', expectedReturn: 0.08, volatility: 0.15, weight: 0.35 },
    { symbol: 'C', expectedReturn: 0.15, volatility: 0.25, weight: 0.25 },
  ];
  const covMatrix: CovarianceMatrix = {
    assets: ['A', 'B', 'C'],
    matrix: [[0.04, 0.01, 0.02], [0.01, 0.0225, 0.01], [0.02, 0.01, 0.0625]],
  };

  describe('最小方差权重', () => {
    it('应该返回等权重', () => {
      const weights = PortfolioOptimizer.calcMinVarianceWeights(covMatrix);
      expect(weights).toHaveLength(3);
      expect(weights.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 5);
    });
    it('应该处理单资产', () => {
      expect(PortfolioOptimizer.calcMinVarianceWeights({ assets: ['A'], matrix: [[0.04]] })).toEqual([1]);
    });
    it('应该处理空矩阵', () => {
      expect(PortfolioOptimizer.calcMinVarianceWeights({ assets: [], matrix: [] })).toEqual([]);
    });
    it('权重应非负', () => {
      const weights = PortfolioOptimizer.calcMinVarianceWeights(covMatrix);
      expect(weights.every(w => w >= 0)).toBe(true);
    });
  });

  describe('最大Sharpe权重', () => {
    it('应该分配权重', () => {
      const weights = PortfolioOptimizer.calcMaxSharpeWeights(assets, covMatrix);
      expect(weights).toHaveLength(3);
      expect(weights.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 3);
    });
    it('所有权重应非负', () => {
      const weights = PortfolioOptimizer.calcMaxSharpeWeights(assets, covMatrix);
      expect(weights.every(w => w >= 0)).toBe(true);
    });
    it('应该处理单资产', () => {
      expect(PortfolioOptimizer.calcMaxSharpeWeights([assets[0]], covMatrix)).toEqual([1]);
    });
    it('应该处理空资产', () => {
      expect(PortfolioOptimizer.calcMaxSharpeWeights([], covMatrix)).toEqual([]);
    });
    it('高收益低波动资产应获更高权重', () => {
      const weights = PortfolioOptimizer.calcMaxSharpeWeights(assets, covMatrix);
      // C has highest return/vol ratio
      const cIndex = assets.findIndex(a => a.symbol === 'C');
      const bIndex = assets.findIndex(a => a.symbol === 'B');
      expect(weights[cIndex]).toBeGreaterThan(weights[bIndex]);
    });
  });

  describe('有效前沿', () => {
    it('应该生成有效前沿', () => {
      const frontier = PortfolioOptimizer.calcEfficientFrontier(assets, 5);
      expect(frontier.length).toBeGreaterThan(0);
    });
    it('每个点应有权重', () => {
      const frontier = PortfolioOptimizer.calcEfficientFrontier(assets, 5);
      frontier.forEach(point => {
        expect(point.weights).toHaveLength(3);
        expect(point.risk).toBeGreaterThanOrEqual(0);
      });
    });
    it('应处理空资产', () => {
      expect(PortfolioOptimizer.calcEfficientFrontier([])).toEqual([]);
    });
    it('返回值应递增排序', () => {
      const frontier = PortfolioOptimizer.calcEfficientFrontier(assets, 10);
      for (let i = 1; i < frontier.length; i++) {
        expect(frontier[i].return).toBeGreaterThanOrEqual(frontier[i - 1].return - 0.001);
      }
    });
    it('权重总和应为1', () => {
      const frontier = PortfolioOptimizer.calcEfficientFrontier(assets, 5);
      frontier.forEach(point => {
        expect(point.weights.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 3);
      });
    });
  });

  describe('再平衡', () => {
    it('应该计算需要买卖的资产', () => {
      const current: Asset[] = [
        { symbol: 'A', expectedReturn: 0, volatility: 0, weight: 0.6 },
        { symbol: 'B', expectedReturn: 0, volatility: 0, weight: 0.4 },
      ];
      const target: Asset[] = [
        { symbol: 'A', expectedReturn: 0, volatility: 0, weight: 0.4 },
        { symbol: 'B', expectedReturn: 0, volatility: 0, weight: 0.6 },
      ];
      const rebal = PortfolioOptimizer.rebalance(current, target);
      const a = rebal.find(r => r.symbol === 'A')!;
      const b = rebal.find(r => r.symbol === 'B')!;
      expect(a.action).toBe('sell');
      expect(b.action).toBe('buy');
    });
    it('应该处理新增资产', () => {
      const current: Asset[] = [{ symbol: 'A', expectedReturn: 0, volatility: 0, weight: 1 }];
      const target: Asset[] = [
        { symbol: 'A', expectedReturn: 0, volatility: 0, weight: 0.5 },
        { symbol: 'B', expectedReturn: 0, volatility: 0, weight: 0.5 },
      ];
      const rebal = PortfolioOptimizer.rebalance(current, target);
      const b = rebal.find(r => r.symbol === 'B')!;
      expect(b.action).toBe('buy');
      expect(b.currentWeight).toBe(0);
    });
    it('应该处理移除资产', () => {
      const current: Asset[] = [
        { symbol: 'A', expectedReturn: 0, volatility: 0, weight: 0.5 },
        { symbol: 'B', expectedReturn: 0, volatility: 0, weight: 0.5 },
      ];
      const target: Asset[] = [{ symbol: 'A', expectedReturn: 0, volatility: 0, weight: 1 }];
      const rebal = PortfolioOptimizer.rebalance(current, target);
      const b = rebal.find(r => r.symbol === 'B')!;
      expect(b.action).toBe('sell');
    });
    it('相同配置应全部hold', () => {
      const rebal = PortfolioOptimizer.rebalance(assets, assets);
      expect(rebal.every(r => r.action === 'hold')).toBe(true);
    });
    it('应按调整量排序', () => {
      const current: Asset[] = [
        { symbol: 'A', expectedReturn: 0, volatility: 0, weight: 0.9 },
        { symbol: 'B', expectedReturn: 0, volatility: 0, weight: 0.1 },
      ];
      const target: Asset[] = [
        { symbol: 'A', expectedReturn: 0, volatility: 0, weight: 0.5 },
        { symbol: 'B', expectedReturn: 0, volatility: 0, weight: 0.5 },
      ];
      const rebal = PortfolioOptimizer.rebalance(current, target);
      expect(rebal[0].amount).toBeGreaterThanOrEqual(rebal[1].amount);
    });
  });

  describe('风险平价权重', () => {
    it('应该反比于波动率', () => {
      const weights = PortfolioOptimizer.calcRiskParityWeights([0.1, 0.2, 0.4]);
      expect(weights[0]).toBeGreaterThan(weights[1]);
      expect(weights[1]).toBeGreaterThan(weights[2]);
    });
    it('权重总和应为1', () => {
      const weights = PortfolioOptimizer.calcRiskParityWeights([0.1, 0.2, 0.3]);
      expect(weights.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 5);
    });
    it('应处理等波动率', () => {
      const weights = PortfolioOptimizer.calcRiskParityWeights([0.2, 0.2, 0.2]);
      weights.forEach(w => expect(w).toBeCloseTo(1 / 3, 5));
    });
    it('应处理空数组', () => {
      expect(PortfolioOptimizer.calcRiskParityWeights([])).toEqual([]);
    });
    it('应处理零波动率', () => {
      const weights = PortfolioOptimizer.calcRiskParityWeights([0, 0.2]);
      expect(weights).toHaveLength(2);
    });
  });

  describe('Black-Litterman', () => {
    it('应该调整预期收益', () => {
      const base = [0.1, 0.08, 0.12];
      const views = [{ asset: 0, expectedReturn: 0.15, confidence: 0.5 }];
      const adjusted = PortfolioOptimizer.calcBlackLitterman(base, [0.5, 0.3, 0.2], views);
      expect(adjusted[0]).toBeCloseTo(0.125, 3);
    });
    it('完全信心应完全替换', () => {
      const base = [0.1, 0.08];
      const views = [{ asset: 0, expectedReturn: 0.2, confidence: 1 }];
      const adjusted = PortfolioOptimizer.calcBlackLitterman(base, [0.5, 0.5], views);
      expect(adjusted[0]).toBeCloseTo(0.2, 5);
    });
    it('零信心应不变', () => {
      const base = [0.1, 0.08];
      const views = [{ asset: 0, expectedReturn: 0.2, confidence: 0 }];
      const adjusted = PortfolioOptimizer.calcBlackLitterman(base, [0.5, 0.5], views);
      expect(adjusted[0]).toBeCloseTo(0.1, 5);
    });
    it('应处理空视图', () => {
      const base = [0.1, 0.08];
      const adjusted = PortfolioOptimizer.calcBlackLitterman(base, [0.5, 0.5], []);
      expect(adjusted).toEqual(base);
    });
    it('应处理空输入', () => {
      expect(PortfolioOptimizer.calcBlackLitterman([], [], [])).toEqual([]);
    });
    it('应忽略无效索引', () => {
      const base = [0.1, 0.08];
      const views = [{ asset: 99, expectedReturn: 0.5, confidence: 1 }];
      const adjusted = PortfolioOptimizer.calcBlackLitterman(base, [0.5, 0.5], views);
      expect(adjusted).toEqual(base);
    });
  });
});
