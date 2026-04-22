/**
 * 盘口数据 API
 * 
 * 对标 TradingView Depth of Market + Bloomberg Order Book:
 * - 10档盘口 (买一~买十, 卖一~卖十)
 * - 累计深度分布 (Cumulative Depth Profile)
 * - 委比/振幅
 * - 流动性区域标注
 * - 大单标记
 * - 分时数据
 */

import { Request, Response, Router } from 'express';
import { validateParams, schemas } from '../middleware/validation';
import { asyncHandler, sendSuccess } from '../utils/apiResponse';

// ────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────

export interface OrderBookLevel {
  price: number;
  volume: number;
  amount: number;
  orderCount: number;
  isLargeOrder?: boolean;
  cumulativeVolume?: number;
  cumulativeAmount?: number;
  depthPercent?: number; // 占总深度百分比
}

export interface LiquidityZone {
  startPrice: number;
  endPrice: number;
  totalVolume: number;
  type: 'SUPPORT' | 'RESISTANCE' | 'NEUTRAL';
  strength: number; // 0-100
}

export interface OrderBook {
  symbol: string;
  name: string;
  timestamp: string;
  lastPrice: number;
  change: number;
  changePercent: number;
  bids: OrderBookLevel[];
  asks: OrderBookLevel[];
  totalBidVolume: number;
  totalAskVolume: number;
  bidAskRatio: number;
  amplitude: number;
  // 新增字段 (对标 TradingView/Bloomberg)
  spread: number;
  spreadPercent: number;
  midPrice: number;
  weightedMidPrice: number;
  liquidityZones: LiquidityZone[];
  depthImbalance: number; // [-1, 1]
  largeOrderThreshold: number;
}

export interface TimeShareData {
  time: string;
  price: number;
  volume: number;
  avgPrice: number;
  change: number;
}

export interface DepthVisualization {
  symbol: string;
  timestamp: string;
  levels: {
    price: number;
    bidCumulative: number;
    askCumulative: number;
    bidVolume: number;
    askVolume: number;
    imbalance: number;
    isSupport: boolean;
    isResistance: boolean;
  }[];
  totalBidDepth: number;
  totalAskDepth: number;
  maxBidWall: { price: number; volume: number };
  maxAskWall: { price: number; volume: number };
}

export interface LargeOrderTracking {
  symbol: string;
  timestamp: string;
  largeOrders: {
    side: 'BID' | 'ASK';
    price: number;
    volume: number;
    amount: number;
    percentOfLevel: number;
    isWall: boolean;
  }[];
  totalLargeBidVolume: number;
  totalLargeAskVolume: number;
  largeOrderImbalance: number;
}

const router = Router();

// ────────────────────────────────────────────────────────────
// Data Generation
// ────────────────────────────────────────────────────────────

const LARGE_ORDER_THRESHOLD = 500000; // 大单阈值 (股)
const DEPTH_LEVELS = 10; // 10档盘口

/**
 * 生成模拟盘口数据 (10档)
 * 
 * 模拟真实的A股盘口特征:
 * - 价格递进使用 tickSize
 * - 量级分布符合 A 股常态 (100的倍数)
 * - 随机生成大单标记
 */
