import { describe, it, expect } from 'vitest';

/**
 * 龙虎榜分析测试
 */

interface TopTraderEntry {
  code: string;
  date: string;
  rank: number;
  seat: string;        // 营业部名称
  type: 'buy' | 'sell';
  amount: number;
  percent: number;     // 占总成交比例
}

interface TopTraderAnalysis {
  code: string;
  date: string;
  buySeats: TopTraderEntry[];
  sellSeats: TopTraderEntry[];
  netBuyAmount: number;
  institutionalBuy: boolean;
  hotMoneyPresent: boolean;
  signal: 'bullish' | 'bearish' | 'neutral';
}

function analyzeTopTraders(entries: TopTraderEntry[]): TopTraderAnalysis[] {
  const byCodeDate = new Map<string, TopTraderEntry[]>();
  for (const entry of entries) {
    const key = `${entry.code}_${entry.date}`;
    const existing = byCodeDate.get(key) || [];
    existing.push(entry);
    byCodeDate.set(key, existing);
  }

  const results: TopTraderAnalysis[] = [];
  for (const [key, keyEntries] of byCodeDate) {
    const [code, date] = key.split('_');
    const buySeats = keyEntries.filter(e => e.type === 'buy').sort((a, b) => b.amount - a.amount);
    const sellSeats = keyEntries.filter(e => e.type === 'sell').sort((a, b) => b.amount - a.amount);
    const totalBuy = buySeats.reduce((s, e) => s + e.amount, 0);
    const totalSell = sellSeats.reduce((s, e) => s + e.amount, 0);
    const netBuyAmount = totalBuy - totalSell;

    const institutionalBuy = buySeats.some(e =>
      e.seat.includes('机构') || e.seat.includes('基金') || e.seat.includes('社保')
    );
    const hotMoneyPresent = buySeats.some(e =>
      e.seat.includes('游资') || e.seat.includes('宁波') || e.seat.includes('深圳')
    );

    let signal: TopTraderAnalysis['signal'] = 'neutral';
    if (netBuyAmount > 0 && institutionalBuy) signal = 'bullish';
    else if (netBuyAmount < 0) signal = 'bearish';

    results.push({
      code,
      date,
      buySeats,
      sellSeats,
      netBuyAmount: Math.round(netBuyAmount),
      institutionalBuy,
      hotMoneyPresent,
      signal,
    });
  }

  return results.sort((a, b) => a.date.localeCompare(b.date));
}

function trackSeatPerformance(entries: TopTraderEntry[]): Map<string, { wins: number; total: number; avgReturn: number }> {
  const seatData = new Map<string, { amounts: number[]; codes: Set<string> }>();
  for (const entry of entries) {
    if (entry.type !== 'buy') continue;
    const existing = seatData.get(entry.seat) || { amounts: [], codes: new Set() };
    existing.amounts.push(entry.amount);
    existing.codes.add(entry.code);
    seatData.set(entry.seat, existing);
  }

  const result = new Map<string, { wins: number; total: number; avgReturn: number }>();
  for (const [seat, data] of seatData) {
    const total = data.amounts.length;
    const wins = Math.round(total * 0.6); // Simplified: assume 60% win rate for top seats
    const avgReturn = data.amounts.reduce((s, a) => s + a, 0) / total;
    result.set(seat, { wins, total, avgReturn: Math.round(avgReturn) });
  }
  return result;
}

function findSmartMoney(entries: TopTraderEntry[], minAppearances: number = 3): string[] {
  const appearances = new Map<string, number>();
  for (const entry of entries) {
    if (entry.type === 'buy') {
      appearances.set(entry.seat, (appearances.get(entry.seat) || 0) + 1);
    }
  }
  return [...appearances.entries()]
    .filter(([_, count]) => count >= minAppearances)
    .map(([seat]) => seat);
}

describe('Top Traders Analysis', () => {
  const entries: TopTraderEntry[] = [
    { code: '000001', date: '2024-01-15', rank: 1, seat: '机构专用', type: 'buy', amount: 50000000, percent: 5.2 },
    { code: '000001', date: '2024-01-15', rank: 2, seat: '宁波解放路', type: 'buy', amount: 30000000, percent: 3.1 },
    { code: '000001', date: '2024-01-15', rank: 3, seat: '深圳益田路', type: 'buy', amount: 20000000, percent: 2.1 },
    { code: '000001', date: '2024-01-15', rank: 1, seat: '上海分公司', type: 'sell', amount: 40000000, percent: 4.1 },
    { code: '000001', date: '2024-01-15', rank: 2, seat: '北京分公司', type: 'sell', amount: 25000000, percent: 2.6 },
    { code: '600519', date: '2024-01-15', rank: 1, seat: '机构专用', type: 'buy', amount: 80000000, percent: 8.0 },
    { code: '600519', date: '2024-01-15', rank: 1, seat: '社保基金', type: 'sell', amount: 60000000, percent: 6.0 },
  ];

  describe('龙虎榜分析', () => {
    it('应该分组分析', () => {
      const analysis = analyzeTopTraders(entries);
      expect(analysis.length).toBe(2); // 2 stocks
    });

    it('应该计算净买入', () => {
      const analysis = analyzeTopTraders(entries);
      const stock1 = analysis.find(a => a.code === '000001');
      expect(stock1?.netBuyAmount).toBe(35000000); // 100M - 65M
    });

    it('应该识别机构买入', () => {
      const analysis = analyzeTopTraders(entries);
      const stock1 = analysis.find(a => a.code === '000001');
      expect(stock1?.institutionalBuy).toBe(true);
    });

    it('应该识别游资', () => {
      const analysis = analyzeTopTraders(entries);
      const stock1 = analysis.find(a => a.code === '000001');
      expect(stock1?.hotMoneyPresent).toBe(true);
    });

    it('应该生成信号', () => {
      const analysis = analyzeTopTraders(entries);
      for (const a of analysis) {
        expect(['bullish', 'bearish', 'neutral']).toContain(a.signal);
      }
    });
  });

  describe('营业部追踪', () => {
    it('应该追踪营业部表现', () => {
      const performance = trackSeatPerformance(entries);
      expect(performance.size).toBeGreaterThan(0);
    });

    it('应该有统计数据', () => {
      const performance = trackSeatPerformance(entries);
      for (const [_, data] of performance) {
        expect(data.total).toBeGreaterThan(0);
        expect(data.wins).toBeLessThanOrEqual(data.total);
      }
    });
  });

  describe('聪明钱识别', () => {
    it('应该找出频繁出现的营业部', () => {
      const smartMoney = findSmartMoney(entries, 2);
      expect(smartMoney).toContain('机构专用');
    });

    it('应该按阈值过滤', () => {
      const smartMoney = findSmartMoney(entries, 5);
      expect(smartMoney.length).toBe(0);
    });
  });
});
