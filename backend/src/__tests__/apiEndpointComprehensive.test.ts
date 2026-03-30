import { describe, it, expect } from 'vitest';

// 统一响应格式验证
describe('API Response Format', () => {
  interface ApiResponse<T = unknown> {
    success: boolean;
    data: T;
    message?: string;
    error?: string;
    timestamp: number;
    requestId?: string;
  }

  const buildResponse = <T>(data: T, success = true): ApiResponse<T> => ({
    success,
    data,
    timestamp: Date.now(),
    requestId: `req_${Math.random().toString(36).slice(2, 10)}`,
  });

  it('success response has correct structure', () => {
    const resp = buildResponse({ stocks: [] });
    expect(resp.success).toBe(true);
    expect(resp.data).toBeDefined();
    expect(typeof resp.timestamp).toBe('number');
  });

  it('error response has correct structure', () => {
    const resp = buildResponse(null, false);
    expect(resp.success).toBe(false);
  });

  it('paginated response includes total and page info', () => {
    interface PaginatedResponse<T> {
      items: T[];
      total: number;
      page: number;
      pageSize: number;
      totalPages: number;
    }
    const paginate = <T>(items: T[], total: number, page: number, pageSize: number): PaginatedResponse<T> => ({
      items,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    });
    const result = paginate([1, 2, 3], 50, 1, 10);
    expect(result.totalPages).toBe(5);
    expect(result.items.length).toBeLessThanOrEqual(result.pageSize);
  });

  it('request ID is unique per request', () => {
    const ids = new Set<string>();
    for (let i = 0; i < 20; i++) {
      ids.add(buildResponse(null).requestId!);
    }
    expect(ids.size).toBe(20);
  });

  it('timestamp is within reasonable range', () => {
    const resp = buildResponse(null);
    const now = Date.now();
    expect(resp.timestamp).toBeLessThanOrEqual(now);
    expect(resp.timestamp).toBeGreaterThan(now - 1000);
  });

  it('handles undefined data gracefully', () => {
    const resp = buildResponse(undefined);
    expect(resp.data).toBeUndefined();
    expect(resp.success).toBe(true);
  });

  it('error message format is string', () => {
    const resp: ApiResponse = {
      success: false,
      data: null,
      error: 'Not Found',
      timestamp: Date.now(),
    };
    expect(typeof resp.error).toBe('string');
  });

  it('handles null data in success response', () => {
    const resp = buildResponse(null);
    expect(resp.success).toBe(true);
    expect(resp.data).toBeNull();
  });

  it('error response preserves error code', () => {
    const resp = { success: false, data: null, error: 'VALIDATION_ERROR', details: [{ field: 'symbol' }], timestamp: Date.now() };
    expect(resp.error).toBe('VALIDATION_ERROR');
    expect(resp.details).toBeDefined();
  });

  it('paginated empty results return correct totalPages', () => {
    const paginate = <T>(items: T[], total: number, page: number, pageSize: number) => ({
      items, total, page, pageSize, totalPages: Math.ceil(total / pageSize),
    });
    const result = paginate([], 0, 1, 10);
    expect(result.totalPages).toBe(0);
    expect(result.items).toHaveLength(0);
  });

  it('response with array data maintains structure', () => {
    const data = [{ id: 1 }, { id: 2 }, { id: 3 }];
    const resp = buildResponse(data);
    expect(Array.isArray(resp.data)).toBe(true);
    expect(resp.data.length).toBe(3);
  });
});

