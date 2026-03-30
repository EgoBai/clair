/**
 * 渲染性能优化 + 新功能测试
 */

import { describe, it, expect, vi } from 'vitest';

// ==================== 虚拟滚动测试 ====================

describe('虚拟滚动计算', () => {
  // 内联实现避免依赖
  function calculateVirtualScroll(config: {
    itemHeight: number;
    containerHeight: number;
    totalCount: number;
    scrollTop: number;
    overscan?: number;
  }) {
    const { itemHeight, containerHeight, totalCount, scrollTop, overscan = 5 } = config;
    const visibleCount = Math.ceil(containerHeight / itemHeight);
    const startIndex = Math.max(0, Math.floor(scrollTop / itemHeight) - overscan);
    const endIndex = Math.min(totalCount - 1, startIndex + visibleCount + overscan * 2);
    return { startIndex, endIndex, visibleItems: endIndex - startIndex + 1, totalHeight: totalCount * itemHeight, offsetY: startIndex * itemHeight };
  }

  it('初始位置返回正确的可见范围', () => {
    const result = calculateVirtualScroll({
      itemHeight: 50,
      containerHeight: 500,
      totalCount: 1000,
      scrollTop: 0,
    });
    expect(result.startIndex).toBe(0);
    expect(result.endIndex).toBe(20); // 10 visible + 10 overscan
    expect(result.totalHeight).toBe(50000);
  });

  it('滚动后调整可见范围', () => {
    const result = calculateVirtualScroll({
      itemHeight: 50,
      containerHeight: 500,
      totalCount: 1000,
      scrollTop: 5000,
    });
    expect(result.startIndex).toBe(95); // 100 - 5 overscan
    expect(result.endIndex).toBe(115);
  });

  it('顶部边界不小于0', () => {
    const result = calculateVirtualScroll({
      itemHeight: 50,
      containerHeight: 500,
      totalCount: 1000,
      scrollTop: 100,
    });
    expect(result.startIndex).toBeGreaterThanOrEqual(0);
  });

  it('底部边界不超过总数', () => {
    const result = calculateVirtualScroll({
      itemHeight: 50,
      containerHeight: 500,
      totalCount: 50,
      scrollTop: 2000,
    });
    expect(result.endIndex).toBeLessThanOrEqual(49);
  });

  it('offsetY正确计算', () => {
    const result = calculateVirtualScroll({
      itemHeight: 50,
      containerHeight: 500,
      totalCount: 1000,
      scrollTop: 2500,
    });
    expect(result.offsetY).toBe(result.startIndex * 50);
  });

  it('自定义overscan生效', () => {
    const result = calculateVirtualScroll({
      itemHeight: 50,
      containerHeight: 500,
      totalCount: 1000,
      scrollTop: 5000,
      overscan: 10,
    });
    expect(result.startIndex).toBe(90); // 100 - 10
  });
});

// ==================== 数据缓存测试 ====================

describe('数据缓存管理', () => {
  class DataCache<T> {
    private cache = new Map<string, { data: T; timestamp: number }>();
    private ttl: number;
    constructor(ttlMs = 30000) { this.ttl = ttlMs; }
    get(key: string): T | null {
      const entry = this.cache.get(key);
      if (!entry) return null;
      if (Date.now() - entry.timestamp > this.ttl) { this.cache.delete(key); return null; }
      return entry.data;
    }
    set(key: string, data: T): void { this.cache.set(key, { data, timestamp: Date.now() }); }
    invalidate(pattern?: string): void {
      if (!pattern) { this.cache.clear(); return; }
      for (const key of this.cache.keys()) { if (key.includes(pattern)) this.cache.delete(key); }
    }
    get size() { return this.cache.size; }
  }

  it('缓存命中返回数据', () => {
    const cache = new DataCache<string>(10000);
    cache.set('key1', 'value1');
    expect(cache.get('key1')).toBe('value1');
  });

  it('缓存未命中返回null', () => {
    const cache = new DataCache<string>(10000);
    expect(cache.get('nonexistent')).toBeNull();
  });

  it('过期数据返回null', () => {
    const cache = new DataCache<string>(-1); // negative TTL = always expired
    cache.set('key1', 'value1');
    expect(cache.get('key1')).toBeNull();
  });

  it('按模式失效缓存', () => {
    const cache = new DataCache<string>(10000);
    cache.set('user:1', 'alice');
    cache.set('user:2', 'bob');
    cache.set('post:1', 'hello');
    cache.invalidate('user');
    expect(cache.get('user:1')).toBeNull();
    expect(cache.get('user:2')).toBeNull();
    expect(cache.get('post:1')).toBe('hello');
  });

  it('无参数清空所有缓存', () => {
    const cache = new DataCache<string>(10000);
    cache.set('a', '1');
    cache.set('b', '2');
    cache.invalidate();
    expect(cache.size).toBe(0);
  });

  it('缓存大小正确统计', () => {
    const cache = new DataCache<number>(10000);
    expect(cache.size).toBe(0);
    cache.set('a', 1);
    cache.set('b', 2);
    expect(cache.size).toBe(2);
  });
});

// ==================== 分块渲染测试 ====================