function generateOrderBook(symbol: string, name: string): OrderBook {
  const lastPrice = 10 + Math.random() * 190;
  const prevClose = lastPrice * (1 - 0.02 + Math.random() * 0.04);
  const change = lastPrice - prevClose;
  const changePercent = (change / prevClose) * 100;
  const tickSize = lastPrice > 100 ? 0.01 : lastPrice > 10 ? 0.01 : 0.001;

  const bids: OrderBookLevel[] = [];
  const asks: OrderBookLevel[] = [];

  let totalBidVol = 0, totalAskVol = 0;
  let cumulativeBidVol = 0, cumulativeAskVol = 0;
  let cumulativeBidAmt = 0, cumulativeAskAmt = 0;

  // 生成买盘 (买一最高, 买十最低)
  for (let i = 0; i < DEPTH_LEVELS; i++) {
    const bidPrice = parseFloat((lastPrice - tickSize * (i + 1) * (1 + Math.random() * 0.5)).toFixed(2));
    const bidVol = Math.floor(100 + Math.random() * 8000) * 100;
    const isLarge = bidVol >= LARGE_ORDER_THRESHOLD;
    totalBidVol += bidVol;
    cumulativeBidVol += bidVol;
    cumulativeBidAmt += bidPrice * bidVol;

    bids.push({
      price: bidPrice,
      volume: bidVol,
      amount: parseFloat((bidPrice * bidVol).toFixed(2)),
      orderCount: Math.floor(10 + Math.random() * 300),
      isLargeOrder: isLarge,
      cumulativeVolume: cumulativeBidVol,
      cumulativeAmount: parseFloat(cumulativeBidAmt.toFixed(2)),
    });
  }

  // 生成卖盘 (卖一最低, 卖十最高)
  for (let i = 0; i < DEPTH_LEVELS; i++) {
    const askPrice = parseFloat((lastPrice + tickSize * (i + 1) * (1 + Math.random() * 0.5)).toFixed(2));
    const askVol = Math.floor(100 + Math.random() * 8000) * 100;
    const isLarge = askVol >= LARGE_ORDER_THRESHOLD;
    totalAskVol += askVol;
    cumulativeAskVol += askVol;
    cumulativeAskAmt += askPrice * askVol;

    asks.push({
      price: askPrice,
      volume: askVol,
      amount: parseFloat((askPrice * askVol).toFixed(2)),
      orderCount: Math.floor(10 + Math.random() * 300),
      isLargeOrder: isLarge,
      cumulativeVolume: cumulativeAskVol,
      cumulativeAmount: parseFloat(cumulativeAskAmt.toFixed(2)),
    });
  }

  // 填充 depthPercent
  for (const b of bids) {
    b.depthPercent = totalBidVol > 0 ? parseFloat(((b.volume / totalBidVol) * 100).toFixed(2)) : 0;
  }
  for (const a of asks) {
    a.depthPercent = totalAskVol > 0 ? parseFloat(((a.volume / totalAskVol) * 100).toFixed(2)) : 0;
  }

  const bidAskRatio = parseFloat(((totalBidVol - totalAskVol) / (totalBidVol + totalAskVol) * 100).toFixed(2));

  // 计算价差
  const bestBid = bids[0]?.price || lastPrice;
  const bestAsk = asks[0]?.price || lastPrice;
  const spread = parseFloat((bestAsk - bestBid).toFixed(4));
  const spreadPercent = parseFloat(((spread / lastPrice) * 100).toFixed(4));
  const midPrice = parseFloat(((bestBid + bestAsk) / 2).toFixed(2));

  // 加权中间价 (micro price)
  const bidVol0 = bids[0]?.volume || 1;
  const askVol0 = asks[0]?.volume || 1;
  const weightedMidPrice = parseFloat(((bestBid * askVol0 + bestAsk * bidVol0) / (bidVol0 + askVol0)).toFixed(2));

  // 流动性区域
  const liquidityZones = detectLiquidityZones(bids, asks);

  // 深度不平衡
  const totalVol = totalBidVol + totalAskVol;
  const depthImbalance = totalVol > 0 ? parseFloat(((totalBidVol - totalAskVol) / totalVol).toFixed(4)) : 0;

  return {
    symbol,
    name,
    timestamp: new Date().toISOString(),
    lastPrice: parseFloat(lastPrice.toFixed(2)),
    change: parseFloat(change.toFixed(2)),
    changePercent: parseFloat(changePercent.toFixed(2)),
    bids,
    asks,
    totalBidVolume: totalBidVol,
    totalAskVolume: totalAskVol,
    bidAskRatio,
    amplitude: parseFloat((Math.random() * 8 + 1).toFixed(2)),
    spread,
    spreadPercent,
    midPrice,
    weightedMidPrice,
    liquidityZones,
    depthImbalance,
    largeOrderThreshold: LARGE_ORDER_THRESHOLD,
  };
}

/**
 * 检测流动性区域 — 寻找支撑/阻力密集区
 */
