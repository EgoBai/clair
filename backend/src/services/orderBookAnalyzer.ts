/**
 * 订单簿分析引擎
 * 深度分析买卖盘口、大单追踪、盘口异动
 */

export interface OrderBookLevel {
  price: number;
  quantity: number;
  orderCount: number;
}

export interface OrderBook {
  stockCode: string;
  timestamp: string;
  bids: OrderBookLevel[]; // 买盘
  asks: OrderBookLevel[]; // 卖盘
}

export interface LargeOrder {
  price: number;
  quantity: number;
  side: 'bid' | 'ask';
  ratio: number; // 占该价位总量比
  timestamp: string;
}

export interface BookImbalance {
  bidVolume: number;
  askVolume: number;
  imbalanceRatio: number; // >1 偏买, <1 偏卖
  weightedMidPrice: number;
  spread: number;
  spreadPercent: number;
  depth: number;
  liquidityScore: number; // 0-100
}

export interface OrderFlowAnalysis {
  stockCode: string;
  timestamp: string;
  buyPressure: number;
  sellPressure: number;
  netPressure: number;
  vwap: number;
  twap: number;
  largeOrders: LargeOrder[];
  icebergs: { price: number; estimatedSize: number }[];
  spoofing: { price: number; suspicious: boolean }[];
}

export class OrderBookAnalyzer {
  private books: Map<string, OrderBook[]> = new Map();
  private largeOrderThreshold: number = 100000; // 大单阈值

  setLargeOrderThreshold(threshold: number): void {
    this.largeOrderThreshold = threshold;
  }

  addOrderBook(book: OrderBook): void {
    const books = this.books.get(book.stockCode) || [];
    books.push(book);
    // Keep last 1000 snapshots
    if (books.length > 1000) books.shift();
    this.books.set(book.stockCode, books);
  }

  getOrderBook(stockCode: string): OrderBook | undefined {
    const books = this.books.get(stockCode);
    return books ? books[books.length - 1] : undefined;
  }

  analyzeImbalance(stockCode: string): BookImbalance | undefined {
    const book = this.getOrderBook(stockCode);
    if (!book) return undefined;

    const bidVolume = book.bids.reduce((sum, b) => sum + b.quantity, 0);
    const askVolume = book.asks.reduce((sum, a) => sum + a.quantity, 0);
    
    const imbalanceRatio = askVolume > 0 ? bidVolume / askVolume : bidVolume > 0 ? Infinity : 1;

    const bidValue = book.bids.reduce((sum, b) => sum + b.price * b.quantity, 0);
    const askValue = book.asks.reduce((sum, a) => sum + a.price * a.quantity, 0);
    const totalVolume = bidVolume + askVolume;
    const weightedMidPrice = totalVolume > 0 
      ? (bidValue + askValue) / totalVolume 
      : 0;

    const bestBid = book.bids.length > 0 ? book.bids[0].price : 0;
    const bestAsk = book.asks.length > 0 ? book.asks[0].price : 0;
    const spread = bestAsk - bestBid;
    const spreadPercent = bestBid > 0 ? (spread / bestBid) * 100 : 0;

    const depth = Math.min(book.bids.length, book.asks.length);
    
    // Liquidity score based on spread, depth, and volume
    const spreadScore = Math.max(0, 100 - spreadPercent * 1000);
    const depthScore = Math.min(100, depth * 10);
    const volumeScore = Math.min(100, totalVolume / 1000);
    const liquidityScore = (spreadScore * 0.4 + depthScore * 0.3 + volumeScore * 0.3);

    return {
      bidVolume,
      askVolume,
      imbalanceRatio,
      weightedMidPrice,
      spread,
      spreadPercent,
      depth,
      liquidityScore: Math.round(liquidityScore)
    };
  }

  detectLargeOrders(stockCode: string): LargeOrder[] {
    const book = this.getOrderBook(stockCode);
    if (!book) return [];

    const largeOrders: LargeOrder[] = [];
    const now = new Date().toISOString();

    for (const bid of book.bids) {
      if (bid.quantity >= this.largeOrderThreshold) {
        const totalAtPrice = bid.quantity * bid.orderCount;
        largeOrders.push({
          price: bid.price,
          quantity: bid.quantity,
          side: 'bid',
          ratio: totalAtPrice > 0 ? bid.quantity / totalAtPrice : 1,
          timestamp: now
        });
      }
    }

    for (const ask of book.asks) {
      if (ask.quantity >= this.largeOrderThreshold) {
        const totalAtPrice = ask.quantity * ask.orderCount;
        largeOrders.push({
          price: ask.price,
          quantity: ask.quantity,
          side: 'ask',
          ratio: totalAtPrice > 0 ? ask.quantity / totalAtPrice : 1,
          timestamp: now
        });
      }
    }

    return largeOrders.sort((a, b) => b.quantity - a.quantity);
  }

