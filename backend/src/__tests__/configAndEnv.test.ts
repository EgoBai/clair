import { describe, it, expect } from 'vitest';

// 配置与环境测试 - 环境变量解析、配置合并、默认值

interface AppConfig {
  server: {
    port: number;
    host: string;
    cors: {
      origins: string[];
      credentials: boolean;
    };
  };
  database: {
    host: string;
    port: number;
    name: string;
    poolMin: number;
    poolMax: number;
  };
  cache: {
    ttl: number;
    maxSize: number;
    strategy: 'lru' | 'fifo' | 'lfu';
  };
  rateLimit: {
    windowMs: number;
    maxRequests: number;
    whitelist: string[];
  };
  log: {
    level: 'debug' | 'info' | 'warn' | 'error';
    format: 'json' | 'text';
    file?: string;
  };
}

const defaults: AppConfig = {
  server: { port: 3000, host: '0.0.0.0', cors: { origins: ['http://localhost:5173'], credentials: true } },
  database: { host: 'localhost', port: 5432, name: 'a_stock', poolMin: 2, poolMax: 10 },
  cache: { ttl: 30, maxSize: 1000, strategy: 'lru' },
  rateLimit: { windowMs: 60000, maxRequests: 120, whitelist: [] },
  log: { level: 'info', format: 'text' },
};

function parseEnvInt(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const parsed = parseInt(value, 10);
  return isNaN(parsed) ? fallback : parsed;
}

function parseEnvFloat(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const parsed = parseFloat(value);
  return isNaN(parsed) ? fallback : parsed;
}

function parseEnvBool(value: string | undefined, fallback: boolean): boolean {
  if (!value) return fallback;
  return value.toLowerCase() === 'true' || value === '1';
}

function parseEnvList(value: string | undefined, separator: string = ','): string[] {
  if (!value) return [];
  return value.split(separator).map(s => s.trim()).filter(Boolean);
}

function mergeConfig(base: AppConfig, overrides: Partial<AppConfig>): AppConfig {
  const result = JSON.parse(JSON.stringify(base));
  function merge(target: any, source: any): void {
    for (const key of Object.keys(source)) {
      if (source[key] !== undefined && source[key] !== null) {
        if (typeof source[key] === 'object' && !Array.isArray(source[key]) && typeof target[key] === 'object') {
          merge(target[key], source[key]);
        } else {
          target[key] = source[key];
        }
      }
    }
  }
  merge(result, overrides);
  return result;
}

function loadConfigFromEnv(env: Record<string, string | undefined>): AppConfig {
  return mergeConfig(defaults, {
    server: {
      port: parseEnvInt(env.PORT, defaults.server.port),
      host: env.HOST || defaults.server.host,
      cors: {
        origins: parseEnvList(env.CORS_ORIGINS) || defaults.server.cors.origins,
        credentials: parseEnvBool(env.CORS_CREDENTIALS, defaults.server.cors.credentials),
      },
    },
    database: {
      host: env.DB_HOST || defaults.database.host,
      port: parseEnvInt(env.DB_PORT, defaults.database.port),
      name: env.DB_NAME || defaults.database.name,
      poolMin: parseEnvInt(env.DB_POOL_MIN, defaults.database.poolMin),
      poolMax: parseEnvInt(env.DB_POOL_MAX, defaults.database.poolMax),
    },
    cache: {
      ttl: parseEnvInt(env.CACHE_TTL, defaults.cache.ttl),
      maxSize: parseEnvInt(env.CACHE_MAX_SIZE, defaults.cache.maxSize),
      strategy: (env.CACHE_STRATEGY as any) || defaults.cache.strategy,
    },
    log: {
      level: (env.LOG_LEVEL as any) || defaults.log.level,
      format: (env.LOG_FORMAT as any) || defaults.log.format,
      file: env.LOG_FILE,
    },
  });
}

function validateConfig(config: AppConfig): string[] {
  const errors: string[] = [];
  if (config.server.port < 1 || config.server.port > 65535) errors.push('invalid port');
  if (config.database.poolMin < 0) errors.push('poolMin must be >= 0');
  if (config.database.poolMax < config.database.poolMin) errors.push('poolMax must be >= poolMin');
  if (config.cache.ttl < 0) errors.push('cache ttl must be >= 0');
  if (config.cache.maxSize < 1) errors.push('cache maxSize must be >= 1');
  if (!['lru', 'fifo', 'lfu'].includes(config.cache.strategy)) errors.push('invalid cache strategy');
  if (config.rateLimit.windowMs < 1000) errors.push('rateLimit windowMs must be >= 1000');
  if (config.rateLimit.maxRequests < 1) errors.push('rateLimit maxRequests must be >= 1');
  if (!['debug', 'info', 'warn', 'error'].includes(config.log.level)) errors.push('invalid log level');
  if (!['json', 'text'].includes(config.log.format)) errors.push('invalid log format');
  return errors;
}

