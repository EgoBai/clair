import { describe, it, expect } from 'vitest';

// 大宗交易分析引擎
interface BlockTrade {
  symbol: string;
  price: number;
  volume: number;
  amount: number;
  discount: number; // 折溢价率
  buyer: string;
  seller: string;
  date: string;
  isCrossMarket: boolean;
}

interface BlockTradeSignal {
  symbol: string;
  totalAmount: number;
  avgDiscount: number;
  buyPressure: number;
  signal: 'accumulation' | 'distribution' | 'neutral';
  confidence: number;
  uniqueBuyers: number;
  uniqueSellers: number;
}

function calcBlockTradeSignals(trades: BlockTrade[]): BlockTradeSignal[] {
  const grouped = new Map<string, BlockTrade[]>();
  trades.forEach(t => {
    if (!grouped.has(t.symbol)) grouped.set(t.symbol, []);
    grouped.get(t.symbol)!.push(t);
  });

  return Array.from(grouped.entries()).map(([symbol, ts]) => {
    const totalAmount = ts.reduce((s, t) => s + t.amount, 0);
    const avgDiscount = ts.reduce((s, t) => s + t.discount, 0) / ts.length;
    const buyers = new Set(ts.map(t => t.buyer));
    const sellers = new Set(ts.map(t => t.seller));
    const buyPressure = ts.filter(t => t.discount > 0).reduce((s, t) => s + t.amount, 0) / totalAmount;

    const signal = avgDiscount > 0.02 && buyPressure > 0.6 ? 'accumulation' :
      avgDiscount < -0.02 && buyPressure < 0.4 ? 'distribution' : 'neutral';

    return {
      symbol,
      totalAmount,
      avgDiscount,
      buyPressure,
      signal,
      confidence: Math.min(1, totalAmount / 100000000),
      uniqueBuyers: buyers.size,
      uniqueSellers: sellers.size,
    };
  });
}

function findSuspiciousBlocks(trades: BlockTrade[]): BlockTrade[] {
  return trades.filter(t =>
    t.amount > 50000000 || // 单笔>5000万
    Math.abs(t.discount) > 0.05 || // 折溢价>5%
    t.volume > 10000000 // 成交量>1000万股
  );
}

function calcBlockTradeStats(trades: BlockTrade[]): {
  totalTrades: number;
  totalAmount: number;
  avgDiscount: number;
  premiumCount: number;
  discountCount: number;
  crossMarketCount: number;
} {
  return {
    totalTrades: trades.length,
    totalAmount: trades.reduce((s, t) => s + t.amount, 0),
    avgDiscount: trades.reduce((s, t) => s + t.discount, 0) / (trades.length || 1),
    premiumCount: trades.filter(t => t.discount > 0).length,
    discountCount: trades.filter(t => t.discount < 0).length,
    crossMarketCount: trades.filter(t => t.isCrossMarket).length,
  };
}

describe('大宗交易分析引擎', () => {
  const trades: BlockTrade[] = [
    { symbol: '600519', price: 1800, volume: 50000, amount: 90000000, discount: 0.03, buyer: '机构A', seller: '营业部X', date: '2024-03-15', isCrossMarket: false },
    { symbol: '600519', price: 1810, volume: 30000, amount: 54300000, discount: 0.02, buyer: '机构B', seller: '营业部Y', date: '2024-03-15', isCrossMarket: false },
    { symbol: '000858', price: 150, volume: 200000, amount: 30000000, discount: -0.04, buyer: '营业部Z', seller: '机构C', date: '2024-03-15', isCrossMarket: false },
    { symbol: '300750', price: 200, volume: 100000, amount: 20000000, discount: 0.01, buyer: '机构D', seller: '营业部W', date: '2024-03-15', isCrossMarket: true },
  ];

  it('应生成大宗交易信号', () => {
    const signals = calcBlockTradeSignals(trades);
    expect(signals.length).toBe(3);
    signals.forEach(s => {
      expect(['accumulation', 'distribution', 'neutral']).toContain(s.signal);
      expect(s.totalAmount).toBeGreaterThan(0);
    });
  });

  it('溢价买入应为增持信号', () => {
    const signals = calcBlockTradeSignals(trades);
    const moutai = signals.find(s => s.symbol === '600519');
    expect(moutai?.signal).toBe('accumulation');
    expect(moutai?.avgDiscount).toBeGreaterThan(0);
  });

  it('折价卖出应为减持信号', () => {
    const signals = calcBlockTradeSignals(trades);
    const wuliangye = signals.find(s => s.symbol === '000858');
    expect(wuliangye?.signal).toBe('distribution');
  });

  it('应找出可疑交易', () => {
    const suspicious = findSuspiciousBlocks(trades);
    expect(suspicious.length).toBeGreaterThan(0);
  });

  it('应计算统计信息', () => {
    const stats = calcBlockTradeStats(trades);
    expect(stats.totalTrades).toBe(4);
    expect(stats.totalAmount).toBe(194300000);
    expect(stats.premiumCount).toBe(3);
    expect(stats.discountCount).toBe(1);
    expect(stats.crossMarketCount).toBe(1);
  });

  it('应识别独立买卖方数量', () => {
    const signals = calcBlockTradeSignals(trades);
    const moutai = signals.find(s => s.symbol === '600519');
    expect(moutai?.uniqueBuyers).toBe(2);
    expect(moutai?.uniqueSellers).toBe(2);
  });

  it('空数据应返回空', () => {
    expect(calcBlockTradeSignals([])).toEqual([]);
  });

  it('置信度应与总金额相关', () => {
    const signals = calcBlockTradeSignals(trades);
    const moutai = signals.find(s => s.symbol === '600519');
    const wuliangye = signals.find(s => s.symbol === '000858');
    expect(moutai!.confidence).toBeGreaterThan(wuliangye!.confidence);
  });

  it('小金额不应为可疑', () => {
    const small: BlockTrade = { ...trades[3], amount: 1000000, volume: 5000, discount: 0.01 };
    expect(findSuspiciousBlocks([small]).length).toBe(0);
  });

  it('大折价应为可疑', () => {
    const bigDiscount: BlockTrade = { ...trades[0], discount: 0.08 };
    expect(findSuspiciousBlocks([bigDiscount]).length).toBe(1);
  });
});
