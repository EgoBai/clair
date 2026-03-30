import { describe, it, expect } from 'vitest';

// ===== 搜索评分与排序系统测试 =====
describe('Search Scoring & Ranking System', () => {
  interface SearchResult {
    code: string;
    name: string;
    matchType: 'exact_code' | 'prefix_code' | 'exact_name' | 'prefix_name' | 'contains' | 'pinyin' | 'fuzzy';
    score: number;
  }

  const scoreResult = (result: SearchResult): number => {
    const typeScores: Record<string, number> = {
      exact_code: 100,
      prefix_code: 80,
      exact_name: 70,
      prefix_name: 60,
      contains: 40,
      pinyin: 30,
      fuzzy: 10,
    };
    return typeScores[result.matchType] || 0;
  };

  const rankResults = (results: SearchResult[]): SearchResult[] => {
    return [...results]
      .map(r => ({ ...r, score: scoreResult(r) }))
      .sort((a, b) => b.score - a.score);
  };

  const deduplicate = (results: SearchResult[]): SearchResult[] => {
    const seen = new Set<string>();
    return results.filter(r => {
      if (seen.has(r.code)) return false;
      seen.add(r.code);
      return true;
    });
  };

  const sampleResults: SearchResult[] = [
    { code: '600519', name: '贵州茅台', matchType: 'exact_code', score: 0 },
    { code: '600519', name: '贵州茅台', matchType: 'prefix_name', score: 0 },
    { code: '000858', name: '五粮液', matchType: 'contains', score: 0 },
    { code: '600887', name: '伊利股份', matchType: 'pinyin', score: 0 },
    { code: '601318', name: '中国平安', matchType: 'fuzzy', score: 0 },
  ];

  it('精确代码匹配应得最高分', () => {
    const ranked = rankResults(sampleResults);
    expect(ranked[0].matchType).toBe('exact_code');
  });

  it('前缀匹配得分应高于包含匹配', () => {
    const prefix: SearchResult = { code: 'x', name: 'x', matchType: 'prefix_code', score: 0 };
    const contains: SearchResult = { code: 'y', name: 'y', matchType: 'contains', score: 0 };
    expect(scoreResult(prefix)).toBeGreaterThan(scoreResult(contains));
  });

  it('拼音匹配得分应高于模糊匹配', () => {
    const pinyin: SearchResult = { code: 'x', name: 'x', matchType: 'pinyin', score: 0 };
    const fuzzy: SearchResult = { code: 'y', name: 'y', matchType: 'fuzzy', score: 0 };
    expect(scoreResult(pinyin)).toBeGreaterThan(scoreResult(fuzzy));
  });

  it('应去重同代码结果', () => {
    const deduped = deduplicate(sampleResults);
    const codes = deduped.map(r => r.code);
    expect(new Set(codes).size).toBe(codes.length);
  });

  it('去重后应保留最高分', () => {
    const deduped = deduplicate(rankResults(sampleResults));
    const maotai = deduped.find(r => r.code === '600519');
    expect(maotai?.matchType).toBe('exact_code');
  });

  it('排序结果应降序', () => {
    const ranked = rankResults(sampleResults);
    for (let i = 1; i < ranked.length; i++) {
      expect(ranked[i].score).toBeLessThanOrEqual(ranked[i - 1].score);
    }
  });

  it('空结果应返回空', () => {
    expect(rankResults([])).toEqual([]);
    expect(deduplicate([])).toEqual([]);
  });

  it('全同代码去重只留一个', () => {
    const allSame = [
      { code: '1', name: 'A', matchType: 'exact_code' as const, score: 0 },
      { code: '1', name: 'A', matchType: 'fuzzy' as const, score: 0 },
    ];
    expect(deduplicate(allSame).length).toBe(1);
  });
});

// ===== 配置管理测试 =====
describe('Configuration Management', () => {
  const defaultConfig = {
    database: { host: 'localhost', port: 5432, name: 'stock_db', pool: { min: 2, max: 10 } },
    server: { port: 3001, cors: { origins: ['http://localhost:5173'] } },
    cache: { ttl: 30, maxSize: 1000 },
    sync: { interval: 60, retryCount: 3 },
  };

  const deepMerge = (target: any, source: any): any => {
    const result = { ...target };
    for (const key of Object.keys(source)) {
      if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
        result[key] = deepMerge(target[key] || {}, source[key]);
      } else {
        result[key] = source[key];
      }
    }
    return result;
  };

  const validateConfig = (config: any): string[] => {
    const errors: string[] = [];
    if (!config.database?.host) errors.push('database.host required');
    if (!config.database?.port || config.database.port < 1 || config.database.port > 65535) errors.push('invalid database.port');
    if (!config.server?.port || config.server.port < 1) errors.push('invalid server.port');
    if (config.cache?.ttl !== undefined && config.cache.ttl < 0) errors.push('cache.ttl must be >= 0');
    if (config.sync?.interval !== undefined && config.sync.interval < 1) errors.push('sync.interval must be >= 1');
    return errors;
  };

  it('默认配置应有效', () => {
    expect(validateConfig(defaultConfig)).toEqual([]);
  });

  it('缺失必需字段应报错', () => {
    const errors = validateConfig({});
    expect(errors.length).toBeGreaterThan(0);
    expect(errors).toContain('database.host required');
  });

  it('端口范围应校验', () => {
    const errors = validateConfig({ ...defaultConfig, database: { ...defaultConfig.database, port: 70000 } });
    expect(errors).toContain('invalid database.port');
  });

  it('深层合并应保留嵌套值', () => {
    const override = { database: { port: 3306 } };
    const merged = deepMerge(defaultConfig, override);
    expect(merged.database.port).toBe(3306);
    expect(merged.database.host).toBe('localhost');
  });

  it('深层合并不覆盖无关字段', () => {
    const override = { server: { port: 8080 } };
    const merged = deepMerge(defaultConfig, override);
    expect(merged.server.port).toBe(8080);
    expect(merged.server.cors.origins).toEqual(['http://localhost:5173']);
  });

  it('负TTL应报错', () => {
    const errors = validateConfig({ ...defaultConfig, cache: { ttl: -1 } });
    expect(errors).toContain('cache.ttl must be >= 0');
  });

  it('同步间隔应>=1', () => {
    const errors = validateConfig({ ...defaultConfig, sync: { interval: 0 } });
    expect(errors).toContain('sync.interval must be >= 1');
  });

  it('空合并应返回原对象', () => {
    expect(deepMerge(defaultConfig, {})).toEqual(defaultConfig);
  });

  it('新增嵌套字段', () => {
    const override = { newSection: { key: 'value' } };
    const merged = deepMerge(defaultConfig, override);
    expect((merged as any).newSection.key).toBe('value');
  });
});

