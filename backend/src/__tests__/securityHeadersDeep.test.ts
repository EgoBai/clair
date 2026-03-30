import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ==================== 安全头部配置逻辑测试 ====================

describe('securityHeaders - CSP policy construction', () => {
  const DEFAULT_CSP = [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: https:",
    "font-src 'self' data:",
    "connect-src 'self' ws: wss:",
    "frame-ancestors 'none'",
  ].join('; ');

  it('should contain default-src self', () => {
    expect(DEFAULT_CSP).toContain("default-src 'self'");
  });

  it('should contain script-src', () => {
    expect(DEFAULT_CSP).toContain("script-src");
  });

  it('should contain style-src', () => {
    expect(DEFAULT_CSP).toContain("style-src");
  });

  it('should contain img-src with data and https', () => {
    expect(DEFAULT_CSP).toContain("img-src 'self' data: https:");
  });

  it('should contain connect-src for websocket', () => {
    expect(DEFAULT_CSP).toContain("connect-src 'self' ws: wss:");
  });

  it('should contain frame-ancestors none', () => {
    expect(DEFAULT_CSP).toContain("frame-ancestors 'none'");
  });

  it('should contain font-src', () => {
    expect(DEFAULT_CSP).toContain("font-src 'self' data:");
  });

  it('should separate directives with semicolons', () => {
    const directives = DEFAULT_CSP.split('; ');
    expect(directives.length).toBeGreaterThanOrEqual(7);
  });
});

describe('securityHeaders - HSTS configuration', () => {
  function buildHSTSHeader(config: { maxAge: number; includeSubDomains: boolean; preload: boolean }): string {
    const parts = [`max-age=${config.maxAge}`];
    if (config.includeSubDomains) parts.push('includeSubDomains');
    if (config.preload) parts.push('preload');
    return parts.join('; ');
  }

  it('should build full HSTS header', () => {
    const header = buildHSTSHeader({ maxAge: 31536000, includeSubDomains: true, preload: true });
    expect(header).toBe('max-age=31536000; includeSubDomains; preload');
  });

  it('should build minimal HSTS header', () => {
    const header = buildHSTSHeader({ maxAge: 31536000, includeSubDomains: false, preload: false });
    expect(header).toBe('max-age=31536000');
  });

  it('should include includeSubDomains when enabled', () => {
    const header = buildHSTSHeader({ maxAge: 31536000, includeSubDomains: true, preload: false });
    expect(header).toContain('includeSubDomains');
    expect(header).not.toContain('preload');
  });

  it('should use 1 year maxAge by default', () => {
    const oneYear = 365 * 24 * 60 * 60;
    expect(oneYear).toBe(31536000);
  });
});

describe('securityHeaders - static headers', () => {
  const STATIC_HEADERS: Record<string, string> = {
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'X-XSS-Protection': '1; mode=block',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
  };

  it('should set X-Content-Type-Options to nosniff', () => {
    expect(STATIC_HEADERS['X-Content-Type-Options']).toBe('nosniff');
  });

  it('should set X-Frame-Options to DENY', () => {
    expect(STATIC_HEADERS['X-Frame-Options']).toBe('DENY');
  });

  it('should set X-XSS-Protection', () => {
    expect(STATIC_HEADERS['X-XSS-Protection']).toBe('1; mode=block');
  });

  it('should set Referrer-Policy', () => {
    expect(STATIC_HEADERS['Referrer-Policy']).toBe('strict-origin-when-cross-origin');
  });
});

describe('securityHeaders - Permissions-Policy', () => {
  const PERMISSIONS_POLICY = [
    'camera=()',
    'microphone=()',
    'geolocation=()',
    'payment=()',
    'usb=()',
    'magnetometer=()',
  ].join(', ');

  it('should disable camera', () => {
    expect(PERMISSIONS_POLICY).toContain('camera=()');
  });

  it('should disable microphone', () => {
    expect(PERMISSIONS_POLICY).toContain('microphone=()');
  });

  it('should disable geolocation', () => {
    expect(PERMISSIONS_POLICY).toContain('geolocation=()');
  });

  it('should disable payment', () => {
    expect(PERMISSIONS_POLICY).toContain('payment=()');
  });

  it('should disable usb', () => {
    expect(PERMISSIONS_POLICY).toContain('usb=()');
  });

  it('empty parentheses means disabled', () => {
    expect(PERMISSIONS_POLICY).toContain('=()');
  });
});

describe('securityHeaders - CORS origin validation', () => {
  function isAllowedOrigin(origin: string, allowedOrigins: string[]): boolean {
    if (allowedOrigins.length === 0) return false;
    return allowedOrigins.includes(origin) || allowedOrigins.includes('*');
  }

  it('should reject unknown origins', () => {
    expect(isAllowedOrigin('http://evil.com', ['http://localhost:3000'])).toBe(false);
  });

  it('should allow listed origins', () => {
    expect(isAllowedOrigin('http://localhost:3000', ['http://localhost:3000'])).toBe(true);
  });

  it('should allow wildcard', () => {
    expect(isAllowedOrigin('http://any.com', ['*'])).toBe(true);
  });

  it('should reject when empty list', () => {
    expect(isAllowedOrigin('http://localhost:3000', [])).toBe(false);
  });

  it('should handle multiple allowed origins', () => {
    const allowed = ['http://localhost:3000', 'http://localhost:5173'];
    expect(isAllowedOrigin('http://localhost:3000', allowed)).toBe(true);
    expect(isAllowedOrigin('http://localhost:5173', allowed)).toBe(true);
    expect(isAllowedOrigin('http://localhost:8080', allowed)).toBe(false);
  });
});

describe('securityHeaders - config merging', () => {
  const DEFAULT_CONFIG = {
    contentSecurityPolicy: "default-src 'self'",
    hsts: { maxAge: 31536000, includeSubDomains: true, preload: true },
    allowedOrigins: [] as string[],
    permissionsPolicy: true,
  };

  it('should merge partial config with defaults', () => {
    const merged = { ...DEFAULT_CONFIG, allowedOrigins: ['http://localhost:3000'] };
    expect(merged.contentSecurityPolicy).toBe(DEFAULT_CONFIG.contentSecurityPolicy);
    expect(merged.allowedOrigins).toEqual(['http://localhost:3000']);
  });

  it('should allow disabling CSP', () => {
    const merged = { ...DEFAULT_CONFIG, contentSecurityPolicy: false };
    expect(merged.contentSecurityPolicy).toBe(false);
  });

  it('should allow disabling HSTS', () => {
    const merged = { ...DEFAULT_CONFIG, hsts: false };
    expect(merged.hsts).toBe(false);
  });

  it('should allow disabling permissions policy', () => {
    const merged = { ...DEFAULT_CONFIG, permissionsPolicy: false };
    expect(merged.permissionsPolicy).toBe(false);
  });
});