  analyzeOrderFlow(stockCode: string): OrderFlowAnalysis | undefined {
    const books = this.books.get(stockCode);
    if (!books || books.length < 2) return undefined;

    const latest = books[books.length - 1];
    
    const buyPressure = latest.bids.reduce((sum, b) => sum + b.price * b.quantity, 0);
    const sellPressure = latest.asks.reduce((sum, a) => sum + a.price * a.quantity, 0);
    const netPressure = buyPressure - sellPressure;

    // VWAP from order book
    const totalValue = buyPressure + sellPressure;
    const totalVolume = latest.bids.reduce((s, b) => s + b.quantity, 0) + 
                        latest.asks.reduce((s, a) => s + a.quantity, 0);
    const vwap = totalVolume > 0 ? totalValue / totalVolume : 0;

    // TWAP approximation
    const prices = books.slice(-20).map(b => {
      const bid = b.bids[0]?.price || 0;
      const ask = b.asks[0]?.price || 0;
      return (bid + ask) / 2;
    });
    const twap = prices.length > 0 ? prices.reduce((s, p) => s + p, 0) / prices.length : 0;

    // Detect icebergs (consistent orders at same price)
    const icebergs = this.detectIcebergs(books);

    // Detect spoofing
    const spoofing = this.detectSpoofing(latest);

    return {
      stockCode,
      timestamp: latest.timestamp,
      buyPressure,
      sellPressure,
      netPressure,
      vwap,
      twap,
      largeOrders: this.detectLargeOrders(stockCode),
      icebergs,
      spoofing
    };
  }

  private detectIcebergs(books: OrderBook[]): { price: number; estimatedSize: number }[] {
    const priceFrequency = new Map<number, number>();
    
    for (const book of books.slice(-50)) {
      for (const bid of book.bids) {
        priceFrequency.set(bid.price, (priceFrequency.get(bid.price) || 0) + 1);
      }
    }

    const icebergs: { price: number; estimatedSize: number }[] = [];
    for (const [price, freq] of priceFrequency) {
      if (freq >= 20) { // Appears in 20+ snapshots
        icebergs.push({
          price,
          estimatedSize: freq * 1000
        });
      }
    }
    
    return icebergs;
  }

  private detectSpoofing(book: OrderBook): { price: number; suspicious: boolean }[] {
    const suspicious: { price: number; suspicious: boolean }[] = [];
    
    // Large orders far from best bid/ask might be spoofing
    const bestBid = book.bids[0]?.price || 0;
    const bestAsk = book.asks[0]?.price || 0;
    const midPrice = (bestBid + bestAsk) / 2;

    for (const bid of book.bids) {
      const distFromMid = Math.abs(bid.price - midPrice) / midPrice;
      if (distFromMid > 0.05 && bid.quantity > this.largeOrderThreshold * 5) {
        suspicious.push({ price: bid.price, suspicious: true });
      }
    }

    for (const ask of book.asks) {
      const distFromMid = Math.abs(ask.price - midPrice) / midPrice;
      if (distFromMid > 0.05 && ask.quantity > this.largeOrderThreshold * 5) {
        suspicious.push({ price: ask.price, suspicious: true });
      }
    }

    return suspicious;
  }

  getMarketImpact(stockCode: string, side: 'buy' | 'sell', quantity: number): number {
    const book = this.getOrderBook(stockCode);
    if (!book) return 0;

    const levels = side === 'buy' ? book.asks : book.bids;
    let remaining = quantity;
    let totalCost = 0;

    for (const level of levels) {
      const fillQty = Math.min(remaining, level.quantity);
      totalCost += fillQty * level.price;
      remaining -= fillQty;
      if (remaining <= 0) break;
    }

    if (remaining > 0) return Infinity; // Not enough liquidity
    
    const avgPrice = totalCost / quantity;
    const refPrice = levels[0]?.price || 0;
    return refPrice > 0 ? Math.abs(avgPrice - refPrice) / refPrice : 0;
  }
}

export default new OrderBookAnalyzer();
