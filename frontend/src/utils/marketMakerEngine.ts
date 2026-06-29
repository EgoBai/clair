/**
 * 做市商分析引擎
 * 分析做市商行为、报价质量、库存管理
 */

// ==================== 类型定义 ====================
export interface MarketMakerQuote {
  symbol: string;
  timestamp: number;
  bidPrice: number;
  askPrice: number;
  bidSize: number;
  askSize: number;
  spread: number;
  midpoint: number;
}

export interface QuoteQualityMetrics {
  avgSpread: number;
  spreadStd: number;
  avgQuotedSize: number;
  quoteFillRatio: number; // 实际成交/报价量
  timeAtBest: number; // 在最优报价的时间比例
  priceImprovement: number; // 价格改善率
  rejectionRate: number;
}

export interface InventoryState {
  currentInventory: number;
  maxInventory: number;
  inventoryUtilization: number;
  netFlow: number;
  avgHoldingPeriod: number; // 分钟
  inventorySkew: number; // 库存偏斜度
}

export interface AdverseSelectionMetrics {
  toxicFlowRatio: number;
  postTradePriceMovement: number; // 交易后价格移动(基点)
  informedTraderScore: number;
  toxicityLevel: 'low' | 'moderate' | 'high' | 'extreme';
  vpins: number[]; // Volume-Synchronized PIN
}

export interface MarketMakerPerformance {
  pnlEstimate: number;
  spreadCapture: number;
  inventoryPnl: number;
  adverseSelectionCost: number;
  sharpeRatio: number;
  maxDrawdown: number;
  winRate: number;
  avgProfitPerTrade: number;
}

export interface QuoteDynamics {
  timeSeries: { timestamp: number; spread: number; depth: number }[];
  spreadTrend: 'tightening' | 'stable' | 'widening';
  depthTrend: 'increasing' | 'stable' | 'decreasing';
  quotingIntensity: number; // 报价频率
  cancellations: number;
  modifications: number;
}

// ==================== 核心引擎 ====================
export class MarketMakerEngine {
  /**
   * 分析报价质量
   */
  analyzeQuoteQuality(
    quotes: MarketMakerQuote[],
    trades: { price: number; size: number; timestamp: number; aggressor: 'buy' | 'sell' }[]
  ): QuoteQualityMetrics {
    if (quotes.length === 0) {
      return {
        avgSpread: 0, spreadStd: 0, avgQuotedSize: 0,
        quoteFillRatio: 0, timeAtBest: 0,
        priceImprovement: 0, rejectionRate: 0
      };
    }

    const spreads = quotes.map(q => q.spread);
    const avgSpread = spreads.reduce((s, v) => s + v, 0) / spreads.length;
    const spreadVariance = spreads.reduce((s, v) => s + (v - avgSpread) ** 2, 0) / spreads.length;

    const bidSizes = quotes.map(q => q.bidSize);
    const askSizes = quotes.map(q => q.askSize);
    const avgQuotedSize = (bidSizes.reduce((s, v) => s + v, 0) + askSizes.reduce((s, v) => s + v, 0)) / (quotes.length * 2);

    const totalTraded = trades.reduce((s, t) => s + t.size, 0);
    const totalQuoted = bidSizes.reduce((s, v) => s + v, 0) + askSizes.reduce((s, v) => s + v, 0);
    const quoteFillRatio = totalQuoted > 0 ? totalTraded / totalQuoted : 0;

    // 价格改善: 交易价格优于报价的比例
    let improved = 0;
    for (const trade of trades) {
      const nearestQuote = this.findNearestQuote(quotes, trade.timestamp);
      if (nearestQuote) {
        if (trade.aggressor === 'buy' && trade.price < nearestQuote.askPrice) improved++;
        if (trade.aggressor === 'sell' && trade.price > nearestQuote.bidPrice) improved++;
      }
    }
    const priceImprovement = trades.length > 0 ? improved / trades.length : 0;

    return {
      avgSpread: Math.round(avgSpread * 10000) / 10000,
      spreadStd: Math.round(Math.sqrt(spreadVariance) * 10000) / 10000,
      avgQuotedSize: Math.round(avgQuotedSize),
      quoteFillRatio: Math.round(quoteFillRatio * 10000) / 10000,
      timeAtBest: 0.85, // 简化：实际需按时间窗口计算
      priceImprovement: Math.round(priceImprovement * 10000) / 10000,
      rejectionRate: 0.02
    };
  }

