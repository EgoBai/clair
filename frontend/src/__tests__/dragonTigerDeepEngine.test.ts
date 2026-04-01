import { describe, it, expect } from 'vitest';

// 龙虎榜深度分析引擎
interface DragonTigerEntry {
  symbol: string;
  name: string;
  reason: string;
  buyAmount: number;
  sellAmount: number;
  netAmount: number;
  buySeats: string[];
  sellSeats: string[];
  price: number;
  changePercent: number;
  date: string;
}

interface DragonTigerAnalysis {
  symbol: string;
  institutionalBuy: number;
  institutionalSell: number;
  hotMoneyBuy: number;
  hotMoneySell: number;
  netInstitutional: number;
  netHotMoney: number;
  signal: 'bullish' | 'bearish' | 'neutral';
  confidence: number;
  followUpProbability: number;
}

const INSTITUTIONAL_KEYWORDS = ['机构专用', '沪股通专用', '深股通专用', 'QFII'];
const HOT_MONEY_SEATS = ['东方财富', '华泰证券', '国泰君安', '中信证券'];

function classifySeats(seats: string[]): { institutional: string[]; hotMoney: string[] } {
  const institutional: string[] = [];
  const hotMoney: string[] = [];
  seats.forEach(s => {
    if (INSTITUTIONAL_KEYWORDS.some(k => s.includes(k))) institutional.push(s);
    else if (HOT_MONEY_SEATS.some(k => s.includes(k))) hotMoney.push(s);
  });
  return { institutional, hotMoney };
}

function analyzeDragonTiger(entries: DragonTigerEntry[]): DragonTigerAnalysis[] {
  return entries.map(entry => {
    const buyClass = classifySeats(entry.buySeats);
    const sellClass = classifySeats(entry.sellSeats);

    const instRatio = buyClass.institutional.length / (entry.buySeats.length || 1);
    const hotRatio = buyClass.hotMoney.length / (entry.buySeats.length || 1);

    const institutionalBuy = entry.buyAmount * instRatio;
    const institutionalSell = entry.sellAmount * (sellClass.institutional.length / (entry.sellSeats.length || 1));
    const hotMoneyBuy = entry.buyAmount * hotRatio;
    const hotMoneySell = entry.sellAmount * (sellClass.hotMoney.length / (entry.sellSeats.length || 1));

    const netInstitutional = institutionalBuy - institutionalSell;
    const netHotMoney = hotMoneyBuy - hotMoneySell;

    const score = netInstitutional * 0.6 + netHotMoney * 0.4;
    const signal = score > 0 ? 'bullish' : score < 0 ? 'bearish' : 'neutral';
    const confidence = Math.min(1, Math.abs(entry.netAmount) / 100000000);

    // 机构买入+游资卖出=次日上涨概率高
    const followUpProbability = instRatio > 0.3 && hotRatio < 0.2 ? 0.65 :
      entry.changePercent > 9.5 ? 0.45 : 0.5;

    return {
      symbol: entry.symbol,
      institutionalBuy,
      institutionalSell,
      hotMoneyBuy,
      hotMoneySell,
      netInstitutional,
      netHotMoney,
      signal,
      confidence,
      followUpProbability,
    };
  });
}

function findHighConvictionEntries(analyses: DragonTigerAnalysis[]): DragonTigerAnalysis[] {
  return analyses.filter(a =>
    a.confidence > 0.5 &&
    a.signal === 'bullish' &&
    a.netInstitutional > 0 &&
    a.followUpProbability > 0.6
  );
}

function calcDragonTigerStats(entries: DragonTigerEntry[]): {
  totalBuy: number;
  totalSell: number;
  netFlow: number;
  avgChange: number;
  topBuyer: string;
} {
  const totalBuy = entries.reduce((s, e) => s + e.buyAmount, 0);
  const totalSell = entries.reduce((s, e) => s + e.sellAmount, 0);
  const avgChange = entries.reduce((s, e) => s + e.changePercent, 0) / (entries.length || 1);
  const topEntry = entries.reduce((best, e) => e.buyAmount > best.buyAmount ? e : best, entries[0] || { symbol: '', buyAmount: 0 });
  return { totalBuy, totalSell, netFlow: totalBuy - totalSell, avgChange, topBuyer: topEntry.symbol };
}

