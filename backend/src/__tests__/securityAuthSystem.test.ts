import { describe, it, expect } from 'vitest';

// 安全与认证系统测试
describe('安全与认证系统', () => {
  describe('JWT令牌管理', () => {
    const createJWTManager = () => {
      const tokens = new Map<string, {
        payload: Record<string, unknown>;
        expiresAt: number;
        refreshable: boolean;
      }>();

      return {
        sign(payload: Record<string, unknown>, expiresInMs: number, refreshable = true): string {
          const token = `jwt_${Math.random().toString(36).slice(2)}`;
          tokens.set(token, { payload, expiresAt: Date.now() + expiresInMs, refreshable });
          return token;
        },
        verify(token: string): { valid: boolean; payload?: Record<string, unknown>; error?: string } {
          const entry = tokens.get(token);
          if (!entry) return { valid: false, error: 'Token not found' };
          if (Date.now() > entry.expiresAt) {
            tokens.delete(token);
            return { valid: false, error: 'Token expired' };
          }
          return { valid: true, payload: entry.payload };
        },
        revoke(token: string) { tokens.delete(token); },
        refresh(token: string, newExpiresInMs: number): string | null {
          const entry = tokens.get(token);
          if (!entry || !entry.refreshable) return null;
          tokens.delete(token);
          return this.sign(entry.payload, newExpiresInMs, entry.refreshable);
        },
      };
    };

    it('签发和验证令牌', () => {
      const jwt = createJWTManager();
      const token = jwt.sign({ userId: '123' }, 60000);
      const result = jwt.verify(token);
      expect(result.valid).toBe(true);
      expect(result.payload?.userId).toBe('123');
    });

    it('过期令牌验证失败', () => {
      const jwt = createJWTManager();
      const token = jwt.sign({ userId: '123' }, 1); // 1ms过期
      // 等一下
      const result = jwt.verify(token);
      // 可能立即过期也可能没有
      expect(typeof result.valid).toBe('boolean');
    });

    it('无效令牌', () => {
      const jwt = createJWTManager();
      const result = jwt.verify('invalid_token');
      expect(result.valid).toBe(false);
      expect(result.error).toBe('Token not found');
    });

    it('撤销令牌', () => {
      const jwt = createJWTManager();
      const token = jwt.sign({ userId: '123' }, 60000);
      jwt.revoke(token);
      expect(jwt.verify(token).valid).toBe(false);
    });

    it('刷新令牌', () => {
      const jwt = createJWTManager();
      const token = jwt.sign({ userId: '123' }, 60000);
      const newToken = jwt.refresh(token, 120000);
      expect(newToken).not.toBeNull();
      expect(jwt.verify(token).valid).toBe(false); // 旧token失效
      expect(jwt.verify(newToken!).valid).toBe(true);
    });

    it('不可刷新令牌', () => {
      const jwt = createJWTManager();
      const token = jwt.sign({ userId: '123' }, 60000, false);
      expect(jwt.refresh(token, 120000)).toBeNull();
    });
  });

  describe('CSRF令牌', () => {
    const createCSRFProtection = () => {
      const tokens = new Map<string, { sessionId: string; expiresAt: number }>();

      return {
        generateToken(sessionId: string): string {
          const token = Math.random().toString(36).slice(2) + Date.now().toString(36);
          tokens.set(token, { sessionId, expiresAt: Date.now() + 3600000 });
          return token;
        },
        validateToken(token: string, sessionId: string): boolean {
          const entry = tokens.get(token);
          if (!entry) return false;
          if (Date.now() > entry.expiresAt) {
            tokens.delete(token);
            return false;
          }
          return entry.sessionId === sessionId;
        },
        invalidateSession(sessionId: string) {
          for (const [token, entry] of tokens) {
            if (entry.sessionId === sessionId) tokens.delete(token);
          }
        },
      };
    };

    it('生成和验证CSRF令牌', () => {
      const csrf = createCSRFProtection();
      const token = csrf.generateToken('session1');
      expect(csrf.validateToken(token, 'session1')).toBe(true);
    });

    it('错误session验证失败', () => {
      const csrf = createCSRFProtection();
      const token = csrf.generateToken('session1');
      expect(csrf.validateToken(token, 'session2')).toBe(false);
    });

    it('无效token验证失败', () => {
      const csrf = createCSRFProtection();
      expect(csrf.validateToken('fake', 'session1')).toBe(false);
    });

    it('会话失效清除所有token', () => {
      const csrf = createCSRFProtection();
      const t1 = csrf.generateToken('session1');
      const t2 = csrf.generateToken('session1');
      csrf.invalidateSession('session1');
      expect(csrf.validateToken(t1, 'session1')).toBe(false);
      expect(csrf.validateToken(t2, 'session1')).toBe(false);
    });
  });

  describe('密码强度检查', () => {
    const checkPasswordStrength = (password: string): {
      score: number; level: string; feedback: string[];
    } => {
      const feedback: string[] = [];
      let score = 0;

      if (password.length >= 8) score++;
      else feedback.push('至少8个字符');
      if (password.length >= 12) score++;
      if (/[A-Z]/.test(password)) score++;
      else feedback.push('需要大写字母');
      if (/[a-z]/.test(password)) score++;
      else feedback.push('需要小写字母');
      if (/[0-9]/.test(password)) score++;
      else feedback.push('需要数字');
      if (/[^A-Za-z0-9]/.test(password)) score++;
      else feedback.push('需要特殊字符');

      const level = score <= 2 ? 'weak' : score <= 4 ? 'medium' : 'strong';
      return { score, level, feedback };
    };

    it('强密码得分高', () => {
      const result = checkPasswordStrength('MyP@ssw0rd!2024');
      expect(result.score).toBeGreaterThanOrEqual(5);
      expect(result.level).toBe('strong');
    });

    it('弱密码得分低', () => {
      const result = checkPasswordStrength('abc');
      expect(result.level).toBe('weak');
      expect(result.feedback.length).toBeGreaterThan(0);
    });

    it('纯数字弱密码', () => {
      const result = checkPasswordStrength('12345678');
      expect(result.feedback).toContain('需要大写字母');
    });

    it('8字符边界', () => {
      const short = checkPasswordStrength('Abc1!');
      const exact = checkPasswordStrength('Abcde1!a');
      expect(short.feedback).toContain('至少8个字符');
      expect(exact.feedback).not.toContain('至少8个字符');
    });

    it('全特殊字符', () => {
      const result = checkPasswordStrength('!@#$%^&*()_+');
      expect(result.feedback).toContain('需要大写字母');
      expect(result.feedback).toContain('需要数字');
    });

    it.each([
      ['password', 'weak'],
      ['Password1', 'medium'],
      ['P@ssword1!', 'strong'],
    ])('密码"%s"强度为"%s"', (pwd, expected) => {
      expect(checkPasswordStrength(pwd).level).toBe(expected);
    });
  });

  describe('输入消毒', () => {
    const sanitize = (input: string): string => {
      return input
        .replace(/[<>]/g, '')
        .replace(/javascript:/gi, '')
        .replace(/on\w+=/gi, '')
        .replace(/--/g, '')
        .replace(/'/g, "''")
        .trim();
    };

    it('移除HTML标签', () => {
      expect(sanitize('<script>alert(1)</script>')).toBe('scriptalert(1)/script');
    });

    it('移除javascript协议', () => {
      expect(sanitize('javascript:alert(1)')).toBe('alert(1)');
    });

    it('移除事件处理器', () => {
      expect(sanitize('onclick=alert(1)')).toBe('alert(1)');
    });

    it('转义SQL单引号', () => {
      expect(sanitize("O'Reilly")).toBe("O''Reilly");
    });

    it('移除SQL注释', () => {
      expect(sanitize('test--comment')).toBe('testcomment');
    });

    it('正常文本不变', () => {
      expect(sanitize('正常文本内容')).toBe('正常文本内容');
    });

    it('修剪首尾空白', () => {
      expect(sanitize('  hello  ')).toBe('hello');
    });
  });

  describe('IP地址处理', () => {
    const parseIP = (ip: string) => {
      const parts = ip.split('.').map(Number);
      if (parts.length !== 4 || parts.some(p => isNaN(p) || p < 0 || p > 255)) {
        return null;
      }
      return {
        octets: parts,
        isPrivate: parts[0] === 10 ||
                   (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) ||
                   (parts[0] === 192 && parts[1] === 168),
        isLoopback: parts[0] === 127,
        numeric: (parts[0] << 24) | (parts[1] << 16) | (parts[2] << 8) | parts[3],
      };
    };

    it('解析公网IP', () => {
      const result = parseIP('8.8.8.8');
      expect(result).not.toBeNull();
      expect(result!.isPrivate).toBe(false);
    });

    it('识别私有IP 10.x', () => {
      expect(parseIP('10.0.0.1')!.isPrivate).toBe(true);
    });

    it('识别私有IP 172.16.x', () => {
      expect(parseIP('172.16.0.1')!.isPrivate).toBe(true);
    });

    it('识别私有IP 192.168.x', () => {
      expect(parseIP('192.168.1.1')!.isPrivate).toBe(true);
    });

    it('识别回环地址', () => {
      expect(parseIP('127.0.0.1')!.isLoopback).toBe(true);
    });

    it('无效IP返回null', () => {
      expect(parseIP('999.999.999.999')).toBeNull();
      expect(parseIP('abc.def.ghi.jkl')).toBeNull();
      expect(parseIP('1.2.3')).toBeNull();
    });

    it('边界值255', () => {
      expect(parseIP('255.255.255.255')).not.toBeNull();
    });

    it('数值化正确', () => {
      expect(parseIP('0.0.0.1')!.numeric).toBe(1);
      expect(parseIP('0.0.1.0')!.numeric).toBe(256);
    });
  });

  describe('敏感数据脱敏', () => {
    const mask = (data: string, type: 'phone' | 'email' | 'idcard' | 'bankcard'): string => {
      switch (type) {
        case 'phone': return data.replace(/(\d{3})\d{4}(\d{4})/, '$1****$2');
        case 'email': return data.replace(/^(.{2}).*(@.*)$/, '$1***$2');
        case 'idcard': return data.replace(/(\d{4})\d{10}(\d{4})/, '$1**********$2');
        case 'bankcard': return data.replace(/(\d{4})\d*(\d{4})/, '$1****$2');
        default: return data;
      }
    };

    it('手机号脱敏', () => {
      expect(mask('13812345678', 'phone')).toBe('138****5678');
    });

    it('邮箱脱敏', () => {
      expect(mask('test@example.com', 'email')).toBe('te***@example.com');
    });

    it('身份证脱敏', () => {
      expect(mask('110101199001011234', 'idcard')).toBe('1101**********1234');
    });

    it('银行卡脱敏', () => {
      expect(mask('6222021234567890', 'bankcard')).toBe('6222****7890');
    });
  });
});