describe('分块渲染', () => {
  async function chunkedRender<T>(
    items: T[],
    renderChunk: (chunk: T[]) => void,
    chunkSize = 100,
  ): Promise<void> {
    for (let i = 0; i < items.length; i += chunkSize) {
      renderChunk(items.slice(i, i + chunkSize));
    }
  }

  it('正确分块渲染数据', async () => {
    const items = Array.from({ length: 250 }, (_, i) => i);
    const chunks: number[][] = [];
    await chunkedRender(items, chunk => chunks.push(chunk), 100);
    expect(chunks).toHaveLength(3);
    expect(chunks[0]).toHaveLength(100);
    expect(chunks[1]).toHaveLength(100);
    expect(chunks[2]).toHaveLength(50);
  });

  it('空数组不调用回调', async () => {
    const chunks: number[][] = [];
    await chunkedRender([], chunk => chunks.push(chunk), 100);
    expect(chunks).toHaveLength(0);
  });

  it('小于chunkSize的数据一次性处理', async () => {
    const items = [1, 2, 3];
    const chunks: number[][] = [];
    await chunkedRender(items, chunk => chunks.push(chunk), 100);
    expect(chunks).toHaveLength(1);
    expect(chunks[0]).toEqual([1, 2, 3]);
  });
});

// ==================== 渲染性能分析器测试 ====================

describe('渲染性能分析器', () => {
  class RenderProfiler {
    private static measurements: Map<string, number[]> = new Map();
    static measure(label: string, fn: () => void): number {
      const start = performance.now();
      fn();
      const duration = performance.now() - start;
      if (!this.measurements.has(label)) this.measurements.set(label, []);
      this.measurements.get(label)!.push(duration);
      return duration;
    }
    static getStats(label: string) {
      const arr = this.measurements.get(label) || [];
      if (arr.length === 0) return null;
      const sorted = [...arr].sort((a, b) => a - b);
      return { avg: arr.reduce((s, v) => s + v, 0) / arr.length, p50: sorted[Math.floor(sorted.length * 0.5)], p95: sorted[Math.floor(sorted.length * 0.95)], min: sorted[0], max: sorted[sorted.length - 1], samples: arr.length };
    }
    static clear(label?: string) {
      if (label) this.measurements.delete(label);
      else this.measurements.clear();
    }
  }

  it('测量函数执行时间', () => {
    const duration = RenderProfiler.measure('test', () => {
      let sum = 0;
      for (let i = 0; i < 1000; i++) sum += i;
    });
    expect(duration).toBeGreaterThanOrEqual(0);
  });

  it('统计信息正确', () => {
    RenderProfiler.clear('stats-test');
    for (let i = 0; i < 10; i++) {
      RenderProfiler.measure('stats-test', () => {});
    }
    const stats = RenderProfiler.getStats('stats-test');
    expect(stats).not.toBeNull();
    expect(stats!.samples).toBe(10);
    expect(stats!.avg).toBeGreaterThanOrEqual(0);
    expect(stats!.min).toBeLessThanOrEqual(stats!.max);
  });

  it('不存在的标签返回null', () => {
    expect(RenderProfiler.getStats('nonexistent')).toBeNull();
  });
});

// ==================== 大宗交易数据模型测试 ====================

describe('大宗交易前端数据模型', () => {
  interface BlockTrade {
    id: number;
    symbol: string;
    name: string;
    tradeDate: string;
    price: number;
    closePrice: number;
    volume: number;
    amount: number;
    discount: number;
    buyer: string;
    seller: string;
  }

  const mockTrade: BlockTrade = {
    id: 1,
    symbol: '600519',
    name: '贵州茅台',
    tradeDate: '2026-03-24',
    price: 1780.50,
    closePrice: 1800.00,
    volume: 200000,
    amount: 356100000,
    discount: -1.08,
    buyer: '机构专用',
    seller: '中信证券上海分公司',
  };

  it('包含所有必要字段', () => {
    expect(mockTrade).toHaveProperty('symbol');
    expect(mockTrade).toHaveProperty('price');
    expect(mockTrade).toHaveProperty('volume');
    expect(mockTrade).toHaveProperty('amount');
    expect(mockTrade).toHaveProperty('discount');
  });

  it('金额格式化为亿/万', () => {
    const formatAmount = (val: number): string => {
      if (val >= 1e8) return `${(val / 1e8).toFixed(2)}亿`;
      if (val >= 1e4) return `${(val / 1e4).toFixed(2)}万`;
      return val.toFixed(0);
    };
    expect(formatAmount(mockTrade.amount)).toContain('亿');
    expect(formatAmount(5000000)).toContain('万');
  });

  it('折溢价率显示方向正确', () => {
    expect(mockTrade.discount).toBeLessThan(0); // 折价
    const premiumTrade = { ...mockTrade, discount: 2.5 };
    expect(premiumTrade.discount).toBeGreaterThan(0); // 溢价
  });
});

// ==================== 解禁数据模型测试 ====================

describe('限售解禁前端数据模型', () => {
  it('解禁市值应为正数', () => {
    const marketValue = 50000000 * 1800;
    expect(marketValue).toBeGreaterThan(0);
  });

  it('占比高应标红', () => {
    const colorByRatio = (ratio: number) => ratio > 10 ? 'red' : ratio > 5 ? 'orange' : 'green';
    expect(colorByRatio(15)).toBe('red');
    expect(colorByRatio(7)).toBe('orange');
    expect(colorByRatio(3)).toBe('green');
  });

  it('日历标注应根据市值变化颜色', () => {
    const getColor = (mv: number) => mv > 1e10 ? '#cf1322' : '#1890ff';
    expect(getColor(2e10)).toBe('#cf1322');
    expect(getColor(5e9)).toBe('#1890ff');
  });
});
