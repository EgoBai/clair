import { describe, it, expect } from 'vitest';

// ===== 盘口深度分析测试 =====
describe('Order Book Deep Analysis', () => {
  interface OrderLevel { price: number; volume: number; orders: number; }
  interface OrderBook { symbol: string; timestamp: number; bids: OrderLevel[]; asks: OrderLevel[]; }

  const analyzeDepth = (book: OrderBook) => {
    const bidVol = book.bids.reduce((s, b) => s + b.volume, 0);
    const askVol = book.asks.reduce((s, a) => s + a.volume, 0);
    const totalVol = bidVol + askVol;
    const imbalance = totalVol > 0 ? (bidVol - askVol) / totalVol : 0;
    const spread = book.asks.length > 0 && book.bids.length > 0
      ? book.asks[0].price - book.bids[0].price : 0;
    const spreadPct = book.bids.length > 0 && spread > 0
      ? spread / book.bids[0].price * 100 : 0;
    const midPrice = book.bids.length > 0 && book.asks.length > 0
      ? (book.bids[0].price + book.asks[0].price) / 2 : 0;
    const bidWall = book.bids.reduce((max, b) => b.volume > max.volume ? b : max, book.bids[0]);
    const askWall = book.asks.reduce((max, a) => a.volume > max.volume ? a : max, book.asks[0]);
    const weightedBid = book.bids.reduce((s, b) => s + b.price * b.volume, 0);
    const weightedAsk = book.asks.reduce((s, a) => s + a.price * a.volume, 0);
    const vwapBid = bidVol > 0 ? weightedBid / bidVol : 0;
    const vwapAsk = askVol > 0 ? weightedAsk / askVol : 0;
    return { bidVol, askVol, imbalance, spread, spreadPct, midPrice, bidWall, askWall, vwapBid, vwapAsk };
  };

  const createBook = (bids: [number, number][], asks: [number, number][]): OrderBook => ({
    symbol: '600519', timestamp: Date.now(),
    bids: bids.map(([p, v]) => ({ price: p, volume: v, orders: Math.floor(v / 100) })),
    asks: asks.map(([p, v]) => ({ price: p, volume: v, orders: Math.floor(v / 100) })),
  });

  it('应该计算买卖总量', () => {
    const book = createBook([[100, 500], [99, 300]], [[101, 400], [102, 200]]);
    const r = analyzeDepth(book);
    expect(r.bidVol).toBe(800);
    expect(r.askVol).toBe(600);
  });

  it('应该计算不平衡度', () => {
    const book = createBook([[100, 1000]], [[101, 500]]);
    const r = analyzeDepth(book);
    expect(r.imbalance).toBeCloseTo(1/3, 2);
  });

  it('应该返回零不平衡度当总量为零', () => {
    const book = createBook([], []);
    const r = analyzeDepth(book);
    expect(r.imbalance).toBe(0);
  });

  it('应该计算买卖价差', () => {
    const book = createBook([[100, 500]], [[101, 500]]);
    const r = analyzeDepth(book);
    expect(r.spread).toBe(1);
    expect(r.midPrice).toBe(100.5);
  });

  it('应该计算价差百分比', () => {
    const book = createBook([[100, 500]], [[100.5, 500]]);
    const r = analyzeDepth(book);
    expect(r.spreadPct).toBeCloseTo(0.5, 2);
  });

  it('应该找到最大挂单', () => {
    const book = createBook([[100, 200], [99, 800]], [[101, 300], [102, 1000]]);
    const r = analyzeDepth(book);
    expect(r.bidWall.price).toBe(99);
    expect(r.askWall.price).toBe(102);
  });

  it('应该计算VWAP', () => {
    const book = createBook([[100, 100], [99, 100]], [[101, 100], [102, 100]]);
    const r = analyzeDepth(book);
    expect(r.vwapBid).toBeCloseTo(99.5);
    expect(r.vwapAsk).toBeCloseTo(101.5);
  });

  it('应该处理单侧盘口', () => {
    const book = createBook([[100, 500]], []);
    const r = analyzeDepth(book);
    expect(r.askVol).toBe(0);
    expect(r.spread).toBe(0);
  });

  it('应该计算买盘支撑强度', () => {
    const book = createBook([[100, 500], [99, 1000], [98, 2000]], [[101, 300]]);
    const r = analyzeDepth(book);
    expect(r.imbalance).toBeGreaterThan(0.5);
  });

  it('应该计算卖盘压力强度', () => {
    const book = createBook([[100, 200]], [[101, 500], [102, 1000], [103, 2000]]);
    const r = analyzeDepth(book);
    expect(r.imbalance).toBeLessThan(0);
  });
});

// ===== 委托单分析 =====
describe('Commission Analysis', () => {
  interface Commission { price: number; volume: number; type: 'limit' | 'market'; side: 'buy' | 'sell'; time: number; }

  const analyzeCommissions = (orders: Commission[]) => {
    const buyOrders = orders.filter(o => o.side === 'buy');
    const sellOrders = orders.filter(o => o.side === 'sell');
    const buyVol = buyOrders.reduce((s, o) => s + o.volume, 0);
    const sellVol = sellOrders.reduce((s, o) => s + o.volume, 0);
    const avgBuyPrice = buyVol > 0 ? buyOrders.reduce((s, o) => s + o.price * o.volume, 0) / buyVol : 0;
    const avgSellPrice = sellVol > 0 ? sellOrders.reduce((s, o) => s + o.price * o.volume, 0) / sellVol : 0;
    const netVolume = buyVol - sellVol;
    const limitCount = orders.filter(o => o.type === 'limit').length;
    const marketCount = orders.filter(o => o.type === 'market').length;
    return { buyVol, sellVol, avgBuyPrice, avgSellPrice, netVolume, limitCount, marketCount, total: orders.length };
  };

  it('应该统计买卖委托量', () => {
    const orders: Commission[] = [
      { price: 100, volume: 500, type: 'limit', side: 'buy', time: 1 },
      { price: 101, volume: 300, type: 'limit', side: 'sell', time: 2 },
    ];
    const r = analyzeCommissions(orders);
    expect(r.buyVol).toBe(500);
    expect(r.sellVol).toBe(300);
  });

  it('应该计算加权均价', () => {
    const orders: Commission[] = [
      { price: 100, volume: 100, type: 'limit', side: 'buy', time: 1 },
      { price: 102, volume: 100, type: 'limit', side: 'buy', time: 2 },
    ];
    const r = analyzeCommissions(orders);
    expect(r.avgBuyPrice).toBe(101);
  });

  it('应该计算净委托量', () => {
    const orders: Commission[] = [
      { price: 100, volume: 800, type: 'limit', side: 'buy', time: 1 },
      { price: 101, volume: 300, type: 'limit', side: 'sell', time: 2 },
    ];
    const r = analyzeCommissions(orders);
    expect(r.netVolume).toBe(500);
  });

  it('应该统计限价和市价单', () => {
    const orders: Commission[] = [
      { price: 100, volume: 100, type: 'limit', side: 'buy', time: 1 },
      { price: 101, volume: 100, type: 'market', side: 'sell', time: 2 },
      { price: 99, volume: 100, type: 'limit', side: 'buy', time: 3 },
    ];
    const r = analyzeCommissions(orders);
    expect(r.limitCount).toBe(2);
    expect(r.marketCount).toBe(1);
  });

  it('应该处理空委托列表', () => {
    const r = analyzeCommissions([]);
    expect(r.total).toBe(0);
    expect(r.netVolume).toBe(0);
    expect(r.avgBuyPrice).toBe(0);
  });
});
