/**
 * 后端 API 缓存策略测试
 * 覆盖缓存键生成、TTL策略、失效策略
 */

import { describe, it, expect } from 'vitest';

describe('API 缓存策略', () => {
  describe('缓存键生成', () => {
    function generateCacheKey(prefix: string, params: Record<string, unknown>): string {
      const sorted = Object.keys(params).sort().map(k => `${k}=${params[k]}`).join('&');
      return `${prefix}:${sorted}`;
    }

    it('应生成一致的缓存键', () => {
      const key1 = generateCacheKey('stock', { symbol: '600519', period: '1d' });
      const key2 = generateCacheKey('stock', { period: '1d', symbol: '600519' });
      expect(key1).toBe(key2);
    });

    it('不同参数应生成不同键', () => {
      const key1 = generateCacheKey('stock', { symbol: '600519' });
      const key2 = generateCacheKey('stock', { symbol: '000858' });
      expect(key1).not.toBe(key2);
    });

    it('不同前缀应生成不同键', () => {
      const key1 = generateCacheKey('quote', { symbol: '600519' });
      const key2 = generateCacheKey('kline', { symbol: '600519' });
      expect(key1).not.toBe(key2);
    });
  });

  describe('TTL 策略', () => {
    function getCacheTTL(dataType: string, isMarketOpen: boolean): number {
      const ttls: Record<string, { open: number; closed: number }> = {
        realtime_quote: { open: 5, closed: 60 },
        kline_daily: { open: 300, closed: 3600 },
        kline_minute: { open: 10, closed: 300 },
        fundamental: { open: 3600, closed: 86400 },
        sector_flow: { open: 30, closed: 300 },
      };
      const config = ttls[dataType] || { open: 60, closed: 600 };
      return isMarketOpen ? config.open : config.closed;
    }

    it('盘中实时行情TTL应较短', () => {
      expect(getCacheTTL('realtime_quote', true)).toBe(5);
    });

    it('盘后实时行情TTL应较长', () => {
      expect(getCacheTTL('realtime_quote', false)).toBe(60);
    });

    it('基本面数据TTL应较长', () => {
      expect(getCacheTTL('fundamental', true)).toBe(3600);
    });

    it('未知类型应有默认TTL', () => {
      expect(getCacheTTL('unknown', true)).toBe(60);
    });
  });

  describe('缓存失效策略', () => {
    interface CacheEntry<T> {
      data: T;
      timestamp: number;
      ttl: number;
    }

    function isExpired(entry: CacheEntry<unknown>, now: number): boolean {
      return now - entry.timestamp > entry.ttl * 1000;
    }

    function shouldRefresh(entry: CacheEntry<unknown>, now: number, staleWhileRevalidate: number = 0): boolean {
      const age = now - entry.timestamp;
      return age > (entry.ttl + staleWhileRevalidate) * 1000;
    }

    it('过期条目应标记为过期', () => {
      const entry: CacheEntry<string> = { data: 'test', timestamp: 1000, ttl: 60 };
      expect(isExpired(entry, 62000)).toBe(true);
      expect(isExpired(entry, 60000)).toBe(false);
    });

    it('stale-while-revalidate应延迟失效', () => {
      const entry: CacheEntry<string> = { data: 'test', timestamp: 1000, ttl: 60 };
      expect(shouldRefresh(entry, 61000, 30)).toBe(false);
      expect(shouldRefresh(entry, 92000, 30)).toBe(true);
    });
  });

  describe('多级缓存降级', () => {
    type CacheLevel = 'L1_MEMORY' | 'L2_REDIS' | 'L3_DB';

    function getCacheLevelOrder(): CacheLevel[] {
      return ['L1_MEMORY', 'L2_REDIS', 'L3_DB'];
    }

    function shouldFallback(currentLevel: CacheLevel, error: boolean): CacheLevel | null {
      const order = getCacheLevelOrder();
      const idx = order.indexOf(currentLevel);
      if (error && idx < order.length - 1) return order[idx + 1];
      return null;
    }

    it('应按L1→L2→L3顺序降级', () => {
      const order = getCacheLevelOrder();
      expect(order[0]).toBe('L1_MEMORY');
      expect(order[2]).toBe('L3_DB');
    });

    it('L1失败应降级到L2', () => {
      expect(shouldFallback('L1_MEMORY', true)).toBe('L2_REDIS');
    });

    it('L3失败无法再降级', () => {
      expect(shouldFallback('L3_DB', true)).toBeNull();
    });

    it('无错误不应降级', () => {
      expect(shouldFallback('L1_MEMORY', false)).toBeNull();
    });
  });

  describe('缓存预热', () => {
    interface WarmupTask {
      key: string;
      priority: number;
      dataType: string;
    }

    function prioritizeWarmup(tasks: WarmupTask[]): WarmupTask[] {
      return [...tasks].sort((a, b) => b.priority - a.priority);
    }

    function buildWarmupPlan(dataTypes: string[]): WarmupTask[] {
      const priorities: Record<string, number> = {
        realtime_quote: 100,
        sector_flow: 80,
        kline_daily: 60,
        fundamental: 40,
      };
      return dataTypes.map(dt => ({
        key: `warmup:${dt}`,
        priority: priorities[dt] || 10,
        dataType: dt,
      }));
    }

    it('实时行情应有最高优先级', () => {
      const tasks = buildWarmupPlan(['fundamental', 'realtime_quote', 'kline_daily']);
      const sorted = prioritizeWarmup(tasks);
      expect(sorted[0].dataType).toBe('realtime_quote');
      expect(sorted[2].dataType).toBe('fundamental');
    });
  });
});
