import { describe, it, expect } from 'vitest';

// ==================== 回测数据管理器 ====================

interface DataSlice {
  symbol: string;
  startDate: string;
  endDate: string;
  bars: { date: string; open: number; high: number; low: number; close: number; volume: number }[];
  indicators: Map<string, number[]>;
}

interface DataRequest {
  symbol: string;
  startDate: string;
  endDate: string;
  indicators?: string[];
  adjusted?: boolean;
}

interface CacheEntry {
  key: string;
  data: DataSlice;
  createdAt: number;
  expiresAt: number;
  hitCount: number;
  size: number;
}

class DataManager {
  private cache: Map<string, CacheEntry> = new Map();
  private maxCacheSize: number;
  private defaultTTL: number;
  private dataSource: Map<string, DataSlice> = new Map();
  private fetchCount = 0;

  constructor(maxCacheSize: number = 100, defaultTTL: number = 300000) {
    this.maxCacheSize = maxCacheSize;
    this.defaultTTL = defaultTTL;
  }

  /** 注册数据源 */
  registerData(data: DataSlice): void {
    const key = `${data.symbol}:${data.startDate}:${data.endDate}`;
    this.dataSource.set(key, data);
  }

  /** 获取数据 */
  async fetchData(request: DataRequest): Promise<DataSlice> {
    const cacheKey = this.buildCacheKey(request);

    // 检查缓存
    const cached = this.cache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      cached.hitCount++;
      return { ...cached.data };
    }

    // 从数据源获取
    this.fetchCount++;
    const data = await this.fetchFromSource(request);

    // 计算指标
    if (request.indicators && request.indicators.length > 0) {
      data.indicators = this.calculateIndicators(data.bars, request.indicators);
    }

    // 写入缓存
    this.setCache(cacheKey, data);

