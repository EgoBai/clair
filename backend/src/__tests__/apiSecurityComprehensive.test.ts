import { describe, it, expect } from 'vitest';

describe('API安全与网关综合测试', () => {

  // 请求签名
  const generateSignature = (method: string, path: string, body: string, timestamp: number, secret: string) => {
    const payload = `${method}|${path}|${body}|${timestamp}`;
    let hash = 0;
    for (let i = 0; i < (payload + secret).length; i++) {
      const char = (payload + secret).charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash |= 0;
    }
    return Math.abs(hash).toString(16).padStart(8, '0');
  };

  describe('请求签名', () => {
    it('相同输入相同签名', () => {
      const sig1 = generateSignature('GET', '/api/stocks', '', 1000, 'secret');
      const sig2 = generateSignature('GET', '/api/stocks', '', 1000, 'secret');
      expect(sig1).toBe(sig2);
    });
    it('不同方法不同签名', () => {
      const sig1 = generateSignature('GET', '/api/stocks', '', 1000, 'secret');
      const sig2 = generateSignature('POST', '/api/stocks', '', 1000, 'secret');
      expect(sig1).not.toBe(sig2);
    });
    it('不同路径不同签名', () => {
      const sig1 = generateSignature('GET', '/api/stocks', '', 1000, 'secret');
      const sig2 = generateSignature('GET', '/api/kline', '', 1000, 'secret');
      expect(sig1).not.toBe(sig2);
    });
    it('不同时间戳不同签名', () => {
      const sig1 = generateSignature('GET', '/api/stocks', '', 1000, 'secret');
      const sig2 = generateSignature('GET', '/api/stocks', '', 2000, 'secret');
      expect(sig1).not.toBe(sig2);
    });
    it('不同密钥不同签名', () => {
      const sig1 = generateSignature('GET', '/api/stocks', '', 1000, 'secret1');
      const sig2 = generateSignature('GET', '/api/stocks', '', 1000, 'secret2');
      expect(sig1).not.toBe(sig2);
    });
    it('签名格式', () => {
      const sig = generateSignature('GET', '/api', '', 0, 'key');
      expect(sig).toMatch(/^[0-9a-f]{8}$/);
    });
  });

  // 重放攻击防护
  const nonceStore = new Set<string>();
  const isValidNonce = (nonce: string, timestamp: number, windowMs: number = 300000) => {
    const now = Date.now();
    if (Math.abs(now - timestamp) > windowMs) return false;
    if (nonceStore.has(nonce)) return false;
    nonceStore.add(nonce);
    return true;
  };

  describe('重放攻击防护', () => {
    it('首次nonce有效', () => {
      expect(isValidNonce('nonce-1', Date.now())).toBe(true);
    });
    it('重复nonce无效', () => {
      // nonce-1 was already used above
      expect(isValidNonce('nonce-1', Date.now())).toBe(false);
    });
    it('过期时间戳无效', () => {
      expect(isValidNonce('nonce-expired', Date.now() - 600000)).toBe(false);
    });
    it('新nonce有效', () => {
      expect(isValidNonce('nonce-new-' + Math.random(), Date.now())).toBe(true);
    });
  });

  // IP 白名单
  const checkIPWhitelist = (ip: string, whitelist: string[]) => {
    if (whitelist.includes('*')) return true;
    for (const entry of whitelist) {
      if (entry === ip) return true;
      if (entry.endsWith('.*')) {
        const prefix = entry.slice(0, -2);
        if (ip.startsWith(prefix)) return true;
      }
      if (entry.includes('/')) {
        const [network, bits] = entry.split('/');
        const mask = ~((1 << (32 - parseInt(bits))) - 1);
        const ipNum = ip.split('.').reduce((acc, octet) => (acc << 8) + parseInt(octet), 0);
        const netNum = network.split('.').reduce((acc, octet) => (acc << 8) + parseInt(octet), 0);
        if ((ipNum & mask) === (netNum & mask)) return true;
      }
    }
    return false;
  };

  describe('IP白名单', () => {
    it('精确匹配', () => {
      expect(checkIPWhitelist('192.168.1.1', ['192.168.1.1'])).toBe(true);
    });
    it('不匹配', () => {
      expect(checkIPWhitelist('10.0.0.1', ['192.168.1.1'])).toBe(false);
    });
    it('通配符允许所有', () => {
      expect(checkIPWhitelist('1.2.3.4', ['*'])).toBe(true);
    });
    it('子网匹配', () => {
      expect(checkIPWhitelist('192.168.1.100', ['192.168.*'])).toBe(true);
    });
    it('子网不匹配', () => {
      expect(checkIPWhitelist('10.0.0.1', ['192.168.*'])).toBe(false);
    });
    it('CIDR匹配', () => {
      expect(checkIPWhitelist('192.168.1.100', ['192.168.1.0/24'])).toBe(true);
    });
    it('CIDR不匹配', () => {
      expect(checkIPWhitelist('192.168.2.1', ['192.168.1.0/24'])).toBe(false);
    });
    it('空白名单拒绝所有', () => {
      expect(checkIPWhitelist('1.2.3.4', [])).toBe(false);
    });
  });

  // API Key 管理
  const apiKeyManager = () => {
    const keys = new Map<string, { name: string; rate: number; active: boolean; created: number }>();
    return {
      create: (name: string, rate: number = 100) => {
        const key = `sk-${Math.random().toString(36).slice(2, 18)}`;
        keys.set(key, { name, rate, active: true, created: Date.now() });
        return key;
      },
      validate: (key: string) => {
        const info = keys.get(key);
        return info ? info.active : false;
      },
      revoke: (key: string) => {
        const info = keys.get(key);
        if (info) info.active = false;
      },
      getRate: (key: string) => keys.get(key)?.rate ?? 0,
      list: () => Array.from(keys.entries()).map(([k, v]) => ({ key: k.slice(0, 8) + '...', ...v })),
    };
  };

  describe('API Key管理', () => {
    it('创建Key', () => {
      const mgr = apiKeyManager();
      const key = mgr.create('test-app', 50);
      expect(key).toMatch(/^sk-[a-z0-9]+$/);
    });
    it('验证有效Key', () => {
      const mgr = apiKeyManager();
      const key = mgr.create('app1');
      expect(mgr.validate(key)).toBe(true);
    });
    it('无效Key返回false', () => {
      const mgr = apiKeyManager();
      expect(mgr.validate('invalid-key')).toBe(false);
    });
    it('撤销Key', () => {
      const mgr = apiKeyManager();
      const key = mgr.create('app2');
      mgr.revoke(key);
      expect(mgr.validate(key)).toBe(false);
    });
    it('获取速率限制', () => {
      const mgr = apiKeyManager();
      const key = mgr.create('app3', 200);
      expect(mgr.getRate(key)).toBe(200);
    });
    it('列出所有Key', () => {
      const mgr = apiKeyManager();
      mgr.create('a'); mgr.create('b');
      expect(mgr.list().length).toBe(2);
    });
  });

  // 安全响应头
  const securityHeaders = (origin?: string) => {
    const headers: Record<string, string> = {
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY',
      'X-XSS-Protection': '1; mode=block',
      'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
      'Content-Security-Policy': "default-src 'self'",
      'Referrer-Policy': 'strict-origin-when-cross-origin',
      'Permissions-Policy': 'camera=(), microphone=()',
    };
    if (origin) {
      headers['Access-Control-Allow-Origin'] = origin;
      headers['Access-Control-Allow-Credentials'] = 'true';
    }
    return headers;
  };

  describe('安全响应头', () => {
    it('包含所有必要头', () => {
      const headers = securityHeaders();
      expect(headers).toHaveProperty('X-Content-Type-Options');
      expect(headers).toHaveProperty('X-Frame-Options');
      expect(headers).toHaveProperty('Strict-Transport-Security');
      expect(headers).toHaveProperty('Content-Security-Policy');
    });
    it('CORS头带来源', () => {
      const headers = securityHeaders('https://example.com');
      expect(headers['Access-Control-Allow-Origin']).toBe('https://example.com');
    });
    it('无来源无CORS头', () => {
      const headers = securityHeaders();
      expect(headers['Access-Control-Allow-Origin']).toBeUndefined();
    });
    it('HSTS最大有效期', () => {
      const headers = securityHeaders();
      expect(headers['Strict-Transport-Security']).toContain('31536000');
    });
  });

  // 权限检查
  type Permission = 'read' | 'write' | 'delete' | 'admin';
  const checkPermission = (userRole: string, required: Permission) => {
    const hierarchy: Record<string, Permission[]> = {
      guest: ['read'],
      user: ['read', 'write'],
      admin: ['read', 'write', 'delete', 'admin'],
    };
    return (hierarchy[userRole] || []).includes(required);
  };

  describe('权限检查', () => {
    it('guest只有读权限', () => {
      expect(checkPermission('guest', 'read')).toBe(true);
      expect(checkPermission('guest', 'write')).toBe(false);
    });
    it('user读写权限', () => {
      expect(checkPermission('user', 'read')).toBe(true);
      expect(checkPermission('user', 'write')).toBe(true);
      expect(checkPermission('user', 'delete')).toBe(false);
    });
    it('admin全权限', () => {
      expect(checkPermission('admin', 'admin')).toBe(true);
      expect(checkPermission('admin', 'delete')).toBe(true);
    });
    it('未知角色无权限', () => {
      expect(checkPermission('unknown', 'read')).toBe(false);
    });
  });

  // Token 刷新
  const tokenRefresh = (accessToken: string, refreshToken: string, tokens: Map<string, { exp: number; refresh: string }>) => {
    const entry = tokens.get(accessToken);
    if (!entry) return { success: false, error: 'invalid_token' };
    if (entry.refresh !== refreshToken) return { success: false, error: 'invalid_refresh' };
    if (Date.now() > entry.exp) return { success: false, error: 'expired' };
    const newAccess = `at-${Math.random().toString(36).slice(2)}`;
    const newRefresh = `rt-${Math.random().toString(36).slice(2)}`;
    tokens.delete(accessToken);
    tokens.set(newAccess, { exp: Date.now() + 3600000, refresh: newRefresh });
    return { success: true, accessToken: newAccess, refreshToken: newRefresh };
  };

  describe('Token刷新', () => {
    it('有效刷新', () => {
      const tokens = new Map();
      tokens.set('old-token', { exp: Date.now() + 10000, refresh: 'refresh-1' });
      const result = tokenRefresh('old-token', 'refresh-1', tokens);
      expect(result.success).toBe(true);
      expect(result.accessToken).toMatch(/^at-/);
    });
    it('无效Token', () => {
      const tokens = new Map();
      const result = tokenRefresh('invalid', 'r', tokens);
      expect(result.success).toBe(false);
      expect(result.error).toBe('invalid_token');
    });
    it('无效Refresh Token', () => {
      const tokens = new Map();
      tokens.set('token-1', { exp: Date.now() + 10000, refresh: 'correct-refresh' });
      const result = tokenRefresh('token-1', 'wrong-refresh', tokens);
      expect(result.success).toBe(false);
      expect(result.error).toBe('invalid_refresh');
    });
    it('旧Token被删除', () => {
      const tokens = new Map();
      tokens.set('old', { exp: Date.now() + 10000, refresh: 'r' });
      tokenRefresh('old', 'r', tokens);
      expect(tokens.has('old')).toBe(false);
    });
  });

  // 输入净化
  const sanitizeInput = (input: string) => {
    return input
      .replace(/<[^>]*>/g, '')
      .replace(/javascript:/gi, '')
      .replace(/on\w+=/gi, '')
      .replace(/&#?\w+;/g, '')
      .trim();
  };

  const validateStockCode = (code: string) => /^[0-9]{6}$/.test(code);
  const validateEmail = (email: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  const validatePhone = (phone: string) => /^1[3-9]\d{9}$/.test(phone);

  describe('输入净化', () => {
    it('移除HTML标签', () => {
      expect(sanitizeInput('<script>alert(1)</script>')).not.toContain('<');
    });
    it('移除javascript协议', () => {
      expect(sanitizeInput('javascript:alert(1)')).not.toContain('javascript:');
    });
    it('移除事件处理器', () => {
      expect(sanitizeInput('onclick=alert(1)')).not.toContain('onclick=');
    });
    it('正常文本不变', () => {
      expect(sanitizeInput('贵州茅台 600519')).toBe('贵州茅台 600519');
    });
    it('股票代码验证-有效', () => {
      expect(validateStockCode('600519')).toBe(true);
    });
    it('股票代码验证-无效', () => {
      expect(validateStockCode('abc')).toBe(false);
      expect(validateStockCode('12345')).toBe(false);
      expect(validateStockCode('1234567')).toBe(false);
    });
    it('邮箱验证-有效', () => {
      expect(validateEmail('user@example.com')).toBe(true);
    });
    it('邮箱验证-无效', () => {
      expect(validateEmail('not-email')).toBe(false);
      expect(validateEmail('@no-user.com')).toBe(false);
    });
    it('手机号验证-有效', () => {
      expect(validatePhone('13800138000')).toBe(true);
    });
    it('手机号验证-无效', () => {
      expect(validatePhone('12345678901')).toBe(false);
      expect(validatePhone('1380013800')).toBe(false);
    });
  });

  // 密码策略
  const validatePassword = (password: string) => {
    const checks = {
      length: password.length >= 8,
      uppercase: /[A-Z]/.test(password),
      lowercase: /[a-z]/.test(password),
      number: /[0-9]/.test(password),
      special: /[!@#$%^&*(),.?":{}|<>]/.test(password),
    };
    const score = Object.values(checks).filter(Boolean).length;
    return { checks, score, strength: score <= 2 ? 'weak' : score <= 3 ? 'medium' : score <= 4 ? 'strong' : 'very_strong' };
  };

  describe('密码策略', () => {
    it('强密码', () => {
      const result = validatePassword('Abc123!@#');
      expect(result.strength).toBe('very_strong');
      expect(result.score).toBe(5);
    });
    it('弱密码', () => {
      const result = validatePassword('abc');
      expect(result.strength).toBe('weak');
    });
    it('中等密码', () => {
      const result = validatePassword('Abc12345');
      expect(result.strength).toBe('strong');
    });
    it('弱中密码', () => {
      const result = validatePassword('abc12345');
      expect(result.strength).toBe('medium');
    });
    it('各项检查', () => {
      const result = validatePassword('Test1234!');
      expect(result.checks.length).toBe(true);
      expect(result.checks.uppercase).toBe(true);
      expect(result.checks.number).toBe(true);
    });
  });
});