// ===== 数据聚合管道测试 =====
describe('Data Aggregation Pipeline', () => {
  interface Tick {
    timestamp: number;
    price: number;
    volume: number;
  }

  const aggregateByInterval = (ticks: Tick[], intervalMs: number): { time: number; open: number; high: number; low: number; close: number; volume: number }[] => {
    if (ticks.length === 0) return [];
    const buckets = new Map<number, Tick[]>();
    for (const tick of ticks) {
      const bucketKey = Math.floor(tick.timestamp / intervalMs) * intervalMs;
      if (!buckets.has(bucketKey)) buckets.set(bucketKey, []);
      buckets.get(bucketKey)!.push(tick);
    }
    return Array.from(buckets.entries())
      .sort(([a], [b]) => a - b)
      .map(([time, ticks]) => ({
        time,
        open: ticks[0].price,
        high: Math.max(...ticks.map(t => t.price)),
        low: Math.min(...ticks.map(t => t.price)),
        close: ticks[ticks.length - 1].price,
        volume: ticks.reduce((s, t) => s + t.volume, 0),
      }));
  };

  const calcVWAP = (ticks: Tick[]): number => {
    let cumTPV = 0, cumVol = 0;
    for (const t of ticks) {
      cumTPV += t.price * t.volume;
      cumVol += t.volume;
    }
    return cumVol > 0 ? cumTPV / cumVol : 0;
  };

  const detectAnomalies = (ticks: Tick[], zThreshold: number = 3): number[] => {
    if (ticks.length < 3) return [];
    const prices = ticks.map(t => t.price);
    const mean = prices.reduce((a, b) => a + b, 0) / prices.length;
    const std = Math.sqrt(prices.reduce((s, p) => s + (p - mean) ** 2, 0) / prices.length);
    if (std === 0) return [];
    return ticks.filter(t => Math.abs(t.price - mean) / std > zThreshold).map(t => t.timestamp);
  };

  const sampleTicks: Tick[] = [
    { timestamp: 1000, price: 10, volume: 100 },
    { timestamp: 2000, price: 10.1, volume: 200 },
    { timestamp: 3000, price: 10.2, volume: 150 },
    { timestamp: 4000, price: 10.1, volume: 300 },
    { timestamp: 5000, price: 10.3, volume: 250 },
  ];

  it('按秒聚合', () => {
    const bars = aggregateByInterval(sampleTicks, 1000);
    expect(bars.length).toBe(5);
    expect(bars[0].open).toBe(10);
    expect(bars[4].close).toBe(10.3);
  });

  it('按2秒聚合', () => {
    const bars = aggregateByInterval(sampleTicks, 2000);
    expect(bars.length).toBe(3);
    expect(bars[0].volume).toBe(100);
  });

  it('空Tick应返回空', () => {
    expect(aggregateByInterval([], 1000)).toEqual([]);
  });

  it('VWAP应正确', () => {
    const vwap = calcVWAP(sampleTicks);
    expect(vwap).toBeGreaterThan(10);
    expect(vwap).toBeLessThan(10.3);
  });

  it('空Tick VWAP应为0', () => {
    expect(calcVWAP([])).toBe(0);
  });

  it('等量VWAP等于均价', () => {
    const ticks: Tick[] = [
      { timestamp: 1, price: 10, volume: 100 },
      { timestamp: 2, price: 20, volume: 100 },
    ];
    expect(calcVWAP(ticks)).toBeCloseTo(15);
  });

  it('正常数据不应检测为异常', () => {
    expect(detectAnomalies(sampleTicks, 3)).toEqual([]);
  });

  it('异常价格应检测到', () => {
    const ticks = [...sampleTicks, { timestamp: 6000, price: 100, volume: 1000 }];
    expect(detectAnomalies(ticks, 2).length).toBeGreaterThan(0);
  });

  it('不足3条不应检测异常', () => {
    expect(detectAnomalies([sampleTicks[0]])).toEqual([]);
  });

  it('全相同价格不应检测为异常', () => {
    const ticks = [
      { timestamp: 1, price: 10, volume: 100 },
      { timestamp: 2, price: 10, volume: 100 },
      { timestamp: 3, price: 10, volume: 100 },
    ];
    expect(detectAnomalies(ticks)).toEqual([]);
  });

  it('聚合open/close正确', () => {
    const bars = aggregateByInterval(sampleTicks, 6000);
    expect(bars.length).toBe(1);
    expect(bars[0].open).toBe(10);
    expect(bars[0].close).toBe(10.3);
    expect(bars[0].high).toBe(10.3);
    expect(bars[0].low).toBe(10);
    expect(bars[0].volume).toBe(1000);
  });
});
