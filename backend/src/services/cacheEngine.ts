/**
 * 多级缓存引擎
 * Multi-tier Cache Engine
 *
 * L1 内存缓存 + L2 持久化缓存，支持TTL、LRU淘汰、缓存穿透防护
 */

export interface CacheEntry<T = any> {
  value: T;
  createdAt: number;
  expiresAt: number;
  hitCount: number;
  lastAccess: number;
}

export interface CacheConfig {
  maxSize: number;
  defaultTTL: number; // ms
  checkInterval: number; // 清理间隔 ms
  enablePenetrationProtection: boolean;
}

export interface CacheStats {
  size: number;
  maxSize: number;
  hits: number;
  misses: number;
  hitRate: number;
  evictions: number;
  penetrations: number;
}

/**
 * LRU 缓存
 */
export class LRUCache<T = any> {
  private cache: Map<string, CacheEntry<T>> = new Map();
  private config: CacheConfig;
  private stats = { hits: 0, misses: 0, evictions: 0, penetrations: 0 };
  private cleanupTimer: ReturnType<typeof setInterval> | null = null;
  private nullSet: Set<string> = new Set(); // 缓存穿透防护
  private nullTimers: Map<string, ReturnType<typeof setTimeout>> = new Map();

  constructor(config: Partial<CacheConfig> = {}) {
    this.config = {
      maxSize: 1000,
      defaultTTL: 60_000,
      checkInterval: 10_000,
      enablePenetrationProtection: true,
      ...config,
    };
    this.startCleanup();
  }

  /**
   * 获取缓存值
   */
  get(key: string): T | undefined {
    // 穿透防护：标记为不存在的key
    if (this.config.enablePenetrationProtection && this.nullSet.has(key)) {
      this.stats.penetrations++;
      return undefined;
    }

    const entry = this.cache.get(key);
    if (!entry) {
      this.stats.misses++;
      return undefined;
    }

    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      this.stats.misses++;
      return undefined;
    }

    // 更新访问信息（LRU）
    entry.hitCount++;
    entry.lastAccess = Date.now();
    // 移到末尾（最新）
    this.cache.delete(key);
    this.cache.set(key, entry);
    this.stats.hits++;

