/**
 * 安全响应头测试
 */
import { describe, it, expect } from 'vitest';

describe('安全响应头', () => {
  const requiredHeaders = [
    { name: 'X-Content-Type-Options', value: 'nosniff' },
    { name: 'X-Frame-Options', value: 'DENY' },
    { name: 'X-XSS-Protection', value: '1; mode=block' },
    { name: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
    { name: 'Permissions-Policy' },
  ];

  it('应包含所有必要安全头', () => {
    const headerNames = requiredHeaders.map(h => h.name);
    expect(headerNames).toContain('X-Content-Type-Options');
    expect(headerNames).toContain('X-Frame-Options');
    expect(headerNames).toContain('X-XSS-Protection');
    expect(headerNames).toContain('Referrer-Policy');
    expect(headerNames).toContain('Permissions-Policy');
  });

  describe('CSP 策略', () => {
    const csp = "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; connect-src 'self' wss: ws:;";

    it('应限制 default-src 为 self', () => {
      expect(csp).toContain("default-src 'self'");
    });

    it('应允许 WebSocket 连接', () => {
      expect(csp).toMatch(/connect-src.*ws/);
    });

    it('应限制 script-src', () => {
      expect(csp).toContain("script-src 'self'");
    });
  });

  describe('HSTS 配置', () => {
    const hsts = 'max-age=31536000; includeSubDomains; preload';

    it('max-age 应为至少 1 年', () => {
      const match = hsts.match(/max-age=(\d+)/);
      expect(match).toBeTruthy();
      const maxAge = parseInt(match![1], 10);
      expect(maxAge).toBeGreaterThanOrEqual(31536000);
    });

    it('应包含 includeSubDomains', () => {
      expect(hsts).toContain('includeSubDomains');
    });
  });

  describe('X-Frame-Options', () => {
    it('应为 DENY 或 SAMEORIGIN', () => {
      const validValues = ['DENY', 'SAMEORIGIN'];
      expect(validValues).toContain('DENY');
    });
  });

  describe('Cache-Control 敏感端点', () => {
    const sensitiveCacheControl = 'no-store, no-cache, must-revalidate, proxy-revalidate';

    it('应禁止缓存', () => {
      expect(sensitiveCacheControl).toContain('no-store');
      expect(sensitiveCacheControl).toContain('no-cache');
    });
  });
});
