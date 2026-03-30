import { describe, it, expect } from 'vitest';

// CORS Configuration
interface CorsConfig {
  allowedOrigins: string[];
  allowedMethods: string[];
  allowedHeaders: string[];
  exposedHeaders: string[];
  credentials: boolean;
  maxAge: number;
}

interface CorsResult {
  allowed: boolean;
  headers: Record<string, string>;
}

function validateOrigin(origin: string, allowedOrigins: string[]): boolean {
  if (allowedOrigins.includes('*')) return true;
  return allowedOrigins.some(allowed => {
    if (allowed.includes('*')) {
      const pattern = allowed.replace(/\*/g, '.*');
      return new RegExp(`^${pattern}$`).test(origin);
    }
    return allowed === origin;
  });
}

function buildCorsHeaders(origin: string, config: CorsConfig): CorsResult {
  const allowed = validateOrigin(origin, config.allowedOrigins);
  if (!allowed) {
    return { allowed: false, headers: {} };
  }

  const headers: Record<string, string> = {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': config.allowedMethods.join(', '),
    'Access-Control-Allow-Headers': config.allowedHeaders.join(', '),
    'Access-Control-Max-Age': String(config.maxAge),
  };

  if (config.credentials) {
    headers['Access-Control-Allow-Credentials'] = 'true';
  }

  if (config.exposedHeaders.length > 0) {
    headers['Access-Control-Expose-Headers'] = config.exposedHeaders.join(', ');
  }

  return { allowed: true, headers };
}

function handlePreflight(origin: string, method: string, config: CorsConfig): CorsResult {
  if (!config.allowedMethods.includes(method)) {
    return { allowed: false, headers: {} };
  }
  return buildCorsHeaders(origin, config);
}

function sanitizeOrigin(origin: string): string {
  try {
    const url = new URL(origin);
    return `${url.protocol}//${url.host}`;
  } catch {
    return '';
  }
}

function isSecureOrigin(origin: string): boolean {
  return origin.startsWith('https://') || origin.startsWith('http://localhost');
}

describe('CORS Middleware', () => {
  const config: CorsConfig = {
    allowedOrigins: ['https://example.com', 'https://app.example.com'],
    allowedMethods: ['GET', 'POST', 'PUT', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-ID'],
    exposedHeaders: ['X-Total-Count', 'X-Rate-Limit'],
    credentials: true,
    maxAge: 86400,
  };

  it('should allow matching origin', () => {
    const result = buildCorsHeaders('https://example.com', config);
    expect(result.allowed).toBe(true);
    expect(result.headers['Access-Control-Allow-Origin']).toBe('https://example.com');
  });

  it('should reject non-matching origin', () => {
    const result = buildCorsHeaders('https://evil.com', config);
    expect(result.allowed).toBe(false);
  });

  it('should include allowed methods', () => {
    const result = buildCorsHeaders('https://example.com', config);
    expect(result.headers['Access-Control-Allow-Methods']).toContain('GET');
    expect(result.headers['Access-Control-Allow-Methods']).toContain('POST');
  });

  it('should include allowed headers', () => {
    const result = buildCorsHeaders('https://example.com', config);
    expect(result.headers['Access-Control-Allow-Headers']).toContain('Content-Type');
  });

  it('should include credentials header when enabled', () => {
    const result = buildCorsHeaders('https://example.com', config);
    expect(result.headers['Access-Control-Allow-Credentials']).toBe('true');
  });

  it('should not include credentials header when disabled', () => {
    const noCredentials = { ...config, credentials: false };
    const result = buildCorsHeaders('https://example.com', noCredentials);
    expect(result.headers['Access-Control-Allow-Credentials']).toBeUndefined();
  });

  it('should include exposed headers', () => {
    const result = buildCorsHeaders('https://example.com', config);
    expect(result.headers['Access-Control-Expose-Headers']).toContain('X-Total-Count');
  });

  it('should not include exposed headers when empty', () => {
    const noExposed = { ...config, exposedHeaders: [] };
    const result = buildCorsHeaders('https://example.com', noExposed);
    expect(result.headers['Access-Control-Expose-Headers']).toBeUndefined();
  });

  it('should include max age', () => {
    const result = buildCorsHeaders('https://example.com', config);
    expect(result.headers['Access-Control-Max-Age']).toBe('86400');
  });

  it('should handle wildcard origin', () => {
    const wildcard = { ...config, allowedOrigins: ['*'] };
    const result = buildCorsHeaders('https://any-site.com', wildcard);
    expect(result.allowed).toBe(true);
  });

  it('should handle subdomain wildcard', () => {
    const subdomain = { ...config, allowedOrigins: ['https://*.example.com'] };
    expect(validateOrigin('https://app.example.com', subdomain.allowedOrigins)).toBe(true);
    expect(validateOrigin('https://sub.app.example.com', subdomain.allowedOrigins)).toBe(true);
    expect(validateOrigin('https://evil.com', subdomain.allowedOrigins)).toBe(false);
  });

  it('should validate preflight request', () => {
    const result = handlePreflight('https://example.com', 'POST', config);
    expect(result.allowed).toBe(true);
  });

  it('should reject preflight with disallowed method', () => {
    const result = handlePreflight('https://example.com', 'PATCH', config);
    expect(result.allowed).toBe(false);
  });

  it('should reject preflight from disallowed origin', () => {
    const result = handlePreflight('https://evil.com', 'GET', config);
    expect(result.allowed).toBe(false);
  });

  it('should sanitize origin correctly', () => {
    expect(sanitizeOrigin('https://example.com/path?query=1')).toBe('https://example.com');
    expect(sanitizeOrigin('http://localhost:3000')).toBe('http://localhost:3000');
    expect(sanitizeOrigin('not-a-url')).toBe('');
  });

  it('should detect secure origins', () => {
    expect(isSecureOrigin('https://example.com')).toBe(true);
    expect(isSecureOrigin('http://localhost:3000')).toBe(true);
    expect(isSecureOrigin('http://example.com')).toBe(false);
  });

  it('should handle multiple allowed origins', () => {
    expect(validateOrigin('https://example.com', config.allowedOrigins)).toBe(true);
    expect(validateOrigin('https://app.example.com', config.allowedOrigins)).toBe(true);
    expect(validateOrigin('https://other.com', config.allowedOrigins)).toBe(false);
  });

  it('should handle empty allowed origins', () => {
    expect(validateOrigin('https://example.com', [])).toBe(false);
  });
});
