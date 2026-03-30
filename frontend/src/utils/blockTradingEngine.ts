/**
 * 大宗交易分析引擎
 * 折溢价分析、机构行为、异常交易检测
 */

export interface BlockTrade {
  ticker: string;
  name: string;
  price: number;
  closePrice: number;
  volume: number;
  amount: number;
  buyer: string;
  seller: string;
  discount: number; // 折溢价率 (负数为折价)
  date: string;
}

export interface BlockTradeSummary {
  totalCount: number;
  totalAmount: number;
  avgDiscount: number;
  discountCount: number;
  premiumCount: number;
  avgVolume: number;
  topBuyer: string;
  topSeller: string;
}

export interface InstitutionalBehavior {
  institution: string;
  buyCount: number;
  sellCount: number;
  netAmount: number;
  focusSectors: string[];
  signal: 'accumulating' | 'distributing' | 'balanced';
}

export interface BlockTradeAnomaly {
  trade: BlockTrade;
  anomalyType: 'large_discount' | 'large_premium' | 'unusual_size' | 'repeat_buyer' | 'insider_flow';
  severity: 'high' | 'medium' | 'low';
  description: string;
}

/**
 * 大宗交易汇总
 */
export function summarizeBlockTrades(trades: BlockTrade[]): BlockTradeSummary {
  if (trades.length === 0) {
    return {
      totalCount: 0, totalAmount: 0, avgDiscount: 0,
      discountCount: 0, premiumCount: 0, avgVolume: 0,
      topBuyer: '', topSeller: '',
    };
  }

  const totalAmount = trades.reduce((s, t) => s + t.amount, 0);
  const avgDiscount = trades.reduce((s, t) => s + t.discount, 0) / trades.length;
  const discountCount = trades.filter((t) => t.discount < 0).length;
  const premiumCount = trades.filter((t) => t.discount > 0).length;
  const avgVolume = trades.reduce((s, t) => s + t.volume, 0) / trades.length;

  // 统计买卖方频次
  const buyerFreq = new Map<string, number>();
  const sellerFreq = new Map<string, number>();
  for (const t of trades) {
    buyerFreq.set(t.buyer, (buyerFreq.get(t.buyer) ?? 0) + 1);
    sellerFreq.set(t.seller, (sellerFreq.get(t.seller) ?? 0) + 1);
  }

  const topBuyer = Array.from(buyerFreq.entries()).sort((a, b) => b[1] - a[1])[0]?.[0] ?? '';
  const topSeller = Array.from(sellerFreq.entries()).sort((a, b) => b[1] - a[1])[0]?.[0] ?? '';

  return {
    totalCount: trades.length,
    totalAmount: Math.round(totalAmount),
    avgDiscount: Math.round(avgDiscount * 100) / 100,
    discountCount,
    premiumCount,
    avgVolume: Math.round(avgVolume),
    topBuyer,
    topSeller,
  };
}

/**
 * 机构行为分析
 */
export function analyzeInstitutionalBehavior(
  trades: BlockTrade[],
  sectorMap: Map<string, string> // ticker -> sector
): InstitutionalBehavior[] {
  const instMap = new Map<string, { buyCount: number; sellCount: number; netAmount: number; sectors: Map<string, number> }>();

  for (const trade of trades) {
    // 买方
    const buyer = instMap.get(trade.buyer) ?? { buyCount: 0, sellCount: 0, netAmount: 0, sectors: new Map() };
    buyer.buyCount++;
    buyer.netAmount += trade.amount;
    const bSector = sectorMap.get(trade.ticker) ?? '其他';
    buyer.sectors.set(bSector, (buyer.sectors.get(bSector) ?? 0) + trade.amount);
    instMap.set(trade.buyer, buyer);

    // 卖方
    const seller = instMap.get(trade.seller) ?? { buyCount: 0, sellCount: 0, netAmount: 0, sectors: new Map() };
    seller.sellCount++;
    seller.netAmount -= trade.amount;
    const sSector = sectorMap.get(trade.ticker) ?? '其他';
    seller.sectors.set(sSector, (seller.sectors.get(sSector) ?? 0) + trade.amount);
    instMap.set(trade.seller, seller);
  }

  return Array.from(instMap.entries())
    .map(([institution, data]) => {
      const focusSectors = Array.from(data.sectors.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([s]) => s);

      let signal: InstitutionalBehavior['signal'];
      if (data.buyCount > data.sellCount * 1.5) signal = 'accumulating';
      else if (data.sellCount > data.buyCount * 1.5) signal = 'distributing';
      else signal = 'balanced';

      return {
        institution,
        buyCount: data.buyCount,
        sellCount: data.sellCount,
        netAmount: Math.round(data.netAmount),
        focusSectors,
        signal,
      };
    })
    .sort((a, b) => Math.abs(b.netAmount) - Math.abs(a.netAmount));
}

