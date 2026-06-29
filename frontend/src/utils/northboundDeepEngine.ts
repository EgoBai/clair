/**
 * 北向资金分析引擎
 * 分析沪深港通北向资金流向、持仓变动、择时信号
 */

export interface NorthboundFlow {
  date: string;
  netBuy: number; // 净买入(亿元)
  buyAmount: number;
  sellAmount: number;
  channel: 'sh' | 'sz' | 'total'; // 沪股通/深股通/合计
}

export interface NorthboundHolding {
  stockCode: string;
  stockName: string;
  shares: number; // 持股数(万股)
  marketValue: number; // 持股市值(亿元)
  percentOfFloat: number; // 占流通股比 %
  changeFromPrev: number; // 较前日变动 %
  industry: string;
}

export interface NorthboundSignal {
  date: string;
  signal: 'strong_buy' | 'buy' | 'neutral' | 'sell' | 'strong_sell';
  confidence: number; // 0-100
  netFlow5D: number;
  netFlow20D: number;
  flowAcceleration: number; // 流量加速度
  breadth: number; // 净买入个股占比
}

export interface StockConnectAnalysis {
  stockCode: string;
  holdingChange5D: number;
  holdingChange20D: number;
  holdingChange60D: number;
  flowTrend: 'accumulating' | 'distributing' | 'stable';
  smartMoneyScore: number; // 0-100
  foreignPreference: number; // 外资偏好度 0-100
}

export class NorthboundFundEngine {
  /**
   * 计算北向资金信号
   */
  calculateSignal(
    flows: NorthboundFlow[],
    holdings: NorthboundHolding[]
  ): NorthboundSignal {
    if (flows.length === 0) {
      return {
        date: '',
        signal: 'neutral',
        confidence: 0,
        netFlow5D: 0,
        netFlow20D: 0,
        flowAcceleration: 0,
        breadth: 0.5
      };
    }

    const sorted = [...flows].sort((a, b) => a.date.localeCompare(b.date));
    const latest = sorted[sorted.length - 1];
    
    // 5日和20日净流入
    const last5 = sorted.slice(-5);
    const last20 = sorted.slice(-20);
    const netFlow5D = last5.reduce((s, f) => s + f.netBuy, 0);
    const netFlow20D = last20.reduce((s, f) => s + f.netBuy, 0);

    // 流量加速度 (近期均值 - 前期均值)
    const recent = sorted.slice(-5);
    const earlier = sorted.slice(-10, -5);
    const recentAvg = recent.reduce((s, f) => s + f.netBuy, 0) / Math.max(1, recent.length);
    const earlierAvg = earlier.reduce((s, f) => s + f.netBuy, 0) / Math.max(1, earlier.length);
    const flowAcceleration = recentAvg - earlierAvg;

    // 广度 (净买入个股占比)
    const netBuyStocks = holdings.filter(h => h.changeFromPrev > 0).length;
    const breadth = holdings.length > 0 ? netBuyStocks / holdings.length : 0.5;

    // 信号判断
    let signal: NorthboundSignal['signal'] = 'neutral';
    const score = netFlow5D / 50 + netFlow20D / 200 + flowAcceleration / 30;
    if (score > 2) signal = 'strong_buy';
    else if (score > 0.5) signal = 'buy';
    else if (score < -2) signal = 'strong_sell';
    else if (score < -0.5) signal = 'sell';

    const confidence = Math.min(100, Math.abs(score) * 30 + flows.length * 2);

    return {
      date: latest.date,
      signal,
      confidence,
      netFlow5D,
      netFlow20D,
      flowAcceleration,
      breadth
    };
  }

  /**
   * 个股北向分析
   */
  analyzeStock(
    holdings: NorthboundHolding[],
    stockCode: string
  ): StockConnectAnalysis | null {
    const stockHoldings = holdings
      .filter(h => h.stockCode === stockCode)
      .sort((a, b) => a.changeFromPrev - b.changeFromPrev);

    if (stockHoldings.length === 0) return null;

    const latest = stockHoldings[stockHoldings.length - 1];
    
    // 持仓变动趋势 (简化)
    const changes = stockHoldings.map(h => h.changeFromPrev);
    const holdingChange5D = changes.slice(-5).reduce((a, b) => a + b, 0);
    const holdingChange20D = changes.slice(-20).reduce((a, b) => a + b, 0);
    const holdingChange60D = changes.reduce((a, b) => a + b, 0);

    // 趋势判断
    let flowTrend: StockConnectAnalysis['flowTrend'] = 'stable';
    if (holdingChange20D > 2) flowTrend = 'accumulating';
    else if (holdingChange20D < -2) flowTrend = 'distributing';

    // 聪明钱评分
    const consistencyScore = Math.min(50, Math.abs(holdingChange20D) * 5);
    const valueScore = Math.min(50, latest.percentOfFloat * 2);
    const smartMoneyScore = consistencyScore + valueScore;

    // 外资偏好度
    const foreignPreference = Math.min(100, latest.percentOfFloat * 10);

    return {
      stockCode,
      holdingChange5D,
      holdingChange20D,
      holdingChange60D,
      flowTrend,
      smartMoneyScore,
      foreignPreference
    };
  }

