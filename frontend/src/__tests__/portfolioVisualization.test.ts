import { describe, it, expect } from 'vitest';

// 组合可视化引擎
interface Holding {
  symbol: string; name: string; shares: number;
  costBasis: number; currentPrice: number; sector: string;
}

interface PortfolioMetrics {
  totalValue: number; totalCost: number;
  totalPnL: number; totalPnLPercent: number;
  sectorAllocation: Record<string, number>;
  topHoldings: Holding[];
}

function calcPortfolioMetrics(holdings: Holding[]): PortfolioMetrics {
  const totalValue = holdings.reduce((s, h) => s + h.shares * h.currentPrice, 0);
  const totalCost = holdings.reduce((s, h) => s + h.shares * h.costBasis, 0);
  const totalPnL = totalValue - totalCost;
  const totalPnLPercent = totalCost > 0 ? (totalPnL / totalCost) * 100 : 0;

  const sectorAllocation: Record<string, number> = {};
  holdings.forEach(h => {
    const value = h.shares * h.currentPrice;
    sectorAllocation[h.sector] = (sectorAllocation[h.sector] || 0) + value;
  });
  Object.keys(sectorAllocation).forEach(k => {
    sectorAllocation[k] = totalValue > 0 ? (sectorAllocation[k] / totalValue) * 100 : 0;
  });

  const sorted = [...holdings].sort((a, b) => (b.shares * b.currentPrice) - (a.shares * a.currentPrice));
  return { totalValue, totalCost, totalPnL, totalPnLPercent, sectorAllocation, topHoldings: sorted.slice(0, 5) };
}

function generateTreemapData(holdings: Holding[]): { name: string; value: number; pnl: number }[] {
  return holdings.map(h => ({
    name: h.name,
    value: h.shares * h.currentPrice,
    pnl: h.shares * (h.currentPrice - h.costBasis),
  }));
}

function calcSectorConcentration(sectorAllocation: Record<string, number>): number {
  const values = Object.values(sectorAllocation);
  if (values.length === 0) return 0;
  const hhi = values.reduce((s, v) => s + Math.pow(v / 100, 2), 0);
  return hhi;
}

function findDiversificationScore(holdings: Holding[]): number {
  const sectors = new Set(holdings.map(h => h.sector));
  const n = sectors.size;
  if (n <= 1) return 0;
  return Math.min(n / 10, 1) * 100;
}

describe('组合可视化引擎', () => {
  const holdings: Holding[] = [
    { symbol: '000001', name: '平安银行', shares: 1000, costBasis: 10, currentPrice: 12, sector: '金融' },
    { symbol: '000002', name: '万科A', shares: 500, costBasis: 20, currentPrice: 18, sector: '地产' },
    { symbol: '600519', name: '贵州茅台', shares: 10, costBasis: 1500, currentPrice: 1800, sector: '消费' },
    { symbol: '000858', name: '五粮液', shares: 200, costBasis: 100, currentPrice: 120, sector: '消费' },
  ];

  describe('组合指标计算', () => {
    it('应正确计算总市值', () => {
      const metrics = calcPortfolioMetrics(holdings);
      expect(metrics.totalValue).toBe(1000 * 12 + 500 * 18 + 10 * 1800 + 200 * 120);
    });

    it('应正确计算总成本', () => {
      const metrics = calcPortfolioMetrics(holdings);
      expect(metrics.totalCost).toBe(1000 * 10 + 500 * 20 + 10 * 1500 + 200 * 100);
    });

    it('应正确计算盈亏', () => {
      const metrics = calcPortfolioMetrics(holdings);
      expect(metrics.totalPnL).toBe(metrics.totalValue - metrics.totalCost);
    });

    it('空组合应返回零值', () => {
      const metrics = calcPortfolioMetrics([]);
      expect(metrics.totalValue).toBe(0);
      expect(metrics.totalPnL).toBe(0);
    });

    it('应包含行业配置', () => {
      const metrics = calcPortfolioMetrics(holdings);
      expect(metrics.sectorAllocation['金融']).toBeDefined();
      expect(metrics.sectorAllocation['消费']).toBeDefined();
    });

    it('行业配置总和应为100', () => {
      const metrics = calcPortfolioMetrics(holdings);
      const total = Object.values(metrics.sectorAllocation).reduce((a, b) => a + b, 0);
      expect(total).toBeCloseTo(100, 0);
    });

    it('topHoldings应最多5个', () => {
      const metrics = calcPortfolioMetrics(holdings);
      expect(metrics.topHoldings.length).toBeLessThanOrEqual(5);
    });
  });

  describe('树图数据', () => {
    it('应生成正确的树图数据', () => {
      const data = generateTreemapData(holdings);
      expect(data.length).toBe(4);
      expect(data[0].value).toBeGreaterThan(0);
    });

    it('应包含盈亏信息', () => {
      const data = generateTreemapData(holdings);
      const lossItem = data.find(d => d.name === '万科A');
      expect(lossItem!.pnl).toBeLessThan(0);
    });
  });

  describe('行业集中度', () => {
    it('单一行业应有高集中度', () => {
      expect(calcSectorConcentration({ '金融': 100 })).toBe(1);
    });

    it('分散行业应有低集中度', () => {
      const score = calcSectorConcentration({ '金融': 25, '消费': 25, '地产': 25, '科技': 25 });
      expect(score).toBeLessThan(0.5);
    });

    it('空配置应返回0', () => {
      expect(calcSectorConcentration({})).toBe(0);
    });
  });

  describe('分散化评分', () => {
    it('多行业应得高分', () => {
      expect(findDiversificationScore(holdings)).toBeGreaterThan(20);
    });

    it('单一行业应得0分', () => {
      const singleSector = [{ ...holdings[0], sector: '金融' }];
      expect(findDiversificationScore(singleSector)).toBe(0);
    });
  });
});
