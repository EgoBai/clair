/**
 * 市场微观结构引擎 - 订单流/盘口分析/成交量分布/VPIN
 */

export interface OrderFlowData {
  timestamp: string;
  price: number;
  volume: number;
  side: 'buy' | 'sell';
  isLarge: boolean; // 是否大单
}

export interface OrderBookLevel {
  price: number;
  volume: number;
  orders: number;
}

export interface OrderBook {
  ticker: string;
  timestamp: string;
  bids: OrderBookLevel[];
  asks: OrderBookLevel[];
  lastPrice: number;
}

export interface OrderFlowAnalysis {
  ticker: string;
  buyVolume: number;
  sellVolume: number;
  netVolume: number;
  buyValue: number;
  sellValue: number;
  netValue: number;
  vpin: number; // Volume-Synchronized Probability of Informed Trading
  largeOrderImbalance: number; // 大单不平衡度
  aggressionIndex: number; // 主动性指数
  flowToxicity: number; // 订单流毒性 0-100
  signal: 'bullish' | 'bearish' | 'neutral';
}

export interface OrderBookImbalance {
  ticker: string;
  bidAskRatio: number; // 买卖比
  spreadBp: number; // 点差(bp)
  depthImbalance: number; // 深度不平衡
  weightedMidPrice: number;
  microPrice: number;
  liquidityScore: number; // 流动性评分 0-100
  pressure: 'buy' | 'sell' | 'balanced';
}

export interface VolumeProfile {
  ticker: string;
  poc: number; // Point of Control (最大成交量价位)
  valueAreaHigh: number;
  valueAreaLow: number;
  valueAreaVolume: number; // VA区间内成交量占比
  profile: Array<{ price: number; volume: number; buyVolume: number; sellVolume: number }>;
  gapNodes: Array<{ price: number; type: 'high' | 'low' }>; // 缺口节点
}

export interface VPINResult {
  vpin: number;
  bucketCount: number;
  avgBucketVolume: number;
  classification: 'toxic' | 'elevated' | 'normal' | 'quiet';
  confidenceInterval: [number, number];
}

/**
 * 分析订单流
 */
export function analyzeOrderFlow(orders: OrderFlowData[]): OrderFlowAnalysis {
  const ticker = '';

  if (orders.length === 0) {
    return {
      ticker, buyVolume: 0, sellVolume: 0, netVolume: 0,
      buyValue: 0, sellValue: 0, netValue: 0,
      vpin: 0.5, largeOrderImbalance: 0, aggressionIndex: 50,
      flowToxicity: 0, signal: 'neutral',
    };
  }

  const buys = orders.filter(o => o.side === 'buy');
  const sells = orders.filter(o => o.side === 'sell');

  const buyVolume = buys.reduce((s, o) => s + o.volume, 0);
  const sellVolume = sells.reduce((s, o) => s + o.volume, 0);
  const netVolume = buyVolume - sellVolume;

  const buyValue = buys.reduce((s, o) => s + o.volume * o.price, 0);
  const sellValue = sells.reduce((s, o) => s + o.volume * o.price, 0);
  const netValue = buyValue - sellValue;

  // VPIN
  const totalVolume = buyVolume + sellVolume;
  const vpin = totalVolume > 0 ? Math.abs(buyVolume - sellVolume) / totalVolume : 0.5;

  // 大单不平衡
  const largeBuys = buys.filter(o => o.isLarge);
  const largeSells = sells.filter(o => o.isLarge);
  const largeBuyVol = largeBuys.reduce((s, o) => s + o.volume, 0);
  const largeSellVol = largeSells.reduce((s, o) => s + o.volume, 0);
  const largeTotal = largeBuyVol + largeSellVol;
  const largeOrderImbalance = largeTotal > 0 ? (largeBuyVol - largeSellVol) / largeTotal : 0;

  // 主动性指数 (主动买入占比)
  const aggressionIndex = totalVolume > 0 ? (buyVolume / totalVolume) * 100 : 50;

  // 订单流毒性
  const flowToxicity = Math.min(100, Math.abs(vpin - 0.5) * 200 * (1 + Math.abs(largeOrderImbalance)));

  // 信号
  let signal: OrderFlowAnalysis['signal'];
  if (vpin > 0.6 && netVolume > 0) signal = 'bullish';
  else if (vpin > 0.6 && netVolume < 0) signal = 'bearish';
  else if (aggressionIndex > 55) signal = 'bullish';
  else if (aggressionIndex < 45) signal = 'bearish';
  else signal = 'neutral';

  return {
    ticker,
    buyVolume,
    sellVolume,
    netVolume,
    buyValue: Math.round(buyValue),
    sellValue: Math.round(sellValue),
    netValue: Math.round(netValue),
    vpin: Math.round(vpin * 1000) / 1000,
    largeOrderImbalance: Math.round(largeOrderImbalance * 100) / 100,
    aggressionIndex: Math.round(aggressionIndex * 10) / 10,
    flowToxicity: Math.round(flowToxicity),
    signal,
  };
}

