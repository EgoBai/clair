import { describe, it, expect } from 'vitest';

// 数据质量检查
interface DataQualityCheck {
  name: string;
  passed: boolean;
  message: string;
}

function checkNullValues(record: Record<string, unknown>, requiredFields: string[]): DataQualityCheck[] {
  const checks: DataQualityCheck[] = [];
  for (const field of requiredFields) {
    const val = record[field];
    checks.push({
      name: `null_check_${field}`,
      passed: val !== null && val !== undefined,
      message: val === null || val === undefined ? `字段 ${field} 为空` : `字段 ${field} 非空`
    });
  }
  return checks;
}

function checkNumericRange(value: number, min: number, max: number, fieldName: string): DataQualityCheck {
  return {
    name: `range_check_${fieldName}`,
    passed: value >= min && value <= max,
    message: value >= min && value <= max 
      ? `${fieldName} 在范围内` 
      : `${fieldName} 值 ${value} 超出范围 [${min}, ${max}]`
  };
}

function checkDateFormat(dateStr: string): DataQualityCheck {
  const regex = /^\d{4}-\d{2}-\d{2}$/;
  const passed = regex.test(dateStr);
  return {
    name: 'date_format_check',
    passed,
    message: passed ? '日期格式正确' : `日期格式错误: ${dateStr}`
  };
}

function calculateQualityScore(checks: DataQualityCheck[]): number {
  if (checks.length === 0) return 100;
  const passedCount = checks.filter(c => c.passed).length;
  return Math.round((passedCount / checks.length) * 100);
}

describe('数据质量检查', () => {
  it('非空检查通过', () => {
    const checks = checkNullValues({ name: 'test', value: 100 }, ['name', 'value']);
    expect(checks.every(c => c.passed)).toBe(true);
  });

  it('非空检查失败', () => {
    const checks = checkNullValues({ name: null, value: 100 }, ['name', 'value']);
    expect(checks[0].passed).toBe(false);
    expect(checks[1].passed).toBe(true);
  });

  it('undefined检查', () => {
    const checks = checkNullValues({}, ['name']);
    expect(checks[0].passed).toBe(false);
  });

  it('数值范围检查', () => {
    expect(checkNumericRange(50, 0, 100, 'price').passed).toBe(true);
    expect(checkNumericRange(-1, 0, 100, 'price').passed).toBe(false);
    expect(checkNumericRange(101, 0, 100, 'price').passed).toBe(false);
  });

  it('边界值检查', () => {
    expect(checkNumericRange(0, 0, 100, 'val').passed).toBe(true);
    expect(checkNumericRange(100, 0, 100, 'val').passed).toBe(true);
  });

  it('日期格式检查', () => {
    expect(checkDateFormat('2024-01-15').passed).toBe(true);
    expect(checkDateFormat('2024/01/15').passed).toBe(false);
    expect(checkDateFormat('invalid').passed).toBe(false);
    expect(checkDateFormat('').passed).toBe(false);
  });

  it('质量评分', () => {
    const checks = [
      { name: '1', passed: true, message: '' },
      { name: '2', passed: true, message: '' },
      { name: '3', passed: false, message: '' }
    ];
    expect(calculateQualityScore(checks)).toBe(67);
  });

  it('全部通过100分', () => {
    const checks = [
      { name: '1', passed: true, message: '' },
      { name: '2', passed: true, message: '' }
    ];
    expect(calculateQualityScore(checks)).toBe(100);
  });

  it('全部失败0分', () => {
    const checks = [
      { name: '1', passed: false, message: '' },
      { name: '2', passed: false, message: '' }
    ];
    expect(calculateQualityScore(checks)).toBe(0);
  });

  it('空检查列表100分', () => {
    expect(calculateQualityScore([])).toBe(100);
  });
});

// 数据映射与转换
function normalizeStockData(raw: Record<string, string>): {
  code: string;
  name: string;
  price: number;
  change: number;
  volume: number;
  turnover: number;
  marketCap: number;
} {
  return {
    code: raw.code || '',
    name: raw.name || '',
    price: isFinite(parseFloat(raw.price)) ? parseFloat(raw.price) : 0,
    change: isFinite(parseFloat(raw.change)) ? parseFloat(raw.change) : 0,
    volume: Number.isSafeInteger(parseInt(raw.volume)) ? parseInt(raw.volume) : 0,
    turnover: isFinite(parseFloat(raw.turnover)) ? parseFloat(raw.turnover) : 0,
    marketCap: isFinite(parseFloat(raw.marketCap)) ? parseFloat(raw.marketCap) : 0
  };
}

