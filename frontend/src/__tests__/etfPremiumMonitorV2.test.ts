import { describe, it, expect } from 'vitest';

// ETF折溢价监控引擎V2
interface ETFData {
  symbol: string;
  name: string;
  nav: number;
  marketPrice: number;
  iopv: number;
  volume: number;
  trackingError: number;
  totalShares: number;
  creationUnit: number;
}

interface PremiumAlert {
  symbol: string;
  premiumRate: number;
  iopvPremiumRate: number;
  liquidityScore: number;
  arbFeasible: boolean;
  estimatedProfit: number;
  riskLevel: 'low' | 'medium' | 'high';
}

function calcPremiumRates(etf: ETFData): { navPremium: number; iopvPremium: number } {
  return {
    navPremium: etf.nav > 0 ? (etf.marketPrice - etf.nav) / etf.nav : 0,
    iopvPremium: etf.iopv > 0 ? (etf.marketPrice - etf.iopv) / etf.iopv : 0,
  };
}

function calcLiquidityScore(etf: ETFData): number {
  const volumeScore = Math.min(1, etf.volume / 1000000);
  const sizeScore = Math.min(1, etf.totalShares / 100000000);
  return volumeScore * 0.6 + sizeScore * 0.4;
}

function monitorPremiumDiscount(etfs: ETFData[], threshold: number = 0.003): PremiumAlert[] {
  return etfs.map(etf => {
    const { navPremium, iopvPremium } = calcPremiumRates(etf);
    const liquidityScore = calcLiquidityScore(etf);
    const absPremium = Math.abs(navPremium);
    const cost = 0.0015;
    const arbFeasible = absPremium > threshold && absPremium > cost && liquidityScore > 0.3;
    const estimatedProfit = (absPremium - cost) * 1000000;

    return {
      symbol: etf.symbol,
      premiumRate: navPremium,
      iopvPremiumRate: iopvPremium,
      liquidityScore,
      arbFeasible,
      estimatedProfit: arbFeasible ? estimatedProfit : 0,
      riskLevel: liquidityScore > 0.7 ? 'low' : liquidityScore > 0.3 ? 'medium' : 'high',
    };
  }).filter(a => Math.abs(a.premiumRate) > threshold || a.arbFeasible);
}

function findCreationRedemptionOpps(etfs: ETFData[]): { type: 'create' | 'redeem'; symbol: string; profit: number }[] {
  return etfs.flatMap(etf => {
    const { navPremium } = calcPremiumRates(etf);
    const opps: { type: 'create' | 'redeem'; symbol: string; profit: number }[] = [];
    if (navPremium > 0.005 && etf.volume > 500000) {
      opps.push({ type: 'create', symbol: etf.symbol, profit: navPremium * etf.creationUnit * etf.nav });
    }
    if (navPremium < -0.005 && etf.volume > 500000) {
      opps.push({ type: 'redeem', symbol: etf.symbol, profit: Math.abs(navPremium) * etf.creationUnit * etf.nav });
    }
    return opps;
  });
}

describe('ETF折溢价监控引擎V2', () => {
  const etfs: ETFData[] = [
    { symbol: '510300', name: '沪深300ETF', nav: 4.5, marketPrice: 4.55, iopv: 4.51, volume: 2000000, trackingError: 0.001, totalShares: 300000000, creationUnit: 300000 },
    { symbol: '510500', name: '中证500ETF', nav: 6.8, marketPrice: 6.75, iopv: 6.82, volume: 1500000, trackingError: 0.0015, totalShares: 200000000, creationUnit: 200000 },
    { symbol: '159915', name: '创业板ETF', nav: 2.3, marketPrice: 2.31, iopv: 2.3, volume: 50000, trackingError: 0.002, totalShares: 50000000, creationUnit: 500000 },
    { symbol: '510050', name: '50ETF', nav: 3.1, marketPrice: 3.1, iopv: 3.1, volume: 3000000, trackingError: 0.0008, totalShares: 500000000, creationUnit: 1000000 },
  ];

  it('应计算折溢价率', () => {
    const { navPremium, iopvPremium } = calcPremiumRates(etfs[0]);
    expect(navPremium).toBeCloseTo(0.0111, 3);
    expect(iopvPremium).toBeCloseTo(0.0089, 3);
  });

  it('应计算流动性评分', () => {
    const score = calcLiquidityScore(etfs[0]);
    expect(score).toBeGreaterThan(0);
    expect(score).toBeLessThanOrEqual(1);
  });

  it('高流动性应得高分', () => {
    const high = calcLiquidityScore(etfs[0]);
    const low = calcLiquidityScore(etfs[2]);
    expect(high).toBeGreaterThan(low);
  });

  it('应监控折溢价', () => {
    const alerts = monitorPremiumDiscount(etfs);
    alerts.forEach(a => {
      expect(typeof a.premiumRate).toBe('number');
      expect(typeof a.arbFeasible).toBe('boolean');
      expect(['low', 'medium', 'high']).toContain(a.riskLevel);
    });
  });

  it('无溢价ETF不应触发', () => {
    const flat: ETFData[] = [etfs[3]];
    const alerts = monitorPremiumDiscount(flat);
    expect(alerts.length).toBe(0);
  });

  it('应寻找申赎套利', () => {
    const opps = findCreationRedemptionOpps(etfs);
    opps.forEach(o => {
      expect(['create', 'redeem']).toContain(o.type);
      expect(o.profit).toBeGreaterThan(0);
    });
  });

  it('溢价应触发申购套利', () => {
    const opps = findCreationRedemptionOpps(etfs);
    expect(opps.some(o => o.type === 'create' && o.symbol === '510300')).toBe(true);
  });

  it('折价应触发赎回套利', () => {
    const opps = findCreationRedemptionOpps(etfs);
    expect(opps.some(o => o.type === 'redeem' && o.symbol === '510500')).toBe(true);
  });

  it('低成交量不应有申赎套利', () => {
    const lowVol: ETFData[] = [{ ...etfs[0], volume: 10000 }];
    const opps = findCreationRedemptionOpps(lowVol);
    expect(opps.length).toBe(0);
  });

  it('空数据应返回空', () => {
    expect(monitorPremiumDiscount([])).toEqual([]);
  });
});
