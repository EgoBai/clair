import { describe, it, expect } from 'vitest';

// ETF基金分析引擎
describe('ETF基金分析引擎', () => {
  interface ETFHoldings { symbol: string; weight: number; shares: number; marketValue: number }

  function calcNAV(holdings: ETFHoldings[], totalShares: number): number {
    const totalValue = holdings.reduce((s, h) => s + h.marketValue, 0);
    return totalShares > 0 ? totalValue / totalShares : 0;
  }

  function trackingError(etfReturns: number[], benchmarkReturns: number[]): number {
    if (etfReturns.length !== benchmarkReturns.length || etfReturns.length === 0) return 0;
    const diffs = etfReturns.map((r, i) => r - benchmarkReturns[i]!);
    const mean = diffs.reduce((s, d) => s + d, 0) / diffs.length;
    return Math.sqrt(diffs.reduce((s, d) => s + (d - mean) ** 2, 0) / diffs.length);
  }

  function premiumDiscount(nav: number, marketPrice: number): number {
    return nav > 0 ? (marketPrice - nav) / nav * 100 : 0;
  }

  function concentrationRatio(holdings: ETFHoldings[]): number {
    const totalValue = holdings.reduce((s, h) => s + h.marketValue, 0);
    const top10Value = [...holdings].sort((a, b) => b.marketValue - a.marketValue)
      .slice(0, 10).reduce((s, h) => s + h.marketValue, 0);
    return totalValue > 0 ? top10Value / totalValue * 100 : 0;
  }

  function sectorAllocation(holdings: ETFHoldings[], sectorMap: Record<string, string>): Record<string, number> {
    const totalValue = holdings.reduce((s, h) => s + h.marketValue, 0);
    const alloc: Record<string, number> = {};
    for (const h of holdings) {
      const sector = sectorMap[h.symbol] ?? 'Unknown';
      alloc[sector] = (alloc[sector] ?? 0) + h.marketValue;
    }
    if (totalValue > 0) {
      for (const k in alloc) alloc[k] = alloc[k]! / totalValue * 100;
    }
    return alloc;
  }

  it('应计算NAV', () => {
    const holdings: ETFHoldings[] = [
      { symbol: '001', weight: 0.5, shares: 1000, marketValue: 50000 },
      { symbol: '002', weight: 0.5, shares: 2000, marketValue: 50000 },
    ];
    expect(calcNAV(holdings, 10000)).toBe(10);
  });

  it('零份额NAV应为0', () => {
    expect(calcNAV([], 0)).toBe(0);
  });

  it('应计算跟踪误差', () => {
    const etf = [0.01, 0.02, 0.015, 0.03];
    const bench = [0.01, 0.02, 0.01, 0.03];
    expect(trackingError(etf, bench)).toBeGreaterThan(0);
  });

  it('完美跟踪误差应为0', () => {
    const returns = [0.01, 0.02, 0.03];
    expect(trackingError(returns, returns)).toBe(0);
  });

  it('应计算溢价折价率', () => {
    expect(premiumDiscount(10, 10.5)).toBe(5);
    expect(premiumDiscount(10, 9.5)).toBe(-5);
  });

  it('零NAV溢价应为0', () => {
    expect(premiumDiscount(0, 10)).toBe(0);
  });

  it('应计算集中度', () => {
    const holdings: ETFHoldings[] = Array.from({ length: 20 }, (_, i) => ({
      symbol: `${i}`, weight: 0, shares: 0, marketValue: 1000 - i * 40,
    }));
    const ratio = concentrationRatio(holdings);
    expect(ratio).toBeGreaterThan(0);
    expect(ratio).toBeLessThanOrEqual(100);
  });

  it('应计算行业配置', () => {
    const holdings: ETFHoldings[] = [
      { symbol: 'A', weight: 0, shares: 0, marketValue: 60000 },
      { symbol: 'B', weight: 0, shares: 0, marketValue: 40000 },
    ];
    const sectorMap = { A: 'Tech', B: 'Finance' };
    const alloc = sectorAllocation(holdings, sectorMap);
    expect(alloc['Tech']).toBe(60);
    expect(alloc['Finance']).toBe(40);
  });

  it('空持仓行业配置应为空', () => {
    expect(sectorAllocation([], {})).toEqual({});
  });

  it('大量持仓应正确处理', () => {
    const holdings: ETFHoldings[] = Array.from({ length: 500 }, (_, i) => ({
      symbol: `${i}`, weight: 0, shares: 100, marketValue: 1000,
    }));
    expect(calcNAV(holdings, 500000)).toBe(1);
    expect(concentrationRatio(holdings)).toBeLessThanOrEqual(100);
  });
});

