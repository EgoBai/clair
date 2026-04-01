import { describe, it, expect } from 'vitest';
import {
  passwordResetManager,
  emailVerificationManager,
  sessionManager,
  loginSecurityManager,
} from '../utils/userEnhanced';

describe('PasswordResetManager', () => {
  describe('createResetRequest', () => {
    it('should create a reset request with token starting with rst_', () => {
      const userId = `user_${Date.now()}`;
      const result = passwordResetManager.createResetRequest(userId, `${Date.now()}@test.com`);
      expect(result.success).toBe(true);
      expect(result.token).toBeDefined();
      expect(result.token!.startsWith('rst_')).toBe(true);
      expect(result.message).toBeDefined();
    });
  });

  describe('verifyResetToken', () => {
    it('should reject invalid token', () => {
      const result = passwordResetManager.verifyResetToken('invalid_token');
      expect(result.valid).toBe(false);
    });

    it('should verify a freshly created token', () => {
      const userId = `user_vrt_${Date.now()}`;
      const email = `vrt_${Date.now()}@test.com`;
      const { token } = passwordResetManager.createResetRequest(userId, email);
      expect(token).toBeDefined();
      const result = passwordResetManager.verifyResetToken(token!);
      expect(result.valid).toBe(true);
      expect(result.userId).toBe(userId);
    });
  });

  describe('useResetToken', () => {
    it('should reject weak password', () => {
      const userId = `user_wk_${Date.now()}`;
      const { token } = passwordResetManager.createResetRequest(userId, `wk_${Date.now()}@test.com`);
      const result = passwordResetManager.useResetToken(token!, 'weak');
      expect(result.success).toBe(false);
    });

    it('should use valid token with strong password', () => {
      const userId = `user_use_${Date.now()}`;
      const { token } = passwordResetManager.createResetRequest(userId, `use_${Date.now()}@test.com`);
      const result = passwordResetManager.useResetToken(token!, 'StrongPass123!');
      expect(result.success).toBe(true);
      expect(result.userId).toBe(userId);
    });

    it('should not allow token reuse', () => {
      const userId = `user_reuse_${Date.now()}`;
      const { token } = passwordResetManager.createResetRequest(userId, `reuse_${Date.now()}@test.com`);
      passwordResetManager.useResetToken(token!, 'StrongPass123!');
      const second = passwordResetManager.useResetToken(token!, 'NewPass456!');
      expect(second.success).toBe(false);
    });
  });

  describe('getStats', () => {
    it('should return stats object', () => {
      const stats = passwordResetManager.getStats();
      expect(stats).toBeDefined();
      expect(typeof stats.activeResetTokens).toBe('number');
      expect(typeof stats.rateLimitedEmails).toBe('number');
    });
  });
});

describe('EmailVerificationManager', () => {
  describe('createVerification', () => {
    it('should create verification request', () => {
      const userId = `ev_${Date.now()}`;
      const result = emailVerificationManager.createVerification(userId, `ev_${Date.now()}@test.com`);
      expect(result.success).toBe(true);
      expect(result.token).toBeDefined();
    });
  });

  describe('verifyEmail', () => {
    it('should reject invalid token', () => {
      const result = emailVerificationManager.verifyEmail('invalid');
      expect(result.success).toBe(false);
    });

    it('should verify with valid token', () => {
      const userId = `ev_v_${Date.now()}`;
      const { token } = emailVerificationManager.createVerification(userId, `evv_${Date.now()}@test.com`);
      expect(token).toBeDefined();
      const result = emailVerificationManager.verifyEmail(token!);
      expect(result.success).toBe(true);
      expect(result.userId).toBe(userId);
    });
  });

  describe('isVerified', () => {
    it('should return false before verification', () => {
      expect(emailVerificationManager.isVerified(`user_new_${Date.now()}`)).toBe(false);
    });

    it('should return true after verification', () => {
      const userId = `ev_iv_${Date.now()}`;
      const { token } = emailVerificationManager.createVerification(userId, `eviv_${Date.now()}@test.com`);
      emailVerificationManager.verifyEmail(token!);
      expect(emailVerificationManager.isVerified(userId)).toBe(true);
    });
  });

  describe('getStats', () => {
    it('should return stats', () => {
      const stats = emailVerificationManager.getStats();
      expect(stats).toBeDefined();
      expect(typeof stats.verified).toBe('number');
      expect(typeof stats.pending).toBe('number');
    });
  });
});