function enrichStockData(data: { price: number; prevClose: number }): {
  changePercent: number;
  isUp: boolean;
  isDown: boolean;
} {
  const changePercent = data.prevClose > 0 
    ? ((data.price - data.prevClose) / data.prevClose) * 100 
    : 0;
  return {
    changePercent: Math.round(changePercent * 100) / 100,
    isUp: data.price > data.prevClose,
    isDown: data.price < data.prevClose
  };
}

describe('数据映射与转换', () => {
  it('原始数据规范化', () => {
    const raw = { code: '600519', name: '贵州茅台', price: '1800.00', change: '1.5', volume: '10000', turnover: '18000000', marketCap: '220000000000' };
    const normalized = normalizeStockData(raw);
    expect(normalized.code).toBe('600519');
    expect(normalized.price).toBe(1800);
    expect(normalized.volume).toBe(10000);
  });

  it('无效数据返回默认值', () => {
    const raw = { code: '', name: '', price: 'abc', change: '', volume: 'xyz', turnover: '', marketCap: '' };
    const normalized = normalizeStockData(raw);
    expect(normalized.price).toBe(0);
    expect(normalized.volume).toBe(0);
  });

  it('空对象规范化', () => {
    const normalized = normalizeStockData({});
    expect(normalized.code).toBe('');
    expect(normalized.price).toBe(0);
  });

  it('数据富化涨跌判定', () => {
    const enriched = enrichStockData({ price: 11, prevClose: 10 });
    expect(enriched.isUp).toBe(true);
    expect(enriched.isDown).toBe(false);
    expect(enriched.changePercent).toBe(10);
  });

  it('数据富化下跌判定', () => {
    const enriched = enrichStockData({ price: 9, prevClose: 10 });
    expect(enriched.isDown).toBe(true);
    expect(enriched.isUp).toBe(false);
    expect(enriched.changePercent).toBe(-10);
  });

  it('零昨收不报错', () => {
    const enriched = enrichStockData({ price: 10, prevClose: 0 });
    expect(enriched.changePercent).toBe(0);
  });

  it('涨跌幅精确到百分位', () => {
    const enriched = enrichStockData({ price: 10.123, prevClose: 10 });
    expect(String(enriched.changePercent).split('.')[1]?.length || 0).toBeLessThanOrEqual(2);
  });
});

// 缓存管理
class SimpleCache<T> {
  private cache = new Map<string, { value: T; expiry: number }>();
  private ttl: number;
  
  constructor(ttlMs: number = 30000) {
    this.ttl = ttlMs;
  }
  
  set(key: string, value: T): void {
    this.cache.set(key, { value, expiry: Date.now() + this.ttl });
  }
  
  get(key: string): T | undefined {
    const entry = this.cache.get(key);
    if (!entry) return undefined;
    if (Date.now() > entry.expiry) {
      this.cache.delete(key);
      return undefined;
    }
    return entry.value;
  }
  
  has(key: string): boolean {
    return this.get(key) !== undefined;
  }
  
  delete(key: string): boolean {
    return this.cache.delete(key);
  }
  
  clear(): void {
    this.cache.clear();
  }
  
  size(): number {
    // Clean expired first
    const now = Date.now();
    for (const [key, entry] of this.cache) {
      if (now > entry.expiry) this.cache.delete(key);
    }
    return this.cache.size;
  }
  
  keys(): string[] {
    return Array.from(this.cache.keys()).filter(k => this.has(k));
  }
}

describe('缓存管理', () => {
  it('存取数据', () => {
    const cache = new SimpleCache<number>(10000);
    cache.set('key', 42);
    expect(cache.get('key')).toBe(42);
  });

  it('不存在的key返回undefined', () => {
    const cache = new SimpleCache<number>(10000);
    expect(cache.get('nonexistent')).toBeUndefined();
  });

  it('过期数据清理', () => {
    const cache = new SimpleCache<number>(1); // 1ms TTL
    cache.set('key', 42);
    // Wait for expiry
    const start = Date.now();
    while (Date.now() - start < 5) {} // busy wait
    expect(cache.get('key')).toBeUndefined();
  });

  it('删除数据', () => {
    const cache = new SimpleCache<number>(10000);
    cache.set('key', 42);
    cache.delete('key');
    expect(cache.get('key')).toBeUndefined();
  });

  it('清空缓存', () => {
    const cache = new SimpleCache<number>(10000);
    cache.set('a', 1);
    cache.set('b', 2);
    cache.clear();
    expect(cache.size()).toBe(0);
  });

  it('has检查', () => {
    const cache = new SimpleCache<number>(10000);
    expect(cache.has('key')).toBe(false);
    cache.set('key', 42);
    expect(cache.has('key')).toBe(true);
  });

  it('存储对象', () => {
    const cache = new SimpleCache<{ name: string }>(10000);
    cache.set('user', { name: 'test' });
    expect(cache.get('user')).toEqual({ name: 'test' });
  });

  it('覆盖已有key', () => {
    const cache = new SimpleCache<number>(10000);
    cache.set('key', 1);
    cache.set('key', 2);
    expect(cache.get('key')).toBe(2);
  });
});

