/**
 * 投资组合页面逻辑测试
 * 覆盖持仓计算、盈亏分析、资产配置、组合指标
 */

import { describe, it, expect } from 'vitest';

interface Position {
  symbol: string;
  quantity: number;
  costPrice: number;
  currentPrice: number;
}

interface AllocationItem {
  name: string;
  value: number;
}

describe('投资组合页面逻辑', () => {
  describe('持仓市值计算', () => {
    function calcMarketValue(pos: Position): number {
      return pos.quantity * pos.currentPrice;
    }

    it('应正确计算市值', () => {
      const pos: Position = { symbol: '600519', quantity: 100, costPrice: 1800, currentPrice: 1900 };
      expect(calcMarketValue(pos)).toBe(190000);
    });

    it('零股应为0', () => {
      const pos: Position = { symbol: '600519', quantity: 0, costPrice: 1800, currentPrice: 1900 };
      expect(calcMarketValue(pos)).toBe(0);
    });
  });

  describe('盈亏计算', () => {
    function calcProfit(pos: Position): { cost: number; profit: number; profitPercent: number } {
      const cost = pos.quantity * pos.costPrice;
      const marketValue = pos.quantity * pos.currentPrice;
      const profit = marketValue - cost;
      const profitPercent = cost > 0 ? (profit / cost) * 100 : 0;
      return { cost, profit, profitPercent: Math.round(profitPercent * 100) / 100 };
    }

    it('盈利应正确计算', () => {
      const pos: Position = { symbol: '001', quantity: 100, costPrice: 10, currentPrice: 12 };
      const result = calcProfit(pos);
      expect(result.cost).toBe(1000);
      expect(result.profit).toBe(200);
      expect(result.profitPercent).toBe(20);
    });

    it('亏损应正确计算', () => {
      const pos: Position = { symbol: '001', quantity: 100, costPrice: 12, currentPrice: 10 };
      const result = calcProfit(pos);
      expect(result.profit).toBe(-200);
      expect(result.profitPercent).toBe(-16.67);
    });

    it('成本为0时盈亏比为0', () => {
      const pos: Position = { symbol: '001', quantity: 0, costPrice: 10, currentPrice: 12 };
      const result = calcProfit(pos);
      expect(result.profitPercent).toBe(0);
    });
  });

  describe('持仓权重计算', () => {
    function calcWeights(positions: Position[]): { symbol: string; weight: number }[] {
      const totalValue = positions.reduce((sum, p) => sum + p.quantity * p.currentPrice, 0);
      return positions.map(p => ({
        symbol: p.symbol,
        weight: totalValue > 0 ? Math.round((p.quantity * p.currentPrice / totalValue) * 10000) / 100 : 0,
      }));
    }

    it('应正确计算权重', () => {
      const positions: Position[] = [
        { symbol: '001', quantity: 100, costPrice: 10, currentPrice: 10 },
        { symbol: '002', quantity: 100, costPrice: 10, currentPrice: 30 },
      ];
      const weights = calcWeights(positions);
      expect(weights[0].weight).toBe(25);
      expect(weights[1].weight).toBe(75);
    });

    it('所有权重之和应为100', () => {
      const positions: Position[] = [
        { symbol: '001', quantity: 100, costPrice: 10, currentPrice: 15 },
        { symbol: '002', quantity: 200, costPrice: 20, currentPrice: 25 },
        { symbol: '003', quantity: 50, costPrice: 30, currentPrice: 28 },
      ];
      const weights = calcWeights(positions);
      const totalWeight = weights.reduce((s, w) => s + w.weight, 0);
      expect(totalWeight).toBeCloseTo(100, 0);
    });

    it('空组合应返回空数组', () => {
      expect(calcWeights([])).toEqual([]);
    });
  });

  describe('资产配置饼图', () => {
    function buildAllocationData(allocations: AllocationItem[]): { name: string; value: number; percent: string }[] {
      const total = allocations.reduce((s, a) => s + a.value, 0);
      return allocations.map(a => ({
        name: a.name,
        value: a.value,
        percent: total > 0 ? ((a.value / total) * 100).toFixed(1) + '%' : '0.0%',
      }));
    }

    it('应正确计算百分比', () => {
      const data = buildAllocationData([
        { name: '科技', value: 50000 },
        { name: '消费', value: 30000 },
        { name: '医药', value: 20000 },
      ]);
      expect(data[0].percent).toBe('50.0%');
      expect(data[1].percent).toBe('30.0%');
      expect(data[2].percent).toBe('20.0%');
    });

    it('单项应为100%', () => {
      const data = buildAllocationData([{ name: '科技', value: 100000 }]);
      expect(data[0].percent).toBe('100.0%');
    });
  });

  describe('组合汇总指标', () => {
    interface PortfolioSummary {
      totalCost: number;
      totalValue: number;
      totalProfit: number;
      totalReturn: number;
      positionCount: number;
    }

    function calcSummary(positions: Position[]): PortfolioSummary {
      let totalCost = 0, totalValue = 0;
      for (const p of positions) {
        totalCost += p.quantity * p.costPrice;
        totalValue += p.quantity * p.currentPrice;
      }
      const totalProfit = totalValue - totalCost;
      const totalReturn = totalCost > 0 ? Math.round((totalProfit / totalCost) * 10000) / 100 : 0;
      return { totalCost, totalValue, totalProfit, totalReturn, positionCount: positions.length };
    }

    it('应正确计算汇总', () => {
      const positions: Position[] = [
        { symbol: '001', quantity: 100, costPrice: 10, currentPrice: 12 },
        { symbol: '002', quantity: 200, costPrice: 20, currentPrice: 18 },
      ];
      const summary = calcSummary(positions);
      expect(summary.totalCost).toBe(5000);
      expect(summary.totalValue).toBe(4800);
      expect(summary.totalProfit).toBe(-200);
      expect(summary.totalReturn).toBe(-4);
      expect(summary.positionCount).toBe(2);
    });
  });

  describe('加仓/减仓计算', () => {
    function calcAddQuantity(
      symbol: string,
      targetPrice: number,
      currentQuantity: number,
      currentCost: number,
      addAmount: number
    ): { newQuantity: number; newAvgCost: number } {
      const addQuantity = Math.floor(addAmount / targetPrice / 100) * 100;
      const newQuantity = currentQuantity + addQuantity;
      const totalCost = currentCost * currentQuantity + targetPrice * addQuantity;
      const newAvgCost = newQuantity > 0 ? Math.round((totalCost / newQuantity) * 100) / 100 : 0;
      return { newQuantity, newAvgCost };
    }

    it('加仓应更新数量和成本', () => {
      const result = calcAddQuantity('600519', 100, 100, 90, 20000);
      expect(result.newQuantity).toBe(300); // floor(20000/100/100)*100 = 200
      expect(result.newAvgCost).toBe(96.67); // (9000 + 20000) / 300 = 96.67
    });

    it('加仓金额不足一手应不加仓', () => {
      const result = calcAddQuantity('600519', 100, 100, 90, 50);
      expect(result.newQuantity).toBe(100);
    });
  });
});