/**
 * 分析订单簿不平衡
 */
export function analyzeOrderBookImbalance(book: OrderBook): OrderBookImbalance {
  const bidVol = book.bids.reduce((s, b) => s + b.volume, 0);
  const askVol = book.asks.reduce((s, a) => s + a.volume, 0);
  const bidAskRatio = askVol > 0 ? bidVol / askVol : 1;

  // 点差
  const bestBid = book.bids.length > 0 ? Math.max(...book.bids.map(b => b.price)) : book.lastPrice;
  const bestAsk = book.asks.length > 0 ? Math.min(...book.asks.map(a => a.price)) : book.lastPrice;
  const spreadBp = ((bestAsk - bestBid) / book.lastPrice) * 10000;

  // 深度不平衡 (前5档)
  const top5Bids = book.bids.slice(0, 5).reduce((s, b) => s + b.volume, 0);
  const top5Asks = book.asks.slice(0, 5).reduce((s, a) => s + a.volume, 0);
  const depthImbalance = (top5Bids + top5Asks) > 0
    ? (top5Bids - top5Asks) / (top5Bids + top5Asks) : 0;

  // 加权中间价
  const weightedMidPrice = (bestBid * askVol + bestAsk * bidVol) / (bidVol + askVol || 1);

  // 微观价格
  const microPrice = (bestBid * askVol + bestAsk * bidVol) / (bidVol + askVol || 1);

  // 流动性评分
  const totalDepth = bidVol + askVol;
  const avgSpread = spreadBp;
  let liquidityScore = 50;
  if (totalDepth > 1e6) liquidityScore += 20;
  else if (totalDepth > 5e5) liquidityScore += 10;
  if (avgSpread < 5) liquidityScore += 15;
  else if (avgSpread < 10) liquidityScore += 10;
  else if (avgSpread > 30) liquidityScore -= 15;
  liquidityScore = Math.min(100, Math.max(0, liquidityScore));

  let pressure: OrderBookImbalance['pressure'];
  if (depthImbalance > 0.15) pressure = 'buy';
  else if (depthImbalance < -0.15) pressure = 'sell';
  else pressure = 'balanced';

  return {
    ticker: book.ticker,
    bidAskRatio: Math.round(bidAskRatio * 100) / 100,
    spreadBp: Math.round(spreadBp * 10) / 10,
    depthImbalance: Math.round(depthImbalance * 1000) / 1000,
    weightedMidPrice: Math.round(weightedMidPrice * 100) / 100,
    microPrice: Math.round(microPrice * 100) / 100,
    liquidityScore: Math.round(liquidityScore),
    pressure,
  };
}

/**
 * 计算VPIN
 */
export function calculateVPIN(orders: OrderFlowData[], bucketCount: number = 50): VPINResult {
  if (orders.length === 0) {
    return { vpin: 0.5, bucketCount: 0, avgBucketVolume: 0, classification: 'normal', confidenceInterval: [0.4, 0.6] };
  }

  const totalVolume = orders.reduce((s, o) => s + o.volume, 0);
  const bucketVolume = totalVolume / bucketCount;

  // 按成交量分桶
  let currentBucket = { buy: 0, sell: 0 };
  const buckets: Array<{ buy: number; sell: number }> = [];

  for (const order of orders) {
    if (order.side === 'buy') currentBucket.buy += order.volume;
    else currentBucket.sell += order.volume;

    if (currentBucket.buy + currentBucket.sell >= bucketVolume) {
      buckets.push({ ...currentBucket });
      currentBucket = { buy: 0, sell: 0 };
    }
  }
  if (currentBucket.buy + currentBucket.sell > 0) {
    buckets.push(currentBucket);
  }

  // 计算VPIN
  const imbalanceSum = buckets.reduce((s, b) => s + Math.abs(b.buy - b.sell), 0);
  const totalVol = buckets.reduce((s, b) => s + b.buy + b.sell, 0);
  const vpin = totalVol > 0 ? imbalanceSum / totalVol : 0.5;

  const avgBucketVolume = totalVol / (buckets.length || 1);

  let classification: VPINResult['classification'];
  if (vpin > 0.7) classification = 'toxic';
  else if (vpin > 0.55) classification = 'elevated';
  else if (vpin < 0.35) classification = 'quiet';
  else classification = 'normal';

  // 置信区间 (简化)
  const se = Math.sqrt(vpin * (1 - vpin) / (buckets.length || 1));
  const confidenceInterval: [number, number] = [
    Math.max(0, vpin - 1.96 * se),
    Math.min(1, vpin + 1.96 * se),
  ];

  return {
    vpin: Math.round(vpin * 1000) / 1000,
    bucketCount: buckets.length,
    avgBucketVolume: Math.round(avgBucketVolume),
    classification,
    confidenceInterval: [Math.round(confidenceInterval[0] * 1000) / 1000, Math.round(confidenceInterval[1] * 1000) / 1000],
  };
}
