import { describe, it, expect } from 'vitest';
import {
  encodeHTML,
  decodeHTML,
  sanitizeHTML,
  detectXSS,
  validateEmail,
  validatePhone,
  validateStockCode,
  validatePassword,
  validateString,
  validateNumber,
  maskPhone,
  maskEmail,
  maskIDCard,
  maskBankCard,
  maskName,
  obfuscate,
  deobfuscate,
  generateToken,
  generateCSRFToken,
  buildCSP,
  getDefaultCSP,
  isSafeURL,
  sanitizeURLParams,
  RateLimiter,
  signRequest,
  verifyRequestSignature,
  SessionGuard,
} from '../utils/securityEngine';

// ==================== XSS防护测试 ====================

describe('encodeHTML', () => {
  it('应编码HTML特殊字符', () => {
    expect(encodeHTML('<script>alert("xss")</script>')).not.toContain('<script>');
    expect(encodeHTML('a < b')).toBe('a &lt; b');
  });

  it('应编码引号', () => {
    expect(encodeHTML('a"b')).toBe('a&quot;b');
    expect(encodeHTML("a'b")).toBe('a&#x27;b');
  });

  it('安全文本不应改变', () => {
    expect(encodeHTML('hello world')).toBe('hello world');
  });

  it('空字符串应返回空', () => {
    expect(encodeHTML('')).toBe('');
  });
});

describe('decodeHTML', () => {
  it('应反转义HTML实体', () => {
    expect(decodeHTML('&lt;script&gt;')).toBe('<script>');
  });

  it('与encodeHTML应互逆', () => {
    const original = '<div class="test">Hello & World</div>';
    expect(decodeHTML(encodeHTML(original))).toBe(original);
  });
});

describe('sanitizeHTML', () => {
  it('应移除script标签', () => {
    const result = sanitizeHTML('<p>Hello</p><script>alert(1)</script>');
    expect(result).not.toContain('script');
    expect(result).toContain('Hello');
  });

  it('应移除事件处理器', () => {
    const result = sanitizeHTML('<img src="x" onerror="alert(1)">');
    expect(result).not.toContain('onerror');
  });

  it('应移除javascript:协议', () => {
    const result = sanitizeHTML('<a href="javascript:alert(1)">click</a>');
    expect(result).not.toContain('javascript:');
  });

  it('stripTags应移除所有标签', () => {
    const result = sanitizeHTML('<p>Hello <b>World</b></p>', { stripTags: true });
    expect(result).toBe('Hello World');
  });

  it('白名单标签应保留', () => {
    const result = sanitizeHTML('<b>bold</b><script>bad</script>');
    expect(result).toContain('<b>');
    expect(result).not.toContain('script');
  });
});

describe('detectXSS', () => {
  it('应检测script标签', () => {
    expect(detectXSS('<script>alert(1)</script>')).toBe(true);
  });

  it('应检测javascript:协议', () => {
    expect(detectXSS('javascript:alert(1)')).toBe(true);
  });

  it('应检测事件处理器', () => {
    expect(detectXSS('onclick="alert(1)"')).toBe(true);
    expect(detectXSS('onmouseover="evil()"')).toBe(true);
  });

  it('应检测iframe', () => {
    expect(detectXSS('<iframe src="evil.com">')).toBe(true);
  });

  it('安全文本应返回false', () => {
    expect(detectXSS('hello world')).toBe(false);
    expect(detectXSS('12345')).toBe(false);
  });

  it('应检测data: URI', () => {
    expect(detectXSS('data:text/html;base64,PHNjcmlwdD4=')).toBe(true);
  });
});

// ==================== 输入验证测试 ====================

