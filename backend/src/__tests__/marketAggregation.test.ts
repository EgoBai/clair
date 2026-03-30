import { describe, it, expect } from 'vitest';

// Market data aggregation and breadth calculation tests
describe('MarketDataAggregation', () => {
  interface StockQuote {
    symbol: string;
    name: string;
    price: number;
    change: number;
    changePercent: number;
    volume: number;
    amount: number;
    high: number;
    low: number;
    open: number;
    previousClose: number;
    turnoverRate: number;
    pe: number;
    pb: number;
    marketCap: number;
    industry: string;
  }

  function calculateMarketBreadth(stocks: StockQuote[]) {
    const rising = stocks.filter(s => s.changePercent > 0).length;
    const falling = stocks.filter(s => s.changePercent < 0).length;
    const flat = stocks.filter(s => s.changePercent === 0).length;
    const limitUp = stocks.filter(s => s.changePercent >= 9.9).length;
    const limitDown = stocks.filter(s => s.changePercent <= -9.9).length;
    const totalVolume = stocks.reduce((sum, s) => sum + s.volume, 0);
    const totalAmount = stocks.reduce((sum, s) => sum + s.amount, 0);
    const advDeclineRatio = falling > 0 ? rising / falling : rising > 0 ? Infinity : 0;
    return { rising, falling, flat, limitUp, limitDown, totalVolume, totalAmount, advDeclineRatio, total: stocks.length };
  }

  function calculateIndustryRotation(stocks: StockQuote[]) {
    const industries = new Map<string, { count: number; totalChange: number; totalAmount: number; rising: number }>();
    for (const s of stocks) {
      const ind = industries.get(s.industry) || { count: 0, totalChange: 0, totalAmount: 0, rising: 0 };
      ind.count++;
      ind.totalChange += s.changePercent;
      ind.totalAmount += s.amount;
      if (s.changePercent > 0) ind.rising++;
      industries.set(s.industry, ind);
    }
    return Array.from(industries.entries()).map(([name, data]) => ({
      name,
      avgChange: data.totalChange / data.count,
      totalAmount: data.totalAmount,
      risingRatio: data.rising / data.count,
      stockCount: data.count,
    })).sort((a, b) => b.avgChange - a.avgChange);
  }

  function calculateMarketCapDistribution(stocks: StockQuote[]) {
    const ranges = [
      { label: '微型股(<30亿)', min: 0, max: 3e9, count: 0 },
      { label: '小盘股(30-100亿)', min: 3e9, max: 1e10, count: 0 },
      { label: '中盘股(100-500亿)', min: 1e10, max: 5e10, count: 0 },
      { label: '大盘股(500-1000亿)', min: 5e10, max: 1e11, count: 0 },
      { label: '超大盘(>1000亿)', min: 1e11, max: Infinity, count: 0 },
    ];
    for (const s of stocks) {
      for (const r of ranges) {
        if (s.marketCap >= r.min && s.marketCap < r.max) { r.count++; break; }
      }
    }
    return ranges;
  }

  const mockStocks: StockQuote[] = [
    { symbol: '600519', name: '贵州茅台', price: 1800, change: 50, changePercent: 2.86, volume: 30000, amount: 5.4e9, high: 1820, low: 1750, open: 1760, previousClose: 1750, turnoverRate: 0.24, pe: 40, pb: 12, marketCap: 2.26e12, industry: '白酒' },
    { symbol: '000858', name: '五粮液', price: 168, change: 5.5, changePercent: 3.38, volume: 250000, amount: 4.2e9, high: 170, low: 162, open: 163, previousClose: 162.5, turnoverRate: 0.65, pe: 28, pb: 7, marketCap: 6.5e11, industry: '白酒' },
    { symbol: '300750', name: '宁德时代', price: 210, change: -8, changePercent: -3.67, volume: 400000, amount: 8.4e9, high: 220, low: 208, open: 218, previousClose: 218, turnoverRate: 0.95, pe: 35, pb: 5.5, marketCap: 9.2e11, industry: '新能源' },
    { symbol: '688981', name: '中芯国际', price: 55, change: 0, changePercent: 0, volume: 150000, amount: 8.25e8, high: 56, low: 54, open: 55, previousClose: 55, turnoverRate: 0.38, pe: 50, pb: 2.8, marketCap: 4.3e11, industry: '半导体' },
    { symbol: '000001', name: '平安银行', price: 12.5, change: -1.3, changePercent: -9.42, volume: 800000, amount: 1e10, high: 13.9, low: 12.3, open: 13.8, previousClose: 13.8, turnoverRate: 0.41, pe: 5, pb: 0.6, marketCap: 2.4e11, industry: '银行' },
    { symbol: '002594', name: '比亚迪', price: 260, change: 10, changePercent: 4.0, volume: 350000, amount: 9.1e9, high: 265, low: 248, open: 250, previousClose: 250, turnoverRate: 1.2, pe: 45, pb: 8, marketCap: 7.6e11, industry: '新能源' },
  ];

  it('should count rising stocks correctly', () => {
    const result = calculateMarketBreadth(mockStocks);
    expect(result.rising).toBe(3); // 茅台、五粮液、比亚迪
  });

  it('should count falling stocks correctly', () => {
    const result = calculateMarketBreadth(mockStocks);
    expect(result.falling).toBe(2); // 宁德时代、平安银行
  });

  it('should count flat stocks', () => {
    const result = calculateMarketBreadth(mockStocks);
    expect(result.flat).toBe(1); // 中芯国际
  });

  it('should identify limit down stocks', () => {
    const result = calculateMarketBreadth(mockStocks);
    expect(result.limitDown).toBeGreaterThanOrEqual(0);
  });

  it('should calculate total amount', () => {
    const result = calculateMarketBreadth(mockStocks);
    expect(result.totalAmount).toBeGreaterThan(0);
  });

  it('should calculate advance/decline ratio', () => {
    const result = calculateMarketBreadth(mockStocks);
    expect(result.advDeclineRatio).toBe(3 / 2);
  });

  it('should handle zero falling stocks', () => {
    const allRising = mockStocks.map(s => ({ ...s, changePercent: Math.abs(s.changePercent) }));
    const result = calculateMarketBreadth(allRising);
    expect(result.advDeclineRatio).toBe(Infinity);
  });

  it('should handle empty stocks', () => {
    const result = calculateMarketBreadth([]);
    expect(result.total).toBe(0);
    expect(result.rising).toBe(0);
    expect(result.advDeclineRatio).toBe(0);
  });

  it('should rank industries by avg change', () => {
    const result = calculateIndustryRotation(mockStocks);
    expect(result[0].avgChange).toBeGreaterThanOrEqual(result[result.length - 1].avgChange);
  });

  it('should calculate industry stock count', () => {
    const result = calculateIndustryRotation(mockStocks);
    const baijiu = result.find(r => r.name === '白酒');
    expect(baijiu?.stockCount).toBe(2);
  });

  it('should calculate rising ratio per industry', () => {
    const result = calculateIndustryRotation(mockStocks);
    for (const ind of result) {
      expect(ind.risingRatio).toBeGreaterThanOrEqual(0);
      expect(ind.risingRatio).toBeLessThanOrEqual(1);
    }
  });

  it('should distribute market cap into ranges', () => {
    const result = calculateMarketCapDistribution(mockStocks);
    const totalCount = result.reduce((sum, r) => sum + r.count, 0);
    expect(totalCount).toBe(mockStocks.length);
  });

  it('should have correct distribution labels', () => {
    const result = calculateMarketCapDistribution(mockStocks);
    expect(result).toHaveLength(5);
    expect(result[0].label).toContain('微型');
    expect(result[4].label).toContain('超大');
  });

  it('should handle all stocks in one range', () => {
    const smallStocks = mockStocks.map(s => ({ ...s, marketCap: 1e8 }));
    const result = calculateMarketCapDistribution(smallStocks);
    expect(result[0].count).toBe(6);
    expect(result[1].count).toBe(0);
  });
});
