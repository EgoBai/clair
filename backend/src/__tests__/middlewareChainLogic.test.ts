import { describe, it, expect } from 'vitest';

/**
 * 中间件链逻辑测试
 * API Middleware Chain 验证/鉴权/限流/CORS
 */

type MiddlewareType = 'auth' | 'rateLimit' | 'cors' | 'validation' | 'logging' | 'compression' | 'cache';

interface MiddlewareConfig {
  type: MiddlewareType;
  enabled: boolean;
  order: number;
  options?: Record<string, any>;
}

interface RateLimitConfig {
  windowMs: number;
  maxRequests: number;
  keyGenerator: string; // 'ip' | 'user' | 'custom'
}

interface CORSConfig {
  origins: string[];
  methods: string[];
  allowHeaders: string[];
  exposeHeaders: string[];
  credentials: boolean;
  maxAge: number;
}

interface ValidationRule {
  field: string;
  type: 'string' | 'number' | 'boolean' | 'array' | 'object';
  required: boolean;
  min?: number;
  max?: number;
  pattern?: string;
}

function sortMiddlewareByOrder(configs: MiddlewareConfig[]): MiddlewareConfig[] {
  return [...configs]
    .filter(c => c.enabled)
    .sort((a, b) => a.order - b.order);
}

function buildMiddlewareChain(configs: MiddlewareConfig[]): MiddlewareType[] {
  return sortMiddlewareByOrder(configs).map(c => c.type);
}

function validateCORSConfig(config: CORSConfig): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  if (config.origins.length === 0) errors.push('At least one origin required');
  if (config.methods.length === 0) errors.push('At least one method required');
  for (const method of config.methods) {
    if (!['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS', 'HEAD'].includes(method)) {
      errors.push(`Invalid method: ${method}`);
    }
  }
  if (config.credentials && config.origins.includes('*')) {
    errors.push('Cannot use wildcard origin with credentials');
  }
  return { valid: errors.length === 0, errors };
}

function isOriginAllowed(origin: string, allowedOrigins: string[]): boolean {
  if (allowedOrigins.includes('*')) return true;
  return allowedOrigins.includes(origin);
}

function buildCORSHeaders(
  origin: string,
  config: CORSConfig
): Record<string, string> {
  const headers: Record<string, string> = {};

  if (isOriginAllowed(origin, config.origins)) {
    headers['Access-Control-Allow-Origin'] = config.origins.includes('*') ? '*' : origin;
  }

  headers['Access-Control-Allow-Methods'] = config.methods.join(', ');
  headers['Access-Control-Allow-Headers'] = config.allowHeaders.join(', ');

  if (config.exposeHeaders.length > 0) {
    headers['Access-Control-Expose-Headers'] = config.exposeHeaders.join(', ');
  }

  if (config.credentials) {
    headers['Access-Control-Allow-Credentials'] = 'true';
  }

  if (config.maxAge > 0) {
    headers['Access-Control-Max-Age'] = String(config.maxAge);
  }

  return headers;
}

function createRateLimiterState(): {
  check: (key: string, now: number, config: RateLimitConfig) => { allowed: boolean; remaining: number; resetAt: number };
  clear: () => void;
} {
  const windows = new Map<string, { count: number; start: number }>();

  return {
    check(key: string, now: number, config: RateLimitConfig) {
      let window = windows.get(key);
      if (!window || now - window.start >= config.windowMs) {
        window = { count: 0, start: now };
        windows.set(key, window);
      }

      window.count++;
      const allowed = window.count <= config.maxRequests;
      return {
        allowed,
        remaining: Math.max(0, config.maxRequests - window.count),
        resetAt: window.start + config.windowMs,
      };
    },
    clear() {
      windows.clear();
    },
  };
}