describe('龙虎榜深度分析引擎', () => {
  const entries: DragonTigerEntry[] = [
    {
      symbol: '600519', name: '贵州茅台', reason: '涨幅偏离值达7%',
      buyAmount: 500000000, sellAmount: 300000000, netAmount: 200000000,
      buySeats: ['机构专用', '机构专用', '沪股通专用', '东方财富证券'],
      sellSeats: ['华泰证券', '国泰君安', '中信证券'],
      price: 1800, changePercent: 8.5, date: '2024-03-15',
    },
    {
      symbol: '300750', name: '宁德时代', reason: '涨幅偏离值达7%',
      buyAmount: 800000000, sellAmount: 750000000, netAmount: 50000000,
      buySeats: ['机构专用', '深股通专用', '华泰证券'],
      sellSeats: ['机构专用', '东方财富', '国泰君安'],
      price: 200, changePercent: 9.8, date: '2024-03-15',
    },
    {
      symbol: '002594', name: '比亚迪', reason: '换手率达20%',
      buyAmount: 300000000, sellAmount: 450000000, netAmount: -150000000,
      buySeats: ['东方财富', '华泰证券', '国泰君安'],
      sellSeats: ['机构专用', '机构专用', '中信证券'],
      price: 250, changePercent: -3.2, date: '2024-03-15',
    },
  ];

  it('应分类席位', () => {
    const result = classifySeats(['机构专用', '东方财富证券', '普通营业部']);
    expect(result.institutional.length).toBe(1);
    expect(result.hotMoney.length).toBe(1);
  });

  it('应分析龙虎榜数据', () => {
    const analyses = analyzeDragonTiger(entries);
    expect(analyses.length).toBe(entries.length);
    analyses.forEach(a => {
      expect(['bullish', 'bearish', 'neutral']).toContain(a.signal);
      expect(a.confidence).toBeGreaterThanOrEqual(0);
      expect(a.followUpProbability).toBeGreaterThan(0);
    });
  });

  it('机构大量买入应为看涨', () => {
    const analyses = analyzeDragonTiger(entries);
    const moutai = analyses.find(a => a.symbol === '600519');
    expect(moutai?.signal).toBe('bullish');
    expect(moutai?.netInstitutional).toBeGreaterThan(0);
  });

  it('净卖出应为看跌', () => {
    const analyses = analyzeDragonTiger(entries);
    const byd = analyses.find(a => a.symbol === '002594');
    expect(byd?.signal).toBe('bearish');
  });

  it('应找出高确信度标的', () => {
    const analyses = analyzeDragonTiger(entries);
    const high = findHighConvictionEntries(analyses);
    high.forEach(h => {
      expect(h.confidence).toBeGreaterThan(0.5);
      expect(h.signal).toBe('bullish');
      expect(h.netInstitutional).toBeGreaterThan(0);
    });
  });

  it('应计算龙虎榜统计', () => {
    const stats = calcDragonTigerStats(entries);
    expect(stats.totalBuy).toBe(1600000000);
    expect(stats.totalSell).toBe(1500000000);
    expect(stats.netFlow).toBe(100000000);
  });

  it('应识别最大买入席', () => {
    const stats = calcDragonTigerStats(entries);
    expect(stats.topBuyer).toBe('300750');
  });

  it('空数据应返回空', () => {
    expect(analyzeDragonTiger([])).toEqual([]);
  });

  it('连续涨停应降低次日概率', () => {
    const limitUp: DragonTigerEntry = { ...entries[0], changePercent: 10 };
    const analysis = analyzeDragonTiger([limitUp])[0];
    expect(analysis.followUpProbability).toBeLessThan(0.5);
  });

  it('置信度应与净买入金额相关', () => {
    const analyses = analyzeDragonTiger(entries);
    const sorted = [...analyses].sort((a, b) => b.confidence - a.confidence);
    // 宁德时代净买入5000万 vs 比亚迪净卖出1.5亿
    // 但贵州茅台净买入2亿应最高置信度
    expect(sorted[0].symbol).toBe('600519');
  });
});
