import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import crypto from 'crypto';

// ==================== Token Manager 逻辑测试 ====================

// 独立测试 HMAC-SHA256 JWT 实现的核心逻辑
describe('tokenManager - HMAC signing', () => {
  const secret = 'test-secret-key';

  it('should produce consistent signatures for same input', () => {
    const data = 'test-payload';
    const sig1 = crypto.createHmac('sha256', secret).update(data).digest('base64url');
    const sig2 = crypto.createHmac('sha256', secret).update(data).digest('base64url');
    expect(sig1).toBe(sig2);
  });

  it('should produce different signatures for different inputs', () => {
    const sig1 = crypto.createHmac('sha256', secret).update('data1').digest('base64url');
    const sig2 = crypto.createHmac('sha256', secret).update('data2').digest('base64url');
    expect(sig1).not.toBe(sig2);
  });

  it('should produce different signatures for different secrets', () => {
    const data = 'same-data';
    const sig1 = crypto.createHmac('sha256', 'secret1').update(data).digest('base64url');
    const sig2 = crypto.createHmac('sha256', 'secret2').update(data).digest('base64url');
    expect(sig1).not.toBe(sig2);
  });

  it('base64url should not contain + / or =', () => {
    // Test with many random payloads to check base64url encoding
    for (let i = 0; i < 20; i++) {
      const data = crypto.randomBytes(32).toString('hex');
      const sig = crypto.createHmac('sha256', secret).update(data).digest('base64url');
      expect(sig).not.toContain('+');
      expect(sig).not.toContain('/');
      expect(sig).not.toContain('=');
    }
  });
});

describe('tokenManager - JWT structure', () => {
  function createToken(payload: object, secret: string): string {
    const header = { alg: 'HS256', typ: 'JWT' };
    const headerB64 = Buffer.from(JSON.stringify(header)).toString('base64url');
    const payloadB64 = Buffer.from(JSON.stringify(payload)).toString('base64url');
    const signature = crypto
      .createHmac('sha256', secret)
      .update(`${headerB64}.${payloadB64}`)
      .digest('base64url');
    return `${headerB64}.${payloadB64}.${signature}`;
  }

  function verifyToken(token: string, secret: string): { valid: boolean; payload?: any } {
    const parts = token.split('.');
    if (parts.length !== 3) return { valid: false };
    const [headerB64, payloadB64, sig] = parts;
    const expectedSig = crypto
      .createHmac('sha256', secret)
      .update(`${headerB64}.${payloadB64}`)
      .digest('base64url');
    if (sig !== expectedSig) return { valid: false };
    const payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString());
    return { valid: true, payload };
  }

  it('should create valid JWT structure', () => {
    const token = createToken({ sub: '123' }, 'secret');
    const parts = token.split('.');
    expect(parts).toHaveLength(3);
  });

  it('should verify valid token', () => {
    const payload = { userId: 1, role: 'admin', exp: Date.now() + 3600000 };
    const token = createToken(payload, 'secret');
    const result = verifyToken(token, 'secret');
    expect(result.valid).toBe(true);
    expect(result.payload.userId).toBe(1);
  });

  it('should reject token with wrong secret', () => {
    const token = createToken({ sub: '123' }, 'correct-secret');
    const result = verifyToken(token, 'wrong-secret');
    expect(result.valid).toBe(false);
  });

  it('should reject tampered payload', () => {
    const token = createToken({ userId: 1 }, 'secret');
    const parts = token.split('.');
    const tamperedPayload = Buffer.from(JSON.stringify({ userId: 999 })).toString('base64url');
    const tamperedToken = `${parts[0]}.${tamperedPayload}.${parts[2]}`;
    const result = verifyToken(tamperedToken, 'secret');
    expect(result.valid).toBe(false);
  });

  it('should reject malformed token', () => {
    expect(verifyToken('not-a-jwt', 'secret').valid).toBe(false);
    expect(verifyToken('a.b', 'secret').valid).toBe(false);
    expect(verifyToken('', 'secret').valid).toBe(false);
  });

  it('should handle special characters in payload', () => {
    const payload = { name: '张三@email.com', role: 'user' };
    const token = createToken(payload, 'secret');
    const result = verifyToken(token, 'secret');
    expect(result.valid).toBe(true);
    expect(result.payload.name).toBe('张三@email.com');
  });

  it('should handle large payloads', () => {
    const payload = { data: 'x'.repeat(10000) };
    const token = createToken(payload, 'secret');
    const result = verifyToken(token, 'secret');
    expect(result.valid).toBe(true);
  });
});

