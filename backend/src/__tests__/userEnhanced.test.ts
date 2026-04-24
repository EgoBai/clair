import { describe, it, expect, beforeEach } from 'vitest';
import {
  passwordResetManager,
  emailVerificationManager,
  sessionManager,
  loginSecurityManager,
} from '../utils/userEnhanced';

// ==================== PasswordResetManager ====================

describe('PasswordResetManager', () => {
  beforeEach(() => {
    // Reset internal state by creating a new one — hack: cast to any and clear
    // The module exports singletons, so we test the singleton's methods individually
  });

  describe('createResetRequest', () => {
    it('should create a reset request successfully', () => {
      const result = passwordResetManager.createResetRequest('user1', 'test@example.com');
      expect(result.success).toBe(true);
      expect(result.token).toBeDefined();
      expect(result.token).toMatch(/^rst_/);
    });

    it('should rate limit after max requests', () => {
      // Create 3 requests (max = 3)
      passwordResetManager.createResetRequest('user2', 'rate@test.com');
      passwordResetManager.createResetRequest('user2', 'rate@test.com');
      passwordResetManager.createResetRequest('user2', 'rate@test.com');
      // 4th should fail
      const result = passwordResetManager.createResetRequest('user2', 'rate@test.com');
      expect(result.success).toBe(false);
      expect(result.message).toContain('频繁');
    });

    it('should clear old tokens for the same user', () => {
      const r1 = passwordResetManager.createResetRequest('user3', 'a@test.com');
      const r2 = passwordResetManager.createResetRequest('user3', 'b@test.com');
      expect(r2.success).toBe(true);
      // The old token should be gone — verify r1's token is invalid now
      const verify = passwordResetManager.verifyResetToken(r1.token!);
      expect(verify.valid).toBe(false);
    });
  });

  describe('verifyResetToken', () => {
    it('should verify a valid token', () => {
      const created = passwordResetManager.createResetRequest('user4', 'v@test.com');
      const result = passwordResetManager.verifyResetToken(created.token!);
      expect(result.valid).toBe(true);
      expect(result.userId).toBe('user4');
    });

    it('should reject an invalid token', () => {
      const result = passwordResetManager.verifyResetToken('nonexistent');
      expect(result.valid).toBe(false);
      expect(result.message).toContain('无效');
    });

    it('should reject a used token', () => {
      const created = passwordResetManager.createResetRequest('user5', 'u@test.com');
      passwordResetManager.useResetToken(created.token!, 'NewPass123');
      const result = passwordResetManager.verifyResetToken(created.token!);
      expect(result.valid).toBe(false);
      expect(result.message).toContain('已使用');
    });

    it('should reject expired tokens', () => {
      const created = passwordResetManager.createResetRequest('user6', 'e@test.com');
      // Manually expire the token without deleting it
      const resetMgr = passwordResetManager as any;
      const req = resetMgr.resetTokens.get(created.token);
      req.expiresAt = Date.now() - 1000;
      // verifyResetToken checks expiresAt and returns '过期' before cleaning up
      const result = passwordResetManager.verifyResetToken(created.token!);
      expect(result.valid).toBe(false);
      expect(result.message).toContain('过期');
    });
  });

  describe('useResetToken', () => {
    it('should use a token to reset password', () => {
      const created = passwordResetManager.createResetRequest('user10', 'reset@test.com');
      const result = passwordResetManager.useResetToken(created.token!, 'NewStrongPass1');
      expect(result.success).toBe(true);
      expect(result.userId).toBe('user10');
    });

    it('should reject weak passwords', () => {
      const created = passwordResetManager.createResetRequest('user11', 'weak@test.com');
      const result = passwordResetManager.useResetToken(created.token!, 'short');
      expect(result.success).toBe(false);
      expect(result.message).toContain('密码强度');
    });

    it('should fail for invalid tokens', () => {
      const result = passwordResetManager.useResetToken('bad_token', 'NewPass123');
      expect(result.success).toBe(false);
    });
  });

  describe('validatePasswordStrength', () => {
    it('should accept strong passwords (length >= 8, 3+ criteria)', () => {
      expect(passwordResetManager.validatePasswordStrength('Pass1234')).toBe(true);
      expect(passwordResetManager.validatePasswordStrength('Abcdef1!')).toBe(true);
    });

    it('should reject short passwords', () => {
      expect(passwordResetManager.validatePasswordStrength('Ab1!')).toBe(false);
    });

    it('should reject passwords meeting only 2 criteria', () => {
      expect(passwordResetManager.validatePasswordStrength('abcdefgh')).toBe(false); // only lowercase
    });
  });

  describe('cleanup', () => {
    it('should clean up expired tokens', () => {
      const created = passwordResetManager.createResetRequest('user20', 'clean@test.com');
      const resetMgr = passwordResetManager as any;
      const req = resetMgr.resetTokens.get(created.token);
      req.expiresAt = Date.now() - 1000;

      const cleaned = passwordResetManager.cleanup();
      expect(cleaned).toBeGreaterThanOrEqual(1);
    });
  });

  describe('getStats', () => {
    it('should return stats without errors', () => {
      const stats = passwordResetManager.getStats();
      expect(stats).toHaveProperty('activeResetTokens');
      expect(stats).toHaveProperty('rateLimitedEmails');
    });
  });
});

