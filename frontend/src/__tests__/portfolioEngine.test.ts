import { describe, it, expect } from 'vitest';

// 投资组合分析引擎
describe('投资组合分析引擎', () => {
  interface Position { symbol: string; quantity: number; avgCost: number; currentPrice: number }

  function totalValue(positions: Position[]): number {
    return positions.reduce((s, p) => s + p.quantity * p.currentPrice, 0);
  }

  function totalCost(positions: Position[]): number {
    return positions.reduce((s, p) => s + p.quantity * p.avgCost, 0);
  }

  function totalPnL(positions: Position[]): number {
    return totalValue(positions) - totalCost(positions);
  }

  function pnlPercent(positions: Position[]): number {
    const cost = totalCost(positions);
    return cost > 0 ? (totalValue(positions) - cost) / cost * 100 : 0;
  }

  function positionWeight(positions: Position[], symbol: string): number {
    const total = totalValue(positions);
    const pos = positions.find(p => p.symbol === symbol);
    return total > 0 && pos ? (pos.quantity * pos.currentPrice) / total : 0;
  }

  function maxDrawdown(prices: number[]): number {
    let peak = prices[0] ?? 0;
    let maxDd = 0;
    for (const p of prices) {
      if (p > peak) peak = p;
      const dd = (peak - p) / peak;
      if (dd > maxDd) maxDd = dd;
    }
    return maxDd;
  }

  function sharpeRatio(returns: number[], riskFreeRate: number = 0): number {
    if (returns.length === 0) return 0;
    const avg = returns.reduce((s, r) => s + r, 0) / returns.length;
    const variance = returns.reduce((s, r) => s + (r - avg) ** 2, 0) / returns.length;
    const std = Math.sqrt(variance);
    return std > 0 ? (avg - riskFreeRate) / std : 0;
  }

  function annualizedReturn(totalReturn: number, days: number): number {
    return days > 0 ? Math.pow(1 + totalReturn, 365 / days) - 1 : 0;
  }

  function sortinoRatio(returns: number[], riskFreeRate: number = 0): number {
    if (returns.length === 0) return 0;
    const avg = returns.reduce((s, r) => s + r, 0) / returns.length;
    const downReturns = returns.filter(r => r < 0);
    if (downReturns.length === 0) return Infinity;
    const downVar = downReturns.reduce((s, r) => s + r ** 2, 0) / downReturns.length;
    const downStd = Math.sqrt(downVar);
    return downStd > 0 ? (avg - riskFreeRate) / downStd : 0;
  }

  const positions: Position[] = [
    { symbol: '600000', quantity: 1000, avgCost: 10, currentPrice: 12 },
    { symbol: '000001', quantity: 500, avgCost: 20, currentPrice: 18 },
  ];

  it('应计算总市值', () => {
    expect(totalValue(positions)).toBe(12000 + 9000);
  });

  it('应计算总成本', () => {
    expect(totalCost(positions)).toBe(10000 + 10000);
  });

  it('应计算总盈亏', () => {
    expect(totalPnL(positions)).toBe(1000);
  });

  it('应计算盈亏百分比', () => {
    expect(pnlPercent(positions)).toBe(5);
  });

  it('应计算持仓权重', () => {
    expect(positionWeight(positions, '600000')).toBeCloseTo(12000 / 21000);
  });

  it('不存在的持仓权重应为0', () => {
    expect(positionWeight(positions, '999999')).toBe(0);
  });

  it('空持仓市值应为0', () => {
    expect(totalValue([])).toBe(0);
  });

  it('空持仓盈亏百分比应为0', () => {
    expect(pnlPercent([])).toBe(0);
  });

  it('应计算最大回撤', () => {
    expect(maxDrawdown([100, 110, 105, 95, 100, 90, 95])).toBeCloseTo(0.1818, 2);
  });

  it('持续上涨最大回撤应为0', () => {
    expect(maxDrawdown([10, 11, 12, 13, 14])).toBe(0);
  });

  it('应计算夏普比率', () => {
    const returns = [0.01, 0.02, -0.01, 0.03, 0.01];
    const sr = sharpeRatio(returns);
    expect(sr).toBeGreaterThan(0);
  });

  it('恒定收益夏普比率应为0或Infinity', () => {
    const returns = [0.01, 0.01, 0.01];
    expect(sharpeRatio(returns, 0.01)).toBe(0);
  });

  it('应计算年化收益率', () => {
    expect(annualizedReturn(0.1, 365)).toBeCloseTo(0.1);
    expect(annualizedReturn(0, 365)).toBe(0);
  });

  it('零天年化收益应为0', () => {
    expect(annualizedReturn(0.1, 0)).toBe(0);
  });

  it('应计算索提诺比率', () => {
    const returns = [0.02, -0.01, 0.03, -0.02, 0.01];
    const sr = sortinoRatio(returns);
    expect(sr).toBeGreaterThan(0);
  });

  it('无负收益索提诺比率应为Infinity', () => {
    expect(sortinoRatio([0.01, 0.02, 0.03])).toBe(Infinity);
  });

  it('空收益夏普应为0', () => {
    expect(sharpeRatio([])).toBe(0);
  });

  it('空收益索提诺应为0', () => {
    expect(sortinoRatio([])).toBe(0);
  });

  it('完全亏损持仓应计算正确', () => {
    const loser: Position[] = [{ symbol: 'x', quantity: 100, avgCost: 50, currentPrice: 30 }];
    expect(totalPnL(loser)).toBe(-2000);
    expect(pnlPercent(loser)).toBe(-40);
  });

  it('盈亏平衡持仓', () => {
    const breakeven: Position[] = [{ symbol: 'x', quantity: 100, avgCost: 50, currentPrice: 50 }];
    expect(totalPnL(breakeven)).toBe(0);
    expect(pnlPercent(breakeven)).toBe(0);
  });
});

