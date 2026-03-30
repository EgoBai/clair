import { describe, it, expect } from 'vitest';

// Log Analysis & Monitoring Tests
describe('Log Analysis', () => {
  type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'critical';

  interface LogEntry {
    level: LogLevel;
    message: string;
    timestamp: number;
    source: string;
    meta?: Record<string, any>;
  }

  const parseLogLine = (line: string): LogEntry | null => {
    const match = /^\[(\w+)\] (\d{4}-\d{2}-\d{2}T[\d:.]+Z) \[(\w+)\] (.+?)(?:\s+\{(.+)\})?$/.exec(line);
    if (!match) return null;
    const [, level, ts, source, message, metaStr] = match;
    return {
      level: level.toLowerCase() as LogLevel,
      message,
      timestamp: new Date(ts).getTime(),
      source,
      meta: metaStr ? JSON.parse(`{${metaStr}}`) : undefined,
    };
  };

  const analyzeLogs = (entries: LogEntry[]) => {
    const levelCounts: Record<LogLevel, number> = { debug: 0, info: 0, warn: 0, error: 0, critical: 0 };
    const sourceCounts: Record<string, number> = {};
    const errors: LogEntry[] = [];

    for (const entry of entries) {
      levelCounts[entry.level]++;
      sourceCounts[entry.source] = (sourceCounts[entry.source] || 0) + 1;
      if (entry.level === 'error' || entry.level === 'critical') errors.push(entry);
    }

    return { levelCounts, sourceCounts, errors, total: entries.length };
  };

  const generateAlert = (entries: LogEntry[]): { alert: boolean; reason: string } => {
    const recent = entries.filter(e => Date.now() - e.timestamp < 60000);
    const errorCount = recent.filter(e => e.level === 'error').length;
    const criticalCount = recent.filter(e => e.level === 'critical').length;

    if (criticalCount > 0) return { alert: true, reason: `${criticalCount} critical errors in last minute` };
    if (errorCount > 10) return { alert: true, reason: `${errorCount} errors in last minute` };
    return { alert: false, reason: '' };
  };

  it('should parse valid log lines', () => {
    const line = '[INFO] 2026-03-24T05:00:00.000Z [api] Request processed';
    const entry = parseLogLine(line);
    expect(entry).not.toBeNull();
    expect(entry!.level).toBe('info');
    expect(entry!.source).toBe('api');
  });

  it('should reject invalid log lines', () => {
    expect(parseLogLine('random text')).toBeNull();
    expect(parseLogLine('')).toBeNull();
  });

  it('should count by level', () => {
    const entries: LogEntry[] = [
      { level: 'info', message: '', timestamp: 0, source: 'api' },
      { level: 'error', message: '', timestamp: 0, source: 'api' },
      { level: 'info', message: '', timestamp: 0, source: 'db' },
    ];
    const analysis = analyzeLogs(entries);
    expect(analysis.levelCounts.info).toBe(2);
    expect(analysis.levelCounts.error).toBe(1);
  });

  it('should count by source', () => {
    const entries: LogEntry[] = [
      { level: 'info', message: '', timestamp: 0, source: 'api' },
      { level: 'info', message: '', timestamp: 0, source: 'api' },
      { level: 'info', message: '', timestamp: 0, source: 'db' },
    ];
    const analysis = analyzeLogs(entries);
    expect(analysis.sourceCounts['api']).toBe(2);
    expect(analysis.sourceCounts['db']).toBe(1);
  });

  it('should collect errors separately', () => {
    const entries: LogEntry[] = [
      { level: 'info', message: '', timestamp: 0, source: 'api' },
      { level: 'error', message: 'fail', timestamp: 0, source: 'db' },
      { level: 'critical', message: 'down', timestamp: 0, source: 'db' },
    ];
    const analysis = analyzeLogs(entries);
    expect(analysis.errors).toHaveLength(2);
  });

  it('should alert on critical errors', () => {
    const now = Date.now();
    const entries: LogEntry[] = [
      { level: 'critical', message: 'DB down', timestamp: now, source: 'db' },
    ];
    const alert = generateAlert(entries);
    expect(alert.alert).toBe(true);
    expect(alert.reason).toContain('critical');
  });

  it('should not alert for info logs', () => {
    const entries: LogEntry[] = [
      { level: 'info', message: 'OK', timestamp: Date.now(), source: 'api' },
    ];
    expect(generateAlert(entries).alert).toBe(false);
  });
});

