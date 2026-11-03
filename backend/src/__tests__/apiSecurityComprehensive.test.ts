/**
 * API安全与网关综合测试 —— 影子测试迁移（批次 15）
 *
 * 迁移说明（测试不再内联复制生产实现，改为 import 生产真源）：
 * - 请求签名：frontend/src/utils/securityEngine.ts
 *     signRequest(L561) / verifyRequestSignature(L583)
 * - 安全响应头：backend/src/middleware/securityHeaders.ts enhancedSecurityHeaders(L41)
 * - CORS：backend/src/middleware/corsConfig.ts corsMiddleware(L146)
 * - 权限检查：backend/src/middleware/auth.ts requireRole(L328)
 * - Token 刷新：backend/src/middleware/auth.ts
 *     generateRefreshToken(L176) / handleTokenRefresh(L362) / verifyAccessToken(L143)
 * - 输入净化：frontend/src/utils/securityEngine.ts
 *     sanitizeHTML(L86) / validateStockCode(L177) / validateEmail(L150) / validatePhone(L163)
 *   邮箱/手机号同时对照 backend/src/models/User.ts validateEmail(L118) / validatePhone(L122)
 * - 后端注入检测：backend/src/middleware/validation.ts sanitizeInput(L734，SQL 注入检测中间件)
 * - 密码策略：frontend/src/utils/securityEngine.ts validatePassword(L192)
 *
 * 旧断言修正（旧断言与生产冲突，以生产为准）：
 * - 请求签名：旧内联实现用竖线分隔并输出 8 位十六进制（/^[0-9a-f]{8}$/）；
 *   生产 signRequest 用 method.toUpperCase() + ':' + path + ':' + body + ':' + timestamp，
 *   输出为 base36 变长字符串（旧格式断言错误）
 * - 权限检查：旧内联实现为 guest/user/admin 角色层级；
 *   生产 requireRole 是“允许角色集合”平铺匹配，没有层级继承
 * - Token 刷新：旧断言使用 invalid_token / invalid_refresh / expired 错误码；
 *   生产缺参为 400 VALIDATION_ERROR、令牌无效为 401 REFRESH_TOKEN_INVALID，成功返回 expiresIn 900
 * - 密码策略：旧内联实现返回 score/strength；生产 validatePassword 只返回 { valid, errors }。
 *   旧断言 'Abc12345' 为 strong（生产实际 invalid：缺特殊字符）；
 *   旧断言 'abc12345' 为 medium（生产实际 invalid：缺大写字母与特殊字符）
 * - 安全响应头：旧断言基于内联响应头对象；生产 CSP/HSTS/Permissions-Policy 取值更完整
 *
 * 保留内联（生产无对应实现，未迁移）：
 * - nonce 重放缓存：生产没有 nonce 存储，verifyRequestSignature 只有 5 分钟时间戳窗口
 * - IP 白名单：生产没有 IP 白名单中间件
 * - API Key 管理器：生产没有 API Key 管理实现
 */

import { describe, it, expect, vi, afterEach, afterAll } from 'vitest';
import {
  signRequest,
  verifyRequestSignature,
  sanitizeHTML,
  validateStockCode,
  validateEmail,
  validatePhone,
  validatePassword,
} from '../../../frontend/src/utils/securityEngine';
import {
  generateRefreshToken,
  handleTokenRefresh,
  verifyAccessToken,
  requireRole,
  cleanup,
} from '../middleware/auth';
import { enhancedSecurityHeaders } from '../middleware/securityHeaders';
import { corsMiddleware } from '../middleware/corsConfig';
import { sanitizeInput as detectSqlInjection } from '../middleware/validation';
import {
  validateEmail as validateUserEmail,
  validatePhone as validateUserPhone,
} from '../models/User';

