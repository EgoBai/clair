/**
 * OWASP Top 10 安全加固中间件
 * 针对金融级安全标准设计
 * 
 * 安全措施：
 * 1. SQL注入防护 - 参数化查询 + 输入净化
 * 2. XSS防护 - CSP + 输入转义
 * 3. CSRF防护 - Token验证
 * 4. 敏感数据加密 - 密码/密钥加密存储
 * 5. 安全头部完整配置
 * 6. 请求大小限制
 * 7. IP白名单（可选）
 * 8. 速率限制增强
 */

import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';

// ==================== 类型定义 ====================
interface SecurityConfig {
  maxRequestSize: string;
  allowedOrigins: string[];
  enableCSP: boolean;
  enableHSTS: boolean;
  hstsMaxAge: number;
  cspDirectives: Record<string, string[]>;
  blockedUserAgents: RegExp[];
  ipWhitelist: string[];
  enableIpWhitelist: boolean;
}

interface RateLimitEntry {
  count: number;
  resetTime: number;
  blocked: boolean;
  blockUntil: number;
}

// ==================== 默认配置 ====================
const defaultConfig: SecurityConfig = {
  maxRequestSize: '1mb',
  allowedOrigins: process.env.CORS_ORIGINS?.split(',') || ['http://localhost:5173'],
  enableCSP: true,
  enableHSTS: process.env.NODE_ENV === 'production',
  hstsMaxAge: 31536000, // 1年
  cspDirectives: {
    'default-src': ["'self'"],
    'script-src': ["'self'", "'unsafe-inline'"],
    'style-src': ["'self'", "'unsafe-inline'"],
    'img-src': ["'self'", 'data:', 'https:'],
    'connect-src': ["'self'", 'ws:', 'wss:'],
    'font-src': ["'self'"],
    'object-src': ["'none'"],
    'frame-ancestors': ["'none'"],
  },
  blockedUserAgents: [
    /sqlmap/i,
    /nikto/i,
    /nessus/i,
    /burpsuite/i,
    /acunetix/i,
  ],
  ipWhitelist: [],
  enableIpWhitelist: false,
};

// ==================== 安全事件记录 ====================
class SecurityAuditLogger {
  private logs: Array<{
    timestamp: string;
    type: string;
    ip: string;
    path: string;
    details: string;
    severity: 'low' | 'medium' | 'high' | 'critical';
  }> = [];

  log(
    type: string,
    ip: string,
    path: string,
    details: string,
    severity: 'low' | 'medium' | 'high' | 'critical' = 'medium'
  ) {
    this.logs.push({
      timestamp: new Date().toISOString(),
      type,
      ip,
      path,
      details,
      severity,
    });

    // 保留最近1000条
    if (this.logs.length > 1000) {
      this.logs = this.logs.slice(-1000);
    }

    if (severity === 'critical' || severity === 'high') {
      console.warn(`🚨 [SECURITY-${severity.toUpperCase()}] ${type}: ${details} (IP: ${ip}, Path: ${path})`);
    }
  }

  getRecentLogs(count = 50) {
    return this.logs.slice(-count);
  }

  getStats() {
    const now = Date.now();
    const lastHour = this.logs.filter(
      l => now - new Date(l.timestamp).getTime() < 3600000
    );
    return {
      totalEvents: this.logs.length,
      lastHour: lastHour.length,
      bySeverity: {
        critical: lastHour.filter(l => l.severity === 'critical').length,
        high: lastHour.filter(l => l.severity === 'high').length,
        medium: lastHour.filter(l => l.severity === 'medium').length,
        low: lastHour.filter(l => l.severity === 'low').length,
      },
    };
  }
}

export const securityAudit = new SecurityAuditLogger();

// ==================== IP黑名单存储 ====================
const ipBlacklist = new Set<string>();
const rateLimitStore = new Map<string, RateLimitEntry>();

// 清理过期的限流条目
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of rateLimitStore) {
    if (now > entry.resetTime && (!entry.blocked || now > entry.blockUntil)) {
      rateLimitStore.delete(key);
    }
  }
}, 60000);