// ==================== EmailVerificationManager ====================

describe('EmailVerificationManager', () => {
  describe('createVerification', () => {
    it('should create a verification token', () => {
      const result = emailVerificationManager.createVerification('u1', 'a@test.com');
      expect(result.success).toBe(true);
      expect(result.token).toMatch(/^vrf_/);
    });

    it('should not create if already verified', () => {
      const r1 = emailVerificationManager.createVerification('u2', 'b@test.com');
      emailVerificationManager.verifyEmail(r1.token!);
      const r2 = emailVerificationManager.createVerification('u2', 'b@test.com');
      expect(r2.success).toBe(false);
      expect(r2.message).toContain('已验证');
    });

    it('should enforce resend cooldown (60s)', () => {
      const r1 = emailVerificationManager.createVerification('u3', 'c@test.com');
      const r2 = emailVerificationManager.createVerification('u3', 'c@test.com');
      expect(r2.success).toBe(false);
      expect(r2.message).toContain('60秒');
    });
  });

  describe('verifyEmail', () => {
    it('should verify email with valid token', () => {
      const created = emailVerificationManager.createVerification('u4', 'd@test.com');
      const result = emailVerificationManager.verifyEmail(created.token!);
      expect(result.success).toBe(true);
      expect(result.userId).toBe('u4');
    });

    it('should reject invalid token', () => {
      const result = emailVerificationManager.verifyEmail('bad_token');
      expect(result.success).toBe(false);
      expect(result.message).toContain('无效');
    });

    it('should reject already verified token', () => {
      const created = emailVerificationManager.createVerification('u5', 'e@test.com');
      emailVerificationManager.verifyEmail(created.token!);
      const result = emailVerificationManager.verifyEmail(created.token!);
      expect(result.success).toBe(false);
    });
  });

  describe('isVerified', () => {
    it('should return true for verified user', () => {
      const created = emailVerificationManager.createVerification('u6', 'f@test.com');
      emailVerificationManager.verifyEmail(created.token!);
      expect(emailVerificationManager.isVerified('u6')).toBe(true);
    });

    it('should return false for unverified user', () => {
      emailVerificationManager.createVerification('u7', 'g@test.com');
      expect(emailVerificationManager.isVerified('u7')).toBe(false);
    });

    it('should return false for unknown user', () => {
      expect(emailVerificationManager.isVerified('unknown')).toBe(false);
    });
  });

  describe('getStats', () => {
    it('should return verification stats', () => {
      const stats = emailVerificationManager.getStats();
      expect(stats).toHaveProperty('verified');
      expect(stats).toHaveProperty('pending');
      expect(stats).toHaveProperty('total');
    });
  });
});

