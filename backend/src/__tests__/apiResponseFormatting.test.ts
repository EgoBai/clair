import { describe, it, expect } from 'vitest';

// API Response Formatting Tests
describe('API Response Formatting', () => {
  const formatResponse = <T>(data: T, meta?: Record<string, any>) => ({
    success: true,
    data,
    meta: { timestamp: new Date().toISOString(), ...meta } as Record<string, any>,
  });

  const formatError = (message: string, code: string, statusCode: number) => ({
    success: false,
    error: { message, code, statusCode },
    timestamp: new Date().toISOString(),
  });

  const formatPaginated = <T>(items: T[], total: number, page: number, pageSize: number) => ({
    success: true,
    data: items,
    pagination: {
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
      hasNext: page * pageSize < total,
      hasPrev: page > 1,
    },
  });

  it('should format success response with data', () => {
    const resp = formatResponse({ stocks: [1, 2, 3] });
    expect(resp.success).toBe(true);
    expect(resp.data).toEqual({ stocks: [1, 2, 3] });
    expect(resp.meta.timestamp).toBeDefined();
  });

  it('should format error response', () => {
    const resp = formatError('Not found', 'NOT_FOUND', 404);
    expect(resp.success).toBe(false);
    expect(resp.error.code).toBe('NOT_FOUND');
    expect(resp.error.statusCode).toBe(404);
  });

  it('should calculate pagination correctly', () => {
    const resp = formatPaginated([1, 2, 3], 100, 1, 3);
    expect(resp.pagination.totalPages).toBe(34);
    expect(resp.pagination.hasNext).toBe(true);
    expect(resp.pagination.hasPrev).toBe(false);
  });

  it('should detect last page', () => {
    const resp = formatPaginated([91, 92, 93, 94, 95, 96, 97, 98, 99, 100], 100, 10, 10);
    expect(resp.pagination.hasNext).toBe(false);
    expect(resp.pagination.hasPrev).toBe(true);
  });

  it('should handle empty results', () => {
    const resp = formatPaginated([], 0, 1, 10);
    expect(resp.data).toEqual([]);
    expect(resp.pagination.total).toBe(0);
    expect(resp.pagination.totalPages).toBe(0);
  });

  it('should include metadata', () => {
    const resp = formatResponse({ id: 1 }, { requestId: 'abc-123', version: '1.0' });
    expect(resp.meta.requestId).toBe('abc-123');
    expect(resp.meta.version).toBe('1.0');
  });
});

// Stock Data Transform Tests
describe('Stock Data Transforms', () => {
  interface RawStock {
    code: string;
    name: string;
    price: string;
    change: string;
    changePercent: string;
    volume: string;
    amount: string;
    high: string;
    low: string;
    open: string;
  }

  const transformStock = (raw: RawStock) => ({
    code: raw.code,
    name: raw.name,
    price: parseFloat(raw.price),
    change: parseFloat(raw.change),
    changePercent: parseFloat(raw.changePercent),
    volume: parseInt(raw.volume, 10),
    amount: parseFloat(raw.amount),
    high: parseFloat(raw.high),
    low: parseFloat(raw.low),
    open: parseFloat(raw.open),
    isUp: parseFloat(raw.change) > 0,
    isDown: parseFloat(raw.change) < 0,
    amplitude: ((parseFloat(raw.high) - parseFloat(raw.low)) / parseFloat(raw.open) * 100),
  });

  it('should parse string values to numbers', () => {
    const raw: RawStock = {
      code: '600519', name: '贵州茅台', price: '1800.50',
      change: '25.00', changePercent: '1.41', volume: '1234567',
      amount: '2223456789', high: '1820.00', low: '1780.00', open: '1775.50',
    };

    const result = transformStock(raw);
    expect(result.price).toBe(1800.50);
    expect(result.change).toBe(25.00);
    expect(result.isUp).toBe(true);
    expect(result.isDown).toBe(false);
    expect(result.amplitude).toBeCloseTo(2.24, 1);
  });

  it('should identify down stocks', () => {
    const raw: RawStock = {
      code: '000001', name: '平安银行', price: '12.50',
      change: '-0.30', changePercent: '-2.34', volume: '5000000',
      amount: '62500000', high: '12.90', low: '12.40', open: '12.80',
    };

    const result = transformStock(raw);
    expect(result.isUp).toBe(false);
    expect(result.isDown).toBe(true);
  });

  it('should handle zero change (flat)', () => {
    const raw: RawStock = {
      code: '000002', name: '万科A', price: '15.00',
      change: '0.00', changePercent: '0.00', volume: '1000000',
      amount: '15000000', high: '15.20', low: '14.80', open: '15.00',
    };

    const result = transformStock(raw);
    expect(result.isUp).toBe(false);
    expect(result.isDown).toBe(false);
  });
});

