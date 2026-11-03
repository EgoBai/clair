/**
 * P3-A3 安全加固 —— 影子测试迁移（批次 15）
 *
 * 迁移说明（测试不再内联复制生产实现，改为 import 生产真源）：
 * - JWT 签发/验证：backend/src/middleware/auth.ts
 *     signAccessToken(L120) / verifyAccessToken(L143)
 * - Token 刷新：backend/src/middleware/auth.ts
 *     generateRefreshToken(L176) / consumeRefreshToken(L190) / cleanup(L418)
 * - 邮箱/手机号脱敏：frontend/src/utils/securityEngine.ts
 *     maskEmail(L303) / maskPhone(L291)
 * - 速率限制：backend/src/middleware/rateLimit.ts rateLimit(L90)
 * - 安全响应头：backend/src/middleware/securityHeaders.ts enhancedSecurityHeaders(L41)
 * - 请求体大小限制：backend/src/middleware/validation.ts limitBodySize(L716)
 * - CORS：backend/src/middleware/corsConfig.ts corsMiddleware(L146)
 *
 * 旧断言修正（旧断言与生产冲突，以生产为准）：
 * - maskEmail('test@example.com')：旧期望 'tes***@example.com'，生产 't**t@example.com'
 *   （maskEmail 只保留 local 首尾字符，local 长度 <= 2 时不遮挡）
 * - maskEmail('ab@test.com')：旧期望 'a***@test.com'，生产 'ab@test.com'
 * - maskEmail('a@b.com')：旧期望 'a***@b.com'，生产 'a@b.com'
 * - 旧 JWT 过期用例用 signAccessToken(payload, -1) 制造过期；生产 signAccessToken 不接受
 *   过期参数（固定 15 分钟），改用 fake timers 推进 16 分钟验证过期
 * - 旧“全局安全策略”3 个用例为恒真断言（expect(true).toBe(true) 等），
 *   改为对生产中间件的真实断言
 *
 * 保留少量内联：
 * - maskSensitiveValue：生产无对应导出，未迁移
 *   （backend/src/middleware/requestLogger.ts:62 为模块内私有函数，未 export）
 */

import { describe, it, expect, vi, afterEach, afterAll } from 'vitest';
import {
  signAccessToken,
  verifyAccessToken,
  generateRefreshToken,
  consumeRefreshToken,
  cleanup,
} from '../middleware/auth';
import { maskEmail, maskPhone } from '../../../frontend/src/utils/securityEngine';
import { rateLimit } from '../middleware/rateLimit';
import { enhancedSecurityHeaders } from '../middleware/securityHeaders';
import { limitBodySize } from '../middleware/validation';
import { corsMiddleware } from '../middleware/corsConfig';

// 生产无对应导出，未迁移：backend/src/middleware/requestLogger.ts:62 的 maskSensitiveValue 未导出
function maskSensitiveValue(value: string): string {
  if (value.length <= 4) return '****';
  return value.slice(0, 2) + '****' + value.slice(-2);
}

function createRes() {
  const res: Record<string, any> = {
    statusCode: 200,
    body: undefined,
    headers: {} as Record<string, string>,
    removed: [] as string[],
    status(code: number) {
      res.statusCode = code;
      return res;
    },
    json(payload: any) {
      res.body = payload;
      return res;
    },
    setHeader(name: string, value: string) {
      res.headers[name.toLowerCase()] = value;
    },
    set(name: string, value: string) {
      res.headers[name.toLowerCase()] = value;
      return res;
    },
    removeHeader(name: string) {
      res.removed.push(name.toLowerCase());
      delete res.headers[name.toLowerCase()];
    },
    end() {
      return res;
    },
  };
  return res;
}

function createReq(overrides: Record<string, any> = {}) {
  return {
    method: 'GET',
    path: '/api/test',
    ip: '203.0.113.10',
    headers: {} as Record<string, any>,
    query: {} as Record<string, any>,
    body: {} as Record<string, any>,
    params: {} as Record<string, any>,
    socket: { remoteAddress: '203.0.113.10' },
    ...overrides,
  };
}

