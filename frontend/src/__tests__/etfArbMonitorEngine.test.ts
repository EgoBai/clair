import { describe, it, expect } from 'vitest';

// ETF套利监控引擎
interface ETFQuote {
  symbol: string;
  nav: number;
  marketPrice: number;
  timestamp: number;
  volume: number;
  iopv: number;
}

interface ArbitrageOpportunity {
  type: 'premium' | 'discount';
  etf: string;
  spread: number;
  spreadPercent: number;
  estimatedProfit: number;
  cost: number;
  netProfit: number;
  feasible: boolean;
}

function calcPremium(etf: ETFQuote): number {
  return (etf.marketPrice - etf.nav) / etf.nav;
}

function calcIOPVPremium(etf: ETFQuote): number {
  return (etf.marketPrice - etf.iopv) / etf.iopv;
}

function findArbOpportunities(etfs: ETFQuote[], minSpread: number = 0.005, tradeSize: number = 1000000): ArbitrageOpportunity[] {
  return etfs.map(etf => {
    const spread = calcPremium(etf);
    const absSpread = Math.abs(spread);
    const type = spread > 0 ? 'premium' : 'discount';
    const cost = tradeSize * 0.0015; // 交易成本约0.15%
    const estimatedProfit = absSpread * tradeSize;
    const netProfit = estimatedProfit - cost;
    return {
      type,
      etf: etf.symbol,
      spread,
      spreadPercent: spread * 100,
      estimatedProfit,
      cost,
      netProfit,
      feasible: absSpread >= minSpread && netProfit > 0 && etf.volume > 100000,
    };
  });
}

function filterFeasibleOpps(opps: ArbitrageOpportunity[]): ArbitrageOpportunity[] {
  return opps.filter(o => o.feasible).sort((a, b) => b.netProfit - a.netProfit);
}

function estimateExecutionRisk(spread: number, volume: number): 'low' | 'medium' | 'high' {
  if (spread > 0.02 && volume > 500000) return 'low';
  if (spread > 0.01 && volume > 200000) return 'medium';
  return 'high';
}

describe('ETF套利监控引擎', () => {
  const etfs: ETFQuote[] = [
    { symbol: '510300', nav: 4.50, marketPrice: 4.55, timestamp: Date.now(), volume: 500000, iopv: 4.51 },
    { symbol: '510500', nav: 6.80, marketPrice: 6.75, timestamp: Date.now(), volume: 300000, iopv: 6.82 },
    { symbol: '159915', nav: 2.30, marketPrice: 2.31, timestamp: Date.now(), volume: 50000, iopv: 2.30 },
    { symbol: '510050', nav: 3.10, marketPrice: 3.10, timestamp: Date.now(), volume: 800000, iopv: 3.10 },
  ];

  it('应计算溢价率', () => {
    expect(calcPremium(etfs[0])).toBeCloseTo(0.0111, 3);
    expect(calcPremium(etfs[1])).toBeLessThan(0);
  });

  it('应计算IOPV溢价率', () => {
    expect(calcIOPVPremium(etfs[0])).toBeGreaterThan(0);
    expect(calcIOPVPremium(etfs[1])).toBeLessThan(0);
  });

  it('应寻找套利机会', () => {
    const opps = findArbOpportunities(etfs);
    expect(opps.length).toBe(etfs.length);
    opps.forEach(o => {
      expect(['premium', 'discount']).toContain(o.type);
      expect(typeof o.feasible).toBe('boolean');
    });
  });

  it('应筛选可行套利', () => {
    const opps = findArbOpportunities(etfs);
    const feasible = filterFeasibleOpps(opps);
    feasible.forEach(o => {
      expect(o.feasible).toBe(true);
      expect(o.netProfit).toBeGreaterThan(0);
    });
  });

  it('低成交量ETF应不可行', () => {
    const opps = findArbOpportunities(etfs);
    const lowVol = opps.find(o => o.etf === '159915');
    expect(lowVol?.feasible).toBe(false);
  });

  it('无溢价ETF应不可行', () => {
    const opps = findArbOpportunities(etfs);
    const flat = opps.find(o => o.etf === '510050');
    expect(flat?.feasible).toBe(false);
  });

  it('应估算执行风险', () => {
    expect(estimateExecutionRisk(0.03, 600000)).toBe('low');
    expect(estimateExecutionRisk(0.015, 300000)).toBe('medium');
    expect(estimateExecutionRisk(0.005, 50000)).toBe('high');
  });

  it('净收益应减去成本', () => {
    const opps = findArbOpportunities(etfs);
    opps.forEach(o => {
      expect(o.netProfit).toBe(o.estimatedProfit - o.cost);
    });
  });

  it('最小价差过滤应生效', () => {
    const opps = findArbOpportunities(etfs, 0.1);
    const feasible = filterFeasibleOpps(opps);
    expect(feasible.length).toBe(0);
  });

  it('空列表应返回空', () => {
    expect(findArbOpportunities([])).toEqual([]);
  });
});