// Market Data Aggregation Tests
describe('Market Data Aggregation', () => {
  const aggregateMarket = (stocks: Array<{ changePercent: number; amount: number }>) => {
    const up = stocks.filter(s => s.changePercent > 0);
    const down = stocks.filter(s => s.changePercent < 0);
    const flat = stocks.filter(s => s.changePercent === 0);
    const limitUp = stocks.filter(s => s.changePercent >= 9.9);
    const limitDown = stocks.filter(s => s.changePercent <= -9.9);
    const totalAmount = stocks.reduce((sum, s) => sum + s.amount, 0);

    return {
      total: stocks.length,
      up: up.length,
      down: down.length,
      flat: flat.length,
      limitUp: limitUp.length,
      limitDown: limitDown.length,
      totalAmount,
      upRatio: stocks.length > 0 ? up.length / stocks.length : 0,
      avgChange: stocks.length > 0
        ? stocks.reduce((s, x) => s + x.changePercent, 0) / stocks.length
        : 0,
    };
  };

  it('should aggregate balanced market', () => {
    const stocks = Array.from({ length: 100 }, (_, i) => ({
      changePercent: (i < 50) ? 1 : -1,
      amount: 1e8,
    }));

    const result = aggregateMarket(stocks);
    expect(result.up).toBe(50);
    expect(result.down).toBe(50);
    expect(result.upRatio).toBe(0.5);
  });

  it('should detect limit up stocks', () => {
    const stocks = [
      { changePercent: 10.0, amount: 1e8 },
      { changePercent: 10.0, amount: 1e8 },
      { changePercent: 5.0, amount: 1e8 },
      { changePercent: -3.0, amount: 1e8 },
    ];

    const result = aggregateMarket(stocks);
    expect(result.limitUp).toBe(2);
    expect(result.totalAmount).toBe(4e8);
  });

  it('should handle empty market', () => {
    const result = aggregateMarket([]);
    expect(result.total).toBe(0);
    expect(result.upRatio).toBe(0);
    expect(result.avgChange).toBe(0);
  });
});

// Quote Display Formatting Tests
describe('Quote Display Formatting', () => {
  const formatQuoteForDisplay = (quote: {
    price: number; change: number; changePercent: number;
    high: number; low: number; open: number; prevClose: number;
    volume: number; amount: number;
  }) => {
    const color = quote.change > 0 ? 'red' : quote.change < 0 ? 'green' : 'gray';
    const sign = quote.change >= 0 ? '+' : '';
    return {
      price: quote.price.toFixed(2),
      change: `${sign}${quote.change.toFixed(2)}`,
      changePercent: `${sign}${quote.changePercent.toFixed(2)}%`,
      color,
      volumeStr: quote.volume >= 1e8
        ? `${(quote.volume / 1e8).toFixed(2)}亿`
        : `${(quote.volume / 1e4).toFixed(0)}万`,
      amountStr: quote.amount >= 1e8
        ? `${(quote.amount / 1e8).toFixed(2)}亿`
        : `${(quote.amount / 1e4).toFixed(0)}万`,
      highStr: quote.high.toFixed(2),
      lowStr: quote.low.toFixed(2),
      openStr: quote.open.toFixed(2),
    };
  };

  it('should format positive change', () => {
    const result = formatQuoteForDisplay({
      price: 1800.50, change: 25.00, changePercent: 1.41,
      high: 1820, low: 1780, open: 1775, prevClose: 1775.50,
      volume: 1.5e8, amount: 2.7e9,
    });
    expect(result.color).toBe('red');
    expect(result.change).toBe('+25.00');
    expect(result.changePercent).toBe('+1.41%');
    expect(result.volumeStr).toBe('1.50亿');
    expect(result.amountStr).toBe('27.00亿');
  });

  it('should format negative change', () => {
    const result = formatQuoteForDisplay({
      price: 12.50, change: -0.30, changePercent: -2.34,
      high: 12.90, low: 12.40, open: 12.80, prevClose: 12.80,
      volume: 5e4, amount: 6.25e5,
    });
    expect(result.color).toBe('green');
    expect(result.change).toBe('-0.30');
    expect(result.changePercent).toBe('-2.34%');
  });

  it('should format flat change', () => {
    const result = formatQuoteForDisplay({
      price: 15, change: 0, changePercent: 0,
      high: 15.2, low: 14.8, open: 15, prevClose: 15,
      volume: 1e4, amount: 1.5e5,
    });
    expect(result.color).toBe('gray');
    expect(result.change).toBe('+0.00');
    expect(result.volumeStr).toBe('1万');
  });
});

