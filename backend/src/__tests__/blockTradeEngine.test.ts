import { describe, it, expect } from 'vitest';

// 大宗交易引擎
interface BlockTrade {
  date: string; stockCode: string; stockName: string;
  price: number; volume: number; amount: number;
  buyer: string; seller: string;
  discountRate: number; // 折溢价率
}

function calcDiscountRate(blockPrice: number, marketPrice: number): number {
  if (marketPrice <= 0) return 0;
  return ((blockPrice - marketPrice) / marketPrice) * 100;
}

function filterBlockTrades(trades: BlockTrade[], filters: {
  minAmount?: number; maxDiscount?: number; stockCode?: string;
  startDate?: string; endDate?: string;
}): BlockTrade[] {
  return trades.filter(t => {
    if (filters.minAmount && t.amount < filters.minAmount) return false;
    if (filters.maxDiscount !== undefined && t.discountRate > filters.maxDiscount) return false;
    if (filters.stockCode && t.stockCode !== filters.stockCode) return false;
    if (filters.startDate && t.date < filters.startDate) return false;
    if (filters.endDate && t.date > filters.endDate) return false;
    return true;
  });
}

function aggregateByStock(trades: BlockTrade[]): Record<string, { totalAmount: number; count: number; avgDiscount: number }> {
  const result: Record<string, { totalAmount: number; count: number; avgDiscount: number }> = {};
  trades.forEach(t => {
    if (!result[t.stockCode]) result[t.stockCode] = { totalAmount: 0, count: 0, avgDiscount: 0 };
    result[t.stockCode].totalAmount += t.amount;
    result[t.stockCode].count += 1;
    result[t.stockCode].avgDiscount += t.discountRate;
  });
  Object.values(result).forEach(v => { v.avgDiscount /= v.count; });
  return result;
}

function detectAbnormalPatterns(trades: BlockTrade[]): { stockCode: string; reason: string }[] {
  const alerts: { stockCode: string; reason: string }[] = [];
  const grouped = aggregateByStock(trades);
  Object.entries(grouped).forEach(([code, data]) => {
    if (data.count >= 5) alerts.push({ stockCode: code, reason: `频繁大宗交易(${data.count}次)` });
    if (data.avgDiscount < -10) alerts.push({ stockCode: code, reason: `大幅折价(平均${data.avgDiscount.toFixed(1)}%)` });
  });
  return alerts;
}

function calcBlockTradeImpact(trade: BlockTrade, avgDailyVolume: number): { volumeImpact: number; estimatedDays: number } {
  if (avgDailyVolume <= 0) return { volumeImpact: 0, estimatedDays: 0 };
  const volumeImpact = (trade.volume / avgDailyVolume) * 100;
  const estimatedDays = Math.ceil(trade.volume / (avgDailyVolume * 0.1));
  return { volumeImpact, estimatedDays };
}

function rankBySignificance(trades: BlockTrade[]): BlockTrade[] {
  return [...trades].sort((a, b) => {
    const scoreA = a.amount * (1 + Math.abs(a.discountRate) / 100);
    const scoreB = b.amount * (1 + Math.abs(b.discountRate) / 100);
    return scoreB - scoreA;
  });
}

describe('大宗交易引擎', () => {
  const trades: BlockTrade[] = [
    { date: '2026-03-20', stockCode: '000001', stockName: '平安银行', price: 11.5, volume: 500000, amount: 5750000, buyer: '机构A', seller: '股东B', discountRate: -4.35 },
    { date: '2026-03-21', stockCode: '000001', stockName: '平安银行', price: 11.8, volume: 300000, amount: 3540000, buyer: '机构C', seller: '股东D', discountRate: -2.17 },
    { date: '2026-03-22', stockCode: '000002', stockName: '万科A', price: 19.0, volume: 200000, amount: 3800000, buyer: '机构E', seller: '股东F', discountRate: -5.0 },
    { date: '2026-03-23', stockCode: '600519', stockName: '贵州茅台', price: 1850, volume: 5000, amount: 9250000, buyer: '机构G', seller: '股东H', discountRate: 2.78 },
  ];

  describe('折溢价率计算', () => {
    it('折价应为负值', () => {
      expect(calcDiscountRate(9.5, 10)).toBe(-5);
    });

    it('溢价应为正值', () => {
      expect(calcDiscountRate(10.5, 10)).toBe(5);
    });

    it('市价为零应返回0', () => {
      expect(calcDiscountRate(10, 0)).toBe(0);
    });
  });

  describe('过滤', () => {
    it('按最低金额过滤', () => {
      expect(filterBlockTrades(trades, { minAmount: 5000000 }).length).toBe(2);
    });

    it('按股票代码过滤', () => {
      expect(filterBlockTrades(trades, { stockCode: '000001' }).length).toBe(2);
    });

    it('按日期范围过滤', () => {
      expect(filterBlockTrades(trades, { startDate: '2026-03-21', endDate: '2026-03-22' }).length).toBe(2);
    });

    it('按最大折价率过滤', () => {
      expect(filterBlockTrades(trades, { maxDiscount: -3 }).length).toBe(2);
    });
  });

  describe('按股票汇总', () => {
    it('应正确汇总各股票的交易', () => {
      const agg = aggregateByStock(trades);
      expect(agg['000001'].count).toBe(2);
      expect(agg['000001'].totalAmount).toBe(5750000 + 3540000);
    });
  });

  describe('异常模式检测', () => {
    it('频繁交易应触发警报', () => {
      const manyTrades = Array.from({ length: 6 }, (_, i) => ({
        ...trades[0], date: `2026-03-${15 + i}`,
      }));
      const alerts = detectAbnormalPatterns(manyTrades);
      expect(alerts.some(a => a.reason.includes('频繁'))).toBe(true);
    });

    it('大幅折价应触发警报', () => {
      const deepDiscount = [{ ...trades[0], discountRate: -15 }];
      const alerts = detectAbnormalPatterns(deepDiscount);
      expect(alerts.some(a => a.reason.includes('折价'))).toBe(true);
    });
  });

  describe('大宗交易影响评估', () => {
    it('应计算成交量影响', () => {
      const impact = calcBlockTradeImpact(trades[0], 1e6);
      expect(impact.volumeImpact).toBe(50);
    });

    it('日均成交量为零应返回零', () => {
      expect(calcBlockTradeImpact(trades[0], 0)).toEqual({ volumeImpact: 0, estimatedDays: 0 });
    });
  });

  describe('重要性排序', () => {
    it('大金额应排在前面', () => {
      const ranked = rankBySignificance(trades);
      expect(ranked[0].amount).toBeGreaterThanOrEqual(ranked[1].amount);
    });

    it('不应修改原数组', () => {
      const original = [...trades];
      rankBySignificance(trades);
      expect(trades[0].date).toBe(original[0].date);
    });
  });
});