// 风险管理引擎
describe('风险管理引擎', () => {
  function var95(returns: number[]): number {
    if (returns.length === 0) return 0;
    const sorted = [...returns].sort((a, b) => a - b);
    const idx = Math.floor(sorted.length * 0.05);
    return Math.abs(sorted[idx] ?? 0);
  }

  function cvar95(returns: number[]): number {
    if (returns.length === 0) return 0;
    const sorted = [...returns].sort((a, b) => a - b);
    const cutoff = Math.max(1, Math.floor(sorted.length * 0.05));
    const tail = sorted.slice(0, cutoff);
    return Math.abs(tail.reduce((s, r) => s + r, 0) / tail.length);
  }

  function beta(stockReturns: number[], marketReturns: number[]): number {
    if (stockReturns.length !== marketReturns.length || stockReturns.length === 0) return 0;
    const n = stockReturns.length;
    const avgS = stockReturns.reduce((s, v) => s + v, 0) / n;
    const avgM = marketReturns.reduce((s, v) => s + v, 0) / n;
    let cov = 0, varM = 0;
    for (let i = 0; i < n; i++) {
      cov += (stockReturns[i]! - avgS) * (marketReturns[i]! - avgM);
      varM += (marketReturns[i]! - avgM) ** 2;
    }
    return varM > 0 ? cov / varM : 0;
  }

  function correlation(a: number[], b: number[]): number {
    if (a.length !== b.length || a.length === 0) return 0;
    const n = a.length;
    const avgA = a.reduce((s, v) => s + v, 0) / n;
    const avgB = b.reduce((s, v) => s + v, 0) / n;
    let cov = 0, varA = 0, varB = 0;
    for (let i = 0; i < n; i++) {
      cov += (a[i]! - avgA) * (b[i]! - avgB);
      varA += (a[i]! - avgA) ** 2;
      varB += (b[i]! - avgB) ** 2;
    }
    return varA > 0 && varB > 0 ? cov / Math.sqrt(varA * varB) : 0;
  }

  function portfolioVolatility(weights: number[], covMatrix: number[][]): number {
    let variance = 0;
    for (let i = 0; i < weights.length; i++) {
      for (let j = 0; j < weights.length; j++) {
        variance += weights[i]! * weights[j]! * (covMatrix[i]?.[j] ?? 0);
      }
    }
    return Math.sqrt(Math.max(0, variance));
  }

  it('应计算VaR 95', () => {
    const returns = Array.from({ length: 100 }, (_, i) => (i - 50) / 1000);
    expect(var95(returns)).toBeGreaterThan(0);
  });

  it('空收益VaR应为0', () => {
    expect(var95([])).toBe(0);
  });

  it('应计算CVaR 95', () => {
    const returns = Array.from({ length: 100 }, (_, i) => (i - 50) / 1000);
    expect(cvar95(returns)).toBeGreaterThan(0);
    expect(cvar95(returns)).toBeGreaterThanOrEqual(var95(returns));
  });

  it('应计算Beta', () => {
    const market = [0.01, 0.02, -0.01, 0.03, 0.01];
    const stock = [0.02, 0.04, -0.02, 0.06, 0.02];
    expect(beta(stock, market)).toBeCloseTo(2);
  });

  it('长度不匹配Beta应为0', () => {
    expect(beta([1, 2], [1])).toBe(0);
  });

  it('应计算相关系数', () => {
    const a = [1, 2, 3, 4, 5];
    const b = [2, 4, 6, 8, 10];
    expect(correlation(a, b)).toBeCloseTo(1);
  });

  it('负相关应正确', () => {
    const a = [1, 2, 3, 4, 5];
    const b = [10, 8, 6, 4, 2];
    expect(correlation(a, b)).toBeCloseTo(-1);
  });

  it('应计算组合波动率', () => {
    const weights = [0.5, 0.5];
    const covMatrix = [[0.04, 0.01], [0.01, 0.09]];
    const vol = portfolioVolatility(weights, covMatrix);
    expect(vol).toBeGreaterThan(0);
  });

  it('单一资产波动率', () => {
    const weights = [1];
    const covMatrix = [[0.04]];
    expect(portfolioVolatility(weights, covMatrix)).toBeCloseTo(0.2);
  });

  it('大量收益率VaR应正确', () => {
    const returns = Array.from({ length: 1000 }, (_, i) => Math.sin(i) * 0.1);
    expect(var95(returns)).toBeGreaterThan(0);
  });

  it('相同序列相关系数应为1', () => {
    const a = [1, 2, 3, 4, 5];
    expect(correlation(a, a)).toBeCloseTo(1);
  });

  it('恒定序列相关系数应为0', () => {
    const a = [1, 1, 1, 1, 1];
    const b = [2, 3, 4, 5, 6];
    expect(correlation(a, b)).toBe(0);
  });
});

