import { describe, it, expect, beforeEach } from 'vitest';

// Market Microstructure / Order Book Engine
interface Order {
  id: string;
  symbol: string;
  side: 'buy' | 'sell';
  type: 'limit' | 'market' | 'stop' | 'stop_limit' | 'iceberg' | 'fok' | 'ioc';
  price: number;
  quantity: number;
  filledQuantity: number;
  timestamp: Date;
  traderId: string;
  timeInForce: 'GTC' | 'IOC' | 'FOK' | 'DAY';
  stopPrice?: number;
  hiddenQuantity?: number;
}

interface OrderBookLevel {
  price: number;
  totalQuantity: number;
  orderCount: number;
  orders: Order[];
}

interface Trade {
  id: string;
  symbol: string;
  price: number;
  quantity: number;
  aggressorSide: 'buy' | 'sell';
  makerOrderId: string;
  takerOrderId: string;
  timestamp: Date;
}

interface MarketDepth {
  bids: OrderBookLevel[];
  asks: OrderBookLevel[];
  spread: number;
  midPrice: number;
  bidDepth: number;
  askDepth: number;
  imbalance: number;
}

interface VWAPResult {
  vwap: number;
  totalVolume: number;
  priceCount: number;
}

class OrderBook {
  private bids: Map<number, OrderBookLevel> = new Map();
  private asks: Map<number, OrderBookLevel> = new Map();
  private orders: Map<string, Order> = new Map();
  private trades: Trade[] = [];
  private symbol: string;

  constructor(symbol: string) {
    this.symbol = symbol;
  }

