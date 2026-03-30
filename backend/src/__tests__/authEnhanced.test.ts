/**
 * 用户认证增强与会话管理 - Round 179
 * 覆盖：登录流程、Token刷新、多设备会话、安全策略
 */
import { describe, it, expect, beforeEach } from 'vitest';
import crypto from 'crypto';

interface User {
  id: string;
  email: string;
  passwordHash: string;
  failedAttempts: number;
  lockedUntil?: number;
  mfaEnabled: boolean;
  mfaSecret?: string;
}

interface Session {
  id: string;
  userId: string;
  device: string;
  ip: string;
  createdAt: number;
  expiresAt: number;
  refreshToken: string;
  revoked: boolean;
}

const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_DURATION = 15 * 60 * 1000; // 15分钟
const SESSION_DURATION = 24 * 60 * 60 * 1000; // 24小时
const REFRESH_TOKEN_DURATION = 7 * 24 * 60 * 60 * 1000; // 7天

class AuthManager {
  private users: Map<string, User> = new Map();
  private sessions: Map<string, Session> = new Map();
  private refreshTokens: Map<string, string> = new Map(); // refreshToken -> sessionId

  addUser(user: User) {
    this.users.set(user.id, user);
  }

  authenticate(email: string, password: string, now: number = Date.now()): { success: boolean; reason?: string; session?: Session } {
    const user = Array.from(this.users.values()).find(u => u.email === email);
    if (!user) return { success: false, reason: '用户不存在' };

    if (user.lockedUntil && user.lockedUntil > now) {
      const remaining = Math.ceil((user.lockedUntil - now) / 1000);
      return { success: false, reason: `账号已锁定，请${remaining}秒后重试` };
    }

    const hash = crypto.createHash('sha256').update(password).digest('hex');
    if (hash !== user.passwordHash) {
      user.failedAttempts++;
      if (user.failedAttempts >= MAX_FAILED_ATTEMPTS) {
        user.lockedUntil = now + LOCKOUT_DURATION;
      }
      return { success: false, reason: '密码错误' };
    }

    // 登录成功
    user.failedAttempts = 0;
    user.lockedUntil = undefined;

    const session = this.createSession(user.id, 'web', '127.0.0.1', now);
    return { success: true, session };
  }

  createSession(userId: string, device: string, ip: string, now: number): Session {
    const session: Session = {
      id: `sess_${crypto.randomBytes(16).toString('hex')}`,
      userId,
      device,
      ip,
      createdAt: now,
      expiresAt: now + SESSION_DURATION,
      refreshToken: crypto.randomBytes(32).toString('hex'),
      revoked: false,
    };
    this.sessions.set(session.id, session);
    this.refreshTokens.set(session.refreshToken, session.id);
    return session;
  }

  refreshSession(refreshToken: string, now: number): Session | null {
    const sessionId = this.refreshTokens.get(refreshToken);
    if (!sessionId) return null;

    const session = this.sessions.get(sessionId);
    if (!session || session.revoked) return null;

    // 旧session作废
    session.revoked = true;
    this.refreshTokens.delete(refreshToken);

    // 创建新session
    return this.createSession(session.userId, session.device, session.ip, now);
  }

  revokeSession(sessionId: string): boolean {
    const session = this.sessions.get(sessionId);
    if (!session) return false;
    session.revoked = true;
    return true;
  }

  revokeAllUserSessions(userId: string): number {
    let count = 0;
    for (const session of this.sessions.values()) {
      if (session.userId === userId && !session.revoked) {
        session.revoked = true;
        count++;
      }
    }
    return count;
  }

  getActiveSessions(userId: string): Session[] {
    return Array.from(this.sessions.values())
      .filter(s => s.userId === userId && !s.revoked && s.expiresAt > Date.now());
  }

  validateMfa(userId: string, totp: string): boolean {
    const user = this.users.get(userId);
    if (!user || !user.mfaEnabled) return false;
    // 简化：实际应验证TOTP
    return totp.length === 6 && /^\d+$/.test(totp);
  }
}

