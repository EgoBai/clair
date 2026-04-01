import { describe, it, expect } from 'vitest';

/**
 * 安全逻辑测试
 * 输入消毒/XSS防护/权限检查/频率限制
 */

function sanitizeHTML(input: string): string {
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;');
}

function validateCSRFToken(token: string, expected: string): boolean {
  if (token.length !== expected.length) return false;
  let result = 0;
  for (let i = 0; i < token.length; i++) {
    result |= token.charCodeAt(i) ^ expected.charCodeAt(i);
  }
  return result === 0;
}

function generateCSRFToken(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let token = '';
  for (let i = 0; i < 32; i++) {
    token += chars[Math.floor(Math.random() * chars.length)];
  }
  return token;
}

interface RateLimitEntry { count: number; windowStart: number; blocked: boolean; }

class IPBlocker {
  private limits = new Map<string, RateLimitEntry>();
  private maxRequests: number;
  private windowMs: number;
  private blockDurationMs: number;

  constructor(maxRequests = 100, windowMs = 60000, blockDurationMs = 300000) {
    this.maxRequests = maxRequests;
    this.windowMs = windowMs;
    this.blockDurationMs = blockDurationMs;
  }

  check(ip: string, now: number): { allowed: boolean; remaining: number; retryAfter?: number } {
    const entry = this.limits.get(ip);
    if (!entry) {
      this.limits.set(ip, { count: 1, windowStart: now, blocked: false });
      return { allowed: true, remaining: this.maxRequests - 1 };
    }
    if (entry.blocked) {
      if (now - entry.windowStart > this.blockDurationMs) {
        this.limits.set(ip, { count: 1, windowStart: now, blocked: false });
        return { allowed: true, remaining: this.maxRequests - 1 };
      }
      return { allowed: false, remaining: 0, retryAfter: this.blockDurationMs - (now - entry.windowStart) };
    }
    if (now - entry.windowStart > this.windowMs) {
      entry.count = 1;
      entry.windowStart = now;
      return { allowed: true, remaining: this.maxRequests - 1 };
    }
    entry.count++;
    if (entry.count > this.maxRequests) {
      entry.blocked = true;
      entry.windowStart = now;
      return { allowed: false, remaining: 0, retryAfter: this.blockDurationMs };
    }
    return { allowed: true, remaining: this.maxRequests - entry.count };
  }
}

function hasPermission(userRoles: string[], requiredRole: string): boolean {
  const hierarchy: Record<string, number> = { admin: 100, moderator: 50, user: 10, guest: 0 };
  const userLevel = Math.max(...userRoles.map(r => hierarchy[r] ?? 0));
  return userLevel >= (hierarchy[requiredRole] ?? 0);
}

function maskSensitiveData(data: string, type: 'phone' | 'email' | 'idcard'): string {
  switch (type) {
    case 'phone': return data.replace(/(\d{3})\d{4}(\d{4})/, '$1****$2');
    case 'email': return data.replace(/^(.{1,2})[^@]*@/, '$1***@');
    case 'idcard': return data.replace(/(\d{3})\d{11}(\d{4})/, '$1***********$2');
    default: return data;
  }
}

describe('安全逻辑', () => {
  describe('sanitizeHTML', () => {
    it('should escape script tags', () => {
      expect(sanitizeHTML('<script>alert(1)</script>')).not.toContain('<script>');
    });

    it('should escape all special chars', () => {
      expect(sanitizeHTML('a<b>&"\'')).toBe('a&lt;b&gt;&amp;&quot;&#x27;');
    });

    it('should handle safe text', () => {
      expect(sanitizeHTML('hello world')).toBe('hello world');
    });
  });

  describe('validateCSRFToken', () => {
    it('should match equal tokens', () => {
      expect(validateCSRFToken('abc123', 'abc123')).toBe(true);
    });

    it('should reject different tokens', () => {
      expect(validateCSRFToken('abc123', 'xyz789')).toBe(false);
    });

    it('should reject different lengths', () => {
      expect(validateCSRFToken('abc', 'abcd')).toBe(false);
    });
  });

  describe('generateCSRFToken', () => {
    it('should generate 32 char token', () => {
      expect(generateCSRFToken()).toHaveLength(32);
    });

    it('should generate unique tokens', () => {
      const tokens = new Set(Array.from({ length: 10 }, () => generateCSRFToken()));
      expect(tokens.size).toBeGreaterThan(5);
    });
  });

  describe('IPBlocker', () => {
    it('should allow within limit', () => {
      const blocker = new IPBlocker(5, 60000);
      expect(blocker.check('1.2.3.4', 1000).allowed).toBe(true);
    });

    it('should block after limit', () => {
      const blocker = new IPBlocker(2, 60000);
      blocker.check('1.2.3.4', 1000);
      blocker.check('1.2.3.4', 2000);
      expect(blocker.check('1.2.3.4', 3000).allowed).toBe(false);
    });

    it('should reset after window', () => {
      const blocker = new IPBlocker(1, 1000);
      blocker.check('1.2.3.4', 1000);
      expect(blocker.check('1.2.3.4', 3000).allowed).toBe(true);
    });
  });

  describe('hasPermission', () => {
    it('admin should have all permissions', () => {
      expect(hasPermission(['admin'], 'user')).toBe(true);
      expect(hasPermission(['admin'], 'moderator')).toBe(true);
    });

    it('user should not have admin', () => {
      expect(hasPermission(['user'], 'admin')).toBe(false);
    });

    it('should check multiple roles', () => {
      expect(hasPermission(['user', 'moderator'], 'user')).toBe(true);
    });
  });

  describe('maskSensitiveData', () => {
    it('should mask phone', () => {
      expect(maskSensitiveData('13812345678', 'phone')).toBe('138****5678');
    });

    it('should mask email', () => {
      expect(maskSensitiveData('ab@example.com', 'email')).toBe('ab***@example.com');
    });

    it('should mask idcard', () => {
      expect(maskSensitiveData('110101199001011234', 'idcard')).toBe('110***********1234');
    });
  });
});