describe('P3-A3 安全加固', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  afterAll(() => {
    cleanup();
  });

  describe('JWT Token 签发与验证', () => {
    it('应该签发有效的JWT token', () => {
      const token = signAccessToken({
        sub: 'user_123',
        email: 'test@example.com',
        roles: ['user'],
      });

      expect(token).toBeDefined();
      expect(token.split('.')).toHaveLength(3);
    });

    it('应该能验证有效的JWT token', () => {
      const token = signAccessToken({ sub: 'user_123', email: 'test@example.com' });
      const payload = verifyAccessToken(token);

      expect(payload).not.toBeNull();
      expect(payload!.sub).toBe('user_123');
      expect(payload!.email).toBe('test@example.com');
      expect(payload!.iss).toBe('a-stock-api');
      expect(payload!.jti).toBeDefined();
    });

    it('应该拒绝篡改过的token', () => {
      const token = signAccessToken({ sub: 'user_123', email: 'test@example.com' });
      const parts = token.split('.');

      expect(verifyAccessToken(parts[0] + '.' + parts[1] + '.invalidsignature')).toBeNull();
    });

    it('应该拒绝过期的token', () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'));

      const token = signAccessToken({ sub: 'user_123', email: 'test@example.com' });

      // 生产 signAccessToken 固定 15 分钟有效期，向前推进 16 分钟后应判定过期
      vi.setSystemTime(new Date('2026-01-01T00:16:00.000Z'));
      expect(verifyAccessToken(token)).toBeNull();
    });

    it('应该拒绝不完整的token格式', () => {
      expect(verifyAccessToken('invalid')).toBeNull();
      expect(verifyAccessToken('header.payload')).toBeNull();
      expect(verifyAccessToken('')).toBeNull();
    });

    it('每个JWT应该有唯一的jti', () => {
      const payload1 = verifyAccessToken(
        signAccessToken({ sub: 'user_123', email: 'test@example.com' })
      );
      const payload2 = verifyAccessToken(
        signAccessToken({ sub: 'user_123', email: 'test@example.com' })
      );

      expect(payload1).not.toBeNull();
      expect(payload2).not.toBeNull();
      expect(payload1!.jti).not.toBe(payload2!.jti);
    });

    it('应该从token中正确解析角色', () => {
      const token = signAccessToken({
        sub: 'user_123',
        email: 'test@example.com',
        roles: ['admin', 'trader'],
      });

      expect(verifyAccessToken(token)!.roles).toEqual(['admin', 'trader']);
    });
  });

  describe('Token刷新机制', () => {
    it('刷新令牌应该产生新的 accessToken 和 refreshToken', () => {
      const oldRefreshToken = generateRefreshToken('refresh_user_1', 'test@example.com');

      const result = consumeRefreshToken(oldRefreshToken);

      expect(result).not.toBeNull();
      expect(result!.accessToken).toBeDefined();
      expect(result!.refreshToken).toBeDefined();
      expect(result!.refreshToken).not.toBe(oldRefreshToken);
      expect(verifyAccessToken(result!.accessToken)).not.toBeNull();
      expect(result!.userId).toBe('refresh_user_1');
      expect(result!.email).toBe('test@example.com');
    });

    it('刷新后旧refreshToken应失效', () => {
      const refreshToken = generateRefreshToken('refresh_user_2', 'test@example.com');

      expect(consumeRefreshToken(refreshToken)).not.toBeNull();
      expect(consumeRefreshToken(refreshToken)).toBeNull();
    });

    it('应该拒绝过期的refreshToken', () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'));

      const refreshToken = generateRefreshToken('refresh_user_3', 'test@example.com');

      // 生产 refreshToken 有效期 7 天，推进 8 天后应过期
      vi.setSystemTime(new Date('2026-01-09T00:00:00.000Z'));
      expect(consumeRefreshToken(refreshToken)).toBeNull();
    });

    it('应该拒绝不存在的refreshToken', () => {
      expect(consumeRefreshToken('nonexistent-refresh-token')).toBeNull();
    });

    it('连续的刷新应该形成有效的token链', () => {
      let refreshToken = generateRefreshToken('refresh_user_4', 'test@example.com');

      for (let i = 0; i < 3; i++) {
        const result = consumeRefreshToken(refreshToken);

        expect(result).not.toBeNull();
        expect(verifyAccessToken(result!.accessToken)).not.toBeNull();
        expect(result!.refreshToken).not.toBe(refreshToken);
        refreshToken = result!.refreshToken;
      }
    });
  });

  describe('敏感数据脱敏', () => {
    it('邮箱脱敏应保留首尾字符并遮挡中间部分', () => {
      // 旧断言按内联实现“前3位 + ***”编写；生产 maskEmail 只保留首尾字符
      expect(maskEmail('test@example.com')).toBe('t**t@example.com');
      expect(maskEmail('ab@test.com')).toBe('ab@test.com');
      expect(maskEmail('a@b.com')).toBe('a@b.com');
    });

    it('邮箱脱敏应保留域名完整', () => {
      expect(maskEmail('user@gmail.com')).toContain('@gmail.com');
    });

    it('不包含@的字符串不应被处理', () => {
      expect(maskEmail('notanemail')).toBe('notanemail');
    });

    it('手机号脱敏应保留前3后4', () => {
      expect(maskPhone('13812345678')).toBe('138****5678');
    });

    it('短手机号应直接返回', () => {
      expect(maskPhone('12345')).toBe('12345');
    });

    it('通用脱敏短值应全掩', () => {
      expect(maskSensitiveValue('abc')).toBe('****');
    });

    it('通用脱敏应保留首尾2位', () => {
      expect(maskSensitiveValue('abcdefgh')).toBe('ab****gh');
      expect(maskSensitiveValue('token12345')).toBe('to****45');
    });
  });

  describe('Rate Limiting', () => {
    it('应该在限制内允许请求', () => {
      const limiter = rateLimit({ windowMs: 60000, max: 10, skipPaths: [] });
      let nextCalls = 0;

      for (let i = 0; i < 10; i++) {
        const res = createRes();
        limiter(createReq({ ip: '203.0.113.1' }), res, () => {
          nextCalls++;
        });
        expect(res.headers['x-ratelimit-remaining']).toBe(String(10 - i - 1));
      }

      expect(nextCalls).toBe(10);
    });

    it('超过限制应该拒绝', () => {
      const limiter = rateLimit({ windowMs: 60000, max: 10, skipPaths: [] });
      let nextCalls = 0;

      for (let i = 0; i < 10; i++) {
        limiter(createReq({ ip: '203.0.113.2' }), createRes(), () => {
          nextCalls++;
        });
      }

      const res = createRes();
      limiter(createReq({ ip: '203.0.113.2' }), res, () => {
        nextCalls++;
      });

      expect(res.statusCode).toBe(429);
      expect(res.body.success).toBe(false);
      expect(res.body.retryAfter).toBeGreaterThanOrEqual(0);
      expect(res.headers['x-ratelimit-remaining']).toBe('0');
      expect(nextCalls).toBe(10);
    });

    it('不同IP应该有独立的计数', () => {
      const limiter = rateLimit({ windowMs: 60000, max: 10, skipPaths: [] });

      for (let i = 0; i < 10; i++) {
        limiter(createReq({ ip: '203.0.113.3' }), createRes(), () => {});
      }

      let nextCalled = false;
      const res = createRes();
      limiter(createReq({ ip: '203.0.113.4' }), res, () => {
        nextCalled = true;
      });

      expect(nextCalled).toBe(true);
      expect(res.statusCode).toBe(200);
    });

    it('窗口过期后应该重置计数', () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-02-01T00:00:00.000Z'));

      const limiter = rateLimit({ windowMs: 60000, max: 5, skipPaths: [] });
      const req = () => createReq({ ip: '203.0.113.5' });

      for (let i = 0; i < 5; i++) {
        const res = createRes();
        limiter(req(), res, () => {});
        expect(res.statusCode).toBe(200);
      }

      const blocked = createRes();
      limiter(req(), blocked, () => {});
      expect(blocked.statusCode).toBe(429);

      // 推进 61 秒越过 60 秒窗口
      vi.setSystemTime(new Date('2026-02-01T00:01:01.000Z'));

      let nextCalled = false;
      const afterWindow = createRes();
      limiter(req(), afterWindow, () => {
        nextCalled = true;
      });

      expect(nextCalled).toBe(true);
      expect(afterWindow.statusCode).toBe(200);
    });
  });

  describe('全局安全策略', () => {
    it('安全响应头应默认启用', () => {
      const middleware = enhancedSecurityHeaders();
      const res = createRes();
      let nextCalled = false;

      middleware(createReq({ path: '/api/security' }), res, () => {
        nextCalled = true;
      });

      expect(nextCalled).toBe(true);
      expect(res.headers['x-content-type-options']).toBe('nosniff');
      expect(res.headers['x-frame-options']).toBe('DENY');
      expect(res.headers['x-xss-protection']).toBe('1; mode=block');
      expect(res.headers['strict-transport-security']).toContain('max-age=31536000');
      expect(res.headers['strict-transport-security']).toContain('includeSubDomains');
      expect(res.headers['content-security-policy']).toContain("default-src 'self'");
      expect(res.headers['content-security-policy']).toContain("frame-ancestors 'none'");
      expect(res.headers['referrer-policy']).toBe('strict-origin-when-cross-origin');
      expect(res.headers['permissions-policy']).toContain('camera=()');
      expect(res.headers['cache-control']).toContain('no-store');
      expect(res.removed).toContain('x-powered-by');
    });

    it('请求体大小应该有限制', () => {
      const middleware = limitBodySize(1024 * 1024);

      let nextCalled = false;
      const tooLarge = createRes();
      middleware(
        createReq({ headers: { 'content-length': String(1024 * 1024 + 1) } }),
        tooLarge,
        () => {
          nextCalled = true;
        }
      );

      expect(tooLarge.statusCode).toBe(413);
      expect(tooLarge.body.error).toBe('请求体过大');
      expect(nextCalled).toBe(false);

      const ok = createRes();
      middleware(createReq({ headers: { 'content-length': '100' } }), ok, () => {
        nextCalled = true;
      });
      expect(nextCalled).toBe(true);
    });

    it('CORS应该被配置', () => {
      const middleware = corsMiddleware({ origins: ['https://example.com'] });

      let nextCalled = false;
      const allowed = createRes();
      middleware(
        createReq({ method: 'GET', headers: { origin: 'https://example.com' } }),
        allowed,
        () => {
          nextCalled = true;
        }
      );

      expect(nextCalled).toBe(true);
      expect(allowed.headers['access-control-allow-origin']).toBe('https://example.com');
      expect(allowed.headers['access-control-allow-credentials']).toBe('true');

      const denied = createRes();
      middleware(
        createReq({ method: 'GET', headers: { origin: 'https://evil.example' } }),
        denied,
        () => {}
      );

      expect(denied.statusCode).toBe(403);
      expect(denied.body.code).toBe('CORS_ORIGIN_DENIED');

      const noOrigin = createRes();
      middleware(createReq({ method: 'GET', headers: {} }), noOrigin, () => {
        nextCalled = true;
      });
      expect(noOrigin.headers['access-control-allow-origin']).toBeUndefined();
    });
  });
});
