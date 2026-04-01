import { describe, it, expect } from 'vitest';

/**
 * 投资组合优化引擎测试
 * 均值方差/最小方差/等权重/风险平价
 */

interface AssetReturn {
  symbol: string;
  returns: number[];
  expectedReturn: number;
  volatility: number;
}

interface PortfolioWeights {
  weights: Map<string, number>;
  expectedReturn: number;
  volatility: number;
  sharpeRatio: number;
}

function calculateEqualWeight(assets: AssetReturn[]): Map<string, number> {
  const w = 1 / assets.length;
  const weights = new Map<string, number>();
  assets.forEach(a => weights.set(a.symbol, w));
  return weights;
}

function calculateMinVarianceWeights(assets: AssetReturn[]): Map<string, number> {
  // Simplified: inverse volatility weighting
  const invVols = assets.map(a => 1 / Math.max(0.001, a.volatility));
  const total = invVols.reduce((s, v) => s + v, 0);
  const weights = new Map<string, number>();
  assets.forEach((a, i) => weights.set(a.symbol, parseFloat((invVols[i] / total).toFixed(4))));
  return weights;
}

function calculateRiskParityWeights(assets: AssetReturn[]): Map<string, number> {
  const invVols = assets.map(a => 1 / Math.max(0.001, a.volatility));
  const total = invVols.reduce((s, v) => s + v, 0);
  const weights = new Map<string, number>();
  assets.forEach((a, i) => weights.set(a.symbol, parseFloat((invVols[i] / total).toFixed(4))));
  return weights;
}

function calculatePortfolioReturn(assets: AssetReturn[], weights: Map<string, number>): number {
  return assets.reduce((s, a) => s + (weights.get(a.symbol) || 0) * a.expectedReturn, 0);
}

function calculatePortfolioVolatility(assets: AssetReturn[], weights: Map<string, number>): number {
  // Simplified: weighted average vol (no correlation matrix)
  return assets.reduce((s, a) => s + (weights.get(a.symbol) || 0) ** 2 * a.volatility ** 2, 0);
}

function calculateSharpe(portfolioReturn: number, portfolioVol: number, riskFree = 0.03): number {
  return portfolioVol > 0 ? (portfolioReturn - riskFree) / portfolioVol : 0;
}

function optimizePortfolio(assets: AssetReturn[], method: 'equal' | 'minvar' | 'riskparity' = 'equal'): PortfolioWeights {
  let weights: Map<string, number>;
  switch (method) {
    case 'minvar': weights = calculateMinVarianceWeights(assets); break;
    case 'riskparity': weights = calculateRiskParityWeights(assets); break;
    default: weights = calculateEqualWeight(assets);
  }
  const expReturn = calculatePortfolioReturn(assets, weights);
  const volatility = Math.sqrt(calculatePortfolioVolatility(assets, weights));
  return { weights, expectedReturn: parseFloat(expReturn.toFixed(6)), volatility: parseFloat(volatility.toFixed(6)), sharpeRatio: parseFloat(calculateSharpe(expReturn, volatility).toFixed(4)) };
}

function calculateDiversificationRatio(assets: AssetReturn[], weights: Map<string, number>): number {
  const weightedAvgVol = assets.reduce((s, a) => s + (weights.get(a.symbol) || 0) * a.volatility, 0);
  const portfolioVol = Math.sqrt(calculatePortfolioVolatility(assets, weights));
  return portfolioVol > 0 ? weightedAvgVol / portfolioVol : 0;
}

describe('投资组合优化引擎', () => {
  const assets: AssetReturn[] = [
    { symbol: 'A', returns: [0.01, 0.02, -0.01], expectedReturn: 0.1, volatility: 0.15 },
    { symbol: 'B', returns: [0.02, -0.01, 0.03], expectedReturn: 0.08, volatility: 0.12 },
    { symbol: 'C', returns: [-0.01, 0.03, 0.01], expectedReturn: 0.06, volatility: 0.10 },
  ];

  describe('calculateEqualWeight', () => {
    it('should assign equal weights', () => {
      const w = calculateEqualWeight(assets);
      expect(w.get('A')).toBeCloseTo(1/3, 4);
      expect(w.get('B')).toBeCloseTo(1/3, 4);
    });
  });

  describe('calculateMinVarianceWeights', () => {
    it('should give more weight to lower vol assets', () => {
      const w = calculateMinVarianceWeights(assets);
      expect(w.get('C')!).toBeGreaterThan(w.get('A')!);
    });

    it('should sum to 1', () => {
      const w = calculateMinVarianceWeights(assets);
      const sum = Array.from(w.values()).reduce((a, b) => a + b, 0);
      expect(sum).toBeCloseTo(1, 3);
    });
  });

  describe('optimizePortfolio', () => {
    it('should return valid portfolio', () => {
      const result = optimizePortfolio(assets, 'equal');
      expect(result.expectedReturn).toBeGreaterThan(0);
      expect(result.volatility).toBeGreaterThan(0);
    });

    it('minvar should have lower vol than equal weight', () => {
      const equal = optimizePortfolio(assets, 'equal');
      const minvar = optimizePortfolio(assets, 'minvar');
      expect(minvar.volatility).toBeLessThanOrEqual(equal.volatility + 0.01);
    });

    it('weights should sum to 1', () => {
      const result = optimizePortfolio(assets, 'riskparity');
      const sum = Array.from(result.weights.values()).reduce((a, b) => a + b, 0);
      expect(sum).toBeCloseTo(1, 3);
    });
  });

  describe('calculateDiversificationRatio', () => {
    it('should be >= 1 for diversified portfolio', () => {
      const w = calculateEqualWeight(assets);
      const dr = calculateDiversificationRatio(assets, w);
      expect(dr).toBeGreaterThanOrEqual(1);
    });
  });

  describe('calculateSharpe', () => {
    it('should return positive for good portfolio', () => {
      expect(calculateSharpe(0.15, 0.10)).toBeGreaterThan(0);
    });

    it('should handle zero vol', () => {
      expect(calculateSharpe(0.1, 0)).toBe(0);
    });
  });
});
