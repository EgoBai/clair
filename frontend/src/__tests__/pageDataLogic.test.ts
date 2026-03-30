import { describe, it, expect } from 'vitest';

// Stock detail page data processing
describe('Stock Detail Page Logic', () => {
  const formatStockDetail = (data: {
    symbol: string; name: string; price: number; prevClose: number;
    open: number; high: number; low: number; volume: number;
    turnover: number; marketCap: number; pe: number; pb: number;
    turnoverRate: number; high52w: number; low52w: number;
  }) => {
    const change = data.price - data.prevClose;
    const changePercent = data.prevClose > 0 ? (change / data.prevClose) * 100 : 0;
    const amplitude = data.prevClose > 0 ? ((data.high - data.low) / data.prevClose) * 100 : 0;
    const isUp = change >= 0;
    const color = change > 0 ? '#ef4444' : change < 0 ? '#22c55e' : '#6b7280';
    const limitUp = data.prevClose * 1.1;
    const limitDown = data.prevClose * 0.9;
    const distanceToLimitUp = limitUp - data.price;
    const distanceToLimitDown = data.price - limitDown;
    const is52wHigh = data.price >= data.high52w * 0.98;
    const is52wLow = data.price <= data.low52w * 1.02;
    const volumeRatio = data.turnover > 0 ? data.volume / (data.turnover / data.price) : 0;

    return {
      ...data,
      change, changePercent, amplitude, isUp, color,
      limitUp, limitDown, distanceToLimitUp, distanceToLimitDown,
      is52wHigh, is52wLow, volumeRatio,
      changeFormatted: `${isUp ? '+' : ''}${changePercent.toFixed(2)}%`,
      marketCapFormatted: data.marketCap >= 1e12
        ? `${(data.marketCap / 1e12).toFixed(2)}万亿`
        : data.marketCap >= 1e8
          ? `${(data.marketCap / 1e8).toFixed(2)}亿`
          : `${data.marketCap}`,
    };
  };

  it('should format bullish stock detail', () => {
    const result = formatStockDetail({
      symbol: '600519', name: '贵州茅台', price: 1850, prevClose: 1800,
      open: 1810, high: 1860, low: 1800, volume: 50000, turnover: 9e10,
      marketCap: 2.3e12, pe: 35, pb: 12, turnoverRate: 0.5,
      high52w: 2000, low52w: 1500
    });
    expect(result.isUp).toBe(true);
    expect(result.color).toBe('#ef4444');
    expect(result.changePercent).toBeCloseTo(2.78, 1);
  });

  it('should format bearish stock detail', () => {
    const result = formatStockDetail({
      symbol: '000001', name: '平安银行', price: 12, prevClose: 12.5,
      open: 12.4, high: 12.5, low: 11.8, volume: 1e8, turnover: 1.2e9,
      marketCap: 2e11, pe: 8, pb: 0.8, turnoverRate: 1.2,
      high52w: 15, low52w: 10
    });
    expect(result.isUp).toBe(false);
    expect(result.color).toBe('#22c55e');
    expect(result.change).toBeLessThan(0);
  });

  it('should calculate limit prices', () => {
    const result = formatStockDetail({
      symbol: '600519', name: 'Test', price: 100, prevClose: 100,
      open: 100, high: 105, low: 95, volume: 1000, turnover: 100000,
      marketCap: 1e10, pe: 20, pb: 3, turnoverRate: 0.5,
      high52w: 110, low52w: 90
    });
    expect(result.limitUp).toBeCloseTo(110, 1);
    expect(result.limitDown).toBeCloseTo(90, 1);
  });

  it('should detect 52-week high', () => {
    const result = formatStockDetail({
      symbol: 'TEST', name: 'Test', price: 199, prevClose: 195,
      open: 196, high: 200, low: 194, volume: 1000, turnover: 195000,
      marketCap: 1e10, pe: 20, pb: 3, turnoverRate: 0.5,
      high52w: 200, low52w: 100
    });
    expect(result.is52wHigh).toBe(true);
    expect(result.is52wLow).toBe(false);
  });

  it('should detect 52-week low', () => {
    const result = formatStockDetail({
      symbol: 'TEST', name: 'Test', price: 51, prevClose: 52,
      open: 52, high: 53, low: 50, volume: 1000, turnover: 51000,
      marketCap: 1e10, pe: 20, pb: 3, turnoverRate: 0.5,
      high52w: 100, low52w: 50
    });
    expect(result.is52wLow).toBe(true);
  });

  it('should format market cap in 万亿', () => {
    const result = formatStockDetail({
      symbol: '601398', name: '工商银行', price: 5, prevClose: 5,
      open: 5, high: 5.1, low: 4.9, volume: 1e8, turnover: 5e8,
      marketCap: 2e12, pe: 6, pb: 0.8, turnoverRate: 0.3,
      high52w: 6, low52w: 4
    });
    expect(result.marketCapFormatted).toContain('万亿');
  });

  it('should format market cap in 亿', () => {
    const result = formatStockDetail({
      symbol: 'TEST', name: 'Test', price: 10, prevClose: 10,
      open: 10, high: 10.5, low: 9.5, volume: 1000, turnover: 10000,
      marketCap: 5e10, pe: 15, pb: 2, turnoverRate: 0.5,
      high52w: 12, low52w: 8
    });
    expect(result.marketCapFormatted).toContain('亿');
  });

  it('should calculate amplitude', () => {
    const result = formatStockDetail({
      symbol: 'TEST', name: 'Test', price: 100, prevClose: 100,
      open: 100, high: 110, low: 90, volume: 1000, turnover: 100000,
      marketCap: 1e10, pe: 20, pb: 3, turnoverRate: 0.5,
      high52w: 110, low52w: 90
    });
    expect(result.amplitude).toBe(20);
  });

  it('should calculate distance to limits', () => {
    const result = formatStockDetail({
      symbol: 'TEST', name: 'Test', price: 105, prevClose: 100,
      open: 101, high: 106, low: 100, volume: 1000, turnover: 105000,
      marketCap: 1e10, pe: 20, pb: 3, turnoverRate: 0.5,
      high52w: 110, low52w: 90
    });
    expect(result.distanceToLimitUp).toBeCloseTo(5, 0);
    expect(result.distanceToLimitDown).toBeCloseTo(15, 0);
  });

  it('should handle zero prevClose', () => {
    const result = formatStockDetail({
      symbol: 'TEST', name: 'Test', price: 10, prevClose: 0,
      open: 10, high: 10, low: 10, volume: 0, turnover: 0,
      marketCap: 1e10, pe: 0, pb: 0, turnoverRate: 0,
      high52w: 10, low52w: 10
    });
    expect(result.changePercent).toBe(0);
    expect(result.amplitude).toBe(0);
  });

  it('should format change string correctly', () => {
    const up = formatStockDetail({
      symbol: 'T', name: 'T', price: 105, prevClose: 100,
      open: 101, high: 106, low: 100, volume: 1000, turnover: 105000,
      marketCap: 1e10, pe: 20, pb: 3, turnoverRate: 0.5,
      high52w: 110, low52w: 90
    });
    expect(up.changeFormatted).toContain('+');

    const down = formatStockDetail({
      symbol: 'T', name: 'T', price: 95, prevClose: 100,
      open: 99, high: 100, low: 94, volume: 1000, turnover: 95000,
      marketCap: 1e10, pe: 20, pb: 3, turnoverRate: 0.5,
      high52w: 110, low52w: 90
    });
    expect(down.changeFormatted).not.toContain('+');
    expect(down.changeFormatted).toContain('%');
  });
});

