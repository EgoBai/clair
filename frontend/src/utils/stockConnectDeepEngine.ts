/**
 * 港股通分析引擎
 * 分析AH溢价、港股通资金流向、互联互通数据
 */

export interface AHStock {
  codeA: string;
  codeH: string;
  name: string;
  priceA: number; // A股价格(RMB)
  priceH: number; // H股价格(HKD)
  exchangeRate: number; // HKD/RMB
  industry: string;
}

export interface AHPremium {
  codeA: string;
  codeH: string;
  name: string;
  premium: number; // AH溢价率 %
  priceA: number;
  priceH: number;
  priceHInRMB: number;
  historicalAvgPremium: number;
  premiumZScore: number;
  signal: 'buy_A' | 'buy_H' | 'neutral';
}

export interface StockConnectSummary {
  date: string;
  southBound: { netBuy: number; totalVolume: number };
  northBound: { netBuy: number; totalVolume: number };
  totalConnect: number;
  marketSentiment: 'risk_on' | 'risk_off' | 'neutral';
}

export interface CrossBorderFlow {
  stockCode: string;
  channel: 'south' | 'north';
  netBuy: number;
  holdingChange: number;
  holdingPercent: number;
  trend: 'accumulating' | 'distributing' | 'stable';
}

export class StockConnectEngine {
  /**
   * 计算AH溢价
   */
  calculateAHPremium(
    stock: AHStock,
    historicalAvgPremium: number = 30
  ): AHPremium {
    const priceHInRMB = stock.priceH / stock.exchangeRate;
    const premium = priceHInRMB > 0 
      ? ((stock.priceA - priceHInRMB) / priceHInRMB) * 100 
      : 0;

    const premiumDeviation = premium - historicalAvgPremium;
    const premiumZScore = historicalAvgPremium !== 0 
      ? premiumDeviation / Math.abs(historicalAvgPremium) 
      : 0;

    let signal: AHPremium['signal'] = 'neutral';
    if (premiumZScore > 1) signal = 'buy_H'; // A股太贵，买H股
    else if (premiumZScore < -1) signal = 'buy_A'; // H股太贵，买A股

    return {
      codeA: stock.codeA,
      codeH: stock.codeH,
      name: stock.name,
      premium,
      priceA: stock.priceA,
      priceH: stock.priceH,
      priceHInRMB,
      historicalAvgPremium,
      premiumZScore,
      signal
    };
  }

  /**
   * 批量计算AH溢价排名
   */
  rankAHPremiums(
    stocks: AHStock[],
    avgPremiums: Map<string, number>
  ): AHPremium[] {
    return stocks
      .map(s => this.calculateAHPremium(s, avgPremiums.get(s.codeA) || 30))
      .sort((a, b) => b.premium - a.premium);
  }

  /**
   * 互联互通汇总
   */
  summarizeStockConnect(
    northFlows: { date: string; netBuy: number; volume: number }[],
    southFlows: { date: string; netBuy: number; volume: number }[]
  ): StockConnectSummary[] {
    const dateMap = new Map<string, StockConnectSummary>();

    for (const f of northFlows) {
      const existing = dateMap.get(f.date) || {
        date: f.date,
        southBound: { netBuy: 0, totalVolume: 0 },
        northBound: { netBuy: 0, totalVolume: 0 },
        totalConnect: 0,
        marketSentiment: 'neutral' as const
      };
      existing.northBound.netBuy += f.netBuy;
      existing.northBound.totalVolume += f.volume;
      dateMap.set(f.date, existing);
    }

    for (const f of southFlows) {
      const existing = dateMap.get(f.date) || {
        date: f.date,
        southBound: { netBuy: 0, totalVolume: 0 },
        northBound: { netBuy: 0, totalVolume: 0 },
        totalConnect: 0,
        marketSentiment: 'neutral' as const
      };
      existing.southBound.netBuy += f.netBuy;
      existing.southBound.totalVolume += f.volume;
      dateMap.set(f.date, existing);
    }

    return Array.from(dateMap.values()).map(s => {
      s.totalConnect = s.northBound.totalVolume + s.southBound.totalVolume;
      const totalNet = s.northBound.netBuy + s.southBound.netBuy;
      s.marketSentiment = totalNet > 50 ? 'risk_on' : totalNet < -50 ? 'risk_off' : 'neutral';
      return s;
    }).sort((a, b) => a.date.localeCompare(b.date));
  }