// Technical Analysis Helper Tests
describe('Technical Analysis Helpers', () => {
  const isBullishCross = (shortMA: number[], longMA: number[]): boolean[] => {
    const signals: boolean[] = [];
    for (let i = 1; i < shortMA.length && i < longMA.length; i++) {
      const cross = shortMA[i] > longMA[i] && shortMA[i - 1] <= longMA[i - 1];
      signals.push(cross);
    }
    return signals;
  };

  const isBearishCross = (shortMA: number[], longMA: number[]): boolean[] => {
    const signals: boolean[] = [];
    for (let i = 1; i < shortMA.length && i < longMA.length; i++) {
      const cross = shortMA[i] < longMA[i] && shortMA[i - 1] >= longMA[i - 1];
      signals.push(cross);
    }
    return signals;
  };

  const detectDivergence = (prices: number[], indicator: number[]): 'bullish' | 'bearish' | 'none' => {
    if (prices.length < 2 || indicator.length < 2) return 'none';
    const lastPriceIdx = prices.length - 1;
    const lastIndIdx = indicator.length - 1;
    const priceTrend = prices[lastPriceIdx] > prices[lastPriceIdx - 1];
    const indTrend = indicator[lastIndIdx] > indicator[lastIndIdx - 1];
    if (priceTrend && !indTrend) return 'bearish';
    if (!priceTrend && indTrend) return 'bullish';
    return 'none';
  };

  it('should detect golden cross', () => {
    const short = [10, 10, 11, 12]; // crosses above
    const long  = [11, 11, 11, 11];
    const signals = isBullishCross(short, long);
    // At index 2: short(11) > long(11)? No, equal. At index 3: short(12) > long(11), prev equal
    // Actually at i=1: 10<11, i=2: 11==11, prev 10<=11 but 11>11? No
    // At i=3: 12>11, prev short[2]=11 <= long[2]=11 => true
    expect(signals[2]).toBe(true);
  });

  it('should detect death cross', () => {
    const short = [12, 12, 11, 10]; // crosses below
    const long  = [11, 11, 11, 11];
    const signals = isBearishCross(short, long);
    expect(signals[2]).toBe(true);
  });

  it('should detect bullish divergence', () => {
    // Price making lower lows, indicator making higher lows
    const prices = [100, 95, 90];
    const indicator = [30, 35, 40];
    expect(detectDivergence(prices, indicator)).toBe('bullish');
  });

  it('should detect bearish divergence', () => {
    // Price making higher highs, indicator making lower highs
    const prices = [100, 105, 110];
    const indicator = [70, 65, 60];
    expect(detectDivergence(prices, indicator)).toBe('bearish');
  });

  it('should detect no divergence', () => {
    const prices = [100, 105, 110];
    const indicator = [30, 35, 40];
    expect(detectDivergence(prices, indicator)).toBe('none');
  });

  it('should handle insufficient data', () => {
    expect(detectDivergence([100], [30])).toBe('none');
    expect(detectDivergence([], [])).toBe('none');
  });
});

