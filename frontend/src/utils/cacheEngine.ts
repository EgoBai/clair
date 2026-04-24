/**
 * 前端缓存策略引擎
 * 支持LRU/LFU/FIFO/TTL等多种缓存策略，浏览器存储管理
 */

// ==================== 类型定义 ====================

export type CacheStrategy = 'lru' | 'lfu' | 'fifo' | 'ttl';

export interface CacheEntry<T = unknown> {
  key: string;
  value: T;
  createdAt: number;
  accessedAt: number;
  accessCount: number;
  ttl: number; // ms, 0 = 永不过期
  size: number; // bytes estimate
}

export interface CacheConfig {
  strategy: CacheStrategy;
  maxSize: number; // 最大条目数
  maxMemory: number; // 最大内存(bytes), 0 = 不限
  defaultTTL: number; // 默认过期时间ms
  onEvict?: (key: string, entry: CacheEntry) => void;
}

export interface CacheStats {
  hits: number;
  misses: number;
  evictions: number;
  size: number;
  memoryUsage: number;
  hitRate: number;
}

export interface StorageQuota {
  usage: number;
  quota: number;
  available: number;
  usagePercent: number;
}

// ==================== 默认配置 ====================

const DEFAULT_CONFIG: CacheConfig = {
  strategy: 'lru',
  maxSize: 1000,
  maxMemory: 50 * 1024 * 1024, // 50MB
  defaultTTL: 5 * 60 * 1000, // 5分钟
};

// ==================== LRU缓存 ====================

export class LRUCache<T = unknown> {
  private cache = new Map<string, CacheEntry<T>>();
  private config: CacheConfig;
  private stats: CacheStats = { hits: 0, misses: 0, evictions: 0, size: 0, memoryUsage: 0, hitRate: 0 };

  constructor(config: Partial<CacheConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config, strategy: 'lru' };
  }

  get(key: string): T | undefined {
    const entry = this.cache.get(key);
    if (!entry) {
      this.stats.misses++;
      this.updateHitRate();
      return undefined;
    }

    if (this.isExpired(entry)) {
      this.delete(key);
      this.stats.misses++;
      this.updateHitRate();
      return undefined;
    }

    // LRU: 移到最后
    this.cache.delete(key);
    this.cache.set(key, { ...entry, accessedAt: Date.now(), accessCount: entry.accessCount + 1 });
    this.stats.hits++;
    this.updateHitRate();
    return entry.value;
  }

  set(key: string, value: T, ttl?: number): void {
    const existing = this.cache.get(key);
    if (existing) {
      this.stats.memoryUsage -= existing.size;
    }

    const size = this.estimateSize(value);
    const entry: CacheEntry<T> = {
      key, value,
      createdAt: Date.now(),
      accessedAt: Date.now(),
      accessCount: 1,
      ttl: ttl ?? this.config.defaultTTL,
      size,
    };

    this.cache.delete(key);
    this.cache.set(key, entry);
    this.stats.memoryUsage += size;
    this.stats.size = this.cache.size;

    this.evict();
  }

  delete(key: string): boolean {
    const entry = this.cache.get(key);
    if (entry) {
      this.stats.memoryUsage -= entry.size;
      this.cache.delete(key);
      this.stats.size = this.cache.size;
      return true;
    }
    return false;
  }

  has(key: string): boolean {
    const entry = this.cache.get(key);
    if (!entry) return false;
    if (this.isExpired(entry)) {
      this.delete(key);
      return false;
    }
    return true;
  }

  clear(): void {
    this.cache.clear();
    this.stats = { hits: 0, misses: 0, evictions: 0, size: 0, memoryUsage: 0, hitRate: 0 };
  }

  getStats(): CacheStats {
    return { ...this.stats };
  }

  keys(): string[] {
    return Array.from(this.cache.keys());
  }

  values(): T[] {
    return Array.from(this.cache.values()).map(e => e.value);
  }

  private evict(): void {
    while (this.cache.size > this.config.maxSize
      || (this.config.maxMemory > 0 && this.stats.memoryUsage > this.config.maxMemory)) {
      const firstKey = this.cache.keys().next().value;
      if (!firstKey) break;
      const entry = this.cache.get(firstKey)!;
      this.config.onEvict?.(firstKey, entry);
      this.cache.delete(firstKey);
      this.stats.memoryUsage -= entry.size;
      this.stats.evictions++;
    }
    this.stats.size = this.cache.size;
  }

  private isExpired(entry: CacheEntry<T>): boolean {
    if (entry.ttl === 0) return false;
    return Date.now() - entry.createdAt > entry.ttl;
  }

  private estimateSize(value: T): number {
    try {
      return new Blob([JSON.stringify(value)]).size;
    } catch {
      return JSON.stringify(value).length * 2;
    }
  }

  private updateHitRate(): void {
    const total = this.stats.hits + this.stats.misses;
    this.stats.hitRate = total > 0 ? Math.round((this.stats.hits / total) * 10000) / 10000 : 0;
  }
}