/**
 * 异常大宗交易检测
 */
export function detectAnomalies(trades: BlockTrade[]): BlockTradeAnomaly[] {
  const anomalies: BlockTradeAnomaly[] = [];

  // 计算统计量
  const amounts = trades.map((t) => t.amount);
  const avgAmount = amounts.reduce((a, b) => a + b, 0) / amounts.length;
  const stdAmount = Math.sqrt(amounts.reduce((s, a) => s + (a - avgAmount) ** 2, 0) / amounts.length);

  const discounts = trades.map((t) => t.discount);
  const avgDiscount = discounts.reduce((a, b) => a + b, 0) / discounts.length;
  const stdDiscount = Math.sqrt(discounts.reduce((s, d) => s + (d - avgDiscount) ** 2, 0) / discounts.length);

  for (const trade of trades) {
    // 大幅折价
    if (trade.discount < avgDiscount - 2 * stdDiscount && trade.discount < -5) {
      anomalies.push({
        trade,
        anomalyType: 'large_discount',
        severity: trade.discount < -10 ? 'high' : 'medium',
        description: `${trade.name}大宗交易折价${Math.abs(trade.discount).toFixed(1)}%，大幅低于市场价`,
      });
    }

    // 大幅溢价
    if (trade.discount > avgDiscount + 2 * stdDiscount && trade.discount > 5) {
      anomalies.push({
        trade,
        anomalyType: 'large_premium',
        severity: trade.discount > 10 ? 'high' : 'medium',
        description: `${trade.name}大宗交易溢价${trade.discount.toFixed(1)}%，机构溢价抢筹`,
      });
    }

    // 异常规模
    if (trade.amount > avgAmount + 3 * stdAmount) {
      anomalies.push({
        trade,
        anomalyType: 'unusual_size',
        severity: trade.amount > avgAmount * 5 ? 'high' : 'medium',
        description: `${trade.name}大宗交易金额${(trade.amount / 1e8).toFixed(1)}亿，异常大额`,
      });
    }
  }

  // 重复买方
  const buyerTrades = new Map<string, BlockTrade[]>();
  for (const t of trades) {
    const arr = buyerTrades.get(t.buyer) ?? [];
    arr.push(t);
    buyerTrades.set(t.buyer, arr);
  }
  for (const [buyer, bTrades] of buyerTrades) {
    if (bTrades.length >= 3) {
      for (const t of bTrades) {
        anomalies.push({
          trade: t,
          anomalyType: 'repeat_buyer',
          severity: 'medium',
          description: `${buyer}连续买入${bTrades.length}笔大宗交易，集中建仓信号`,
        });
      }
    }
  }

  return anomalies.sort((a, b) => {
    const severityOrder = { high: 3, medium: 2, low: 1 };
    return severityOrder[b.severity] - severityOrder[a.severity];
  });
}

/**
 * 大宗交易趋势分析
 */
export function blockTradeTrend(
  trades: BlockTrade[],
  windowDays: number = 5
): {
  date: string;
  count: number;
  totalAmount: number;
  avgDiscount: number;
  trend: 'increasing' | 'decreasing' | 'stable';
}[] {
  const byDate = new Map<string, BlockTrade[]>();
  for (const t of trades) {
    const arr = byDate.get(t.date) ?? [];
    arr.push(t);
    byDate.set(t.date, arr);
  }

  const dates = Array.from(byDate.keys()).sort();
  const result = dates.map((date, i) => {
    const dayTrades = byDate.get(date)!;
    const count = dayTrades.length;
    const totalAmount = dayTrades.reduce((s, t) => s + t.amount, 0);
    const avgDiscount = dayTrades.reduce((s, t) => s + t.discount, 0) / count;

    // 与前N天对比
    let trend: 'increasing' | 'decreasing' | 'stable' = 'stable';
    if (i >= windowDays) {
      const prevWindow = dates.slice(i - windowDays, i);
      const prevAvg = prevWindow.reduce((s, d) => s + (byDate.get(d)!.reduce((ss, t) => ss + t.amount, 0)), 0) / windowDays;
      if (totalAmount > prevAvg * 1.3) trend = 'increasing';
      else if (totalAmount < prevAvg * 0.7) trend = 'decreasing';
    }

    return {
      date,
      count,
      totalAmount: Math.round(totalAmount),
      avgDiscount: Math.round(avgDiscount * 100) / 100,
      trend,
    };
  });

  return result;
}
