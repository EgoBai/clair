import { describe, it, expect } from 'vitest';

// 投资组合风险分析测试
describe('Portfolio Risk Analysis', () => {
  interface Position {
    symbol: string;
    shares: number;
    avgCost: number;
    currentPrice: number;
    sector: string;
  }

  const calcPortfolioMetrics = (positions: Position[]) => {
    let totalValue = 0;
    let totalCost = 0;
    const sectorMap: Record<string, number> = {};

    for (const p of positions) {
      const value = p.shares * p.currentPrice;
      const cost = p.shares * p.avgCost;
      totalValue += value;
      totalCost += cost;
      sectorMap[p.sector] = (sectorMap[p.sector] || 0) + value;
    }

    const pnl = totalValue - totalCost;
    const returnPct = totalCost > 0 ? pnl / totalCost : 0;
    const weights = positions.map(p => ({
      symbol: p.symbol,
      weight: totalValue > 0 ? (p.shares * p.currentPrice) / totalValue : 0,
    }));
    const sectorWeights = Object.entries(sectorMap).map(([sector, value]) => ({
      sector,
      weight: totalValue > 0 ? value / totalValue : 0,
    }));
    const concentration = weights.reduce((sum, w) => sum + w.weight ** 2, 0);
    const diversificationScore = 1 - concentration;

    return {
      totalValue, totalCost, pnl, returnPct, weights, sectorWeights,
      concentration, diversificationScore,
      positionCount: positions.length,
      sectorCount: Object.keys(sectorMap).length,
    };
  };

  const positions: Position[] = [
    { symbol: '600519', shares: 100, avgCost: 1800, currentPrice: 1850, sector: '白酒' },
    { symbol: '000001', shares: 500, avgCost: 12, currentPrice: 13, sector: '银行' },
    { symbol: '300750', shares: 200, avgCost: 200, currentPrice: 210, sector: '新能源' },
    { symbol: '000858', shares: 300, avgCost: 150, currentPrice: 145, sector: '白酒' },
    { symbol: '601318', shares: 100, avgCost: 45, currentPrice: 48, sector: '金融' },
  ];

  describe('Portfolio Valuation', () => {
    it('should calculate total value', () => {
      const m = calcPortfolioMetrics(positions);
      expect(m.totalValue).toBe(185000 + 6500 + 42000 + 43500 + 4800);
    });

    it('should calculate total cost', () => {
      const m = calcPortfolioMetrics(positions);
      expect(m.totalCost).toBe(180000 + 6000 + 40000 + 45000 + 4500);
    });

    it('should calculate PnL', () => {
      const m = calcPortfolioMetrics(positions);
      expect(m.pnl).toBe(m.totalValue - m.totalCost);
    });

    it('should calculate return percentage', () => {
      const m = calcPortfolioMetrics(positions);
      expect(m.returnPct).toBeCloseTo(m.pnl / m.totalCost, 5);
    });

    it('should count positions', () => {
      const m = calcPortfolioMetrics(positions);
      expect(m.positionCount).toBe(5);
    });
  });

  describe('Position Weights', () => {
    it('should calculate position weights', () => {
      const m = calcPortfolioMetrics(positions);
      expect(m.weights).toHaveLength(5);
    });

    it('should have weights sum to 1', () => {
      const m = calcPortfolioMetrics(positions);
      const sum = m.weights.reduce((s, w) => s + w.weight, 0);
      expect(sum).toBeCloseTo(1, 5);
    });

    it('should have largest position with highest weight', () => {
      const m = calcPortfolioMetrics(positions);
      const sorted = [...m.weights].sort((a, b) => b.weight - a.weight);
      expect(sorted[0].symbol).toBe('600519');
    });

    it('should have all weights between 0 and 1', () => {
      const m = calcPortfolioMetrics(positions);
      for (const w of m.weights) {
        expect(w.weight).toBeGreaterThanOrEqual(0);
        expect(w.weight).toBeLessThanOrEqual(1);
      }
    });
  });

  describe('Sector Allocation', () => {
    it('should group by sector', () => {
      const m = calcPortfolioMetrics(positions);
      expect(m.sectorCount).toBe(4); // 白酒, 银行, 新能源, 金融
    });

    it('should have sector weights sum to 1', () => {
      const m = calcPortfolioMetrics(positions);
      const sum = m.sectorWeights.reduce((s, sw) => s + sw.weight, 0);
      expect(sum).toBeCloseTo(1, 5);
    });

    it('should combine same-sector positions', () => {
      const m = calcPortfolioMetrics(positions);
      const baijiuSector = m.sectorWeights.find(sw => sw.sector === '白酒');
      expect(baijiuSector).toBeDefined();
      expect(baijiuSector!.weight).toBeGreaterThan(0);
    });
  });

  describe('Concentration Risk', () => {
    it('should calculate concentration (Herfindahl index)', () => {
      const m = calcPortfolioMetrics(positions);
      expect(m.concentration).toBeGreaterThan(0);
      expect(m.concentration).toBeLessThan(1);
    });

    it('should have high concentration for single position', () => {
      const single: Position[] = [
        { symbol: '600519', shares: 100, avgCost: 1800, currentPrice: 1850, sector: '白酒' },
      ];
      const m = calcPortfolioMetrics(single);
      expect(m.concentration).toBe(1);
      expect(m.diversificationScore).toBe(0);
    });

    it('should have low concentration for equal-weight portfolio', () => {
      const equal: Position[] = Array.from({ length: 10 }, (_, i) => ({
        symbol: `${600000 + i}`,
        shares: 100,
        avgCost: 100,
        currentPrice: 100,
        sector: `Sector${i}`,
      }));
      const m = calcPortfolioMetrics(equal);
      expect(m.concentration).toBeCloseTo(0.1, 1);
      expect(m.diversificationScore).toBeCloseTo(0.9, 1);
    });
  });

  describe('Empty Portfolio', () => {
    it('should handle empty positions', () => {
      const m = calcPortfolioMetrics([]);
      expect(m.totalValue).toBe(0);
      expect(m.totalCost).toBe(0);
      expect(m.pnl).toBe(0);
      expect(m.positionCount).toBe(0);
    });
  });

  describe('Loss Scenario', () => {
    it('should show negative PnL for losing portfolio', () => {
      const losing: Position[] = [
        { symbol: '000001', shares: 1000, avgCost: 20, currentPrice: 15, sector: '银行' },
      ];
      const m = calcPortfolioMetrics(losing);
      expect(m.pnl).toBeLessThan(0);
      expect(m.returnPct).toBeLessThan(0);
    });
  });
});