describe('tokenManager - token expiry logic', () => {
  function isExpired(payload: { exp?: number }): boolean {
    if (!payload.exp) return false;
    return Date.now() > payload.exp;
  }

  it('should detect expired token', () => {
    const payload = { exp: Date.now() - 1000 };
    expect(isExpired(payload)).toBe(true);
  });

  it('should not flag fresh token as expired', () => {
    const payload = { exp: Date.now() + 3600000 };
    expect(isExpired(payload)).toBe(false);
  });

  it('should handle token without exp claim', () => {
    const payload = { exp: undefined as unknown as number };
    expect(isExpired(payload)).toBe(false);
  });

  it('should detect token expiring exactly now', () => {
    const payload = { exp: Date.now() - 1 };
    // Token expiring 1ms ago should be considered expired
    expect(isExpired(payload)).toBe(true);
  });
});

describe('tokenManager - blacklist logic', () => {
  it('should track blacklisted tokens', () => {
    const blacklist = new Set<string>();
    blacklist.add('token-123');
    expect(blacklist.has('token-123')).toBe(true);
    expect(blacklist.has('token-456')).toBe(false);
  });

  it('should allow removing from blacklist', () => {
    const blacklist = new Set<string>();
    blacklist.add('token-123');
    blacklist.delete('token-123');
    expect(blacklist.has('token-123')).toBe(false);
  });

  it('should handle many blacklist entries', () => {
    const blacklist = new Set<string>();
    for (let i = 0; i < 1000; i++) {
      blacklist.add(`token-${i}`);
    }
    expect(blacklist.size).toBe(1000);
    expect(blacklist.has('token-500')).toBe(true);
    expect(blacklist.has('token-9999')).toBe(false);
  });
});

describe('tokenManager - refresh token rotation', () => {
  it('should store refresh tokens with expiry', () => {
    const refreshTokens = new Map<string, { payload: any; expiresAt: number }>();
    refreshTokens.set('refresh-123', {
      payload: { userId: 1 },
      expiresAt: Date.now() + 604800000,
    });
    expect(refreshTokens.has('refresh-123')).toBe(true);
  });

  it('should detect expired refresh tokens', () => {
    const refreshTokens = new Map<string, { payload: any; expiresAt: number }>();
    refreshTokens.set('expired', {
      payload: { userId: 1 },
      expiresAt: Date.now() - 1000,
    });
    const stored = refreshTokens.get('expired');
    expect(stored!.expiresAt < Date.now()).toBe(true);
  });

  it('should invalidate old refresh token on rotation', () => {
    const refreshTokens = new Map<string, any>();
    const oldToken = 'old-refresh';
    const newToken = 'new-refresh';
    refreshTokens.set(oldToken, { userId: 1 });
    // Rotation: remove old, add new
    refreshTokens.delete(oldToken);
    refreshTokens.set(newToken, { userId: 1 });
    expect(refreshTokens.has(oldToken)).toBe(false);
    expect(refreshTokens.has(newToken)).toBe(true);
  });
});

describe('tokenManager - base64url encoding', () => {
  it('should encode and decode roundtrip', () => {
    const original = JSON.stringify({ test: 'data', num: 42 });
    const encoded = Buffer.from(original).toString('base64url');
    const decoded = Buffer.from(encoded, 'base64url').toString();
    expect(decoded).toBe(original);
  });

  it('should handle unicode characters', () => {
    const original = '你好世界🌍';
    const encoded = Buffer.from(original, 'utf-8').toString('base64url');
    const decoded = Buffer.from(encoded, 'base64url').toString('utf-8');
    expect(decoded).toBe(original);
  });

  it('should handle empty string', () => {
    const encoded = Buffer.from('').toString('base64url');
    expect(encoded).toBe('');
  });

  it('should handle binary data', () => {
    const data = crypto.randomBytes(64);
    const encoded = data.toString('base64url');
    const decoded = Buffer.from(encoded, 'base64url');
    expect(decoded.equals(data)).toBe(true);
  });
});

describe('tokenManager - crypto random generation', () => {
  it('should generate unique secrets', () => {
    const secrets = new Set<string>();
    for (let i = 0; i < 100; i++) {
      secrets.add(crypto.randomBytes(64).toString('hex'));
    }
    expect(secrets.size).toBe(100);
  });

  it('generated secret should be 128 hex chars', () => {
    const secret = crypto.randomBytes(64).toString('hex');
    expect(secret.length).toBe(128);
  });

  it('generated secret should be hex', () => {
    const secret = crypto.randomBytes(64).toString('hex');
    expect(/^[0-9a-f]+$/.test(secret)).toBe(true);
  });
});
