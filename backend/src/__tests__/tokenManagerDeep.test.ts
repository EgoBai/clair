/**
 * tokenManager 深度契约测试（绑定真实生产实现）
 *
 * 绑定：backend/src/utils/tokenManager.ts
 *   :33 TokenManager 类（导出名见 :275）
 *   :82 generateAccessToken / :102 generateRefreshToken / :118 generateTokenPair
 *   :130 verifyAccessToken / :180 refreshAccessToken / :203 revokeAccessToken
 *   :231 cleanup / :256 getStats
 *   私有 sign（:72）不可直接调用，签名正确性改由「公开生成 + 独立 HMAC 复算 + 公开校验」验证。
 *
 * 本文件此前是「影子测试」：在测试里自建 createToken/verifyToken/isExpired/blacklist/Map
 * 等整套副本，断言的是副本而不是生产代码。现已全部改为 import 生产模块。
 *
 * 旧副本与生产实现的差异（一律以生产为准）：
 * 1. 旧 verifyToken 完全不校验 exp：过期 token 也返回 valid:true。生产 :155 判定
 *    claims.exp < now（秒级）返回 'Token 已过期'，因此旧「过期」用例只是自证副本。
 * 2. 旧 isExpired 用毫秒 Date.now() > payload.exp；生产 exp 是秒级 Unix 时间戳
 *    （:84 Math.floor(Date.now()/1000)），两者单位不同，旧断言不能用于生产。
 * 3. 生产 verifyAccessToken 返回投影 { userId, username, role }（:166-170），
 *    iat/exp/jti 与业务扩展字段都被丢弃；旧副本原样返回整个 payload。
 * 4. 生产黑名单检查（:133）在格式校验之前，且黑名单是实例内存状态，不跨实例。
 * 5. 生产对签名长度不等的情况由 crypto.timingSafeEqual 抛错兜底，错误文案是
 *    'Token 验证失败'（:173），与等长签名的 'Token 签名无效'（:147）区分开。
 *
 * 时间：vi.useFakeTimers + vi.setSystemTime/advanceTimersByTime；无真实等待、无 Math.random。
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import crypto from 'crypto';
import { tokenManager, TokenManager } from '../utils/tokenManager';
import type { TokenPayload, TokenPair } from '../utils/tokenManager';

const SECRET = 'deep-test-secret-key';
const BASE_TIME = Date.UTC(2026, 0, 1, 0, 0, 0); // 2026-01-01T00:00:00Z，整秒
const BASE_SECONDS = BASE_TIME / 1000;
const HEADER_B64 = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9'; // {"alg":"HS256","typ":"JWT"}
const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

const basePayload: TokenPayload = { userId: 42, username: 'deepuser', role: 'user' };

function createManager(
  overrides: { secret?: string; accessExpiresIn?: number; refreshExpiresIn?: number } = {},
): TokenManager {
  return new TokenManager({
    secret: SECRET,
    accessExpiresIn: 60,
    refreshExpiresIn: 3600,
    ...overrides,
  });
}

function segments(token: string): [string, string, string] {
  const parts = token.split('.');
  return [parts[0], parts[1], parts[2]];
}

function decodeJson(segment: string): Record<string, unknown> {
  return JSON.parse(Buffer.from(segment, 'base64url').toString('utf-8')) as Record<string, unknown>;
}

/**
 * 按 HS256 规范独立复算签名，只用于构造「签名正确但内容畸形」的伪造 token。
 * 这不是把生产实现搬进测试：生产用的是私有 sign()，这里只复现 JWT 标准公式作为 oracle。
 */
function forgeToken(headerB64: string, payloadB64: string, secret: string): string {
  const signature = crypto
    .createHmac('sha256', secret)
    .update(`${headerB64}.${payloadB64}`)
    .digest('base64url');
  return `${headerB64}.${payloadB64}.${signature}`;
}