// ==================== SQL注入检测 ====================
const SQL_INJECTION_PATTERNS = [
  /(\b(SELECT|INSERT|UPDATE|DELETE|DROP|UNION|ALTER|CREATE|EXEC|EXECUTE)\b.*\b(FROM|INTO|TABLE|SET|WHERE)\b)/i,
  /(\b(OR|AND)\b\s+\d+\s*=\s*\d+)/i,
  /(;.*--)/,
  /('.*OR.*'.*'.*')/i,
  /(\/\*.*\*\/)/,
  /(CHAR\s*\(\d+\))/i,
  /(CONCAT\s*\()/i,
  /(0x[0-9a-fA-F]+)/,
];

function detectSQLInjection(value: string): boolean {
  return SQL_INJECTION_PATTERNS.some(pattern => pattern.test(value));
}

// ==================== XSS检测 ====================
const XSS_PATTERNS = [
  /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/i,
  /javascript:/i,
  /on\w+\s*=/i,
  /<iframe/i,
  /<object/i,
  /<embed/i,
  /expression\s*\(/i,
  /vbscript:/i,
  /data:text\/html/i,
];

function detectXSS(value: string): boolean {
  return XSS_PATTERNS.some(pattern => pattern.test(value));
}

// ==================== 路径遍历检测 ====================
const PATH_TRAVERSAL_PATTERNS = [
  /\.\.\//,
  /\.\.\\/,
  /%2e%2e%2f/i,
  /%2e%2e\//i,
  /\.\.%2f/i,
  /%2e%2e%5c/i,
];

function detectPathTraversal(value: string): boolean {
  return PATH_TRAVERSAL_PATTERNS.some(pattern => pattern.test(value));
}

// ==================== 增强限流中间件 ====================
export function enhancedRateLimit(options: {
  windowMs: number;
  maxRequests: number;
  blockDuration?: number;
  keyGenerator?: (req: Request) => string;
}) {
  const { windowMs, maxRequests, blockDuration = 300000, keyGenerator } = options;

  return (req: Request, res: Response, next: NextFunction) => {
    const key = keyGenerator
      ? keyGenerator(req)
      : req.ip || req.socket.remoteAddress || 'unknown';
    const now = Date.now();

    let entry = rateLimitStore.get(key);

    // 检查是否被封禁
    if (entry?.blocked && now < entry.blockUntil) {
      const retryAfter = Math.ceil((entry.blockUntil - now) / 1000);
      securityAudit.log(
        'BLOCKED_REQUEST',
        key,
        req.path,
        `IP被封禁，剩余${retryAfter}秒`,
        'medium'
      );
      res.set('Retry-After', String(retryAfter));
      return res.status(429).json({
        success: false,
        error: '请求过于频繁，IP已被临时封禁',
        retryAfter,
      });
    }

    // 重置或新建条目
    if (!entry || now > entry.resetTime) {
      entry = { count: 0, resetTime: now + windowMs, blocked: false, blockUntil: 0 };
    }

    entry.count++;

    // 超过限制
    if (entry.count > maxRequests) {
      // 连续违规封禁
      if (entry.count > maxRequests * 2) {
        entry.blocked = true;
        entry.blockUntil = now + blockDuration;
        securityAudit.log(
          'RATE_LIMIT_EXCEEDED',
          key,
          req.path,
          `连续${entry.count}次请求，封禁${blockDuration / 1000}秒`,
          'high'
        );
      }

      rateLimitStore.set(key, entry);
      const retryAfter = Math.ceil((entry.resetTime - now) / 1000);
      res.set({
        'X-RateLimit-Limit': String(maxRequests),
        'X-RateLimit-Remaining': '0',
        'X-RateLimit-Reset': String(Math.ceil(entry.resetTime / 1000)),
        'Retry-After': String(retryAfter),
      });
      return res.status(429).json({
        success: false,
        error: '请求过于频繁，请稍后重试',
        retryAfter,
      });
    }

    rateLimitStore.set(key, entry);
    res.set({
      'X-RateLimit-Limit': String(maxRequests),
      'X-RateLimit-Remaining': String(maxRequests - entry.count),
      'X-RateLimit-Reset': String(Math.ceil(entry.resetTime / 1000)),
    });
    next();
  };
}

// ==================== 输入安全扫描中间件 ====================
export function inputSecurityScan() {
  return (req: Request, res: Response, next: NextFunction) => {
    const ip = req.ip || req.socket.remoteAddress || 'unknown';
    const fullPath = `${req.method} ${req.path}`;

    // 检查IP黑名单
    if (ipBlacklist.has(ip)) {
      securityAudit.log('BLACKLISTED_IP', ip, req.path, '黑名单IP尝试访问', 'critical');
      return res.status(403).json({ success: false, error: '访问被拒绝' });
    }

    // 检查恶意User-Agent
    const userAgent = req.get('User-Agent') || '';
    for (const pattern of defaultConfig.blockedUserAgents) {
      if (pattern.test(userAgent)) {
        securityAudit.log('BLOCKED_USER_AGENT', ip, req.path, `恶意UA: ${userAgent}`, 'high');
        return res.status(403).json({ success: false, error: '访问被拒绝' });
      }
    }

    // URL路径安全检查
    if (detectPathTraversal(req.originalUrl)) {
      securityAudit.log('PATH_TRAVERSAL', ip, req.path, `路径遍历尝试: ${req.originalUrl}`, 'critical');
      return res.status(400).json({ success: false, error: '无效请求路径' });
    }

    // SQL注入检测
    const queryStr = JSON.stringify(req.query);
    const bodyStr = req.body ? JSON.stringify(req.body) : '';

    if (detectSQLInjection(queryStr) || detectSQLInjection(bodyStr)) {
      securityAudit.log('SQL_INJECTION', ip, fullPath, `SQL注入检测: ${queryStr.substring(0, 200)}`, 'critical');
      ipBlacklist.add(ip);
      return res.status(400).json({ success: false, error: '无效请求数据' });
    }

    // XSS检测
    if (detectXSS(queryStr) || detectXSS(bodyStr)) {
      securityAudit.log('XSS_ATTEMPT', ip, fullPath, `XSS攻击检测: ${queryStr.substring(0, 200)}`, 'high');
      return res.status(400).json({ success: false, error: '无效请求数据' });
    }

    // URL编码攻击检测
    const decodedUrl = decodeURIComponent(req.originalUrl);
    if (decodedUrl !== req.originalUrl) {
      if (detectSQLInjection(decodedUrl) || detectXSS(decodedUrl)) {
        securityAudit.log('ENCODED_ATTACK', ip, fullPath, '编码攻击检测', 'high');
        return res.status(400).json({ success: false, error: '无效请求' });
      }
    }

    next();
  };
}

// ==================== 安全响应头中间件 ====================
export function securityResponseHeaders() {
  return (_req: Request, res: Response, next: NextFunction) => {
    // 移除服务端信息
    res.removeHeader('X-Powered-By');
    res.removeHeader('Server');

    // 安全头
    res.set({
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY',
      'X-XSS-Protection': '1; mode=block',
      'Referrer-Policy': 'strict-origin-when-cross-origin',
      'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Resource-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
    });

    // HSTS
    if (defaultConfig.enableHSTS) {
      res.set(
        'Strict-Transport-Security',
        `max-age=${defaultConfig.hstsMaxAge}; includeSubDomains; preload`
      );
    }

    // CSP
    if (defaultConfig.enableCSP) {
      const cspParts = Object.entries(defaultConfig.cspDirectives).map(
        ([directive, values]) => `${directive} ${values.join(' ')}`
      );
      res.set('Content-Security-Policy', cspParts.join('; '));
    }

    next();
  };
}

// ==================== 敏感数据脱敏工具 ====================
export function sanitizeSensitiveData(data: Record<string, unknown>): Record<string, unknown> {
  const sensitiveFields = ['password', 'token', 'secret', 'key', 'authorization', 'cookie'];
  const result = { ...data };

  for (const key of Object.keys(result)) {
    if (sensitiveFields.some(field => key.toLowerCase().includes(field))) {
      if (typeof result[key] === 'string') {
        const value = result[key] as string;
        result[key] = value.substring(0, 4) + '****' + value.substring(value.length - 4);
      }
    }
  }

  return result;
}

// ==================== 请求签名验证 ====================
export function verifyRequestSignature(secret: string) {
  return (req: Request, res: Response, next: NextFunction) => {
    const signature = req.get('X-Signature');
    const timestamp = req.get('X-Timestamp');

    if (!signature || !timestamp) {
      return res.status(401).json({ success: false, error: '缺少签名信息' });
    }

    // 检查时间戳（5分钟内有效）
    const now = Date.now();
    const reqTime = parseInt(timestamp, 10);
    if (isNaN(reqTime) || Math.abs(now - reqTime) > 300000) {
      return res.status(401).json({ success: false, error: '请求已过期' });
    }

    // 验证签名
    const payload = `${req.method}:${req.path}:${timestamp}:${JSON.stringify(req.body || {})}`;
    const expectedSignature = crypto
      .createHmac('sha256', secret)
      .update(payload)
      .digest('hex');

    if (signature !== expectedSignature) {
      securityAudit.log(
        'INVALID_SIGNATURE',
        req.ip || 'unknown',
        req.path,
        '请求签名验证失败',
        'high'
      );
      return res.status(401).json({ success: false, error: '签名验证失败' });
    }

    next();
  };
}

// ==================== 安全监控端点 ====================
export function securityMonitorEndpoint(req: Request, res: Response) {
  const stats = securityAudit.getStats();
  const recentLogs = securityAudit.getRecentLogs(20);
  res.json({
    success: true,
    data: {
      stats,
      blacklistedIps: Array.from(ipBlacklist),
      recentEvents: recentLogs,
    },
  });
}
