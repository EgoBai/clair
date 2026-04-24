/**
 * Token Manager 单元测试
 * 覆盖: 生成/验证/刷新/撤销/清理 token 行为
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TokenManager } from '../utils/tokenManager';

function createTestManager() {
  return new TokenManager({
    secret: 'test-secret-key-for-unit-testing',
    accessExpiresIn: 3600,      // 1h
    refreshExpiresIn: 604800,   // 7d
  });
}

const testPayload = {
  userId: 42,
  username: 'testuser',
  role: 'user' as const,
};

describe('TokenManager', () => {
  let mgr: TokenManager;

  beforeEach(() => {
    mgr = createTestManager();
  });

  describe('generateAccessToken', () => {
    it('should generate a valid 3-part JWT', () => {
      const token = mgr.generateAccessToken(testPayload);
      const parts = token.split('.');
      expect(parts).toHaveLength(3);
      expect(parts[0]).toBeTruthy();
      expect(parts[1]).toBeTruthy();
      expect(parts[2]).toBeTruthy();
    });

    it('should encode base64url header and payload', () => {
      const token = mgr.generateAccessToken(testPayload);
      const [headerB64] = token.split('.');
      const header = JSON.parse(Buffer.from(headerB64, 'base64url').toString());
      expect(header).toEqual({ alg: 'HS256', typ: 'JWT' });
    });

    it('should embed payload claims in access token', () => {
      const token = mgr.generateAccessToken(testPayload);
      const [, payloadB64] = token.split('.');
      const claims = JSON.parse(Buffer.from(payloadB64, 'base64url').toString());
      expect(claims.userId).toBe(42);
      expect(claims.username).toBe('testuser');
      expect(claims.role).toBe('user');
    });

    it('should include iat, exp, and jti claims', () => {
      const token = mgr.generateAccessToken(testPayload);
      const [, payloadB64] = token.split('.');
      const claims = JSON.parse(Buffer.from(payloadB64, 'base64url').toString());
      expect(claims.iat).toBeGreaterThan(0);
      expect(claims.exp).toBeGreaterThan(claims.iat!);
      expect(claims.jti).toBeTruthy();
      expect(typeof claims.jti).toBe('string');
    });

    it('should generate different tokens for same payload (unique jti)', () => {
      const t1 = mgr.generateAccessToken(testPayload);
      const t2 = mgr.generateAccessToken(testPayload);
      expect(t1).not.toBe(t2);
    });
  });

  describe('generateRefreshToken', () => {
    it('should generate a hex string', () => {
      const token = mgr.generateRefreshToken(testPayload);
      expect(typeof token).toBe('string');
      expect(token.length).toBeGreaterThan(64);
      expect(/^[0-9a-f]+$/.test(token)).toBe(true);
    });

    it('should store refresh tokens internally', () => {
      mgr.generateRefreshToken(testPayload);
      const stats = mgr.getStats();
      expect(stats.activeRefreshTokens).toBe(1);
    });
  });

  describe('generateTokenPair', () => {
    it('should return both access and refresh tokens', () => {
      const pair = mgr.generateTokenPair(testPayload);
      expect(pair.accessToken).toBeTruthy();
      expect(pair.refreshToken).toBeTruthy();
      expect(pair.accessToken.split('.')).toHaveLength(3);
      expect(pair.expiresIn).toBe(3600);
      expect(pair.tokenType).toBe('Bearer');
    });
  });

  describe('verifyAccessToken', () => {
    it('should accept a valid token', () => {
      const token = mgr.generateAccessToken(testPayload);
      const result = mgr.verifyAccessToken(token);
      expect(result.valid).toBe(true);
      expect(result.payload?.userId).toBe(42);
      expect(result.payload?.username).toBe('testuser');
      expect(result.payload?.role).toBe('user');
    });

    it('should reject malformed token', () => {
      const result = mgr.verifyAccessToken('not-a-valid-token');
      expect(result.valid).toBe(false);
      expect(result.error).toMatch(/格式无效/i);
    });

    it('should reject token with wrong number of parts', () => {
      const result = mgr.verifyAccessToken('part1.part2');
      expect(result.valid).toBe(false);
    });

    it('should reject token with invalid signature', () => {
      const token = mgr.generateAccessToken(testPayload);
      const [h, p] = token.split('.');
      const tampered = `${h}.${p}.invalidsignature`;
      const result = mgr.verifyAccessToken(tampered);
      expect(result.valid).toBe(false);
    });

    it('should reject blacklisted token', () => {
      const token = mgr.generateAccessToken(testPayload);
      mgr.revokeAccessToken(token);
      const result = mgr.verifyAccessToken(token);
      expect(result.valid).toBe(false);
      expect(result.error).toMatch(/已被撤销/i);
    });

    it('should detect expired tokens', () => {
      vi.useFakeTimers();
      const shortLived = new TokenManager({
        secret: 'exp-test',
        accessExpiresIn: 10, // 10s TTL
      });
      const token = shortLived.generateAccessToken(testPayload);
      vi.advanceTimersByTime(11000); // advance past expiry
      const result = shortLived.verifyAccessToken(token);
      expect(result.valid).toBe(false);
      expect(result.error).toMatch(/已过期/i);
      vi.useRealTimers();
    });

    it('should tolerate extra payload fields', () => {
      const fullPayload = { ...testPayload, department: 'trading', locale: 'zh-CN' };
      const token = mgr.generateAccessToken(fullPayload);
      const result = mgr.verifyAccessToken(token);
      expect(result.valid).toBe(true);
    });
  });

  describe('refreshAccessToken', () => {
    it('should return a new token pair for valid refresh token', () => {
      const pair = mgr.generateTokenPair(testPayload);
      const refreshed = mgr.refreshAccessToken(pair.refreshToken);
      expect(refreshed).not.toBeNull();
      expect(refreshed!.accessToken).not.toBe(pair.accessToken);
      expect(refreshed!.refreshToken).not.toBe(pair.refreshToken);
    });

    it('should consume (delete) the old refresh token', () => {
      const pair = mgr.generateTokenPair(testPayload);
      mgr.refreshAccessToken(pair.refreshToken);
      const result = mgr.refreshAccessToken(pair.refreshToken);
      expect(result).toBeNull();
    });

    it('should return null for unknown refresh token', () => {
      const result = mgr.refreshAccessToken('nonexistent-token');
      expect(result).toBeNull();
    });

    it('should preserve payload across refresh', () => {
      const pair = mgr.generateTokenPair(testPayload);
      const refreshed = mgr.refreshAccessToken(pair.refreshToken);
      const decoded = mgr.verifyAccessToken(refreshed!.accessToken);
      expect(decoded.payload?.userId).toBe(42);
      expect(decoded.payload?.username).toBe('testuser');
    });
  });

  describe('revoke operations', () => {
    it('should revoke access token by adding to blacklist', () => {
      const token = mgr.generateAccessToken(testPayload);
      mgr.revokeAccessToken(token);
      const stats = mgr.getStats();
      expect(stats.blacklistedTokens).toBe(1);
    });

    it('should revoke refresh token and return true if found', () => {
      const token = mgr.generateRefreshToken(testPayload);
      expect(mgr.revokeRefreshToken(token)).toBe(true);
    });

    it('should return false when revoking unknown refresh token', () => {
      expect(mgr.revokeRefreshToken('nonexistent')).toBe(false);
    });

    it('should revoke all tokens for a given user', () => {
      mgr.generateRefreshToken(testPayload);
      mgr.generateRefreshToken(testPayload);
      mgr.generateRefreshToken(testPayload);
      const otherPayload = { userId: 99, username: 'other', role: 'admin' as const };
      mgr.generateRefreshToken(otherPayload);

      const count = mgr.revokeAllUserTokens(42);
      // Three tokens for userId 42, one for userId 99
      expect(count).toBe(3);
    });
  });

  describe('cleanup', () => {
    it('should remove expired refresh tokens', () => {
      vi.useFakeTimers();
      const expiredMgr = new TokenManager({
        secret: 'exp-cleanup',
        refreshExpiresIn: 10, // 10s TTL
      });
      expiredMgr.generateRefreshToken(testPayload);
      vi.advanceTimersByTime(11000); // advance past expiry
      const cleaned = expiredMgr.cleanup();
      expect(cleaned).toBeGreaterThanOrEqual(1);
      vi.useRealTimers();
    });

    it('should not remove active refresh tokens', () => {
      mgr.generateRefreshToken(testPayload);
      const cleaned = mgr.cleanup();
      expect(cleaned).toBe(0);
    });
  });

  describe('getStats', () => {
    it('should return counts for refresh tokens and blacklist', () => {
      mgr.generateRefreshToken(testPayload);
      const token = mgr.generateAccessToken(testPayload);
      mgr.revokeAccessToken(token);

      const stats = mgr.getStats();
      expect(stats.activeRefreshTokens).toBe(1);
      expect(stats.blacklistedTokens).toBe(1);
    });
  });

  describe('cross-manager validation', () => {
    it('should reject token from another manager with different secret', () => {
      const mgr2 = new TokenManager({ secret: 'different-secret' });
      const token = mgr.generateAccessToken(testPayload);
      const result = mgr2.verifyAccessToken(token);
      expect(result.valid).toBe(false);
      expect(result.error).toMatch(/签名无效/i);
    });
  });
});
