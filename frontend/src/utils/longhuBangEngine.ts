/**
 * 龙虎榜分析引擎
 * 营业部统计、机构动向、游资行为分析
 */

export interface LongHuBangEntry {
  ticker: string;
  name: string;
  date: string;
  reason: string; // 上榜原因
  price: number;
  changePercent: number;
  buyAmount: number;
  sellAmount: number;
  netAmount: number;
  buyer席位: { name: string; amount: number; is机构: boolean }[];
  seller席位: { name: string; amount: number; is机构: boolean }[];
}

export interface SeatAnalysis {
  name: string;
  totalBuy: number;
  totalSell: number;
  netAmount: number;
  tradeCount: number;
  type: '机构' | '游资' | '营业部';
  preference: string[]; // 偏好板块
  winRate: number; // 历史胜率
  signal: 'bullish' | 'bearish' | 'neutral';
}

export interface LongHuBangSignal {
  type: 'bullish' | 'bearish' | 'neutral';
  strength: number;
  message: string;
  details: string;
}

/**
 * 龙虎榜汇总分析
 */
export function summarizeLongHuBang(entries: LongHuBangEntry[]): {
  totalBuy: number;
  totalSell: number;
  netAmount: number;
  institutionNet: number;
  hotmoneyNet: number;
  seatCount: number;
  avgNet: number;
} {
  let totalBuy = 0, totalSell = 0, institutionNet = 0, hotmoneyNet = 0;
  const seats = new Set<string>();

  for (const entry of entries) {
    totalBuy += entry.buyAmount;
    totalSell += entry.sellAmount;

    for (const b of entry.buyer席位) {
      seats.add(b.name);
      if (b.is机构) institutionNet += b.amount;
      else hotmoneyNet += b.amount;
    }
    for (const s of entry.seller席位) {
      seats.add(s.name);
      if (s.is机构) institutionNet -= s.amount;
      else hotmoneyNet -= s.amount;
    }
  }

  return {
    totalBuy: Math.round(totalBuy),
    totalSell: Math.round(totalSell),
    netAmount: Math.round(totalBuy - totalSell),
    institutionNet: Math.round(institutionNet),
    hotmoneyNet: Math.round(hotmoneyNet),
    seatCount: seats.size,
    avgNet: Math.round((totalBuy - totalSell) / Math.max(1, entries.length)),
  };
}

/**
 * 席位分析
 */
export function analyzeSeats(entries: LongHuBangEntry[]): SeatAnalysis[] {
  const seatMap = new Map<string, {
    totalBuy: number; totalSell: number; tradeCount: number;
    is机构: boolean; tickers: Set<string>;
  }>();

  for (const entry of entries) {
    for (const b of entry.buyer席位) {
      const existing = seatMap.get(b.name) ?? { totalBuy: 0, totalSell: 0, tradeCount: 0, is机构: b.is机构, tickers: new Set() };
      existing.totalBuy += b.amount;
      existing.tradeCount++;
      existing.tickers.add(entry.ticker);
      seatMap.set(b.name, existing);
    }
    for (const s of entry.seller席位) {
      const existing = seatMap.get(s.name) ?? { totalBuy: 0, totalSell: 0, tradeCount: 0, is机构: s.is机构, tickers: new Set() };
      existing.totalSell += s.amount;
      existing.tradeCount++;
      existing.tickers.add(entry.ticker);
      seatMap.set(s.name, existing);
    }
  }

  return Array.from(seatMap.entries())
    .map(([name, data]) => {
      const netAmount = data.totalBuy - data.totalSell;
      const type: SeatAnalysis['type'] = data.is机构 ? '机构' : (data.tradeCount > 5 ? '游资' : '营业部');
      const signal: SeatAnalysis['signal'] = netAmount > 0 ? 'bullish' : netAmount < 0 ? 'bearish' : 'neutral';

      return {
        name,
        totalBuy: Math.round(data.totalBuy),
        totalSell: Math.round(data.totalSell),
        netAmount: Math.round(netAmount),
        tradeCount: data.tradeCount,
        type,
        preference: Array.from(data.tickers).slice(0, 5),
        winRate: 0.5, // 需要历史数据
        signal,
      };
    })
    .sort((a, b) => Math.abs(b.netAmount) - Math.abs(a.netAmount));
}

/**
 * 龙虎榜信号
 */
export function generateLongHuBangSignals(entries: LongHuBangEntry[]): LongHuBangSignal[] {
  const signals: LongHuBangSignal[] = [];
  const summary = summarizeLongHuBang(entries);

  // 机构净买入
  if (summary.institutionNet > 0) {
    signals.push({
      type: 'bullish',
      strength: Math.min(90, 50 + summary.institutionNet / 1e8),
      message: `龙虎榜机构净买入${(summary.institutionNet / 1e8).toFixed(1)}亿`,
      details: '机构资金入场，中期看涨信号',
    });
  } else if (summary.institutionNet < -1e8) {
    signals.push({
      type: 'bearish',
      strength: Math.min(85, 50 + Math.abs(summary.institutionNet) / 1e8),
      message: `龙虎榜机构净卖出${(Math.abs(summary.institutionNet) / 1e8).toFixed(1)}亿`,
      details: '机构大幅卖出，注意风险',
    });
  }

  // 游资活跃度
  if (Math.abs(summary.hotmoneyNet) > 5e8) {
    signals.push({
      type: summary.hotmoneyNet > 0 ? 'bullish' : 'bearish',
      strength: 65,
      message: `游资净${summary.hotmoneyNet > 0 ? '买入' : '卖出'}${(Math.abs(summary.hotmoneyNet) / 1e8).toFixed(1)}亿`,
      details: '游资活跃，短线博弈激烈',
    });
  }

  // 净买入集中度
  if (summary.netAmount > 2e8) {
    signals.push({
      type: 'bullish',
      strength: 75,
      message: `龙虎榜整体净买入${(summary.netAmount / 1e8).toFixed(1)}亿，资金集中流入`,
      details: '多只上榜股获资金追捧',
    });
  }

  if (signals.length === 0) {
    signals.push({ type: 'neutral', strength: 50, message: '龙虎榜表现平淡', details: '' });
  }

  return signals;
}
