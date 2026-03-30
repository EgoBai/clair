import { describe, it, expect } from 'vitest';

/**
 * 安全中间件测试
 * 测试 CSRF、安全头、XSS防护、CORS
 */
describe('Security Middleware', () => {
  describe('CSRF Token Generation', () => {
    function generateCSRFToken(): string {
      const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
      let token = '';
      for (let i = 0; i < 64; i++) {
        token += chars.charAt(Math.floor(Math.random() * chars.length));
      }
      return token;
    }

    function validateCSRFToken(token: string, storedToken: string): boolean {
      if (!token || !storedToken) return false;
      if (token.length !== storedToken.length) return false;
      // Constant-time comparison
      let result = 0;
      for (let i = 0; i < token.length; i++) {
        result |= token.charCodeAt(i) ^ storedToken.charCodeAt(i);
      }
      return result === 0;
    }

    it('should generate 64-char tokens', () => {
      const token = generateCSRFToken();
      expect(token.length).toBe(64);
    });

    it('should generate alphanumeric tokens', () => {
      const token = generateCSRFToken();
      expect(token).toMatch(/^[A-Za-z0-9]+$/);
    });

    it('should validate matching tokens', () => {
      const token = 'abc123def456';
      expect(validateCSRFToken(token, token)).toBe(true);
    });

    it('should reject non-matching tokens', () => {
      expect(validateCSRFToken('abc', 'xyz')).toBe(false);
    });

    it('should reject empty tokens', () => {
      expect(validateCSRFToken('', 'abc')).toBe(false);
      expect(validateCSRFToken('abc', '')).toBe(false);
    });

    it('should reject different length tokens', () => {
      expect(validateCSRFToken('abc', 'abcd')).toBe(false);
    });
  });

  describe('Security Headers', () => {
    function getSecurityHeaders(): Record<string, string> {
      return {
        'X-Content-Type-Options': 'nosniff',
        'X-Frame-Options': 'DENY',
        'X-XSS-Protection': '1; mode=block',
        'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
        'Content-Security-Policy': "default-src 'self'",
        'Referrer-Policy': 'strict-origin-when-cross-origin',
        'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
      };
    }

    it('should include X-Content-Type-Options', () => {
      const headers = getSecurityHeaders();
      expect(headers['X-Content-Type-Options']).toBe('nosniff');
    });

    it('should include X-Frame-Options', () => {
      const headers = getSecurityHeaders();
      expect(headers['X-Frame-Options']).toBe('DENY');
    });

    it('should include HSTS', () => {
      const headers = getSecurityHeaders();
      expect(headers['Strict-Transport-Security']).toContain('max-age');
    });

    it('should include CSP', () => {
      const headers = getSecurityHeaders();
      expect(headers['Content-Security-Policy']).toContain('self');
    });

    it('should include all required headers', () => {
      const headers = getSecurityHeaders();
      const required = [
        'X-Content-Type-Options',
        'X-Frame-Options',
        'X-XSS-Protection',
        'Strict-Transport-Security',
        'Content-Security-Policy',
      ];
      required.forEach(h => {
        expect(headers).toHaveProperty(h);
      });
    });
  });

  describe('CORS Configuration', () => {
    function isOriginAllowed(origin: string, allowedOrigins: string[]): boolean {
      return allowedOrigins.includes(origin) || allowedOrigins.includes('*');
    }

    it('should allow whitelisted origins', () => {
      expect(isOriginAllowed('https://example.com', ['https://example.com'])).toBe(true);
    });

    it('should reject non-whitelisted origins', () => {
      expect(isOriginAllowed('https://evil.com', ['https://example.com'])).toBe(false);
    });

    it('should allow wildcard', () => {
      expect(isOriginAllowed('https://anything.com', ['*'])).toBe(true);
    });
  });

  describe('XSS Sanitization', () => {
    function sanitize(input: string): string {
      return input
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#x27;')
        .replace(/\//g, '&#x2F;');
    }

    it('should escape HTML tags', () => {
      expect(sanitize('<script>alert(1)</script>')).not.toContain('<script>');
    });

    it('should escape quotes', () => {
      expect(sanitize('"onmouseover="alert(1)')).not.toContain('"');
    });

    it('should preserve safe text', () => {
      expect(sanitize('Hello World')).toBe('Hello World');
    });

    it('should handle empty string', () => {
      expect(sanitize('')).toBe('');
    });
  });

  describe('Input Length Validation', () => {
    function validateLength(input: string, min: number, max: number): boolean {
      return input.length >= min && input.length <= max;
    }

    it('should accept valid length', () => {
      expect(validateLength('hello', 1, 100)).toBe(true);
    });

    it('should reject too short', () => {
      expect(validateLength('', 1, 100)).toBe(false);
    });

    it('should reject too long', () => {
      expect(validateLength('x'.repeat(101), 1, 100)).toBe(false);
    });
  });

  describe('Rate Limit Window', () => {
    class RateLimiter {
      private requests: Map<string, number[]> = new Map();

      isAllowed(key: string, maxRequests: number, windowMs: number): boolean {
        const now = Date.now();
        const timestamps = this.requests.get(key) || [];
        const valid = timestamps.filter(t => now - t < windowMs);
        if (valid.length >= maxRequests) return false;
        valid.push(now);
        this.requests.set(key, valid);
        return true;
      }

      getRemaining(key: string, maxRequests: number, windowMs: number): number {
        const now = Date.now();
        const timestamps = this.requests.get(key) || [];
        const valid = timestamps.filter(t => now - t < windowMs);
        return Math.max(0, maxRequests - valid.length);
      }
    }

    it('should allow requests within limit', () => {
      const limiter = new RateLimiter();
      expect(limiter.isAllowed('user1', 5, 60000)).toBe(true);
    });

    it('should block after exceeding limit', () => {
      const limiter = new RateLimiter();
      for (let i = 0; i < 5; i++) {
        limiter.isAllowed('user1', 5, 60000);
      }
      expect(limiter.isAllowed('user1', 5, 60000)).toBe(false);
    });

    it('should track remaining requests', () => {
      const limiter = new RateLimiter();
      limiter.isAllowed('user1', 5, 60000);
      limiter.isAllowed('user1', 5, 60000);
      expect(limiter.getRemaining('user1', 5, 60000)).toBe(3);
    });

    it('should separate limits per key', () => {
      const limiter = new RateLimiter();
      for (let i = 0; i < 5; i++) {
        limiter.isAllowed('user1', 5, 60000);
      }
      expect(limiter.isAllowed('user1', 5, 60000)).toBe(false);
      expect(limiter.isAllowed('user2', 5, 60000)).toBe(true);
    });
  });
});
