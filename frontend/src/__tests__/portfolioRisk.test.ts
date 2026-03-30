import { describe, it, expect } from 'vitest';

// Portfolio risk analysis utilities
interface Position {
  symbol: string;
  quantity: number;
  avgCost: number;
  currentPrice: number;
  sector: string;
}

interface PortfolioMetrics {
  totalValue: number;
  totalCost: number;
  totalPnL: number;
  totalReturn: number;
  positions: Position[];
}

function calculatePositionValue(pos: Position): number {
  return pos.quantity * pos.currentPrice;
}

function calculatePositionCost(pos: Position): number {
  return pos.quantity * pos.avgCost;
}

function calculatePositionPnL(pos: Position): number {
  return (pos.currentPrice - pos.avgCost) * pos.quantity;
}

function calculatePositionWeight(pos: Position, totalValue: number): number {
  if (totalValue === 0) return 0;
  return calculatePositionValue(pos) / totalValue;
}

function calculatePortfolioMetrics(positions: Position[]): PortfolioMetrics {
  const totalValue = positions.reduce((s, p) => s + calculatePositionValue(p), 0);
  const totalCost = positions.reduce((s, p) => s + calculatePositionCost(p), 0);
  const totalPnL = totalValue - totalCost;
  const totalReturn = totalCost === 0 ? 0 : totalPnL / totalCost;
  return { totalValue, totalCost, totalPnL, totalReturn, positions };
}

function calculateSectorAllocation(positions: Position[]): Record<string, number> {
  const totalValue = positions.reduce((s, p) => s + calculatePositionValue(p), 0);
  const allocation: Record<string, number> = {};
  for (const pos of positions) {
    allocation[pos.sector] = (allocation[pos.sector] || 0) + calculatePositionValue(pos) / totalValue;
  }
  return allocation;
}

function calculateConcentrationRisk(positions: Position[]): number {
  const totalValue = positions.reduce((s, p) => s + calculatePositionValue(p), 0);
  if (totalValue === 0) return 0;
  const weights = positions.map(p => calculatePositionValue(p) / totalValue);
  const hhi = weights.reduce((s, w) => s + w ** 2, 0);
  return hhi;
}

function calculateDiversificationRatio(positions: Position[]): number {
  const sectorAlloc = calculateSectorAllocation(positions);
  const numSectors = Object.keys(sectorAlloc).length;
  if (numSectors <= 1) return 0;
  const maxWeight = Math.max(...Object.values(sectorAlloc));
  return 1 - maxWeight;
}

function suggestRebalance(positions: Position[], targetSectorWeights: Record<string, number>) {
  const currentAlloc = calculateSectorAllocation(positions);
  const totalValue = positions.reduce((s, p) => s + calculatePositionValue(p), 0);
  const suggestions: { sector: string; currentValue: number; targetValue: number; action: string; amount: number }[] = [];
  for (const [sector, targetWeight] of Object.entries(targetSectorWeights)) {
    const currentWeight = currentAlloc[sector] || 0;
    const targetValue = totalValue * targetWeight;
    const currentValue = totalValue * currentWeight;
    const diff = targetValue - currentValue;
    suggestions.push({
      sector,
      currentValue,
      targetValue,
      action: diff > 0 ? 'buy' : 'sell',
      amount: Math.abs(diff),
    });
  }
  return suggestions;
}

function calculatePortfolioBeta(positions: Position[], betas: Record<string, number>): number {
  const totalValue = positions.reduce((s, p) => s + calculatePositionValue(p), 0);
  if (totalValue === 0) return 0;
  return positions.reduce((sum, p) => {
    const weight = calculatePositionValue(p) / totalValue;
    return sum + weight * (betas[p.symbol] || 1);
  }, 0);
}

