/**
 * M2 影子治理批次 40a：页面数据逻辑测试 → 生产实现绑定
 *
 * 绑定清单（import 处已标注生产 file:line）：
 * - frontend/src/utils/formatters.ts:24 formatMarketCap —— 市值展示（万亿/亿/万），页面展示层唯一导出实现
 * - frontend/src/utils/formatters.ts:60 formatPercent —— 比率→百分比，回测最大回撤/胜率用
 * - frontend/src/utils/formatters.ts:148 formatChangePercent —— 入参已是百分数的带符号格式化，收益率用
 * - frontend/src/utils/formatters.ts:228 getColorByChange —— A 股红涨绿跌，0/空归灰
 * - frontend/src/utils/formatters.ts:266 formatRelativeTime —— 新闻相对时间（内部 Date.now，用假时钟固定）
 * - backend/src/models/Stock.ts:225 calculateChange / :231 calculateAmplitude —— 涨跌幅/振幅唯一导出实现
 * - frontend/src/utils/newsAggregationEngine.ts:77 filterNews —— 分类/情绪/关键词过滤的生产契约
 * - frontend/src/utils/stockScreener.ts:97 screenByPatterns —— 52 周高点 0.98 阈值、低点 1.05 阈值
 * - frontend/src/utils/etfPremiumDiscountEngine.ts:43 calculatePremiumRate / :51 classifyPremiumStatus
 *
 * 未绑定（生产无同契约导出，保留内联并在各段首注明原因）：
 * 涨跌停价/距涨跌停/量比、热点标签、回测评级与回撤阈值、ETF 聚合与类型标签。
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  formatMarketCap,
  formatPercent,
  formatChangePercent,
  getColorByChange,
  formatRelativeTime,
} from '../utils/formatters';
import { calculateChange, calculateAmplitude } from '../../../backend/src/models/Stock';
import { filterNews, type NewsItem } from '../utils/newsAggregationEngine';
import { screenByPatterns, type StockData } from '../utils/stockScreener';
import { calculatePremiumRate, classifyPremiumStatus } from '../utils/etfPremiumDiscountEngine';

// Stock detail page data processing
describe('Stock Detail Page Logic', () => {
  // 生产无同契约导出：涨跌停价（±10%）、距涨跌停、量比。
  // StockDetailPage.tsx:141-153 是未导出的页面内联副本，backend/src/models/Stock.ts 也未导出，
  // 因此这三项按规格保留内联；change/changePercent/amplitude/color/changeFormatted/marketCapFormatted
  // 全部改由生产函数组合，52 周高低点改由 stockScreener 的技术形态判定。
  const screenerStock = (price: number, high52w: number, low52w: number): StockData => ({
    symbol: '600519', name: '贵州茅台', price, pe: 35, pb: 12, ps: 10, roe: 0.3,
    revenueGrowth: 0.15, profitGrowth: 0.18, debtToEquity: 0.1, dividendYield: 0.02,
    marketCap: 2.3e12, volume: 5e4, avgVolume: 4e4,
    high52w, low52w,
    ma5: price, ma10: price, ma20: price, ma60: price,
    rsi: 50, macd: 0, macdSignal: 0, atr: 5, beta: 1,
    sector: '食品饮料', industry: '白酒',
  });
  const isBreakout52w = (price: number, high52w: number) =>
    screenByPatterns([screenerStock(price, high52w, high52w)], 'breakout_52w').length === 1;
  const isNearSupport = (price: number, low52w: number) =>
    screenByPatterns([screenerStock(price, low52w, low52w)], 'near_support').length === 1;

  const formatStockDetail = (data: {
    symbol: string; name: string; price: number; prevClose: number;
    open: number; high: number; low: number; volume: number;
    turnover: number; marketCap: number; pe: number; pb: number;
    turnoverRate: number; high52w: number; low52w: number;
  }) => {
    const { change, changePercent } = calculateChange(data.price, data.prevClose);
    const amplitude = calculateAmplitude(data.high, data.low, data.prevClose);
    const isUp = change >= 0;
    const color = getColorByChange(change);
    const limitUp = data.prevClose * 1.1;
    const limitDown = data.prevClose * 0.9;
    const distanceToLimitUp = limitUp - data.price;
    const distanceToLimitDown = data.price - limitDown;
    const is52wHigh = isBreakout52w(data.price, data.high52w);
    const is52wLow = isNearSupport(data.price, data.low52w);
    const volumeRatio = data.turnover > 0 ? data.volume / (data.turnover / data.price) : 0;

    return {
      ...data,
      change, changePercent, amplitude, isUp, color,
      limitUp, limitDown, distanceToLimitUp, distanceToLimitDown,
      is52wHigh, is52wLow, volumeRatio,
      changeFormatted: formatChangePercent(changePercent),
      marketCapFormatted: formatMarketCap(data.marketCap),
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
    // 旧断言错在阈值：旧内联用 low52w * 1.02，生产 near_support 用 low52w * 1.05
    // （stockScreener.ts:115），51.5 相对 50 在旧口径下不命中、生产口径下命中。
    const boundary = formatStockDetail({
      symbol: 'TEST', name: 'Test', price: 51.5, prevClose: 52,
      open: 52, high: 53, low: 50, volume: 1000, turnover: 51000,
      marketCap: 1e10, pe: 20, pb: 3, turnoverRate: 0.5,
      high52w: 100, low52w: 50
    });
    expect(boundary.is52wLow).toBe(true);
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
  // 生产无同契约导出：热点标签在 backend/src/api/news.ts:252 的路由处理函数内联计算
  // （tagCount → count 降序 → slice(0, 10)），没有可导入的纯函数；
  // 因此保留内联规格，注意生产上限是 10、旧内联默认 5。
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

  // fixture 改用生产 schema：source/category 是英文枚举，symbols 是数组，时间戳是 number；
  // 旧 fixture 用中文 category（如 '公司动态'）并直接比较字符串，与生产 NewsCategory 不同口径。
  const FIXED_TS = 1700000000000;
  const mockNews: NewsItem[] = [
    { id: '1', title: 'A股大涨', summary: '大盘强势上涨', source: 'media', category: 'industry', sentiment: 'positive', symbols: ['600519'], timestamp: FIXED_TS, importance: 7, tags: ['A股', '大涨'] },
    { id: '2', title: '茅台业绩超预期', summary: '茅台公布财报', source: 'media', category: 'earnings', sentiment: 'positive', symbols: ['600519'], timestamp: FIXED_TS - 3600000, importance: 9, tags: ['茅台', '财报'] },
    { id: '3', title: '央行降息', summary: '央行下调LPR', source: 'regulatory', category: 'policy', sentiment: 'neutral', symbols: [], timestamp: FIXED_TS - 86400000, importance: 8, tags: ['央行', '降息'] },
  ];

  // 相对时间绑定 formatters.ts:266；生产内部实时取当前时间，用假时钟固定基准保证确定性。
  const NOW = new Date('2026-11-04T10:00:00+08:00').getTime();
  const MINUTE = 60 * 1000;
  const HOUR = 60 * MINUTE;
  const DAY = 24 * HOUR;
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(NOW));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('should filter by category', () => {
    // 旧断言错在过滤契约：生产用 categories 数组 + 英文枚举，旧内联用单个中文 category 字符串。
    const result = filterNews(mockNews, { categories: ['earnings'] });
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('2');
  });

  it('should filter by sentiment', () => {
    const result = filterNews(mockNews, { sentiment: 'positive' });
    expect(result).toHaveLength(2);
  });

  it('should filter by keyword', () => {
    // 生产 keywords 是数组且区分大小写（直接 includes），旧内联会 toLowerCase 后再比较。
    const result = filterNews(mockNews, { keywords: ['茅台'] });
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('2');
  });

  it('should combine filters', () => {
    const result = filterNews(mockNews, { categories: ['earnings'], sentiment: 'positive' });
    expect(result).toHaveLength(1);
  });

  it('should return empty when no match', () => {
    const result = filterNews(mockNews, { keywords: ['不存在'] });
    expect(result).toHaveLength(0);
  });

  it('should handle empty filters', () => {
    const result = filterNews(mockNews, {});
    expect(result).toHaveLength(3);
  });

  it('should format relative time 刚刚', () => {
    const result = formatRelativeTime(new Date(NOW - 30000));
    expect(result).toBe('刚刚');
  });

  it('should format relative time 分钟', () => {
    const result = formatRelativeTime(new Date(NOW - 5 * MINUTE));
    expect(result).toBe('5分钟前');
  });

  it('should format relative time 小时', () => {
    const result = formatRelativeTime(new Date(NOW - 2 * HOUR));
    expect(result).toBe('2小时前');
  });

  it('should format relative time 天', () => {
    // 旧断言错在口径：生产 formatRelativeTime 超过 24 小时直接返回 formatDate 日期串，
    // 没有「X天前 / X个月前」分支，因此这里断言 yyyy-MM-dd。
    const result = formatRelativeTime(new Date(NOW - 2 * DAY));
    expect(result).toMatch(/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/);
    expect(result).not.toContain('天前');
  });

  it('should switch from 刚刚 at the 5-minute boundary', () => {
    expect(formatRelativeTime(new Date(NOW - 5 * MINUTE + 1))).toBe('刚刚');
    expect(formatRelativeTime(new Date(NOW - 5 * MINUTE))).toBe('5分钟前');
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
  // 生产无同契约导出：alpha 简单差值（生产 backtestPerformanceAnalyzer.ts:528 走 CAPM 回归再年化，
  // 不是 annualReturn - benchmarkReturn）、回撤颜色阈值 0.2/0.1、sharpe/winRate 评级均无导出，
  // 保留内联规格；百分比字符串与涨跌颜色已绑 formatters。
  const formatBacktestSummary = (result: {
    totalReturn: number; annualReturn: number; maxDrawdown: number;
    sharpeRatio: number; winRate: number; totalTrades: number;
    profitFactor: number; benchmarkReturn: number;
  }) => {
    const alpha = result.annualReturn - result.benchmarkReturn;
    const returnColor = getColorByChange(result.totalReturn);
    const ddColor = result.maxDrawdown > 0.2 ? '#ef4444' : result.maxDrawdown > 0.1 ? '#f59e0b' : '#22c55e';
    const sharpeRating = result.sharpeRatio >= 2 ? '优秀' : result.sharpeRatio >= 1 ? '良好' : result.sharpeRatio >= 0 ? '一般' : '较差';
    const winRateRating = result.winRate >= 0.6 ? '高' : result.winRate >= 0.4 ? '中' : '低';

    return {
      ...result,
      totalReturnPercent: formatChangePercent(result.totalReturn * 100),
      annualReturnPercent: formatChangePercent(result.annualReturn * 100),
      maxDrawdownPercent: formatPercent(result.maxDrawdown),
      sharpeFormatted: result.sharpeRatio.toFixed(2),
      winRatePercent: formatPercent(result.winRate, 1),
      alpha, alphaPercent: formatChangePercent(alpha * 100),
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
    // 旧断言错在零值颜色：旧口径把 totalReturn >= 0 一律判红，生产 getColorByChange
    // 对 0 返回中性灰 #6b7280（formatters.ts:229）。
    expect(result.returnColor).toBe('#6b7280');
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
  // 生产无单一聚合导出：ETFPage.tsx 只导出 hasPremium:47 / hasPrice:51 / sortByPremium:55，
  // etfAnalysisEngine 只导出 analyzeETF/compareETFs/detectArbitrageOpportunities，
  // processETFData 的 total/totalSize/advancers/byType/premiumTop5 没有对应实现，保留内联。
  // 折溢价字段改由 etfPremiumDiscountEngine.calculatePremiumRate 生成，保证与生产口径一致。
  interface ETFData {
    symbol: string; name: string; type: string; nav: number;
    price: number; changePercent: number; premium: number;
    size: number; turnover: number; dividendYield: number;
    managementFee: number; trackingError: number;
  }

  // 生产无同契约导出：formatETFType 对应 ETFPage.tsx:64 的局部常量 typeLabels（未导出），
  // 且其 color 是 AntD 色名 blue/orange/purple/gold/green/cyan，不是本测试的 hex 口径，
  // 属同名不同口径，不能硬绑，保留内联。
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

  // 旧 fixture 的 premium 是手写值（0.44/0.91 等），与生产 (price - nav) / nav * 100 差 0.0009；
  // 改为直接调用生产函数生成，断言随之收紧到 4 位小数。
  const mockETFs: ETFData[] = [
    { symbol: '510300', name: '沪深300ETF', type: 'index', nav: 4.5, price: 4.52, changePercent: 1.2, premium: calculatePremiumRate(4.52, 4.5), size: 500e8, turnover: 20e8, dividendYield: 2, managementFee: 0.5, trackingError: 0.05 },
    { symbol: '510500', name: '中证500ETF', type: 'index', nav: 6.2, price: 6.15, changePercent: -0.8, premium: calculatePremiumRate(6.15, 6.2), size: 300e8, turnover: 10e8, dividendYield: 1.5, managementFee: 0.5, trackingError: 0.08 },
    { symbol: '159915', name: '创业板ETF', type: 'index', nav: 2.8, price: 2.82, changePercent: 2.5, premium: calculatePremiumRate(2.82, 2.8), size: 200e8, turnover: 8e8, dividendYield: 0.8, managementFee: 0.5, trackingError: 0.06 },
    { symbol: '512880', name: '证券ETF', type: 'sector', nav: 1.1, price: 1.09, changePercent: -1.5, premium: calculatePremiumRate(1.09, 1.1), size: 150e8, turnover: 5e8, dividendYield: 1, managementFee: 0.5, trackingError: 0.1 },
    { symbol: '518880', name: '黄金ETF', type: 'commodity', nav: 5.5, price: 5.55, changePercent: 0.5, premium: calculatePremiumRate(5.55, 5.5), size: 100e8, turnover: 3e8, dividendYield: 0, managementFee: 0.6, trackingError: 0.03 },
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
    // 旧断言 toBe(0.91) 是手写近似值，生产口径 (5.55 - 5.5) / 5.5 * 100 = 0.90909...
    expect(result.premiumTop5[0].premium).toBeCloseTo(0.9091, 4);
  });

  it('should calculate discount top5', () => {
    const result = processETFData(mockETFs);
    expect(result.discountTop5[0].symbol).toBe('512880');
    expect(result.discountTop5[0].premium).toBeCloseTo(-0.9091, 4);
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

  it('should derive premium and status with production engine', () => {
    const rate = calculatePremiumRate(4.52, 4.5);
    expect(rate).toBeCloseTo(0.4444, 3);
    expect(classifyPremiumStatus(rate)).toBe('par');
    expect(classifyPremiumStatus(calculatePremiumRate(1.2, 1.0))).toBe('premium');
    expect(classifyPremiumStatus(calculatePremiumRate(0.8, 1.0))).toBe('discount');
  });
});
