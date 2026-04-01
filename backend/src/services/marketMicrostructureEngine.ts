/**
 * 市场微观结构引擎 - Round 722
 * 分析订单流、买卖压力、价格冲击
 */
export interface TradeTick {
  price: number;
  volume: number;
  timestamp: number;
  direction: 'buy' | 'sell' | 'neutral';
}

export interface OrderFlowMetrics {
  buyVolume: number;
  sellVolume: number;
  netVolume: number;
  buyRatio: number;
  vwap: number;
  twap: number;
  priceImpact: number;
  orderImbalance: number;
  tradeCount: number;
  avgTradeSize: number;
  largeTradeRatio: number;
}

export interface LiquidityMetrics {
  bidAskSpread: number;
  depth: number;
  resilience: number;
  tightness: number;
  marketDepthScore: number;
}

export function analyzeOrderFlow(trades: TradeTick[]): OrderFlowMetrics {
  if (trades.length === 0) {
    return {
      buyVolume: 0, sellVolume: 0, netVolume: 0, buyRatio: 0,
      vwap: 0, twap: 0, priceImpact: 0, orderImbalance: 0,
      tradeCount: 0, avgTradeSize: 0, largeTradeRatio: 0,
    };
  }

  const buyTrades = trades.filter(t => t.direction === 'buy');
  const sellTrades = trades.filter(t => t.direction === 'sell');

  const buyVolume = buyTrades.reduce((s, t) => s + t.volume, 0);
  const sellVolume = sellTrades.reduce((s, t) => s + t.volume, 0);
  const totalVolume = buyVolume + sellVolume;
  const netVolume = buyVolume - sellVolume;

  // VWAP
  const totalValue = trades.reduce((s, t) => s + t.price * t.volume, 0);
  const vwap = totalVolume > 0 ? totalValue / totalVolume : 0;

  // TWAP (time-weighted)
  const twap = trades.reduce((s, t) => s + t.price, 0) / trades.length;

  // Price impact: correlation between signed volume and price changes
  let priceImpact = 0;
  if (trades.length > 1) {
    const returns: number[] = [];
    const signedVolumes: number[] = [];
    for (let i = 1; i < trades.length; i++) {
      returns.push((trades[i].price - trades[i - 1].price) / trades[i - 1].price);
      signedVolumes.push(trades[i].direction === 'buy' ? trades[i].volume : -trades[i].volume);
    }
    const avgReturn = returns.reduce((s, r) => s + r, 0) / returns.length;
    const avgSignedVol = signedVolumes.reduce((s, v) => s + v, 0) / signedVolumes.length;
    let cov = 0, varR = 0;
    for (let i = 0; i < returns.length; i++) {
      cov += (returns[i] - avgReturn) * (signedVolumes[i] - avgSignedVol);
      varR += (returns[i] - avgReturn) ** 2;
    }
    priceImpact = varR > 0 ? cov / varR : 0;
  }

  // Order imbalance
  const orderImbalance = totalVolume > 0 ? netVolume / totalVolume : 0;

  // Large trade analysis (>2x average)
  const avgSize = totalVolume / trades.length;
  const largeTrades = trades.filter(t => t.volume > avgSize * 2);
  const largeTradeRatio = largeTrades.length / trades.length;

  return {
    buyVolume,
    sellVolume,
    netVolume,
    buyRatio: totalVolume > 0 ? buyVolume / totalVolume : 0,
    vwap,
    twap,
    priceImpact,
    orderImbalance,
    tradeCount: trades.length,
    avgTradeSize: avgSize,
    largeTradeRatio,
  };
}

export function calculateLiquidity(
  bids: { price: number; volume: number }[],
  asks: { price: number; volume: number }[]
): LiquidityMetrics {
  if (bids.length === 0 || asks.length === 0) {
    return { bidAskSpread: 0, depth: 0, resilience: 0, tightness: 0, marketDepthScore: 0 };
  }

  const bestBid = Math.max(...bids.map(b => b.price));
  const bestAsk = Math.min(...asks.map(a => a.price));
  const midPrice = (bestBid + bestAsk) / 2;

  const bidAskSpread = (bestAsk - bestBid) / midPrice;
  const totalDepth = bids.reduce((s, b) => s + b.volume, 0) + asks.reduce((s, a) => s + a.volume, 0);
  const tightness = bidAskSpread;
  const resilience = totalDepth / midPrice;
  const marketDepthScore = totalDepth / (bidAskSpread * midPrice + 1e-10);

  return {
    bidAskSpread,
    depth: totalDepth,
    resilience,
    tightness,
    marketDepthScore: Math.min(marketDepthScore, 1000),
  };
}

export function detectSpoofingPatterns(trades: TradeTick[]): { detected: boolean; patterns: string[] } {
  const patterns: string[] = [];
  if (trades.length < 10) return { detected: false, patterns };

  // Rapid order cancellation pattern (alternating large/small)
  let altCount = 0;
  for (let i = 2; i < trades.length; i++) {
    const avg = (trades[i].volume + trades[i - 1].volume + trades[i - 2].volume) / 3;
    if (trades[i].volume > avg * 3 || trades[i].volume < avg * 0.1) altCount++;
  }
  if (altCount > trades.length * 0.3) patterns.push('rapid_size_alternation');

  // Layering detection (many orders at same price level)
  const priceCounts = new Map<number, number>();
  for (const t of trades) {
    priceCounts.set(t.price, (priceCounts.get(t.price) || 0) + 1);
  }
  const maxCount = Math.max(...priceCounts.values());
  if (maxCount > trades.length * 0.4) patterns.push('price_layering');

  return { detected: patterns.length > 0, patterns };
}

export function calculateKyleLambda(trades: TradeTick[]): number {
  if (trades.length < 3) return 0;
  // Kyle's lambda: price impact per unit of signed order flow
  const returns: number[] = [];
  const signedFlows: number[] = [];
  for (let i = 1; i < trades.length; i++) {
    returns.push(Math.abs(trades[i].price - trades[i - 1].price) / trades[i - 1].price);
    signedFlows.push(Math.abs(trades[i].direction === 'buy' ? trades[i].volume : -trades[i].volume));
  }
  const avgR = returns.reduce((s, r) => s + r, 0) / returns.length;
  const avgF = signedFlows.reduce((s, f) => s + f, 0) / signedFlows.length;
  let cov = 0, varF = 0;
  for (let i = 0; i < returns.length; i++) {
    cov += (returns[i] - avgR) * (signedFlows[i] - avgF);
    varF += (signedFlows[i] - avgF) ** 2;
  }
  return varF > 0 ? cov / varF : 0;
}