describe('SessionManager', () => {
  describe('createSession', () => {
    it('should create a session', () => {
      const session = sessionManager.createSession(`u_${Date.now()}`, 'Chrome/120', '192.168.1.1');
      expect(session.id).toBeDefined();
      expect(session.deviceInfo).toBe('Chrome/120');
      expect(session.ip).toBe('192.168.1.1');
    });
  });

  describe('getSession', () => {
    it('should retrieve session', () => {
      const userId = `u_gs_${Date.now()}`;
      const session = sessionManager.createSession(userId, 'Chrome/120', '127.0.0.1');
      const retrieved = sessionManager.getSession(session.id);
      expect(retrieved?.userId).toBe(userId);
    });

    it('should return undefined for unknown session', () => {
      expect(sessionManager.getSession('unknown')).toBeUndefined();
    });
  });

  describe('touchSession', () => {
    it('should update session activity', () => {
      const session = sessionManager.createSession(`u_ts_${Date.now()}`, 'Chrome/120', '127.0.0.1');
      const result = sessionManager.touchSession(session.id);
      expect(result).toBe(true);
    });

    it('should return false for unknown session', () => {
      expect(sessionManager.touchSession('unknown')).toBe(false);
    });
  });

  describe('getUserSessions', () => {
    it('should list user sessions', () => {
      const userId = `u_gus_${Date.now()}`;
      sessionManager.createSession(userId, 'Chrome/120', '127.0.0.1');
      sessionManager.createSession(userId, 'Safari/17', '192.168.1.1');
      const sessions = sessionManager.getUserSessions(userId);
      expect(sessions.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('destroySession', () => {
    it('should destroy session', () => {
      const session = sessionManager.createSession(`u_ds_${Date.now()}`, 'Chrome/120', '127.0.0.1');
      sessionManager.destroySession(session.id);
      expect(sessionManager.getSession(session.id)).toBeUndefined();
    });
  });

  describe('destroyOtherSessions', () => {
    it('should keep current session', () => {
      const userId = `u_dos_${Date.now()}`;
      const current = sessionManager.createSession(userId, 'Chrome/120', '127.0.0.1');
      sessionManager.createSession(userId, 'Safari/17', '192.168.1.1');
      const destroyed = sessionManager.destroyOtherSessions(userId, current.id);
      expect(destroyed).toBeGreaterThanOrEqual(1);
      expect(sessionManager.getSession(current.id)).toBeDefined();
    });
  });
});

describe('LoginSecurityManager', () => {
  describe('canLogin', () => {
    it('should allow login initially', () => {
      const identifier = `new_ip_${Date.now()}`;
      const result = loginSecurityManager.canLogin(identifier);
      expect(result.allowed).toBe(true);
    });
  });

  describe('recordAttempt', () => {
    it('should record failed attempts', () => {
      const ip = `ip_${Date.now()}`;
      const userId = `u_ra_${Date.now()}`;
      loginSecurityManager.recordAttempt(ip, userId, false);
      loginSecurityManager.recordAttempt(ip, userId, false);
      loginSecurityManager.recordAttempt(ip, userId, false);
      const result = loginSecurityManager.canLogin(ip);
      expect(typeof result.allowed).toBe('boolean');
    });

    it('should reset on successful login', () => {
      const ip = `ip_rs_${Date.now()}`;
      const userId = `u_rs_${Date.now()}`;
      loginSecurityManager.recordAttempt(ip, userId, false);
      loginSecurityManager.recordAttempt(ip, userId, true);
      const result = loginSecurityManager.canLogin(ip);
      expect(result.allowed).toBe(true);
    });
  });

  describe('unlockAccount', () => {
    it('should unlock account', () => {
      const result = loginSecurityManager.unlockAccount(`user_ua_${Date.now()}`);
      expect(typeof result).toBe('boolean');
    });
  });

  describe('getLoginLog', () => {
    it('should return login log', () => {
      const userId = `u_gll_${Date.now()}`;
      const ip = `ip_gll_${Date.now()}`;
      loginSecurityManager.recordAttempt(ip, userId, false);
      loginSecurityManager.recordAttempt(ip, userId, true);
      const log = loginSecurityManager.getLoginLog(userId);
      expect(log.length).toBeGreaterThanOrEqual(2);
    });
  });
});
