import { describe, it, expect } from 'vitest';
import {
  sanitizeHTML,
  encodeHTML,
  generateCSRFToken,
  maskPhone,
  maskEmail,
  maskIDCard,
  RateLimiter,
} from '../utils/securityEngine';

/**
 * 安全逻辑测试（影子测试迁移）
 *
 * 已迁移到生产实现 frontend/src/utils/securityEngine.ts：
 * sanitizeHTML / encodeHTML / generateCSRFToken / maskPhone / maskEmail / maskIDCard / RateLimiter
 */

/**
 * 未迁移：生产仓没有导出的 CSRF token 比较函数。
 * backend/src/middleware/csrf.ts:91 的 timingSafeEqual 为模块私有，csrfProtection 只能作为
 * Express 中间件使用，无法在单测中直接 import，故保留内联实现。
 */
function validateCSRFToken(token: string, expected: string): boolean {
  if (token.length !== expected.length) return false;
  let result = 0;
  for (let i = 0; i < token.length; i++) {
    result |= token.charCodeAt(i) ^ expected.charCodeAt(i);
  }
  return result === 0;
}

/**
 * 未迁移：生产仓没有“角色等级”权限函数。
 * backend/src/utils/rbacEngine.ts 是资源-动作 RBAC（RBACEngine.checkPermission），
 * 与这里的 admin/moderator/user/guest 等级模型语义不兼容，故保留内联实现。
 */
function hasPermission(userRoles: string[], requiredRole: string): boolean {
  const hierarchy: Record<string, number> = { admin: 100, moderator: 50, user: 10, guest: 0 };
  const userLevel = Math.max(...userRoles.map(r => hierarchy[r] ?? 0));
  return userLevel >= (hierarchy[requiredRole] ?? 0);
}

describe('安全逻辑', () => {
  describe('sanitizeHTML（生产：白名单过滤，不做实体转义）', () => {
    it('should remove script blocks', () => {
      expect(sanitizeHTML('<script>alert(1)</script>')).toBe('');
      expect(sanitizeHTML('<script>alert(1)</script>')).not.toContain('<script>');
    });

    it('should remove non-whitelisted tags and event handlers', () => {
      expect(sanitizeHTML('<img src=x onerror=alert(1)>')).toBe('');
      const sanitized = sanitizeHTML('<p onclick="alert(1)">hi</p>');
      expect(sanitized).not.toContain('onclick');
      expect(sanitized).toContain('hi');
    });

    it('should remove javascript: URL schemes', () => {
      expect(sanitizeHTML('<a href="javascript:alert(1)">x</a>')).not.toContain('javascript:');
    });

    it('should keep whitelisted tags unchanged', () => {
      expect(sanitizeHTML('<b>bold</b>')).toBe('<b>bold</b>');
    });

    it('should not entity-encode text (encodeHTML is separate)', () => {
      expect(sanitizeHTML('a<b>&"\'')).toBe('a<b>&"\'');
    });

    it('should handle safe text', () => {
      expect(sanitizeHTML('hello world')).toBe('hello world');
    });
  });

  describe('encodeHTML', () => {
    it('should escape all special chars', () => {
      expect(encodeHTML('a<b>&"\'')).toBe('a&lt;b&gt;&amp;&quot;&#x27;');
    });
  });

  describe('validateCSRFToken（未迁移）', () => {
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

  describe('generateCSRFToken（生产：crypto 随机 64 位）', () => {
    it('should generate 64 char token', () => {
      expect(generateCSRFToken()).toHaveLength(64);
    });

    it('should generate alphanumeric token', () => {
      expect(generateCSRFToken()).toMatch(/^[A-Za-z0-9]{64}$/);
    });

    it('should generate unique tokens', () => {
      const tokens = new Set(Array.from({ length: 10 }, () => generateCSRFToken()));
      expect(tokens.size).toBeGreaterThan(5);
    });
  });

  describe('RateLimiter（生产：按实例滑动窗口 + 封禁）', () => {
    it('should allow within limit', () => {
      const limiter = new RateLimiter({ maxRequests: 5, windowMs: 60000 });
      const result = limiter.check(1000);
      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(4);
    });

    it('should block after limit', () => {
      const limiter = new RateLimiter({ maxRequests: 2, windowMs: 60000, blockDurationMs: 300000 });
      expect(limiter.check(1000).allowed).toBe(true);
      expect(limiter.check(2000).allowed).toBe(true);
      const blocked = limiter.check(3000);
      expect(blocked.allowed).toBe(false);
      expect(blocked.resetAt).toBe(303000);
    });

    it('should reset after window', () => {
      const limiter = new RateLimiter({ maxRequests: 1, windowMs: 1000 });
      expect(limiter.check(1000).allowed).toBe(true);
      expect(limiter.check(3000).allowed).toBe(true);
    });
  });

  describe('hasPermission（未迁移）', () => {
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

  describe('maskSensitiveData（迁移为生产的 mask* 函数）', () => {
    it('should mask phone', () => {
      expect(maskPhone('13812345678')).toBe('138****5678');
    });

    it('should mask email', () => {
      expect(maskEmail('alice@example.com')).toBe('a***e@example.com');
      // 生产实现对 <=2 位 local part 保持原样
      expect(maskEmail('ab@example.com')).toBe('ab@example.com');
    });

    it('should mask idcard', () => {
      expect(maskIDCard('110101199001011234')).toBe('1101**********1234');
    });
  });
});