  addOrder(order: Omit<Order, 'id' | 'filledQuantity' | 'timestamp'>): Order {
    const fullOrder: Order = {
      ...order,
      id: `ord_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      filledQuantity: 0,
      timestamp: new Date(),
    };
    this.orders.set(fullOrder.id, fullOrder);

    if (fullOrder.type === 'market') {
      this.executeMarketOrder(fullOrder);
    } else if (fullOrder.type === 'fok') {
      this.executeFOK(fullOrder);
    } else if (fullOrder.type === 'ioc') {
      this.executeIOC(fullOrder);
    } else {
      this.insertLimitOrder(fullOrder);
      this.matchOrders();
    }

    return fullOrder;
  }

  private insertLimitOrder(order: Order): void {
    const book = order.side === 'buy' ? this.bids : this.asks;
    let level = book.get(order.price);
    if (!level) {
      level = { price: order.price, totalQuantity: 0, orderCount: 0, orders: [] };
      book.set(order.price, level);
    }
    level.orders.push(order);
    level.totalQuantity += order.quantity;
    level.orderCount++;
  }

  private executeMarketOrder(order: Order): void {
    const book = order.side === 'buy' ? this.asks : this.bids;
    const sorted = Array.from(book.entries()).sort((a, b) =>
      order.side === 'buy' ? a[0] - b[0] : b[0] - a[0]
    );

    let remaining = order.quantity;
    for (const [price, level] of sorted) {
      if (remaining <= 0) break;
      const filled = Math.min(remaining, level.totalQuantity);
      order.filledQuantity += filled;
      remaining -= filled;
      level.totalQuantity -= filled;

      if (level.orders.length > 0) {
        this.trades.push({
          id: `trd_${Date.now()}`,
          symbol: this.symbol,
          price,
          quantity: filled,
          aggressorSide: order.side,
          makerOrderId: level.orders[0].id,
          takerOrderId: order.id,
          timestamp: new Date(),
        });
      }

      if (level.totalQuantity <= 0) book.delete(price);
    }
  }

  private executeFOK(order: Order): void {
    const book = order.side === 'buy' ? this.asks : this.bids;
    let available = 0;
    const sorted = Array.from(book.entries()).sort((a, b) =>
      order.side === 'buy' ? a[0] - b[0] : b[0] - a[0]
    );

    for (const [price, level] of sorted) {
      if (order.side === 'buy' && price > order.price) break;
      if (order.side === 'sell' && price < order.price) break;
      available += level.totalQuantity;
    }

    if (available >= order.quantity) {
      this.executeMarketOrder(order);
    }
  }

  private executeIOC(order: Order): void {
    const book = order.side === 'buy' ? this.asks : this.bids;
    const sorted = Array.from(book.entries()).sort((a, b) =>
      order.side === 'buy' ? a[0] - b[0] : b[0] - a[0]
    );

    let remaining = order.quantity;
    for (const [price, level] of sorted) {
      if (remaining <= 0) break;
      if (order.side === 'buy' && price > order.price) break;
      if (order.side === 'sell' && price < order.price) break;
      const filled = Math.min(remaining, level.totalQuantity);
      order.filledQuantity += filled;
      remaining -= filled;
      level.totalQuantity -= filled;

      if (level.orders.length > 0) {
        this.trades.push({
          id: `trd_${Date.now()}`,
          symbol: this.symbol,
          price,
          quantity: filled,
          aggressorSide: order.side,
          makerOrderId: level.orders[0].id,
          takerOrderId: order.id,
          timestamp: new Date(),
        });
      }
      if (level.totalQuantity <= 0) book.delete(price);
    }
  }

  private matchOrders(): void {
    const bestBid = this.getBestBid();
    const bestAsk = this.getBestAsk();
    if (!bestBid || !bestAsk || bestBid < bestAsk) return;

    const bidLevel = this.bids.get(bestBid)!;
    const askLevel = this.asks.get(bestAsk)!;
    const matchQty = Math.min(bidLevel.totalQuantity, askLevel.totalQuantity);
    const matchPrice = bestAsk; // Price priority to maker

    this.trades.push({
      id: `trd_${Date.now()}`,
      symbol: this.symbol,
      price: matchPrice,
      quantity: matchQty,
      aggressorSide: 'buy',
      makerOrderId: askLevel.orders[0]?.id ?? '',
      takerOrderId: bidLevel.orders[0]?.id ?? '',
      timestamp: new Date(),
    });

    bidLevel.totalQuantity -= matchQty;
    askLevel.totalQuantity -= matchQty;
    if (bidLevel.totalQuantity <= 0) this.bids.delete(bestBid);
    if (askLevel.totalQuantity <= 0) this.asks.delete(bestAsk);
  }

  cancelOrder(orderId: string): boolean {
    const order = this.orders.get(orderId);
    if (!order) return false;
    const book = order.side === 'buy' ? this.bids : this.asks;
    const level = book.get(order.price);
    if (level) {
      const idx = level.orders.findIndex(o => o.id === orderId);
      if (idx >= 0) {
        level.totalQuantity -= (order.quantity - order.filledQuantity);
        level.orderCount--;
        level.orders.splice(idx, 1);
        if (level.orders.length === 0) book.delete(order.price);
        return true;
      }
    }
    return false;
  }

  getBestBid(): number | null {
    if (this.bids.size === 0) return null;
    return Math.max(...this.bids.keys());
  }

  getBestAsk(): number | null {
    if (this.asks.size === 0) return null;
    return Math.min(...this.asks.keys());
  }

  getDepth(levels = 10): MarketDepth {
    const bids = Array.from(this.bids.entries())
      .sort((a, b) => b[0] - a[0])
      .slice(0, levels)
      .map(([, level]) => level);

    const asks = Array.from(this.asks.entries())
      .sort((a, b) => a[0] - b[0])
      .slice(0, levels)
      .map(([, level]) => level);

    const bestBid = this.getBestBid() ?? 0;
    const bestAsk = this.getBestAsk() ?? 0;
    const bidDepth = bids.reduce((s, l) => s + l.totalQuantity, 0);
    const askDepth = asks.reduce((s, l) => s + l.totalQuantity, 0);

    return {
      bids,
      asks,
      spread: bestAsk - bestBid,
      midPrice: (bestBid + bestAsk) / 2,
      bidDepth,
      askDepth,
      imbalance: bidDepth > 0 ? bidDepth / (bidDepth + askDepth) : 0.5,
    };
  }

  calculateVWAP(): VWAPResult {
    if (this.trades.length === 0) return { vwap: 0, totalVolume: 0, priceCount: 0 };
    const totalVolume = this.trades.reduce((s, t) => s + t.quantity, 0);
    const totalPriceVolume = this.trades.reduce((s, t) => s + t.price * t.quantity, 0);
    return {
      vwap: totalVolume > 0 ? totalPriceVolume / totalVolume : 0,
      totalVolume,
      priceCount: new Set(this.trades.map(t => t.price)).size,
    };
  }

  getVolumeProfile(bins: number): { price: number; volume: number }[] {
    if (this.trades.length === 0) return [];
    const prices = this.trades.map(t => t.price);
    const min = Math.min(...prices);
    const max = Math.max(...prices);
    const binSize = (max - min) / bins || 1;
    const profile: Map<number, number> = new Map();

    for (const trade of this.trades) {
      const bin = Math.floor((trade.price - min) / binSize);
      profile.set(bin, (profile.get(bin) ?? 0) + trade.quantity);
    }

    return Array.from(profile.entries()).map(([bin, volume]) => ({
      price: min + bin * binSize + binSize / 2,
      volume,
    }));
  }

  getTrades(): Trade[] {
    return [...this.trades];
  }

  getOrder(id: string): Order | undefined {
    return this.orders.get(id);
  }
}

describe('Order Book Engine', () => {
  let book: OrderBook;

  beforeEach(() => {
    book = new OrderBook('AAPL');
  });

  it('should add limit buy order', () => {
    const order = book.addOrder({
      symbol: 'AAPL', side: 'buy', type: 'limit',
      price: 150, quantity: 100, traderId: 'trader1',
      timeInForce: 'GTC',
    });
    expect(order.id).toBeTruthy();
    expect(book.getBestBid()).toBe(150);
  });

  it('should add limit sell order', () => {
    book.addOrder({
      symbol: 'AAPL', side: 'sell', type: 'limit',
      price: 151, quantity: 100, traderId: 'trader1',
      timeInForce: 'GTC',
    });
    expect(book.getBestAsk()).toBe(151);
  });

  it('should match crossing orders', () => {
    book.addOrder({
      symbol: 'AAPL', side: 'sell', type: 'limit',
      price: 150, quantity: 50, traderId: 'seller',
      timeInForce: 'GTC',
    });
    book.addOrder({
      symbol: 'AAPL', side: 'buy', type: 'limit',
      price: 150, quantity: 50, traderId: 'buyer',
      timeInForce: 'GTC',
    });
    const trades = book.getTrades();
    expect(trades.length).toBeGreaterThan(0);
    expect(trades[0].price).toBe(150);
  });

  it('should execute market order', () => {
    book.addOrder({
      symbol: 'AAPL', side: 'sell', type: 'limit',
      price: 150, quantity: 100, traderId: 'maker',
      timeInForce: 'GTC',
    });
    book.addOrder({
      symbol: 'AAPL', side: 'buy', type: 'market',
      price: 0, quantity: 50, traderId: 'taker',
      timeInForce: 'IOC',
    });
    expect(book.getTrades().length).toBeGreaterThan(0);
  });

  it('should cancel order', () => {
    const order = book.addOrder({
      symbol: 'AAPL', side: 'buy', type: 'limit',
      price: 149, quantity: 100, traderId: 'trader1',
      timeInForce: 'GTC',
    });
    expect(book.cancelOrder(order.id)).toBe(true);
    expect(book.getBestBid()).toBeNull();
  });

  it('should calculate spread', () => {
    book.addOrder({
      symbol: 'AAPL', side: 'buy', type: 'limit',
      price: 150, quantity: 100, traderId: 'b', timeInForce: 'GTC',
    });
    book.addOrder({
      symbol: 'AAPL', side: 'sell', type: 'limit',
      price: 151, quantity: 100, traderId: 's', timeInForce: 'GTC',
    });
    const depth = book.getDepth();
    expect(depth.spread).toBe(1);
    expect(depth.midPrice).toBe(150.5);
  });

  it('should calculate VWAP', () => {
    book.addOrder({
      symbol: 'AAPL', side: 'sell', type: 'limit',
      price: 150, quantity: 100, traderId: 's', timeInForce: 'GTC',
    });
    book.addOrder({
      symbol: 'AAPL', side: 'buy', type: 'market',
      price: 0, quantity: 100, traderId: 'b', timeInForce: 'IOC',
    });
    const vwap = book.calculateVWAP();
    expect(vwap.vwap).toBeGreaterThan(0);
    expect(vwap.totalVolume).toBeGreaterThan(0);
  });

  it('should calculate depth imbalance', () => {
    book.addOrder({
      symbol: 'AAPL', side: 'buy', type: 'limit',
      price: 150, quantity: 200, traderId: 'b1', timeInForce: 'GTC',
    });
    book.addOrder({
      symbol: 'AAPL', side: 'sell', type: 'limit',
      price: 151, quantity: 50, traderId: 's1', timeInForce: 'GTC',
    });
    const depth = book.getDepth();
    expect(depth.imbalance).toBeGreaterThan(0.5);
  });

  it('should handle FOK order', () => {
    book.addOrder({
      symbol: 'AAPL', side: 'sell', type: 'limit',
      price: 150, quantity: 50, traderId: 'maker', timeInForce: 'GTC',
    });
    book.addOrder({
      symbol: 'AAPL', side: 'buy', type: 'fok',
      price: 150, quantity: 100, traderId: 'taker', timeInForce: 'FOK',
    });
    expect(book.getTrades()).toHaveLength(0); // FOK should fail
  });

  it('should handle IOC order', () => {
    book.addOrder({
      symbol: 'AAPL', side: 'sell', type: 'limit',
      price: 150, quantity: 30, traderId: 'maker', timeInForce: 'GTC',
    });
    book.addOrder({
      symbol: 'AAPL', side: 'buy', type: 'ioc',
      price: 150, quantity: 100, traderId: 'taker', timeInForce: 'IOC',
    });
    expect(book.getTrades().length).toBeGreaterThan(0);
  });

  it('should get volume profile', () => {
    book.addOrder({ symbol: 'AAPL', side: 'sell', type: 'limit', price: 150, quantity: 50, traderId: 's', timeInForce: 'GTC' });
    book.addOrder({ symbol: 'AAPL', side: 'buy', type: 'market', price: 0, quantity: 50, traderId: 'b', timeInForce: 'IOC' });
    const profile = book.getVolumeProfile(5);
    expect(profile.length).toBeGreaterThan(0);
  });

  it('should handle multiple price levels', () => {
    for (let i = 0; i < 5; i++) {
      book.addOrder({
        symbol: 'AAPL', side: 'buy', type: 'limit',
        price: 149 - i, quantity: 100, traderId: `b${i}`, timeInForce: 'GTC',
      });
    }
    const depth = book.getDepth(3);
    expect(depth.bids).toHaveLength(3);
  });
});