// News page data processing
describe('News Page Logic', () => {
  interface NewsItem {
    id: string; title: string; summary: string; category: string;
    sentiment: 'positive' | 'negative' | 'neutral';
    source: string; publishedAt: Date; viewCount: number;
    tags: string[]; relatedStocks: string[];
  }

  const filterNews = (news: NewsItem[], filters: {
    category?: string; sentiment?: string; keyword?: string;
  }) => {
    return news.filter(n => {
      if (filters.category && n.category !== filters.category) return false;
      if (filters.sentiment && n.sentiment !== filters.sentiment) return false;
      if (filters.keyword) {
        const kw = filters.keyword.toLowerCase();
        if (!n.title.toLowerCase().includes(kw) && !n.summary.toLowerCase().includes(kw)) return false;
      }
      return true;
    });
  };

  const getRelativeTime = (date: Date, now: Date) => {
    const diff = now.getTime() - date.getTime();
    const mins = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);
    if (mins < 1) return '刚刚';
    if (mins < 60) return `${mins}分钟前`;
    if (hours < 24) return `${hours}小时前`;
    if (days < 30) return `${days}天前`;
    return `${Math.floor(days / 30)}个月前`;
  };

  const getHotTags = (news: NewsItem[], limit = 5) => {
    const tagCount = new Map<string, number>();
    for (const n of news) {
      for (const tag of n.tags) {
        tagCount.set(tag, (tagCount.get(tag) || 0) + 1);
      }
    }
    return [...tagCount.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit)
      .map(([tag, count]) => ({ tag, count }));
  };

  const mockNews: NewsItem[] = [
    { id: '1', title: 'A股大涨', summary: '大盘强势上涨', category: '大盘行情', sentiment: 'positive', source: '财新', publishedAt: new Date(Date.now() - 60000), viewCount: 10000, tags: ['A股', '大涨'], relatedStocks: ['600519'] },
    { id: '2', title: '茅台业绩超预期', summary: '茅台公布财报', category: '公司动态', sentiment: 'positive', source: '证券时报', publishedAt: new Date(Date.now() - 3600000), viewCount: 5000, tags: ['茅台', '财报'], relatedStocks: ['600519'] },
    { id: '3', title: '央行降息', summary: '央行下调LPR', category: '政策法规', sentiment: 'neutral', source: '央行', publishedAt: new Date(Date.now() - 86400000), viewCount: 8000, tags: ['央行', '降息'], relatedStocks: [] },
  ];

  it('should filter by category', () => {
    const result = filterNews(mockNews, { category: '公司动态' });
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('2');
  });

  it('should filter by sentiment', () => {
    const result = filterNews(mockNews, { sentiment: 'positive' });
    expect(result).toHaveLength(2);
  });

  it('should filter by keyword', () => {
    const result = filterNews(mockNews, { keyword: '茅台' });
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('2');
  });

  it('should combine filters', () => {
    const result = filterNews(mockNews, { category: '公司动态', sentiment: 'positive' });
    expect(result).toHaveLength(1);
  });

  it('should return empty when no match', () => {
    const result = filterNews(mockNews, { keyword: '不存在' });
    expect(result).toHaveLength(0);
  });

  it('should handle empty filters', () => {
    const result = filterNews(mockNews, {});
    expect(result).toHaveLength(3);
  });

  it('should format relative time 刚刚', () => {
    const result = getRelativeTime(new Date(Date.now() - 30000), new Date());
    expect(result).toBe('刚刚');
  });

  it('should format relative time 分钟', () => {
    const result = getRelativeTime(new Date(Date.now() - 300000), new Date());
    expect(result).toContain('分钟前');
  });

  it('should format relative time 小时', () => {
    const result = getRelativeTime(new Date(Date.now() - 7200000), new Date());
    expect(result).toContain('小时前');
  });

  it('should format relative time 天', () => {
    const result = getRelativeTime(new Date(Date.now() - 172800000), new Date());
    expect(result).toContain('天前');
  });

  it('should get hot tags', () => {
    const tags = getHotTags(mockNews);
    expect(tags.length).toBeGreaterThan(0);
    expect(tags.length).toBeLessThanOrEqual(5);
  });

  it('should sort hot tags by count', () => {
    const tags = getHotTags(mockNews);
    for (let i = 1; i < tags.length; i++) {
      expect(tags[i - 1].count).toBeGreaterThanOrEqual(tags[i].count);
    }
  });

  it('should handle limit parameter for tags', () => {
    const tags = getHotTags(mockNews, 2);
    expect(tags.length).toBeLessThanOrEqual(2);
  });
});