function validateRequestBody(body: any, rules: ValidationRule[]): {
  valid: boolean;
  errors: Array<{ field: string; message: string }>;
} {
  const errors: Array<{ field: string; message: string }> = [];

  for (const rule of rules) {
    const value = body?.[rule.field];

    if (rule.required && (value === undefined || value === null)) {
      errors.push({ field: rule.field, message: `${rule.field} is required` });
      continue;
    }

    if (value === undefined || value === null) continue;

    const actualType = Array.isArray(value) ? 'array' : typeof value;
    if (actualType !== rule.type) {
      errors.push({ field: rule.field, message: `${rule.field} must be ${rule.type}` });
      continue;
    }

    if (rule.type === 'string' && rule.min !== undefined && value.length < rule.min) {
      errors.push({ field: rule.field, message: `${rule.field} must be at least ${rule.min} characters` });
    }

    if (rule.type === 'string' && rule.max !== undefined && value.length > rule.max) {
      errors.push({ field: rule.field, message: `${rule.field} must be at most ${rule.max} characters` });
    }

    if (rule.type === 'number' && rule.min !== undefined && value < rule.min) {
      errors.push({ field: rule.field, message: `${rule.field} must be >= ${rule.min}` });
    }

    if (rule.type === 'number' && rule.max !== undefined && value > rule.max) {
      errors.push({ field: rule.field, message: `${rule.field} must be <= ${rule.max}` });
    }

    if (rule.pattern && typeof value === 'string') {
      const regex = new RegExp(rule.pattern);
      if (!regex.test(value)) {
        errors.push({ field: rule.field, message: `${rule.field} format invalid` });
      }
    }
  }

  return { valid: errors.length === 0, errors };
}

function buildRateLimitKey(type: string, ip: string, userId?: string): string {
  switch (type) {
    case 'ip': return `rate:${ip}`;
    case 'user': return userId ? `rate:user:${userId}` : `rate:${ip}`;
    default: return `rate:${ip}`;
  }
}

function shouldCompress(contentType: string, contentLength: number): boolean {
  const compressible = ['text/', 'application/json', 'application/javascript', 'application/xml'];
  return contentLength > 1024 && compressible.some(t => contentType.startsWith(t));
}

function calcCompressionRatio(original: number, compressed: number): number {
  if (original === 0) return 0;
  return 1 - (compressed / original);
}