function detectLiquidityZones(bids: OrderBookLevel[], asks: OrderBookLevel[]): LiquidityZone[] {
  const zones: LiquidityZone[] = [];
  const avgBidVol = bids.reduce((s, b) => s + b.volume, 0) / bids.length;
  const avgAskVol = asks.reduce((s, a) => s + a.volume, 0) / asks.length;

  // 买盘支撑区 (单档量 > 平均1.5倍)
  for (let i = 0; i < bids.length; i++) {
    if (bids[i].volume > avgBidVol * 1.5) {
      zones.push({
        startPrice: bids[i].price,
        endPrice: bids[Math.min(i + 1, bids.length - 1)].price,
        totalVolume: bids[i].volume,
        type: 'SUPPORT',
        strength: Math.min(Math.round((bids[i].volume / avgBidVol) * 30), 100)
      });
    }
  }

  // 卖盘阻力区
  for (let i = 0; i < asks.length; i++) {
    if (asks[i].volume > avgAskVol * 1.5) {
      zones.push({
        startPrice: asks[i].price,
        endPrice: asks[Math.min(i + 1, asks.length - 1)].price,
        totalVolume: asks[i].volume,
        type: 'RESISTANCE',
        strength: Math.min(Math.round((asks[i].volume / avgAskVol) * 30), 100)
      });
    }
  }

  return zones.sort((a, b) => b.strength - a.strength);
}

/**
 * 生成深度可视化数据 (Cumulative Depth Profile)
 * 
 * 对标 TradingView DOM Heatmap:
 * - 每档的累计买/卖深度
 * - 不平衡度
 * - 最大挂单墙 (bid wall / ask wall)
 * - 支撑/阻力标注
 */
function generateDepthVisualization(symbol: string): DepthVisualization {
  const book = generateOrderBook(symbol, '');
  const levels: DepthVisualization['levels'] = [];

  const totalBid = book.totalBidVolume;
  const totalAsk = book.totalAskVolume;
  const maxLevels = Math.max(book.bids.length, book.asks.length);

  for (let i = 0; i < maxLevels; i++) {
    const bidVol = book.bids[i]?.volume || 0;
    const askVol = book.asks[i]?.volume || 0;
    const bidCum = book.bids[i]?.cumulativeVolume || 0;
    const askCum = book.asks[i]?.cumulativeVolume || 0;
    const total = bidVol + askVol;
    const imbalance = total > 0 ? (bidVol - askVol) / total : 0;

    // 取买或卖价格 (优先用买价)
    const price = book.bids[i]?.price || book.asks[i]?.price || 0;

    levels.push({
      price,
      bidCumulative: bidCum,
      askCumulative: askCum,
      bidVolume: bidVol,
      askVolume: askVol,
      imbalance: parseFloat(imbalance.toFixed(4)),
      isSupport: bidVol > (totalBid / maxLevels) * 1.8,
      isResistance: askVol > (totalAsk / maxLevels) * 1.8,
    });
  }

  // 找最大挂单墙
  const maxBidWall = book.bids.reduce(
    (max, b) => b.volume > max.volume ? { price: b.price, volume: b.volume } : max,
    { price: 0, volume: 0 }
  );
  const maxAskWall = book.asks.reduce(
    (max, a) => a.volume > max.volume ? { price: a.price, volume: a.volume } : max,
    { price: 0, volume: 0 }
  );

  return {
    symbol,
    timestamp: new Date().toISOString(),
    levels,
    totalBidDepth: totalBid,
    totalAskDepth: totalAsk,
    maxBidWall,
    maxAskWall,
  };
}

/**
 * 生成大单追踪数据
 * 
 * 对标 Bloomberg Large Trade Monitor:
 * - 标记超过阈值的大单
 * - 计算大单占该档总量百分比
 * - 判断是否为挂单墙 (isWall)
 * - 大单不平衡度
 */
