/**
 * Market Microstructure Analysis Engine
 * 市场微观结构分析引擎 - 订单流分析、流动性分析、市场冲击模型
 */

export interface OrderBookLevel {
  price: number;
  quantity: number;
  orders: number;
}

export interface OrderBook {
  symbol: string;
  timestamp: number;
  bids: OrderBookLevel[];
  asks: OrderBookLevel[];
}

export interface TradeTick {
  timestamp: number;
  price: number;
  quantity: number;
  direction: 'buy' | 'sell' | 'unknown';
  aggressor: 'bid' | 'ask' | 'unknown';
}

export interface LiquidityMetrics {
  bidAskSpread: number;
  bidAskSpreadPercent: number;
  bidDepth: number;
  askDepth: number;
  depthImbalance: number;
  effectiveSpread: number;
  realizedSpread: number;
  priceImpact: number;
  liquidityScore: number;
}

export interface VolumeProfile {
  priceLevel: number;
  volume: number;
  buyVolume: number;
  sellVolume: number;
  poc: boolean; // Point of Control
  valueAreaHigh: number;
  valueAreaLow: number;
}

export interface OrderFlowImbalance {
  timestamp: number;
  buyVolume: number;
  sellVolume: number;
  netFlow: number;
  cumulativeFlow: number;
  delta: number;
}

export interface MarketImpactModel {
  symbol: string;
  temporaryImpact: number;
  permanentImpact: number;
  totalImpact: number;
  participationRate: number;
  optimalExecutionTime: number;
}

export interface TWAPResult {
  slices: { time: string; price: number; quantity: number }[];
  averagePrice: number;
  totalQuantity: number;
  benchmark: number;
  slippage: number;
}

export interface VWAPResult {
  averagePrice: number;
  totalVolume: number;
  benchmark: number;
  slippage: number;
  participationRate: number;
}

export function calculateBidAskSpread(bids: OrderBookLevel[], asks: OrderBookLevel[]): number {
  if (bids.length === 0 || asks.length === 0) return 0;
  return asks[0].price - bids[0].price;
}

export function calculateMidPrice(bids: OrderBookLevel[], asks: OrderBookLevel[]): number {
  if (bids.length === 0 || asks.length === 0) return 0;
  return (asks[0].price + bids[0].price) / 2;
}

export function calculateWeightedMidPrice(bids: OrderBookLevel[], asks: OrderBookLevel[]): number {
  if (bids.length === 0 || asks.length === 0) return 0;
  const bidWeight = bids[0].quantity;
  const askWeight = asks[0].quantity;
  const total = bidWeight + askWeight;
  if (total === 0) return calculateMidPrice(bids, asks);
  return (bids[0].price * askWeight + asks[0].price * bidWeight) / total;
}

export function calculateOrderBookImbalance(
  bids: OrderBookLevel[],
  asks: OrderBookLevel[],
  levels: number = 5
): number {
  const bidDepth = bids.slice(0, levels).reduce((sum, b) => sum + b.quantity, 0);
  const askDepth = asks.slice(0, levels).reduce((sum, a) => sum + a.quantity, 0);
  const total = bidDepth + askDepth;
  return total > 0 ? (bidDepth - askDepth) / total : 0;
}

export function calculateDepth(bids: OrderBookLevel[], asks: OrderBookLevel[], levels: number = 5): {
  bidDepth: number;
  askDepth: number;
  totalDepth: number;
} {
  const bidDepth = bids.slice(0, levels).reduce((sum, b) => sum + b.quantity, 0);
  const askDepth = asks.slice(0, levels).reduce((sum, a) => sum + a.quantity, 0);
  return { bidDepth, askDepth, totalDepth: bidDepth + askDepth };
}

export function calculateLiquidityMetrics(orderBook: OrderBook): LiquidityMetrics {
  const { bids, asks } = orderBook;
  const spread = calculateBidAskSpread(bids, asks);
  const mid = calculateMidPrice(bids, asks);
  const spreadPercent = mid > 0 ? spread / mid * 100 : 0;
  const { bidDepth, askDepth } = calculateDepth(bids, asks);
  const imbalance = calculateOrderBookImbalance(bids, asks);

  // Simplified effective spread (using first level)
  const effectiveSpread = spread;
  // Simplified realized spread
  const realizedSpread = spread * 0.5;
  // Price impact estimate
  const priceImpact = imbalance * spread * 0.1;
  // Liquidity score (0-100)
  const liquidityScore = Math.min(100, Math.max(0,
    100 - spreadPercent * 10 - Math.abs(imbalance) * 20
  ));

  return {
    bidAskSpread: spread,
    bidAskSpreadPercent: spreadPercent,
    bidDepth,
    askDepth,
    depthImbalance: imbalance,
    effectiveSpread,
    realizedSpread,
    priceImpact,
    liquidityScore,
  };
}

