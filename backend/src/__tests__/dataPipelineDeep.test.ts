import { describe, it, expect } from 'vitest';

// Data Pipeline Validation Tests
describe('Data Pipeline Validation', () => {
  // Schema validation
  describe('Schema Validation', () => {
    type Schema = Record<string, { type: string; required?: boolean; min?: number; max?: number }>;

    const validateSchema = (data: Record<string, unknown>, schema: Schema) => {
      const errors: string[] = [];
      for (const [field, rules] of Object.entries(schema)) {
        const value = data[field];
        if (rules.required && (value === undefined || value === null)) {
          errors.push(`${field} is required`);
          continue;
        }
        if (value === undefined || value === null) continue;
        if (rules.type === 'number' && typeof value !== 'number') {
          errors.push(`${field} must be a number`);
        }
        if (rules.type === 'string' && typeof value !== 'string') {
          errors.push(`${field} must be a string`);
        }
        if (rules.type === 'number' && typeof value === 'number') {
          if (rules.min !== undefined && value < rules.min) errors.push(`${field} below min`);
          if (rules.max !== undefined && value > rules.max) errors.push(`${field} above max`);
        }
      }
      return { valid: errors.length === 0, errors };
    };

    it('should pass valid data', () => {
      const schema: Schema = { price: { type: 'number', required: true, min: 0 }, name: { type: 'string', required: true } };
      const result = validateSchema({ price: 100, name: 'test' }, schema);
      expect(result.valid).toBe(true);
    });

    it('should detect missing required field', () => {
      const schema: Schema = { price: { type: 'number', required: true } };
      const result = validateSchema({}, schema);
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('required');
    });

    it('should detect type mismatch', () => {
      const schema: Schema = { price: { type: 'number' } };
      const result = validateSchema({ price: 'abc' }, schema);
      expect(result.valid).toBe(false);
    });

    it('should detect range violations', () => {
      const schema: Schema = { price: { type: 'number', min: 0, max: 1000 } };
      const result = validateSchema({ price: -5 }, schema);
      expect(result.valid).toBe(false);
    });

    it('should allow optional fields to be missing', () => {
      const schema: Schema = { name: { type: 'string', required: true }, note: { type: 'string' } };
      const result = validateSchema({ name: 'test' }, schema);
      expect(result.valid).toBe(true);
    });
  });

  // Data transformation pipeline
  describe('Transform Pipeline', () => {
    type Transform<T> = (data: T) => T;

    const createPipeline = <T>(transforms: Transform<T>[]) => {
      return (data: T): T => transforms.reduce((d, t) => t(d), data);
    };

    it('should apply transforms in order', () => {
      const pipeline = createPipeline<number[]>([
        (d) => d.map(v => v * 2),
        (d) => d.filter(v => v > 5),
        (d) => d.sort((a, b) => a - b),
      ]);
      expect(pipeline([1, 2, 3, 4, 5])).toEqual([6, 8, 10]);
    });

    it('should handle empty pipeline', () => {
      const pipeline = createPipeline<number[]>([]);
      expect(pipeline([1, 2, 3])).toEqual([1, 2, 3]);
    });

    it('should work with objects', () => {
      const pipeline = createPipeline<Record<string, number>>([
        (d) => ({ ...d, x: d.x * 2 }),
        (d) => ({ ...d, y: d.y + 1 }),
      ]);
      expect(pipeline({ x: 5, y: 10 })).toEqual({ x: 10, y: 11 });
    });
  });

  // Data deduplication
  describe('Deduplication', () => {
    const deduplicate = <T>(items: T[], keyFn: (item: T) => string): T[] => {
      const seen = new Set<string>();
      return items.filter(item => {
        const key = keyFn(item);
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
    };

    it('should remove duplicates by key', () => {
      const items = [
        { code: '600519', price: 100 },
        { code: '000858', price: 200 },
        { code: '600519', price: 105 },
      ];
      const result = deduplicate(items, (i) => i.code);
      expect(result).toHaveLength(2);
    });

    it('should preserve first occurrence', () => {
      const items = [
        { code: '600519', price: 100 },
        { code: '600519', price: 105 },
      ];
      const result = deduplicate(items, (i) => i.code);
      expect(result[0].price).toBe(100);
    });

    it('should handle empty array', () => {
      expect(deduplicate([], (i) => String(i))).toEqual([]);
    });

    it('should handle no duplicates', () => {
      const items = [{ code: 'a' }, { code: 'b' }, { code: 'c' }];
      expect(deduplicate(items, (i) => i.code)).toHaveLength(3);
    });
  });

  // Data aggregation
  describe('Aggregation', () => {
    const aggregate = <T extends Record<string, unknown>>(
      items: T[],
      groupBy: string,
      aggregations: Record<string, (items: T[]) => number>
    ) => {
      const groups = new Map<string, T[]>();
      for (const item of items) {
        const key = String(item[groupBy]);
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key)!.push(item);
      }
      const result: Record<string, Record<string, number>> = {};
      for (const [key, groupItems] of groups) {
        result[key] = {};
        for (const [aggName, aggFn] of Object.entries(aggregations)) {
          result[key][aggName] = aggFn(groupItems);
        }
      }
      return result;
    };

    it('should aggregate by group', () => {
      const data = [
        { sector: 'tech', price: 100, volume: 1000 },
        { sector: 'tech', price: 200, volume: 2000 },
        { sector: 'bank', price: 50, volume: 500 },
      ];
      const result = aggregate(data, 'sector', {
        avgPrice: (items) => items.reduce((s, i) => s + (i.price as number), 0) / items.length,
        totalVolume: (items) => items.reduce((s, i) => s + (i.volume as number), 0),
      });
      expect(result.tech.avgPrice).toBe(150);
      expect(result.tech.totalVolume).toBe(3000);
      expect(result.bank.avgPrice).toBe(50);
    });

    it('should handle single group', () => {
      const data = [{ type: 'A', val: 10 }, { type: 'A', val: 20 }];
      const result = aggregate(data, 'type', { sum: (items) => items.reduce((s, i) => s + (i.val as number), 0) });
      expect(result.A.sum).toBe(30);
    });
  });
});

// Rate Limiter Algorithms Deep
describe('Rate Limiter Algorithms Deep', () => {
  // Token Bucket
  describe('Token Bucket', () => {
    const createTokenBucket = (capacity: number, refillRate: number) => {
      let tokens = capacity;
      let lastRefill = 0;

      return {
        tryConsume: (now: number, count: number = 1) => {
          const elapsed = Math.max(0, (now - lastRefill)) / 1000;
          tokens = Math.min(capacity, tokens + elapsed * refillRate);
          lastRefill = now;
          if (tokens >= count) {
            tokens -= count;
            return { allowed: true, remaining: Math.floor(tokens) };
          }
          return { allowed: false, remaining: Math.floor(tokens), retryAfter: Math.ceil((count - tokens) / refillRate) };
        },
      };
    };

    it('should allow within capacity', () => {
      const bucket = createTokenBucket(10, 1);
      const result = bucket.tryConsume(1000);
      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(9);
    });

    it('should reject when empty', () => {
      const bucket = createTokenBucket(2, 0);
      bucket.tryConsume(1000);
      bucket.tryConsume(1001);
      expect(bucket.tryConsume(1002).allowed).toBe(false);
    });

    it('should refill over time', () => {
      const bucket = createTokenBucket(5, 1);
      bucket.tryConsume(1000, 5); // drain all
      expect(bucket.tryConsume(6000).allowed).toBe(true); // 5 seconds later, 5 tokens refilled
    });
  });

  // Leaky Bucket
  describe('Leaky Bucket', () => {
    const createLeakyBucket = (capacity: number, leakRate: number) => {
      let level = 0;
      let lastLeak = 0;

      return {
        tryAdd: (now: number, amount: number = 1) => {
          const elapsed = Math.max(0, (now - lastLeak)) / 1000;
          level = Math.max(0, level - elapsed * leakRate);
          lastLeak = now;
          if (level + amount <= capacity) {
            level += amount;
            return { accepted: true, level };
          }
          return { accepted: false, level };
        },
      };
    };

    it('should accept within capacity', () => {
      const bucket = createLeakyBucket(10, 1);
      expect(bucket.tryAdd(1000).accepted).toBe(true);
    });

    it('should reject when full', () => {
      const bucket = createLeakyBucket(2, 0);
      bucket.tryAdd(1000);
      bucket.tryAdd(1001);
      expect(bucket.tryAdd(1002).accepted).toBe(false);
    });

    it('should leak over time', () => {
      const bucket = createLeakyBucket(5, 2);
      bucket.tryAdd(1000, 5); // fill
      expect(bucket.tryAdd(5000).accepted).toBe(true); // 4 seconds, leaked 8 (down to 0)
    });
  });
});

// Health Check Aggregation Deep
describe('Health Check Aggregation Deep', () => {
  type ServiceStatus = 'healthy' | 'degraded' | 'unhealthy';

  interface ServiceHealth {
    name: string;
    status: ServiceStatus;
    latency: number;
    lastCheck: number;
  }

  const aggregateHealth = (services: ServiceHealth[]) => {
    if (services.length === 0) return { overall: 'healthy' as ServiceStatus, score: 100 };
    const unhealthyCount = services.filter(s => s.status === 'unhealthy').length;
    const degradedCount = services.filter(s => s.status === 'degraded').length;
    const avgLatency = services.reduce((s, svc) => s + svc.latency, 0) / services.length;

    let overall: ServiceStatus = 'healthy';
    if (unhealthyCount > services.length / 2) overall = 'unhealthy';
    else if (unhealthyCount > 0 || degradedCount > services.length / 3) overall = 'degraded';

    const score = Math.max(0, 100 - unhealthyCount * 30 - degradedCount * 10 - Math.max(0, avgLatency - 100) / 10);

    return { overall, score: Math.round(score), avgLatency: Math.round(avgLatency) };
  };

  it('should return healthy for all healthy', () => {
    const services: ServiceHealth[] = [
      { name: 'db', status: 'healthy', latency: 10, lastCheck: 0 },
      { name: 'cache', status: 'healthy', latency: 5, lastCheck: 0 },
    ];
    const result = aggregateHealth(services);
    expect(result.overall).toBe('healthy');
    expect(result.score).toBe(100);
  });

  it('should degrade with some unhealthy', () => {
    const services: ServiceHealth[] = [
      { name: 'db', status: 'unhealthy', latency: 1000, lastCheck: 0 },
      { name: 'cache', status: 'healthy', latency: 5, lastCheck: 0 },
      { name: 'api', status: 'healthy', latency: 10, lastCheck: 0 },
    ];
    const result = aggregateHealth(services);
    expect(result.overall).toBe('degraded');
  });

  it('should mark unhealthy when majority down', () => {
    const services: ServiceHealth[] = [
      { name: 'db', status: 'unhealthy', latency: 1000, lastCheck: 0 },
      { name: 'cache', status: 'unhealthy', latency: 1000, lastCheck: 0 },
      { name: 'api', status: 'healthy', latency: 10, lastCheck: 0 },
    ];
    const result = aggregateHealth(services);
    expect(result.overall).toBe('unhealthy');
  });

  it('should handle empty services', () => {
    const result = aggregateHealth([]);
    expect(result.overall).toBe('healthy');
    expect(result.score).toBe(100);
  });

  it('should reduce score for degraded services', () => {
    const services: ServiceHealth[] = [
      { name: 'db', status: 'degraded', latency: 200, lastCheck: 0 },
      { name: 'cache', status: 'healthy', latency: 5, lastCheck: 0 },
    ];
    const result = aggregateHealth(services);
    expect(result.score).toBeLessThan(100);
  });
});

// Configuration Deep Validation
describe('Configuration Deep Validation', () => {
  const validateDatabaseConfig = (config: Record<string, unknown>) => {
    const errors: string[] = [];
    if (!config.host || typeof config.host !== 'string') errors.push('host required');
    if (typeof config.port !== 'number' || config.port < 1 || config.port > 65535) errors.push('invalid port');
    if (!config.database || typeof config.database !== 'string') errors.push('database required');
    if (config.poolSize && (typeof config.poolSize !== 'number' || config.poolSize < 1)) errors.push('invalid poolSize');
    if (config.ssl && typeof config.ssl !== 'boolean') errors.push('ssl must be boolean');
    return { valid: errors.length === 0, errors };
  };

  it('should validate correct config', () => {
    expect(validateDatabaseConfig({ host: 'localhost', port: 5432, database: 'stocks' }).valid).toBe(true);
  });

  it('should reject invalid port', () => {
    expect(validateDatabaseConfig({ host: 'localhost', port: 99999, database: 'x' }).valid).toBe(false);
  });

  it('should reject missing host', () => {
    expect(validateDatabaseConfig({ port: 5432, database: 'x' }).valid).toBe(false);
  });

  it('should reject negative poolSize', () => {
    expect(validateDatabaseConfig({ host: 'localhost', port: 5432, database: 'x', poolSize: -1 }).valid).toBe(false);
  });

  const validateRedisConfig = (config: Record<string, unknown>) => {
    const errors: string[] = [];
    if (!config.host) errors.push('host required');
    if (typeof config.port !== 'number') errors.push('port must be number');
    if (config.db !== undefined && (typeof config.db !== 'number' || config.db < 0 || config.db > 15)) {
      errors.push('db must be 0-15');
    }
    if (config.ttl !== undefined && (typeof config.ttl !== 'number' || config.ttl < 0)) {
      errors.push('ttl must be non-negative');
    }
    return { valid: errors.length === 0, errors };
  };

  it('should validate redis config', () => {
    expect(validateRedisConfig({ host: 'localhost', port: 6379 }).valid).toBe(true);
  });

  it('should reject invalid db number', () => {
    expect(validateRedisConfig({ host: 'localhost', port: 6379, db: 20 }).valid).toBe(false);
  });

  it('should accept valid db number', () => {
    expect(validateRedisConfig({ host: 'localhost', port: 6379, db: 5 }).valid).toBe(true);
  });
});

// Retry Strategy Tests
describe('Retry Strategy', () => {
  interface RetryConfig {
    maxAttempts: number;
    baseDelay: number;
    maxDelay: number;
    multiplier: number;
    jitter: boolean;
  }

  const calculateBackoff = (attempt: number, config: RetryConfig) => {
    let delay = config.baseDelay * Math.pow(config.multiplier, attempt);
    delay = Math.min(delay, config.maxDelay);
    if (config.jitter) delay *= (0.8 + Math.random() * 0.4); // ±20%
    return Math.round(delay);
  };

  const createRetryExecutor = <T>(config: RetryConfig) => {
    return async (fn: () => Promise<T>): Promise<T> => {
      let lastError: Error | undefined;
      for (let attempt = 0; attempt < config.maxAttempts; attempt++) {
        try {
          return await fn();
        } catch (e) {
          lastError = e as Error;
          if (attempt < config.maxAttempts - 1) {
            const delay = calculateBackoff(attempt, config);
            await new Promise(r => setTimeout(r, delay));
          }
        }
      }
      throw lastError;
    };
  };

  it('should calculate exponential backoff', () => {
    const config: RetryConfig = { maxAttempts: 5, baseDelay: 100, maxDelay: 10000, multiplier: 2, jitter: false };
    expect(calculateBackoff(0, config)).toBe(100);
    expect(calculateBackoff(1, config)).toBe(200);
    expect(calculateBackoff(2, config)).toBe(400);
    expect(calculateBackoff(3, config)).toBe(800);
  });

  it('should cap at maxDelay', () => {
    const config: RetryConfig = { maxAttempts: 10, baseDelay: 1000, maxDelay: 5000, multiplier: 2, jitter: false };
    expect(calculateBackoff(10, config)).toBe(5000);
  });

  it('should apply jitter', () => {
    const config: RetryConfig = { maxAttempts: 5, baseDelay: 1000, maxDelay: 10000, multiplier: 2, jitter: true };
    const delays = Array.from({ length: 20 }, () => calculateBackoff(1, config));
    const uniqueDelays = new Set(delays);
    expect(uniqueDelays.size).toBeGreaterThan(1); // jitter should produce variation
  });

  it('should succeed on first try', async () => {
    const executor = createRetryExecutor({ maxAttempts: 3, baseDelay: 10, maxDelay: 100, multiplier: 2, jitter: false });
    let attempts = 0;
    const result = await executor(async () => { attempts++; return 42; });
    expect(result).toBe(42);
    expect(attempts).toBe(1);
  });

  it('should retry on failure', async () => {
    const executor = createRetryExecutor({ maxAttempts: 3, baseDelay: 1, maxDelay: 10, multiplier: 2, jitter: false });
    let attempts = 0;
    const result = await executor(async () => {
      attempts++;
      if (attempts < 3) throw new Error('fail');
      return 'success';
    });
    expect(result).toBe('success');
    expect(attempts).toBe(3);
  });

  it('should throw after max attempts', async () => {
    const executor = createRetryExecutor({ maxAttempts: 2, baseDelay: 1, maxDelay: 10, multiplier: 2, jitter: false });
    await expect(executor(async () => { throw new Error('always fail'); })).rejects.toThrow('always fail');
  });
});
