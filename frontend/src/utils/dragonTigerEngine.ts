/**
 * 龙虎榜分析引擎
 * 营业部席位分析、机构游资识别、持续性追踪
 */

export interface DragonTigerEntry {
  date: string;
  stockCode: string;
  stockName: string;
  type: 'buy' | 'sell';
  rank: number;
  seat: string;
  amount: number;
  is机构: boolean;
}

export interface SeatProfile {
  seat: string;
  totalBuy: number;
  totalSell: number;
  netAmount: number;
  frequency: number;
  stocks: string[];
  is机构: boolean;
  style: '机构' | '游资' | '混合' | '未知';
  winRate: number;
}

export interface DragonTigerAnalysis {
  entries: DragonTigerEntry[];
  seatProfiles: SeatProfile[];
  netInflow: number;
  institutionNetFlow: number;
  hotmoneyNetFlow: number;
  topSeats: SeatProfile[];
  signals: { type: string; description: string }[];
}

/**
 * 分析龙虎榜数据
 */
export function analyzeDragonTiger(entries: DragonTigerEntry[]): DragonTigerAnalysis {
  const seatMap = new Map<string, SeatProfile>();

  for (const entry of entries) {
    if (!seatMap.has(entry.seat)) {
      seatMap.set(entry.seat, {
        seat: entry.seat,
        totalBuy: 0, totalSell: 0, netAmount: 0,
        frequency: 0, stocks: [], is机构: entry.is机构,
        style: entry.is机构 ? '机构' : '未知', winRate: 0,
      });
    }
    const profile = seatMap.get(entry.seat)!;
    if (entry.type === 'buy') {
      profile.totalBuy += entry.amount;
      if (!profile.stocks.includes(entry.stockCode)) profile.stocks.push(entry.stockCode);
    } else {
      profile.totalSell += entry.amount;
    }
    profile.frequency++;
  }

  const seatProfiles = Array.from(seatMap.values()).map(p => {
    p.netAmount = p.totalBuy - p.totalSell;
    // 判断风格
    if (p.is机构 && p.frequency > 5) p.style = '机构';
    else if (!p.is机构 && p.frequency > 10) p.style = '游资';
    else if (p.frequency > 3) p.style = '混合';
    return p;
  });

  const netInflow = seatProfiles.reduce((s, p) => s + p.netAmount, 0);
  const institutionNetFlow = seatProfiles.filter(p => p.is机构).reduce((s, p) => s + p.netAmount, 0);
  const hotmoneyNetFlow = seatProfiles.filter(p => !p.is机构).reduce((s, p) => s + p.netAmount, 0);

  const topSeats = [...seatProfiles].sort((a, b) => Math.abs(b.netAmount) - Math.abs(a.netAmount)).slice(0, 10);

  // 信号
  const signals: { type: string; description: string }[] = [];
  if (institutionNetFlow > 0) signals.push({ type: '机构买入', description: `机构净买入 ${(institutionNetFlow / 1e8).toFixed(2)}亿` });
  if (hotmoneyNetFlow > Math.abs(institutionNetFlow) * 2) signals.push({ type: '游资主导', description: '游资活跃度显著高于机构' });

  const repeatedSeats = seatProfiles.filter(p => p.frequency > 3);
  if (repeatedSeats.length > 0) signals.push({ type: '席位频繁', description: `${repeatedSeats.length}个席位近期频繁出现` });

  return {
    entries,
    seatProfiles: seatProfiles.sort((a, b) => Math.abs(b.netAmount) - Math.abs(a.netAmount)),
    netInflow: Math.round(netInflow),
    institutionNetFlow: Math.round(institutionNetFlow),
    hotmoneyNetFlow: Math.round(hotmoneyNetFlow),
    topSeats,
    signals,
  };
}
