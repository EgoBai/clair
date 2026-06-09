/**
 * API Cache Middleware
 * API缓存中间件 - HTTP响应缓存
 */

export interface CacheOptions {
  ttl: number; // seconds
  key?: string;
  varyBy?: string[];
  staleWhileRevalidate?: number;
  condition?: (req: unknown) => boolean;
}

interface CacheEntry {
  body: unknown;
  headers: Record<string, string>;
  statusCode: number;
  timestamp: number;
  ttl: number;
  etag: string;
}

export class APICache {
  private cache: Map<string, CacheEntry> = new Map();
  private defaultTTL: number;
  private maxSize: number;
  private stats = {
    hits: 0,
    misses: 0,
    evictions: 0
  };

  constructor(defaultTTL: number = 60, maxSize: number = 1000) {
    this.defaultTTL = defaultTTL;
    this.maxSize = maxSize;
  }

  /**
   * 获取缓存统计信息
   */
  getStats() {
    return {
      ...this.stats,
      size: this.cache.size,
      hitRate: this.stats.hits / (this.stats.hits + this.stats.misses) || 0
    };
  }

  /**
   * 清理过期缓存
   */
  cleanup(): number {
    const now = Date.now();
    let cleaned = 0;
    
    for (const [key, entry] of this.cache.entries()) {
      const age = (now - entry.timestamp) / 1000;
      if (age > entry.ttl * 1.5) {
        this.cache.delete(key);
        cleaned++;
      }
    }
    
    return cleaned;
  }

  /**
   * 获取或设置缓存（如果不存在则执行函数）
   */
  async getOrSet<T>(
    key: string,
    factory: () => Promise<T>,
    ttl?: number
  ): Promise<T> {
    const cached = this.get(key);
    if (cached) {
      this.stats.hits++;
      return cached.body as T;
    }

    this.stats.misses++;
    const data = await factory();
    
    // 自动缓存
    this.set(key, data, { 'Content-Type': 'application/json' }, 200, ttl);
    
    return data;
  }

  generateKey(url: string, method: string, query?: Record<string, string>, varyBy?: string[]): string {
    const parts = [method.toUpperCase(), url];

    if (query) {
      const sorted = Object.keys(query).sort().map(k => `${k}=${query[k]}`);
      parts.push(sorted.join('&'));
    }

    if (varyBy) {
      parts.push(varyBy.join(','));
    }

    return parts.join('|');
  }

  get(key: string): CacheEntry | null {
    const entry = this.cache.get(key);
    if (!entry) return null;

    const age = (Date.now() - entry.timestamp) / 1000;

    if (age > entry.ttl + (entry.ttl * 0.5)) {
      // Completely expired (including 50% grace period)
      this.cache.delete(key);
      return null;
    }

    return entry;
  }

  isStale(key: string): boolean {
    const entry = this.cache.get(key);
    if (!entry) return true;
    return (Date.now() - entry.timestamp) / 1000 > entry.ttl;
  }

  set(
    key: string,
    body: unknown,
    headers: Record<string, string>,
    statusCode: number,
    ttl?: number
  ): void {
    const entry: CacheEntry = {
      body,
      headers: { ...headers },
      statusCode,
      timestamp: Date.now(),
      ttl: ttl ?? this.defaultTTL,
      etag: this.generateETag(body),
    };

    entry.headers['ETag'] = entry.etag;
    entry.headers['X-Cache'] = 'HIT';
    entry.headers['Cache-Control'] = `public, max-age=${entry.ttl}`;

    this.cache.set(key, entry);
  }

  invalidate(key: string): boolean {
    return this.cache.delete(key);
  }

  invalidatePattern(pattern: RegExp): number {
    let count = 0;
    for (const key of this.cache.keys()) {
      if (pattern.test(key)) {
        this.cache.delete(key);
        count++;
      }
    }
    return count;
  }

  private generateETag(body: unknown): string {
    const str = JSON.stringify(body);
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return `"${Math.abs(hash).toString(16)}"`;
  }

  middleware(options: CacheOptions = { ttl: 60 }) {
    return (req: { url: string; method: string; query?: Record<string, string>; headers?: Record<string, string> }, res: {
      status: (code: number) => { json: (body: unknown) => void; send: (body: unknown) => void };
      setHeader: (key: string, value: string) => void;
      json: (body: unknown) => void;
      statusCode: number;
    }, next: () => void) => {
      if (req.method !== 'GET' || (options.condition && !options.condition(req))) {
        return next();
      }

      const key = options.key ?? this.generateKey(
        req.url,
        req.method,
        req.query,
        options.varyBy
      );

      const cached = this.get(key);
      if (cached) {
        // Check ETag
        if (req.headers?.['if-none-match'] === cached.etag) {
          res.status(304).send('');
          return;
        }

        res.setHeader('ETag', cached.etag);
        res.setHeader('X-Cache', this.isStale(key) ? 'STALE' : 'HIT');
        res.setHeader('Age', String(Math.floor((Date.now() - cached.timestamp) / 1000)));
        res.setHeader('Cache-Control', `public, max-age=${cached.ttl}`);
        res.status(cached.statusCode).json(cached.body);
        return;
      }

      // Intercept response
      const originalJson = res.json.bind(res);
      res.json = (body: unknown) => {
        this.set(key, body, {}, res.statusCode, options.ttl);
        return originalJson(body);
      };

      next();
    };
  }

  clear(): void {
    this.cache.clear();
  }
}

export const apiCache = new APICache();
