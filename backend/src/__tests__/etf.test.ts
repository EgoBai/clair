import { describe, it, expect } from 'vitest';

/**
 * ETF分析测试
 */

interface ETFData {
  code: string;
  name: string;
  price: number;
  nav: number;           // 净值
  premium: number;       // 溢价率
  discount: number;      // 折价率
  volume: number;
  turnover: number;
  holdings: Array<{ code: string; weight: number; shares: number }>;
}

interface ETFAnalysis {
  code: string;
  navDiff: number;       // 价格与净值差异
  premiumRate: number;
  arbitrageOpportunity: boolean;
  trackingError: number;
  liquidityScore: number;
  rebalanceNeeded: boolean;
}

function analyzeETF(etf: ETFData, navHistory: number[], priceHistory: number[]): ETFAnalysis {
  const navDiff = etf.price - etf.nav;
  const premiumRate = etf.nav > 0 ? ((etf.price - etf.nav) / etf.nav) * 100 : 0;
  const arbitrageOpportunity = Math.abs(premiumRate) > 1;

  // Tracking error
  const minLength = Math.min(navHistory.length, priceHistory.length);
  let trackingError = 0;
  if (minLength > 1) {
    const navReturns: number[] = [];
    const priceReturns: number[] = [];
    for (let i = 1; i < minLength; i++) {
      navReturns.push((navHistory[i] - navHistory[i - 1]) / navHistory[i - 1]);
      priceReturns.push((priceHistory[i] - priceHistory[i - 1]) / priceHistory[i - 1]);
    }
    const diffs = navReturns.map((nr, i) => nr - priceReturns[i]);
    const meanDiff = diffs.reduce((s, d) => s + d, 0) / diffs.length;
    trackingError = Math.sqrt(diffs.reduce((s, d) => s + Math.pow(d - meanDiff, 2), 0) / diffs.length);
  }

  const liquidityScore = Math.min(100, Math.round(etf.turnover / 1e8));
  const totalWeight = etf.holdings.reduce((s, h) => s + h.weight, 0);
  const rebalanceNeeded = Math.abs(totalWeight - 100) > 5;

  return {
    code: etf.code,
    navDiff: Math.round(navDiff * 10000) / 10000,
    premiumRate: Math.round(premiumRate * 100) / 100,
    arbitrageOpportunity,
    trackingError: Math.round(trackingError * 10000) / 10000,
    liquidityScore,
    rebalanceNeeded,
  };
}

function calcETFCorrelation(etf1Returns: number[], etf2Returns: number[]): number {
  if (etf1Returns.length !== etf2Returns.length || etf1Returns.length < 2) return 0;
  const n = etf1Returns.length;
  const mean1 = etf1Returns.reduce((s, v) => s + v, 0) / n;
  const mean2 = etf2Returns.reduce((s, v) => s + v, 0) / n;
  let num = 0, den1 = 0, den2 = 0;
  for (let i = 0; i < n; i++) {
    const d1 = etf1Returns[i] - mean1;
    const d2 = etf2Returns[i] - mean2;
    num += d1 * d2;
    den1 += d1 * d1;
    den2 += d2 * d2;
  }
  const den = Math.sqrt(den1 * den2);
  return den > 0 ? num / den : 0;
}

function findArbitrageOpportunities(etfs: ETFData[]): ETFData[] {
  return etfs.filter(etf => {
    const premiumRate = etf.nav > 0 ? Math.abs((etf.price - etf.nav) / etf.nav * 100) : 0;
    return premiumRate > 1 && etf.turnover > 1e8;
  });
}

describe('ETF Analysis', () => {
  const etf: ETFData = {
    code: '510050',
    name: '50ETF',
    price: 3.08,
    nav: 3.02,
    premium: 0.99,
    discount: 0,
    volume: 100000000,
    turnover: 3e9,
    holdings: [
      { code: '600519', weight: 15, shares: 1000000 },
      { code: '601318', weight: 12, shares: 2000000 },
      { code: '000858', weight: 8, shares: 500000 },
      { code: '000001', weight: 5, shares: 3000000 },
    ],
  };

  const navHistory = [3.00, 3.01, 3.02, 3.03, 3.02];
  const priceHistory = [3.01, 3.02, 3.04, 3.05, 3.08];

  describe('ETF分析', () => {
    it('应该计算溢价率', () => {
      const analysis = analyzeETF(etf, navHistory, priceHistory);
      expect(analysis.premiumRate).toBeGreaterThan(1);
    });

    it('应该检测套利机会', () => {
      const analysis = analyzeETF(etf, navHistory, priceHistory);
      expect(analysis.arbitrageOpportunity).toBe(true);
    });

    it('应该计算跟踪误差', () => {
      const analysis = analyzeETF(etf, navHistory, priceHistory);
      expect(analysis.trackingError).toBeGreaterThanOrEqual(0);
    });

    it('应该计算流动性评分', () => {
      const analysis = analyzeETF(etf, navHistory, priceHistory);
      expect(analysis.liquidityScore).toBeGreaterThan(0);
      expect(analysis.liquidityScore).toBeLessThanOrEqual(100);
    });

    it('应该检测再平衡需求', () => {
      const analysis = analyzeETF(etf, navHistory, priceHistory);
      expect(typeof analysis.rebalanceNeeded).toBe('boolean');
    });
  });

  describe('相关性', () => {
    it('应该计算ETF间相关性', () => {
      const returns1 = [0.01, 0.02, -0.01, 0.03, 0.01];
      const returns2 = [0.02, 0.01, -0.02, 0.02, 0.02];
      const corr = calcETFCorrelation(returns1, returns2);
      expect(corr).toBeGreaterThan(-1);
      expect(corr).toBeLessThan(1);
    });

    it('相同序列应该相关系数为1', () => {
      const returns = [0.01, 0.02, -0.01, 0.03];
      expect(calcETFCorrelation(returns, returns)).toBe(1);
    });
  });

  describe('套利机会', () => {
    it('应该找出套利机会', () => {
      const etfs: ETFData[] = [
        etf,
        { ...etf, code: '159919', price: 4.00, nav: 4.01, turnover: 2e9 },
      ];
      const opportunities = findArbitrageOpportunities(etfs);
      expect(opportunities.length).toBe(1);
      expect(opportunities[0].code).toBe('510050');
    });

    it('低流动性不应该算套利', () => {
      const lowLiqETF: ETFData = { ...etf, turnover: 1e6 };
      const opportunities = findArbitrageOpportunities([lowLiqETF]);
      expect(opportunities.length).toBe(0);
    });
  });
});
