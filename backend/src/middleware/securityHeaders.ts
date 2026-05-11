/**
 * 增强安全头部配置
 * 超越 helmet 默认配置，遵循 OWASP 安全头部最佳实践
 */

import { Request, Response, NextFunction } from 'express';

interface SecurityHeadersConfig {
  /** 内容安全策略 */
  contentSecurityPolicy?: string | false;
  /** 严格传输安全 */
  hsts?: { maxAge: number; includeSubDomains: boolean; preload: boolean } | false;
  /** 允许的来源 */
  allowedOrigins?: string[];
  /** 是否启用 Permissions-Policy */
  permissionsPolicy?: boolean;
}

const DEFAULT_CONFIG: Required<SecurityHeadersConfig> = {
  contentSecurityPolicy: [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "img-src 'self' data: https:",
    "font-src 'self' data: https://fonts.gstatic.com",
    "connect-src 'self' ws: wss: https:",
    "frame-ancestors 'none'",
  ].join('; '),
  hsts: {
    maxAge: 31536000, // 1年
    includeSubDomains: true,
    preload: true,
  },
  allowedOrigins: [],
  permissionsPolicy: true,
};

/**
 * 增强安全头部中间件
 */
export function enhancedSecurityHeaders(config: SecurityHeadersConfig = {}) {
  const cfg = { ...DEFAULT_CONFIG, ...config };

  return (_req: Request, res: Response, next: NextFunction) => {
    // Content-Security-Policy
    if (cfg.contentSecurityPolicy) {
      res.setHeader('Content-Security-Policy', cfg.contentSecurityPolicy);
    }

    // Strict-Transport-Security (HSTS)
    if (cfg.hsts) {
      const parts = [`max-age=${cfg.hsts.maxAge}`];
      if (cfg.hsts.includeSubDomains) parts.push('includeSubDomains');
      if (cfg.hsts.preload) parts.push('preload');
      res.setHeader('Strict-Transport-Security', parts.join('; '));
    }

    // X-Content-Type-Options
    res.setHeader('X-Content-Type-Options', 'nosniff');

    // X-Frame-Options
    res.setHeader('X-Frame-Options', 'DENY');

    // X-XSS-Protection (legacy but still useful)
    res.setHeader('X-XSS-Protection', '1; mode=block');

    // Referrer-Policy
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');

    // Permissions-Policy (替代 Feature-Policy)
    if (cfg.permissionsPolicy) {
      res.setHeader(
        'Permissions-Policy',
        [
          'camera=()',
          'microphone=()',
          'geolocation=()',
          'payment=()',
          'usb=()',
          'magnetometer=()',
          'gyroscope=()',
          'accelerometer=()',
        ].join(', ')
      );
    }

    // X-Permitted-Cross-Domain-Policies
    res.setHeader('X-Permitted-Cross-Domain-Policies', 'none');

    // Cache-Control for API responses (防止敏感数据缓存)
    if (_req.path.startsWith('/api/')) {
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
    }

    // 移除泄露服务器信息的头部
    res.removeHeader('X-Powered-By');
    res.removeHeader('Server');

    next();
  };
}

/**
 * CORS 预检请求处理增强
 */
export function enhancedCors(allowedOrigins: string[] = []) {
  return (req: Request, res: Response, next: NextFunction) => {
    const origin = req.headers.origin;

    if (origin && (allowedOrigins.length === 0 || allowedOrigins.includes(origin))) {
      res.setHeader('Access-Control-Allow-Origin', origin);
    }

    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
    res.setHeader(
      'Access-Control-Allow-Headers',
      'Content-Type, Authorization, X-CSRF-Token, X-Request-ID'
    );
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Max-Age', '86400');
    res.setHeader('Access-Control-Expose-Headers', 'X-RateLimit-Limit, X-RateLimit-Remaining, X-RateLimit-Reset');

    if (req.method === 'OPTIONS') {
      return res.status(204).end();
    }

    next();
  };
}

/**
 * 请求 ID 中间件（用于追踪和审计）
 */
export function requestIdMiddleware(req: Request, res: Response, next: NextFunction) {
  const requestId = req.headers['x-request-id'] as string || generateRequestId();
  req.headers['x-request-id'] = requestId;
  res.setHeader('X-Request-ID', requestId);
  next();
}

function generateRequestId(): string {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * 防止点击劫持
 */
export function antiClickjack(_req: Request, res: Response, next: NextFunction) {
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Content-Security-Policy', "frame-ancestors 'none'");
  next();
}

/**
 * 敏感操作审计日志
 */
export function auditLog(action: string) {
  return (req: Request, res: Response, next: NextFunction) => {
    const startTime = Date.now();
    const requestId = req.headers['x-request-id'] || 'unknown';
    const ip = req.ip || req.socket.remoteAddress || 'unknown';

    res.on('finish', () => {
      const duration = Date.now() - startTime;
      const log = {
        timestamp: new Date().toISOString(),
        action,
        method: req.method,
        path: req.path,
        statusCode: res.statusCode,
        ip,
        requestId,
        duration,
        userAgent: req.headers['user-agent'],
      };

      // 记录失败的敏感操作
      if (res.statusCode >= 400) {
        console.warn('🔒 AUDIT [FAILED]:', JSON.stringify(log));
      } else {
        console.log('🔒 AUDIT:', JSON.stringify(log));
      }
    });

    next();
  };
}