    return { ...data };
  }

  /** 批量获取 */
  async fetchBatch(requests: DataRequest[]): Promise<DataSlice[]> {
    const results: DataSlice[] = [];
    for (const req of requests) {
      results.push(await this.fetchData(req));
    }
    return results;
  }

  /** 预加载 */
  async prefetch(requests: DataRequest[]): Promise<void> {
    const uncached = requests.filter(r => {
      const key = this.buildCacheKey(r);
      const entry = this.cache.get(key);
      return !entry || entry.expiresAt <= Date.now();
    });

    // 并行预加载
    await Promise.all(uncached.map(r => this.fetchData(r)));
  }

  /** 分割数据为训练/测试集 */
  splitData(data: DataSlice, trainRatio: number = 0.7): { train: DataSlice; test: DataSlice } {
    const splitIdx = Math.floor(data.bars.length * trainRatio);
    return {
      train: { ...data, bars: data.bars.slice(0, splitIdx), endDate: data.bars[splitIdx - 1]?.date || data.endDate },
      test: { ...data, bars: data.bars.slice(splitIdx), startDate: data.bars[splitIdx]?.date || data.startDate },
    };
  }

  /** 滑动窗口 */
  createSlidingWindows(data: DataSlice, windowSize: number, stepSize: number = 1): DataSlice[] {
    const windows: DataSlice[] = [];
    for (let i = 0; i + windowSize <= data.bars.length; i += stepSize) {
      const bars = data.bars.slice(i, i + windowSize);
      windows.push({
        ...data,
        bars,
        startDate: bars[0].date,
        endDate: bars[bars.length - 1].date,
      });
    }
    return windows;
  }

  /** 数据对齐 (多标的日期对齐) */
  alignData(slices: DataSlice[]): { date: string; values: Record<string, number> }[] {
    const dateSet = new Set<string>();
    for (const slice of slices) {
      for (const bar of slice.bars) dateSet.add(bar.date);
    }

    const dates = Array.from(dateSet).sort();
    const aligned: { date: string; values: Record<string, number> }[] = [];

    for (const date of dates) {
      const values: Record<string, number> = {};
      let complete = true;
      for (const slice of slices) {
        const bar = slice.bars.find(b => b.date === date);
        if (!bar) { complete = false; break; }
        values[slice.symbol] = bar.close;
      }
      if (complete) aligned.push({ date, values });
    }

    return aligned;
  }

  /** 数据重采样 */
  resample(data: DataSlice, frequency: 'weekly' | 'monthly'): DataSlice {
    const groups = new Map<string, typeof data.bars>();

    for (const bar of data.bars) {
      let key: string;
      if (frequency === 'weekly') {
        const d = new Date(bar.date);
        const weekStart = new Date(d);
        weekStart.setDate(d.getDate() - d.getDay());
        key = weekStart.toISOString().split('T')[0];
      } else {
        key = bar.date.substring(0, 7);
      }
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(bar);
    }

    const bars = Array.from(groups.entries()).map(([_, weekBars]) => ({
      date: weekBars[weekBars.length - 1].date,
      open: weekBars[0].open,
      high: Math.max(...weekBars.map(b => b.high)),
      low: Math.min(...weekBars.map(b => b.low)),
      close: weekBars[weekBars.length - 1].close,
      volume: weekBars.reduce((s, b) => s + b.volume, 0),
    }));

    return { ...data, bars };
  }

  /** 缓存管理 */
  getCacheStats(): { size: number; hitRate: number; totalHits: number; memoryEstimate: number } {
    const entries = Array.from(this.cache.values());
    const totalHits = entries.reduce((s, e) => s + e.hitCount, 0);
    const totalRequests = totalHits + this.fetchCount;
    return {
      size: this.cache.size,
      hitRate: totalRequests > 0 ? Math.round((totalHits / totalRequests) * 10000) / 100 : 0,
      totalHits,
      memoryEstimate: entries.reduce((s, e) => s + e.size, 0),
    };
  }

  clearCache(): void { this.cache.clear(); }

  evictExpired(): number {
    const now = Date.now();
    let evicted = 0;
    for (const [key, entry] of this.cache) {
      if (entry.expiresAt <= now) { this.cache.delete(key); evicted++; }
    }
    return evicted;
  }

  /** 数据完整性校验 */
  validateData(data: DataSlice): { valid: boolean; errors: string[]; warnings: string[] } {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (data.bars.length === 0) {
      errors.push('数据为空');
      return { valid: false, errors, warnings };
    }

    for (let i = 0; i < data.bars.length; i++) {
      const bar = data.bars[i];
      if (bar.high < bar.low) errors.push(`${bar.date}: 最高价小于最低价`);
      if (bar.close > bar.high || bar.close < bar.low) errors.push(`${bar.date}: 收盘价超出范围`);
      if (bar.volume < 0) errors.push(`${bar.date}: 成交量为负`);
      if (i > 0 && bar.date <= data.bars[i - 1].date) warnings.push(`${bar.date}: 日期非递增`);
    }

    // 检查缺失日期
    if (data.bars.length > 1) {
      const gaps = this.findDateGaps(data.bars.map(b => b.date));
      if (gaps.length > 5) warnings.push(`存在${gaps.length}个日期间隔`);
    }

    return { valid: errors.length === 0, errors, warnings };
  }

  // ==================== 私有方法 ====================

  private buildCacheKey(request: DataRequest): string {
    return `${request.symbol}:${request.startDate}:${request.endDate}:${request.indicators?.join(',') || ''}:${request.adjusted || false}`;
  }

  private async fetchFromSource(request: DataRequest): Promise<DataSlice> {
    // 模拟从数据源获取
    const key = `${request.symbol}:${request.startDate}:${request.endDate}`;
    const source = this.dataSource.get(key);
    if (source) return { ...source, indicators: new Map() };

    // 生成模拟数据
    const bars = this.generateBars(request.startDate, request.endDate);
    return { symbol: request.symbol, startDate: request.startDate, endDate: request.endDate, bars, indicators: new Map() };
  }

  private setCache(key: string, data: DataSlice): void {
    // LRU淘汰
    if (this.cache.size >= this.maxCacheSize) {
      let oldest = '';
      let oldestTime = Infinity;
      for (const [k, v] of this.cache) {
        if (v.createdAt < oldestTime) { oldestTime = v.createdAt; oldest = k; }
      }
      if (oldest) this.cache.delete(oldest);
    }

    this.cache.set(key, {
      key, data: { ...data },
      createdAt: Date.now(),
      expiresAt: Date.now() + this.defaultTTL,
      hitCount: 0,
      size: JSON.stringify(data.bars).length,
    });
  }

  private calculateIndicators(bars: { close: number }[], indicators: string[]): Map<string, number[]> {
    const result = new Map<string, number[]>();
    const closes = bars.map(b => b.close);

    for (const ind of indicators) {
      if (ind.startsWith('ma')) {
        const period = parseInt(ind.replace('ma', ''));
        result.set(ind, this.calcMA(closes, period));
      } else if (ind === 'rsi') {
        result.set('rsi', this.calcRSI(closes, 14));
      }
    }
    return result;
  }

  private calcMA(data: number[], period: number): number[] {
    const result: number[] = [];
    for (let i = 0; i < data.length; i++) {
      if (i < period - 1) { result.push(NaN); continue; }
      result.push(Math.round(data.slice(i - period + 1, i + 1).reduce((s, v) => s + v, 0) / period * 100) / 100);
    }
    return result;
  }

  private calcRSI(data: number[], period: number): number[] {
    const result: number[] = Array(period).fill(NaN);
    for (let i = period; i < data.length; i++) {
      let gain = 0, loss = 0;
      for (let j = i - period + 1; j <= i; j++) {
        const change = data[j] - data[j - 1];
        if (change > 0) gain += change; else loss -= change;
      }
      const avgGain = gain / period, avgLoss = loss / period;
      const rs = avgLoss > 0 ? avgGain / avgLoss : 100;
      result.push(Math.round((100 - 100 / (1 + rs)) * 100) / 100);
    }
    return result;
  }

  private generateBars(startDate: string, endDate: string): any[] {
    const bars = [];
    const start = new Date(startDate);
    const end = new Date(endDate);
    let price = 10 + Math.random() * 5;

    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      if (d.getDay() === 0 || d.getDay() === 6) continue;
      const change = (Math.random() - 0.48) * 0.5;
      price += change;
      bars.push({
        date: d.toISOString().split('T')[0],
        open: Math.round((price - Math.random() * 0.3) * 100) / 100,
        high: Math.round((price + Math.random() * 0.5) * 100) / 100,
        low: Math.round((price - Math.random() * 0.5) * 100) / 100,
        close: Math.round(price * 100) / 100,
        volume: Math.floor(100000 + Math.random() * 500000),
      });
    }
    return bars;
  }

  private findDateGaps(dates: string[]): string[] {
    const gaps: string[] = [];
    for (let i = 1; i < dates.length; i++) {
      const diff = (new Date(dates[i]).getTime() - new Date(dates[i - 1]).getTime()) / 86400000;
      if (diff > 3) gaps.push(`${dates[i - 1]} -> ${dates[i]} (${diff}天)`);
    }
    return gaps;
  }
}