    return entry.value;
  }

  /**
   * 设置缓存值
   */
  set(key: string, value: T, ttl?: number): void {
    // 如果之前是穿透标记，移除
    this.nullSet.delete(key);

    // 覆盖已有 key 不增加条目数：先移除旧值，避免满容量时误淘汰无关条目
    this.cache.delete(key);

    // 超出容量时淘汰最旧的。空字符串是合法 key，不能用 falsy 判断，
    // 否则 oldest='' 时既不删除也不退出，直接死循环
    const limit = this.capacityLimit();
    while (this.cache.size >= limit) {
      const oldest = this.cache.keys().next().value;
      if (oldest === undefined) break;
      this.cache.delete(oldest);
      this.stats.evictions++;
    }

    const now = Date.now();
    this.cache.set(key, {
      value,
      createdAt: now,
      expiresAt: now + (ttl ?? this.config.defaultTTL),
      hitCount: 0,
      lastAccess: now,
    });
  }

  /**
   * 设置穿透标记（key不存在，避免反复查询）
   */
  setNull(key: string, ttl?: number): void {
    // 同一 key 重复标记时先撤掉旧定时器，避免多个定时器叠挂
    this.clearNullTimer(key);
    this.nullSet.add(key);
    // 自动清理穿透标记
    const timer = setTimeout(() => {
      this.nullSet.delete(key);
      this.nullTimers.delete(key);
    }, ttl ?? this.config.defaultTTL);
    // 纯标记定时器不应阻止进程退出
    if (typeof timer.unref === 'function') timer.unref();
    this.nullTimers.set(key, timer);
  }

  /**
   * 删除缓存
   */
  delete(key: string): boolean {
    this.nullSet.delete(key);
    this.clearNullTimer(key);
    return this.cache.delete(key);
  }

  /**
   * 清空缓存
   */
  clear(): void {
    this.cache.clear();
    this.nullSet.clear();
    this.clearAllNullTimers();
  }

  /**
   * 是否存在（不更新LRU）
   */
  has(key: string): boolean {
    const entry = this.cache.get(key);
    if (!entry) return false;
    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      return false;
    }
    return true;
  }

  /**
   * 获取或设置（缓存穿透模式）
   */
  async getOrSet(key: string, factory: () => Promise<T | null>, ttl?: number): Promise<T | undefined> {
    // 先检查穿透标记
    if (this.config.enablePenetrationProtection && this.nullSet.has(key)) {
      this.stats.penetrations++;
      return undefined;
    }

    const cached = this.get(key);
    if (cached !== undefined) return cached;

    try {
      const value = await factory();
      if (value === null || value === undefined) {
        if (this.config.enablePenetrationProtection) {
          this.setNull(key, ttl ?? 5000);
        }
        return undefined;
      }
      this.set(key, value, ttl);
      return value;
    } catch {
      return undefined;
    }
  }

  /**
   * 批量获取
   */
  mget(keys: string[]): Map<string, T | undefined> {
    const result = new Map<string, T | undefined>();
    for (const key of keys) {
      result.set(key, this.get(key));
    }
    return result;
  }

  /**
   * 批量设置
   */
  mset(entries: Array<{ key: string; value: T; ttl?: number }>): void {
    for (const { key, value, ttl } of entries) {
      this.set(key, value, ttl);
    }
  }

  /**
   * 获取统计信息
   */
  getStats(): CacheStats {
    const total = this.stats.hits + this.stats.misses;
    return {
      size: this.cache.size,
      maxSize: this.config.maxSize,
      hits: this.stats.hits,
      misses: this.stats.misses,
      hitRate: total > 0 ? this.stats.hits / total : 0,
      evictions: this.stats.evictions,
      penetrations: this.stats.penetrations,
    };
  }

  /**
   * 获取所有keys
   */
  keys(): string[] {
    return Array.from(this.cache.keys());
  }

  /**
   * 销毁
   */
  destroy(): void {
    this.stopCleanup();
    this.cache.clear();
    this.nullSet.clear();
    this.clearAllNullTimers();
  }

  /**
   * 有效容量上限：至少 1
   * 配置为 0/负数/NaN 时退化为 1，否则淘汰循环的收敛条件永远成立会挂死
   */
  private capacityLimit(): number {
    const configured = Math.floor(this.config.maxSize);
    return Number.isFinite(configured) && configured >= 1 ? configured : 1;
  }

  private clearNullTimer(key: string): void {
    const timer = this.nullTimers.get(key);
    if (timer !== undefined) {
      clearTimeout(timer);
      this.nullTimers.delete(key);
    }
  }

  private clearAllNullTimers(): void {
    for (const timer of this.nullTimers.values()) clearTimeout(timer);
    this.nullTimers.clear();
  }

  private startCleanup(): void {
    this.cleanupTimer = setInterval(() => {
      const now = Date.now();
      for (const [key, entry] of this.cache) {
        if (now > entry.expiresAt) {
          this.cache.delete(key);
        }
      }
    }, this.config.checkInterval);
  }

  private stopCleanup(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
  }
}

/**
 * 带版本号的缓存（用于缓存失效）
 */
export class VersionedCache<T = any> {
  private cache: LRUCache<{ version: number; data: T }>;

  constructor(config: Partial<CacheConfig> = {}) {
    this.cache = new LRUCache(config);
  }

  get(key: string, version: number): T | undefined {
    const entry = this.cache.get(key);
    if (!entry || entry.version !== version) return undefined;
    return entry.data;
  }

  set(key: string, data: T, version: number, ttl?: number): void {
    this.cache.set(key, { version, data }, ttl);
  }

  invalidate(key: string): void {
    this.cache.delete(key);
  }

  clear(): void {
    this.cache.clear();
  }
}
