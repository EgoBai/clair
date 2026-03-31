/**
 * Market Depth Analysis Engine
 * 
 * 市场深度分析引擎 - 分析订单簿深度、流动性分布、买卖压力
 */

// ===== Types =====

export interface OrderBookLevel {
  price: number;
  volume: number;
  orders: number;
}

export interface OrderBookSnapshot {
  timestamp: number;
  symbol: string;
  bids: OrderBookLevel[];
  asks: OrderBookLevel[];
  lastPrice: number;
}

export interface DepthAnalysis {
  totalBidVolume: number;
  totalAskVolume: number;
  bidAskRatio: number;
  weightedMidPrice: number;
  spreadBps: number;
  liquidityScore: number;
  imbalance: number;
  pressure: 'buy' | 'sell' | 'neutral';
  supportLevels: SupportResistanceLevel[];
  resistanceLevels: SupportResistanceLevel[];
  depthProfile: DepthProfile;
}

export interface SupportResistanceLevel {
  price: number;
  volume: number;
  strength: number;
  type: 'support' | 'resistance';
}

export interface DepthProfile {
  bidDepth: number[];
  askDepth: number[];
  cumulativeBid: number[];
  cumulativeAsk: number[];
  priceLevels: number[];
}

export interface LargeOrderAlert {
  price: number;
  volume: number;
  side: 'bid' | 'ask';
  significance: number;
  impactPrice: number;
}

// ===== Core Analysis =====

export function analyzeOrderBookDepth(
  snapshot: OrderBookSnapshot
): DepthAnalysis {
  const { bids, asks, lastPrice } = snapshot;

  const totalBidVolume = bids.reduce((sum, b) => sum + b.volume, 0);
  const totalAskVolume = asks.reduce((sum, a) => sum + a.volume, 0);

  const bidAskRatio =
    totalAskVolume > 0 ? totalBidVolume / totalAskVolume : 1;

  // Weighted mid price (volume-weighted)
  const bestBid = bids.length > 0 ? bids[0].price : lastPrice;
  const bestAsk = asks.length > 0 ? asks[0].price : lastPrice;
  const bidWeight = bids.length > 0 ? bids[0].volume : 1;
  const askWeight = asks.length > 0 ? asks[0].volume : 1;
  const weightedMidPrice =
    (bestBid * askWeight + bestAsk * bidWeight) / (bidWeight + askWeight);

  // Spread in basis points
  const spreadBps = ((bestAsk - bestBid) / lastPrice) * 10000;

  // Liquidity score (0-100)
  const totalVolume = totalBidVolume + totalAskVolume;
  const liquidityScore = Math.min(100, (totalVolume / 10000) * 100);

  // Order imbalance (-1 to 1)
  const imbalance =
    totalVolume > 0
      ? (totalBidVolume - totalAskVolume) / totalVolume
      : 0;

  // Buy/sell pressure
  let pressure: 'buy' | 'sell' | 'neutral';
  if (imbalance > 0.1) pressure = 'buy';
  else if (imbalance < -0.1) pressure = 'sell';
  else pressure = 'neutral';

  // Support/resistance levels
  const supportLevels = findSupportLevels(bids, lastPrice);
  const resistanceLevels = findResistanceLevels(asks, lastPrice);

  // Depth profile
  const depthProfile = buildDepthProfile(bids, asks);

  return {
    totalBidVolume,
    totalAskVolume,
    bidAskRatio,
    weightedMidPrice,
    spreadBps,
    liquidityScore,
    imbalance,
    pressure,
    supportLevels,
    resistanceLevels,
    depthProfile,
  };
}

// ===== Support/Resistance Detection =====

function findSupportLevels(
  bids: OrderBookLevel[],
  _lastPrice: number
): SupportResistanceLevel[] {
  const levels: SupportResistanceLevel[] = [];
  const avgVolume =
    bids.reduce((sum, b) => sum + b.volume, 0) / (bids.length || 1);

  for (const bid of bids) {
    if (bid.volume > avgVolume * 2) {
      levels.push({
        price: bid.price,
        volume: bid.volume,
        strength: Math.min(1, bid.volume / (avgVolume * 5)),
        type: 'support',
      });
    }
  }

  return levels.sort((a, b) => b.strength - a.strength).slice(0, 5);
}

function findResistanceLevels(
  asks: OrderBookLevel[],
  _lastPrice: number
): SupportResistanceLevel[] {
  const levels: SupportResistanceLevel[] = [];
  const avgVolume =
    asks.reduce((sum, a) => sum + a.volume, 0) / (asks.length || 1);

  for (const ask of asks) {
    if (ask.volume > avgVolume * 2) {
      levels.push({
        price: ask.price,
        volume: ask.volume,
        strength: Math.min(1, ask.volume / (avgVolume * 5)),
        type: 'resistance',
      });
    }
  }

  return levels.sort((a, b) => b.strength - a.strength).slice(0, 5);
}

// ===== Depth Profile =====

