/**
 * CORS 加固中间件
 * 支持：环境配置、动态白名单、子域名通配、原点日志审计、凭证控制
 * 符合 OWASP CORS 安全最佳实践
 */

import { Request, Response, NextFunction } from 'express';

// ==================== 类型定义 ====================
export interface CorsRule {
  /** 允许的原点列表（支持通配符 *.domain.com） */
  origins: string[];
  /** 允许的 HTTP 方法 */
  methods?: string[];
  /** 允许的请求头 */
  allowedHeaders?: string[];
  /** 暴露给前端的响应头 */
  exposedHeaders?: string[];
  /** 是否允许携带凭证 */
  credentials?: boolean;
  /** 预检缓存时间（秒） */
  maxAge?: number;
  /** 路径前缀匹配 */
  pathPrefix?: string;
}

export interface CorsViolation {
  timestamp: string;
  origin: string;
  method: string;
  path: string;
  ip: string;
  userAgent: string;
}

// ==================== 默认配置 ====================
const DEFAULT_METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'];
const DEFAULT_HEADERS = ['Content-Type', 'Authorization', 'X-CSRF-Token', 'X-Request-ID'];
const DEFAULT_EXPOSED = ['X-RateLimit-Limit', 'X-RateLimit-Remaining', 'X-RateLimit-Reset', 'X-Total-Count'];
const DEFAULT_MAX_AGE = 86400; // 24小时

// ==================== 开发环境白名单 ====================
const DEV_ORIGINS = [
  'http://localhost:3000',
  'http://localhost:3001',
  'http://localhost:5173',
  'http://localhost:5174',
  'http://127.0.0.1:3000',
  'http://127.0.0.1:5173',
];

// 生产环境额外白名单（可通过 CORS_ORIGINS 环境变量追加）
const PROD_ORIGINS = (process.env.CORS_ORIGINS || '')
  .split(',')
  .filter(Boolean);
const STATIC_PROD_ORIGINS = [
  'https://egobai.github.io',
  'https://clair-pi.vercel.app',
  'https://clair.market',
  'https://clair-production-1189.up.railway.app',
];

// ==================== 违规日志（内存环形缓冲） ====================
const MAX_VIOLATIONS = 1000;
const violationLog: CorsViolation[] = [];

function logViolation(req: Request, origin: string) {
  const entry: CorsViolation = {
    timestamp: new Date().toISOString(),
    origin,
    method: req.method,
    path: req.path,
    ip: req.ip || req.socket.remoteAddress || 'unknown',
    userAgent: req.headers['user-agent'] || 'unknown',
  };
  violationLog.push(entry);
  if (violationLog.length > MAX_VIOLATIONS) violationLog.shift();
  console.warn(`🚫 CORS 拒绝: ${origin} → ${req.method} ${req.path}`);
}

export function getCorsViolations(): CorsViolation[] {
  return [...violationLog];
}

// ==================== 原点匹配 ====================
function matchOrigin(origin: string, pattern: string): boolean {
  if (pattern === '*') return true;
  // 精确匹配
  if (pattern === origin) return true;

  // 通配符子域名 — 支持 "*.example.com" 和 "https://*.example.com"
  const wildcardMatch = pattern.match(/^(https?:\/\/)?\*\.(.+)$/);
  if (wildcardMatch) {
    const scheme = wildcardMatch[1]; // 可选协议前缀
    const domain = wildcardMatch[2];
    try {
      const url = new URL(origin);
      // 如果模式带了协议，需要匹配协议
      if (scheme && !origin.startsWith(scheme)) return false;
      return url.hostname === domain || url.hostname.endsWith(`.${domain}`);
    } catch {
      return false;
    }
  }

  // 正则模式 /regex/
  if (pattern.startsWith('/') && pattern.endsWith('/')) {
    try {
      const re = new RegExp(pattern.slice(1, -1));
      return re.test(origin);
    } catch {
      return false;
    }
  }
  return false;
}

export function isOriginAllowed(origin: string | undefined, allowedOrigins: string[]): boolean {
  if (!origin) return true; // 同源请求无 Origin 头
  return allowedOrigins.some(pattern => matchOrigin(origin, pattern));
}

// ==================== 解析白名单 ====================
function parseOrigins(envValue: string | undefined): string[] {
  if (!envValue) return [];
  return envValue.split(',').map(s => s.trim()).filter(Boolean);
}

function getEffectiveOrigins(): string[] {
  const envOrigins = parseOrigins(process.env.CORS_ORIGINS);
  if (envOrigins.length > 0) return envOrigins;

  if (process.env.NODE_ENV !== 'production') {
    return DEV_ORIGINS;
  }

  // 生产环境：静态白名单 + 环境变量
  return [...STATIC_PROD_ORIGINS, ...PROD_ORIGINS];
}

// ==================== 主中间件 ====================
export function corsMiddleware(rules?: CorsRule) {
  const origins = rules?.origins || getEffectiveOrigins();
  const methods = rules?.methods || DEFAULT_METHODS;
  const allowedHeaders = rules?.allowedHeaders || DEFAULT_HEADERS;
  const exposedHeaders = rules?.exposedHeaders || DEFAULT_EXPOSED;
  const credentials = rules?.credentials ?? true;
  const maxAge = rules?.maxAge ?? DEFAULT_MAX_AGE;

  return (req: Request, res: Response, next: NextFunction) => {
    const origin = req.headers.origin;

    // 同源请求（无 Origin 头），直接放行
    if (!origin) return next();

    // 检查原点
    if (!isOriginAllowed(origin, origins)) {
      logViolation(req, origin);
      // 对于预检，返回 403
      if (req.method === 'OPTIONS') {
        return res.status(403).end();
      }
      return res.status(403).json({
        success: false,
        error: 'CORS policy: origin not allowed',
        code: 'CORS_ORIGIN_DENIED',
      });
    }

    // 设置 CORS 头
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin'); // 关键：防止缓存污染

    if (credentials) {
      res.setHeader('Access-Control-Allow-Credentials', 'true');
    }

    // 预检请求
    if (req.method === 'OPTIONS') {
      res.setHeader('Access-Control-Allow-Methods', methods.join(', '));
      res.setHeader('Access-Control-Allow-Headers', allowedHeaders.join(', '));
      res.setHeader('Access-Control-Max-Age', String(maxAge));
      return res.status(204).end();
    }

    // 暴露头
    if (exposedHeaders.length > 0) {
      res.setHeader('Access-Control-Expose-Headers', exposedHeaders.join(', '));
    }

    next();
  };
}

// ==================== CORS 健康端点 ====================
export function corsStatusEndpoint(_req: Request, res: Response) {
  const origins = getEffectiveOrigins();
  res.json({
    success: true,
    data: {
      allowedOrigins: origins,
      isProduction: process.env.NODE_ENV === 'production',
      totalViolations: violationLog.length,
      recentViolations: violationLog.slice(-10),
    },
  });
}
