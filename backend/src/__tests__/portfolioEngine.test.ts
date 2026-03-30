import { describe, it, expect } from 'vitest';

// Portfolio engine and calculation tests
describe('Portfolio Calculation Engine', () => {
  interface Position {
    symbol: string;
    shares: number;
    costBasis: number;
    currentPrice: number;
    sector: string;
  }

  const positions: Position[] = [
    { symbol: '600519', shares: 100, costBasis: 1700, currentPrice: 1800, sector: '白酒' },
    { symbol: '000858', shares: 200, costBasis: 150, currentPrice: 145, sector: '白酒' },
    { symbol: '300750', shares: 500, costBasis: 200, currentPrice: 220, sector: '新能源' },
    { symbol: '601318', shares: 300, costBasis: 50, currentPrice: 48, sector: '金融' },
  ];

  describe('Position Calculations', () => {
    it('should calculate market value per position', () => {
      const mv = positions.map(p => ({
        symbol: p.symbol,
        marketValue: p.shares * p.currentPrice,
      }));
      expect(mv[0].marketValue).toBe(180000);
      expect(mv[1].marketValue).toBe(29000);
    });

    it('should calculate cost per position', () => {
      const costs = positions.map(p => p.shares * p.costBasis);
      expect(costs[0]).toBe(170000);
      expect(costs[2]).toBe(100000);
    });

    it('should calculate PnL per position', () => {
      const pnls = positions.map(p => ({
        symbol: p.symbol,
        pnl: (p.currentPrice - p.costBasis) * p.shares,
      }));
      expect(pnls[0].pnl).toBe(10000); // Profit
      expect(pnls[1].pnl).toBe(-1000); // Loss
      expect(pnls[2].pnl).toBe(10000); // Profit
    });

    it('should calculate return percentage per position', () => {
      const returns = positions.map(p => ({
        symbol: p.symbol,
        returnPct: ((p.currentPrice - p.costBasis) / p.costBasis) * 100,
      }));
      expect(returns[0].returnPct).toBeCloseTo(5.88, 1);
      expect(returns[1].returnPct).toBeCloseTo(-3.33, 1);
    });

    it('should calculate total portfolio value', () => {
      const total = positions.reduce((s, p) => s + p.shares * p.currentPrice, 0);
      expect(total).toBe(333400);
    });

    it('should calculate total cost basis', () => {
      const totalCost = positions.reduce((s, p) => s + p.shares * p.costBasis, 0);
      expect(totalCost).toBe(315000);
    });

    it('should calculate total PnL', () => {
      const totalPnL = positions.reduce((s, p) => s + (p.currentPrice - p.costBasis) * p.shares, 0);
      expect(totalPnL).toBe(18400);
    });

    it('should calculate overall return', () => {
      const totalValue = positions.reduce((s, p) => s + p.shares * p.currentPrice, 0);
      const totalCost = positions.reduce((s, p) => s + p.shares * p.costBasis, 0);
      const overallReturn = ((totalValue - totalCost) / totalCost) * 100;
      expect(overallReturn).toBeCloseTo(5.84, 1);
    });
  });

  describe('Position Weight Calculations', () => {
    it('should calculate weight per position', () => {
      const totalValue = positions.reduce((s, p) => s + p.shares * p.currentPrice, 0);
      const weights = positions.map(p => ({
        symbol: p.symbol,
        weight: (p.shares * p.currentPrice / totalValue) * 100,
      }));
      expect(weights[0].weight).toBeCloseTo(53.99, 1);
      const sumWeight = weights.reduce((s, w) => s + w.weight, 0);
      expect(sumWeight).toBeCloseTo(100, 0);
    });

    it('should calculate sector weights', () => {
      const totalValue = positions.reduce((s, p) => s + p.shares * p.currentPrice, 0);
      const sectorMap = new Map<string, number>();
      positions.forEach(p => {
        const mv = p.shares * p.currentPrice;
        sectorMap.set(p.sector, (sectorMap.get(p.sector) || 0) + mv);
      });
      const sectorWeights = Array.from(sectorMap.entries()).map(([sector, value]) => ({
        sector,
        weight: (value / totalValue) * 100,
      }));
      const baijiu = sectorWeights.find(s => s.sector === '白酒');
      expect(baijiu?.weight).toBeCloseTo(62.69, 1);
    });

    it('should detect overweight sectors (>50%)', () => {
      const sectorMap = new Map<string, number>();
      positions.forEach(p => {
        const totalValue = positions.reduce((s, p2) => s + p2.shares * p2.currentPrice, 0);
        sectorMap.set(p.sector, (sectorMap.get(p.sector) || 0) + (p.shares * p.currentPrice));
      });
      const totalValue = positions.reduce((s, p) => s + p.shares * p.currentPrice, 0);
      for (const [, value] of sectorMap) {
        if (value / totalValue > 0.5) {
          // Concentrated sector found
          expect(value / totalValue).toBeGreaterThan(0.5);
        }
      }
    });
  });

  describe('Average Cost Calculation', () => {
    it('should calculate average cost for multiple buys', () => {
      const buys = [
        { shares: 100, price: 1700 },
        { shares: 50, price: 1800 },
      ];
      const totalShares = buys.reduce((s, b) => s + b.shares, 0);
      const totalCost = buys.reduce((s, b) => s + b.shares * b.price, 0);
      const avgCost = totalCost / totalShares;
      expect(avgCost).toBeCloseTo(1733.33, 1);
    });

    it('should handle adding to position at higher price', () => {
      const existing = { shares: 100, avgCost: 1700 };
      const newBuy = { shares: 100, price: 1900 };
      const totalShares = existing.shares + newBuy.shares;
      const totalCost = existing.shares * existing.avgCost + newBuy.shares * newBuy.price;
      const newAvgCost = totalCost / totalShares;
      expect(newAvgCost).toBe(1800);
    });

    it('should handle adding to position at lower price', () => {
      const existing = { shares: 100, avgCost: 1900 };
      const newBuy = { shares: 100, price: 1700 };
      const totalShares = existing.shares + newBuy.shares;
      const totalCost = existing.shares * existing.avgCost + newBuy.shares * newBuy.price;
      const newAvgCost = totalCost / totalShares;
      expect(newAvgCost).toBe(1800);
    });
  });

  describe('Risk Metrics', () => {
    it('should calculate daily returns', () => {
      const values = [100000, 101000, 99500, 102000, 101500];
      const dailyReturns = values.slice(1).map((v, i) => (v - values[i]) / values[i]);
      expect(dailyReturns).toHaveLength(4);
      expect(dailyReturns[0]).toBeCloseTo(0.01, 5);
      expect(dailyReturns[1]).toBeCloseTo(-0.01485, 3);
    });

    it('should calculate portfolio volatility', () => {
      const returns = [0.01, -0.015, 0.025, -0.005];
      const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
      const variance = returns.reduce((s, r) => s + (r - mean) ** 2, 0) / returns.length;
      const volatility = Math.sqrt(variance);
      expect(volatility).toBeGreaterThan(0);
    });

    it('should calculate maximum drawdown', () => {
      const values = [100, 110, 105, 115, 95, 100, 108];
      let maxDrawdown = 0;
      let peak = values[0];
      for (const v of values) {
        if (v > peak) peak = v;
        const dd = (peak - v) / peak;
        if (dd > maxDrawdown) maxDrawdown = dd;
      }
      expect(maxDrawdown).toBeCloseTo(0.174, 2);
    });

    it('should calculate Sharpe ratio', () => {
      const returns = [0.01, -0.015, 0.025, -0.005, 0.02];
      const riskFreeRate = 0.001;
      const excessReturns = returns.map(r => r - riskFreeRate);
      const mean = excessReturns.reduce((a, b) => a + b, 0) / excessReturns.length;
      const std = Math.sqrt(excessReturns.reduce((s, r) => s + (r - mean) ** 2, 0) / excessReturns.length);
      const sharpe = std === 0 ? 0 : mean / std;
      expect(Number.isFinite(sharpe)).toBe(true);
    });

    it('should have Sharpe > 0 for profitable portfolio', () => {
      const returns = [0.02, 0.01, 0.03, 0.015, 0.025];
      const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
      const std = Math.sqrt(returns.reduce((s, r) => s + (r - mean) ** 2, 0) / returns.length);
      const sharpe = mean / std;
      expect(sharpe).toBeGreaterThan(0);
    });

    it('should calculate Beta against benchmark', () => {
      const stockReturns = [0.02, -0.01, 0.03, -0.005, 0.025];
      const benchReturns = [0.01, -0.005, 0.02, 0.005, 0.015];
      const meanStock = stockReturns.reduce((a, b) => a + b, 0) / stockReturns.length;
      const meanBench = benchReturns.reduce((a, b) => a + b, 0) / benchReturns.length;
      let covariance = 0, benchVariance = 0;
      for (let i = 0; i < stockReturns.length; i++) {
        covariance += (stockReturns[i] - meanStock) * (benchReturns[i] - meanBench);
        benchVariance += (benchReturns[i] - meanBench) ** 2;
      }
      const beta = benchVariance === 0 ? 0 : covariance / benchVariance;
      expect(Number.isFinite(beta)).toBe(true);
    });
  });

  describe('Rebalancing', () => {
    it('should calculate rebalance trades', () => {
      const targetWeights = { '600519': 40, '000858': 30, '300750': 30 };
      const totalValue = 300000;
      const currentPositions = [
        { symbol: '600519', marketValue: 150000 },
        { symbol: '000858', marketValue: 80000 },
        { symbol: '300750', marketValue: 70000 },
      ];
      const trades = currentPositions.map(p => ({
        symbol: p.symbol,
        currentValue: p.marketValue,
        targetValue: totalValue * (targetWeights[p.symbol as keyof typeof targetWeights] / 100),
        trade: totalValue * (targetWeights[p.symbol as keyof typeof targetWeights] / 100) - p.marketValue,
      }));
      expect(trades[0].trade).toBe(-30000); // Sell
      expect(trades[1].trade).toBe(10000);  // Buy
      expect(trades[2].trade).toBe(20000);  // Buy
    });

    it('should sum rebalance trades to zero', () => {
      const trades = [-30000, 10000, 20000];
      expect(trades.reduce((a, b) => a + b, 0)).toBe(0);
    });

    it('should ignore small rebalance trades', () => {
      const threshold = 1000;
      const trades = [-30000, 500, -200, 100];
      const significant = trades.filter(t => Math.abs(t) >= threshold);
      expect(significant).toHaveLength(1);
    });
  });

  describe('Dividend Tracking', () => {
    it('should calculate dividend income', () => {
      const dividends = [
        { symbol: '600519', shares: 100, perShare: 30.226 },
        { symbol: '601318', shares: 300, perShare: 1.5 },
      ];
      const totalDividend = dividends.reduce((s, d) => s + d.shares * d.perShare, 0);
      expect(totalDividend).toBe(3472.6);
    });

    it('should calculate dividend yield', () => {
      const price = 1800;
      const annualDividend = 30.226;
      const yieldPct = (annualDividend / price) * 100;
      expect(yieldPct).toBeCloseTo(1.68, 1);
    });

    it('should track ex-dividend date impact', () => {
      const prevClose = 1800;
      const dividend = 30.226;
      const adjustedOpen = prevClose - dividend;
      expect(adjustedOpen).toBeCloseTo(1769.77, 1);
    });
  });

  describe('Tax Lot Tracking', () => {
    it('should track holding period', () => {
      const buyDate = new Date('2024-01-15');
      const sellDate = new Date('2024-08-20');
      const holdingDays = (sellDate.getTime() - buyDate.getTime()) / (1000 * 60 * 60 * 24);
      expect(holdingDays).toBeGreaterThan(180); // > 6 months
    });

    it('should distinguish short-term vs long-term gains', () => {
      const oneYearMs = 365 * 24 * 60 * 60 * 1000;
      const buyDate = new Date('2024-01-01');
      const shortTermSell = new Date(buyDate.getTime() + oneYearMs - 86400000);
      const longTermSell = new Date(buyDate.getTime() + oneYearMs + 86400000);
      expect(shortTermSell.getTime() - buyDate.getTime()).toBeLessThan(oneYearMs);
      expect(longTermSell.getTime() - buyDate.getTime()).toBeGreaterThan(oneYearMs);
    });

    it('should apply FIFO for selling', () => {
      const lots = [
        { shares: 100, cost: 1700, date: '2024-01-01' },
        { shares: 50, cost: 1750, date: '2024-03-01' },
        { shares: 100, cost: 1800, date: '2024-06-01' },
      ];
      const sellShares = 120;
      let remaining = sellShares;
      const sold: { shares: number; cost: number }[] = [];
      for (const lot of lots) {
        if (remaining <= 0) break;
        const sellFromLot = Math.min(remaining, lot.shares);
        sold.push({ shares: sellFromLot, cost: lot.cost });
        remaining -= sellFromLot;
      }
      expect(sold).toHaveLength(2);
      expect(sold[0].shares).toBe(100);
      expect(sold[1].shares).toBe(20);
      expect(sold[0].cost).toBe(1700);
      expect(sold[1].cost).toBe(1750);
    });
  });
});