// 行业轮动引擎
describe('行业轮动引擎', () => {
  interface SectorReturn { sector: string; period: number; return: number; rank: number }

  function rankSectors(returns: SectorReturn[]): SectorReturn[] {
    return [...returns].sort((a, b) => b.return - a.return).map((r, i) => ({ ...r, rank: i + 1 }));
  }

  function momentumScore(returns: SectorReturn[]): Record<string, number> {
    const bySector: Record<string, number[]> = {};
    for (const r of returns) {
      if (!bySector[r.sector]) bySector[r.sector] = [];
      bySector[r.sector]!.push(r.return);
    }
    const scores: Record<string, number> = {};
    for (const [sector, rets] of Object.entries(bySector)) {
      scores[sector] = rets.reduce((s, r) => s + r, 0) / rets.length;
    }
    return scores;
  }

  function rotationSignal(current: SectorReturn[], previous: SectorReturn[]): string[] {
    const currRank = rankSectors(current);
    const prevRank = rankSectors(previous);
    const signals: string[] = [];
    for (const c of currRank) {
      const p = prevRank.find(r => r.sector === c.sector);
      if (p && c.rank < p.rank) signals.push(c.sector);
    }
    return signals;
  }

  it('应按收益率排名', () => {
    const data: SectorReturn[] = [
      { sector: 'A', period: 1, return: 3, rank: 0 },
      { sector: 'B', period: 1, return: 5, rank: 0 },
      { sector: 'C', period: 1, return: 1, rank: 0 },
    ];
    const ranked = rankSectors(data);
    expect(ranked[0]!.sector).toBe('B');
    expect(ranked[2]!.sector).toBe('C');
  });

  it('应计算动量分数', () => {
    const data: SectorReturn[] = [
      { sector: 'A', period: 1, return: 2, rank: 0 },
      { sector: 'A', period: 2, return: 4, rank: 0 },
      { sector: 'B', period: 1, return: 1, rank: 0 },
    ];
    const scores = momentumScore(data);
    expect(scores['A']).toBe(3);
    expect(scores['B']).toBe(1);
  });

  it('应检测轮动信号', () => {
    const prev: SectorReturn[] = [
      { sector: 'A', period: 1, return: 5, rank: 1 },
      { sector: 'B', period: 1, return: 1, rank: 2 },
    ];
    const curr: SectorReturn[] = [
      { sector: 'A', period: 1, return: 1, rank: 2 },
      { sector: 'B', period: 1, return: 5, rank: 1 },
    ];
    const signals = rotationSignal(curr, prev);
    expect(signals).toContain('B');
  });

  it('无显著变动应无信号', () => {
    const data: SectorReturn[] = [
      { sector: 'A', period: 1, return: 5, rank: 1 },
      { sector: 'B', period: 1, return: 3, rank: 2 },
    ];
    expect(rotationSignal(data, data)).toHaveLength(0);
  });

  it('排名应为连续整数', () => {
    const data: SectorReturn[] = [
      { sector: 'A', period: 1, return: 10, rank: 0 },
      { sector: 'B', period: 1, return: 5, rank: 0 },
      { sector: 'C', period: 1, return: 1, rank: 0 },
    ];
    const ranked = rankSectors(data);
    expect(ranked.map(r => r.rank)).toEqual([1, 2, 3]);
  });

  it('大量行业应正确排名', () => {
    const data: SectorReturn[] = Array.from({ length: 50 }, (_, i) => ({
      sector: `S${i}`, period: 1, return: Math.random() * 10, rank: 0,
    }));
    const ranked = rankSectors(data);
    expect(ranked).toHaveLength(50);
    expect(ranked[0]!.return).toBeGreaterThanOrEqual(ranked[49]!.return);
  });
});