function calculateVaR(positions: Position[], dailyReturns: Record<string, number[]>, confidence: number = 0.95): number {
  const portfolioReturns: number[] = [];
  const minLen = Math.min(...Object.values(dailyReturns).map(r => r.length));
  const totalValue = positions.reduce((s, p) => s + calculatePositionValue(p), 0);
  for (let i = 0; i < minLen; i++) {
    let dayReturn = 0;
    for (const pos of positions) {
      const weight = calculatePositionValue(pos) / totalValue;
      const ret = dailyReturns[pos.symbol]?.[i] || 0;
      dayReturn += weight * ret;
    }
    portfolioReturns.push(dayReturn);
  }
  portfolioReturns.sort((a, b) => a - b);
  const index = Math.floor((1 - confidence) * portfolioReturns.length);
  return portfolioReturns[index] || 0;
}

describe('投资组合风险分析', () => {
  const positions: Position[] = [
    { symbol: '600519', quantity: 100, avgCost: 1800, currentPrice: 1900, sector: '白酒' },
    { symbol: '000858', quantity: 500, avgCost: 150, currentPrice: 160, sector: '白酒' },
    { symbol: '300750', quantity: 200, avgCost: 200, currentPrice: 180, sector: '新能源' },
    { symbol: '601318', quantity: 1000, avgCost: 50, currentPrice: 52, sector: '金融' },
  ];

  describe('持仓计算', () => {
    it('应该正确计算持仓市值', () => {
      expect(calculatePositionValue(positions[0])).toBe(190000);
    });

    it('应该正确计算持仓成本', () => {
      expect(calculatePositionCost(positions[0])).toBe(180000);
    });

    it('应该正确计算盈亏', () => {
      expect(calculatePositionPnL(positions[0])).toBe(10000);
      expect(calculatePositionPnL(positions[2])).toBe(-4000);
    });

    it('应该正确计算仓位权重', () => {
      const totalValue = positions.reduce((s, p) => s + calculatePositionValue(p), 0);
      const weight = calculatePositionWeight(positions[0], totalValue);
      expect(weight).toBeGreaterThan(0);
      expect(weight).toBeLessThan(1);
    });

    it('零总市值权重为0', () => {
      expect(calculatePositionWeight(positions[0], 0)).toBe(0);
    });
  });

  describe('组合指标', () => {
    it('应该正确计算组合指标', () => {
      const metrics = calculatePortfolioMetrics(positions);
      expect(metrics.totalValue).toBeGreaterThan(0);
      expect(metrics.totalCost).toBeGreaterThan(0);
      expect(typeof metrics.totalReturn).toBe('number');
    });

    it('空组合应该返回零指标', () => {
      const metrics = calculatePortfolioMetrics([]);
      expect(metrics.totalValue).toBe(0);
      expect(metrics.totalReturn).toBe(0);
    });

    it('总盈亏应该等于总市值减总成本', () => {
      const metrics = calculatePortfolioMetrics(positions);
      expect(metrics.totalPnL).toBeCloseTo(metrics.totalValue - metrics.totalCost);
    });
  });

  describe('行业配置', () => {
    it('应该正确计算行业权重', () => {
      const alloc = calculateSectorAllocation(positions);
      expect(Object.keys(alloc).length).toBe(3);
      expect(alloc['白酒']).toBeGreaterThan(0);
    });

    it('行业权重之和应该为1', () => {
      const alloc = calculateSectorAllocation(positions);
      const total = Object.values(alloc).reduce((a, b) => a + b, 0);
      expect(total).toBeCloseTo(1);
    });

    it('单一行业应该权重为1', () => {
      const singleSector = positions.map(p => ({ ...p, sector: 'A' }));
      const alloc = calculateSectorAllocation(singleSector);
      expect(alloc['A']).toBeCloseTo(1);
    });
  });

  describe('集中度风险', () => {
    it('应该计算HHI集中度', () => {
      const hhi = calculateConcentrationRisk(positions);
      expect(hhi).toBeGreaterThan(0);
      expect(hhi).toBeLessThanOrEqual(1);
    });

    it('单一持仓集中度应该为1', () => {
      const hhi = calculateConcentrationRisk([positions[0]]);
      expect(hhi).toBeCloseTo(1);
    });

    it('等权持仓应该有较低集中度', () => {
      const equalPositions = positions.map(p => ({ ...p, quantity: 100, currentPrice: 100 }));
      const hhi = calculateConcentrationRisk(equalPositions);
      expect(hhi).toBeCloseTo(1 / positions.length);
    });

    it('空组合集中度为0', () => {
      expect(calculateConcentrationRisk([])).toBe(0);
    });
  });

  describe('分散化比率', () => {
    it('应该计算分散化比率', () => {
      const ratio = calculateDiversificationRatio(positions);
      expect(ratio).toBeGreaterThan(0);
      expect(ratio).toBeLessThan(1);
    });

    it('单一行业分散化应该为0', () => {
      const singleSector = positions.map(p => ({ ...p, sector: 'A' }));
      expect(calculateDiversificationRatio(singleSector)).toBe(0);
    });
  });

  describe('再平衡建议', () => {
    it('应该生成建议', () => {
      const target = { '白酒': 0.5, '新能源': 0.3, '金融': 0.2 };
      const suggestions = suggestRebalance(positions, target);
      expect(suggestions.length).toBe(3);
      expect(suggestions.every(s => s.action === 'buy' || s.action === 'sell')).toBe(true);
    });

    it('目标=当前配置时建议金额应接近0', () => {
      const currentAlloc = calculateSectorAllocation(positions);
      const suggestions = suggestRebalance(positions, currentAlloc);
      for (const s of suggestions) {
        expect(s.amount).toBeCloseTo(0, -2);
      }
    });
  });

  describe('组合Beta', () => {
    it('应该计算加权Beta', () => {
      const betas = { '600519': 0.8, '000858': 1.2, '300750': 1.5, '601318': 0.5 };
      const beta = calculatePortfolioBeta(positions, betas);
      expect(beta).toBeGreaterThan(0);
    });

    it('空组合Beta为0', () => {
      expect(calculatePortfolioBeta([], {})).toBe(0);
    });

    it('单一持仓Beta应该等于该股票Beta', () => {
      const beta = calculatePortfolioBeta([positions[0]], { '600519': 0.8 });
      expect(beta).toBeCloseTo(0.8);
    });
  });

  describe('VaR计算', () => {
    it('应该计算风险价值', () => {
      const returns = {
        '600519': [0.01, -0.02, 0.015, -0.01, 0.02, -0.03, 0.01, 0.005, -0.015, 0.02],
        '000858': [0.02, -0.01, 0.01, -0.02, 0.015, -0.025, 0.02, 0.01, -0.01, 0.015],
        '300750': [-0.01, 0.03, -0.02, 0.01, -0.01, 0.02, -0.015, 0.025, 0.01, -0.02],
        '601318': [0.005, -0.005, 0.01, -0.01, 0.008, -0.012, 0.006, 0.004, -0.008, 0.01],
      };
      const var95 = calculateVaR(positions, returns, 0.95);
      expect(typeof var95).toBe('number');
    });

    it('95%置信度的VaR应该比99%的更温和', () => {
      const returns = {
        '600519': Array.from({ length: 100 }, (_, i) => (Math.random() - 0.5) * 0.04),
        '000858': Array.from({ length: 100 }, (_, i) => (Math.random() - 0.5) * 0.04),
        '300750': Array.from({ length: 100 }, (_, i) => (Math.random() - 0.5) * 0.04),
        '601318': Array.from({ length: 100 }, (_, i) => (Math.random() - 0.5) * 0.04),
      };
      const var95 = calculateVaR(positions, returns, 0.95);
      const var99 = calculateVaR(positions, returns, 0.99);
      expect(var99).toBeLessThanOrEqual(var95);
    });
  });
});