describe('中间件链逻辑', () => {
  describe('sortMiddlewareByOrder', () => {
    it('should sort by order', () => {
      const configs: MiddlewareConfig[] = [
        { type: 'cors', enabled: true, order: 3 },
        { type: 'auth', enabled: true, order: 1 },
        { type: 'rateLimit', enabled: true, order: 2 },
      ];
      const sorted = sortMiddlewareByOrder(configs);
      expect(sorted[0].type).toBe('auth');
      expect(sorted[1].type).toBe('rateLimit');
      expect(sorted[2].type).toBe('cors');
    });

    it('should filter disabled', () => {
      const configs: MiddlewareConfig[] = [
        { type: 'auth', enabled: true, order: 1 },
        { type: 'cors', enabled: false, order: 2 },
      ];
      expect(sortMiddlewareByOrder(configs)).toHaveLength(1);
    });
  });

  describe('buildMiddlewareChain', () => {
    it('should return ordered types', () => {
      const configs: MiddlewareConfig[] = [
        { type: 'logging', enabled: true, order: 1 },
        { type: 'cors', enabled: true, order: 2 },
        { type: 'auth', enabled: true, order: 3 },
      ];
      expect(buildMiddlewareChain(configs)).toEqual(['logging', 'cors', 'auth']);
    });
  });

  describe('validateCORSConfig', () => {
    it('should validate correct config', () => {
      const config: CORSConfig = {
        origins: ['http://localhost:3000'],
        methods: ['GET', 'POST'],
        allowHeaders: ['Content-Type'],
        exposeHeaders: [],
        credentials: false,
        maxAge: 3600,
      };
      expect(validateCORSConfig(config).valid).toBe(true);
    });

    it('should reject empty origins', () => {
      const config: CORSConfig = {
        origins: [], methods: ['GET'], allowHeaders: [], exposeHeaders: [], credentials: false, maxAge: 0,
      };
      expect(validateCORSConfig(config).valid).toBe(false);
    });

    it('should reject wildcard with credentials', () => {
      const config: CORSConfig = {
        origins: ['*'], methods: ['GET'], allowHeaders: [], exposeHeaders: [], credentials: true, maxAge: 0,
      };
      expect(validateCORSConfig(config).valid).toBe(false);
    });
  });

  describe('isOriginAllowed', () => {
    it('should allow wildcard', () => {
      expect(isOriginAllowed('http://evil.com', ['*'])).toBe(true);
    });

    it('should check exact match', () => {
      expect(isOriginAllowed('http://localhost:3000', ['http://localhost:3000'])).toBe(true);
      expect(isOriginAllowed('http://evil.com', ['http://localhost:3000'])).toBe(false);
    });
  });

  describe('buildCORSHeaders', () => {
    it('should build headers', () => {
      const config: CORSConfig = {
        origins: ['http://localhost:3000'],
        methods: ['GET', 'POST'],
        allowHeaders: ['Content-Type'],
        exposeHeaders: [],
        credentials: true,
        maxAge: 3600,
      };
      const headers = buildCORSHeaders('http://localhost:3000', config);
      expect(headers['Access-Control-Allow-Origin']).toBe('http://localhost:3000');
      expect(headers['Access-Control-Allow-Credentials']).toBe('true');
    });
  });

  describe('createRateLimiterState', () => {
    it('should allow within limit', () => {
      const limiter = createRateLimiterState();
      const config: RateLimitConfig = { windowMs: 60000, maxRequests: 5, keyGenerator: 'ip' };
      const result = limiter.check('127.0.0.1', 1000, config);
      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(4);
    });

    it('should deny at limit', () => {
      const limiter = createRateLimiterState();
      const config: RateLimitConfig = { windowMs: 60000, maxRequests: 2, keyGenerator: 'ip' };
      limiter.check('127.0.0.1', 1000, config);
      limiter.check('127.0.0.1', 1000, config);
      const result = limiter.check('127.0.0.1', 1000, config);
      expect(result.allowed).toBe(false);
      expect(result.remaining).toBe(0);
    });

    it('should reset after window', () => {
      const limiter = createRateLimiterState();
      const config: RateLimitConfig = { windowMs: 1000, maxRequests: 1, keyGenerator: 'ip' };
      limiter.check('ip', 1000, config);
      const result = limiter.check('ip', 2001, config);
      expect(result.allowed).toBe(true);
    });
  });

  describe('validateRequestBody', () => {
    it('should pass valid body', () => {
      const rules: ValidationRule[] = [
        { field: 'name', type: 'string', required: true, min: 1, max: 100 },
        { field: 'age', type: 'number', required: false, min: 0 },
      ];
      const result = validateRequestBody({ name: 'test', age: 25 }, rules);
      expect(result.valid).toBe(true);
    });

    it('should fail on missing required', () => {
      const rules: ValidationRule[] = [{ field: 'name', type: 'string', required: true }];
      const result = validateRequestBody({}, rules);
      expect(result.valid).toBe(false);
    });

    it('should fail on wrong type', () => {
      const rules: ValidationRule[] = [{ field: 'age', type: 'number', required: true }];
      const result = validateRequestBody({ age: 'abc' }, rules);
      expect(result.valid).toBe(false);
    });

    it('should check min/max for strings', () => {
      const rules: ValidationRule[] = [{ field: 'name', type: 'string', required: true, min: 3, max: 5 }];
      expect(validateRequestBody({ name: 'ab' }, rules).valid).toBe(false);
      expect(validateRequestBody({ name: 'abcdef' }, rules).valid).toBe(false);
      expect(validateRequestBody({ name: 'abcd' }, rules).valid).toBe(true);
    });

    it('should check pattern', () => {
      const rules: ValidationRule[] = [{ field: 'email', type: 'string', required: true, pattern: '^.+@.+$' }];
      expect(validateRequestBody({ email: 'test@example.com' }, rules).valid).toBe(true);
      expect(validateRequestBody({ email: 'invalid' }, rules).valid).toBe(false);
    });
  });

  describe('buildRateLimitKey', () => {
    it('should build IP key', () => {
      expect(buildRateLimitKey('ip', '127.0.0.1')).toBe('rate:127.0.0.1');
    });

    it('should build user key', () => {
      expect(buildRateLimitKey('user', '127.0.0.1', 'u1')).toBe('rate:user:u1');
    });

    it('should fall back to IP for user key without userId', () => {
      expect(buildRateLimitKey('user', '127.0.0.1')).toBe('rate:127.0.0.1');
    });
  });

  describe('shouldCompress', () => {
    it('should compress text content', () => {
      expect(shouldCompress('text/html', 2048)).toBe(true);
      expect(shouldCompress('application/json', 2048)).toBe(true);
    });

    it('should not compress small content', () => {
      expect(shouldCompress('text/html', 100)).toBe(false);
    });

    it('should not compress images', () => {
      expect(shouldCompress('image/png', 2048)).toBe(false);
    });
  });

  describe('calcCompressionRatio', () => {
    it('should calculate ratio', () => {
      expect(calcCompressionRatio(1000, 300)).toBeCloseTo(0.7);
    });

    it('should handle zero original', () => {
      expect(calcCompressionRatio(0, 0)).toBe(0);
    });
  });
});
