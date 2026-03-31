/**
 * 市场微观结构分析引擎
 * - 买卖价差分析
 * - 订单簿不平衡
 * - 流动性指标
 * - 价格冲击估计
 */

export interface OrderBookLevel {
  price: number;
  volume: number;
}

export interface OrderBook {
  bids: OrderBookLevel[];
  asks: OrderBookLevel[];
  timestamp: number;
}

export interface TradeTick {
  price: number;
  volume: number;
  timestamp: number;
  aggressor: 'buy' | 'sell';
}

export interface MicrostructureResult {
  spread: number;            // 绝对价差
  spreadBps: number;         // 基点价差
  midPrice: number;          // 中间价
  orderImbalance: number;    // -1到1, 正=买方压力
  liquidityScore: number;    // 0-100
  effectiveSpread: number;   // 有效价差
  priceImpact: number;       // 价格冲击(bps)
  depth: { bid: number; ask: number }; // 买卖深度
}

export interface VWAPResult {
  vwap: number;
  twap: number;
  participation: number;   // 参与率(%)
  slippage: number;        // 滑点(bps)
}

export class MarketMicrostructureEngine {
  /**
   * 分析订单簿微观结构
   */
  analyzeOrderBook(book: OrderBook, levels: number = 5): MicrostructureResult {
    const topBids = book.bids.slice(0, levels);
    const topAsks = book.asks.slice(0, levels);

    if (topBids.length === 0 || topAsks.length === 0) {
      return {
        spread: 0, spreadBps: 0, midPrice: 0, orderImbalance: 0,
        liquidityScore: 0, effectiveSpread: 0, priceImpact: 0,
        depth: { bid: 0, ask: 0 },
      };
    }

    const bestBid = topBids[0].price;
    const bestAsk = topAsks[0].price;
    const spread = bestAsk - bestBid;
    const midPrice = (bestBid + bestAsk) / 2;
    const spreadBps = midPrice > 0 ? Math.round(spread / midPrice * 10000 * 100) / 100 : 0;

    // 买卖深度
    const bidDepth = topBids.reduce((s, l) => s + l.volume, 0);
    const askDepth = topAsks.reduce((s, l) => s + l.volume, 0);

    // 订单不平衡
    const totalDepth = bidDepth + askDepth;
    const orderImbalance = totalDepth > 0 ? Math.round((bidDepth - askDepth) / totalDepth * 10000) / 10000 : 0;

    // 流动性评分
    let liquidityScore = 50;
    if (spreadBps < 5) liquidityScore += 20;
    else if (spreadBps > 50) liquidityScore -= 20;
    if (totalDepth > 100000) liquidityScore += 15;
    else if (totalDepth < 10000) liquidityScore -= 15;
    liquidityScore = Math.max(0, Math.min(100, liquidityScore));

    // 有效价差 = 2 * |成交价 - 中间价|
    const effectiveSpread = spread; // 简化

    // 价格冲击估计 = spread / sqrt(depth)
    const priceImpact = totalDepth > 0 ? Math.round(spread / Math.sqrt(totalDepth / 1000) * 10000) / 10000 : 0;

    return {
      spread: Math.round(spread * 10000) / 10000,
      spreadBps,
      midPrice: Math.round(midPrice * 10000) / 10000,
      orderImbalance,
      liquidityScore,
      effectiveSpread: Math.round(effectiveSpread * 10000) / 10000,
      priceImpact,
      depth: { bid: bidDepth, ask: askDepth },
    };
  }

  /**
   * VWAP/TWAP计算
   */
  calculateVWAP(ticks: TradeTick[], targetVolume: number): VWAPResult {
    if (ticks.length === 0) return { vwap: 0, twap: 0, participation: 0, slippage: 0 };

    // VWAP
    let totalValue = 0, totalVolume = 0;
    for (const t of ticks) {
      totalValue += t.price * t.volume;
      totalVolume += t.volume;
    }
    const vwap = totalVolume > 0 ? totalValue / totalVolume : 0;

    // TWAP
    const twap = ticks.reduce((s, t) => s + t.price, 0) / ticks.length;

    // 参与率
    const participation = targetVolume > 0 ? Math.round(totalVolume / targetVolume * 10000) / 100 : 0;

    // 滑点 = |VWAP - TWAP| / TWAP * 10000
    const slippage = twap > 0 ? Math.round(Math.abs(vwap - twap) / twap * 10000 * 100) / 100 : 0;

    return {
      vwap: Math.round(vwap * 10000) / 10000,
      twap: Math.round(twap * 10000) / 10000,
      participation,
      slippage,
    };
  }

  /**
   * 买卖压力分析
   */
  analyzeBuySellPressure(ticks: TradeTick[]): { buyPressure: number; sellPressure: number; netPressure: number; aggressorRatio: number } {
    if (ticks.length === 0) return { buyPressure: 0, sellPressure: 0, netPressure: 0, aggressorRatio: 0.5 };

    const buyVolume = ticks.filter(t => t.aggressor === 'buy').reduce((s, t) => s + t.volume, 0);
    const sellVolume = ticks.filter(t => t.aggressor === 'sell').reduce((s, t) => s + t.volume, 0);
    const totalVolume = buyVolume + sellVolume;

    const buyPressure = totalVolume > 0 ? Math.round(buyVolume / totalVolume * 100) / 100 : 0;
    const sellPressure = totalVolume > 0 ? Math.round(sellVolume / totalVolume * 100) / 100 : 0;
    const netPressure = Math.round((buyPressure - sellPressure) * 100) / 100;
    const aggressorRatio = totalVolume > 0 ? Math.round(buyVolume / totalVolume * 100) / 100 : 0.5;

    return { buyPressure, sellPressure, netPressure, aggressorRatio };
  }

  /**
   * 最优执行策略估计
   */
  estimateOptimalExecution(totalShares: number, book: OrderBook, urgency: 'low' | 'medium' | 'high'): { slices: number; timeEstimate: number; expectedCost: number } {
    const depth = book.bids.reduce((s, l) => s + l.volume, 0) + book.asks.reduce((s, l) => s + l.volume, 0);
    const avgSliceSize = depth > 0 ? Math.max(100, Math.floor(depth / 20)) : totalShares;

    let slices: number, timeEstimate: number;
    switch (urgency) {
      case 'low':
        slices = Math.ceil(totalShares / avgSliceSize);
        timeEstimate = slices * 60; // 每片1分钟
        break;
      case 'medium':
        slices = Math.ceil(totalShares / (avgSliceSize * 2));
        timeEstimate = slices * 30;
        break;
      case 'high':
        slices = Math.ceil(totalShares / (avgSliceSize * 5));
        timeEstimate = slices * 10;
        break;
    }

    // 预期交易成本(bps)
    const spread = book.asks.length > 0 && book.bids.length > 0 ? book.asks[0].price - book.bids[0].price : 0;
    const midPrice = book.asks.length > 0 && book.bids.length > 0 ? (book.asks[0].price + book.bids[0].price) / 2 : 1;
    const spreadCost = midPrice > 0 ? spread / midPrice * 10000 / 2 : 0;
    const impactCost = totalShares / Math.max(1, depth) * 10;
    const expectedCost = Math.round((spreadCost + impactCost) * 100) / 100;

    return { slices, timeEstimate, expectedCost };
  }
}

export default new MarketMicrostructureEngine();