// 分红送转引擎
describe('分红送转引擎', () => {
  interface DividendEvent { date: string; type: 'cash' | 'stock' | 'rights'; ratio: number; amount: number }

  function adjustedPrice(price: number, events: DividendEvent[]): number {
    let adjusted = price;
    for (const e of events) {
      if (e.type === 'cash') adjusted -= e.amount;
      else if (e.type === 'stock') adjusted *= (1 / (1 + e.ratio));
    }
    return adjusted;
  }

  function totalDividendIncome(shares: number, events: DividendEvent[]): number {
    return events.filter(e => e.type === 'cash').reduce((s, e) => s + shares * e.amount, 0);
  }

  function postSplitShares(shares: number, events: DividendEvent[]): number {
    let result = shares;
    for (const e of events) {
      if (e.type === 'stock') result *= (1 + e.ratio);
    }
    return result;
  }

  function dividendYield(price: number, annualDividend: number): number {
    return price > 0 ? annualDividend / price * 100 : 0;
  }

  function exDividendDate(date: string, daysBefore: number = 1): string {
    const d = new Date(date);
    d.setDate(d.getDate() - daysBefore);
    return d.toISOString().split('T')[0]!;
  }

  it('应计算复权价格', () => {
    const events: DividendEvent[] = [
      { date: '2024-01-01', type: 'cash', ratio: 0, amount: 0.5 },
    ];
    expect(adjustedPrice(10, events)).toBe(9.5);
  });

  it('送股应调整价格', () => {
    const events: DividendEvent[] = [
      { date: '2024-01-01', type: 'stock', ratio: 0.5, amount: 0 },
    ];
    expect(adjustedPrice(15, events)).toBeCloseTo(10);
  });

  it('应计算分红收入', () => {
    const events: DividendEvent[] = [
      { date: '2024-01-01', type: 'cash', ratio: 0, amount: 0.5 },
      { date: '2024-07-01', type: 'cash', ratio: 0, amount: 0.3 },
    ];
    expect(totalDividendIncome(1000, events)).toBe(800);
  });

  it('无现金分红收入应为0', () => {
    const events: DividendEvent[] = [
      { date: '2024-01-01', type: 'stock', ratio: 1, amount: 0 },
    ];
    expect(totalDividendIncome(1000, events)).toBe(0);
  });

  it('应计算送股后股数', () => {
    const events: DividendEvent[] = [
      { date: '2024-01-01', type: 'stock', ratio: 0.5, amount: 0 },
    ];
    expect(postSplitShares(1000, events)).toBe(1500);
  });

  it('多次送股应累加', () => {
    const events: DividendEvent[] = [
      { date: '2024-01-01', type: 'stock', ratio: 1, amount: 0 },
      { date: '2024-06-01', type: 'stock', ratio: 0.5, amount: 0 },
    ];
    expect(postSplitShares(1000, events)).toBe(3000);
  });

  it('应计算股息率', () => {
    expect(dividendYield(100, 5)).toBe(5);
  });

  it('零价格股息率应为0', () => {
    expect(dividendYield(0, 5)).toBe(0);
  });

  it('应计算除权除息日', () => {
    expect(exDividendDate('2024-06-15')).toBe('2024-06-14');
  });

  it('大量分红事件应正确处理', () => {
    const events: DividendEvent[] = Array.from({ length: 20 }, (_, i) => ({
      date: `2024-${String(i + 1).padStart(2, '0')}-01`,
      type: 'cash' as const, ratio: 0, amount: 0.1,
    }));
    expect(totalDividendIncome(1000, events)).toBe(2000);
  });
});

// 涨跌停引擎
describe('涨跌停引擎', () => {
  function isLimitUp(price: number, prevClose: number, isST: boolean = false): boolean {
    const limit = isST ? 0.05 : 0.1;
    return Math.abs(price - prevClose * (1 + limit)) < 0.001;
  }

  function isLimitDown(price: number, prevClose: number, isST: boolean = false): boolean {
    const limit = isST ? 0.05 : 0.1;
    return Math.abs(price - prevClose * (1 - limit)) < 0.001;
  }

  function limitPrice(prevClose: number, direction: 'up' | 'down', isST: boolean = false): number {
    const limit = isST ? 0.05 : 0.1;
    return direction === 'up' ? prevClose * (1 + limit) : prevClose * (1 - limit);
  }

  function canTrade(price: number, prevClose: number, side: 'buy' | 'sell', isST: boolean = false): boolean {
    if (side === 'buy') return !isLimitUp(price, prevClose, isST);
    return !isLimitDown(price, prevClose, isST);
  }

  function consecutiveLimitDays(prices: number[], prevClose: number, isST: boolean = false): number {
    let count = 0;
    let reference = prevClose;
    for (const p of prices) {
      if (isLimitUp(p, reference, isST)) { count++; reference = p; }
      else break;
    }
    return count;
  }

  it('应检测涨停', () => {
    expect(isLimitUp(11, 10)).toBe(true);
    expect(isLimitUp(10.5, 10)).toBe(false);
  });

  it('ST股涨停应为5%', () => {
    expect(isLimitUp(10.5, 10, true)).toBe(true);
    expect(isLimitUp(10.8, 10, true)).toBe(false);
  });

  it('应检测跌停', () => {
    expect(isLimitDown(9, 10)).toBe(true);
    expect(isLimitDown(9.5, 10)).toBe(false);
  });

  it('ST股跌停应为5%', () => {
    expect(isLimitDown(9.5, 10, true)).toBe(true);
    expect(isLimitDown(9.2, 10, true)).toBe(false);
  });

  it('应计算涨跌停价', () => {
    expect(limitPrice(10, 'up')).toBe(11);
    expect(limitPrice(10, 'down')).toBe(9);
  });

  it('应判断能否交易', () => {
    expect(canTrade(11, 10, 'buy')).toBe(false);
    expect(canTrade(11, 10, 'sell')).toBe(true);
    expect(canTrade(9, 10, 'sell')).toBe(false);
    expect(canTrade(9, 10, 'buy')).toBe(true);
  });

  it('应计算连续涨停天数', () => {
    expect(consecutiveLimitDays([11, 12.1, 13.31], 10)).toBe(3);
  });

  it('非连续涨停应停止计数', () => {
    expect(consecutiveLimitDays([11, 11.5, 12.65], 10)).toBe(1);
  });

  it('无涨停应返回0', () => {
    expect(consecutiveLimitDays([10.5, 10.8], 10)).toBe(0);
  });

  it('新上市股票涨跌停应为44%', () => {
    function isNewStockLimit(price: number, issuePrice: number): boolean {
      return price >= issuePrice * 1.44;
    }
    expect(isNewStockLimit(14.4, 10)).toBe(true);
    expect(isNewStockLimit(14, 10)).toBe(false);
  });
});
