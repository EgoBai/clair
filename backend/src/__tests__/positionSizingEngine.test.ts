import { describe, it, expect } from 'vitest';

// 仓位管理引擎
interface Position { symbol: string; shares: number; avgCost: number; currentPrice: number; }
interface Portfolio { cash: number; positions: Position[]; }

function calcPositionValue(pos: Position): number {
  return pos.shares * pos.currentPrice;
}

function calcPortfolioValue(pf: Portfolio): number {
  return pf.cash + pf.positions.reduce((sum, p) => sum + calcPositionValue(p), 0);
}

function calcPositionWeight(pos: Position, pf: Portfolio): number {
  const total = calcPortfolioValue(pf);
  return total > 0 ? calcPositionValue(pos) / total : 0;
}

function calcKellyFraction(winRate: number, avgWin: number, avgLoss: number): number {
  if (avgLoss <= 0) return 0;
  const b = avgWin / avgLoss;
  return Math.max(0, (winRate * b - (1 - winRate)) / b);
}

function calcRiskParityWeights(vols: number[]): number[] {
  const invVols = vols.map(v => v > 0 ? 1 / v : 0);
  const sum = invVols.reduce((a, b) => a + b, 0);
  return sum > 0 ? invVols.map(v => v / sum) : vols.map(() => 0);
}

function calcMaxPositionSize(capital: number, riskPerTrade: number, stopLossPct: number): number {
  if (stopLossPct <= 0) return 0;
  return (capital * riskPerTrade) / stopLossPct;
}

function calcUnrealizedPnL(pos: Position): number {
  return pos.shares * (pos.currentPrice - pos.avgCost);
}

function calcPnLPercent(pos: Position): number {
  if (pos.avgCost <= 0) return 0;
  return ((pos.currentPrice - pos.avgCost) / pos.avgCost) * 100;
}

function shouldRebalance(current: number[], target: number[], threshold: number): boolean {
  if (current.length !== target.length) return true;
  return current.some((w, i) => Math.abs(w - target[i]) > threshold);
}

describe('仓位管理引擎', () => {
  describe('持仓价值', () => {
    it('应正确计算持仓市值', () => {
      expect(calcPositionValue({ symbol: '000001', shares: 1000, avgCost: 10, currentPrice: 12 })).toBe(12000);
    });

    it('零股应返回0', () => {
      expect(calcPositionValue({ symbol: '000001', shares: 0, avgCost: 10, currentPrice: 12 })).toBe(0);
    });
  });

  describe('组合总值', () => {
    it('应包含现金和所有持仓', () => {
      const pf: Portfolio = {
        cash: 50000,
        positions: [
          { symbol: '000001', shares: 1000, avgCost: 10, currentPrice: 12 },
          { symbol: '000002', shares: 500, avgCost: 20, currentPrice: 22 },
        ],
      };
      expect(calcPortfolioValue(pf)).toBe(50000 + 12000 + 11000);
    });

    it('仅现金应等于现金', () => {
      expect(calcPortfolioValue({ cash: 100000, positions: [] })).toBe(100000);
    });
  });

  describe('持仓权重', () => {
    it('应正确计算权重', () => {
      const pf: Portfolio = { cash: 0, positions: [{ symbol: '000001', shares: 100, avgCost: 100, currentPrice: 100 }] };
      expect(calcPositionWeight(pf.positions[0], pf)).toBe(1);
    });

    it('组合总值为0应返回0', () => {
      const pf: Portfolio = { cash: 0, positions: [] };
      expect(calcPositionWeight({ symbol: 'X', shares: 0, avgCost: 0, currentPrice: 0 }, pf)).toBe(0);
    });
  });

  describe('Kelly公式', () => {
    it('胜率60%应给出正的Kelly比例', () => {
      expect(calcKellyFraction(0.6, 100, 80)).toBeGreaterThan(0);
    });

    it('胜率50%盈亏比1:1应为0', () => {
      expect(calcKellyFraction(0.5, 100, 100)).toBe(0);
    });

    it('低胜率应返回0（截断）', () => {
      expect(calcKellyFraction(0.3, 50, 100)).toBe(0);
    });

    it('平均亏损为0应返回0', () => {
      expect(calcKellyFraction(0.6, 100, 0)).toBe(0);
    });
  });

  describe('风险平价权重', () => {
    it('波动率低的资产应有更高权重', () => {
      const weights = calcRiskParityWeights([20, 10]);
      expect(weights[1]).toBeGreaterThan(weights[0]);
    });

    it('权重之和应为1', () => {
      const weights = calcRiskParityWeights([15, 25, 10]);
      expect(weights.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 5);
    });

    it('零波动率应正常处理', () => {
      const weights = calcRiskParityWeights([0, 10]);
      expect(weights[1]).toBe(1);
    });
  });

  describe('最大仓位计算', () => {
    it('应基于风险计算最大可买金额', () => {
      // 100万资金，单笔风险2%，止损5%
      expect(calcMaxPositionSize(1e6, 0.02, 0.05)).toBe(400000);
    });

    it('止损为0应返回0', () => {
      expect(calcMaxPositionSize(1e6, 0.02, 0)).toBe(0);
    });
  });

  describe('浮动盈亏', () => {
    it('盈利应为正', () => {
      expect(calcUnrealizedPnL({ symbol: 'X', shares: 100, avgCost: 10, currentPrice: 12 })).toBe(200);
    });

    it('亏损应为负', () => {
      expect(calcUnrealizedPnL({ symbol: 'X', shares: 100, avgCost: 12, currentPrice: 10 })).toBe(-200);
    });

    it('盈亏百分比', () => {
      expect(calcPnLPercent({ symbol: 'X', shares: 100, avgCost: 10, currentPrice: 12 })).toBe(20);
    });

    it('成本为0应返回0', () => {
      expect(calcPnLPercent({ symbol: 'X', shares: 100, avgCost: 0, currentPrice: 12 })).toBe(0);
    });
  });

  describe('再平衡判断', () => {
    it('偏离超过阈值应触发再平衡', () => {
      expect(shouldRebalance([0.5, 0.5], [0.4, 0.6], 0.05)).toBe(true);
    });

    it('偏离小于阈值不应触发', () => {
      expect(shouldRebalance([0.51, 0.49], [0.5, 0.5], 0.05)).toBe(false);
    });

    it('长度不同应触发', () => {
      expect(shouldRebalance([0.5, 0.5], [0.5, 0.3, 0.2], 0.05)).toBe(true);
    });
  });
});