export function calculateVolumeProfile(
  ticks: TradeTick[],
  priceStep: number = 0.01
): VolumeProfile[] {
  if (ticks.length === 0) return [];

  const priceVolumes = new Map<number, { volume: number; buyVolume: number; sellVolume: number }>();

  for (const tick of ticks) {
    const level = Math.round(tick.price / priceStep) * priceStep;
    const existing = priceVolumes.get(level) ?? { volume: 0, buyVolume: 0, sellVolume: 0 };
    existing.volume += tick.quantity;
    if (tick.direction === 'buy') existing.buyVolume += tick.quantity;
    else if (tick.direction === 'sell') existing.sellVolume += tick.quantity;
    priceVolumes.set(level, existing);
  }

  const profiles: VolumeProfile[] = [];
  let maxVolume = 0;
  let pocPrice = 0;

  for (const [priceLevel, data] of priceVolumes) {
    profiles.push({
      priceLevel,
      volume: data.volume,
      buyVolume: data.buyVolume,
      sellVolume: data.sellVolume,
      poc: false,
      valueAreaHigh: 0,
      valueAreaLow: 0,
    });
    if (data.volume > maxVolume) {
      maxVolume = data.volume;
      pocPrice = priceLevel;
    }
  }

  // Mark POC
  for (const p of profiles) {
    if (p.priceLevel === pocPrice) p.poc = true;
  }

  // Calculate Value Area (70% of volume around POC)
  const sorted = [...profiles].sort((a, b) => a.priceLevel - b.priceLevel);
  const totalVolume = sorted.reduce((s, p) => s + p.volume, 0);
  const targetVolume = totalVolume * 0.7;
  let accumulatedVolume = 0;
  let vah = pocPrice;
  let val = pocPrice;

  const pocIdx = sorted.findIndex(p => p.poc);
  let upIdx = pocIdx;
  let downIdx = pocIdx;
  accumulatedVolume = sorted[pocIdx].volume;

  while (accumulatedVolume < targetVolume && (upIdx < sorted.length - 1 || downIdx > 0)) {
    const upVol = upIdx < sorted.length - 1 ? sorted[upIdx + 1].volume : 0;
    const downVol = downIdx > 0 ? sorted[downIdx - 1].volume : 0;

    if (upVol >= downVol && upIdx < sorted.length - 1) {
      upIdx++;
      accumulatedVolume += sorted[upIdx].volume;
      vah = sorted[upIdx].priceLevel;
    } else if (downIdx > 0) {
      downIdx--;
      accumulatedVolume += sorted[downIdx].volume;
      val = sorted[downIdx].priceLevel;
    }
  }

  for (const p of profiles) {
    p.valueAreaHigh = vah;
    p.valueAreaLow = val;
  }

  return profiles.sort((a, b) => b.priceLevel - a.priceLevel);
}

export function calculateOrderFlowImbalance(
  ticks: TradeTick[],
  windowSeconds: number = 60
): OrderFlowImbalance[] {
  if (ticks.length === 0) return [];

  const sorted = [...ticks].sort((a, b) => a.timestamp - b.timestamp);
  const startTime = sorted[0].timestamp;
  const endTime = sorted[sorted.length - 1].timestamp;
  const results: OrderFlowImbalance[] = [];
  let cumulativeFlow = 0;

  for (let t = startTime; t <= endTime; t += windowSeconds * 1000) {
    const windowTicks = sorted.filter(tick => tick.timestamp >= t && tick.timestamp < t + windowSeconds * 1000);
    const buyVolume = windowTicks.filter(tick => tick.direction === 'buy').reduce((s, tick) => s + tick.quantity, 0);
    const sellVolume = windowTicks.filter(tick => tick.direction === 'sell').reduce((s, tick) => s + tick.quantity, 0);
    const netFlow = buyVolume - sellVolume;
    cumulativeFlow += netFlow;

    results.push({
      timestamp: t,
      buyVolume,
      sellVolume,
      netFlow,
      cumulativeFlow,
      delta: buyVolume + sellVolume > 0 ? netFlow / (buyVolume + sellVolume) : 0,
    });
  }

  return results;
}

export function estimateMarketImpact(
  orderSize: number,
  avgDailyVolume: number,
  volatility: number,
  spread: number
): MarketImpactModel {
  const participationRate = avgDailyVolume > 0 ? orderSize / avgDailyVolume : 0;
  // Almgren-Chriss inspired model
  const temporaryImpact = spread * 0.5 * Math.pow(participationRate, 0.5);
  const permanentImpact = volatility * participationRate * 0.1;
  const totalImpact = temporaryImpact + permanentImpact;
  // Optimal execution time (hours) to keep participation under 10%
  const optimalExecutionTime = participationRate > 0.1
    ? orderSize / (avgDailyVolume * 0.1 / 6.5)
    : 0;

  return {
    symbol: '',
    temporaryImpact,
    permanentImpact,
    totalImpact,
    participationRate,
    optimalExecutionTime,
  };
}