  /**
   * 跨境资金分析
   */
  analyzeCrossBorderFlow(
    holdings: { stockCode: string; date: string; shares: number; channel: 'south' | 'north' }[]
  ): CrossBorderFlow[] {
    const stockMap = new Map<string, { dates: string[]; shares: number[]; channel: string }>();

    for (const h of holdings) {
      const key = `${h.stockCode}_${h.channel}`;
      const existing = stockMap.get(key) || { dates: [], shares: [], channel: h.channel };
      existing.dates.push(h.date);
      existing.shares.push(h.shares);
      stockMap.set(key, existing);
    }

    return Array.from(stockMap.entries()).map(([key, data]) => {
      const stockCode = key.split('_')[0];
      const sorted = data.dates
        .map((d, i) => ({ date: d, shares: data.shares[i] }))
        .sort((a, b) => a.date.localeCompare(b.date));

      const latest = sorted[sorted.length - 1]?.shares || 0;
      const previous = sorted.length > 1 ? sorted[sorted.length - 2]?.shares || 0 : latest;
      const first = sorted[0]?.shares || 0;

      const netBuy = latest - previous;
      const holdingChange = first > 0 ? ((latest - first) / first) * 100 : 0;

      let trend: CrossBorderFlow['trend'] = 'stable';
      if (sorted.length >= 3) {
        const recent = sorted.slice(-3).map(s => s.shares);
        if (recent[2] > recent[0]) trend = 'accumulating';
        else if (recent[2] < recent[0]) trend = 'distributing';
      }

      return {
        stockCode,
        channel: data.channel as 'south' | 'north',
        netBuy,
        holdingChange,
        holdingPercent: 0,
        trend
      };
    });
  }

  /**
   * AH溢价均值回归分析
   */
  analyzePremiumMeanReversion(
    premiums: { date: string; premium: number }[]
  ): {
    currentPremium: number;
    avgPremium: number;
    stdDev: number;
    zScore: number;
    percentile: number;
    meanReversionProb: number;
    signal: 'revert_high' | 'revert_low' | 'stable';
  } {
    if (premiums.length === 0) {
      return { currentPremium: 0, avgPremium: 0, stdDev: 0, zScore: 0, percentile: 50, meanReversionProb: 0.5, signal: 'stable' };
    }

    const values = premiums.map(p => p.premium);
    const avgPremium = values.reduce((a, b) => a + b, 0) / values.length;
    const variance = values.reduce((s, v) => s + Math.pow(v - avgPremium, 2), 0) / values.length;
    const stdDev = Math.sqrt(variance);

    const currentPremium = values[values.length - 1];
    const zScore = stdDev > 0 ? (currentPremium - avgPremium) / stdDev : 0;

    // 百分位
    const sorted = [...values].sort((a, b) => a - b);
    const rank = sorted.filter(v => v <= currentPremium).length;
    const percentile = (rank / sorted.length) * 100;

    // 均值回归概率
    const meanReversionProb = Math.min(1, Math.abs(zScore) / 3);

    let signal: 'revert_high' | 'revert_low' | 'stable' = 'stable';
    if (zScore > 1.5) signal = 'revert_high';
    else if (zScore < -1.5) signal = 'revert_low';

    return { currentPremium, avgPremium, stdDev, zScore, percentile, meanReversionProb, signal };
  }
}