// ==================== 测试 ====================

describe('DataManager 回测数据管理器', () => {
  let dm: DataManager;

  beforeEach(() => {
    dm = new DataManager(10, 60000);
    // 注册测试数据
    const bars = Array.from({ length: 30 }, (_, i) => ({
      date: `2024-01-${String(i + 1).padStart(2, '0')}`,
      open: 10 + Math.random(), high: 11 + Math.random(),
      low: 9 + Math.random(), close: 10 + Math.random(),
      volume: 100000 + Math.floor(Math.random() * 500000),
    }));
    dm.registerData({ symbol: 'TEST', startDate: '2024-01-01', endDate: '2024-01-31', bars, indicators: new Map() });
  });

  describe('数据获取', () => {
    it('应获取注册数据', async () => {
      const data = await dm.fetchData({ symbol: 'TEST', startDate: '2024-01-01', endDate: '2024-01-31' });
      expect(data.bars.length).toBe(30);
      expect(data.symbol).toBe('TEST');
    });

    it('应从缓存获取', async () => {
      await dm.fetchData({ symbol: 'TEST', startDate: '2024-01-01', endDate: '2024-01-31' });
      const stats1 = dm.getCacheStats();
      await dm.fetchData({ symbol: 'TEST', startDate: '2024-01-01', endDate: '2024-01-31' });
      const stats2 = dm.getCacheStats();
      expect(stats2.totalHits).toBeGreaterThan(stats1.totalHits);
    });

    it('未注册数据应生成模拟数据', async () => {
      const data = await dm.fetchData({ symbol: 'UNKNOWN', startDate: '2024-01-01', endDate: '2024-01-10' });
      expect(data.bars.length).toBeGreaterThan(0);
    });
  });

  describe('批量获取', () => {
    it('应批量返回数据', async () => {
      const results = await dm.fetchBatch([
        { symbol: 'TEST', startDate: '2024-01-01', endDate: '2024-01-31' },
        { symbol: 'OTHER', startDate: '2024-01-01', endDate: '2024-01-10' },
      ]);
      expect(results.length).toBe(2);
    });
  });

  describe('预加载', () => {
    it('应预加载数据到缓存', async () => {
      await dm.prefetch([
        { symbol: 'TEST', startDate: '2024-01-01', endDate: '2024-01-31' },
      ]);
      const stats = dm.getCacheStats();
      expect(stats.size).toBeGreaterThan(0);
    });
  });

  describe('数据分割', () => {
    it('应分割为训练/测试集', async () => {
      const data = await dm.fetchData({ symbol: 'TEST', startDate: '2024-01-01', endDate: '2024-01-31' });
      const { train, test } = dm.splitData(data, 0.7);
      expect(train.bars.length + test.bars.length).toBe(data.bars.length);
      expect(train.bars.length).toBeGreaterThan(test.bars.length);
    });

    it('应保持数据连续性', async () => {
      const data = await dm.fetchData({ symbol: 'TEST', startDate: '2024-01-01', endDate: '2024-01-31' });
      const { train, test } = dm.splitData(data, 0.7);
      const lastTrainDate = train.bars[train.bars.length - 1].date;
      const firstTestDate = test.bars[0].date;
      expect(lastTrainDate < firstTestDate).toBe(true);
    });
  });

  describe('滑动窗口', () => {
    it('应生成窗口', async () => {
      const data = await dm.fetchData({ symbol: 'TEST', startDate: '2024-01-01', endDate: '2024-01-31' });
      const windows = dm.createSlidingWindows(data, 10, 5);
      expect(windows.length).toBeGreaterThan(0);
      for (const w of windows) { expect(w.bars.length).toBe(10); }
    });

    it('步长应影响窗口数量', async () => {
      const data = await dm.fetchData({ symbol: 'TEST', startDate: '2024-01-01', endDate: '2024-01-31' });
      const w1 = dm.createSlidingWindows(data, 5, 1);
      const w2 = dm.createSlidingWindows(data, 5, 5);
      expect(w1.length).toBeGreaterThan(w2.length);
    });
  });

  describe('数据对齐', () => {
    it('应对齐多标的日期', () => {
      const s1: DataSlice = { symbol: 'A', startDate: '2024-01-01', endDate: '2024-01-05', bars: [
        { date: '2024-01-01', open: 1, high: 1, low: 1, close: 1, volume: 100 },
        { date: '2024-01-02', open: 2, high: 2, low: 2, close: 2, volume: 100 },
      ], indicators: new Map() };
      const s2: DataSlice = { symbol: 'B', startDate: '2024-01-01', endDate: '2024-01-05', bars: [
        { date: '2024-01-01', open: 10, high: 10, low: 10, close: 10, volume: 100 },
        { date: '2024-01-02', open: 20, high: 20, low: 20, close: 20, volume: 100 },
      ], indicators: new Map() };
      const aligned = dm.alignData([s1, s2]);
      expect(aligned.length).toBe(2);
      expect(aligned[0].values['A']).toBe(1);
      expect(aligned[0].values['B']).toBe(10);
    });
  });

  describe('数据重采样', () => {
    it('应重采样为周线', async () => {
      const data = await dm.fetchData({ symbol: 'TEST', startDate: '2024-01-01', endDate: '2024-01-31' });
      const weekly = dm.resample(data, 'weekly');
      expect(weekly.bars.length).toBeLessThan(data.bars.length);
    });

    it('周线OHLC应正确', () => {
      const bars = [
        { date: '2024-01-01', open: 10, high: 12, low: 9, close: 11, volume: 100 },
        { date: '2024-01-02', open: 11, high: 13, low: 10, close: 12, volume: 200 },
      ];
      const data: DataSlice = { symbol: 'T', startDate: '2024-01-01', endDate: '2024-01-02', bars, indicators: new Map() };
      const weekly = dm.resample(data, 'weekly');
      expect(weekly.bars[0].open).toBe(10);
      expect(weekly.bars[0].high).toBe(13);
      expect(weekly.bars[0].low).toBe(9);
      expect(weekly.bars[0].close).toBe(12);
      expect(weekly.bars[0].volume).toBe(300);
    });
  });

  describe('缓存管理', () => {
    it('应统计缓存', async () => {
      await dm.fetchData({ symbol: 'TEST', startDate: '2024-01-01', endDate: '2024-01-31' });
      const stats = dm.getCacheStats();
      expect(stats.size).toBe(1);
    });

    it('应清空缓存', async () => {
      await dm.fetchData({ symbol: 'TEST', startDate: '2024-01-01', endDate: '2024-01-31' });
      dm.clearCache();
      expect(dm.getCacheStats().size).toBe(0);
    });

    it('应淘汰过期条目', async () => {
      const shortTTL = new DataManager(10, 1);
      shortTTL.registerData({ symbol: 'T', startDate: '2024-01-01', endDate: '2024-01-05', bars: [{ date: '2024-01-01', open: 1, high: 1, low: 1, close: 1, volume: 1 }], indicators: new Map() });
      await shortTTL.fetchData({ symbol: 'T', startDate: '2024-01-01', endDate: '2024-01-05' });
      await new Promise(r => setTimeout(r, 5));
      const evicted = shortTTL.evictExpired();
      expect(evicted).toBeGreaterThan(0);
    });
  });

  describe('数据校验', () => {
    it('有效数据应通过', () => {
      const data: DataSlice = { symbol: 'T', startDate: '2024-01-01', endDate: '2024-01-02', bars: [
        { date: '2024-01-01', open: 10, high: 12, low: 9, close: 11, volume: 100 },
        { date: '2024-01-02', open: 11, high: 13, low: 10, close: 12, volume: 200 },
      ], indicators: new Map() };
      const result = dm.validateData(data);
      expect(result.valid).toBe(true);
      expect(result.errors.length).toBe(0);
    });

    it('空数据应报错', () => {
      const data: DataSlice = { symbol: 'T', startDate: '', endDate: '', bars: [], indicators: new Map() };
      const result = dm.validateData(data);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('数据为空');
    });

    it('高价<低价应报错', () => {
      const data: DataSlice = { symbol: 'T', startDate: '2024-01-01', endDate: '2024-01-01', bars: [
        { date: '2024-01-01', open: 10, high: 8, low: 9, close: 8.5, volume: 100 },
      ], indicators: new Map() };
      const result = dm.validateData(data);
      expect(result.valid).toBe(false);
    });

    it('收盘价超出范围应报错', () => {
      const data: DataSlice = { symbol: 'T', startDate: '2024-01-01', endDate: '2024-01-01', bars: [
        { date: '2024-01-01', open: 10, high: 12, low: 9, close: 15, volume: 100 },
      ], indicators: new Map() };
      const result = dm.validateData(data);
      expect(result.valid).toBe(false);
    });
  });

  describe('技术指标计算', () => {
    it('应计算MA', async () => {
      const data = await dm.fetchData({ symbol: 'TEST', startDate: '2024-01-01', endDate: '2024-01-31', indicators: ['ma5', 'ma20'] });
      expect(data.indicators.has('ma5')).toBe(true);
      expect(data.indicators.get('ma5')!.length).toBe(data.bars.length);
    });

    it('应计算RSI', async () => {
      const data = await dm.fetchData({ symbol: 'TEST', startDate: '2024-01-01', endDate: '2024-01-31', indicators: ['rsi'] });
      expect(data.indicators.has('rsi')).toBe(true);
    });
  });
});