// 限频器
class RateLimiter {
  private timestamps: number[] = [];
  private windowMs: number;
  private maxRequests: number;
  
  constructor(windowMs: number, maxRequests: number) {
    this.windowMs = windowMs;
    this.maxRequests = maxRequests;
  }
  
  canProceed(): boolean {
    this.cleanup();
    return this.timestamps.length < this.maxRequests;
  }
  
  record(): boolean {
    if (!this.canProceed()) return false;
    this.timestamps.push(Date.now());
    return true;
  }
  
  remaining(): number {
    this.cleanup();
    return Math.max(0, this.maxRequests - this.timestamps.length);
  }
  
  resetTime(): number {
    if (this.timestamps.length === 0) return 0;
    return this.timestamps[0] + this.windowMs;
  }
  
  private cleanup(): void {
    const cutoff = Date.now() - this.windowMs;
    this.timestamps = this.timestamps.filter(t => t > cutoff);
  }
}

describe('限频器', () => {
  it('初始状态允许请求', () => {
    const limiter = new RateLimiter(60000, 5);
    expect(limiter.canProceed()).toBe(true);
  });

  it('超过限制拒绝请求', () => {
    const limiter = new RateLimiter(60000, 2);
    limiter.record();
    limiter.record();
    expect(limiter.canProceed()).toBe(false);
  });

  it('剩余次数递减', () => {
    const limiter = new RateLimiter(60000, 3);
    expect(limiter.remaining()).toBe(3);
    limiter.record();
    expect(limiter.remaining()).toBe(2);
    limiter.record();
    expect(limiter.remaining()).toBe(1);
  });

  it('record返回是否成功', () => {
    const limiter = new RateLimiter(60000, 1);
    expect(limiter.record()).toBe(true);
    expect(limiter.record()).toBe(false);
  });

  it('时间窗口后重置', () => {
    const limiter = new RateLimiter(1, 1); // 1ms window
    limiter.record();
    const start = Date.now();
    while (Date.now() - start < 5) {} // busy wait
    expect(limiter.canProceed()).toBe(true);
  });

  it('max=1时仅允许一次', () => {
    const limiter = new RateLimiter(60000, 1);
    expect(limiter.record()).toBe(true);
    expect(limiter.record()).toBe(false);
  });
});

// 状态转换机
type LoadingState = 'idle' | 'loading' | 'success' | 'error';

function getNextLoadingState(current: LoadingState, action: 'start' | 'success' | 'error' | 'retry'): LoadingState {
  const transitions: Record<LoadingState, Record<string, LoadingState>> = {
    idle: { start: 'loading' },
    loading: { success: 'success', error: 'error' },
    success: { start: 'loading' },
    error: { retry: 'loading', start: 'loading' }
  };
  
  return transitions[current]?.[action] ?? current;
}

describe('加载状态机', () => {
  it('idle → loading', () => {
    expect(getNextLoadingState('idle', 'start')).toBe('loading');
  });

  it('loading → success', () => {
    expect(getNextLoadingState('loading', 'success')).toBe('success');
  });

  it('loading → error', () => {
    expect(getNextLoadingState('loading', 'error')).toBe('error');
  });

  it('error → loading (retry)', () => {
    expect(getNextLoadingState('error', 'retry')).toBe('loading');
  });

  it('success → loading', () => {
    expect(getNextLoadingState('success', 'start')).toBe('loading');
  });

  it('无效转换保持当前状态', () => {
    expect(getNextLoadingState('idle', 'success')).toBe('idle');
    expect(getNextLoadingState('success', 'error')).toBe('success');
  });

  it('完整生命周期', () => {
    let state: LoadingState = 'idle';
    state = getNextLoadingState(state, 'start');
    expect(state).toBe('loading');
    state = getNextLoadingState(state, 'success');
    expect(state).toBe('success');
    state = getNextLoadingState(state, 'start');
    expect(state).toBe('loading');
    state = getNextLoadingState(state, 'error');
    expect(state).toBe('error');
    state = getNextLoadingState(state, 'retry');
    expect(state).toBe('loading');
  });
});