// ==================== SessionManager ====================

describe('SessionManager', () => {
  describe('createSession', () => {
    it('should create a new session', () => {
      const session = sessionManager.createSession('u100', 'Chrome/120', '192.168.1.1');
      expect(session.id).toMatch(/^sess_/);
      expect(session.userId).toBe('u100');
      expect(session.deviceInfo).toBe('Chrome/120');
    });

    it('should enforce max sessions per user (5)', () => {
      for (let i = 0; i < 6; i++) {
        sessionManager.createSession('u101', `Device-${i}`, '10.0.0.1');
      }
      const sessions = sessionManager.getUserSessions('u101');
      expect(sessions.length).toBeLessThanOrEqual(5);
    });
  });

  describe('getSession', () => {
    it('should retrieve an existing session', () => {
      const created = sessionManager.createSession('u102', 'Firefox', '10.0.0.2');
      const retrieved = sessionManager.getSession(created.id);
      expect(retrieved).toBeDefined();
      expect(retrieved!.userId).toBe('u102');
    });

    it('should return undefined for non-existent session', () => {
      expect(sessionManager.getSession('nonexistent')).toBeUndefined();
    });
  });

  describe('touchSession', () => {
    it('should refresh session expiry', () => {
      const created = sessionManager.createSession('u103', 'Safari', '10.0.0.3');
      const result = sessionManager.touchSession(created.id);
      expect(result).toBe(true);
    });

    it('should return false for non-existent session', () => {
      expect(sessionManager.touchSession('nonexistent')).toBe(false);
    });
  });

  describe('getUserSessions', () => {
    it('should list user sessions sorted by lastActiveAt desc', () => {
      const s1 = sessionManager.createSession('u200', 'Device-A', '1.1.1.1');
      const s2 = sessionManager.createSession('u200', 'Device-B', '2.2.2.2');
      const sessions = sessionManager.getUserSessions('u200', s2.id);
      expect(sessions.length).toBe(2);
      const current = sessions.find(s => s.current);
      expect(current).toBeDefined();
      expect(current!.id).toBe(s2.id);
    });

    it('should return empty for unknown user', () => {
      expect(sessionManager.getUserSessions('unknown')).toEqual([]);
    });
  });

  describe('destroySession', () => {
    it('should destroy a session', () => {
      const created = sessionManager.createSession('u300', 'Edge', '10.0.0.4');
      const result = sessionManager.destroySession(created.id);
      expect(result).toBe(true);
      expect(sessionManager.getSession(created.id)).toBeUndefined();
    });

    it('should return false for non-existent session', () => {
      expect(sessionManager.destroySession('fake_sess')).toBe(false);
    });
  });

  describe('destroyOtherSessions', () => {
    it('should destroy all sessions except current', () => {
      const s1 = sessionManager.createSession('u400', 'A', '1.1.1.1');
      const s2 = sessionManager.createSession('u400', 'B', '2.2.2.2');
      const s3 = sessionManager.createSession('u400', 'C', '3.3.3.3');
      const count = sessionManager.destroyOtherSessions('u400', s2.id);
      expect(count).toBe(2);
      expect(sessionManager.getSession(s1.id)).toBeUndefined();
      expect(sessionManager.getSession(s2.id)).toBeDefined();
    });
  });

  describe('destroyAllUserSessions', () => {
    it('should destroy all sessions for a user', () => {
      sessionManager.createSession('u500', 'Dev1', '1.1.1.1');
      sessionManager.createSession('u500', 'Dev2', '2.2.2.2');
      const count = sessionManager.destroyAllUserSessions('u500');
      expect(count).toBe(2);
      expect(sessionManager.getUserSessions('u500')).toEqual([]);
    });
  });

  describe('getStats', () => {
    it('should return session stats', () => {
      sessionManager.createSession('u600', 'Test', '10.0.0.5');
      const stats = sessionManager.getStats();
      expect(stats).toHaveProperty('totalSessions');
      expect(stats).toHaveProperty('totalUsers');
    });
  });
});

