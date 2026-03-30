/**
 * 用户系统增强模块
 * 密码重置、邮箱验证、Session管理
 */

import crypto from 'crypto';

// ==================== 密码重置管理器 ====================
interface PasswordResetRequest {
  token: string;
  userId: string;
  email: string;
  expiresAt: number;
  used: boolean;
  createdAt: number;
}

interface RateLimitEntry {
  count: number;
  windowStart: number;
}

class PasswordResetManager {
  private resetTokens = new Map<string, PasswordResetRequest>();
  private rateLimits = new Map<string, RateLimitEntry>();
  private maxRequestsPerWindow = 3;
  private windowMs = 15 * 60 * 1000; // 15分钟
  private tokenExpiryMs = 30 * 60 * 1000; // 30分钟

  /**
   * 创建密码重置请求
   */
  createResetRequest(userId: string, email: string): { success: boolean; token?: string; message: string } {
    // 频率限制
    const rateKey = `reset_${email}`;
    const entry = this.rateLimits.get(rateKey);
    const now = Date.now();

    if (entry) {
      if (now - entry.windowStart < this.windowMs) {
        if (entry.count >= this.maxRequestsPerWindow) {
          return { success: false, message: '请求过于频繁，请15分钟后重试' };
        }
        entry.count++;
      } else {
        // 新窗口
        entry.count = 1;
        entry.windowStart = now;
      }
    } else {
      this.rateLimits.set(rateKey, { count: 1, windowStart: now });
    }

    // 清除旧 token
    for (const [key, req] of this.resetTokens) {
      if (req.userId === userId) {
        this.resetTokens.delete(key);
      }
    }

    // 创建新 token
    const token = 'rst_' + crypto.randomBytes(32).toString('hex');
    this.resetTokens.set(token, {
      token,
      userId,
      email,
      expiresAt: now + this.tokenExpiryMs,
      used: false,
      createdAt: now,
    });

    return { success: true, token, message: '重置链接已发送到您的邮箱' };
  }

  /**
   * 验证重置 token
   */
  verifyResetToken(token: string): { valid: boolean; userId?: string; message: string } {
    const request = this.resetTokens.get(token);

    if (!request) {
      return { valid: false, message: '重置链接无效' };
    }

    if (request.used) {
      return { valid: false, message: '重置链接已使用' };
    }

    if (Date.now() > request.expiresAt) {
      this.resetTokens.delete(token);
      return { valid: false, message: '重置链接已过期' };
    }

    return { valid: true, userId: request.userId, message: 'Token 有效' };
  }

  /**
   * 使用重置 token 重置密码
   */
  useResetToken(token: string, newPassword: string): { success: boolean; userId?: string; message: string } {
    const verification = this.verifyResetToken(token);
    if (!verification.valid) {
      return { success: false, message: verification.message };
    }

    // 验证新密码强度
    if (!this.validatePasswordStrength(newPassword)) {
      return { success: false, message: '密码强度不足：至少8位，包含大小写字母和数字' };
    }

    const request = this.resetTokens.get(token)!;
    request.used = true;

    return { success: true, userId: request.userId, message: '密码重置成功' };
  }

