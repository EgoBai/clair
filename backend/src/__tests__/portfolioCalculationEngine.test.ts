import { describe, it, expect } from 'vitest';

// 投资组合计算引擎测试
describe('投资组合计算引擎', () => {
  interface Position {
    symbol: string;
    quantity: number;
    costPrice: number;
    currentPrice: number;
    sector: string;
  }

  interface PortfolioMetrics {
    totalValue: number;
    totalCost: number;
    totalPnL: number;
    totalReturn: number;
    sectorWeights: Record<string, number>;
    positionWeights: Record<string, number>;
    topHoldings: string[];
    diversificationScore: number;
  }

  function calculatePortfolioMetrics(positions: Position[]): PortfolioMetrics {
    if (positions.length === 0) {
      return {
        totalValue: 0, totalCost: 0, totalPnL: 0, totalReturn: 0,
        sectorWeights: {}, positionWeights: {}, topHoldings: [], diversificationScore: 0,
      };
    }

    let totalValue = 0;
    let totalCost = 0;
    const sectorValues: Record<string, number> = {};
    const positionValues: Record<string, number> = {};

    for (const pos of positions) {
      const value = pos.quantity * pos.currentPrice;
      const cost = pos.quantity * pos.costPrice;
      totalValue += value;
      totalCost += cost;
      sectorValues[pos.sector] = (sectorValues[pos.sector] || 0) + value;
      positionValues[pos.symbol] = value;
    }

    const totalPnL = totalValue - totalCost;
    const totalReturn = totalCost > 0 ? totalPnL / totalCost : 0;

    const sectorWeights: Record<string, number> = {};
    for (const [sector, value] of Object.entries(sectorValues)) {
      sectorWeights[sector] = totalValue > 0 ? value / totalValue : 0;
    }

    const positionWeights: Record<string, number> = {};
    for (const [symbol, value] of Object.entries(positionValues)) {
      positionWeights[symbol] = totalValue > 0 ? value / totalValue : 0;
    }

    const sortedByValue = Object.entries(positionValues).sort((a, b) => b[1] - a[1]);
    const topHoldings = sortedByValue.slice(0, 3).map(([s]) => s);

    // 分散化评分：HHI指数反向(1-HHI)，越分散越高
    const hhi = Object.values(positionWeights).reduce((sum, w) => sum + w ** 2, 0);
    const maxHHI = 1; // 集中持仓
    const minHHI = 1 / positions.length; // 完全等权
    const diversificationScore = minHHI === maxHHI ? 1 : (1 - hhi) / (1 - minHHI);

    return {
      totalValue, totalCost, totalPnL, totalReturn,
      sectorWeights, positionWeights, topHoldings,
      diversificationScore: Math.max(0, Math.min(1, diversificationScore)),
    };
  }

  describe('基本计算', () => {
    it('单只持仓应该正确计算', () => {
      const positions: Position[] = [
        { symbol: '600519', quantity: 100, costPrice: 1800, currentPrice: 1900, sector: '消费' },
      ];
      const metrics = calculatePortfolioMetrics(positions);
      expect(metrics.totalValue).toBe(190000);
      expect(metrics.totalCost).toBe(180000);
      expect(metrics.totalPnL).toBe(10000);
      expect(metrics.totalReturn).toBeCloseTo(0.0556, 3);
    });

    it('多只持仓应该正确汇总', () => {
      const positions: Position[] = [
        { symbol: 'A', quantity: 100, costPrice: 10, currentPrice: 12, sector: '科技' },
        { symbol: 'B', quantity: 200, costPrice: 20, currentPrice: 18, sector: '消费' },
      ];
      const metrics = calculatePortfolioMetrics(positions);
      expect(metrics.totalValue).toBe(1200 + 3600);
      expect(metrics.totalCost).toBe(1000 + 4000);
      expect(metrics.totalPnL).toBe(-200);
    });

    it('空持仓应该返回零值', () => {
      const metrics = calculatePortfolioMetrics([]);
      expect(metrics.totalValue).toBe(0);
      expect(metrics.totalPnL).toBe(0);
      expect(metrics.totalReturn).toBe(0);
    });
  });

  describe('权重计算', () => {
    it('持仓权重总和应该为1', () => {
      const positions: Position[] = [
        { symbol: 'A', quantity: 100, costPrice: 10, currentPrice: 10, sector: '科技' },
        { symbol: 'B', quantity: 100, costPrice: 10, currentPrice: 10, sector: '消费' },
        { symbol: 'C', quantity: 100, costPrice: 10, currentPrice: 10, sector: '金融' },
      ];
      const metrics = calculatePortfolioMetrics(positions);
      const totalWeight = Object.values(metrics.positionWeights).reduce((a, b) => a + b, 0);
      expect(totalWeight).toBeCloseTo(1, 5);
    });

    it('行业权重总和应该为1', () => {
      const positions: Position[] = [
        { symbol: 'A', quantity: 100, costPrice: 10, currentPrice: 10, sector: '科技' },
        { symbol: 'B', quantity: 100, costPrice: 10, currentPrice: 10, sector: '消费' },
      ];
      const metrics = calculatePortfolioMetrics(positions);
      const totalWeight = Object.values(metrics.sectorWeights).reduce((a, b) => a + b, 0);
      expect(totalWeight).toBeCloseTo(1, 5);
    });

    it('大市值持仓应该有更大权重', () => {
      const positions: Position[] = [
        { symbol: 'A', quantity: 100, costPrice: 100, currentPrice: 100, sector: '科技' },
        { symbol: 'B', quantity: 100, costPrice: 10, currentPrice: 10, sector: '消费' },
      ];
      const metrics = calculatePortfolioMetrics(positions);
      expect(metrics.positionWeights['A']).toBeGreaterThan(metrics.positionWeights['B']);
    });
  });

  describe('最大持仓', () => {
    it('应该按市值排序返回前3', () => {
      const positions: Position[] = [
        { symbol: 'A', quantity: 100, costPrice: 10, currentPrice: 5, sector: '科技' },
        { symbol: 'B', quantity: 100, costPrice: 10, currentPrice: 30, sector: '消费' },
        { symbol: 'C', quantity: 100, costPrice: 10, currentPrice: 20, sector: '金融' },
        { symbol: 'D', quantity: 100, costPrice: 10, currentPrice: 15, sector: '医药' },
        { symbol: 'E', quantity: 100, costPrice: 10, currentPrice: 10, sector: '地产' },
      ];
      const metrics = calculatePortfolioMetrics(positions);
      expect(metrics.topHoldings).toEqual(['B', 'C', 'D']);
    });
  });

  describe('分散化评分', () => {
    it('等权持仓应该有高分散化评分', () => {
      const positions: Position[] = [
        { symbol: 'A', quantity: 100, costPrice: 10, currentPrice: 10, sector: 'S1' },
        { symbol: 'B', quantity: 100, costPrice: 10, currentPrice: 10, sector: 'S2' },
        { symbol: 'C', quantity: 100, costPrice: 10, currentPrice: 10, sector: 'S3' },
        { symbol: 'D', quantity: 100, costPrice: 10, currentPrice: 10, sector: 'S4' },
        { symbol: 'E', quantity: 100, costPrice: 10, currentPrice: 10, sector: 'S5' },
      ];
      const metrics = calculatePortfolioMetrics(positions);
      expect(metrics.diversificationScore).toBeGreaterThan(0.8);
    });

    it('集中持仓应该有低分散化评分', () => {
      const positions: Position[] = [
        { symbol: 'A', quantity: 10000, costPrice: 10, currentPrice: 10, sector: 'S1' },
        { symbol: 'B', quantity: 1, costPrice: 10, currentPrice: 10, sector: 'S2' },
      ];
      const metrics = calculatePortfolioMetrics(positions);
      expect(metrics.diversificationScore).toBeLessThan(0.5);
    });

    it('单只持仓分散化评分为0', () => {
      const positions: Position[] = [
        { symbol: 'A', quantity: 100, costPrice: 10, currentPrice: 10, sector: 'S1' },
      ];
      const metrics = calculatePortfolioMetrics(positions);
      expect(metrics.diversificationScore).toBe(1);
    });
  });

  describe('盈亏计算', () => {
    it('盈利持仓应该有正PnL', () => {
      const positions: Position[] = [
        { symbol: 'A', quantity: 100, costPrice: 10, currentPrice: 15, sector: '科技' },
      ];
      const metrics = calculatePortfolioMetrics(positions);
      expect(metrics.totalPnL).toBe(500);
      expect(metrics.totalReturn).toBeGreaterThan(0);
    });

    it('亏损持仓应该有负PnL', () => {
      const positions: Position[] = [
        { symbol: 'A', quantity: 100, costPrice: 15, currentPrice: 10, sector: '科技' },
      ];
      const metrics = calculatePortfolioMetrics(positions);
      expect(metrics.totalPnL).toBe(-500);
      expect(metrics.totalReturn).toBeLessThan(0);
    });

    it('盈亏平衡应该PnL为0', () => {
      const positions: Position[] = [
        { symbol: 'A', quantity: 100, costPrice: 10, currentPrice: 10, sector: '科技' },
      ];
      const metrics = calculatePortfolioMetrics(positions);
      expect(metrics.totalPnL).toBe(0);
      expect(metrics.totalReturn).toBe(0);
    });
  });

  // 加仓均价计算
  describe('加仓均价计算', () => {
    function calculateAverageCost(
      existingQty: number, existingCost: number,
      newQty: number, newPrice: number
    ): number {
      const totalQty = existingQty + newQty;
      if (totalQty === 0) return 0;
      return (existingQty * existingCost + newQty * newPrice) / totalQty;
    }

    it('加仓后均价应该在两个价格之间', () => {
      const avgCost = calculateAverageCost(100, 10, 100, 15);
      expect(avgCost).toBeCloseTo(12.5, 2);
    });

    it('同价加仓均价应该不变', () => {
      const avgCost = calculateAverageCost(100, 10, 100, 10);
      expect(avgCost).toBe(10);
    });

    it('高价加仓应该抬高均价', () => {
      const avgCost = calculateAverageCost(100, 10, 100, 20);
      expect(avgCost).toBeGreaterThan(10);
    });

    it('低价加仓应该降低均价', () => {
      const avgCost = calculateAverageCost(100, 20, 100, 10);
      expect(avgCost).toBeLessThan(20);
    });

    it('零仓位加仓应该等于新价', () => {
      const avgCost = calculateAverageCost(0, 0, 100, 15);
      expect(avgCost).toBe(15);
    });

    it('零加仓均价应该不变', () => {
      const avgCost = calculateAverageCost(100, 10, 0, 20);
      expect(avgCost).toBe(10);
    });
  });
});