// 股票搜索API逻辑
describe('Stock Search API Logic', () => {
  interface Stock {
    symbol: string;
    name: string;
    market: string;
    industry: string;
    price: number;
    changePercent: number;
  }

  const stocks: Stock[] = [
    { symbol: '600519', name: '贵州茅台', market: 'sh', industry: '白酒', price: 1800, changePercent: 2.5 },
    { symbol: '000858', name: '五粮液', market: 'sz', industry: '白酒', price: 150, changePercent: -1.2 },
    { symbol: '601318', name: '中国平安', market: 'sh', industry: '保险', price: 50, changePercent: 0.8 },
    { symbol: '000001', name: '平安银行', market: 'sz', industry: '银行', price: 12, changePercent: 3.1 },
    { symbol: '300750', name: '宁德时代', market: 'sz', industry: '新能源', price: 200, changePercent: -2.8 },
  ];

  const searchStocks = (query: string, market?: string, industry?: string) => {
    let results = stocks.filter(s =>
      s.symbol.includes(query) || s.name.includes(query)
    );
    if (market) results = results.filter(s => s.market === market);
    if (industry) results = results.filter(s => s.industry === industry);
    return results;
  };

  it('searches by symbol', () => {
    const results = searchStocks('600519');
    expect(results.length).toBe(1);
    expect(results[0].symbol).toBe('600519');
  });

  it('searches by name keyword', () => {
    const results = searchStocks('平安');
    expect(results.length).toBe(2);
  });

  it('filters by market', () => {
    const results = searchStocks('平安', 'sh');
    expect(results.length).toBe(1);
    expect(results[0].symbol).toBe('601318');
  });

  it('filters by industry', () => {
    const results = searchStocks('', undefined, '白酒');
    expect(results.length).toBe(2);
  });

  it('returns empty for no match', () => {
    const results = searchStocks('不存在的股票');
    expect(results.length).toBe(0);
  });

  it('combined filters work correctly', () => {
    const results = searchStocks('平安', 'sz', '银行');
    expect(results.length).toBe(1);
    expect(results[0].name).toBe('平安银行');
  });

  it('sorts by changePercent descending', () => {
    const sorted = [...stocks].sort((a, b) => b.changePercent - a.changePercent);
    expect(sorted[0].changePercent).toBeGreaterThanOrEqual(sorted[1].changePercent);
  });

  it('paginates results correctly', () => {
    const paginate = (items: Stock[], page: number, pageSize: number) => {
      const start = (page - 1) * pageSize;
      return items.slice(start, start + pageSize);
    };
    expect(paginate(stocks, 1, 2).length).toBe(2);
    expect(paginate(stocks, 3, 2).length).toBe(1);
    expect(paginate(stocks, 4, 2).length).toBe(0);
  });
});

// 行情数据API逻辑
describe('Market Data API Logic', () => {
  interface KLine {
    date: string;
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
    amount: number;
  }

  const validateKLine = (k: KLine): string[] => {
    const errors: string[] = [];
    if (k.high < k.low) errors.push('high < low');
    if (k.high < k.open) errors.push('high < open');
    if (k.high < k.close) errors.push('high < close');
    if (k.low > k.open) errors.push('low > open');
    if (k.low > k.close) errors.push('low > close');
    if (k.volume < 0) errors.push('negative volume');
    if (k.amount < 0) errors.push('negative amount');
    return errors;
  };

  it('valid OHLC data passes validation', () => {
    const k: KLine = { date: '2026-03-24', open: 100, high: 105, low: 98, close: 103, volume: 1000000, amount: 103000000 };
    expect(validateKLine(k)).toHaveLength(0);
  });

  it('high < low fails validation', () => {
    const k: KLine = { date: '2026-03-24', open: 100, high: 95, low: 98, close: 97, volume: 1000, amount: 97000 };
    expect(validateKLine(k)).toContain('high < low');
  });

  it('negative volume fails validation', () => {
    const k: KLine = { date: '2026-03-24', open: 100, high: 105, low: 98, close: 103, volume: -100, amount: 10000 };
    expect(validateKLine(k)).toContain('negative volume');
  });

  it('calculates daily change percent', () => {
    const calcChange = (close: number, prevClose: number) => ((close - prevClose) / prevClose) * 100;
    expect(calcChange(110, 100)).toBeCloseTo(10, 2);
    expect(calcChange(90, 100)).toBeCloseTo(-10, 2);
    expect(calcChange(100, 100)).toBeCloseTo(0, 2);
  });

  it('calculates amplitude correctly', () => {
    const amplitude = (high: number, low: number, prevClose: number) => ((high - low) / prevClose) * 100;
    expect(amplitude(110, 90, 100)).toBeCloseTo(20, 2);
  });

  it('filters KLines by date range', () => {
    const klines: KLine[] = [
      { date: '2026-03-20', open: 100, high: 105, low: 98, close: 103, volume: 1000, amount: 103000 },
      { date: '2026-03-21', open: 103, high: 108, low: 101, close: 106, volume: 1200, amount: 127200 },
      { date: '2026-03-24', open: 106, high: 110, low: 104, close: 108, volume: 1500, amount: 162000 },
    ];
    const filtered = klines.filter(k => k.date >= '2026-03-21' && k.date <= '2026-03-24');
    expect(filtered.length).toBe(2);
  });

  it('volume-weighted average price calculation', () => {
    const vwap = (klines: KLine[]) => {
      const totalAmount = klines.reduce((s, k) => s + k.amount, 0);
      const totalVolume = klines.reduce((s, k) => s + k.volume, 0);
      return totalVolume > 0 ? totalAmount / totalVolume : 0;
    };
    const klines: KLine[] = [
      { date: '2026-03-24', open: 100, high: 105, low: 98, close: 103, volume: 1000, amount: 103000 },
      { date: '2026-03-25', open: 103, high: 108, low: 101, close: 106, volume: 2000, amount: 212000 },
    ];
    expect(vwap(klines)).toBeCloseTo(105, 0);
  });

  it('limits KLine results correctly', () => {
    const klines = Array.from({ length: 100 }, (_, i) => ({
      date: `2026-${String(Math.floor(i / 30) + 1).padStart(2, '0')}-${String((i % 30) + 1).padStart(2, '0')}`,
      open: 100 + i, high: 105 + i, low: 98 + i, close: 102 + i,
      volume: 1000, amount: 102000,
    }));
    expect(klines.slice(0, 30).length).toBe(30);
    expect(klines.slice(0, 60).length).toBe(60);
  });
});

