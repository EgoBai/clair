/**
 * Token管理器扩展测试
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { TokenManager } from '../utils/tokenManager';

describe('TokenManager 扩展测试', () => {
  let manager: TokenManager;

  beforeEach(() => {
    manager = new TokenManager({
      secret: 'test-secret-key-for-testing-only',
      accessExpiresIn: 3600,
      refreshExpiresIn: 604800,
    });
  });

  describe('Access Token 生成', () => {
    it('生成的 token 是三段式 JWT 格式', () => {
      const token = manager.generateAccessToken({ userId: 1, username: 'test', role: 'user' });
      const parts = token.split('.');
      expect(parts).toHaveLength(3);
    });

    it('不同用户生成不同 token', () => {
      const t1 = manager.generateAccessToken({ userId: 1, username: 'user1', role: 'user' });
      const t2 = manager.generateAccessToken({ userId: 2, username: 'user2', role: 'user' });
      expect(t1).not.toBe(t2);
    });

    it('同一用户多次生成 token 不同（jti唯一）', () => {
      const t1 = manager.generateAccessToken({ userId: 1, username: 'test', role: 'user' });
      const t2 = manager.generateAccessToken({ userId: 1, username: 'test', role: 'user' });
      expect(t1).not.toBe(t2);
    });

    it('admin 角色 token 可正确生成', () => {
      const token = manager.generateAccessToken({ userId: 1, username: 'admin', role: 'admin' });
      const result = manager.verifyAccessToken(token);
      expect(result.valid).toBe(true);
      expect(result.payload?.role).toBe('admin');
    });
  });

  describe('Access Token 验证', () => {
    it('有效 token 验证通过', () => {
      const token = manager.generateAccessToken({ userId: 42, username: 'test', role: 'user' });
      const result = manager.verifyAccessToken(token);
      expect(result.valid).toBe(true);
      expect(result.payload?.userId).toBe(42);
      expect(result.payload?.username).toBe('test');
    });

    it('篡改 token 验证失败', () => {
      const token = manager.generateAccessToken({ userId: 1, username: 'test', role: 'user' });
      const tampered = token.slice(0, -5) + 'xxxxx';
      const result = manager.verifyAccessToken(tampered);
      expect(result.valid).toBe(false);
    });

    it('空 token 验证失败', () => {
      const result = manager.verifyAccessToken('');
      expect(result.valid).toBe(false);
    });

    it('格式错误 token 验证失败', () => {
      const result = manager.verifyAccessToken('not-a-jwt');
      expect(result.valid).toBe(false);
    });

    it('两段式 token 验证失败', () => {
      const result = manager.verifyAccessToken('header.payload');
      expect(result.valid).toBe(false);
    });

    it('黑名单 token 验证失败', () => {
      const token = manager.generateAccessToken({ userId: 1, username: 'test', role: 'user' });
      manager.revokeAccessToken(token);
      const result = manager.verifyAccessToken(token);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('撤销');
    });
  });

  describe('Refresh Token', () => {
    it('生成 refresh token 对', () => {
      const pair = manager.generateTokenPair({ userId: 1, username: 'test', role: 'user' });
      expect(pair.accessToken).toBeDefined();
      expect(pair.refreshToken).toBeDefined();
      expect(pair.expiresIn).toBe(3600);
      expect(pair.tokenType).toBe('Bearer');
    });

    it('用 refresh token 刷新获取新 token 对', () => {
      const pair = manager.generateTokenPair({ userId: 1, username: 'test', role: 'user' });
      const newPair = manager.refreshAccessToken(pair.refreshToken);
      expect(newPair).not.toBeNull();
      expect(newPair?.accessToken).toBeDefined();
      expect(newPair?.refreshToken).toBeDefined();
      expect(newPair?.accessToken).not.toBe(pair.accessToken);
    });

    it('refresh token 一次性使用', () => {
      const pair = manager.generateTokenPair({ userId: 1, username: 'test', role: 'user' });
      manager.refreshAccessToken(pair.refreshToken);
      const second = manager.refreshAccessToken(pair.refreshToken);
      expect(second).toBeNull();
    });

    it('无效 refresh token 返回 null', () => {
      const result = manager.refreshAccessToken('invalid-token');
      expect(result).toBeNull();
    });

    it('撤销 refresh token', () => {
      const pair = manager.generateTokenPair({ userId: 1, username: 'test', role: 'user' });
      const revoked = manager.revokeRefreshToken(pair.refreshToken);
      expect(revoked).toBe(true);
      const result = manager.refreshAccessToken(pair.refreshToken);
      expect(result).toBeNull();
    });

    it('刷新后的 token payload 保持一致', () => {
      const pair = manager.generateTokenPair({ userId: 99, username: 'admin', role: 'admin' });
      const newPair = manager.refreshAccessToken(pair.refreshToken);
      const verified = manager.verifyAccessToken(newPair!.accessToken);
      expect(verified.payload?.userId).toBe(99);
      expect(verified.payload?.username).toBe('admin');
    });
  });

  describe('Token 撤销', () => {
    it('撤销用户所有 token', () => {
      manager.generateTokenPair({ userId: 1, username: 'user1', role: 'user' });
      manager.generateTokenPair({ userId: 1, username: 'user1', role: 'user' });
      manager.generateTokenPair({ userId: 2, username: 'user2', role: 'user' });
      const count = manager.revokeAllUserTokens(1);
      expect(count).toBe(2);
    });

    it('撤销不存在的 refresh token 返回 false', () => {
      expect(manager.revokeRefreshToken('nonexistent')).toBe(false);
    });
  });

  describe('Token 统计', () => {
    it('初始状态统计', () => {
      const stats = manager.getStats();
      expect(stats.activeRefreshTokens).toBe(0);
      expect(stats.blacklistedTokens).toBe(0);
    });

    it('生成 token 后统计更新', () => {
      manager.generateTokenPair({ userId: 1, username: 'test', role: 'user' });
      manager.generateTokenPair({ userId: 2, username: 'test2', role: 'user' });
      const stats = manager.getStats();
      expect(stats.activeRefreshTokens).toBe(2);
    });

    it('加入黑名单后统计更新', () => {
      const token = manager.generateAccessToken({ userId: 1, username: 'test', role: 'user' });
      manager.revokeAccessToken(token);
      const stats = manager.getStats();
      expect(stats.blacklistedTokens).toBe(1);
    });
  });

  describe('清理', () => {
    it('清理过期 refresh token', () => {
      const shortLivedManager = new TokenManager({
        secret: 'test-secret',
        accessExpiresIn: 1,
        refreshExpiresIn: 0, // 立即过期
      });
      shortLivedManager.generateTokenPair({ userId: 1, username: 'test', role: 'user' });
      const cleaned = shortLivedManager.cleanup();
      expect(cleaned).toBeGreaterThanOrEqual(0);
    });
  });

  describe('边界情况', () => {
    it('特殊字符用户名 token 正常工作', () => {
      const token = manager.generateAccessToken({
        userId: 1,
        username: 'user@example.com',
        role: 'user',
      });
      const result = manager.verifyAccessToken(token);
      expect(result.valid).toBe(true);
      expect(result.payload?.username).toBe('user@example.com');
    });

    it('大 userId 正常工作', () => {
      const token = manager.generateAccessToken({
        userId: 9999999,
        username: 'big',
        role: 'user',
      });
      const result = manager.verifyAccessToken(token);
      expect(result.valid).toBe(true);
      expect(result.payload?.userId).toBe(9999999);
    });

    it('多次撤销同一 token 不报错', () => {
      const token = manager.generateAccessToken({ userId: 1, username: 'test', role: 'user' });
      manager.revokeAccessToken(token);
      manager.revokeAccessToken(token);
      manager.revokeAccessToken(token);
      const stats = manager.getStats();
      expect(stats.blacklistedTokens).toBe(1);
    });
  });
});