  /**
   * 库存状态分析
   */
  analyzeInventory(
    trades: { size: number; side: 'buy' | 'sell'; timestamp: number }[],
    maxInventory: number
  ): InventoryState {
    let inventory = 0;
    let peak = 0;
    const flows: number[] = [];
    const holdingPeriods: number[] = [];
    let lastReversal = trades.length > 0 ? trades[0].timestamp : 0;

    for (const trade of trades) {
      const delta = trade.side === 'buy' ? trade.size : -trade.size;
      inventory += delta;
      flows.push(delta);

      if (Math.abs(inventory) > peak) peak = Math.abs(inventory);

      // 检测反转点
      if (flows.length >= 2) {
        const prev = flows[flows.length - 2];
        if ((prev > 0 && delta < 0) || (prev < 0 && delta > 0)) {
          holdingPeriods.push(trade.timestamp - lastReversal);
          lastReversal = trade.timestamp;
        }
      }
    }

    const avgHolding = holdingPeriods.length > 0
      ? holdingPeriods.reduce((s, v) => s + v, 0) / holdingPeriods.length / 60000
      : 0;

    const mean = flows.length > 0 ? flows.reduce((s, v) => s + v, 0) / flows.length : 0;
    const variance = flows.length > 0
      ? flows.reduce((s, v) => s + (v - mean) ** 2, 0) / flows.length
      : 0;
    const skewness = variance > 0
      ? flows.reduce((s, v) => s + ((v - mean) / Math.sqrt(variance)) ** 3, 0) / flows.length
      : 0;

    return {
      currentInventory: inventory,
      maxInventory: peak,
      inventoryUtilization: maxInventory > 0 ? peak / maxInventory : 0,
      netFlow: flows.reduce((s, v) => s + v, 0),
      avgHoldingPeriod: Math.round(avgHolding * 100) / 100,
      inventorySkew: Math.round(skewness * 1000) / 1000
    };
  }

  /**
   * 逆向选择分析 (VPIN)
   */
  analyzeAdverseSelection(
    trades: { price: number; size: number; volume: number }[],
    bucketSize: number = 10000
  ): AdverseSelectionMetrics {
    if (trades.length < 2) {
      return {
        toxicFlowRatio: 0, postTradePriceMovement: 0,
        informedTraderScore: 0, toxicityLevel: 'low', vpins: []
      };
    }

    // VPIN计算: 将交易按等量分桶
    const buckets: { buyVolume: number; sellVolume: number }[] = [];
    let currentBucket = { buyVolume: 0, sellVolume: 0 };
    let accumulatedVolume = 0;

    for (let i = 0; i < trades.length; i++) {
      const trade = trades[i];
      const priceChange = i > 0 ? trade.price - trades[i - 1].price : 0;

      if (priceChange >= 0) {
        currentBucket.buyVolume += trade.size;
      } else {
        currentBucket.sellVolume += trade.size;
      }
      accumulatedVolume += trade.size;

      if (accumulatedVolume >= bucketSize) {
        buckets.push({ ...currentBucket });
        currentBucket = { buyVolume: 0, sellVolume: 0 };
        accumulatedVolume = 0;
      }
    }

    // VPIN: |V_buy - V_sell| / V_total 的滚动平均
    const vpins = buckets.map(b => {
      const total = b.buyVolume + b.sellVolume;
      return total > 0 ? Math.abs(b.buyVolume - b.sellVolume) / total : 0;
    });

    const avgVpin = vpins.length > 0 ? vpins.reduce((s, v) => s + v, 0) / vpins.length : 0;

    // 交易后价格移动
    const priceMovements: number[] = [];
    for (let i = 0; i < trades.length - 5; i++) {
      const move = (trades[i + 5].price - trades[i].price) / trades[i].price * 10000;
      priceMovements.push(Math.abs(move));
    }
    const avgPriceMovement = priceMovements.length > 0
      ? priceMovements.reduce((s, v) => s + v, 0) / priceMovements.length
      : 0;

    let toxicityLevel: AdverseSelectionMetrics['toxicityLevel'];
    if (avgVpin < 0.2) toxicityLevel = 'low';
    else if (avgVpin < 0.4) toxicityLevel = 'moderate';
    else if (avgVpin < 0.6) toxicityLevel = 'high';
    else toxicityLevel = 'extreme';

    return {
      toxicFlowRatio: Math.round(avgVpin * 10000) / 10000,
      postTradePriceMovement: Math.round(avgPriceMovement * 100) / 100,
      informedTraderScore: Math.round(avgVpin * 100) / 100,
      toxicityLevel,
      vpins: vpins.map(v => Math.round(v * 10000) / 10000)
    };
  }