function createRes() {
  const res: Record<string, any> = {
    statusCode: 200,
    body: undefined,
    headers: {} as Record<string, string>,
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
    removeHeader(name: string) {
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
    ip: '198.51.100.10',
    headers: {} as Record<string, any>,
    query: {} as Record<string, any>,
    body: {} as Record<string, any>,
    params: {} as Record<string, any>,
    socket: { remoteAddress: '198.51.100.10' },
    ...overrides,
  };
}

// ==================== 生产无对应实现，未迁移 ====================
// nonce 重放缓存：生产没有 nonce 存储，仅 verifyRequestSignature 提供 5 分钟时间戳窗口
const nonceStore = new Set<string>();

function isValidNonce(nonce: string, timestamp: number, windowMs: number = 300000): boolean {
  if (Math.abs(Date.now() - timestamp) > windowMs) return false;
  if (nonceStore.has(nonce)) return false;
  nonceStore.add(nonce);
  return true;
}

// IP 白名单：生产没有 IP 白名单中间件，以下为旧测试保留的内联实现
function ipToNumber(ip: string): number | null {
  const parts = ip.split('.').map(Number);
  if (parts.length !== 4) return null;
  if (parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return null;
  return ((parts[0] << 24) | (parts[1] << 16) | (parts[2] << 8) | parts[3]) >>> 0;
}

function checkIPWhitelist(ip: string, whitelist: string[]): boolean {
  if (whitelist.length === 0) return false;

  return whitelist.some((entry) => {
    if (entry === '*') return true;
    if (entry === ip) return true;

    if (entry.endsWith('.*')) {
      return ip.startsWith(entry.slice(0, -1));
    }

    if (entry.includes('/')) {
      const slashIndex = entry.indexOf('/');
      const network = entry.slice(0, slashIndex);
      const bits = parseInt(entry.slice(slashIndex + 1), 10);
      const ipNumber = ipToNumber(ip);
      const networkNumber = ipToNumber(network);
      if (ipNumber === null || networkNumber === null || Number.isNaN(bits)) return false;
      const mask = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0;
      return (ipNumber & mask) === (networkNumber & mask);
    }

    return false;
  });
}

// API Key 管理器：生产没有 API Key 管理，以下为旧测试保留的内联实现
interface ApiKeyRecord {
  key: string;
  name: string;
  rateLimit: number;
  createdAt: number;
  revoked: boolean;
}

function createApiKeyManager() {
  const keys = new Map<string, ApiKeyRecord>();
  let serial = 0;

  return {
    create(name: string, rateLimit: number = 100): ApiKeyRecord {
      serial += 1;
      // 旧实现用随机数生成 key；这里改为确定性序号，断言不依赖随机值
      const key = 'sk-' + serial.toString(36);
      const record: ApiKeyRecord = {
        key,
        name,
        rateLimit,
        createdAt: Date.now(),
        revoked: false,
      };
      keys.set(key, record);
      return record;
    },
    validate(key: string): boolean {
      const record = keys.get(key);
      return Boolean(record) && record!.revoked === false;
    },
    revoke(key: string): boolean {
      const record = keys.get(key);
      if (!record) return false;
      record.revoked = true;
      return true;
    },
    getRateLimit(key: string): number | undefined {
      return keys.get(key)?.rateLimit;
    },
    list(): ApiKeyRecord[] {
      return Array.from(keys.values());
    },
  };
}

describe('API安全与网关综合测试', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  afterAll(() => {
    cleanup();
  });

  describe('请求签名', () => {
    it('相同输入应产生相同签名', () => {
      const timestamp = Date.now();
      const signature1 = signRequest('GET', '/api/stocks', '', timestamp, 'secret-key');
      const signature2 = signRequest('GET', '/api/stocks', '', timestamp, 'secret-key');

      expect(signature1).toBe(signature2);
      expect(verifyRequestSignature('GET', '/api/stocks', '', timestamp, 'secret-key', signature1).valid).toBe(true);
    });

    it('不同HTTP方法应产生不同签名', () => {
      const timestamp = 1000;
      const getSignature = signRequest('GET', '/api/stocks', '', timestamp, 'secret-key');
      const postSignature = signRequest('POST', '/api/stocks', '', timestamp, 'secret-key');

      expect(getSignature).not.toBe(postSignature);
    });

    it('不同路径应产生不同签名', () => {
      const timestamp = 1000;
      const stocksSignature = signRequest('GET', '/api/stocks', '', timestamp, 'secret-key');
      const usersSignature = signRequest('GET', '/api/users', '', timestamp, 'secret-key');

      expect(stocksSignature).not.toBe(usersSignature);
    });

    it('不同时间戳应产生不同签名', () => {
      const signature1 = signRequest('GET', '/api/stocks', '', 1000, 'secret-key');
      const signature2 = signRequest('GET', '/api/stocks', '', 2000, 'secret-key');

      expect(signature1).not.toBe(signature2);
    });

    it('不同密钥应产生不同签名', () => {
      const timestamp = 1000;
      const signature1 = signRequest('GET', '/api/stocks', '', timestamp, 'secret-a');
      const signature2 = signRequest('GET', '/api/stocks', '', timestamp, 'secret-b');

      expect(signature1).not.toBe(signature2);
    });

    it('签名格式应为base36字符串且方法大小写不敏感', () => {
      // 旧断言期望 8 位十六进制；生产输出为 base36 变长字符串
      const signature = signRequest('GET', '/api/stocks', '', 1000, 'secret-key');

      expect(signature).toMatch(/^[0-9a-z]+$/);
      expect(signRequest('get', '/api/stocks', '', 1000, 'secret-key')).toBe(signature);
    });
  });

  describe('请求签名验证', () => {
    it('有效签名应通过校验', () => {
      const timestamp = Date.now();
      const body = '{"symbol":"600519"}';
      const signature = signRequest('POST', '/api/orders', body, timestamp, 'secret-key');

      expect(
        verifyRequestSignature('POST', '/api/orders', body, timestamp, 'secret-key', signature).valid
      ).toBe(true);
    });

    it('过期时间戳与篡改签名应被拒绝', () => {
      const timestamp = Date.now();
      const signature = signRequest('GET', '/api/stocks', '', timestamp, 'secret-key');

      const expired = verifyRequestSignature(
        'GET',
        '/api/stocks',
        '',
        timestamp - 600000,
        'secret-key',
        signature
      );
      expect(expired.valid).toBe(false);
      expect(expired.reason).toBe('timestamp_expired');

      const tampered = verifyRequestSignature(
        'GET',
        '/api/stocks',
        '',
        timestamp,
        'secret-key',
        'tampered-signature'
      );
      expect(tampered.valid).toBe(false);
      expect(tampered.reason).toBe('signature_mismatch');
    });
  });

  describe('重放攻击防护（内联 nonce 存储）', () => {
    it('首次使用的nonce应该有效', () => {
      expect(isValidNonce('nonce-first', Date.now())).toBe(true);
    });

    it('重复使用的nonce应该无效', () => {
      const timestamp = Date.now();

      expect(isValidNonce('nonce-duplicate', timestamp)).toBe(true);
      expect(isValidNonce('nonce-duplicate', timestamp)).toBe(false);
    });

    it('过期时间戳应该无效', () => {
      expect(isValidNonce('nonce-expired', Date.now() - 600000)).toBe(false);
    });

    it('新nonce应该有效', () => {
      expect(isValidNonce('nonce-new', Date.now())).toBe(true);
    });
  });

  describe('IP白名单校验（内联实现）', () => {
    it('应该允许精确匹配的IP', () => {
      expect(checkIPWhitelist('192.168.1.100', ['192.168.1.100'])).toBe(true);
    });

    it('应该拒绝不在白名单的IP', () => {
      expect(checkIPWhitelist('192.168.1.101', ['192.168.1.100'])).toBe(false);
    });

    it('通配符*应该允许所有IP', () => {
      expect(checkIPWhitelist('10.0.0.1', ['*'])).toBe(true);
    });

    it('应该支持192.168.*通配', () => {
      expect(checkIPWhitelist('192.168.1.100', ['192.168.*'])).toBe(true);
    });

    it('192.168.*不应该匹配其他网段', () => {
      expect(checkIPWhitelist('10.0.0.1', ['192.168.*'])).toBe(false);
    });

    it('应该支持CIDR网段匹配', () => {
      expect(checkIPWhitelist('192.168.1.50', ['192.168.1.0/24'])).toBe(true);
    });

    it('CIDR网段不应该匹配网段外的IP', () => {
      expect(checkIPWhitelist('192.168.2.50', ['192.168.1.0/24'])).toBe(false);
    });

    it('空白名单应该拒绝所有IP', () => {
      expect(checkIPWhitelist('192.168.1.100', [])).toBe(false);
    });
  });

  describe('API Key管理（内联实现）', () => {
    it('应该创建API Key', () => {
      const manager = createApiKeyManager();
      const record = manager.create('测试应用');

      expect(record.name).toBe('测试应用');
      expect(record.rateLimit).toBe(100);
      expect(record.key).toMatch(/^sk-[a-z0-9]+$/);
    });

    it('应该验证有效的API Key', () => {
      const manager = createApiKeyManager();
      const record = manager.create('测试应用');

      expect(manager.validate(record.key)).toBe(true);
      expect(manager.getRateLimit(record.key)).toBe(100);
    });

    it('应该拒绝无效的API Key', () => {
      const manager = createApiKeyManager();

      expect(manager.validate('sk-invalid')).toBe(false);
    });

    it('应该撤销API Key', () => {
      const manager = createApiKeyManager();
      const record = manager.create('测试应用');

      expect(manager.revoke(record.key)).toBe(true);
    });

    it('撤销后的API Key应该无效', () => {
      const manager = createApiKeyManager();
      const record = manager.create('测试应用');

      manager.revoke(record.key);
      expect(manager.validate(record.key)).toBe(false);
    });

    it('应该列出所有API Key', () => {
      const manager = createApiKeyManager();
      manager.create('应用A');
      manager.create('应用B');

      const list = manager.list();
      expect(list).toHaveLength(2);
      expect(list.map((record) => record.name)).toEqual(['应用A', '应用B']);
    });
  });

  describe('安全响应头', () => {
    it('应该包含所有必要的安全响应头', () => {
      const middleware = enhancedSecurityHeaders();
      const res = createRes();
      let nextCalled = false;

      middleware(createReq({ path: '/api/stocks' }), res, () => {
        nextCalled = true;
      });

      expect(nextCalled).toBe(true);
      expect(res.headers['x-content-type-options']).toBe('nosniff');
      expect(res.headers['x-frame-options']).toBe('DENY');
      expect(res.headers['x-xss-protection']).toBe('1; mode=block');
      expect(res.headers['strict-transport-security']).toContain('max-age=31536000');
      expect(res.headers['content-security-policy']).toContain("default-src 'self'");
      expect(res.headers['referrer-policy']).toBe('strict-origin-when-cross-origin');
      expect(res.headers['permissions-policy']).toContain('camera=()');
    });

    it('HSTS应该包含最长有效期与preload', () => {
      const middleware = enhancedSecurityHeaders();
      const res = createRes();

      middleware(createReq({ path: '/api/stocks' }), res, () => {});

      expect(res.headers['strict-transport-security']).toContain('31536000');
      expect(res.headers['strict-transport-security']).toContain('preload');
    });

    it('CORS应该允许配置的来源', () => {
      const middleware = corsMiddleware({ origins: ['https://example.com'] });
      const res = createRes();
      let nextCalled = false;

      middleware(
        createReq({ method: 'GET', headers: { origin: 'https://example.com' } }),
        res,
        () => {
          nextCalled = true;
        }
      );

      expect(nextCalled).toBe(true);
      expect(res.headers['access-control-allow-origin']).toBe('https://example.com');
      expect(res.headers['access-control-allow-credentials']).toBe('true');
    });

    it('无来源请求不应设置CORS头', () => {
      const middleware = corsMiddleware({ origins: ['https://example.com'] });
      const res = createRes();
      let nextCalled = false;

      middleware(createReq({ method: 'GET', headers: {} }), res, () => {
        nextCalled = true;
      });

      expect(nextCalled).toBe(true);
      expect(res.headers['access-control-allow-origin']).toBeUndefined();
    });
  });

  describe('权限检查', () => {
    it('拥有允许角色应该通过', () => {
      const middleware = requireRole('admin');
      const res = createRes();
      let nextCalled = false;

      middleware(createReq({ userRoles: ['admin'] }), res, () => {
        nextCalled = true;
      });

      expect(nextCalled).toBe(true);
      expect(res.statusCode).toBe(200);
    });

    it('缺少角色应该拒绝', () => {
      const middleware = requireRole('admin');
      const res = createRes();
      let nextCalled = false;

      middleware(createReq({ userRoles: [] }), res, () => {
        nextCalled = true;
      });

      expect(nextCalled).toBe(false);
      expect(res.statusCode).toBe(403);
      expect(res.body.code).toBe('FORBIDDEN');
      expect(res.body.error).toBe('权限不足');
    });

    it('角色不匹配应该拒绝', () => {
      const middleware = requireRole('admin', 'trader');
      const res = createRes();

      middleware(createReq({ userRoles: ['user'] }), res, () => {});

      expect(res.statusCode).toBe(403);
      expect(res.body.error).toContain('需要角色: admin, trader');
    });

    it('未知角色应该无权限', () => {
      const middleware = requireRole('admin');
      const res = createRes();

      middleware(createReq({ userRoles: ['unknown'] }), res, () => {});

      expect(res.statusCode).toBe(403);
      expect(res.body.code).toBe('FORBIDDEN');
    });
  });

  describe('Token刷新', () => {
    it('有效refreshToken应该换发新令牌', () => {
      const refreshToken = generateRefreshToken('api_security_user_1', 'user1@example.com');
      const res = createRes();

      handleTokenRefresh(createReq({ body: { refreshToken } }), res);

      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.accessToken).toBeDefined();
      expect(res.body.data.refreshToken).not.toBe(refreshToken);
      expect(res.body.data.expiresIn).toBe(900);
      expect(verifyAccessToken(res.body.data.accessToken)).not.toBeNull();
    });

    it('无效refreshToken应该返回401', () => {
      const res = createRes();

      handleTokenRefresh(createReq({ body: { refreshToken: 'invalid-refresh-token' } }), res);

      expect(res.statusCode).toBe(401);
      expect(res.body.code).toBe('REFRESH_TOKEN_INVALID');
    });

    it('缺少refreshToken应该返回400', () => {
      const res = createRes();

      handleTokenRefresh(createReq({ body: {} }), res);

      expect(res.statusCode).toBe(400);
      expect(res.body.code).toBe('VALIDATION_ERROR');
    });

    it('旧refreshToken使用一次后应该失效', () => {
      const refreshToken = generateRefreshToken('api_security_user_2', 'user2@example.com');
      const first = createRes();

      handleTokenRefresh(createReq({ body: { refreshToken } }), first);
      expect(first.statusCode).toBe(200);

      const second = createRes();
      handleTokenRefresh(createReq({ body: { refreshToken } }), second);

      expect(second.statusCode).toBe(401);
      expect(second.body.code).toBe('REFRESH_TOKEN_INVALID');
    });
  });

  describe('输入净化', () => {
    it('应该移除script标签', () => {
      const result = sanitizeHTML('<script>alert("xss")</script>');

      expect(result).not.toContain('<script>');
      expect(result).not.toContain('</script>');
    });

    it('应该移除javascript协议', () => {
      const result = sanitizeHTML('javascript:alert(1)');

      expect(result).not.toContain('javascript:');
    });

    it('应该移除事件处理器', () => {
      const result = sanitizeHTML('onclick=alert(1)');

      expect(result).not.toContain('onclick=');
    });

    it('正常文本应该保持不变', () => {
      expect(sanitizeHTML('贵州茅台 600519')).toBe('贵州茅台 600519');
    });

    it('有效的股票代码应该通过', () => {
      expect(validateStockCode('600519').valid).toBe(true);
      expect(validateStockCode('sh600519').valid).toBe(true);
    });

    it('无效的股票代码应该被拒绝', () => {
      expect(validateStockCode('abc').valid).toBe(false);
      expect(validateStockCode('12345').valid).toBe(false);
      expect(validateStockCode('1234567').valid).toBe(false);
    });

    it('有效的邮箱应该通过', () => {
      expect(validateEmail('user@example.com').valid).toBe(true);
      expect(validateUserEmail('user@example.com')).toBe(true);
    });

    it('无效的邮箱应该被拒绝', () => {
      expect(validateEmail('not-email').valid).toBe(false);
      expect(validateEmail('@no-user.com').valid).toBe(false);
      expect(validateUserEmail('not-email')).toBe(false);
    });

    it('有效的手机号应该通过', () => {
      expect(validatePhone('13800138000').valid).toBe(true);
      expect(validatePhone('138-0013-8000').valid).toBe(true);
      expect(validateUserPhone('13800138000')).toBe(true);
    });

    it('无效的手机号应该被拒绝', () => {
      expect(validatePhone('12345678901').valid).toBe(false);
      expect(validatePhone('1380013800').valid).toBe(false);
      expect(validateUserPhone('12345678901')).toBe(false);
    });
  });

  describe('后端注入检测', () => {
    it('SQL注入特征应该返回400', () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const next = vi.fn();
      const res = createRes();

      detectSqlInjection(
        createReq({ query: { keyword: "1' OR 1=1 --" }, body: {}, params: {} }),
        res,
        next
      );

      expect(res.statusCode).toBe(400);
      expect(res.body.error).toBe('请求包含非法字符');
      expect(next).not.toHaveBeenCalled();
      warnSpy.mockRestore();
    });

    it('正常查询参数应该放行', () => {
      const next = vi.fn();
      const res = createRes();

      detectSqlInjection(
        createReq({ query: { symbol: '600519', keyword: '贵州茅台' }, body: {}, params: {} }),
        res,
        next
      );

      expect(next).toHaveBeenCalled();
      expect(res.statusCode).toBe(200);
    });
  });

  describe('密码策略', () => {
    it('强密码应该通过', () => {
      const result = validatePassword('Abc123!@#');

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('弱密码应该被拒绝', () => {
      const result = validatePassword('abc');

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('密码长度不能少于8位');
      expect(result.errors).toContain('密码需包含大写字母');
      expect(result.errors).toContain('密码需包含数字');
      expect(result.errors).toContain('密码需包含特殊字符');
    });

    it('缺少特殊字符的密码应该被拒绝', () => {
      // 旧断言期望 strong；生产 validatePassword 要求特殊字符，'Abc12345' 实际不通过
      const result = validatePassword('Abc12345');

      expect(result.valid).toBe(false);
      expect(result.errors).toEqual(['密码需包含特殊字符']);
    });

    it('缺少大写与特殊字符的密码应该被拒绝', () => {
      // 旧断言期望 medium；生产实际缺少大写字母与特殊字符
      const result = validatePassword('abc12345');

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('密码需包含大写字母');
      expect(result.errors).toContain('密码需包含特殊字符');
    });

    it('各项检查都满足的密码应该通过', () => {
      const result = validatePassword('Test1234!');

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });
  });
});