// Rate Limiting Algorithm Tests
describe('Rate Limiting Algorithms', () => {
  class TokenBucket {
    private tokens: number;
    private lastRefill: number;

    constructor(
      private capacity: number,
      private refillRate: number, // tokens per second
    ) {
      this.tokens = capacity;
      this.lastRefill = Date.now();
    }

    tryConsume(n: number = 1): boolean {
      this.refill();
      if (this.tokens >= n) {
        this.tokens -= n;
        return true;
      }
      return false;
    }

    private refill() {
      const now = Date.now();
      const elapsed = (now - this.lastRefill) / 1000;
      this.tokens = Math.min(this.capacity, this.tokens + elapsed * this.refillRate);
      this.lastRefill = now;
    }

    getTokens(): number {
      this.refill();
      return this.tokens;
    }
  }

  class FixedWindowCounter {
    private counts: Map<string, number> = new Map();
    private windowStart: number = Date.now();

    constructor(private windowMs: number, private maxRequests: number) {}

    isAllowed(key: string): boolean {
      const now = Date.now();
      if (now - this.windowStart >= this.windowMs) {
        this.counts.clear();
        this.windowStart = now;
      }
      const count = this.counts.get(key) || 0;
      if (count >= this.maxRequests) return false;
      this.counts.set(key, count + 1);
      return true;
    }

    getCount(key: string): number {
      return this.counts.get(key) || 0;
    }
  }

  it('should allow requests within capacity', () => {
    const bucket = new TokenBucket(10, 1);
    expect(bucket.tryConsume(5)).toBe(true);
    expect(bucket.tryConsume(5)).toBe(true);
  });

  it('should reject when depleted', () => {
    const bucket = new TokenBucket(3, 0);
    bucket.tryConsume(3);
    expect(bucket.tryConsume(1)).toBe(false);
  });

  it('should count remaining tokens', () => {
    const bucket = new TokenBucket(10, 0);
    bucket.tryConsume(7);
    expect(Math.floor(bucket.getTokens())).toBe(3);
  });

  it('should allow within window limit', () => {
    const counter = new FixedWindowCounter(60000, 5);
    expect(counter.isAllowed('user1')).toBe(true);
    expect(counter.getCount('user1')).toBe(1);
  });

  it('should reject over window limit', () => {
    const counter = new FixedWindowCounter(60000, 2);
    counter.isAllowed('user1');
    counter.isAllowed('user1');
    expect(counter.isAllowed('user1')).toBe(false);
  });

  it('should track independently per key', () => {
    const counter = new FixedWindowCounter(60000, 1);
    expect(counter.isAllowed('user1')).toBe(true);
    expect(counter.isAllowed('user2')).toBe(true);
    expect(counter.isAllowed('user1')).toBe(false);
  });
});