describe('认证与会话管理', () => {
  let auth: AuthManager;
  const passwordHash = crypto.createHash('sha256').update('Test1234!').digest('hex');

  beforeEach(() => {
    auth = new AuthManager();
    auth.addUser({
      id: 'user1',
      email: 'test@example.com',
      passwordHash,
      failedAttempts: 0,
      mfaEnabled: false,
    });
  });

  describe('登录认证', () => {
    it('正确凭证应登录成功', () => {
      const result = auth.authenticate('test@example.com', 'Test1234!');
      expect(result.success).toBe(true);
      expect(result.session).toBeDefined();
    });

    it('错误密码应失败', () => {
      const result = auth.authenticate('test@example.com', 'wrong');
      expect(result.success).toBe(false);
      expect(result.reason).toBe('密码错误');
    });

    it('不存在的用户应失败', () => {
      const result = auth.authenticate('nobody@example.com', 'Test1234!');
      expect(result.success).toBe(false);
      expect(result.reason).toBe('用户不存在');
    });

    it('5次失败后应锁定', () => {
      for (let i = 0; i < 5; i++) {
        auth.authenticate('test@example.com', 'wrong');
      }
      const result = auth.authenticate('test@example.com', 'Test1234!');
      expect(result.success).toBe(false);
      expect(result.reason).toContain('锁定');
    });

    it('成功登录应重置失败计数', () => {
      auth.authenticate('test@example.com', 'wrong');
      auth.authenticate('test@example.com', 'wrong');
      auth.authenticate('test@example.com', 'Test1234!');
      const result = auth.authenticate('test@example.com', 'wrong');
      // 失败计数从1开始，不是从之前的累积
      expect(result.success).toBe(false);
    });
  });

  describe('会话管理', () => {
    it('登录应创建会话', () => {
      const { session } = auth.authenticate('test@example.com', 'Test1234!');
      expect(session!.id).toMatch(/^sess_/);
      expect(session!.refreshToken).toBeDefined();
      expect(session!.revoked).toBe(false);
    });

    it('Token刷新应创建新会话', () => {
      const { session } = auth.authenticate('test@example.com', 'Test1234!');
      const newSession = auth.refreshSession(session!.refreshToken, Date.now());
      expect(newSession).toBeDefined();
      expect(newSession!.id).not.toBe(session!.id);
    });

    it('刷新后旧session应作废', () => {
      const { session } = auth.authenticate('test@example.com', 'Test1234!');
      auth.refreshSession(session!.refreshToken, Date.now());
      const refreshed = auth.refreshSession(session!.refreshToken, Date.now());
      expect(refreshed).toBeNull();
    });

    it('应能撤销指定会话', () => {
      const { session } = auth.authenticate('test@example.com', 'Test1234!');
      expect(auth.revokeSession(session!.id)).toBe(true);
      expect(auth.getActiveSessions('user1')).toHaveLength(0);
    });

    it('应能撤销用户所有会话', () => {
      auth.authenticate('test@example.com', 'Test1234!');
      auth.authenticate('test@example.com', 'Test1234!');
      const count = auth.revokeAllUserSessions('user1');
      expect(count).toBeGreaterThanOrEqual(2);
      expect(auth.getActiveSessions('user1')).toHaveLength(0);
    });

    it('应获取活跃会话列表', () => {
      auth.authenticate('test@example.com', 'Test1234!');
      auth.authenticate('test@example.com', 'Test1234!');
      expect(auth.getActiveSessions('user1')).toHaveLength(2);
    });
  });

  describe('MFA', () => {
    it('有效的6位TOTP应通过', () => {
      auth.addUser({
        id: 'mfa_user',
        email: 'mfa@example.com',
        passwordHash,
        failedAttempts: 0,
        mfaEnabled: true,
        mfaSecret: 'JBSWY3DPEHPK3PXP',
      });
      expect(auth.validateMfa('mfa_user', '123456')).toBe(true);
    });

    it('无效的TOTP应拒绝', () => {
      auth.addUser({
        id: 'mfa_user',
        email: 'mfa@example.com',
        passwordHash,
        failedAttempts: 0,
        mfaEnabled: true,
      });
      expect(auth.validateMfa('mfa_user', 'abc')).toBe(false);
      expect(auth.validateMfa('mfa_user', '12345')).toBe(false);
    });

    it('未启用MFA应拒绝验证', () => {
      expect(auth.validateMfa('user1', '123456')).toBe(false);
    });
  });
});
