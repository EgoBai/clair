import { describe, it, expect } from 'vitest';

// 仓位管理引擎
interface Position {
  code: string;
  name: string;
  quantity: number;
  avgCost: number;
  currentPrice: number;
  stopLoss: number;
  takeProfit: number;
}

interface PortfolioMetrics {
  totalValue: number;
  totalCost: number;
  totalPnL: number;
  totalPnLPercent: number;
  positions: {
    code: string;
    value: number;
    cost: number;
    pnl: number;
    pnlPercent: number;
    weight: number;
    riskLevel: 'low' | 'medium' | 'high';
  }[];
  diversificationScore: number;
  maxDrawdownRisk: number;
}

function calculatePortfolioMetrics(positions: Position[]): PortfolioMetrics {
  if (positions.length === 0) {
    return {
      totalValue: 0, totalCost: 0, totalPnL: 0, totalPnLPercent: 0,
      positions: [], diversificationScore: 0, maxDrawdownRisk: 0,
    };
  }

  const positionDetails = positions.map(p => {
    const value = p.quantity * p.currentPrice;
    const cost = p.quantity * p.avgCost;
    const pnl = value - cost;
    const pnlPercent = cost > 0 ? (pnl / cost) * 100 : 0;
    const stopLossRisk = p.stopLoss > 0 ? Math.abs((p.currentPrice - p.stopLoss) / p.currentPrice) * 100 : 0;
    const riskLevel: 'low' | 'medium' | 'high' = stopLossRisk > 10 ? 'high' : stopLossRisk > 5 ? 'medium' : 'low';
    return { code: p.code, value, cost, pnl, pnlPercent, weight: 0, riskLevel };
  });

  const totalValue = positionDetails.reduce((s, p) => s + p.value, 0);
  const totalCost = positionDetails.reduce((s, p) => s + p.cost, 0);

  positionDetails.forEach(p => {
    p.weight = totalValue > 0 ? (p.value / totalValue) * 100 : 0;
  });

  // 分散化评分：基于持仓集中度
  const weights = positionDetails.map(p => p.weight / 100);
  const hhi = weights.reduce((s, w) => s + w * w, 0); // Herfindahl-Hirschman Index
  const maxHHI = 1;
  const minHHI = 1 / positions.length;
  const diversificationScore = positions.length > 1
    ? ((maxHHI - hhi) / (maxHHI - minHHI)) * 100
    : 0;

  // 最大回撤风险：基于止损距离
  const maxDrawdownRisk = Math.max(...positions.map(p =>
    p.stopLoss > 0 ? Math.abs((p.currentPrice - p.stopLoss) / p.currentPrice) * p.quantity * p.currentPrice / totalValue * 100 : 0
  ));

  return {
    totalValue,
    totalCost,
    totalPnL: totalValue - totalCost,
    totalPnLPercent: totalCost > 0 ? ((totalValue - totalCost) / totalCost) * 100 : 0,
    positions: positionDetails,
    diversificationScore: Math.max(0, Math.min(100, diversificationScore)),
    maxDrawdownRisk,
  };
}

function calculatePositionSize(
  capital: number,
  entryPrice: number,
  stopLoss: number,
  riskPercent = 2
): { quantity: number; riskAmount: number; actualRiskPercent: number } {
  if (entryPrice <= 0 || stopLoss <= 0 || capital <= 0) {
    return { quantity: 0, riskAmount: 0, actualRiskPercent: 0 };
  }

  const riskAmount = capital * (riskPercent / 100);
  const riskPerShare = Math.abs(entryPrice - stopLoss);

  if (riskPerShare <= 0) return { quantity: 0, riskAmount, actualRiskPercent: 0 };

  const quantity = Math.floor(riskAmount / riskPerShare);
  const actualRiskAmount = quantity * riskPerShare;
  const actualRiskPercent = (actualRiskAmount / capital) * 100;

  return { quantity, riskAmount: actualRiskAmount, actualRiskPercent };
}

function generateRebalanceSuggestion(
  positions: Position[],
  targetWeights: Map<string, number>
): { code: string; currentWeight: number; targetWeight: number; action: 'buy' | 'sell' | 'hold'; amount: number }[] {
  const totalValue = positions.reduce((s, p) => s + p.quantity * p.currentPrice, 0);

  return positions.map(p => {
    const currentWeight = totalValue > 0 ? (p.quantity * p.currentPrice / totalValue) * 100 : 0;
    const targetWeight = targetWeights.get(p.code) || 0;
    const diff = targetWeight - currentWeight;
    const amount = Math.abs(diff / 100 * totalValue);

    return {
      code: p.code,
      currentWeight,
      targetWeight,
      action: Math.abs(diff) < 1 ? 'hold' : diff > 0 ? 'buy' : 'sell',
      amount: Math.round(amount),
    };
  });
}