// Backtest page data formatting
describe('Backtest Page Logic', () => {
  const formatBacktestSummary = (result: {
    totalReturn: number; annualReturn: number; maxDrawdown: number;
    sharpeRatio: number; winRate: number; totalTrades: number;
    profitFactor: number; benchmarkReturn: number;
  }) => {
    const alpha = result.annualReturn - result.benchmarkReturn;
    const returnColor = result.totalReturn >= 0 ? '#ef4444' : '#22c55e';
    const ddColor = result.maxDrawdown > 0.2 ? '#ef4444' : result.maxDrawdown > 0.1 ? '#f59e0b' : '#22c55e';
    const sharpeRating = result.sharpeRatio >= 2 ? '优秀' : result.sharpeRatio >= 1 ? '良好' : result.sharpeRatio >= 0 ? '一般' : '较差';
    const winRateRating = result.winRate >= 0.6 ? '高' : result.winRate >= 0.4 ? '中' : '低';

    return {
      ...result,
      totalReturnPercent: `${result.totalReturn >= 0 ? '+' : ''}${(result.totalReturn * 100).toFixed(2)}%`,
      annualReturnPercent: `${result.annualReturn >= 0 ? '+' : ''}${(result.annualReturn * 100).toFixed(2)}%`,
      maxDrawdownPercent: `${(result.maxDrawdown * 100).toFixed(2)}%`,
      sharpeFormatted: result.sharpeRatio.toFixed(2),
      winRatePercent: `${(result.winRate * 100).toFixed(1)}%`,
      alpha, alphaPercent: `${alpha >= 0 ? '+' : ''}${(alpha * 100).toFixed(2)}%`,
      returnColor, ddColor, sharpeRating, winRateRating,
    };
  };

  it('should format positive return', () => {
    const result = formatBacktestSummary({
      totalReturn: 0.15, annualReturn: 0.12, maxDrawdown: 0.08,
      sharpeRatio: 1.5, winRate: 0.55, totalTrades: 50,
      profitFactor: 1.8, benchmarkReturn: 0.05
    });
    expect(result.totalReturnPercent).toContain('+');
    expect(result.totalReturnPercent).toContain('15');
  });

  it('should format negative return', () => {
    const result = formatBacktestSummary({
      totalReturn: -0.1, annualReturn: -0.08, maxDrawdown: 0.25,
      sharpeRatio: -0.5, winRate: 0.35, totalTrades: 30,
      profitFactor: 0.8, benchmarkReturn: 0.05
    });
    expect(result.totalReturnPercent).not.toContain('+');
    expect(result.returnColor).toBe('#22c55e');
  });

  it('should calculate alpha', () => {
    const result = formatBacktestSummary({
      totalReturn: 0.2, annualReturn: 0.15, maxDrawdown: 0.1,
      sharpeRatio: 2, winRate: 0.6, totalTrades: 40,
      profitFactor: 2.5, benchmarkReturn: 0.08
    });
    expect(result.alpha).toBeCloseTo(0.07, 2);
    expect(result.alphaPercent).toContain('+');
  });

  it('should rate Sharpe correctly', () => {
    const excellent = formatBacktestSummary({
      totalReturn: 0.3, annualReturn: 0.2, maxDrawdown: 0.05,
      sharpeRatio: 2.5, winRate: 0.7, totalTrades: 50,
      profitFactor: 3, benchmarkReturn: 0.05
    });
    expect(excellent.sharpeRating).toBe('优秀');

    const poor = formatBacktestSummary({
      totalReturn: -0.1, annualReturn: -0.05, maxDrawdown: 0.3,
      sharpeRatio: -0.5, winRate: 0.3, totalTrades: 20,
      profitFactor: 0.5, benchmarkReturn: 0.05
    });
    expect(poor.sharpeRating).toBe('较差');
  });

  it('should color drawdown by severity', () => {
    const high = formatBacktestSummary({
      totalReturn: 0, annualReturn: 0, maxDrawdown: 0.3,
      sharpeRatio: 0, winRate: 0.5, totalTrades: 10,
      profitFactor: 1, benchmarkReturn: 0
    });
    expect(high.ddColor).toBe('#ef4444');

    const low = formatBacktestSummary({
      totalReturn: 0, annualReturn: 0, maxDrawdown: 0.05,
      sharpeRatio: 0, winRate: 0.5, totalTrades: 10,
      profitFactor: 1, benchmarkReturn: 0
    });
    expect(low.ddColor).toBe('#22c55e');
  });

  it('should rate win rate', () => {
    const high = formatBacktestSummary({
      totalReturn: 0, annualReturn: 0, maxDrawdown: 0.1,
      sharpeRatio: 1, winRate: 0.7, totalTrades: 30,
      profitFactor: 2, benchmarkReturn: 0
    });
    expect(high.winRateRating).toBe('高');

    const low = formatBacktestSummary({
      totalReturn: 0, annualReturn: 0, maxDrawdown: 0.1,
      sharpeRatio: 0, winRate: 0.3, totalTrades: 30,
      profitFactor: 0.5, benchmarkReturn: 0
    });
    expect(low.winRateRating).toBe('低');
  });

  it('should handle zero values', () => {
    const result = formatBacktestSummary({
      totalReturn: 0, annualReturn: 0, maxDrawdown: 0,
      sharpeRatio: 0, winRate: 0, totalTrades: 0,
      profitFactor: 0, benchmarkReturn: 0
    });
    expect(result.totalReturnPercent).toContain('0');
    expect(result.alpha).toBe(0);
  });

  it('should handle decimal percentages', () => {
    const result = formatBacktestSummary({
      totalReturn: 0.0333, annualReturn: 0.025, maxDrawdown: 0.015,
      sharpeRatio: 0.8, winRate: 0.523, totalTrades: 15,
      profitFactor: 1.3, benchmarkReturn: 0.02
    });
    expect(result.winRatePercent).toContain('52.3');
    expect(result.maxDrawdownPercent).toContain('1.50');
  });

  it('should handle large Sharpe', () => {
    const result = formatBacktestSummary({
      totalReturn: 1, annualReturn: 0.5, maxDrawdown: 0.02,
      sharpeRatio: 5, winRate: 0.9, totalTrades: 100,
      profitFactor: 10, benchmarkReturn: 0.05
    });
    expect(result.sharpeRating).toBe('优秀');
    expect(result.sharpeFormatted).toBe('5.00');
  });
});

