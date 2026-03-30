/**
 * 盘口数据 API
 * 买一~买五、卖一~卖五、委比、振幅
 * 参考东方财富盘口数据展示
 */

import { Request, Response, Router } from 'express';
import type { OrderBook, OrderBookLevel, TimeShareData } from '../../shared/types';

const router = Router();

// 生成模拟盘口数据
function generateOrderBook(symbol: string, name: string): OrderBook {
  const lastPrice = 10 + Math.random() * 190;
  const prevClose = lastPrice * (1 - 0.02 + Math.random() * 0.04);
  const change = lastPrice - prevClose;
  const changePercent = (change / prevClose) * 100;
  const tickSize = lastPrice > 100 ? 0.01 : lastPrice > 10 ? 0.01 : 0.001;

  const bids: OrderBookLevel[] = [];
  const asks: OrderBookLevel[] = [];

  for (let i = 0; i < 5; i++) {
    const bidPrice = parseFloat((lastPrice - tickSize * (i + 1) * (1 + Math.random())).toFixed(2));
    const bidVol = Math.floor(100 + Math.random() * 5000) * 100;
    bids.push({
      price: bidPrice,
      volume: bidVol,
      amount: parseFloat((bidPrice * bidVol).toFixed(2)),
      orderCount: Math.floor(10 + Math.random() * 200),
    });

    const askPrice = parseFloat((lastPrice + tickSize * (i + 1) * (1 + Math.random())).toFixed(2));
    const askVol = Math.floor(100 + Math.random() * 5000) * 100;
    asks.push({
      price: askPrice,
      volume: askVol,
      amount: parseFloat((askPrice * askVol).toFixed(2)),
      orderCount: Math.floor(10 + Math.random() * 200),
    });
  }

  const totalBidVolume = bids.reduce((s, b) => s + b.volume, 0);
  const totalAskVolume = asks.reduce((s, a) => s + a.volume, 0);
  const bidAskRatio = parseFloat(((totalBidVolume - totalAskVolume) / (totalBidVolume + totalAskVolume) * 100).toFixed(2));

  return {
    symbol,
    name,
    timestamp: new Date().toISOString(),
    lastPrice: parseFloat(lastPrice.toFixed(2)),
    change: parseFloat(change.toFixed(2)),
    changePercent: parseFloat(changePercent.toFixed(2)),
    bids,
    asks,
    totalBidVolume,
    totalAskVolume,
    bidAskRatio,
    amplitude: parseFloat((Math.random() * 8 + 1).toFixed(2)),
  };
}

// 生成模拟分时数据
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

// 盘口数据
router.get('/order-book/:symbol', (req: Request, res: Response) => {
  try {
    const { symbol } = req.params;
    const name = req.query.name as string || '未知';
    const data = generateOrderBook(symbol, name);
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, error: '获取盘口数据失败' });
  }
});

// 分时数据
router.get('/time-share/:symbol', (req: Request, res: Response) => {
  try {
    const { symbol } = req.params;
    const data = generateTimeShare(symbol);
    res.json({ success: true, data: { symbol, points: data } });
  } catch (error) {
    res.status(500).json({ success: false, error: '获取分时数据失败' });
  }
});

export { generateOrderBook, generateTimeShare };
export default router;