function generateLargeOrderTracking(symbol: string): LargeOrderTracking {
  const book = generateOrderBook(symbol, '');
  const largeOrders: LargeOrderTracking['largeOrders'] = [];

  let totalLargeBid = 0, totalLargeAsk = 0;

  for (const bid of book.bids) {
    if (bid.isLargeOrder) {
      totalLargeBid += bid.volume;
      largeOrders.push({
        side: 'BID',
        price: bid.price,
        volume: bid.volume,
        amount: bid.amount,
        percentOfLevel: bid.depthPercent || 0,
        isWall: bid.volume >= LARGE_ORDER_THRESHOLD * 3,
      });
    }
  }

  for (const ask of book.asks) {
    if (ask.isLargeOrder) {
      totalLargeAsk += ask.volume;
      largeOrders.push({
        side: 'ASK',
        price: ask.price,
        volume: ask.volume,
        amount: ask.amount,
        percentOfLevel: ask.depthPercent || 0,
        isWall: ask.volume >= LARGE_ORDER_THRESHOLD * 3,
      });
    }
  }

  const totalLarge = totalLargeBid + totalLargeAsk;
  const largeOrderImbalance = totalLarge > 0
    ? parseFloat(((totalLargeBid - totalLargeAsk) / totalLarge).toFixed(4))
    : 0;

  return {
    symbol,
    timestamp: new Date().toISOString(),
    largeOrders: largeOrders.sort((a, b) => b.volume - a.volume),
    totalLargeBidVolume: totalLargeBid,
    totalLargeAskVolume: totalLargeAsk,
    largeOrderImbalance,
  };
}

/**
 * 生成模拟分时数据
 */
function generateTimeShare(symbol: string): TimeShareData[] {
  const data: TimeShareData[] = [];
  const basePrice = 10 + Math.random() * 190;
  let price = basePrice;
  let totalVolume = 0;
  let totalPriceVolume = 0;

  const startHour = 9;
  const startMin = 30;

  for (let i = 0; i < 240; i++) {
    const minute = startMin + i;
    const hour = startHour + Math.floor(minute / 60);
    const min = minute % 60;

    if (hour >= 11 && hour < 13 && min > 0) continue; // 午休
    if (hour >= 15) break;

    const change = (Math.random() - 0.5) * basePrice * 0.005;
    price = parseFloat((price + change).toFixed(2));
    const volume = Math.floor(50 + Math.random() * 500) * 100;
    totalVolume += volume;
    totalPriceVolume += price * volume;

    data.push({
      time: `${hour.toString().padStart(2, '0')}:${min.toString().padStart(2, '0')}`,
      price,
      volume,
      avgPrice: parseFloat((totalPriceVolume / totalVolume).toFixed(2)),
      change: parseFloat(((price - basePrice) / basePrice * 100).toFixed(2)),
    });
  }

  return data;
}

// ────────────────────────────────────────────────────────────
// API Routes
// ────────────────────────────────────────────────────────────

// 盘口数据 (10档)
router.get('/order-book/:symbol', validateParams(schemas.stockSymbol), asyncHandler(async (req: Request, res: Response) => {
  const { symbol } = req.params;
  const name = req.query.name as string || '未知';
  const data = generateOrderBook(symbol, name);
  sendSuccess(res, data);
}));

// 深度可视化数据
router.get('/depth-visualization/:symbol', validateParams(schemas.stockSymbol), asyncHandler(async (req: Request, res: Response) => {
  const { symbol } = req.params;
  const data = generateDepthVisualization(symbol);
  sendSuccess(res, data);
}));

// 大单追踪
router.get('/large-orders/:symbol', validateParams(schemas.stockSymbol), asyncHandler(async (req: Request, res: Response) => {
  const { symbol } = req.params;
  const data = generateLargeOrderTracking(symbol);
  sendSuccess(res, data);
}));

// 分时数据
router.get('/time-share/:symbol', validateParams(schemas.stockSymbol), asyncHandler(async (req: Request, res: Response) => {
  const { symbol } = req.params;
  const data = generateTimeShare(symbol);
  sendSuccess(res, { symbol, points: data });
}));

export { generateOrderBook, generateTimeShare, generateDepthVisualization, generateLargeOrderTracking };
export default router;