// ETF page data processing
describe('ETF Page Logic', () => {
  interface ETFData {
    symbol: string; name: string; type: string; nav: number;
    price: number; changePercent: number; premium: number;
    size: number; turnover: number; dividendYield: number;
    managementFee: number; trackingError: number;
  }

  const processETFData = (etfs: ETFData[]) => {
    const totalSize = etfs.reduce((s, e) => s + e.size, 0);
    const avgChange = etfs.length > 0
      ? etfs.reduce((s, e) => s + e.changePercent, 0) / etfs.length : 0;
    const advancers = etfs.filter(e => e.changePercent > 0).length;
    const decliners = etfs.filter(e => e.changePercent < 0).length;

    const byType = new Map<string, ETFData[]>();
    for (const etf of etfs) {
      const arr = byType.get(etf.type) || [];
      arr.push(etf);
      byType.set(etf.type, arr);
    }

    const premiumTop5 = [...etfs].sort((a, b) => b.premium - a.premium).slice(0, 5);
    const discountTop5 = [...etfs].sort((a, b) => a.premium - b.premium).slice(0, 5);

    return {
      total: etfs.length, totalSize, avgChange, advancers, decliners,
      byType: Object.fromEntries(byType),
      premiumTop5, discountTop5,
      avgSize: etfs.length > 0 ? totalSize / etfs.length : 0,
    };
  };

  const formatETFType = (type: string) => {
    const map: Record<string, { label: string; color: string }> = {
      index: { label: '指数型', color: '#3b82f6' },
      sector: { label: '行业型', color: '#8b5cf6' },
      qdii: { label: 'QDII', color: '#f59e0b' },
      commodity: { label: '商品型', color: '#ef4444' },
      bond: { label: '债券型', color: '#22c55e' },
    };
    return map[type] || { label: type, color: '#6b7280' };
  };

  const mockETFs: ETFData[] = [
    { symbol: '510300', name: '沪深300ETF', type: 'index', nav: 4.5, price: 4.52, changePercent: 1.2, premium: 0.44, size: 500e8, turnover: 20e8, dividendYield: 2, managementFee: 0.5, trackingError: 0.05 },
    { symbol: '510500', name: '中证500ETF', type: 'index', nav: 6.2, price: 6.15, changePercent: -0.8, premium: -0.81, size: 300e8, turnover: 10e8, dividendYield: 1.5, managementFee: 0.5, trackingError: 0.08 },
    { symbol: '159915', name: '创业板ETF', type: 'index', nav: 2.8, price: 2.82, changePercent: 2.5, premium: 0.71, size: 200e8, turnover: 8e8, dividendYield: 0.8, managementFee: 0.5, trackingError: 0.06 },
    { symbol: '512880', name: '证券ETF', type: 'sector', nav: 1.1, price: 1.09, changePercent: -1.5, premium: -0.91, size: 150e8, turnover: 5e8, dividendYield: 1, managementFee: 0.5, trackingError: 0.1 },
    { symbol: '518880', name: '黄金ETF', type: 'commodity', nav: 5.5, price: 5.55, changePercent: 0.5, premium: 0.91, size: 100e8, turnover: 3e8, dividendYield: 0, managementFee: 0.6, trackingError: 0.03 },
  ];

  it('should process ETF summary', () => {
    const result = processETFData(mockETFs);
    expect(result.total).toBe(5);
    expect(result.advancers).toBe(3);
    expect(result.decliners).toBe(2);
  });

  it('should calculate total size', () => {
    const result = processETFData(mockETFs);
    expect(result.totalSize).toBe(1250e8);
  });

  it('should calculate average change', () => {
    const result = processETFData(mockETFs);
    expect(result.avgChange).toBeCloseTo(0.38, 1);
  });

  it('should group by type', () => {
    const result = processETFData(mockETFs);
    expect(result.byType['index']).toHaveLength(3);
    expect(result.byType['sector']).toHaveLength(1);
    expect(result.byType['commodity']).toHaveLength(1);
  });

  it('should calculate premium top5', () => {
    const result = processETFData(mockETFs);
    expect(result.premiumTop5[0].symbol).toBe('518880');
    expect(result.premiumTop5[0].premium).toBe(0.91);
  });

  it('should calculate discount top5', () => {
    const result = processETFData(mockETFs);
    expect(result.discountTop5[0].symbol).toBe('512880');
    expect(result.discountTop5[0].premium).toBe(-0.91);
  });

  it('should handle empty array', () => {
    const result = processETFData([]);
    expect(result.total).toBe(0);
    expect(result.avgChange).toBe(0);
    expect(result.advancers).toBe(0);
  });

  it('should calculate average size', () => {
    const result = processETFData(mockETFs);
    expect(result.avgSize).toBe(250e8);
  });

  it('should format ETF type correctly', () => {
    const index = formatETFType('index');
    expect(index.label).toBe('指数型');
    expect(index.color).toBe('#3b82f6');

    const unknown = formatETFType('unknown');
    expect(unknown.label).toBe('unknown');
    expect(unknown.color).toBe('#6b7280');
  });

  it('should format all known types', () => {
    const types = ['index', 'sector', 'qdii', 'commodity', 'bond'];
    for (const type of types) {
      const result = formatETFType(type);
      expect(result.label).toBeTruthy();
      expect(result.color).toBeTruthy();
    }
  });

  it('should handle single ETF', () => {
    const result = processETFData([mockETFs[0]]);
    expect(result.total).toBe(1);
    expect(result.advancers + result.decliners).toBe(1);
  });

  it('should sort premium correctly', () => {
    const result = processETFData(mockETFs);
    for (let i = 1; i < result.premiumTop5.length; i++) {
      expect(result.premiumTop5[i - 1].premium).toBeGreaterThanOrEqual(result.premiumTop5[i].premium);
    }
  });
});