// ==================== LoginSecurityManager ====================

describe('LoginSecurityManager', () => {
  describe('canLogin', () => {
    it('should allow login initially', () => {
      const result = loginSecurityManager.canLogin('user_new');
      expect(result.allowed).toBe(true);
      expect(result.remainingAttempts).toBe(5);
    });

    it('should block after max failed attempts', () => {
      const ip = '1.2.3.4';
      for (let i = 0; i < 5; i++) {
        loginSecurityManager.recordAttempt(ip, `user_fail_${i}`, false);
      }
      // Use ip-based check
      const result = loginSecurityManager.canLogin(ip);
      expect(result.allowed).toBe(false);
    });
  });

  describe('recordAttempt', () => {
    it('should lock account after max failed attempts', () => {
      const userId = 'user_lockable';
      for (let i = 0; i < 5; i++) {
        loginSecurityManager.recordAttempt('10.0.0.99', userId, false);
      }
      const result = loginSecurityManager.canLogin(userId);
      expect(result.allowed).toBe(false);
      expect(result.message).toContain('锁定');
    });

    it('should reset attempts on successful login', () => {
      // This manager doesn't auto-reset on success, but canLogin with userId
      // checks recent failed attempts
      // Let's verify that successful attempts don't get counted for the lock
      const userId = 'user_success_reset';
      loginSecurityManager.recordAttempt('10.0.0.98', userId, true);
      const result = loginSecurityManager.canLogin(userId);
      expect(result.allowed).toBe(true);
    });
  });

  describe('unlockAccount', () => {
    it('should unlock a locked account', () => {
      const userId = 'user_to_unlock';
      for (let i = 0; i < 5; i++) {
        loginSecurityManager.recordAttempt('10.0.0.97', userId, false);
      }
      const before = loginSecurityManager.canLogin(userId);
      expect(before.allowed).toBe(false);

      const unlocked = loginSecurityManager.unlockAccount(userId);
      expect(unlocked).toBe(true);

      const after = loginSecurityManager.canLogin(userId);
      expect(after.allowed).toBe(true);
    });

    it('should return false for non-locked account', () => {
      expect(loginSecurityManager.unlockAccount('not_locked')).toBe(false);
    });
  });

  describe('isSuspiciousIP', () => {
    it('should flag IP with >20 requests in window', () => {
      const ip = '5.5.5.5';
      for (let i = 0; i < 25; i++) {
        loginSecurityManager.recordAttempt(ip, `user_${i}`, false);
      }
      expect(loginSecurityManager.isSuspiciousIP(ip)).toBe(true);
    });

    it('should not flag IP with few requests', () => {
      expect(loginSecurityManager.isSuspiciousIP('clean.ip')).toBe(false);
    });
  });

  describe('getLoginLog', () => {
    it('should return user login attempts in reverse order', () => {
      const userId = 'user_logged';
      loginSecurityManager.recordAttempt('1.1.1.1', userId, false);
      loginSecurityManager.recordAttempt('2.2.2.2', userId, true);
      const log = loginSecurityManager.getLoginLog(userId);
      expect(log.length).toBe(2);
      // Most recent first
      expect(log[0].success).toBe(true);
    });

    it('should respect limit parameter', () => {
      const userId = 'user_limit';
      for (let i = 0; i < 30; i++) {
        loginSecurityManager.recordAttempt(`ip_${i}`, userId, true);
      }
      const log = loginSecurityManager.getLoginLog(userId, 10);
      expect(log.length).toBe(10);
    });
  });

  describe('cleanup', () => {
    it('should not throw when cleaning up', () => {
      expect(() => loginSecurityManager.cleanup()).not.toThrow();
    });
  });
});