  /**
   * 行业北向资金分布
   */
  industryDistribution(
    holdings: NorthboundHolding[]
  ): { industry: string; totalValue: number; change5D: number; stockCount: number }[] {
    const industryMap = new Map<string, { totalValue: number; change: number; count: number }>();

    for (const h of holdings) {
      const existing = industryMap.get(h.industry) || { totalValue: 0, change: 0, count: 0 };
      existing.totalValue += h.marketValue;
      existing.change += h.changeFromPrev;
      existing.count++;
      industryMap.set(h.industry, existing);
    }

    return Array.from(industryMap.entries())
      .map(([industry, data]) => ({
        industry,
        totalValue: data.totalValue,
        change5D: data.change / Math.max(1, data.count),
        stockCount: data.count
      }))
      .sort((a, b) => b.totalValue - a.totalValue);
  }

  /**
   * 北向资金异常检测
   */
  detectAnomalies(
    flows: NorthboundFlow[],
    threshold: number = 2 // 标准差倍数
  ): { date: string; netBuy: number; zScore: number; type: 'surge' | 'plunge' }[] {
    if (flows.length < 10) return [];

    const values = flows.map(f => f.netBuy);
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    const variance = values.reduce((s, v) => s + Math.pow(v - mean, 2), 0) / values.length;
    const std = Math.sqrt(variance);

    if (std === 0) return [];

    return flows
      .map(f => {
        const zScore = (f.netBuy - mean) / std;
        return {
          date: f.date,
          netBuy: f.netBuy,
          zScore,
          type: zScore > threshold ? 'surge' as const : zScore < -threshold ? 'plunge' as const : 'surge' as const
        };
      })
      .filter(a => Math.abs(a.zScore) > threshold)
      .map(a => ({ ...a, type: a.zScore > threshold ? 'surge' as const : 'plunge' as const }));
  }

  /**
   * 北向资金择时回测
   */
  timingBacktest(
    flows: NorthboundFlow[],
    prices: { date: string; close: number }[]
  ): {
    totalReturn: number;
    annualizedReturn: number;
    maxDrawdown: number;
    winRate: number;
    trades: number;
  } {
    if (flows.length < 20 || prices.length < 20) {
      return { totalReturn: 0, annualizedReturn: 0, maxDrawdown: 0, winRate: 0, trades: 0 };
    }

    const sorted = [...flows].sort((a, b) => a.date.localeCompare(b.date));
    const priceMap = new Map(prices.map(p => [p.date, p.close]));

    let position = 0;
    let cash = 100000;
    let trades = 0;
    let wins = 0;
    let entryPrice = 0;
    const equity: number[] = [];

    for (let i = 20; i < sorted.length; i++) {
      const window = sorted.slice(i - 20, i);
      const _netFlow20D = window.reduce((s, f) => s + f.netBuy, 0);
      const price = priceMap.get(sorted[i].date) || 0;

      if (price <= 0) continue;

      // 北向连续5日净买入→买入
      const last5 = sorted.slice(i - 5, i);
      const allBuy = last5.every(f => f.netBuy > 0);

      if (allBuy && position === 0) {
        position = cash / price;
        entryPrice = price;
        cash = 0;
        trades++;
      }
      // 北向连续3日净卖出→卖出
      else if (position > 0) {
        const last3 = sorted.slice(i - 3, i);
        const allSell = last3.every(f => f.netBuy < 0);
        if (allSell) {
          cash = position * price;
          if (price > entryPrice) wins++;
          position = 0;
        }
      }

      equity.push(cash + position * price);
    }

    const totalReturn = equity.length > 0 
      ? (equity[equity.length - 1] - 100000) / 100000 * 100 : 0;
    const annualizedReturn = totalReturn * (252 / Math.max(1, flows.length));
    
    // 最大回撤
    let maxDrawdown = 0;
    let peak = equity[0] || 0;
    for (const e of equity) {
      if (e > peak) peak = e;
      const dd = (peak - e) / peak * 100;
      maxDrawdown = Math.max(maxDrawdown, dd);
    }

    const winRate = trades > 0 ? wins / trades * 100 : 0;

    return { totalReturn, annualizedReturn, maxDrawdown, winRate, trades };
  }
}