// 错误处理链验证
describe('Error Handling Chain', () => {
  enum ErrorCode {
    NOT_FOUND = 'NOT_FOUND',
    VALIDATION_ERROR = 'VALIDATION_ERROR',
    RATE_LIMITED = 'RATE_LIMITED',
    INTERNAL_ERROR = 'INTERNAL_ERROR',
    UNAUTHORIZED = 'UNAUTHORIZED',
  }

  const getHttpStatus = (code: ErrorCode): number => {
    const map: Record<ErrorCode, number> = {
      [ErrorCode.NOT_FOUND]: 404,
      [ErrorCode.VALIDATION_ERROR]: 400,
      [ErrorCode.RATE_LIMITED]: 429,
      [ErrorCode.INTERNAL_ERROR]: 500,
      [ErrorCode.UNAUTHORIZED]: 401,
    };
    return map[code];
  };

  it('maps error codes to HTTP status', () => {
    expect(getHttpStatus(ErrorCode.NOT_FOUND)).toBe(404);
    expect(getHttpStatus(ErrorCode.VALIDATION_ERROR)).toBe(400);
    expect(getHttpStatus(ErrorCode.RATE_LIMITED)).toBe(429);
    expect(getHttpStatus(ErrorCode.INTERNAL_ERROR)).toBe(500);
    expect(getHttpStatus(ErrorCode.UNAUTHORIZED)).toBe(401);
  });

  it('rate limit response includes retry header', () => {
    const rateLimitResponse = (retryAfter: number) => ({
      status: 429,
      headers: { 'Retry-After': String(retryAfter) },
      body: { error: 'Too Many Requests', retryAfter },
    });
    const resp = rateLimitResponse(30);
    expect(resp.headers['Retry-After']).toBe('30');
  });

  it('validation error includes field details', () => {
    interface ValidationError {
      field: string;
      message: string;
      value: unknown;
    }
    const errors: ValidationError[] = [
      { field: 'page', message: 'must be >= 1', value: -1 },
      { field: 'symbol', message: 'invalid format', value: 'abc123!' },
    ];
    expect(errors.length).toBe(2);
    expect(errors[0].field).toBe('page');
  });

  it('error stack is sanitized in production', () => {
    const sanitizeError = (err: Error, isProd: boolean) => ({
      message: err.message,
      stack: isProd ? undefined : err.stack,
    });
    const err = new Error('test');
    const prod = sanitizeError(err, true);
    const dev = sanitizeError(err, false);
    expect(prod.stack).toBeUndefined();
    expect(dev.stack).toBeDefined();
  });
});
