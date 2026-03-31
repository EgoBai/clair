/**
 * Order Book Depth Engine
 *
 * 订单簿深度计算、买卖盘压力、滑点预估
 */

export interface OrderBookLevel {
  price: number;
  quantity: number;
  orders: number;
}

export interface OrderBook {
  symbol: string;
  bids: OrderBookLevel[];
  asks: OrderBookLevel[];
  timestamp: number;
}

export interface DepthImbalance {
  bidVolume: number;
  askVolume: number;
  ratio: number; // 0-1, >0.5 = buy pressure
  weightedMidPrice: number;
  spread: number;
  spreadPercent: number;
}

export interface SlippageEstimate {
  avgSlippage: number;
  maxSlippage: number;
  filledPercent: number;
  estimatedCost: number;
}

/**
 * 计算买卖盘不平衡
 */
export function calculateDepthImbalance(book: OrderBook): DepthImbalance {
  const bidVolume = book.bids.reduce((s, b) => s + b.quantity, 0);
  const askVolume = book.asks.reduce((s, a) => s + a.quantity, 0);
  const total = bidVolume + askVolume || 1;

  const bestBid = book.bids[0]?.price ?? 0;
  const bestAsk = book.asks[0]?.price ?? 0;
  const spread = bestAsk - bestBid;
  const midPrice = (bestBid + bestAsk) / 2;

  // Volume-weighted mid price
  const weightedMid = total > 0
    ? (book.bids[0]?.price * bidVolume + book.asks[0]?.price * askVolume) / total
    : midPrice;

  return {
    bidVolume,
    askVolume,
    ratio: bidVolume / total,
    weightedMidPrice: Math.round(weightedMid * 100) / 100,
    spread: Math.round(spread * 100) / 100,
    spreadPercent: midPrice > 0 ? Math.round((spread / midPrice) * 10000) / 100 : 0,
  };
}

/**
 * 预估滑点
 */
export function estimateSlippage(
  book: OrderBook,
  side: 'buy' | 'sell',
  quantity: number
): SlippageEstimate {
  const levels = side === 'buy' ? book.asks : [...book.bids].reverse();
  const referencePrice = side === 'buy' ? book.asks[0]?.price : book.bids[0]?.price;

  if (!referencePrice || quantity <= 0) {
    return { avgSlippage: 0, maxSlippage: 0, filledPercent: 0, estimatedCost: 0 };
  }

  let remaining = quantity;
  let totalCost = 0;
  let totalFilled = 0;
  let maxSlippage = 0;

  for (const level of levels) {
    if (remaining <= 0) break;

    const fill = Math.min(remaining, level.quantity);
    totalCost += fill * level.price;
    totalFilled += fill;
    remaining -= fill;

    const slippage = Math.abs(level.price - referencePrice) / referencePrice;
    maxSlippage = Math.max(maxSlippage, slippage);
  }

  const avgPrice = totalFilled > 0 ? totalCost / totalFilled : referencePrice;
  const avgSlippage = Math.abs(avgPrice - referencePrice) / referencePrice;

  return {
    avgSlippage: Math.round(avgSlippage * 10000) / 100,
    maxSlippage: Math.round(maxSlippage * 10000) / 100,
    filledPercent: quantity > 0 ? Math.round((totalFilled / quantity) * 100) : 0,
    estimatedCost: Math.round(totalCost * 100) / 100,
  };
}

/**
 * 计算市场深度
 */
export function calculateMarketDepth(
  book: OrderBook,
  depthLevels: number = 10
): Array<{ price: number; bidCumulative: number; askCumulative: number }> {
  const result: Array<{ price: number; bidCumulative: number; askCumulative: number }> = [];

  let bidCum = 0;
  let askCum = 0;
  const maxLevels = Math.max(book.bids.length, book.asks.length, depthLevels);

  for (let i = 0; i < Math.min(maxLevels, depthLevels); i++) {
    if (i < book.bids.length) bidCum += book.bids[i].quantity;
    if (i < book.asks.length) askCum += book.asks[i].quantity;

    const price = i < book.bids.length ? book.bids[i].price : book.asks[i]?.price ?? 0;
    result.push({ price, bidCumulative: bidCum, askCumulative: askCum });
  }

  return result;
}

/**
 * 检测大单
 */
export function detectLargeOrders(
  book: OrderBook,
  threshold: number = 0.1 // 10% of total volume
): Array<{ side: 'bid' | 'ask'; price: number; quantity: number; percentOfTotal: number }> {
  const bidTotal = book.bids.reduce((s, b) => s + b.quantity, 0);
  const askTotal = book.asks.reduce((s, a) => s + a.quantity, 0);

  const large: Array<{ side: 'bid' | 'ask'; price: number; quantity: number; percentOfTotal: number }> = [];

  for (const bid of book.bids) {
    const pct = bidTotal > 0 ? bid.quantity / bidTotal : 0;
    if (pct >= threshold) {
      large.push({ side: 'bid', price: bid.price, quantity: bid.quantity, percentOfTotal: Math.round(pct * 10000) / 100 });
    }
  }

  for (const ask of book.asks) {
    const pct = askTotal > 0 ? ask.quantity / askTotal : 0;
    if (pct >= threshold) {
      large.push({ side: 'ask', price: ask.price, quantity: ask.quantity, percentOfTotal: Math.round(pct * 10000) / 100 });
    }
  }

  return large.sort((a, b) => b.percentOfTotal - a.percentOfTotal);
}

/**
 * VWAP近似（基于订单簿）
 */
export function approximateVWAP(
  book: OrderBook,
  side: 'buy' | 'sell',
  quantity: number
): { vwap: number; levelsUsed: number; filled: boolean } {
  const levels = side === 'buy' ? book.asks : [...book.bids].reverse();

  let remaining = quantity;
  let totalCost = 0;
  let totalQty = 0;
  let levelsUsed = 0;

  for (const level of levels) {
    if (remaining <= 0) break;
    const fill = Math.min(remaining, level.quantity);
    totalCost += fill * level.price;
    totalQty += fill;
    remaining -= fill;
    levelsUsed++;
  }

  return {
    vwap: totalQty > 0 ? Math.round((totalCost / totalQty) * 100) / 100 : 0,
    levelsUsed,
    filled: remaining <= 0,
  };
}