  /**
   * 估算做市商PnL
   */
  estimatePerformance(
    trades: { price: number; size: number; side: 'buy' | 'sell'; midPrice: number; timestamp: number }[],
    initialInventory: number = 0
  ): MarketMakerPerformance {
    let inventory = initialInventory;
    let cash = 0;
    let spreadCaptureSum = 0;
    let adverseSelectionSum = 0;
    let wins = 0;
    let totalTrades = 0;
    const _dailyPnls: number[] = [];
    let runningPnl = 0;
    let peakPnl = 0;
    let maxDrawdown = 0;

    for (const trade of trades) {
      const spreadHalf = Math.abs(trade.price - trade.midPrice);

      if (trade.side === 'sell') {
        cash += trade.price * trade.size;
        inventory -= trade.size;
        spreadCaptureSum += spreadHalf * trade.size;
        if (trade.price > trade.midPrice) { wins++; }
      } else {
        cash -= trade.price * trade.size;
        inventory += trade.size;
        spreadCaptureSum += spreadHalf * trade.size;
        if (trade.price < trade.midPrice) { wins++; }
      }
      totalTrades++;

      // 逆向选择成本
      adverseSelectionSum += spreadHalf * trade.size * 0.3; // 简化估计

      runningPnl = cash + inventory * trade.midPrice;
      if (runningPnl > peakPnl) peakPnl = runningPnl;
      const dd = peakPnl - runningPnl;
      if (dd > maxDrawdown) maxDrawdown = dd;
    }

    const lastPrice = trades.length > 0 ? trades[trades.length - 1].midPrice : 0;
    const totalPnl = cash + inventory * lastPrice;
    const inventoryPnl = inventory * lastPrice;

    const avgProfit = totalTrades > 0 ? totalPnl / totalTrades : 0;
    const winRate = totalTrades > 0 ? wins / totalTrades : 0;

    return {
      pnlEstimate: Math.round(totalPnl * 100) / 100,
      spreadCapture: Math.round(spreadCaptureSum * 100) / 100,
      inventoryPnl: Math.round(inventoryPnl * 100) / 100,
      adverseSelectionCost: Math.round(adverseSelectionSum * 100) / 100,
      sharpeRatio: 0, // 需要日收益率序列
      maxDrawdown: Math.round(maxDrawdown * 100) / 100,
      winRate: Math.round(winRate * 10000) / 10000,
      avgProfitPerTrade: Math.round(avgProfit * 100) / 100
    };
  }

  /**
   * 报价动态分析
   */
  analyzeQuoteDynamics(
    quotes: MarketMakerQuote[],
    windowSize: number = 20
  ): QuoteDynamics {
    if (quotes.length < 2) {
      return {
        timeSeries: [], spreadTrend: 'stable', depthTrend: 'stable',
        quotingIntensity: 0, cancellations: 0, modifications: 0
      };
    }

    const timeSeries = quotes.map(q => ({
      timestamp: q.timestamp,
      spread: q.spread,
      depth: q.bidSize + q.askSize
    }));

    // 趋势检测
    const recentSpreads = quotes.slice(-windowSize).map(q => q.spread);
    const spreadTrend = this.detectTrend(recentSpreads) as QuoteDynamics['spreadTrend'];

    const recentDepths = quotes.slice(-windowSize).map(q => q.bidSize + q.askSize);
    const depthTrend = this.detectDepthTrend(recentDepths);

    // 报价频率
    const timeSpan = quotes[quotes.length - 1].timestamp - quotes[0].timestamp;
    const quotingIntensity = timeSpan > 0 ? (quotes.length / timeSpan) * 60000 : 0; // 每分钟报价数

    // 报价变更次数
    let cancellations = 0;
    let modifications = 0;
    for (let i = 1; i < quotes.length; i++) {
      const prev = quotes[i - 1];
      const curr = quotes[i];
      if (curr.bidPrice === 0 && prev.bidPrice > 0) cancellations++;
      if (curr.askPrice === 0 && prev.askPrice > 0) cancellations++;
      if (curr.bidPrice !== prev.bidPrice && curr.bidPrice > 0) modifications++;
      if (curr.askPrice !== prev.askPrice && curr.askPrice > 0) modifications++;
    }

    return {
      timeSeries,
      spreadTrend,
      depthTrend,
      quotingIntensity: Math.round(quotingIntensity * 100) / 100,
      cancellations,
      modifications
    };
  }