describe('validateEmail', () => {
  it('有效邮箱应通过', () => {
    const result = validateEmail('user@example.com');
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it('无效邮箱应失败', () => {
    expect(validateEmail('notanemail').valid).toBe(false);
    expect(validateEmail('@example.com').valid).toBe(false);
    expect(validateEmail('user@').valid).toBe(false);
  });

  it('应清理空格和大小写', () => {
    const result = validateEmail('  User@Example.COM  ');
    expect(result.sanitized).toBe('user@example.com');
  });
});

describe('validatePhone', () => {
  it('有效手机号应通过', () => {
    expect(validatePhone('13812345678').valid).toBe(true);
    expect(validatePhone('159 1234 5678').valid).toBe(true);
  });

  it('无效手机号应失败', () => {
    expect(validatePhone('12345').valid).toBe(false);
    expect(validatePhone('23812345678').valid).toBe(false);
  });

  it('应清理空格和横线', () => {
    const result = validatePhone('138-1234-5678');
    expect(result.sanitized).toBe('13812345678');
  });
});

describe('validateStockCode', () => {
  it('有效股票代码应通过', () => {
    expect(validateStockCode('600519').valid).toBe(true);
    expect(validateStockCode('SZ000858').valid).toBe(true);
    expect(validateStockCode('sh601318').valid).toBe(true);
  });

  it('无效代码应失败', () => {
    expect(validateStockCode('12345').valid).toBe(false);
    expect(validateStockCode('ABC123').valid).toBe(false);
  });

  it('应转大写', () => {
    const result = validateStockCode('sz000858');
    expect(result.sanitized).toBe('SZ000858');
  });
});

describe('validatePassword', () => {
  it('强密码应通过', () => {
    expect(validatePassword('Strong@Pass1').valid).toBe(true);
  });

  it('弱密码应失败', () => {
    expect(validatePassword('weak').valid).toBe(false);
    expect(validatePassword('password').valid).toBe(false);
    expect(validatePassword('Password').valid).toBe(false);
    expect(validatePassword('Password1').valid).toBe(false);
  });

  it('应报告具体不足', () => {
    const result = validatePassword('abc');
    expect(result.errors.length).toBeGreaterThan(0);
  });
});

describe('validateString', () => {
  it('应验证长度', () => {
    expect(validateString('hello', { minLength: 3, maxLength: 10 }).valid).toBe(true);
    expect(validateString('hi', { minLength: 3 }).valid).toBe(false);
    expect(validateString('toolongstring', { maxLength: 5 }).valid).toBe(false);
  });

  it('应验证正则', () => {
    expect(validateString('abc123', { pattern: /^[a-z0-9]+$/ }).valid).toBe(true);
    expect(validateString('ABC!', { pattern: /^[a-z]+$/ }).valid).toBe(false);
  });

  it('应修剪空格', () => {
    const result = validateString('  hello  ', { trim: true });
    expect(result.sanitized).toBe('hello');
  });

  it('空值应失败（不允许空）', () => {
    expect(validateString('', {}).valid).toBe(false);
    expect(validateString('', { allowEmpty: true }).valid).toBe(true);
  });
});

describe('validateNumber', () => {
  it('应在范围内通过', () => {
    expect(validateNumber(5, { min: 0, max: 10 }).valid).toBe(true);
  });

  it('超出范围应失败', () => {
    expect(validateNumber(15, { max: 10 }).valid).toBe(false);
    expect(validateNumber(-1, { min: 0 }).valid).toBe(false);
  });

  it('整数验证应工作', () => {
    expect(validateNumber(5, { integer: true }).valid).toBe(true);
    expect(validateNumber(5.5, { integer: true }).valid).toBe(false);
  });

  it('NaN应失败', () => {
    expect(validateNumber(NaN, {}).valid).toBe(false);
  });
});

// ==================== 敏感数据测试 ====================

describe('maskPhone', () => {
  it('应脱敏手机号', () => {
    const result = maskPhone('13812345678');
    expect(result).toBe('138****5678');
    expect(result.length).toBe(11);
  });

  it('短号码应原样返回', () => {
    expect(maskPhone('1234')).toBe('1234');
  });
});

describe('maskEmail', () => {
  it('应脱敏邮箱', () => {
    const result = maskEmail('user@example.com');
    expect(result).toBe('u**r@example.com');
  });

  it('短用户名应处理', () => {
    const result = maskEmail('ab@test.com');
    expect(result).toContain('@test.com');
  });
});

describe('maskIDCard', () => {
  it('应脱敏身份证', () => {
    const result = maskIDCard('110101199001011234');
    expect(result).toContain('*');
    expect(result.startsWith('1101')).toBe(true);
    expect(result.endsWith('1234')).toBe(true);
  });
});

describe('maskBankCard', () => {
  it('应脱敏银行卡', () => {
    const result = maskBankCard('6222021234567890123');
    expect(result.endsWith('0123')).toBe(true);
    expect(result.startsWith('***')).toBe(true);
  });
});

describe('maskName', () => {
  it('应脱敏姓名', () => {
    expect(maskName('张三')).toBe('张*');
    expect(maskName('欧阳修')).toBe('欧**');
  });

  it('单字应原样返回', () => {
    expect(maskName('张')).toBe('张');
  });
});

// ==================== 安全存储测试 ====================

describe('obfuscate/deobfuscate', () => {
  it('应可逆处理', () => {
    const original = 'sensitive data 123';
    const obfuscated = obfuscate(original);
    expect(obfuscated).not.toBe(original);
    expect(deobfuscate(obfuscated)).toBe(original);
  });

  it('空字符串应正常处理', () => {
    expect(deobfuscate(obfuscate(''))).toBe('');
  });

  it('中文应正常处理', () => {
    const original = '测试数据';
    expect(deobfuscate(obfuscate(original))).toBe(original);
  });
});

describe('generateToken', () => {
  it('应生成指定长度的token', () => {
    const token = generateToken(32);
    expect(token.length).toBe(32);
  });

  it('应生成不同的token', () => {
    const t1 = generateToken();
    const t2 = generateToken();
    expect(t1).not.toBe(t2);
  });

  it('应只包含字母数字', () => {
    const token = generateToken(100);
    expect(/^[A-Za-z0-9]+$/.test(token)).toBe(true);
  });

  it('默认长度应为32', () => {
    expect(generateToken().length).toBe(32);
  });
});

describe('generateCSRFToken', () => {
  it('应生成64位token', () => {
    expect(generateCSRFToken().length).toBe(64);
  });
});

// ==================== CSP测试 ====================

describe('buildCSP', () => {
  it('应构建CSP字符串', () => {
    const csp = buildCSP({
      'default-src': ["'self'"],
      'script-src': ["'self'", "'unsafe-inline'"],
    });
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("script-src 'self' 'unsafe-inline'");
  });

  it('应以分号分隔', () => {
    const csp = buildCSP({
      'default-src': ["'self'"],
      'img-src': ["'self'", 'data:'],
    });
    expect(csp).toContain(';');
  });
});

describe('getDefaultCSP', () => {
  it('应返回有效的CSP配置', () => {
    const csp = getDefaultCSP();
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("object-src 'none'");
  });
});

// ==================== URL安全测试 ====================

describe('isSafeURL', () => {
  it('HTTP/HTTPS应安全', () => {
    expect(isSafeURL('https://example.com')).toBe(true);
    expect(isSafeURL('http://example.com')).toBe(true);
    expect(isSafeURL('mailto:user@example.com')).toBe(true);
  });

  it('javascript:应不安全', () => {
    expect(isSafeURL('javascript:alert(1)')).toBe(false);
  });

  it('data:应不安全', () => {
    expect(isSafeURL('data:text/html,<script>alert(1)</script>')).toBe(false);
  });

  it('ftp协议应不安全', () => {
    expect(isSafeURL('ftp://example.com/file')).toBe(false);
  });
});

describe('sanitizeURLParams', () => {
  it('应保留安全参数', () => {
    const result = sanitizeURLParams('https://example.com?name=test&value=123');
    expect(result).toContain('name=test');
  });

  it('应移除XSS参数', () => {
    const result = sanitizeURLParams('https://example.com?q=<script>alert(1)</script>');
    expect(result).not.toContain('script');
  });
});

// ==================== 速率限制测试 ====================

describe('RateLimiter', () => {
  

  it('允许正常请求', () => {
    const limiter = new RateLimiter({ maxRequests: 5, windowMs: 1000 });
    const r = limiter.check();
    expect(r.allowed).toBe(true);
    expect(r.remaining).toBe(4);
  });

  it('在达到限制后阻止请求', () => {
    const limiter = new RateLimiter({ maxRequests: 2, windowMs: 1000, blockDurationMs: 5000 });
    const now = 1000;
    expect(limiter.check(now).allowed).toBe(true);
    expect(limiter.check(now + 1).allowed).toBe(true);
    expect(limiter.check(now + 2).allowed).toBe(false);
  });

  it('窗口过期后重置', () => {
    const limiter = new RateLimiter({ maxRequests: 2, windowMs: 500, blockDurationMs: 100 });
    const t = 100000;
    expect(limiter.check(t).allowed).toBe(true);
    expect(limiter.check(t + 1).allowed).toBe(true);
    expect(limiter.check(t + 2).allowed).toBe(false);
    // After block duration and window expire
    expect(limiter.check(t + 1000).allowed).toBe(true);
  });

  it('阻止持续到期后恢复', () => {
    const limiter = new RateLimiter({ maxRequests: 1, windowMs: 1000, blockDurationMs: 2000 });
    expect(limiter.check(1000).allowed).toBe(true);
    expect(limiter.check(1001).allowed).toBe(false);
    expect(limiter.check(3002).allowed).toBe(true);
  });

  it('重置后清除状态', () => {
    const limiter = new RateLimiter({ maxRequests: 1 });
    limiter.check();
    limiter.reset();
    expect(limiter.check().remaining).toBe(0);
  });

  it('返回正确的状态', () => {
    const limiter = new RateLimiter({ maxRequests: 5 });
    limiter.check();
    limiter.check();
    const state = limiter.getState();
    expect(state.requests).toHaveLength(2);
    expect(state.blockedUntil).toBeNull();
  });
});

// ==================== 请求签名测试 ====================

describe('signRequest / verifyRequestSignature', () => {
  

  it('生成一致的签名', () => {
    const now = Date.now();
    const s1 = signRequest('GET', '/api/stocks', '', now, 'secret');
    const s2 = signRequest('GET', '/api/stocks', '', now, 'secret');
    expect(s1).toBe(s2);
  });

  it('不同参数产生不同签名', () => {
    const now = Date.now();
    const s1 = signRequest('GET', '/api/stocks', '', now, 'secret1');
    const s2 = signRequest('GET', '/api/stocks', '', now, 'secret2');
    expect(s1).not.toBe(s2);
  });

  it('验证有效签名', () => {
    const now = Date.now();
    const sig = signRequest('POST', '/api/order', '{"amount":100}', now, 'key');
    const result = verifyRequestSignature('POST', '/api/order', '{"amount":100}', now, 'key', sig);
    expect(result.valid).toBe(true);
  });

  it('拒绝过期签名', () => {
    const oldTs = Date.now() - 120000;
    const sig = signRequest('GET', '/api', '', oldTs, 'key');
    const result = verifyRequestSignature('GET', '/api', '', oldTs, 'key', sig, 60000);
    expect(result.valid).toBe(false);
    expect(result.reason).toBe('timestamp_expired');
  });

  it('拒绝错误签名', () => {
    const now = Date.now();
    const result = verifyRequestSignature('GET', '/api', '', now, 'key', 'wrong_sig', 300000);
    expect(result.valid).toBe(false);
    expect(result.reason).toBe('signature_mismatch');
  });
});

// ==================== 会话安全测试 ====================

describe('SessionGuard', () => {
  

  it('初始状态有效', () => {
    const guard = new SessionGuard();
    expect(guard.isValid().valid).toBe(true);
  });

  it('检测会话过期', () => {
    const guard = new SessionGuard({ maxAgeMs: 1000 });
    const now = Date.now();
    expect(guard.isValid(now).valid).toBe(true);
    expect(guard.isValid(now + 2000).valid).toBe(false);
  });

  it('检测空闲超时', () => {
    const guard = new SessionGuard({ maxIdleMs: 1000 });
    const now = Date.now();
    guard.touch();
    expect(guard.isValid(now).valid).toBe(true);
    expect(guard.isValid(now + 2000).valid).toBe(false);
  });

  it('touch刷新空闲时间', () => {
    const guard = new SessionGuard({ maxIdleMs: 1000 });
    let now = 1000;
    guard.touch();
    now += 500;
    guard.touch();
    expect(guard.isValid(now + 500).valid).toBe(true);
  });

  it('返回剩余时间', () => {
    const guard = new SessionGuard({ maxIdleMs: 5000, maxAgeMs: 10000 });
    guard.touch();
    const remaining = guard.getRemainingTime();
    expect(remaining.maxAge).toBeLessThanOrEqual(10000);
    expect(remaining.idle).toBeLessThanOrEqual(5000);
  });

  it('reset重置会话', () => {
    const guard = new SessionGuard({ maxAgeMs: 1000 });
    const t1 = Date.now();
    guard.reset();
    expect(guard.isValid(t1).valid).toBe(true);
    expect(guard.isValid(t1 + 500).valid).toBe(true);
  });
});