// Configuration Validation Tests
describe('Configuration Validation', () => {
  type ConfigSchema = Record<string, {
    type: 'string' | 'number' | 'boolean';
    required: boolean;
    default?: any;
    validate?: (v: any) => boolean;
    min?: number;
    max?: number;
  }>;

  const validateConfig = (config: Record<string, any>, schema: ConfigSchema) => {
    const errors: string[] = [];
    const result: Record<string, any> = {};

    for (const [key, rules] of Object.entries(schema)) {
      let value = config[key];

      if (value === undefined || value === null) {
        if (rules.required) {
          if (rules.default !== undefined) {
            value = rules.default;
          } else {
            errors.push(`Missing required field: ${key}`);
            continue;
          }
        } else {
          value = rules.default;
        }
      }

      if (value !== undefined) {
        if (rules.type === 'number' && typeof value !== 'number') {
          errors.push(`${key}: expected number, got ${typeof value}`);
          continue;
        }
        if (rules.type === 'number') {
          if (rules.min !== undefined && value < rules.min) errors.push(`${key}: below minimum ${rules.min}`);
          if (rules.max !== undefined && value > rules.max) errors.push(`${key}: above maximum ${rules.max}`);
        }
        if (rules.validate && !rules.validate(value)) {
          errors.push(`${key}: validation failed`);
          continue;
        }
      }

      result[key] = value;
    }

    return { valid: errors.length === 0, errors, config: result };
  };

  const dbSchema: ConfigSchema = {
    host: { type: 'string', required: true },
    port: { type: 'number', required: true, default: 5432, min: 1, max: 65535 },
    database: { type: 'string', required: true },
    poolSize: { type: 'number', required: false, default: 10, min: 1, max: 100 },
    ssl: { type: 'boolean', required: false, default: false },
  };

  it('should validate correct config', () => {
    const result = validateConfig(
      { host: 'localhost', port: 5432, database: 'stocks' },
      dbSchema
    );
    expect(result.valid).toBe(true);
    expect(result.config.host).toBe('localhost');
  });

  it('should apply defaults', () => {
    const result = validateConfig(
      { host: 'localhost', database: 'stocks' },
      dbSchema
    );
    expect(result.config.port).toBe(5432);
    expect(result.config.poolSize).toBe(10);
  });

  it('should reject missing required without default', () => {
    const result = validateConfig({ port: 5432 }, dbSchema);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('host'))).toBe(true);
  });

  it('should validate number ranges', () => {
    const result = validateConfig(
      { host: 'localhost', port: 70000, database: 'x' },
      dbSchema
    );
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('above maximum'))).toBe(true);
  });

  it('should validate with custom validator', () => {
    const schema: ConfigSchema = {
      email: { type: 'string', required: true, validate: (v) => v.includes('@') },
    };
    expect(validateConfig({ email: 'test@example.com' }, schema).valid).toBe(true);
    expect(validateConfig({ email: 'invalid' }, schema).valid).toBe(false);
  });
});

// Health Check Aggregation Tests
describe('Health Check Aggregation', () => {
  type HealthStatus = 'healthy' | 'degraded' | 'unhealthy';

  interface ServiceHealth {
    name: string;
    status: HealthStatus;
    latencyMs: number;
    lastCheck: number;
  }

  const aggregateHealth = (services: ServiceHealth[]): {
    overall: HealthStatus;
    score: number;
    services: Record<string, { status: HealthStatus; latency: number }>;
  } => {
    const unhealthy = services.filter(s => s.status === 'unhealthy').length;
    const degraded = services.filter(s => s.status === 'degraded').length;
    const total = services.length;

    let overall: HealthStatus;
    if (unhealthy > 0) overall = 'unhealthy';
    else if (degraded > 0) overall = 'degraded';
    else overall = 'healthy';

    const score = total > 0 ? Math.round(((total - unhealthy - degraded * 0.5) / total) * 100) : 100;

    const servicesMap: Record<string, { status: HealthStatus; latency: number }> = {};
    for (const s of services) {
      servicesMap[s.name] = { status: s.status, latency: s.latencyMs };
    }

    return { overall, score, services: servicesMap };
  };

  it('should report healthy when all healthy', () => {
    const result = aggregateHealth([
      { name: 'db', status: 'healthy', latencyMs: 5, lastCheck: 0 },
      { name: 'cache', status: 'healthy', latencyMs: 1, lastCheck: 0 },
    ]);
    expect(result.overall).toBe('healthy');
    expect(result.score).toBe(100);
  });

  it('should report degraded', () => {
    const result = aggregateHealth([
      { name: 'db', status: 'healthy', latencyMs: 5, lastCheck: 0 },
      { name: 'cache', status: 'degraded', latencyMs: 500, lastCheck: 0 },
    ]);
    expect(result.overall).toBe('degraded');
    expect(result.score).toBe(75);
  });

  it('should report unhealthy if any unhealthy', () => {
    const result = aggregateHealth([
      { name: 'db', status: 'unhealthy', latencyMs: -1, lastCheck: 0 },
      { name: 'cache', status: 'healthy', latencyMs: 1, lastCheck: 0 },
    ]);
    expect(result.overall).toBe('unhealthy');
  });

  it('should handle empty services', () => {
    const result = aggregateHealth([]);
    expect(result.overall).toBe('healthy');
    expect(result.score).toBe(100);
  });
});