describe('仓位管理引擎', () => {
  describe('calculatePortfolioMetrics', () => {
    const positions: Position[] = [
      { code: '600000', name: '浦发银行', quantity: 1000, avgCost: 10, currentPrice: 12, stopLoss: 9, takeProfit: 15 },
      { code: '000001', name: '平安银行', quantity: 500, avgCost: 20, currentPrice: 18, stopLoss: 16, takeProfit: 24 },
    ];

    it('应该计算正确的总市值', () => {
      const result = calculatePortfolioMetrics(positions);
      expect(result.totalValue).toBe(1000 * 12 + 500 * 18); // 21000
    });

    it('应该计算正确的总成本', () => {
      const result = calculatePortfolioMetrics(positions);
      expect(result.totalCost).toBe(1000 * 10 + 500 * 20); // 20000
    });

    it('应该计算正确的总盈亏', () => {
      const result = calculatePortfolioMetrics(positions);
      expect(result.totalPnL).toBe(1000); // 21000 - 20000
    });

    it('应该计算正确的总盈亏百分比', () => {
      const result = calculatePortfolioMetrics(positions);
      expect(result.totalPnLPercent).toBeCloseTo(5, 1); // 1000/20000 = 5%
    });

    it('应该计算正确的权重', () => {
      const result = calculatePortfolioMetrics(positions);
      const p1 = result.positions.find(p => p.code === '600000');
      const p2 = result.positions.find(p => p.code === '000001');
      expect(p1!.weight).toBeCloseTo((12000 / 21000) * 100, 1);
      expect(p2!.weight).toBeCloseTo((9000 / 21000) * 100, 1);
    });

    it('权重之和应该等于100', () => {
      const result = calculatePortfolioMetrics(positions);
      const totalWeight = result.positions.reduce((s, p) => s + p.weight, 0);
      expect(totalWeight).toBeCloseTo(100, 1);
    });

    it('应该评估风险等级', () => {
      const result = calculatePortfolioMetrics(positions);
      result.positions.forEach(p => {
        expect(['low', 'medium', 'high']).toContain(p.riskLevel);
      });
    });

    it('空持仓应该返回零值', () => {
      const result = calculatePortfolioMetrics([]);
      expect(result.totalValue).toBe(0);
      expect(result.totalPnL).toBe(0);
      expect(result.diversificationScore).toBe(0);
    });

    it('单一持仓分散化评分为0', () => {
      const result = calculatePortfolioMetrics([positions[0]]);
      expect(result.diversificationScore).toBe(0);
    });

    it('多持仓应该有分散化评分', () => {
      const result = calculatePortfolioMetrics(positions);
      expect(result.diversificationScore).toBeGreaterThan(0);
    });
  });

  describe('calculatePositionSize', () => {
    it('应该计算合理的仓位大小', () => {
      const result = calculatePositionSize(100000, 50, 48, 2);
      // 风险金额 = 2000, 每股风险 = 2, 股数 = 1000
      expect(result.quantity).toBe(1000);
      expect(result.riskAmount).toBe(2000);
    });

    it('应该向下取整到整数股', () => {
      const result = calculatePositionSize(100000, 33, 30, 2);
      // 风险金额 = 2000, 每股风险 = 3, 股数 = 666.67 → 666
      expect(result.quantity).toBe(666);
    });

    it('无效输入应该返回0', () => {
      expect(calculatePositionSize(0, 50, 48, 2).quantity).toBe(0);
      expect(calculatePositionSize(100000, 0, 48, 2).quantity).toBe(0);
      expect(calculatePositionSize(100000, 50, 0, 2).quantity).toBe(0);
    });

    it('止损等于入场价应该返回0', () => {
      expect(calculatePositionSize(100000, 50, 50, 2).quantity).toBe(0);
    });

    it('止损应该支持在入场价上方（做空场景）', () => {
      const result = calculatePositionSize(100000, 50, 55, 2);
      expect(result.quantity).toBeGreaterThan(0);
    });

    it('实际风险百分比应该接近目标', () => {
      const result = calculatePositionSize(100000, 50, 48, 2);
      expect(result.actualRiskPercent).toBeCloseTo(2, 1);
    });
  });

  describe('generateRebalanceSuggestion', () => {
    it('应该建议买入低配持仓', () => {
      const positions: Position[] = [
        { code: 'A', name: 'A', quantity: 100, avgCost: 10, currentPrice: 10, stopLoss: 8, takeProfit: 12 },
        { code: 'B', name: 'B', quantity: 100, avgCost: 10, currentPrice: 10, stopLoss: 8, takeProfit: 12 },
      ];
      const targets = new Map([['A', 70], ['B', 30]]);
      const result = generateRebalanceSuggestion(positions, targets);
      const a = result.find(r => r.code === 'A')!;
      expect(a.action).toBe('buy');
    });

    it('应该建议卖出超配持仓', () => {
      const positions: Position[] = [
        { code: 'A', name: 'A', quantity: 100, avgCost: 10, currentPrice: 10, stopLoss: 8, takeProfit: 12 },
        { code: 'B', name: 'B', quantity: 100, avgCost: 10, currentPrice: 10, stopLoss: 8, takeProfit: 12 },
      ];
      const targets = new Map([['A', 30], ['B', 70]]);
      const result = generateRebalanceSuggestion(positions, targets);
      const a = result.find(r => r.code === 'A')!;
      expect(a.action).toBe('sell');
    });

    it('权重接近目标应该hold', () => {
      const positions: Position[] = [
        { code: 'A', name: 'A', quantity: 100, avgCost: 10, currentPrice: 10, stopLoss: 8, takeProfit: 12 },
        { code: 'B', name: 'B', quantity: 100, avgCost: 10, currentPrice: 10, stopLoss: 8, takeProfit: 12 },
      ];
      const targets = new Map([['A', 50], ['B', 50]]);
      const result = generateRebalanceSuggestion(positions, targets);
      result.forEach(r => expect(r.action).toBe('hold'));
    });

    it('应该返回正确的当前权重', () => {
      const positions: Position[] = [
        { code: 'A', name: 'A', quantity: 300, avgCost: 10, currentPrice: 10, stopLoss: 8, takeProfit: 12 },
        { code: 'B', name: 'B', quantity: 700, avgCost: 10, currentPrice: 10, stopLoss: 8, takeProfit: 12 },
      ];
      const targets = new Map([['A', 30], ['B', 70]]);
      const result = generateRebalanceSuggestion(positions, targets);
      const a = result.find(r => r.code === 'A')!;
      expect(a.currentWeight).toBeCloseTo(30, 1);
    });
  });
});