  /**
   * 密码强度验证
   */
  validatePasswordStrength(password: string): boolean {
    if (password.length < 8) return false;
    let criteria = 0;
    if (/[A-Z]/.test(password)) criteria++;
    if (/[a-z]/.test(password)) criteria++;
    if (/[0-9]/.test(password)) criteria++;
    if (/[!@#$%^&*()_+\-=]/.test(password)) criteria++;
    return criteria >= 3;
  }

  /**
   * 获取重置统计
   */
  getStats() {
    return {
      activeResetTokens: this.resetTokens.size,
      rateLimitedEmails: this.rateLimits.size,
    };
  }

  /**
   * 清理过期 token
   */
  cleanup(): number {
    const now = Date.now();
    let cleaned = 0;
    for (const [token, req] of this.resetTokens) {
      if (now > req.expiresAt) {
        this.resetTokens.delete(token);
        cleaned++;
      }
    }
    return cleaned;
  }
}

// ==================== 邮箱验证管理器 ====================
interface EmailVerification {
  token: string;
  userId: string;
  email: string;
  expiresAt: number;
  verified: boolean;
  createdAt: number;
}

class EmailVerificationManager {
  private verifications = new Map<string, EmailVerification>();
  private userVerifications = new Map<string, string>(); // userId -> token
  private resendCooldownMs = 60 * 1000; // 60秒冷却
  private tokenExpiryMs = 24 * 3600 * 1000; // 24小时

  /**
   * 创建邮箱验证请求
   */
  createVerification(userId: string, email: string): { success: boolean; token?: string; message: string } {
    // 检查是否已验证
    const existingToken = this.userVerifications.get(userId);
    if (existingToken) {
      const existing = this.verifications.get(existingToken);
      if (existing?.verified) {
        return { success: false, message: '邮箱已验证' };
      }
    }

    // 检查冷却
    if (existingToken) {
      const existing = this.verifications.get(existingToken);
      if (existing && Date.now() - existing.createdAt < this.resendCooldownMs) {
        return { success: false, message: '请60秒后再试' };
      }
    }

    const token = 'vrf_' + crypto.randomBytes(32).toString('hex');
    const now = Date.now();

    // 清除旧 token
    if (existingToken) {
      this.verifications.delete(existingToken);
    }

    this.verifications.set(token, {
      token,
      userId,
      email,
      expiresAt: now + this.tokenExpiryMs,
      verified: false,
      createdAt: now,
    });

    this.userVerifications.set(userId, token);

    return { success: true, token, message: '验证邮件已发送' };
  }

  /**
   * 验证邮箱
   */
  verifyEmail(token: string): { success: boolean; userId?: string; message: string } {
    const verification = this.verifications.get(token);

    if (!verification) {
      return { success: false, message: '验证链接无效' };
    }

    if (verification.verified) {
      return { success: false, message: '邮箱已验证' };
    }

    if (Date.now() > verification.expiresAt) {
      return { success: false, message: '验证链接已过期，请重新发送' };
    }

    verification.verified = true;

    return { success: true, userId: verification.userId, message: '邮箱验证成功' };
  }

  /**
   * 检查邮箱是否已验证
   */
  isVerified(userId: string): boolean {
    const token = this.userVerifications.get(userId);
    if (!token) return false;
    const verification = this.verifications.get(token);
    return verification?.verified ?? false;
  }

  /**
   * 获取验证统计
   */
  getStats() {
    let verified = 0;
    let pending = 0;
    for (const v of this.verifications.values()) {
      if (v.verified) verified++;
      else pending++;
    }
    return { verified, pending, total: this.verifications.size };
  }
}

// ==================== Session 管理器 ====================
interface Session {
  id: string;
  userId: string;
  deviceInfo: string;
  ip: string;
  createdAt: number;
  lastActiveAt: number;
  expiresAt: number;
  current?: boolean;
}

class SessionManager {
  private sessions = new Map<string, Session>();
  private userSessions = new Map<string, Set<string>>(); // userId -> sessionIds
  private maxSessionsPerUser = 5;
  private sessionExpiryMs = 7 * 24 * 3600 * 1000; // 7天

  /**
   * 创建 session
   */
  createSession(userId: string, deviceInfo: string, ip: string): Session {
    const sessionId = 'sess_' + crypto.randomBytes(16).toString('hex');
    const now = Date.now();

    const session: Session = {
      id: sessionId,
      userId,
      deviceInfo,
      ip,
      createdAt: now,
      lastActiveAt: now,
      expiresAt: now + this.sessionExpiryMs,
    };

    // 获取用户已有 session
    let userSess = this.userSessions.get(userId);
    if (!userSess) {
      userSess = new Set<string>();
      this.userSessions.set(userId, userSess);
    }

    // 超过上限时移除最旧的
    if (userSess.size >= this.maxSessionsPerUser) {
      let oldestId = '';
      let oldestTime = Infinity;
      for (const sid of userSess) {
        const s = this.sessions.get(sid);
        if (s && s.createdAt < oldestTime) {
          oldestTime = s.createdAt;
          oldestId = sid;
        }
      }
      if (oldestId) {
        this.sessions.delete(oldestId);
        userSess.delete(oldestId);
      }
    }

    this.sessions.set(sessionId, session);
    userSess.add(sessionId);

    return session;
  }

  /**
   * 获取 session
   */
  getSession(sessionId: string): Session | undefined {
    return this.sessions.get(sessionId);
  }

  /**
   * 续期 session
   */
  touchSession(sessionId: string): boolean {
    const session = this.sessions.get(sessionId);
    if (!session) return false;
    if (Date.now() > session.expiresAt) {
      this.destroySession(sessionId);
      return false;
    }
    session.lastActiveAt = Date.now();
    session.expiresAt = Date.now() + this.sessionExpiryMs;
    return true;
  }

  /**
   * 获取用户所有 session
   */
  getUserSessions(userId: string, currentSessionId?: string): Session[] {
    const sessionIds = this.userSessions.get(userId);
    if (!sessionIds) return [];
    const sessions: Session[] = [];
    for (const sid of sessionIds) {
      const s = this.sessions.get(sid);
      if (s) {
        sessions.push({ ...s, current: s.id === currentSessionId });
      }
    }
    return sessions.sort((a, b) => b.lastActiveAt - a.lastActiveAt);
  }

  /**
   * 销毁指定 session
   */
  destroySession(sessionId: string): boolean {
    const session = this.sessions.get(sessionId);
    if (!session) return false;
    this.sessions.delete(sessionId);
    const userSess = this.userSessions.get(session.userId);
    if (userSess) {
      userSess.delete(sessionId);
      if (userSess.size === 0) {
        this.userSessions.delete(session.userId);
      }
    }
    return true;
  }

  /**
   * 销毁用户所有其他 session
   */
  destroyOtherSessions(userId: string, currentSessionId: string): number {
    const sessionIds = this.userSessions.get(userId);
    if (!sessionIds) return 0;
    let count = 0;
    for (const sid of Array.from(sessionIds)) {
      if (sid !== currentSessionId) {
        this.destroySession(sid);
        count++;
      }
    }
    return count;
  }

  /**
   * 销毁用户所有 session
   */
  destroyAllUserSessions(userId: string): number {
    const sessionIds = this.userSessions.get(userId);
    if (!sessionIds) return 0;
    const count = sessionIds.size;
    for (const sid of Array.from(sessionIds)) {
      this.sessions.delete(sid);
    }
    this.userSessions.delete(userId);
    return count;
  }

  /**
   * 清理过期 session
   */
  cleanup(): number {
    const now = Date.now();
    let cleaned = 0;
    for (const [sid, session] of this.sessions) {
      if (now > session.expiresAt) {
        this.destroySession(sid);
        cleaned++;
      }
    }
    return cleaned;
  }

  /**
   * 获取统计
   */
  getStats() {
    return {
      totalSessions: this.sessions.size,
      totalUsers: this.userSessions.size,
    };
  }
}

// ==================== 登录安全 ====================
interface LoginAttempt {
  ip: string;
  userId?: string;
  success: boolean;
  timestamp: number;
}

class LoginSecurityManager {
  private attempts = new Map<string, LoginAttempt[]>();
  private lockedAccounts = new Map<string, number>(); // userId -> unlockTime
  private maxAttempts = 5;
  private windowMs = 15 * 60 * 1000; // 15分钟
  private lockDurationMs = 15 * 60 * 1000; // 锁定15分钟

  /**
   * 检查是否可以登录
   */
  canLogin(identifier: string): { allowed: boolean; message: string; remainingAttempts?: number } {
    // 检查账户锁定
    const lockTime = this.lockedAccounts.get(identifier);
    if (lockTime) {
      if (Date.now() < lockTime) {
        const minutes = Math.ceil((lockTime - Date.now()) / 60000);
        return { allowed: false, message: `账户已锁定，请${minutes}分钟后重试` };
      }
      this.lockedAccounts.delete(identifier);
    }

    // 检查 IP 频率
    const ipAttempts = this.attempts.get(`ip_${identifier}`) || [];
    const recent = ipAttempts.filter(a => Date.now() - a.timestamp < this.windowMs && !a.success);
    if (recent.length >= this.maxAttempts) {
      return { allowed: false, message: '尝试次数过多，请稍后再试', remainingAttempts: 0 };
    }

    return { allowed: true, message: 'OK', remainingAttempts: this.maxAttempts - recent.length };
  }

  /**
   * 记录登录尝试
   */
  recordAttempt(ip: string, userId: string, success: boolean): void {
    const attempt: LoginAttempt = { ip, userId, success, timestamp: Date.now() };

    // 记录 IP 尝试
    const ipKey = `ip_${ip}`;
    if (!this.attempts.has(ipKey)) this.attempts.set(ipKey, []);
    this.attempts.get(ipKey)!.push(attempt);

    // 记录用户尝试
    const userKey = `user_${userId}`;
    if (!this.attempts.has(userKey)) this.attempts.set(userKey, []);
    this.attempts.get(userKey)!.push(attempt);

    if (!success) {
      // 检查是否需要锁定
      const userAttempts = this.attempts.get(userKey)!.filter(
        a => Date.now() - a.timestamp < this.windowMs && !a.success
      );
      if (userAttempts.length >= this.maxAttempts) {
        this.lockedAccounts.set(userId, Date.now() + this.lockDurationMs);
      }
    }
  }

  /**
   * 解锁账户
   */
  unlockAccount(userId: string): boolean {
    return this.lockedAccounts.delete(userId);
  }

  /**
   * 检查 IP 是否可疑
   */
  isSuspiciousIP(ip: string): boolean {
    const attempts = this.attempts.get(`ip_${ip}`) || [];
    const recent = attempts.filter(a => Date.now() - a.timestamp < this.windowMs);
    return recent.length > 20; // 15分钟内超过20次请求
  }

  /**
   * 获取登录日志
   */
  getLoginLog(userId: string, limit = 20): LoginAttempt[] {
    const attempts = this.attempts.get(`user_${userId}`) || [];
    return attempts.slice(-limit).reverse();
  }

  /**
   * 清理旧记录
   */
  cleanup(): void {
    const cutoff = Date.now() - this.windowMs * 2;
    for (const [key, attempts] of this.attempts) {
      const filtered = attempts.filter(a => a.timestamp > cutoff);
      if (filtered.length === 0) {
        this.attempts.delete(key);
      } else {
        this.attempts.set(key, filtered);
      }
    }
  }
}

// 导出单例
export const passwordResetManager = new PasswordResetManager();
export const emailVerificationManager = new EmailVerificationManager();
export const sessionManager = new SessionManager();
export const loginSecurityManager = new LoginSecurityManager();

export {
  PasswordResetManager,
  EmailVerificationManager,
  SessionManager,
  LoginSecurityManager,
};
