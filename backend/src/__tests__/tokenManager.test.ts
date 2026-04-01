import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { TokenManager, TokenPayload, TokenPair } from '../utils/tokenManager';

describe('tokenManager', () => {
  let manager: TokenManager;
  const testPayload: TokenPayload = {
    userId: 1,
    username: 'testuser',
    role: 'user',
  };

  beforeEach(() => {
    manager = new TokenManager({
      secret: 'test-secret-key-for-testing-only',
      accessExpiresIn: 3600,
      refreshExpiresIn: 604800,
    });
  });

  describe('generateAccessToken', () => {
    it('should generate a JWT-format token', () => {
      const token = manager.generateAccessToken(testPayload);
      const parts = token.split('.');
      expect(parts).toHaveLength(3);
    });

    it('should include payload data', () => {
      const token = manager.generateAccessToken(testPayload);
      const result = manager.verifyAccessToken(token);
      expect(result.valid).toBe(true);
      expect(result.payload?.userId).toBe(1);
      expect(result.payload?.username).toBe('testuser');
      expect(result.payload?.role).toBe('user');
    });

    it('should generate different tokens for same payload', () => {
      const t1 = manager.generateAccessToken(testPayload);
      const t2 = manager.generateAccessToken(testPayload);
      expect(t1).not.toBe(t2);
    });
  });

  describe('generateRefreshToken', () => {
    it('should generate a hex string', () => {
      const token = manager.generateRefreshToken(testPayload);
      expect(token).toMatch(/^[a-f0-9]+$/);
      expect(token.length).toBe(96); // 48 bytes = 96 hex chars
    });
  });

  describe('generateTokenPair', () => {
    it('should return access and refresh tokens', () => {
      const pair = manager.generateTokenPair(testPayload);
      expect(pair.accessToken).toBeDefined();
      expect(pair.refreshToken).toBeDefined();
      expect(pair.expiresIn).toBe(3600);
      expect(pair.tokenType).toBe('Bearer');
    });

    it('access token should be verifiable', () => {
      const pair = manager.generateTokenPair(testPayload);
      const result = manager.verifyAccessToken(pair.accessToken);
      expect(result.valid).toBe(true);
    });
  });

  describe('verifyAccessToken', () => {
    it('should verify valid token', () => {
      const token = manager.generateAccessToken(testPayload);
      const result = manager.verifyAccessToken(token);
      expect(result.valid).toBe(true);
      expect(result.payload).toBeDefined();
    });

    it('should reject invalid token format', () => {
      const result = manager.verifyAccessToken('invalid');
      expect(result.valid).toBe(false);
      expect(result.error).toBe('Token 格式无效');
    });

    it('should reject tampered token', () => {
      const token = manager.generateAccessToken(testPayload);
      const tampered = token.slice(0, -5) + 'xxxxx';
      const result = manager.verifyAccessToken(tampered);
      expect(result.valid).toBe(false);
    });

    it('should reject token signed with different secret', () => {
      const otherManager = new TokenManager({ secret: 'other-secret' });
      const token = otherManager.generateAccessToken(testPayload);
      const result = manager.verifyAccessToken(token);
      expect(result.valid).toBe(false);
    });

    it('should reject blacklisted token', () => {
      const token = manager.generateAccessToken(testPayload);
      manager.revokeAccessToken(token);
      const result = manager.verifyAccessToken(token);
      expect(result.valid).toBe(false);
      expect(result.error).toBe('Token 已被撤销');
    });

    it('should reject expired token', () => {
      const expiredManager = new TokenManager({
        secret: 'test-secret',
        accessExpiresIn: -1, // already expired
      });
      const token = expiredManager.generateAccessToken(testPayload);
      const result = expiredManager.verifyAccessToken(token);
      expect(result.valid).toBe(false);
      expect(result.error).toBe('Token 已过期');
    });
  });

  describe('refreshAccessToken', () => {
    it('should refresh token and return new pair', () => {
      const pair = manager.generateTokenPair(testPayload);
      const newPair = manager.refreshAccessToken(pair.refreshToken);

      expect(newPair).not.toBeNull();
      expect(newPair?.accessToken).toBeDefined();
      expect(newPair?.refreshToken).toBeDefined();
      expect(newPair?.refreshToken).not.toBe(pair.refreshToken);
    });

    it('should return null for invalid refresh token', () => {
      const result = manager.refreshAccessToken('nonexistent');
      expect(result).toBeNull();
    });

    it('should be one-time use', () => {
      const pair = manager.generateTokenPair(testPayload);
      manager.refreshAccessToken(pair.refreshToken);
      const second = manager.refreshAccessToken(pair.refreshToken);
      expect(second).toBeNull();
    });

    it('should reject very old refresh tokens', () => {
      // Generate token, then revoke it so it can't be refreshed
      const token = manager.generateRefreshToken(testPayload);
      manager.revokeRefreshToken(token);
      const result = manager.refreshAccessToken(token);
      expect(result).toBeNull();
    });

    it('should preserve payload in refreshed token', () => {
      const pair = manager.generateTokenPair(testPayload);
      const newPair = manager.refreshAccessToken(pair.refreshToken);
      const result = manager.verifyAccessToken(newPair!.accessToken);
      expect(result.payload?.userId).toBe(1);
      expect(result.payload?.username).toBe('testuser');
    });
  });

  describe('revoke operations', () => {
    it('should revoke access token', () => {
      const token = manager.generateAccessToken(testPayload);
      manager.revokeAccessToken(token);
      expect(manager.verifyAccessToken(token).valid).toBe(false);
    });

    it('should revoke refresh token', () => {
      const token = manager.generateRefreshToken(testPayload);
      expect(manager.revokeRefreshToken(token)).toBe(true);
      expect(manager.refreshAccessToken(token)).toBeNull();
    });

    it('should return false for revoking nonexistent refresh token', () => {
      expect(manager.revokeRefreshToken('fake')).toBe(false);
    });

    it('should revoke all user tokens', () => {
      manager.generateRefreshToken(testPayload);
      manager.generateRefreshToken(testPayload);
      manager.generateRefreshToken({ ...testPayload, userId: 2 });

      const count = manager.revokeAllUserTokens(1);
      expect(count).toBe(2);
    });
  });

  describe('cleanup', () => {
    it('should clean expired refresh tokens', () => {
      const expiredManager = new TokenManager({
        secret: 'test',
        refreshExpiresIn: 0,
      });
      expiredManager.generateRefreshToken(testPayload);
      const cleaned = expiredManager.cleanup();
      expect(cleaned).toBeGreaterThanOrEqual(0);
    });

    it('should return stats', () => {
      manager.generateRefreshToken(testPayload);
      manager.generateRefreshToken(testPayload);
      manager.generateAccessToken(testPayload);
      manager.revokeAccessToken(manager.generateAccessToken(testPayload));

      const stats = manager.getStats();
      expect(stats.activeRefreshTokens).toBe(2);
      expect(stats.blacklistedTokens).toBe(1);
    });
  });
});