describe('tokenManager — 生产实现契约', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(BASE_TIME);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('generateAccessToken — JWT 结构', () => {
    it('生成三段 base64url 结构，header 段是固定常量', () => {
      const token = createManager().generateAccessToken(basePayload);

      expect(token).toMatch(/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
      expect(token.split('.')).toHaveLength(3);
      expect(segments(token)[0]).toBe(HEADER_B64);
      expect(decodeJson(segments(token)[0])).toEqual({ alg: 'HS256', typ: 'JWT' });
    });

    it('签名是 header.payload 的 HMAC-SHA256 base64url（长度 43）', () => {
      const token = createManager().generateAccessToken(basePayload);
      const [headerB64, payloadB64, signature] = segments(token);

      const expected = crypto
        .createHmac('sha256', SECRET)
        .update(`${headerB64}.${payloadB64}`)
        .digest('base64url');

      expect(signature).toBe(expected);
      expect(signature).toHaveLength(43);
      expect(signature).toMatch(/^[A-Za-z0-9_-]{43}$/);
    });

    it('三段都不含 base64url 之外的 + / =', () => {
      const token = createManager().generateAccessToken(basePayload);

      for (const part of segments(token)) {
        expect(part).not.toContain('+');
        expect(part).not.toContain('/');
        expect(part).not.toContain('=');
      }
    });

    it('iat/exp 取自 fake 时钟，jti 是 UUID v4', () => {
      const token = createManager({ accessExpiresIn: 90 }).generateAccessToken(basePayload);
      const claims = decodeJson(segments(token)[1]);

      expect(claims.iat).toBe(BASE_SECONDS);
      expect(claims.exp).toBe(BASE_SECONDS + 90);
      expect(claims.jti).toMatch(UUID_V4);
      expect(typeof claims.jti).toBe('string');
    });

    it('保留调用方 claims（含扩展字段）', () => {
      const payload: TokenPayload = { ...basePayload, department: 'trading', locale: 'zh-CN' };
      const token = createManager().generateAccessToken(payload);
      const claims = decodeJson(segments(token)[1]);

      expect(claims.userId).toBe(42);
      expect(claims.username).toBe('deepuser');
      expect(claims.role).toBe('user');
      expect(claims.department).toBe('trading');
      expect(claims.locale).toBe('zh-CN');
    });

    it('同一 payload 连续生成 token 不同（jti 唯一）', () => {
      const manager = createManager();
      const first = manager.generateAccessToken(basePayload);
      const second = manager.generateAccessToken(basePayload);

      expect(first).not.toBe(second);
      expect(decodeJson(segments(first)[1]).jti).not.toBe(decodeJson(segments(second)[1]).jti);
    });

    it('不修改调用方传入的 payload 对象', () => {
      const payload: TokenPayload = { userId: 7, username: 'u7', role: 'admin' };

      createManager().generateAccessToken(payload);

      expect(payload).toEqual({ userId: 7, username: 'u7', role: 'admin' });
      expect(payload).not.toHaveProperty('iat');
      expect(payload).not.toHaveProperty('exp');
    });
  });

  describe('verifyAccessToken — 正常路径', () => {
    it('自签 token 通过校验，并只返回 userId/username/role 投影', () => {
      const manager = createManager();
      const token = manager.generateAccessToken(basePayload);

      const result = manager.verifyAccessToken(token);

      expect(result.valid).toBe(true);
      expect(result.error).toBeUndefined();
      expect(result.payload).toEqual({ userId: 42, username: 'deepuser', role: 'user' });
      expect(Object.keys(result.payload!)).toEqual(['userId', 'username', 'role']);
      expect(result.payload).not.toHaveProperty('exp');
      expect(result.payload).not.toHaveProperty('jti');
    });

    it('同 secret 的另一个实例也接受该 token', () => {
      const signer = createManager();
      const verifier = createManager();
      const token = signer.generateAccessToken(basePayload);

      expect(verifier.verifyAccessToken(token).valid).toBe(true);
    });

    it('不同 secret 的实例以「签名无效」拒绝', () => {
      const signer = createManager();
      const other = createManager({ secret: 'another-secret' });

      const result = other.verifyAccessToken(signer.generateAccessToken(basePayload));

      expect(result.valid).toBe(false);
      expect(result.error).toBe('Token 签名无效');
      expect(result.payload).toBeUndefined();
    });
  });

  describe('verifyAccessToken — 篡改与畸形', () => {
    it('篡改 payload 但保留原签名 → 签名无效', () => {
      const manager = createManager();
      const [headerB64, , signature] = segments(manager.generateAccessToken(basePayload));
      const forgedPayload = Buffer.from(JSON.stringify({ ...basePayload, userId: 999 })).toString('base64url');

      const result = manager.verifyAccessToken(`${headerB64}.${forgedPayload}.${signature}`);

      expect(result.valid).toBe(false);
      expect(result.error).toBe('Token 签名无效');
    });

    it('把 header 改成 alg=none → 仍被签名校验拦下', () => {
      const manager = createManager();
      const [, payloadB64, signature] = segments(manager.generateAccessToken(basePayload));
      const noneHeader = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url');

      const result = manager.verifyAccessToken(`${noneHeader}.${payloadB64}.${signature}`);

      // 生产不读取 header.alg（:142 只取字符串），安全性完全依赖签名覆盖 header
      expect(result.valid).toBe(false);
      expect(result.error).toBe('Token 签名无效');
    });

    it('等长签名翻转一个字符 → 签名无效', () => {
      const manager = createManager();
      const [headerB64, payloadB64, signature] = segments(manager.generateAccessToken(basePayload));
      const flipped = (signature[0] === 'A' ? 'B' : 'A') + signature.slice(1);

      const result = manager.verifyAccessToken(`${headerB64}.${payloadB64}.${flipped}`);

      expect(result.valid).toBe(false);
      expect(result.error).toBe('Token 签名无效');
    });

    it('截断签名导致长度不等 → 「Token 验证失败」', () => {
      const manager = createManager();
      const token = manager.generateAccessToken(basePayload);

      const result = manager.verifyAccessToken(token.slice(0, -1));

      expect(result.valid).toBe(false);
      expect(result.error).toBe('Token 验证失败');
    });

    it('空签名段 → 「Token 验证失败」', () => {
      const manager = createManager();
      const [headerB64, payloadB64] = segments(manager.generateAccessToken(basePayload));

      const result = manager.verifyAccessToken(`${headerB64}.${payloadB64}.`);

      expect(result.valid).toBe(false);
      expect(result.error).toBe('Token 验证失败');
    });

    it('段数不为 3 的 token → 「Token 格式无效」', () => {
      const manager = createManager();

      for (const malformed of ['not-a-jwt', 'a.b', '', 'a.b.c.d']) {
        const result = manager.verifyAccessToken(malformed);
        expect(result.valid).toBe(false);
        expect(result.error).toBe('Token 格式无效');
      }
    });

    it('三段但签名段无意义 → 「Token 验证失败」', () => {
      const manager = createManager();

      const result = manager.verifyAccessToken('a.b.c');

      expect(result.valid).toBe(false);
      expect(result.error).toBe('Token 验证失败');
    });

    it('签名正确但 payload 不是 JSON → 「Token 验证失败」', () => {
      const manager = createManager();
      const payloadB64 = Buffer.from('{not-json').toString('base64url');
      const forged = forgeToken(HEADER_B64, payloadB64, SECRET);

      const result = manager.verifyAccessToken(forged);

      expect(result.valid).toBe(false);
      expect(result.error).toBe('Token 验证失败');
    });
  });

  describe('verifyAccessToken — 过期与 nbf（fake 时钟）', () => {
    it('exp 等于当前秒时仍有效（生产判定 exp < now）', () => {
      const manager = createManager({ accessExpiresIn: 60 });
      const token = manager.generateAccessToken(basePayload);

      vi.advanceTimersByTime(60_000);
      const atBoundary = manager.verifyAccessToken(token);

      expect(atBoundary.valid).toBe(true);
      expect(decodeJson(segments(token)[1]).exp).toBe(BASE_SECONDS + 60);
    });

    it('越过 exp 一秒后 → 「Token 已过期」', () => {
      const manager = createManager({ accessExpiresIn: 60 });
      const token = manager.generateAccessToken(basePayload);

      vi.advanceTimersByTime(61_000);
      const result = manager.verifyAccessToken(token);

      expect(result.valid).toBe(false);
      expect(result.error).toBe('Token 已过期');
    });

    it('expiresIn=1 时 1000ms 边界仍有效、2000ms 过期', () => {
      const manager = createManager({ accessExpiresIn: 1 });
      const token = manager.generateAccessToken(basePayload);

      vi.advanceTimersByTime(1_000);
      expect(manager.verifyAccessToken(token).valid).toBe(true);

      vi.advanceTimersByTime(1_000);
      const result = manager.verifyAccessToken(token);
      expect(result.valid).toBe(false);
      expect(result.error).toBe('Token 已过期');
    });

    it('nbf 未到 → 「Token 尚未生效」，到点后可校验', () => {
      const manager = createManager({ accessExpiresIn: 3600 });
      const payload: TokenPayload = { ...basePayload, nbf: BASE_SECONDS + 10 };
      const token = manager.generateAccessToken(payload);

      vi.advanceTimersByTime(9_000);
      const early = manager.verifyAccessToken(token);
      expect(early.valid).toBe(false);
      expect(early.error).toBe('Token 尚未生效');

      vi.advanceTimersByTime(1_000);
      expect(manager.verifyAccessToken(token).valid).toBe(true);
    });
  });

  describe('黑名单', () => {
    it('撤销后该实例拒绝，并计入 getStats', () => {
      const manager = createManager();
      const token = manager.generateAccessToken(basePayload);

      manager.revokeAccessToken(token);
      const result = manager.verifyAccessToken(token);

      expect(result.valid).toBe(false);
      expect(result.error).toBe('Token 已被撤销');
      expect(manager.getStats().blacklistedTokens).toBe(1);
    });

    it('黑名单检查先于格式校验', () => {
      const manager = createManager();
      manager.revokeAccessToken('garbage-token');

      const result = manager.verifyAccessToken('garbage-token');

      expect(result.error).toBe('Token 已被撤销');
    });

    it('黑名单是实例内存状态，不跨实例生效', () => {
      const revoker = createManager();
      const other = createManager();
      const token = revoker.generateAccessToken(basePayload);

      revoker.revokeAccessToken(token);

      expect(revoker.verifyAccessToken(token).error).toBe('Token 已被撤销');
      expect(other.verifyAccessToken(token).valid).toBe(true);
      expect(other.getStats().blacklistedTokens).toBe(0);
    });
  });

  describe('generateTokenPair 与 refresh 轮换', () => {
    it('返回 Bearer 组合，expiresIn 取构造参数', () => {
      const pair: TokenPair = createManager({ accessExpiresIn: 60 }).generateTokenPair(basePayload);

      expect(pair.tokenType).toBe('Bearer');
      expect(pair.expiresIn).toBe(60);
      expect(pair.accessToken.split('.')).toHaveLength(3);
      expect(pair.refreshToken).toMatch(/^[0-9a-f]{96}$/);
    });

    it('refresh token 是 48 字节 hex（96 字符）并入库', () => {
      const manager = createManager();
      const refreshToken = manager.generateRefreshToken(basePayload);

      expect(refreshToken).toHaveLength(96);
      expect(refreshToken).toMatch(/^[0-9a-f]{96}$/);
      expect(manager.getStats().activeRefreshTokens).toBe(1);
    });

    it('刷新后旧 refresh 立即失效，并换发新 access/refresh', () => {
      const manager = createManager();
      const pair = manager.generateTokenPair(basePayload);

      const refreshed = manager.refreshAccessToken(pair.refreshToken);

      expect(refreshed).not.toBeNull();
      expect(refreshed!.accessToken).not.toBe(pair.accessToken);
      expect(refreshed!.refreshToken).not.toBe(pair.refreshToken);
      expect(manager.refreshAccessToken(pair.refreshToken)).toBeNull();
      expect(manager.getStats().activeRefreshTokens).toBe(1);
      expect(manager.verifyAccessToken(refreshed!.accessToken).valid).toBe(true);
    });

    it('未知 refresh token → null', () => {
      const manager = createManager();

      expect(manager.refreshAccessToken('nonexistent-refresh')).toBeNull();
      expect(manager.getStats().activeRefreshTokens).toBe(0);
    });

    it('refresh token 过期后刷新返回 null 并删除记录', () => {
      const manager = createManager({ refreshExpiresIn: 10 });
      const refreshToken = manager.generateRefreshToken(basePayload);

      vi.advanceTimersByTime(11_000);
      const refreshed = manager.refreshAccessToken(refreshToken);

      expect(refreshed).toBeNull();
      expect(manager.getStats().activeRefreshTokens).toBe(0);
    });

    it('revokeRefreshToken 以布尔值报告是否存在', () => {
      const manager = createManager();
      const refreshToken = manager.generateRefreshToken(basePayload);

      expect(manager.revokeRefreshToken(refreshToken)).toBe(true);
      expect(manager.revokeRefreshToken(refreshToken)).toBe(false);
      expect(manager.getStats().activeRefreshTokens).toBe(0);
    });

    it('revokeAllUserTokens 只清该用户的 refresh token', () => {
      const manager = createManager();
      const otherUser: TokenPayload = { userId: 99, username: 'other', role: 'admin' };
      manager.generateRefreshToken(basePayload);
      manager.generateRefreshToken(basePayload);
      manager.generateRefreshToken(basePayload);
      manager.generateRefreshToken(otherUser);

      const revoked = manager.revokeAllUserTokens(42);

      expect(revoked).toBe(3);
      expect(manager.getStats().activeRefreshTokens).toBe(1);
      expect(manager.revokeAllUserTokens(42)).toBe(0);
    });
  });

  describe('cleanup 与容量治理', () => {
    it('只清理过期 refresh token，保留有效条目', () => {
      const manager = createManager({ refreshExpiresIn: 10 });
      manager.generateRefreshToken(basePayload);
      vi.advanceTimersByTime(11_000);
      manager.generateRefreshToken(basePayload);

      const cleaned = manager.cleanup();

      expect(cleaned).toBe(1);
      expect(manager.getStats().activeRefreshTokens).toBe(1);
    });

    it('黑名单超过 10000 条时裁剪为最近 5000 条', () => {
      const manager = createManager();
      for (let i = 0; i <= 10_000; i++) {
        manager.revokeAccessToken(`revoked-${i}`);
      }
      expect(manager.getStats().blacklistedTokens).toBe(10_001);

      const cleaned = manager.cleanup();

      expect(cleaned).toBe(0);
      expect(manager.getStats().blacklistedTokens).toBe(5_000);
      expect(manager.verifyAccessToken('revoked-10000').error).toBe('Token 已被撤销');
      expect(manager.verifyAccessToken('revoked-5001').error).toBe('Token 已被撤销');
      expect(manager.verifyAccessToken('revoked-5000').error).not.toBe('Token 已被撤销');
    });
  });

  describe('编码与边界 payload', () => {
    it('unicode 与大 payload 可原样回读', () => {
      const manager = createManager();
      const payload: TokenPayload = {
        userId: 7,
        username: '张三@example.com',
        role: 'user',
        data: 'x'.repeat(10_000),
      };

      const token = manager.generateAccessToken(payload);
      const result = manager.verifyAccessToken(token);
      const claims = decodeJson(segments(token)[1]);

      expect(token.split('.')).toHaveLength(3);
      expect(result.valid).toBe(true);
      expect(result.payload!.username).toBe('张三@example.com');
      expect((claims.data as string).length).toBe(10_000);
    });

    it('导出的单例可自签自验', () => {
      const token = tokenManager.generateAccessToken(basePayload);
      const result = tokenManager.verifyAccessToken(token);

      expect(result.valid).toBe(true);
      expect(result.payload!.userId).toBe(42);
      expect(token.split('.')).toHaveLength(3);
    });
  });

  describe('secret 来源：显式参数优先于 env', () => {
    const originalEnvSecret = process.env.JWT_SECRET;

    afterEach(() => {
      if (originalEnvSecret === undefined) {
        delete process.env.JWT_SECRET;
      } else {
        process.env.JWT_SECRET = originalEnvSecret;
      }
    });

    it('构造参数 secret 覆盖 JWT_SECRET', () => {
      process.env.JWT_SECRET = 'env-secret';
      const envManager = new TokenManager();
      const optionManager = new TokenManager({ secret: 'explicit-secret' });
      const token = optionManager.generateAccessToken(basePayload);

      expect(envManager.verifyAccessToken(token).valid).toBe(false);
      expect(envManager.verifyAccessToken(token).error).toBe('Token 签名无效');
      expect(new TokenManager({ secret: 'env-secret' }).verifyAccessToken(token).valid).toBe(false);
      expect(optionManager.verifyAccessToken(token).valid).toBe(true);
    });

    it('未传 secret 时回退到 JWT_SECRET', () => {
      process.env.JWT_SECRET = 'shared-env-secret';
      const fromEnv = new TokenManager();
      const explicit = new TokenManager({ secret: 'shared-env-secret' });

      expect(explicit.verifyAccessToken(fromEnv.generateAccessToken(basePayload)).valid).toBe(true);
    });

    it('env 缺失时各实例生成独立随机 secret', () => {
      delete process.env.JWT_SECRET;
      const first = new TokenManager();
      const second = new TokenManager();

      const result = second.verifyAccessToken(first.generateAccessToken(basePayload));

      expect(result.valid).toBe(false);
      expect(result.error).toBe('Token 签名无效');
    });
  });
});