export function calculateTWAP(
  ticks: TradeTick[],
  targetQuantity: number,
  startTime: number,
  endTime: number,
  slices: number = 10
): TWAPResult {
  const sliceDuration = (endTime - startTime) / slices;
  const sliceResults: { time: string; price: number; quantity: number }[] = [];
  let totalQty = 0;
  let totalPriceQty = 0;

  for (let i = 0; i < slices; i++) {
    const sliceStart = startTime + i * sliceDuration;
    const sliceEnd = sliceStart + sliceDuration;
    const sliceTicks = ticks.filter(t => t.timestamp >= sliceStart && t.timestamp < sliceEnd);

    const sliceQty = Math.min(targetQuantity / slices, targetQuantity - totalQty);
    const avgPrice = sliceTicks.length > 0
      ? sliceTicks.reduce((s, t) => s + t.price * t.quantity, 0) / sliceTicks.reduce((s, t) => s + t.quantity, 0)
      : (sliceTicks.length > 0 ? sliceTicks[0].price : 0);

    sliceResults.push({
      time: new Date(sliceStart).toISOString(),
      price: avgPrice,
      quantity: sliceQty,
    });

    totalQty += sliceQty;
    totalPriceQty += avgPrice * sliceQty;
  }

  const averagePrice = totalQty > 0 ? totalPriceQty / totalQty : 0;
  const benchmark = ticks.length > 0
    ? ticks.reduce((s, t) => s + t.price, 0) / ticks.length
    : 0;

  return {
    slices: sliceResults,
    averagePrice,
    totalQuantity: totalQty,
    benchmark,
    slippage: averagePrice - benchmark,
  };
}

export function calculateVWAP(
  ticks: TradeTick[],
  startTime?: number,
  endTime?: number
): VWAPResult {
  const filtered = ticks.filter(t => {
    if (startTime && t.timestamp < startTime) return false;
    if (endTime && t.timestamp > endTime) return false;
    return true;
  });

  let totalPriceVolume = 0;
  let totalVolume = 0;

  for (const tick of filtered) {
    totalPriceVolume += tick.price * tick.quantity;
    totalVolume += tick.quantity;
  }

  const averagePrice = totalVolume > 0 ? totalPriceVolume / totalVolume : 0;
  const benchmark = filtered.length > 0
    ? filtered.reduce((s, t) => s + t.price, 0) / filtered.length
    : 0;

  return {
    averagePrice,
    totalVolume,
    benchmark,
    slippage: averagePrice - benchmark,
    participationRate: 0,
  };
}

export function classifyTradeDirection(
  trade: TradeTick,
  bid: number,
  ask: number
): 'buy' | 'sell' | 'unknown' {
  if (trade.price >= ask) return 'buy';
  if (trade.price <= bid) return 'sell';
  if (trade.price === bid && trade.price === ask) return 'unknown';
  return trade.price > (bid + ask) / 2 ? 'buy' : 'sell';
}

export function calculateKyleLambda(
  ticks: TradeTick[],
  returnsWindow: number = 10
): number {
  if (ticks.length < returnsWindow + 1) return 0;

  const sorted = [...ticks].sort((a, b) => a.timestamp - b.timestamp);
  const returns: number[] = [];
  const signedVolumes: number[] = [];

  for (let i = 1; i < sorted.length; i++) {
    const ret = (sorted[i].price - sorted[i - 1].price) / sorted[i - 1].price;
    const signedVol = sorted[i].direction === 'buy' ? sorted[i].quantity : -sorted[i].quantity;
    returns.push(ret);
    signedVolumes.push(signedVol);
  }

  // Kyle's lambda = cov(return, signed volume) / var(signed volume)
  const n = returns.length;
  const meanRet = returns.reduce((a, b) => a + b, 0) / n;
  const meanVol = signedVolumes.reduce((a, b) => a + b, 0) / n;

  let cov = 0;
  let varVol = 0;
  for (let i = 0; i < n; i++) {
    cov += (returns[i] - meanRet) * (signedVolumes[i] - meanVol);
    varVol += (signedVolumes[i] - meanVol) ** 2;
  }

  return varVol > 0 ? cov / varVol : 0;
}

export function calculateAmihudIlliquidity(
  prices: number[],
  volumes: number[]
): number {
  const n = Math.min(prices.length, volumes.length);
  if (n < 2) return 0;

  let totalRatio = 0;
  let count = 0;

  for (let i = 1; i < n; i++) {
    const ret = Math.abs((prices[i] - prices[i - 1]) / prices[i - 1]);
    const dollarVolume = prices[i] * volumes[i];
    if (dollarVolume > 0) {
      totalRatio += ret / dollarVolume;
      count++;
    }
  }

  return count > 0 ? totalRatio / count : 0;
}

export function calculateRollSpread(
  prices: number[]
): number {
  if (prices.length < 3) return 0;

  let cov = 0;
  for (let i = 1; i < prices.length; i++) {
    const dp1 = prices[i] - prices[i - 1];
    const dp2 = i >= 2 ? prices[i - 1] - prices[i - 2] : 0;
    cov += dp1 * dp2;
  }
  cov /= prices.length - 1;

  return cov < 0 ? 2 * Math.sqrt(-cov) : 0;
}
