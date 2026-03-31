/**
 * 盘口订单簿引擎
 * 深度分析、买卖压力、支持阻力推断
 */

export interface OrderLevel {
  price: number;
  quantity: number;
}

export interface OrderBook {
  bids: OrderLevel[];
  asks: OrderLevel[];
  timestamp: number;
}

export interface OrderBookAnalysis {
  spread: number;
  spreadPct: number;
  bidDepth: number;
  askDepth: number;
  imbalance: number; // -1 to 1, 正值表示买方压力
  pressure: 'buy' | 'sell' | 'neutral';
  weightedMidPrice: number;
  supportLevels: { price: number; strength: number }[];
  resistanceLevels: { price: number; strength: number }[];
  liquidityScore: number;
  impactCost5pct: number;
}

/**
 * 分析订单簿
 */
export function analyzeOrderBook(book: OrderBook): OrderBookAnalysis {
  const { bids, asks } = book;

  if (bids.length === 0 || asks.length === 0) {
    return {
      spread: 0, spreadPct: 0, bidDepth: 0, askDepth: 0,
      imbalance: 0, pressure: 'neutral', weightedMidPrice: 0,
      supportLevels: [], resistanceLevels: [], liquidityScore: 0,
      impactCost5pct: 0,
    };
  }

  const bestBid = bids[0].price;
  const bestAsk = asks[0].price;
  const midPrice = (bestBid + bestAsk) / 2;
  const spread = bestAsk - bestBid;
  const spreadPct = midPrice > 0 ? spread / midPrice : 0;

  const bidDepth = bids.reduce((s, b) => s + b.quantity, 0);
  const askDepth = asks.reduce((s, a) => s + a.quantity, 0);
  const imbalance = (bidDepth + askDepth) > 0
    ? (bidDepth - askDepth) / (bidDepth + askDepth) : 0;

  const pressure = imbalance > 0.1 ? 'buy' : imbalance < -0.1 ? 'sell' : 'neutral';

  // 加权中间价
  const weightedMidPrice = (bestBid * askDepth + bestAsk * bidDepth) / Math.max(1, bidDepth + askDepth);

  // 支撑位（买方密集区）
  const supportLevels = findConcentrationLevels(bids).map(l => ({
    price: l.price,
    strength: Math.round(l.strength * 100) / 100,
  }));

  // 阻力位（卖方密集区）
  const resistanceLevels = findConcentrationLevels(asks).map(l => ({
    price: l.price,
    strength: Math.round(l.strength * 100) / 100,
  }));

  // 流动性评分
  const totalQty = bidDepth + askDepth;
  const liquidityScore = Math.min(100, Math.round(totalQty / 100));

  // 5%冲击成本
  const impactCost5pct = calculateImpactCost(asks, midPrice, 0.05);

  return {
    spread: Math.round(spread * 100) / 100,
    spreadPct: Math.round(spreadPct * 10000) / 10000,
    bidDepth,
    askDepth,
    imbalance: Math.round(imbalance * 1000) / 1000,
    pressure,
    weightedMidPrice: Math.round(weightedMidPrice * 100) / 100,
    supportLevels: supportLevels.slice(0, 3),
    resistanceLevels: resistanceLevels.slice(0, 3),
    liquidityScore,
    impactCost5pct: Math.round(impactCost5pct * 10000) / 10000,
  };
}

function findConcentrationLevels(levels: OrderLevel[]): { price: number; strength: number }[] {
  const avgQty = levels.reduce((s, l) => s + l.quantity, 0) / Math.max(1, levels.length);
  return levels
    .filter(l => l.quantity > avgQty * 1.5)
    .map(l => ({ price: l.price, strength: l.quantity / avgQty }))
    .sort((a, b) => b.strength - a.strength);
}

function calculateImpactCost(asks: OrderLevel[], midPrice: number, pct: number): number {
  const targetValue = midPrice * pct;
  let filled = 0, cost = 0;
  for (const ask of asks) {
    const remaining = targetValue - filled;
    if (remaining <= 0) break;
    const qty = Math.min(remaining, ask.quantity);
    cost += qty * (ask.price - midPrice);
    filled += qty;
  }
  return midPrice > 0 ? cost / (midPrice * Math.min(1, filled / targetValue)) : 0;
}

/**
 * 订单流不平衡分析
 */
export function orderFlowImbalance(
  historicalBooks: OrderBook[],
  window: number = 10
): {
  currentImbalance: number;
  trend: 'increasing_buy' | 'increasing_sell' | 'stable';
  volatility: number;
} {
  if (historicalBooks.length === 0) {
    return { currentImbalance: 0, trend: 'stable', volatility: 0 };
  }

  const imbalances = historicalBooks.map(b => {
    const bidDepth = b.bids.reduce((s, o) => s + o.quantity, 0);
    const askDepth = b.asks.reduce((s, o) => s + o.quantity, 0);
    return (bidDepth + askDepth) > 0 ? (bidDepth - askDepth) / (bidDepth + askDepth) : 0;
  });

  const recent = imbalances.slice(-window);
  const currentImbalance = recent[recent.length - 1];
  const avgImbalance = recent.reduce((a, b) => a + b, 0) / recent.length;
  const volatility = Math.sqrt(recent.reduce((s, v) => s + (v - avgImbalance) ** 2, 0) / recent.length);

  const trend = currentImbalance > avgImbalance + 0.05 ? 'increasing_buy'
    : currentImbalance < avgImbalance - 0.05 ? 'increasing_sell' : 'stable';

  return {
    currentImbalance: Math.round(currentImbalance * 1000) / 1000,
    trend,
    volatility: Math.round(volatility * 1000) / 1000,
  };
}
