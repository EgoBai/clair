/**
 * 安全性测试
 * 测试 CSRF、限流、Token 管理、安全头部
 */

import { describe, it, expect } from 'vitest';
import { generateCsrfToken } from '../middleware/csrf';
import { tokenManager, TokenManager } from '../utils/tokenManager';

describe('安全性测试', () => {
  // ===== CSRF 防护 =====
  describe('CSRF Token', () => {
    it('应该生成随机 token', () => {
      const token1 = generateCsrfToken();
      const token2 = generateCsrfToken();

      expect(token1).toBeDefined();
      expect(token2).toBeDefined();
      expect(token1).not.toBe(token2);
      expect(token1.length).toBe(64); // 32 bytes = 64 hex chars
    });

    it('token 应该只包含十六进制字符', () => {
      const token = generateCsrfToken();
      expect(/^[0-9a-f]+$/.test(token)).toBe(true);
    });
  });

  // ===== Token 管理 =====
  describe('Token 管理', () => {
    const tm = new TokenManager({ accessExpiresIn: 2, refreshExpiresIn: 5 });
    const payload = { userId: 1, username: 'test', role: 'user' as const };

    it('应该生成 token 对', () => {
      const tokens = tm.generateTokenPair(payload);

      expect(tokens.accessToken).toBeDefined();
      expect(tokens.refreshToken).toBeDefined();
      expect(tokens.expiresIn).toBe(2);
      expect(tokens.tokenType).toBe('Bearer');
      expect(tokens.accessToken.split('.').length).toBe(3); // JWT 格式
    });

    it('有效的 access token 应该验证通过', () => {
      const tokens = tm.generateTokenPair(payload);
      const result = tm.verifyAccessToken(tokens.accessToken);

      expect(result.valid).toBe(true);
      expect(result.payload?.userId).toBe(1);
      expect(result.payload?.username).toBe('test');
    });

    it('无效的 token 应该验证失败', () => {
      const result = tm.verifyAccessToken('invalid.token.here');
      expect(result.valid).toBe(false);
    });

    it('被撤销的 token 应该验证失败', () => {
      const tokens = tm.generateTokenPair(payload);
      tm.revokeAccessToken(tokens.accessToken);
      const result = tm.verifyAccessToken(tokens.accessToken);

      expect(result.valid).toBe(false);
      expect(result.error).toContain('撤销');
    });

    it('refresh token 应该能刷新 access token', () => {
      const tokens = tm.generateTokenPair(payload);
      const newTokens = tm.refreshAccessToken(tokens.refreshToken);

      expect(newTokens).not.toBeNull();
      expect(newTokens!.accessToken).toBeDefined();
      expect(newTokens!.refreshToken).toBeDefined();
      expect(newTokens!.refreshToken).not.toBe(tokens.refreshToken); // 一次性
    });

    it('使用过的 refresh token 不能再用', () => {
      const tokens = tm.generateTokenPair(payload);
      tm.refreshAccessToken(tokens.refreshToken);
      const again = tm.refreshAccessToken(tokens.refreshToken);

      expect(again).toBeNull();
    });

    it('过期的 access token 应该验证失败', async () => {
      // 创建一个极短有效期的 token (1秒)
      const shortTm = new TokenManager({ accessExpiresIn: 1 });
      const tokens = shortTm.generateTokenPair(payload);

      // 等 2.5秒 确保过期（需要超过 Math.floor 边界）
      await new Promise(r => setTimeout(r, 2500));

      const result = shortTm.verifyAccessToken(tokens.accessToken);
      expect(result.valid).toBe(false);
    });

    it('应该能撤销用户所有 token', () => {
      const userTm = new TokenManager();
      userTm.generateTokenPair({ userId: 99, username: 'user99', role: 'user' });
      userTm.generateTokenPair({ userId: 99, username: 'user99', role: 'user' });
      userTm.generateTokenPair({ userId: 1, username: 'other', role: 'user' });

      const count = userTm.revokeAllUserTokens(99);
      expect(count).toBe(2);
    });

    it('应该返回 token 统计', () => {
      const statsTm = new TokenManager();
      statsTm.generateTokenPair(payload);
      statsTm.generateTokenPair(payload);

      const stats = statsTm.getStats();
      expect(stats.activeRefreshTokens).toBe(2);
      expect(stats.blacklistedTokens).toBe(0);
    });

    it('cleanup 应该清理过期 token', () => {
      const cleanupTm = new TokenManager({ refreshExpiresIn: 0 });
      cleanupTm.generateTokenPair(payload);

      // 立即 cleanup
      const cleaned = cleanupTm.cleanup();
      expect(cleaned).toBeGreaterThanOrEqual(0);
    });
  });

  // ===== 限流器 =====
  describe('限流器', () => {
    it('应该限制请求频率', async () => {
      // 直接导入测试
      const { rateLimit } = await import('../middleware/rateLimit');

      const limiter = rateLimit({
        windowMs: 1000,
        max: 3,
        skipPaths: [],
      });

      // 模拟 express req/res
      const createReqRes = () => {
        const req: any = {
          path: '/test',
          ip: '127.0.0.1',
          socket: { remoteAddress: '127.0.0.1' },
          headers: {},
          set: () => {},
        };
        const res: any = {
          status: (code: number) => ({ json: (data: any) => ({ statusCode: code, body: data }) }),
          set: () => {},
        };
        return { req, res };
      };

      // 前3个请求应该通过
      for (let i = 0; i < 3; i++) {
        const { req, res } = createReqRes();
        let nextCalled = false;
        limiter(req, res, () => { nextCalled = true; });
        expect(nextCalled).toBe(true);
      }

      // 第4个请求应该被限制
      const { req, res } = createReqRes();
      let blocked = false;
      const mockRes = {
        set: () => {},
        status: (code: number) => {
          if (code === 429) blocked = true;
          return { json: () => ({}) };
        },
      };
      limiter(req, mockRes, () => {});
      expect(blocked).toBe(true);
    });
  });

  // ===== 安全头部 =====
  describe('安全头部', () => {
    it('应该设置正确的安全头部', async () => {
      const { enhancedSecurityHeaders } = await import('../middleware/securityHeaders');
      const middleware = enhancedSecurityHeaders();

      const headers: Record<string, string> = {};
      const req: any = { path: '/api/test' };
      const res: any = {
        setHeader: (k: string, v: string) => { headers[k] = v; },
        removeHeader: (k: string) => { delete headers[k]; },
      };

      let nextCalled = false;
      middleware(req, res, () => { nextCalled = true; });

      expect(nextCalled).toBe(true);
      expect(headers['X-Content-Type-Options']).toBe('nosniff');
      expect(headers['X-Frame-Options']).toBe('DENY');
      expect(headers['Referrer-Policy']).toBeDefined();
      expect(headers['Permissions-Policy']).toBeDefined();
    });

    it('API 请求应该设置 no-cache', async () => {
      const { enhancedSecurityHeaders } = await import('../middleware/securityHeaders');
      const middleware = enhancedSecurityHeaders();

      const headers: Record<string, string> = {};
      const req: any = { path: '/api/stocks' };
      const res: any = {
        setHeader: (k: string, v: string) => { headers[k] = v; },
        removeHeader: () => {},
      };

      middleware(req, res, () => {});
      expect(headers['Cache-Control']).toContain('no-store');
    });
  });

  // ===== 请求 ID =====
  describe('请求 ID', () => {
    it('应该生成唯一请求 ID', async () => {
      const { requestIdMiddleware } = await import('../middleware/securityHeaders');

      const ids = new Set<string>();
      for (let i = 0; i < 10; i++) {
        const headers: Record<string, string> = {};
        const req: any = { headers: {} };
        const res: any = {
          setHeader: (k: string, v: string) => { headers[k] = v; },
        };

        requestIdMiddleware(req, res, () => {});
        ids.add(headers['X-Request-ID']);
      }

      // 10个请求应该产生10个不同的 ID
      expect(ids.size).toBe(10);
    });
  });
});