// ==================== LFU缓存 ====================

export class LFUCache<T = unknown> {
  private cache = new Map<string, CacheEntry<T>>();
  private config: CacheConfig;
  private stats: CacheStats = { hits: 0, misses: 0, evictions: 0, size: 0, memoryUsage: 0, hitRate: 0 };

  constructor(config: Partial<CacheConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config, strategy: 'lfu' };
  }

  get(key: string): T | undefined {
    const entry = this.cache.get(key);
    if (!entry || this.isExpired(entry)) {
      this.stats.misses++;
      if (entry) this.delete(key);
      this.updateHitRate();
      return undefined;
    }

    entry.accessedAt = Date.now();
    entry.accessCount++;
    this.stats.hits++;
    this.updateHitRate();
    return entry.value;
  }

  set(key: string, value: T, ttl?: number): void {
    const existing = this.cache.get(key);
    if (existing) {
      this.stats.memoryUsage -= existing.size;
      existing.value = value;
      existing.accessedAt = Date.now();
      existing.accessCount++;
      existing.ttl = ttl ?? this.config.defaultTTL;
      existing.size = this.estimateSize(value);
      this.stats.memoryUsage += existing.size;
      return;
    }

    const size = this.estimateSize(value);
    const entry: CacheEntry<T> = {
      key, value, createdAt: Date.now(), accessedAt: Date.now(),
      accessCount: 1, ttl: ttl ?? this.config.defaultTTL, size,
    };

    this.cache.set(key, entry);
    this.stats.memoryUsage += size;
    this.stats.size = this.cache.size;
    this.evict();
  }

  delete(key: string): boolean {
    const entry = this.cache.get(key);
    if (entry) {
      this.stats.memoryUsage -= entry.size;
      this.cache.delete(key);
      this.stats.size = this.cache.size;
      return true;
    }
    return false;
  }

  has(key: string): boolean {
    const entry = this.cache.get(key);
    if (!entry) return false;
    if (this.isExpired(entry)) { this.delete(key); return false; }
    return true;
  }

  clear(): void {
    this.cache.clear();
    this.stats = { hits: 0, misses: 0, evictions: 0, size: 0, memoryUsage: 0, hitRate: 0 };
  }

  getStats(): CacheStats { return { ...this.stats }; }

  private evict(): void {
    while (this.cache.size > this.config.maxSize
      || (this.config.maxMemory > 0 && this.stats.memoryUsage > this.config.maxMemory)) {
      let minKey = '';
      let minCount = Infinity;
      for (const [key, entry] of this.cache) {
        if (entry.accessCount < minCount) {
          minCount = entry.accessCount;
          minKey = key;
        }
      }
      if (!minKey) break;
      const entry = this.cache.get(minKey)!;
      this.config.onEvict?.(minKey, entry);
      this.cache.delete(minKey);
      this.stats.memoryUsage -= entry.size;
      this.stats.evictions++;
    }
    this.stats.size = this.cache.size;
  }

  private isExpired(entry: CacheEntry<T>): boolean {
    return entry.ttl > 0 && Date.now() - entry.createdAt > entry.ttl;
  }

  private estimateSize(value: T): number {
    try { return new Blob([JSON.stringify(value)]).size; } catch { return JSON.stringify(value).length * 2; }
  }

  private updateHitRate(): void {
    const total = this.stats.hits + this.stats.misses;
    this.stats.hitRate = total > 0 ? Math.round((this.stats.hits / total) * 10000) / 10000 : 0;
  }
}

// ==================== TTL缓存 ====================

export class TTLCache<T = unknown> {
  private cache = new Map<string, CacheEntry<T>>();
  private timers = new Map<string, ReturnType<typeof setTimeout>>();
  private config: CacheConfig;
  private stats: CacheStats = { hits: 0, misses: 0, evictions: 0, size: 0, memoryUsage: 0, hitRate: 0 };