// Order Book Aggregation Tests
describe('Order Book Aggregation', () => {
  const aggregateOrderBook = (orders: Array<{ price: number; quantity: number; side: 'buy' | 'sell' }>) => {
    const buyLevels = new Map<number, number>();
    const sellLevels = new Map<number, number>();

    for (const order of orders) {
      const map = order.side === 'buy' ? buyLevels : sellLevels;
      map.set(order.price, (map.get(order.price) || 0) + order.quantity);
    }

    const buy = Array.from(buyLevels.entries())
      .map(([price, qty]) => ({ price, quantity: qty }))
      .sort((a, b) => b.price - a.price); // Descending

    const sell = Array.from(sellLevels.entries())
      .map(([price, qty]) => ({ price, quantity: qty }))
      .sort((a, b) => a.price - b.price); // Ascending

    const totalBuyQty = buy.reduce((s, l) => s + l.quantity, 0);
    const totalSellQty = sell.reduce((s, l) => s + l.quantity, 0);

    return {
      buy,
      sell,
      totalBuyQty,
      totalSellQty,
      spread: sell.length > 0 && buy.length > 0 ? sell[0].price - buy[0].price : 0,
      imbalanceRatio: totalBuyQty + totalSellQty > 0
        ? (totalBuyQty - totalSellQty) / (totalBuyQty + totalSellQty)
        : 0,
    };
  };

  it('should aggregate buy orders', () => {
    const orders = [
      { price: 10.00, quantity: 100, side: 'buy' as const },
      { price: 10.00, quantity: 200, side: 'buy' as const },
      { price: 9.90, quantity: 500, side: 'buy' as const },
    ];

    const result = aggregateOrderBook(orders);
    expect(result.buy).toHaveLength(2);
    expect(result.buy[0].price).toBe(10.00);
    expect(result.buy[0].quantity).toBe(300);
    expect(result.totalBuyQty).toBe(800);
  });

  it('should aggregate sell orders ascending', () => {
    const orders = [
      { price: 10.10, quantity: 100, side: 'sell' as const },
      { price: 10.20, quantity: 200, side: 'sell' as const },
      { price: 10.05, quantity: 150, side: 'sell' as const },
    ];

    const result = aggregateOrderBook(orders);
    expect(result.sell[0].price).toBe(10.05);
    expect(result.sell[1].price).toBe(10.10);
    expect(result.sell[2].price).toBe(10.20);
  });

  it('should calculate spread', () => {
    const orders = [
      { price: 10.00, quantity: 100, side: 'buy' as const },
      { price: 10.10, quantity: 100, side: 'sell' as const },
    ];

    const result = aggregateOrderBook(orders);
    expect(result.spread).toBeCloseTo(0.10, 2);
  });

  it('should calculate imbalance ratio', () => {
    const orders = [
      { price: 10.00, quantity: 300, side: 'buy' as const },
      { price: 10.10, quantity: 100, side: 'sell' as const },
    ];

    const result = aggregateOrderBook(orders);
    // (300-100)/(300+100) = 0.5
    expect(result.imbalanceRatio).toBeCloseTo(0.5, 2);
  });
});

// Cache Key Pattern Tests
describe('Cache Key Patterns', () => {
  const buildCacheKey = (prefix: string, params: Record<string, any>): string => {
    const sorted = Object.entries(params).sort(([a], [b]) => a.localeCompare(b));
    const paramStr = sorted.map(([k, v]) => `${k}=${v}`).join('&');
    return `${prefix}:${paramStr}`;
  };

  const matchPattern = (key: string, pattern: string): boolean => {
    const regex = new RegExp('^' + pattern.replace('*', '.*').replace('?', '.') + '$');
    return regex.test(key);
  };

  it('should build deterministic cache keys', () => {
    const key1 = buildCacheKey('stock', { symbol: '600519', period: 'day' });
    const key2 = buildCacheKey('stock', { period: 'day', symbol: '600519' });
    expect(key1).toBe(key2);
    expect(key1).toBe('stock:period=day&symbol=600519');
  });

  it('should match wildcard patterns', () => {
    expect(matchPattern('stock:600519:kline', 'stock:*')).toBe(true);
    expect(matchPattern('stock:600519:kline', 'stock:600519:*')).toBe(true);
    expect(matchPattern('other:600519:kline', 'stock:*')).toBe(false);
  });

  it('should match single char wildcard', () => {
    expect(matchPattern('abc', 'a?c')).toBe(true);
    expect(matchPattern('aXc', 'a?c')).toBe(true);
    expect(matchPattern('aXYc', 'a?c')).toBe(false);
  });

  it('should build different keys for different params', () => {
    const key1 = buildCacheKey('kline', { symbol: '600519', period: 'day' });
    const key2 = buildCacheKey('kline', { symbol: '600519', period: 'week' });
    expect(key1).not.toBe(key2);
  });
});
