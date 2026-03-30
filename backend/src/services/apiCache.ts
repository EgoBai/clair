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

  constructor(defaultTTL: number = 60) {
    this.defaultTTL = defaultTTL;
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

  getStats(): { entries: number; memoryEstimate: string } {
    const entries = this.cache.size;
    let bytes = 0;
    for (const entry of this.cache.values()) {
      bytes += JSON.stringify(entry).length * 2; // rough estimate
    }
    const memoryEstimate = bytes > 1024 * 1024
      ? `${(bytes / 1024 / 1024).toFixed(2)}MB`
      : `${(bytes / 1024).toFixed(2)}KB`;
    return { entries, memoryEstimate };
  }

  clear(): void {
    this.cache.clear();
  }

  cleanExpired(): number {
    let cleaned = 0;
    const now = Date.now();
    for (const [key, entry] of this.cache) {
      const age = (now - entry.timestamp) / 1000;
      if (age > entry.ttl * 1.5) {
        this.cache.delete(key);
        cleaned++;
      }
    }
    return cleaned;
  }
}

export const apiCache = new APICache();