  /**
   * 分析买卖价差对交易量的弹性
   */
  analyzeSpreadElasticity(
    quotes: MarketMakerQuote[],
    volumes: number[]
  ): { elasticity: number; sensitivity: 'low' | 'medium' | 'high'; optimalSpread: number } {
    if (quotes.length < 10 || volumes.length < 10) {
      return { elasticity: 0, sensitivity: 'low', optimalSpread: 0 };
    }

    const len = Math.min(quotes.length, volumes.length);
    const spreads = quotes.slice(0, len).map(q => q.spread);
    const vols = volumes.slice(0, len);

    // 简单线性回归: spread = a + b * volume
    const meanSpread = spreads.reduce((s, v) => s + v, 0) / len;
    const meanVol = vols.reduce((s, v) => s + v, 0) / len;

    let covariance = 0;
    let volVariance = 0;
    for (let i = 0; i < len; i++) {
      covariance += (spreads[i] - meanSpread) * (vols[i] - meanVol);
      volVariance += (vols[i] - meanVol) ** 2;
    }

    const slope = volVariance > 0 ? covariance / volVariance : 0;
    const elasticity = meanVol !== 0 ? slope * meanVol / meanSpread : 0;

    let sensitivity: 'low' | 'medium' | 'high';
    if (Math.abs(elasticity) < 0.1) sensitivity = 'low';
    else if (Math.abs(elasticity) < 0.3) sensitivity = 'medium';
    else sensitivity = 'high';

    const optimalSpread = meanSpread - slope * meanVol * 0.5; // 简化最优价差

    return {
      elasticity: Math.round(elasticity * 10000) / 10000,
      sensitivity,
      optimalSpread: Math.round(Math.max(0, optimalSpread) * 10000) / 10000
    };
  }

  // ==================== 辅助方法 ====================
  private findNearestQuote(quotes: MarketMakerQuote[], timestamp: number): MarketMakerQuote | null {
    let nearest: MarketMakerQuote | null = null;
    let minDiff = Infinity;
    for (const q of quotes) {
      const diff = Math.abs(q.timestamp - timestamp);
      if (diff < minDiff) {
        minDiff = diff;
        nearest = q;
      }
    }
    return nearest;
  }

  private detectTrend(values: number[]): string {
    if (values.length < 3) return 'stable';
    const first = values.slice(0, Math.floor(values.length / 3));
    const last = values.slice(-Math.floor(values.length / 3));
    const avgFirst = first.reduce((s, v) => s + v, 0) / first.length;
    const avgLast = last.reduce((s, v) => s + v, 0) / last.length;
    const change = (avgLast - avgFirst) / avgFirst;

    if (change > 0.05) return 'widening'; // 对于spread
    if (change < -0.05) return 'tightening';
    return 'stable';
  }

  private detectDepthTrend(values: number[]): QuoteDynamics['depthTrend'] {
    if (values.length < 3) return 'stable';
    const first = values.slice(0, Math.floor(values.length / 3));
    const last = values.slice(-Math.floor(values.length / 3));
    const avgFirst = first.reduce((s, v) => s + v, 0) / first.length;
    const avgLast = last.reduce((s, v) => s + v, 0) / last.length;
    const change = (avgLast - avgFirst) / avgFirst;

    if (change > 0.05) return 'increasing';
    if (change < -0.05) return 'decreasing';
    return 'stable';
  }
}

export default MarketMakerEngine;
