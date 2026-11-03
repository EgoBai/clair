/**
 * 用户系统增强测试
 * 影子测试迁移（批次 21a）：旧文件 49 个用例全部不 import 项目源码，JWT/Session/重置/验证/登录/TOTP
 * 都是自抄的假实现；本版改为绑定生产实现，生产无对应导出或口径不一致的用例保留内联并逐段标注「未迁移」。
 *
 * 绑定生产实现（唯一口径真源）：
 * - JWT / Refresh / 黑名单 / 一次性刷新 ← backend/src/utils/tokenManager.ts:33 TokenManager
 *   （:82 generateAccessToken、:102 generateRefreshToken、:118 generateTokenPair、:130 verifyAccessToken、
 *    :180 refreshAccessToken、:203 revokeAccessToken、:210 revokeRefreshToken）
 * - 密码重置 / 密码强度（重置场景）← backend/src/utils/userEnhanced.ts:23 PasswordResetManager
 *   （:33 createResetRequest、:78 verifyResetToken、:100 useResetToken、:120 validatePasswordStrength）
 * - 邮箱验证 ← backend/src/utils/userEnhanced.ts:166 EmailVerificationManager
 *   （:175 createVerification、:218 verifyEmail、:241 isVerified）
 * - Session 并发上限 / 续期 / 销毁 ← backend/src/utils/userEnhanced.ts:274 SessionManager
 *   （:283 createSession、:337 touchSession、:352 getUserSessions、:368 destroySession、:385 destroyOtherSessions）
 * - 登录锁定 / 登录日志 / 可疑 IP ← backend/src/utils/userEnhanced.ts:446 LoginSecurityManager
 *   （:456 canLogin、:480 recordAttempt、:507 unlockAccount、:514 isSuspiciousIP、:523 getLoginLog）
 * - 头像 / TOTP 两步验证 ← backend/src/utils/userDeepDive.ts:29 AvatarManager、:511 TwoFactorManager
 * - 用户名 / 邮箱 / 手机号校验 ← backend/src/models/User.ts:114/118/122
 * - 邮箱 / 手机号 / 密码校验（前端口径）← frontend/src/utils/securityEngine.ts:150/163/192
 *   （backend 测试 import frontend 源码在本仓有先例，见 riskMetricsEngine.test.ts:5 等）
 *
 * 未迁移（生产无对应导出，保留内联并标注原因）：
 * - 密码哈希 / 旧密码比对：生产 bcrypt 实现在 backend/src/api/user.ts:186/193，为路由文件内私有函数，未导出；
 *   本文件保留旧的结构性哈希断言，不虚构生产导出。
 * - 注册来源 source/referrer/utm：生产 User/UserPreferences 无 source/utm 字段，注册路由未导出；
 *   保留旧契约结构断言，另用 User.createdAt 绑定注册时间字段。
 * - 个人简介 200 字上限：生产只有 backend/src/api/social.ts:98 的 UserProfile.bio 字段，无校验导出。
 * - 重置邮件模板 / 验证成功通知：生产无邮件模板与通知模块（无 sendEmail/nodemailer/email_verified），
 *   仅 PasswordResetManager/EmailVerificationManager 返回 message；保留旧模板结构断言并标注。
 * - Session.requestCount：生产 Session 无该字段。
 * - 风险偏好 riskLevel/investmentStyle：生产用户模型与偏好均无该字段。
 *
 * 旧断言错在哪（旧值→生产值）：
 * - JWT payload 含 email：旧按 email 设计 → 生产 TokenPayload 是 {userId:number, username, role}，无 email。
 * - Access/Refresh 有效期：旧用数字常量比较 → 生产 refresh token 是不透明随机串，7 天 TTL 存在服务端 Map，
 *   需用 refreshAccessToken 行为验证；access 默认 3600s。
 * - Session 最大并发：旧 slice(-5) 得 sess_2 → 生产超 5 个时按 createdAt 删最旧，7 个剩后 5 个（device-2..6）。
 * - Session 续期/时间字段：旧用 ISO 字符串 → 生产用毫秒时间戳。
 * - 可疑登录：旧「IP 变更」→ 生产 isSuspiciousIP 是「15 分钟内同一 IP 请求数 > 20」，IP 变更不判可疑。
 * - 重置 token 前缀：旧 'reset_' → 生产 'rst_' + 64 hex；验证 token 前缀旧 'verify_' → 生产 'vrf_' + 64 hex。
 * - 重置限频：旧是纯计数 → 生产按邮箱 3 次/15 分钟，第 4 次返回「请求过于频繁，请15分钟后重试」。
 * - 密码强度：旧 getPasswordStrength 返回 1/2/3 分级 → 生产只有布尔/错误列表；且两处生产口径不同：
 *   securityEngine.validatePassword 要求 5 条全满足（'Password1' 缺特殊字符 → false），
 *   PasswordResetManager.validatePasswordStrength 要求 4 条中满足 3 条（'Password1' → true）。
 * - 用户名：旧允许中文、2–20 位 → 生产 /^[a-zA-Z0-9_]{3,20}$/，'张三' false、2 位 false。
 * - 手机号：旧不 strip → 生产前端 validatePhone 会先去掉空格与连字符（'138-1234-5678' 通过），后端校验不 strip。
 * - 邮箱：旧只断言 valid → 生产前端 validateEmail 还返回 sanitized（trim+lowercase）。
 * - 登录锁定：旧锁 lockedUntil 字段 → 生产用内存 Map（lockedAccounts），解锁由时间到期自动删除。
 * - TOTP：旧固定 secret 'JBSWY3DPEHPK3PXP' → 生产 generateSecret 随机 16 字节 base64（22 字符），
 *   验证码用 generateTOTP(secret, time) 生成。
 * - 头像：旧断言 http(s) / data:image → 生产 AvatarManager 只回 /avatars/{userId}/{hex}.webp 或 /defaults/*.png。
 * - 投资偏好：旧断言 favoriteSectors 非空 → 生产 getDefaultPreferences 默认 favoriteSectors: []（空数组）。
 *
 * 生产缺陷候选（未改生产代码，仅记录真实行为）：
 * - 密码强度三套口径不一致：securityEngine.validatePassword 5/5 硬规则、userEnhanced.validatePasswordStrength
 *   ≥3/4、api/user.ts:270 注册仅校验长度 ≥6。
 * - LoginSecurityManager:480 解锁后窗口内旧失败记录不清零：解锁后 15 分钟内再失败 1 次会立即重新锁定。
 * - tokenManager 黑名单只增不减（无 TTL），长期运行内存持续增长。
 * - canLogin(identifier) 的 identifier 同时被当 IP 与 userId 使用（:456 查 ip_ 频率、:459 查 userId 锁定），语义含混。
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { TokenManager } from '../utils/tokenManager';
import {
  EmailVerificationManager,
  LoginSecurityManager,
  PasswordResetManager,
  SessionManager,
} from '../utils/userEnhanced';
import { AvatarManager, TwoFactorManager } from '../utils/userDeepDive';
import {
  getDefaultPreferences,
  validateEmail as validateEmailModel,
  validatePhone as validatePhoneModel,
  validateUsername as validateUsernameModel,
  type User,
} from '../models/User';
import {
  validateEmail as validateEmailSecurity,
  validatePassword as validatePasswordSecurity,
  validatePhone as validatePhoneSecurity,
} from '../../../frontend/src/utils/securityEngine';

afterEach(() => {
  vi.useRealTimers();
});

const SECRET = 'batch21a-deterministic-test-secret';
const tokenPayload = { userId: 1001, username: 'alice', role: 'user' as const };

const decodeClaims = (token: string): Record<string, unknown> =>
  JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8'));

// ==================== JWT 集成（TokenManager） ====================
describe('JWT Token 集成', () => {
  it('应生成包含用户信息的 JWT payload', () => {
    const tm = new TokenManager({ secret: SECRET });
    const token = tm.generateAccessToken(tokenPayload);
    const claims = decodeClaims(token);
    expect(claims.userId).toBe(1001);
    expect(claims.username).toBe('alice');
    expect(claims.role).toBe('user');
    expect(claims).toHaveProperty('iat');
    expect(claims).toHaveProperty('exp');
    expect(claims.exp as number).toBeGreaterThan(claims.iat as number);
    // 生产 TokenPayload 没有 email（旧断言按 email 设计，错）
    expect(claims.email).toBeUndefined();
    expect(tm.verifyAccessToken(token).valid).toBe(true);
  });

  it('Access Token 应有过期时间（默认1小时）', () => {
    const tm = new TokenManager({ secret: SECRET });
    const pair = tm.generateTokenPair(tokenPayload);
    expect(pair.expiresIn).toBe(3600);
    const claims = decodeClaims(pair.accessToken);
    expect((claims.exp as number) - (claims.iat as number)).toBe(3600);
    expect(pair.tokenType).toBe('Bearer');
  });

  it('Refresh Token 应有更长有效期（默认7天，服务端 Map TTL）', () => {
    const t0 = new Date('2026-01-01T00:00:00.000Z').getTime();
    vi.useFakeTimers();
    vi.setSystemTime(t0);
    const tm = new TokenManager({ secret: SECRET });
    const refresh = tm.generateRefreshToken(tokenPayload);
    expect(refresh).toMatch(/^[0-9a-f]{96}$/);
    vi.setSystemTime(t0 + 7 * 24 * 3600 * 1000 - 1000);
    expect(tm.refreshAccessToken(refresh)).not.toBeNull();
    const refresh2 = tm.generateRefreshToken(tokenPayload);
    vi.setSystemTime(Date.now() + 7 * 24 * 3600 * 1000 + 1000);
    expect(tm.refreshAccessToken(refresh2)).toBeNull();
  });

  it('应支持 token 刷新流程', () => {
    const tm = new TokenManager({ secret: SECRET });
    const pair = tm.generateTokenPair(tokenPayload);
    const refreshed = tm.refreshAccessToken(pair.refreshToken);
    expect(refreshed).not.toBeNull();
    expect(refreshed!.accessToken).not.toBe(pair.accessToken);
    expect(tm.verifyAccessToken(refreshed!.accessToken).valid).toBe(true);
    // 生产 refresh token 一次性使用，旧 token 不能复用
    expect(tm.refreshAccessToken(pair.refreshToken)).toBeNull();
  });

  it('过期 token 应被拒绝', () => {
    const t0 = new Date('2026-01-01T00:00:00.000Z').getTime();
    vi.useFakeTimers();
    vi.setSystemTime(t0);
    const tm = new TokenManager({ secret: SECRET });
    const token = tm.generateAccessToken(tokenPayload);
    vi.setSystemTime(t0 + 3601 * 1000);
    const result = tm.verifyAccessToken(token);
    expect(result.valid).toBe(false);
    expect(result.error).toBe('Token 已过期');
  });

  it('应支持 token 黑名单机制', () => {
    const tm = new TokenManager({ secret: SECRET });
    const revoked = tm.generateAccessToken(tokenPayload);
    const other = tm.generateAccessToken(tokenPayload);
    tm.revokeAccessToken(revoked);
    expect(tm.verifyAccessToken(revoked)).toEqual({ valid: false, error: 'Token 已被撤销' });
    expect(tm.verifyAccessToken(other).valid).toBe(true);
  });

  it('登出应将 token 加入黑名单', () => {
    const tm = new TokenManager({ secret: SECRET });
    const pair = tm.generateTokenPair(tokenPayload);
    tm.revokeAccessToken(pair.accessToken);
    tm.revokeRefreshToken(pair.refreshToken);
    expect(tm.verifyAccessToken(pair.accessToken).error).toBe('Token 已被撤销');
    expect(tm.refreshAccessToken(pair.refreshToken)).toBeNull();
  });

  it('应验证 token 签名完整性', () => {
    const tm = new TokenManager({ secret: SECRET });
    const token = tm.generateAccessToken(tokenPayload);
    const [header, payload, signature] = token.split('.');
    const tamperedLast = signature.endsWith('A') ? 'B' : 'A';
    const tampered = `${header}.${payload}.${signature.slice(0, -1)}${tamperedLast}`;
    expect(tampered).not.toBe(token);
    expect(tm.verifyAccessToken(tampered).error).toBe('Token 签名无效');
  });

  it('应支持自定义 token 有效期', () => {
    const configs = [
      { accessExpiresIn: 900, refreshExpiresIn: 86400 },     // 15分钟 + 1天
      { accessExpiresIn: 1800, refreshExpiresIn: 604800 },   // 30分钟 + 7天
      { accessExpiresIn: 7200, refreshExpiresIn: 2592000 },  // 2小时 + 30天
    ];
    configs.forEach(c => {
      const pair = new TokenManager({ secret: SECRET, ...c }).generateTokenPair(tokenPayload);
      const claims = decodeClaims(pair.accessToken);
      expect(pair.expiresIn).toBe(c.accessExpiresIn);
      expect((claims.exp as number) - (claims.iat as number)).toBe(c.accessExpiresIn);
      expect(pair.refreshToken).toMatch(/^[0-9a-f]{96}$/);
    });
  });

  it('应支持多个设备同时登录', () => {
    const tm = new TokenManager({ secret: SECRET });
    const web = tm.generateRefreshToken(tokenPayload);
    const ios = tm.generateRefreshToken(tokenPayload);
    const android = tm.generateRefreshToken(tokenPayload);
    expect(tm.getStats().activeRefreshTokens).toBe(3);
    // 单设备登出不影响其他
    expect(tm.revokeRefreshToken(web)).toBe(true);
    expect(tm.getStats().activeRefreshTokens).toBe(2);
    expect(tm.refreshAccessToken(ios)).not.toBeNull();
    expect(tm.getStats().activeRefreshTokens).toBe(2); // ios 旧 token 已被消耗
    expect(tm.refreshAccessToken(android)).not.toBeNull();
  });
});

// ==================== Session 管理（SessionManager） ====================
describe('Session 管理', () => {
  it('应创建包含设备信息的 session', () => {
    const manager = new SessionManager();
    const session = manager.createSession('user_001', 'Chrome 120 / macOS', '192.168.1.1');
    expect(session.id).toMatch(/^sess_[0-9a-f]{32}$/);
    expect(session.userId).toBe('user_001');
    expect(session.deviceInfo).toBe('Chrome 120 / macOS');
    expect(session.ip).toBe('192.168.1.1');
    expect(session.createdAt).toBe(session.lastActiveAt);
    expect(session.expiresAt - session.createdAt).toBe(7 * 24 * 3600 * 1000);
  });

  it('应支持 session 续期', () => {
    const t0 = new Date('2026-01-01T00:00:00.000Z').getTime();
    vi.useFakeTimers();
    vi.setSystemTime(t0);
    const manager = new SessionManager();
    const session = manager.createSession('user_001', 'Chrome/macOS', '1.1.1.1');
    vi.setSystemTime(t0 + 3600 * 1000);
    expect(manager.touchSession(session.id)).toBe(true);
    const renewed = manager.getSession(session.id)!;
    expect(renewed.lastActiveAt).toBe(t0 + 3600 * 1000);
    expect(renewed.expiresAt).toBe(t0 + 3600 * 1000 + 7 * 24 * 3600 * 1000);
  });

  it('应限制最大并发 session 数', () => {
    const manager = new SessionManager();
    const created = Array.from({ length: 7 }, (_, i) =>
      manager.createSession('user_001', `device-${i}`, '1.1.1.1'));
    const sessions = manager.getUserSessions('user_001');
    expect(sessions).toHaveLength(5);
    // 超过 5 个时按 createdAt 删最旧的两个
    expect(manager.getSession(created[0].id)).toBeUndefined();
    expect(manager.getSession(created[1].id)).toBeUndefined();
    expect(sessions.map(s => s.deviceInfo).sort()).toEqual([
      'device-2', 'device-3', 'device-4', 'device-5', 'device-6',
    ]);
  });

  it('应支持查看所有活跃 session', () => {
    const manager = new SessionManager();
    manager.createSession('u1', 'Chrome/macOS', '1.1.1.1');
    manager.createSession('u1', 'Safari/iOS', '2.2.2.2');
    manager.createSession('u2', 'Firefox/Win', '3.3.3.3');
    expect(manager.getUserSessions('u1')).toHaveLength(2);
    expect(manager.getUserSessions('u2')).toHaveLength(1);
    expect(manager.getUserSessions('unknown')).toEqual([]);
  });

  it('应支持强制终止指定 session', () => {
    const manager = new SessionManager();
    const s1 = manager.createSession('u1', 'Chrome/macOS', '1.1.1.1');
    const s2 = manager.createSession('u1', 'Safari/iOS', '2.2.2.2');
    expect(manager.destroySession(s1.id)).toBe(true);
    expect(manager.destroySession(s1.id)).toBe(false);
    expect(manager.getSession(s1.id)).toBeUndefined();
    expect(manager.getSession(s2.id)).toBeDefined();
    expect(manager.getUserSessions('u1')).toHaveLength(1);
  });

  it('应支持终止所有其他 session（保留当前）', () => {
    const manager = new SessionManager();
    const current = manager.createSession('u1', 'current', '1.1.1.1');
    manager.createSession('u1', 'device-1', '2.2.2.2');
    manager.createSession('u1', 'device-2', '3.3.3.3');
    manager.createSession('u1', 'device-3', '4.4.4.4');
    manager.createSession('u1', 'device-4', '5.5.5.5');
    expect(manager.destroyOtherSessions('u1', current.id)).toBe(4);
    const remaining = manager.getUserSessions('u1', current.id);
    expect(remaining).toHaveLength(1);
    expect(remaining[0].id).toBe(current.id);
    expect(remaining[0].current).toBe(true);
  });

  it('应记录 session 活动时间戳（生产 Session 无 requestCount 字段）', () => {
    const manager = new SessionManager();
    const session = manager.createSession('u1', 'Chrome/macOS', '1.1.1.1');
    expect(session.lastActiveAt).toBe(session.createdAt);
    expect(session.lastActiveAt).toBeGreaterThan(0);
    // 旧断言依赖 requestCount，生产 Session 未提供该字段（未迁移）
    expect(session).not.toHaveProperty('requestCount');
  });
});

// ==================== 密码重置（PasswordResetManager） ====================
describe('密码重置', () => {
  it('应生成密码重置 token', () => {
    const manager = new PasswordResetManager();
    const result = manager.createResetRequest('user_001', 'test@example.com');
    expect(result.success).toBe(true);
    // 生产前缀是 rst_（旧断言 reset_ 错），32 字节随机 hex
    expect(result.token).toMatch(/^rst_[0-9a-f]{64}$/);
    expect(result.message).toBe('重置链接已发送到您的邮箱');
    expect(manager.verifyResetToken(result.token!).valid).toBe(true);
  });

  it('重置 token 应有短有效期（30分钟）', () => {
    const t0 = new Date('2026-01-01T00:00:00.000Z').getTime();
    vi.useFakeTimers();
    vi.setSystemTime(t0);
    const manager = new PasswordResetManager();
    const { token } = manager.createResetRequest('user_001', 'test@example.com');
    expect(manager.verifyResetToken(token!).valid).toBe(true);
    vi.setSystemTime(t0 + 30 * 60 * 1000 + 1000);
    const expired = manager.verifyResetToken(token!);
    expect(expired.valid).toBe(false);
    expect(expired.message).toBe('重置链接已过期');
  });

  it('重置 token 应一次性使用', () => {
    const manager = new PasswordResetManager();
    const { token } = manager.createResetRequest('user_001', 'test@example.com');
    expect(manager.useResetToken(token!, 'Str0ngPass1').success).toBe(true);
    expect(manager.verifyResetToken(token!).message).toBe('重置链接已使用');
    expect(manager.useResetToken(token!, 'Str0ngPass1').success).toBe(false);
  });

  it('应限制重置请求频率（防刷）', () => {
    const manager = new PasswordResetManager();
    const results = Array.from({ length: 4 }, () =>
      manager.createResetRequest('user_001', 'rate@example.com'));
    expect(results.slice(0, 3).every(r => r.success)).toBe(true);
    expect(results[3].success).toBe(false);
    expect(results[3].message).toBe('请求过于频繁，请15分钟后重试');
  });

  it('应验证新密码强度', () => {
    const manager = new PasswordResetManager();
    // 生产重置口径：≥8 位且「大写/小写/数字/特殊字符」4 条中满足 3 条
    expect(manager.validatePasswordStrength('abc')).toBe(false);
    expect(manager.validatePasswordStrength('Password1')).toBe(true);
    expect(manager.validatePasswordStrength('Pass123!')).toBe(true);
    expect(manager.validatePasswordStrength('12345678')).toBe(false);

    const { token } = manager.createResetRequest('user_001', 'pwd@example.com');
    const weak = manager.useResetToken(token!, 'abc');
    expect(weak.success).toBe(false);
    expect(weak.message).toContain('密码强度不足');
  });

  it('重置成功后旧 token 应失效（旧密码哈希失效未迁移）', () => {
    const manager = new PasswordResetManager();
    const { token } = manager.createResetRequest('user_001', 'test@example.com');
    expect(manager.useResetToken(token!, 'Pass123!').success).toBe(true);
    expect(manager.verifyResetToken(token!).valid).toBe(false);
    // 旧密码本身是否失效依赖用户存储；生产该模块不保存密码哈希（未迁移）
  });

  it('应通过邮箱发送重置链接', () => {
    const manager = new PasswordResetManager();
    const { token } = manager.createResetRequest('test@example.com', 'test@example.com');
    expect(token).toBeTruthy();
    // 未迁移：生产无邮件模板/发送模块，只有 message；下列模板结构为旧契约保留
    const resetEmail = {
      to: 'test@example.com',
      subject: 'A股分析 - 密码重置',
      resetLink: `https://astock.com/reset?token=${token}`,
      expires: '30分钟',
    };
    expect(resetEmail.to).toMatch(/@/);
    expect(resetEmail.resetLink).toContain('token=');
  });

  it('不存在的邮箱应返回成功（防枚举）', () => {
    const manager = new PasswordResetManager();
    const result = manager.createResetRequest('nobody', 'not-registered@example.com');
    // 生产不查用户是否存在，一律创建（防枚举）
    expect(result.success).toBe(true);
    expect(result.token).toMatch(/^rst_/);
    expect(manager.verifyResetToken(result.token!).valid).toBe(true);
  });

  it('同一用户新请求应使旧 token 失效', () => {
    const manager = new PasswordResetManager();
    const first = manager.createResetRequest('user_001', 'a@example.com');
    const second = manager.createResetRequest('user_001', 'b@example.com');
    expect(manager.verifyResetToken(first.token!).valid).toBe(false);
    expect(manager.verifyResetToken(first.token!).message).toBe('重置链接无效');
    expect(manager.verifyResetToken(second.token!).valid).toBe(true);
  });
});

// ==================== 邮箱验证（EmailVerificationManager） ====================
describe('邮箱验证', () => {
  it('注册后应发送验证邮件', () => {
    const manager = new EmailVerificationManager();
    const newUser = { id: 'user_001', email: 'test@example.com' };
    const result = manager.createVerification(newUser.id, newUser.email);
    expect(result.success).toBe(true);
    // 生产前缀是 vrf_（旧断言 verify_ 错），32 字节随机 hex
    expect(result.token).toMatch(/^vrf_[0-9a-f]{64}$/);
    expect(result.message).toBe('验证邮件已发送');
    expect(manager.isVerified(newUser.id)).toBe(false);
  });

  it('验证链接应有24小时有效期', () => {
    const t0 = new Date('2026-01-01T00:00:00.000Z').getTime();
    vi.useFakeTimers();
    vi.setSystemTime(t0);
    const manager = new EmailVerificationManager();
    const { token } = manager.createVerification('user_001', 'test@example.com');
    vi.setSystemTime(t0 + 24 * 3600 * 1000 + 1000);
    const result = manager.verifyEmail(token!);
    expect(result.success).toBe(false);
    expect(result.message).toBe('验证链接已过期，请重新发送');
  });

  it('验证成功后 emailVerified 应为 true', () => {
    const manager = new EmailVerificationManager();
    const { token } = manager.createVerification('user_001', 'test@example.com');
    const result = manager.verifyEmail(token!);
    expect(result.success).toBe(true);
    expect(result.userId).toBe('user_001');
    expect(manager.isVerified('user_001')).toBe(true);
  });

  it('已验证邮箱不应重复发送', () => {
    const manager = new EmailVerificationManager();
    const { token } = manager.createVerification('user_001', 'test@example.com');
    manager.verifyEmail(token!);
    const again = manager.createVerification('user_001', 'test@example.com');
    expect(again.success).toBe(false);
    expect(again.message).toBe('邮箱已验证');
  });

  it('应支持重新发送验证邮件（限频）', () => {
    const t0 = new Date('2026-01-01T00:00:00.000Z').getTime();
    vi.useFakeTimers();
    vi.setSystemTime(t0);
    const manager = new EmailVerificationManager();
    manager.createVerification('user_001', 'test@example.com');
    // 50 秒内重发被冷却拦截
    vi.setSystemTime(t0 + 50 * 1000);
    expect(manager.createVerification('user_001', 'test@example.com').message).toBe('请60秒后再试');
    // 70 秒后可重发
    vi.setSystemTime(t0 + 70 * 1000);
    expect(manager.createVerification('user_001', 'test@example.com').success).toBe(true);
  });

  it('未验证用户应有功能限制（生产只有 isVerified 门禁，限制文案未迁移）', () => {
    const manager = new EmailVerificationManager();
    manager.createVerification('user_001', 'test@example.com');
    expect(manager.isVerified('user_001')).toBe(false);
    expect(manager.getStats()).toEqual({ verified: 0, pending: 1, total: 1 });
    // 旧断言的「无法接收价格提醒邮件」等限制文案生产未实现，未迁移
  });

  it('应发送验证成功通知（生产只有 message，通知模块未迁移）', () => {
    const manager = new EmailVerificationManager();
    const { token } = manager.createVerification('user_001', 'test@example.com');
    const result = manager.verifyEmail(token!);
    expect(result.message).toContain('成功');
    // 旧 notification.type='email_verified' 的通知系统生产未实现，未迁移
  });
});

// ==================== 注册流程增强（User 模型 + 前端安全引擎） ====================
describe('注册流程增强', () => {
  it('应支持用户名格式验证', () => {
    // 生产 /^[a-zA-Z0-9_]{3,20}$/：纯 ASCII、3–20 位（旧断言允许中文 2–20 位，错）
    expect(validateUsernameModel('user_001')).toBe(true);
    expect(validateUsernameModel('张三')).toBe(false);
    expect(validateUsernameModel('a')).toBe(false);
    expect(validateUsernameModel('ab')).toBe(false);
    expect(validateUsernameModel('')).toBe(false);
    expect(validateUsernameModel('user@name')).toBe(false);
    expect(validateUsernameModel('a'.repeat(20))).toBe(true);
    expect(validateUsernameModel('a'.repeat(21))).toBe(false);
  });

  it('应支持邮箱格式验证', () => {
    expect(validateEmailModel('test@example.com')).toBe(true);
    expect(validateEmailModel('user.name+tag@domain.co')).toBe(true);
    expect(validateEmailModel('invalid')).toBe(false);
    expect(validateEmailModel('@example.com')).toBe(false);
    expect(validateEmailModel('test@')).toBe(false);
    // 前端 validateEmail 额外返回 sanitized（trim + 小写），但正则校验的是原始输入：
    // 前后带空格时 valid=false，sanitized 仍被清洗（生产行为如此，未改生产）
    const withSpaces = validateEmailSecurity('  Test@Example.COM  ');
    expect(withSpaces.valid).toBe(false);
    expect(withSpaces.sanitized).toBe('test@example.com');
    expect(withSpaces.errors).toEqual(['邮箱格式不正确']);

    const clean = validateEmailSecurity('Test@Example.COM');
    expect(clean.valid).toBe(true);
    expect(clean.sanitized).toBe('test@example.com');
    expect(clean.errors).toEqual([]);
  });

  it('应支持手机号格式验证（中国）', () => {
    expect(validatePhoneModel('13812345678')).toBe(true);
    expect(validatePhoneModel('15912345678')).toBe(true);
    expect(validatePhoneModel('12345678901')).toBe(false);
    expect(validatePhoneModel('1381234567')).toBe(false);
    // 前端会先去掉空格/连字符，后端校验不 strip
    expect(validatePhoneSecurity('138-1234-5678').valid).toBe(true);
    expect(validatePhoneSecurity('138 1234 5678').valid).toBe(true);
    expect(validatePhoneModel('138-1234-5678')).toBe(false);
  });

  it('应支持密码强度指示器（生产只有布尔口径，无 level 分级）', () => {
    const manager = new PasswordResetManager();
    expect(manager.validatePasswordStrength('abc')).toBe(false);
    expect(manager.validatePasswordStrength('Password1')).toBe(true);
    expect(manager.validatePasswordStrength('P@ssw0rd!Strong')).toBe(true);

    // 前端口径更严：5 条全满足；'Password1' 缺特殊字符 → false（旧断言 level=2，生产无分级）
    const weak = validatePasswordSecurity('abc');
    expect(weak.valid).toBe(false);
    expect(weak.errors).toEqual(expect.arrayContaining([
      '密码长度不能少于8位',
      '密码需包含大写字母',
      '密码需包含数字',
      '密码需包含特殊字符',
    ]));
    expect(validatePasswordSecurity('Password1').valid).toBe(false);
    expect(validatePasswordSecurity('P@ssw0rd!Strong').valid).toBe(true);
  });

  it('应记录注册来源与时间戳', () => {
    // 未迁移：生产无 source/referrer/utm 字段（保留旧契约结构断言）
    const registration = {
      source: 'web',
      referrer: 'baidu',
      utm: { campaign: 'spring2024', medium: 'cpc' },
      timestamp: new Date().toISOString(),
    };
    expect(registration).toHaveProperty('source');
    expect(registration).toHaveProperty('timestamp');

    // 注册时间字段绑定生产 User.createdAt(Date)
    const newUser: User = {
      id: 1,
      username: 'user_001',
      email: 'test@example.com',
      role: 'user',
      status: 'active',
      loginCount: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    expect(newUser.createdAt).toBeInstanceOf(Date);
  });
});

// ==================== 登录安全（LoginSecurityManager） ====================
describe('登录安全', () => {
  it('应限制登录尝试次数（5次/15分钟）', () => {
    const manager = new LoginSecurityManager();
    for (let i = 0; i < 4; i++) {
      manager.recordAttempt('192.168.1.1', 'user_001', false);
    }
    // 4 次失败后同 IP 只剩 1 次机会
    expect(manager.canLogin('192.168.1.1')).toMatchObject({ allowed: true, remainingAttempts: 1 });

    manager.recordAttempt('192.168.1.1', 'user_001', false);
    // 第 5 次失败后账户锁定，同 IP 也被限流
    const locked = manager.canLogin('user_001');
    expect(locked.allowed).toBe(false);
    expect(locked.message).toContain('账户已锁定');
    expect(manager.canLogin('192.168.1.1').allowed).toBe(false);
  });

  it('应支持账户锁定后自动解锁', () => {
    const t0 = new Date('2026-01-01T00:00:00.000Z').getTime();
    vi.useFakeTimers();
    vi.setSystemTime(t0);
    const manager = new LoginSecurityManager();
    for (let i = 0; i < 5; i++) {
      manager.recordAttempt('192.168.1.1', 'user_001', false);
    }
    expect(manager.canLogin('user_001').allowed).toBe(false);
    vi.setSystemTime(t0 + 15 * 60 * 1000 + 1000);
    // 生产没有 lockedUntil 字段，锁定到期后由 canLogin 自动删除
    expect(manager.canLogin('user_001').allowed).toBe(true);
  });

  it('应记录登录日志', () => {
    const manager = new LoginSecurityManager();
    manager.recordAttempt('1.1.1.1', 'user_001', true);
    manager.recordAttempt('2.2.2.2', 'user_001', false);
    const log = manager.getLoginLog('user_001');
    expect(log).toHaveLength(2);
    // 倒序：最新在前
    expect(log[0]).toMatchObject({ ip: '2.2.2.2', success: false });
    expect(log[1]).toMatchObject({ ip: '1.1.1.1', success: true });
    expect(log[0].timestamp).toBeGreaterThan(0);
    expect(manager.getLoginLog('user_001', 1)).toHaveLength(1);
    // 生产 LoginAttempt 无 device 字段（旧断言未迁移）
  });

  it('应检测异常登录（生产口径：同一 IP 15 分钟内 >20 次）', () => {
    const manager = new LoginSecurityManager();
    for (let i = 0; i < 20; i++) {
      manager.recordAttempt('8.8.8.8', 'user_001', true);
    }
    expect(manager.isSuspiciousIP('8.8.8.8')).toBe(false); // 阈值是严格 >20
    manager.recordAttempt('8.8.8.8', 'user_001', true);
    expect(manager.isSuspiciousIP('8.8.8.8')).toBe(true);
    expect(manager.isSuspiciousIP('9.9.9.9')).toBe(false);
    // 旧「IP 变更即可疑」的判据生产未实现（未迁移）
  });

  it('应支持两步验证（TOTP）预留接口', () => {
    const manager = new TwoFactorManager();
    const { secret, qrUrl, backupCodes } = manager.generateSecret('user_001');
    // 生产 secret 是随机 16 字节 base64（22 字符，无 padding），旧固定 secret 未迁移
    expect(secret).toMatch(/^[A-Za-z0-9+/]{22}$/);
    expect(qrUrl).toContain(`secret=${secret}`);
    expect(qrUrl).toContain('issuer=AStock');
    expect(qrUrl).toContain('digits=6');
    expect(qrUrl).toContain('period=30');
    expect(backupCodes).toHaveLength(10);
    backupCodes.forEach(code => expect(code).toMatch(/^[0-9A-F]{4}-[0-9A-F]{4}$/));

    // 同一时间窗口的 TOTP 确定性可复现
    const fixedTime = 1700000000000;
    const code = manager.generateTOTP(secret, fixedTime);
    expect(code).toMatch(/^\d{6}$/);
    expect(manager.generateTOTP(secret, fixedTime)).toBe(code);

    expect(manager.verifyAndEnable('user_001', manager.generateTOTP(secret)).success).toBe(true);
    expect(manager.isEnabled('user_001')).toBe(true);
  });
});

// ==================== 密码安全（生产哈希私有，未迁移部分内联） ====================
describe('密码安全', () => {
  // 未迁移：生产 bcrypt 哈希在 backend/src/api/user.ts:186/193（路由文件内私有，未导出），
  // 下列结构性断言保留旧测试口径，不代表生产实现。
  const legacyHash = (password: string): string => 'sha256_' + password.length + '_hashed';

  it('密码存储应使用哈希（非明文）', () => {
    const password = 'MyP@ssw0rd';
    const hash = legacyHash(password);
    expect(hash).not.toBe(password);
    expect(hash).toContain('hashed');
  });

  it('应支持密码修改（需旧密码验证）', () => {
    const currentHash = legacyHash('old_password');
    const inputOldHash = legacyHash('old_password');
    expect(currentHash).toBe(inputOldHash);
  });

  it('新密码不应与旧密码相同', () => {
    expect(legacyHash('old_password')).not.toBe(legacyHash('new_password_2'));
  });

  it('应禁止常见弱密码（绑定生产密码强度校验）', () => {
    const weakPasswords = ['123456', 'password', 'qwerty', 'abc123', '111111'];
    weakPasswords.forEach(pwd => {
      expect(validatePasswordSecurity(pwd).valid).toBe(false);
    });
    expect(validatePasswordSecurity('Str0ng!Pass').valid).toBe(true);
  });
});

// ==================== 用户 Profile（AvatarManager + User 模型） ====================
describe('用户 Profile 管理', () => {
  it('应支持头像上传（生产返回 /avatars/*.webp，无 data URL）', () => {
    const manager = new AvatarManager();
    const uploaded = manager.uploadAvatar('user_001', 'image/png', 1024);
    expect(uploaded.success).toBe(true);
    expect(uploaded.avatar!.avatarUrl).toMatch(/^\/avatars\/user_001\/[0-9a-f]{32}\.webp$/);
    expect(uploaded.avatar!.thumbnailUrl).toMatch(/_thumb\.webp$/);
    expect(uploaded.avatar!.isDefault).toBe(false);
    // 生产只支持 jpeg/png/webp/gif 且 ≤5MB
    expect(manager.uploadAvatar('user_001', 'image/bmp', 1024).success).toBe(false);
    expect(manager.uploadAvatar('user_001', 'image/png', 6 * 1024 * 1024).success).toBe(false);
    // 默认头像走 /defaults/*.png
    const def = manager.setDefaultAvatar('user_001', 0);
    expect(def.avatar!.avatarUrl).toBe('/defaults/default_avatar_1.png');
    expect(def.avatar!.isDefault).toBe(true);
  });

  it('应校验头像裁剪参数（最小 50x50、不得越界）', () => {
    const manager = new AvatarManager();
    expect(manager.validateCropParams(0, 0, 100, 100, 500, 500).valid).toBe(true);
    expect(manager.validateCropParams(0, 0, 40, 100, 500, 500).valid).toBe(false);
    expect(manager.validateCropParams(0, 0, 600, 100, 500, 500).valid).toBe(false);
    expect(manager.validateCropParams(-1, 0, 100, 100, 500, 500).valid).toBe(false);
  });

  it('应支持个人简介（最多200字，生产无校验导出，未迁移）', () => {
    const bio = '资深A股投资者，专注价值投资';
    expect(bio.length).toBeLessThanOrEqual(200);
    // 生产只有 social.ts:98 UserProfile.bio 字段，无长度校验函数可绑定
  });

  it('应支持投资偏好设置（生产默认 favoriteSectors 为空数组）', () => {
    const prefs = getDefaultPreferences(1);
    // 旧断言要求 favoriteSectors 非空；生产默认 []（旧断言错）
    expect(prefs.favoriteSectors).toEqual([]);
    expect(prefs.favoriteIndices).toEqual(['000001.SH', '399001.SZ', '399006.SZ']);
    expect(prefs.theme).toBe('auto');
    expect(prefs.language).toBe('zh-CN');
    expect(prefs.refreshInterval).toBe(5);
    // 旧 riskLevel/investmentStyle 字段生产用户模型与偏好均无（未迁移）
    expect(prefs).not.toHaveProperty('riskLevel');
  });
});
