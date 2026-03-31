/**
 * 前端安全工具引擎
 * 提供XSS防护、输入验证、敏感数据处理、CSP辅助、安全存储
 */

// ==================== 类型定义 ====================

export interface SanitizeOptions {
  allowedTags: string[];
  allowedAttributes: Record<string, string[]>;
  stripTags: boolean;
  encodeEntities: boolean;
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  sanitized: string;
}

export interface SensitiveDataConfig {
  maskChar: string;
  showLast: number;
  showFirst: number;
}

export interface CSPDirectives {
  'default-src'?: string[];
  'script-src'?: string[];
  'style-src'?: string[];
  'img-src'?: string[];
  'connect-src'?: string[];
  'font-src'?: string[];
  'object-src'?: string[];
  'frame-src'?: string[];
}

export interface SecurityAuditResult {
  score: number; // 0-100
  checks: Array<{
    name: string;
    passed: boolean;
    severity: 'critical' | 'high' | 'medium' | 'low';
    message: string;
  }>;
  recommendations: string[];
}

// ==================== XSS防护 ====================

/**
 * HTML实体编码
 */
export function encodeHTML(input: string): string {
  const entityMap: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#x27;',
    '/': '&#x2F;',
    '`': '&#96;',
  };
  return input.replace(/[&<>"'`/]/g, char => entityMap[char] || char);
}

/**
 * 反转义HTML实体
 */
export function decodeHTML(input: string): string {
  const entityMap: Record<string, string> = {
    '&amp;': '&',
    '&lt;': '<',
    '&gt;': '>',
    '&quot;': '"',
    '&#x27;': "'",
    '&#x2F;': '/',
    '&#96;': '`',
  };
  return input.replace(/&(?:amp|lt|gt|quot|#x27|#x2F|#96);/g, entity => entityMap[entity] || entity);
}

/**
 * 清理HTML（允许白名单标签）
 */
export function sanitizeHTML(input: string, options?: Partial<SanitizeOptions>): string {
  const defaultOptions: SanitizeOptions = {
    allowedTags: ['b', 'i', 'em', 'strong', 'a', 'p', 'br', 'ul', 'ol', 'li', 'span'],
    allowedAttributes: {
      'a': ['href', 'title'],
      'span': ['class'],
    },
    stripTags: false,
    encodeEntities: true,
  };

  const opts = { ...defaultOptions, ...options };

  if (opts.stripTags) {
    return input.replace(/<[^>]*>/g, '');
  }

  // 移除script和事件处理器
  let result = input;
  result = result.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
  result = result.replace(/on\w+\s*=\s*["'][^"']*["']/gi, '');
  result = result.replace(/on\w+\s*=\s*[^\s>]*/gi, '');
  result = result.replace(/javascript:/gi, '');
  result = result.replace(/data:\s*[^,]*;base64/gi, '');

  // 移除不在白名单的标签
  const tagRegex = /<\/?([a-zA-Z][a-zA-Z0-9]*)\b[^>]*>/g;
  result = result.replace(tagRegex, (match, tag) => {
    if (opts.allowedTags.includes(tag.toLowerCase())) {
      return match;
    }
    return '';
  });

  return result;
}

/**
 * 检测XSS攻击模式
 */
export function detectXSS(input: string): boolean {
  const xssPatterns = [
    /<script[\s>]/i,
    /javascript:/i,
    /on\w+\s*=/i,
    /<iframe[\s>]/i,
    /<object[\s>]/i,
    /<embed[\s>]/i,
    /<applet[\s>]/i,
    /expression\s*\(/i,
    /url\s*\(/i,
    /data:\s*text\/html/i,
    /vbscript:/i,
    /<svg[\s>]on/i,
  ];

  return xssPatterns.some(pattern => pattern.test(input));
}

// ==================== 输入验证 ====================

/**
 * 验证邮箱格式
 */
export function validateEmail(email: string): ValidationResult {
  const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
  const valid = emailRegex.test(email);
  return {
    valid,
    errors: valid ? [] : ['邮箱格式不正确'],
    sanitized: email.trim().toLowerCase(),
  };
}

/**
 * 验证手机号（中国）
 */
export function validatePhone(phone: string): ValidationResult {
  const cleaned = phone.replace(/[\s-]/g, '');
  const phoneRegex = /^1[3-9]\d{9}$/;
  const valid = phoneRegex.test(cleaned);
  return {
    valid,
    errors: valid ? [] : ['手机号格式不正确'],
    sanitized: cleaned,
  };
}

/**
 * 验证股票代码
 */
export function validateStockCode(code: string): ValidationResult {
  const cleaned = code.trim().toUpperCase();
  // A股代码格式：6位数字或带前缀
  const codeRegex = /^(SH|SZ|BJ)?\d{6}$/;
  const valid = codeRegex.test(cleaned);
  return {
    valid,
    errors: valid ? [] : ['股票代码格式不正确（应为6位数字）'],
    sanitized: cleaned,
  };
}

/**
 * 验证密码强度
 */
export function validatePassword(password: string, minLength: number = 8): ValidationResult {
  const errors: string[] = [];

  if (password.length < minLength) {
    errors.push(`密码长度不能少于${minLength}位`);
  }
  if (!/[A-Z]/.test(password)) {
    errors.push('密码需包含大写字母');
  }
  if (!/[a-z]/.test(password)) {
    errors.push('密码需包含小写字母');
  }
  if (!/[0-9]/.test(password)) {
    errors.push('密码需包含数字');
  }
  if (!/[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]/.test(password)) {
    errors.push('密码需包含特殊字符');
  }

  return {
    valid: errors.length === 0,
    errors,
    sanitized: password,
  };
}

/**
 * 通用字符串验证
 */
export function validateString(
  input: string,
  rules: {
    minLength?: number;
    maxLength?: number;
    pattern?: RegExp;
    allowEmpty?: boolean;
    trim?: boolean;
  },
): ValidationResult {
  const errors: string[] = [];
  let sanitized = rules.trim !== false ? input.trim() : input;

  if (!rules.allowEmpty && sanitized.length === 0) {
    errors.push('不能为空');
  }
  if (rules.minLength !== undefined && sanitized.length < rules.minLength) {
    errors.push(`长度不能少于${rules.minLength}个字符`);
  }
  if (rules.maxLength !== undefined && sanitized.length > rules.maxLength) {
    errors.push(`长度不能超过${rules.maxLength}个字符`);
    sanitized = sanitized.slice(0, rules.maxLength);
  }
  if (rules.pattern && !rules.pattern.test(sanitized)) {
    errors.push('格式不正确');
  }

  return {
    valid: errors.length === 0,
    errors,
    sanitized,
  };
}

/**
 * 验证数字范围
 */
export function validateNumber(
  value: number,
  rules: { min?: number; max?: number; integer?: boolean },
): ValidationResult {
  const errors: string[] = [];

  if (isNaN(value)) {
    errors.push('不是有效数字');
    return { valid: false, errors, sanitized: 'NaN' };
  }

  if (rules.integer && !Number.isInteger(value)) {
    errors.push('必须是整数');
  }
  if (rules.min !== undefined && value < rules.min) {
    errors.push(`不能小于${rules.min}`);
  }
  if (rules.max !== undefined && value > rules.max) {
    errors.push(`不能大于${rules.max}`);
  }

  return {
    valid: errors.length === 0,
    errors,
    sanitized: String(value),
  };
}

// ==================== 敏感数据处理 ====================

/**
 * 脱敏手机号
 */
export function maskPhone(phone: string, config?: Partial<SensitiveDataConfig>): string {
  const cfg: SensitiveDataConfig = { maskChar: '*', showLast: 4, showFirst: 3, ...config };
  if (phone.length < cfg.showFirst + cfg.showLast) return phone;
  const first = phone.slice(0, cfg.showFirst);
  const last = phone.slice(-cfg.showLast);
  const masked = cfg.maskChar.repeat(phone.length - cfg.showFirst - cfg.showLast);
  return `${first}${masked}${last}`;
}

/**
 * 脱敏邮箱
 */
export function maskEmail(email: string): string {
  const [local, domain] = email.split('@');
  if (!local || !domain) return email;
  const maskedLocal = local.length > 2
    ? `${local[0]}${'*'.repeat(local.length - 2)}${local[local.length - 1]}`
    : local;
  return `${maskedLocal}@${domain}`;
}

/**
 * 脱敏身份证号
 */
export function maskIDCard(id: string): string {
  if (id.length < 8) return id;
  return `${id.slice(0, 4)}${'*'.repeat(id.length - 8)}${id.slice(-4)}`;
}

/**
 * 脱敏银行卡号
 */
export function maskBankCard(card: string): string {
  if (card.length < 8) return card;
  return `${'*'.repeat(card.length - 4)}${card.slice(-4)}`;
}

/**
 * 脱敏姓名
 */
export function maskName(name: string): string {
  if (name.length <= 1) return name;
  return `${name[0]}${'*'.repeat(name.length - 1)}`;
}

// ==================== 安全存储 ====================

/**
 * 简单加密（Base64 + 简单混淆，非真正加密）
 */
export function obfuscate(data: string): string {
  const encoded = btoa(unescape(encodeURIComponent(data)));
  return encoded.split('').reverse().join('');
}

/**
 * 反混淆
 */
export function deobfuscate(data: string): string {
  try {
    const reversed = data.split('').reverse().join('');
    return decodeURIComponent(escape(atob(reversed)));
  } catch {
    return '';
  }
}

/**
 * 生成随机Token
 */
export function generateToken(length: number = 32): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  const array = new Uint8Array(length);
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    crypto.getRandomValues(array);
  } else {
    for (let i = 0; i < length; i++) {
      array[i] = Math.floor(Math.random() * chars.length);
    }
  }
  return Array.from(array, byte => chars[byte % chars.length]).join('');
}

/**
 * 生成CSRF Token
 */
export function generateCSRFToken(): string {
  return generateToken(64);
}

// ==================== CSP构建 ====================

/**
 * 构建CSP头
 */
export function buildCSP(directives: CSPDirectives): string {
  return Object.entries(directives)
    .map(([key, values]) => `${key} ${values.join(' ')}`)
    .join('; ');
}

/**
 * 生成默认CSP配置
 */
export function getDefaultCSP(): string {
  return buildCSP({
    'default-src': ["'self'"],
    'script-src': ["'self'"],
    'style-src': ["'self'", "'unsafe-inline'"],
    'img-src': ["'self'", 'data:', 'https:'],
    'connect-src': ["'self'"],
    'font-src': ["'self'"],
    'object-src': ["'none'"],
    'frame-src': ["'none'"],
  });
}

// ==================== 安全审计 ====================

/**
 * 执行前端安全审计
 */
export function auditSecurity(): SecurityAuditResult {
  const checks: SecurityAuditResult['checks'] = [];
  const recommendations: string[] = [];

  // HTTPS检查
  const isHTTPS = typeof location !== 'undefined' && location.protocol === 'https:';
  checks.push({
    name: 'HTTPS',
    passed: isHTTPS,
    severity: 'critical',
    message: isHTTPS ? '站点使用HTTPS' : '站点未使用HTTPS',
  });
  if (!isHTTPS) recommendations.push('启用HTTPS加密传输');

  // CSP检查
  const hasCSP = typeof document !== 'undefined' && !!document.querySelector('meta[http-equiv="Content-Security-Policy"]');
  checks.push({
    name: 'CSP',
    passed: hasCSP,
    severity: 'high',
    message: hasCSP ? '检测到CSP策略' : '未检测到CSP策略',
  });
  if (!hasCSP) recommendations.push('配置Content-Security-Policy');

  // 内联脚本检查
  const inlineScripts = typeof document !== 'undefined' ? document.querySelectorAll('script:not([src])').length : 0;
  checks.push({
    name: '内联脚本',
    passed: inlineScripts === 0,
    severity: 'medium',
    message: inlineScripts === 0 ? '无内联脚本' : `发现${inlineScripts}个内联脚本`,
  });
  if (inlineScripts > 0) recommendations.push('移除内联脚本，使用外部JS文件');

  // Cookie安全检查
  const hasSecureCookies = typeof document !== 'undefined' && !document.cookie.includes('HttpOnly') ? false : true;
  checks.push({
    name: 'Cookie安全',
    passed: hasSecureCookies,
    severity: 'medium',
    message: hasSecureCookies ? 'Cookie安全配置正常' : 'Cookie可能缺少安全标志',
  });

  const passedChecks = checks.filter(c => c.passed).length;
  const score = Math.round((passedChecks / checks.length) * 100);

  return { score, checks, recommendations };
}

// ==================== URL安全 ====================

/**
 * 验证URL是否安全
 */
export function isSafeURL(url: string): boolean {
  try {
    const parsed = new URL(url, 'https://example.com');
    return ['http:', 'https:', 'mailto:'].includes(parsed.protocol);
  } catch {
    return false;
  }
}

/**
 * 清理URL参数
 */
export function sanitizeURLParams(url: string): string {
  try {
    const parsed = new URL(url, 'https://example.com');
    const cleanParams = new URLSearchParams();
    parsed.searchParams.forEach((value, key) => {
      if (!detectXSS(key) && !detectXSS(value)) {
        cleanParams.append(key, value);
      }
    });
    parsed.search = cleanParams.toString();
    return parsed.toString();
  } catch {
    return '';
  }
}

// ==================== 速率限制 ====================

export interface RateLimitConfig {
  maxRequests: number;
  windowMs: number;
  blockDurationMs: number;
}

export interface RateLimitState {
  requests: number[];
  blockedUntil: number | null;
}

export class RateLimiter {
  private config: RateLimitConfig;
  private state: RateLimitState;

  constructor(config: Partial<RateLimitConfig> = {}) {
    this.config = {
      maxRequests: config.maxRequests ?? 60,
      windowMs: config.windowMs ?? 60000,
      blockDurationMs: config.blockDurationMs ?? 300000,
    };
    this.state = { requests: [], blockedUntil: null };
  }

  check(now: number = Date.now()): { allowed: boolean; remaining: number; resetAt: number } {
    if (this.state.blockedUntil && now < this.state.blockedUntil) {
      return { allowed: false, remaining: 0, resetAt: this.state.blockedUntil };
    }

    if (this.state.blockedUntil && now >= this.state.blockedUntil) {
      this.state.blockedUntil = null;
      this.state.requests = [];
    }

    const cutoff = now - this.config.windowMs;
    this.state.requests = this.state.requests.filter(t => t > cutoff);
    const remaining = this.config.maxRequests - this.state.requests.length;
    const resetAt = this.state.requests.length > 0
      ? this.state.requests[0] + this.config.windowMs
      : now + this.config.windowMs;

    if (remaining <= 0) {
      this.state.blockedUntil = now + this.config.blockDurationMs;
      return { allowed: false, remaining: 0, resetAt: this.state.blockedUntil };
    }

    this.state.requests.push(now);
    return { allowed: true, remaining: remaining - 1, resetAt };
  }

  reset(): void {
    this.state = { requests: [], blockedUntil: null };
  }

  getState(): RateLimitState {
    return { ...this.state, requests: [...this.state.requests] };
  }
}

// ==================== 请求签名 ====================

/**
 * 生成请求签名（简单HMAC-like）
 */
export function signRequest(
  method: string,
  path: string,
  body: string,
  timestamp: number,
  secret: string
): string {
  const payload = `${method.toUpperCase()}:${path}:${body}:${timestamp}`;
  // 使用简单哈希（生产环境应使用Web Crypto API）
  let hash = 0;
  const combined = payload + secret;
  for (let i = 0; i < combined.length; i++) {
    const char = combined.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash).toString(36);
}

/**
 * 验证请求签名
 */
export function verifyRequestSignature(
  method: string,
  path: string,
  body: string,
  timestamp: number,
  secret: string,
  signature: string,
  maxAgeMs: number = 300000
): { valid: boolean; reason?: string } {
  if (Math.abs(Date.now() - timestamp) > maxAgeMs) {
    return { valid: false, reason: 'timestamp_expired' };
  }

  const expected = signRequest(method, path, body, timestamp, secret);
  if (expected !== signature) {
    return { valid: false, reason: 'signature_mismatch' };
  }

  return { valid: true };
}

// ==================== 会话安全 ====================

export interface SessionConfig {
  maxIdleMs: number;
  maxAgeMs: number;
  regenerateOnAuth: boolean;
}

export class SessionGuard {
  private config: SessionConfig;
  private createdAt: number;
  private lastActiveAt: number;

  constructor(config: Partial<SessionConfig> = {}) {
    this.config = {
      maxIdleMs: config.maxIdleMs ?? 1800000, // 30 min
      maxAgeMs: config.maxAgeMs ?? 86400000, // 24h
      regenerateOnAuth: config.regenerateOnAuth ?? true,
    };
    const now = Date.now();
    this.createdAt = now;
    this.lastActiveAt = now;
  }

  touch(): void {
    this.lastActiveAt = Date.now();
  }

  isValid(now: number = Date.now()): { valid: boolean; reason?: string } {
    if (now - this.createdAt > this.config.maxAgeMs) {
      return { valid: false, reason: 'session_expired' };
    }
    if (now - this.lastActiveAt > this.config.maxIdleMs) {
      return { valid: false, reason: 'session_idle' };
    }
    return { valid: true };
  }

  getRemainingTime(now: number = Date.now()): { maxAge: number; idle: number } {
    return {
      maxAge: Math.max(0, this.config.maxAgeMs - (now - this.createdAt)),
      idle: Math.max(0, this.config.maxIdleMs - (now - this.lastActiveAt)),
    };
  }

  reset(): void {
    const now = Date.now();
    this.createdAt = now;
    this.lastActiveAt = now;
  }
}