describe('配置与环境测试', () => {
  describe('环境变量解析', () => {
    it('整数解析', () => {
      expect(parseEnvInt('3000', 0)).toBe(3000);
      expect(parseEnvInt(undefined, 8080)).toBe(8080);
      expect(parseEnvInt('abc', 42)).toBe(42);
      expect(parseEnvInt('', 99)).toBe(99);
    });

    it('浮点数解析', () => {
      expect(parseEnvFloat('3.14', 0)).toBe(3.14);
      expect(parseEnvFloat(undefined, 1.0)).toBe(1.0);
      expect(parseEnvFloat('invalid', 2.5)).toBe(2.5);
    });

    it('布尔解析', () => {
      expect(parseEnvBool('true', false)).toBe(true);
      expect(parseEnvBool('TRUE', false)).toBe(true);
      expect(parseEnvBool('1', false)).toBe(true);
      expect(parseEnvBool('false', true)).toBe(false);
      expect(parseEnvBool(undefined, true)).toBe(true);
      expect(parseEnvBool('yes', false)).toBe(false);
    });

    it('列表解析', () => {
      expect(parseEnvList('a,b,c')).toEqual(['a', 'b', 'c']);
      expect(parseEnvList(' a , b , c ')).toEqual(['a', 'b', 'c']);
      expect(parseEnvList(undefined)).toEqual([]);
      expect(parseEnvList('')).toEqual([]);
      expect(parseEnvList('a;b;c', ';')).toEqual(['a', 'b', 'c']);
    });
  });

  describe('配置合并', () => {
    it('覆盖端口', () => {
      const config = mergeConfig(defaults, { server: { ...defaults.server, port: 8080 } });
      expect(config.server.port).toBe(8080);
      expect(config.server.host).toBe('0.0.0.0');
    });

    it('嵌套合并', () => {
      const config = mergeConfig(defaults, {
        database: { ...defaults.database, host: 'remote.db', port: 5433 },
      });
      expect(config.database.host).toBe('remote.db');
      expect(config.database.port).toBe(5433);
      expect(config.database.name).toBe('a_stock');
    });

    it('空覆盖不变', () => {
      const config = mergeConfig(defaults, {});
      expect(config).toEqual(defaults);
    });
  });

  describe('从环境加载', () => {
    it('默认值', () => {
      const config = loadConfigFromEnv({});
      expect(config.server.port).toBe(3000);
      expect(config.database.host).toBe('localhost');
    });

    it('环境覆盖', () => {
      const config = loadConfigFromEnv({
        PORT: '8080',
        DB_HOST: 'prod.db.example.com',
        CACHE_TTL: '300',
        LOG_LEVEL: 'warn',
      });
      expect(config.server.port).toBe(8080);
      expect(config.database.host).toBe('prod.db.example.com');
      expect(config.cache.ttl).toBe(300);
      expect(config.log.level).toBe('warn');
    });
  });

  describe('配置验证', () => {
    it('有效配置', () => {
      expect(validateConfig(defaults)).toEqual([]);
    });

    it('无效端口', () => {
      const config = { ...defaults, server: { ...defaults.server, port: 0 } };
      expect(validateConfig(config)).toContain('invalid port');
    });

    it('池配置错误', () => {
      const config = { ...defaults, database: { ...defaults.database, poolMin: 10, poolMax: 5 } };
      const errors = validateConfig(config);
      expect(errors).toContain('poolMax must be >= poolMin');
    });

    it('无效缓存策略', () => {
      const config = { ...defaults, cache: { ...defaults.cache, strategy: 'invalid' as any } };
      expect(validateConfig(config)).toContain('invalid cache strategy');
    });

    it('负TTL', () => {
      const config = { ...defaults, cache: { ...defaults.cache, ttl: -1 } };
      expect(validateConfig(config)).toContain('cache ttl must be >= 0');
    });

    it('多个错误', () => {
      const config: AppConfig = {
        server: { port: -1, host: '', cors: { origins: [], credentials: false } },
        database: { host: '', port: 0, name: '', poolMin: -1, poolMax: -2 },
        cache: { ttl: -1, maxSize: 0, strategy: 'bad' as any },
        rateLimit: { windowMs: 100, maxRequests: 0, whitelist: [] },
        log: { level: 'bad' as any, format: 'bad' as any },
      };
      const errors = validateConfig(config);
      expect(errors.length).toBeGreaterThanOrEqual(5);
    });
  });
});