  constructor(config: Partial<CacheConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config, strategy: 'ttl' };
  }

  get(key: string): T | undefined {
    const entry = this.cache.get(key);
    if (!entry) {
      this.stats.misses++;
      this.updateHitRate();
      return undefined;
    }

    entry.accessedAt = Date.now();
    entry.accessCount++;
    this.stats.hits++;
    this.updateHitRate();
    return entry.value;
  }

  set(key: string, value: T, ttl?: number): void {
    this.delete(key);

    const effectiveTTL = ttl ?? this.config.defaultTTL;
    const size = this.estimateSize(value);

    const entry: CacheEntry<T> = {
      key, value, createdAt: Date.now(), accessedAt: Date.now(),
      accessCount: 1, ttl: effectiveTTL, size,
    };

    this.cache.set(key, entry);
    this.stats.memoryUsage += size;
    this.stats.size = this.cache.size;

    if (effectiveTTL > 0) {
      const timer = setTimeout(() => this.delete(key), effectiveTTL);
      this.timers.set(key, timer);
    }
  }

  delete(key: string): boolean {
    const timer = this.timers.get(key);
    if (timer) { clearTimeout(timer); this.timers.delete(key); }

    const entry = this.cache.get(key);
    if (entry) {
      this.stats.memoryUsage -= entry.size;
      this.cache.delete(key);
      this.stats.size = this.cache.size;
      return true;
    }
    return false;
  }

  has(key: string): boolean { return this.cache.has(key); }

  clear(): void {
    this.timers.forEach(t => clearTimeout(t));
    this.timers.clear();
    this.cache.clear();
    this.stats = { hits: 0, misses: 0, evictions: 0, size: 0, memoryUsage: 0, hitRate: 0 };
  }

  getStats(): CacheStats { return { ...this.stats }; }

  private estimateSize(value: T): number {
    try { return new Blob([JSON.stringify(value)]).size; } catch { return JSON.stringify(value).length * 2; }
  }

  private updateHitRate(): void {
    const total = this.stats.hits + this.stats.misses;
    this.stats.hitRate = total > 0 ? Math.round((this.stats.hits / total) * 10000) / 10000 : 0;
  }
}

// ==================== 缓存工厂 ====================

export function createCache<T = unknown>(
  strategy: CacheStrategy = 'lru',
  config: Partial<CacheConfig> = {},
): LRUCache<T> | LFUCache<T> | TTLCache<T> {
  switch (strategy) {
    case 'lfu': return new LFUCache<T>(config);
    case 'ttl': return new TTLCache<T>(config);
    case 'lru':
    default: return new LRUCache<T>(config);
  }
}

// ==================== 浏览器存储管理 ====================

/**
 * 安全的localStorage封装
 */
export function safeLocalStorage() {
  const available = (() => {
    try {
      const test = '__storage_test__';
      localStorage.setItem(test, test);
      localStorage.removeItem(test);
      return true;
    } catch { return false; }
  })();

  return {
    available,
    get<T = unknown>(key: string, defaultValue?: T): T | undefined {
      if (!available) return defaultValue;
      try {
        const raw = localStorage.getItem(key);
        return raw ? JSON.parse(raw) : defaultValue;
      } catch { return defaultValue; }
    },
    set(key: string, value: unknown): boolean {
      if (!available) return false;
      try {
        localStorage.setItem(key, JSON.stringify(value));
        return true;
      } catch { return false; }
    },
    remove(key: string): void {
      if (!available) return;
      try { localStorage.removeItem(key); } catch { /* ignore */ }
    },
    clear(): void {
      if (!available) return;
      try { localStorage.clear(); } catch { /* ignore */ }
    },
  };
}

/**
 * 计算本地存储使用量
 */
export function calculateStorageUsage(): { localStorage: number; sessionStorage: number } {
  let localStorageSize = 0;
  let sessionStorageSize = 0;

  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key) {
        const value = localStorage.getItem(key);
        localStorageSize += (key.length + (value?.length || 0)) * 2;
      }
    }
  } catch { /* ignore */ }

  try {
    for (let i = 0; i < sessionStorage.length; i++) {
      const key = sessionStorage.key(i);
      if (key) {
        const value = sessionStorage.getItem(key);
        sessionStorageSize += (key.length + (value?.length || 0)) * 2;
      }
    }
  } catch { /* ignore */ }

  return { localStorage: localStorageSize, sessionStorage: sessionStorageSize };
}

/**
 * 缓存数据到localStorage
 */
export function cacheToStorage<T>(
  key: string,
  value: T,
  ttl: number = 5 * 60 * 1000,
): boolean {
  const storage = safeLocalStorage();
  return storage.set(key, { value, expiry: Date.now() + ttl, timestamp: Date.now() });
}

/**
 * 从localStorage读取缓存
 */
export function readFromStorage<T>(key: string): T | undefined {
  const storage = safeLocalStorage();
  const data = storage.get<{ value: T; expiry: number }>(key);
  if (!data) return undefined;
  if (Date.now() > data.expiry) {
    storage.remove(key);
    return undefined;
  }
  return data.value;
}

/**
 * 清理过期的localStorage缓存
 */
export function cleanExpiredStorage(): number {
  let cleaned = 0;
  try {
    const keysToRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key) continue;
      try {
        const raw = localStorage.getItem(key);
        if (raw) {
          const data = JSON.parse(raw);
          if (data && typeof data.expiry === 'number' && Date.now() > data.expiry) {
            keysToRemove.push(key);
          }
        }
      } catch { /* ignore */ }
    }
    keysToRemove.forEach(k => { localStorage.removeItem(k); cleaned++; });
  } catch { /* ignore */ }
  return cleaned;
}