function buildDepthProfile(
  bids: OrderBookLevel[],
  asks: OrderBookLevel[]
): DepthProfile {
  const bidVolumes = bids.map((b) => b.volume);
  const askVolumes = asks.map((a) => a.volume);
  const allPrices = [...bids.map((b) => b.price), ...asks.map((a) => a.price)];

  const cumulativeBid: number[] = [];
  let bidSum = 0;
  for (const v of bidVolumes) {
    bidSum += v;
    cumulativeBid.push(bidSum);
  }

  const cumulativeAsk: number[] = [];
  let askSum = 0;
  for (const v of askVolumes) {
    askSum += v;
    cumulativeAsk.push(askSum);
  }

  return {
    bidDepth: bidVolumes,
    askDepth: askVolumes,
    cumulativeBid,
    cumulativeAsk,
    priceLevels: allPrices.sort((a, b) => a - b),
  };
}

// ===== Large Order Detection =====

export function detectLargeOrders(
  snapshot: OrderBookSnapshot,
  thresholdMultiplier: number = 3
): LargeOrderAlert[] {
  const alerts: LargeOrderAlert[] = [];
  const { bids, asks, lastPrice } = snapshot;

  // Bid side
  const avgBidVol =
    bids.reduce((sum, b) => sum + b.volume, 0) / (bids.length || 1);
  for (const bid of bids) {
    if (bid.volume > avgBidVol * thresholdMultiplier) {
      alerts.push({
        price: bid.price,
        volume: bid.volume,
        side: 'bid',
        significance: Math.min(1, bid.volume / (avgBidVol * 10)),
        impactPrice: bid.price,
      });
    }
  }

  // Ask side
  const avgAskVol =
    asks.reduce((sum, a) => sum + a.volume, 0) / (asks.length || 1);
  for (const ask of asks) {
    if (ask.volume > avgAskVol * thresholdMultiplier) {
      alerts.push({
        price: ask.price,
        volume: ask.volume,
        side: 'ask',
        significance: Math.min(1, ask.volume / (avgAskVol * 10)),
        impactPrice: ask.price,
      });
    }
  }

  // Update impact price based on size
  for (const alert of alerts) {
    const priceImpact = (alert.volume * 0.0001) / lastPrice;
    alert.impactPrice =
      alert.side === 'bid'
        ? alert.price * (1 + priceImpact)
        : alert.price * (1 - priceImpact);
  }

  return alerts.sort((a, b) => b.significance - a.significance);
}

// ===== Volume at Price =====

export function volumeAtPrice(
  snapshot: OrderBookSnapshot,
  targetPrice: number,
  rangeBps: number = 10
): { bidVolume: number; askVolume: number; totalVolume: number } {
  const priceRange = (targetPrice * rangeBps) / 10000;
  const minPrice = targetPrice - priceRange;
  const maxPrice = targetPrice + priceRange;

  const bidVolume = snapshot.bids
    .filter((b) => b.price >= minPrice && b.price <= maxPrice)
    .reduce((sum, b) => sum + b.volume, 0);

  const askVolume = snapshot.asks
    .filter((a) => a.price >= minPrice && a.price <= maxPrice)
    .reduce((sum, a) => sum + a.volume, 0);

  return { bidVolume, askVolume, totalVolume: bidVolume + askVolume };
}

// ===== Liquidity Distribution =====

export function liquidityDistribution(
  snapshot: OrderBookSnapshot,
  numBuckets: number = 5
): { priceRange: [number, number]; volume: number; percentage: number }[] {
  const allPrices = [
    ...snapshot.bids.map((b) => b.price),
    ...snapshot.asks.map((a) => a.price),
  ];

  if (allPrices.length === 0) return [];

  const minPrice = Math.min(...allPrices);
  const maxPrice = Math.max(...allPrices);
  const bucketSize = (maxPrice - minPrice) / numBuckets;

  const totalVolume =
    snapshot.bids.reduce((s, b) => s + b.volume, 0) +
    snapshot.asks.reduce((s, a) => s + a.volume, 0);

  const buckets: {
    priceRange: [number, number];
    volume: number;
    percentage: number;
  }[] = [];

  for (let i = 0; i < numBuckets; i++) {
    const rangeStart = minPrice + i * bucketSize;
    const rangeEnd = rangeStart + bucketSize;

    const bidVol = snapshot.bids
      .filter((b) => b.price >= rangeStart && b.price < rangeEnd)
      .reduce((s, b) => s + b.volume, 0);

    const askVol = snapshot.asks
      .filter((a) => a.price >= rangeStart && a.price < rangeEnd)
      .reduce((s, a) => s + a.volume, 0);

    const volume = bidVol + askVol;
    buckets.push({
      priceRange: [rangeStart, rangeEnd],
      volume,
      percentage: totalVolume > 0 ? (volume / totalVolume) * 100 : 0,
    });
  }

  return buckets;
}

// ===== VWAP from Order Book =====

export function orderBookVWAP(snapshot: OrderBookSnapshot): number {
  let totalPriceVolume = 0;
  let totalVolume = 0;

  for (const bid of snapshot.bids) {
    totalPriceVolume += bid.price * bid.volume;
    totalVolume += bid.volume;
  }

  for (const ask of snapshot.asks) {
    totalPriceVolume += ask.price * ask.volume;
    totalVolume += ask.volume;
  }

  return totalVolume > 0 ? totalPriceVolume / totalVolume : snapshot.lastPrice;
}
