import { describe, it, expect } from 'vitest';

/**
 * 仓位管理引擎测试
 */

interface Position {
  code: string;
  weight: number;
  expectedReturn: number;
  volatility: number;
  sharpeRatio: number;
}

interface PortfolioConstraints {
  maxWeight: number;
  minWeight: number;
  maxPositions: number;
  targetVol: number;
  riskBudget: number;
}

interface AllocationResult {
  positions: Position[];
  totalWeight: number;
  expectedReturn: number;
  portfolioVol: number;
  sharpeRatio: number;
  diversificationRatio: number;
}

function calcKellyFraction(winRate: number, avgWin: number, avgLoss: number): number {
  if (avgLoss === 0) return 0;
  const b = avgWin / avgLoss;
  const kelly = (winRate * b - (1 - winRate)) / b;
  return Math.max(0, Math.min(1, kelly));
}

function calcRiskParity(weights: number[], vols: number[]): number[] {
  const totalVol = Math.sqrt(weights.reduce((s, w, i) => s + Math.pow(w * vols[i], 2), 0));
  if (totalVol === 0) return weights.map(() => 0);
  const riskContributions = weights.map((w, i) => (w * vols[i] * vols[i]) / totalVol);
  const totalRisk = riskContributions.reduce((s, r) => s + r, 0);
  return riskContributions.map(r => totalRisk > 0 ? r / totalRisk : 0);
}

function optimizePortfolio(
  candidates: Position[],
  constraints: PortfolioConstraints
): AllocationResult {
  if (candidates.length === 0) {
    return { positions: [], totalWeight: 0, expectedReturn: 0, portfolioVol: 0, sharpeRatio: 0, diversificationRatio: 0 };
  }

  // Simple optimization: weight by Sharpe ratio
  const totalSharpe = candidates.reduce((s, c) => s + Math.max(0, c.sharpeRatio), 0);
  let positions = candidates.map(c => ({
    ...c,
    weight: totalSharpe > 0 ? Math.max(0, c.sharpeRatio) / totalSharpe : 1 / candidates.length,
  }));

  // Apply constraints
  positions = positions.map(p => ({
    ...p,
    weight: Math.max(constraints.minWeight, Math.min(constraints.maxWeight, p.weight)),
  }));

  // Normalize
  const totalWeight = positions.reduce((s, p) => s + p.weight, 0);
  if (totalWeight > 0) {
    positions = positions.map(p => ({ ...p, weight: p.weight / totalWeight }));
  }

  // Limit positions
  positions = positions
    .sort((a, b) => b.weight - a.weight)
    .slice(0, constraints.maxPositions);

  const expectedReturn = positions.reduce((s, p) => s + p.weight * p.expectedReturn, 0);
  const portfolioVol = Math.sqrt(positions.reduce((s, p) => s + Math.pow(p.weight * p.volatility, 2), 0));
  const sharpeRatio = portfolioVol > 0 ? expectedReturn / portfolioVol : 0;

  const weightedAvgVol = positions.reduce((s, p) => s + p.weight * p.volatility, 0);
  const diversificationRatio = weightedAvgVol > 0 ? portfolioVol / weightedAvgVol : 0;

  return {
    positions,
    totalWeight: positions.reduce((s, p) => s + p.weight, 0),
    expectedReturn: Math.round(expectedReturn * 10000) / 10000,
    portfolioVol: Math.round(portfolioVol * 10000) / 10000,
    sharpeRatio: Math.round(sharpeRatio * 10000) / 10000,
    diversificationRatio: Math.round(diversificationRatio * 10000) / 10000,
  };
}

function calcMaxDrawdown(weights: number[], returns: number[][]): number {
  if (returns.length === 0 || returns[0].length === 0) return 0;
  const portfolioReturns = returns.map(day =>
    day.reduce((s, r, i) => s + r * (weights[i] || 0), 0)
  );

  let peak = 0;
  let maxDD = 0;
  let cumReturn = 1;
  for (const r of portfolioReturns) {
    cumReturn *= (1 + r);
    if (cumReturn > peak) peak = cumReturn;
    const dd = (peak - cumReturn) / peak;
    if (dd > maxDD) maxDD = dd;
  }
  return Math.round(maxDD * 10000) / 10000;
}

describe('Position Sizing Engine', () => {
  const candidates: Position[] = [
    { code: '600519', weight: 0, expectedReturn: 0.15, volatility: 0.25, sharpeRatio: 0.6 },
    { code: '000001', weight: 0, expectedReturn: 0.12, volatility: 0.30, sharpeRatio: 0.4 },
    { code: '300750', weight: 0, expectedReturn: 0.20, volatility: 0.40, sharpeRatio: 0.5 },
    { code: '000858', weight: 0, expectedReturn: 0.10, volatility: 0.20, sharpeRatio: 0.5 },
  ];

  const constraints: PortfolioConstraints = {
    maxWeight: 0.4,
    minWeight: 0.05,
    maxPositions: 10,
    targetVol: 0.2,
    riskBudget: 0.1,
  };

  describe('凯利公式', () => {
    it('应该计算最优仓位', () => {
      const kelly = calcKellyFraction(0.6, 2, 1);
      expect(kelly).toBeGreaterThan(0);
      expect(kelly).toBeLessThanOrEqual(1);
    });

    it('高胜率高盈亏比应该大仓位', () => {
      const kelly1 = calcKellyFraction(0.7, 3, 1);
      const kelly2 = calcKellyFraction(0.5, 1.5, 1);
      expect(kelly1).toBeGreaterThan(kelly2);
    });

    it('零损失应该返回0', () => {
      expect(calcKellyFraction(0.6, 2, 0)).toBe(0);
    });
  });

  describe('风险平价', () => {
    it('应该计算风险贡献', () => {
      const riskContrib = calcRiskParity([0.5, 0.5], [0.2, 0.3]);
      expect(riskContrib.length).toBe(2);
      expect(riskContrib.reduce((s, r) => s + r, 0)).toBeCloseTo(1, 5);
    });
  });

  describe('组合优化', () => {
    it('应该返回优化结果', () => {
      const result = optimizePortfolio(candidates, constraints);
      expect(result.positions.length).toBeGreaterThan(0);
      expect(result.totalWeight).toBeCloseTo(1, 2);
    });

    it('应该满足约束', () => {
      const result = optimizePortfolio(candidates, constraints);
      for (const p of result.positions) {
        expect(p.weight).toBeGreaterThanOrEqual(constraints.minWeight);
        expect(p.weight).toBeLessThanOrEqual(constraints.maxWeight + 0.01);
      }
    });

    it('空候选应该返回空', () => {
      const result = optimizePortfolio([], constraints);
      expect(result.positions.length).toBe(0);
      expect(result.totalWeight).toBe(0);
    });

    it('应该计算夏普比率', () => {
      const result = optimizePortfolio(candidates, constraints);
      expect(typeof result.sharpeRatio).toBe('number');
    });
  });

  describe('最大回撤', () => {
    it('应该计算最大回撤', () => {
      const returns = [
        [0.01, 0.02],
        [-0.02, -0.01],
        [0.03, 0.01],
        [-0.01, -0.02],
      ];
      const maxDD = calcMaxDrawdown([0.5, 0.5], returns);
      expect(maxDD).toBeGreaterThan(0);
    });

    it('空数据应该返回0', () => {
      expect(calcMaxDrawdown([0.5, 0.5], [])).toBe(0);
    });
  });
});
