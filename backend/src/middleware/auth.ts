/**
 * JWT 认证中间件
 * 提供：Token签发、验证、自动刷新、敏感数据脱敏
 *
 * 使用对称签名（HS256），生产环境应配置强 JWT_SECRET
 */

import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { createLogger } from '../utils/logger';

const log = createLogger('Auth');

// ==================== 配置 ====================

const JWT_SECRET = process.env.JWT_SECRET || 'a-stock-dev-secret-change-in-production';
const ACCESS_TOKEN_EXPIRY = 15 * 60 * 1000;   // 15分钟
const REFRESH_TOKEN_EXPIRY = 7 * 24 * 60 * 60 * 1000; // 7天
const ISSUER = 'a-stock-api';

// ==================== 类型定义 ====================

export interface TokenPayload {
  sub: string;       // 用户ID
  email: string;     // 用户邮箱
  roles?: string[];  // RBAC角色
  iat?: number;      // 签发时间
  exp?: number;      // 过期时间
  iss?: string;      // 签发者
  jti?: string;      // JWT ID (用于撤销)
}

export interface AuthenticatedRequest extends Request {
  userId?: string;
  userEmail?: string;
  userRoles?: string[];
  tokenPayload?: TokenPayload;
}

// ==================== Token 管理存储 ====================

/** 已撤销的 JWT (jti -> revokedAt) — 生产环境应使用 Redis */
const revokedTokens = new Map<string, number>();

/** 刷新令牌存储 (refreshToken -> { userId, email, expiresAt }) */
interface RefreshTokenEntry {
  userId: string;
  email: string;
  expiresAt: number;
}
const refreshTokenStore = new Map<string, RefreshTokenEntry>();

// ==================== JWT 编解码（简化实现）====================

/**
 * Base64 URL-safe 编码
 */
function base64UrlEncode(data: Buffer): string {
  return data.toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

/**
 * Base64 URL-safe 解码
 */
function base64UrlDecode(str: string): Buffer {
  str = str.replace(/-/g, '+').replace(/_/g, '/');
  while (str.length % 4) str += '=';
  return Buffer.from(str, 'base64');
}

/**
 * HMAC-SHA256 签名
 */
function sign(input: string): string {
  return crypto.createHmac('sha256', JWT_SECRET).update(input).digest('base64');
}

/**
 * 签发访问令牌 (JWT)
 */
export function signAccessToken(payload: Omit<TokenPayload, 'iat' | 'exp' | 'iss' | 'jti'>): string {
  const now = Math.floor(Date.now() / 1000);
  const jti = crypto.randomBytes(16).toString('hex');

  const fullPayload: TokenPayload = {
    ...payload,
    iat: now,
    exp: now + Math.floor(ACCESS_TOKEN_EXPIRY / 1000),
    iss: ISSUER,
    jti,
  };

  const header = base64UrlEncode(Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })));
  const body = base64UrlEncode(Buffer.from(JSON.stringify(fullPayload)));
  const signature = base64UrlEncode(Buffer.from(sign(`${header}.${body}`)));

  return `${header}.${body}.${signature}`;
}

/**
 * 验证并解码访问令牌
 * 返回 null 表示无效或已过期
 */
export function verifyAccessToken(token: string): TokenPayload | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;

    const [headerB64, bodyB64, sigB64] = parts;

    // 验证签名
    const expectedSig = base64UrlEncode(Buffer.from(sign(`${headerB64}.${bodyB64}`)));
    if (sigB64 !== expectedSig) return null;

    // 解码 payload
    const payload: TokenPayload = JSON.parse(base64UrlDecode(bodyB64).toString('utf8'));

    // 检查过期
    const now = Math.floor(Date.now() / 1000);
    if (payload.exp && payload.exp < now) return null;

    // 检查是否已撤销
    if (payload.jti && revokedTokens.has(payload.jti)) return null;

    // 验证签发者
    if (payload.iss !== ISSUER) return null;

    return payload;
  } catch {
    return null;
  }
}

/**
 * 签发刷新令牌
 */
export function generateRefreshToken(userId: string, email: string): string {
  const token = crypto.randomBytes(32).toString('hex');
  refreshTokenStore.set(token, {
    userId,
    email,
    expiresAt: Date.now() + REFRESH_TOKEN_EXPIRY,
  });
  return token;
}

/**
 * 验证并消费刷新令牌
 * 返回新的一组 token (access + refresh)
 */
export function consumeRefreshToken(token: string): { accessToken: string; refreshToken: string; userId: string; email: string } | null {
  const entry = refreshTokenStore.get(token);
  if (!entry) return null;

  // 检查过期
  if (Date.now() > entry.expiresAt) {
    refreshTokenStore.delete(token);
    return null;
  }

  // 消费旧token，签发新token对
  refreshTokenStore.delete(token);

  const accessToken = signAccessToken({ sub: entry.userId, email: entry.email });
  const newRefreshToken = generateRefreshToken(entry.userId, entry.email);

  return {
    accessToken,
    refreshToken: newRefreshToken,
    userId: entry.userId,
    email: entry.email,
  };
}

/**
 * 撤销 JWT (通过 jti)
 */
export function revokeToken(jti: string): void {
  revokedTokens.set(jti, Date.now());

  // 清理过期条目（简单实现，仅在撤销时触发）
  const now = Date.now();
  for (const [key, time] of revokedTokens) {
    if (now - time > ACCESS_TOKEN_EXPIRY * 2) {
      revokedTokens.delete(key);
    }
  }
}

/**
 * 撤销用户的所有刷新令牌（强制重新登录）
 */
export function revokeAllUserTokens(userId: string): number {
  let count = 0;
  for (const [token, entry] of refreshTokenStore) {
    if (entry.userId === userId) {
      refreshTokenStore.delete(token);
      count++;
    }
  }
  return count;
}

// ==================== 清理过期刷新令牌 ====================

setInterval(() => {
  const now = Date.now();
  for (const [token, entry] of refreshTokenStore) {
    if (now > entry.expiresAt) {
      refreshTokenStore.delete(token);
    }
  }
}, 60000); // 每分钟清理

// ==================== 中间件 ====================

/**
 * JWT 认证中间件
 * 从 Authorization header 提取并验证 Bearer token
 */
export function authMiddleware(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    res.status(401).json({
      success: false,
      error: '未提供认证令牌',
      code: 'UNAUTHORIZED',
      timestamp: new Date().toISOString(),
    });
    return;
  }

  const parts = authHeader.split(' ');
  if (parts.length !== 2 || parts[0] !== 'Bearer') {
    res.status(401).json({
      success: false,
      error: '认证格式错误，请使用 Bearer token',
      code: 'UNAUTHORIZED',
      timestamp: new Date().toISOString(),
    });
    return;
  }

  const token = parts[1];
  const payload = verifyAccessToken(token);
  if (!payload) {
    res.status(401).json({
      success: false,
      error: '令牌无效或已过期',
      code: 'TOKEN_EXPIRED',
      timestamp: new Date().toISOString(),
    });
    return;
  }

  (req as AuthenticatedRequest).userId = payload.sub;
  (req as AuthenticatedRequest).userEmail = payload.email;
  (req as AuthenticatedRequest).userRoles = payload.roles;
  (req as AuthenticatedRequest).tokenPayload = payload;

  next();
}

/**
 * 可选认证中间件 — 有 token 则解析，无 token 也放行
 * 用于公开读端点（如股票列表），有认证则返回个性化数据
 */
export function optionalAuthMiddleware(req: Request, _res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  if (authHeader) {
    const parts = authHeader.split(' ');
    if (parts.length === 2 && parts[0] === 'Bearer') {
      const payload = verifyAccessToken(parts[1]);
      if (payload) {
        (req as AuthenticatedRequest).userId = payload.sub;
        (req as AuthenticatedRequest).userEmail = payload.email;
        (req as AuthenticatedRequest).userRoles = payload.roles;
        (req as AuthenticatedRequest).tokenPayload = payload;
      }
    }
  }
  next();
}

/**
 * RBAC 角色检查中间件工厂
 * @param allowedRoles - 允许访问的角色列表
 */
export function requireRole(...allowedRoles: string[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const aReq = req as AuthenticatedRequest;
    if (!aReq.userRoles || aReq.userRoles.length === 0) {
      res.status(403).json({
        success: false,
        error: '权限不足',
        code: 'FORBIDDEN',
        timestamp: new Date().toISOString(),
      });
      return;
    }

    const hasRole = aReq.userRoles.some(role => allowedRoles.includes(role));
    if (!hasRole) {
      res.status(403).json({
        success: false,
        error: `需要角色: ${allowedRoles.join(', ')}`,
        code: 'FORBIDDEN',
        timestamp: new Date().toISOString(),
      });
      return;
    }

    next();
  };
}

// ==================== Token 刷新端点处理函数 ====================

/**
 * POST /api/auth/refresh
 * 使用刷新令牌获取新的访问令牌
 */
export function handleTokenRefresh(req: Request, res: Response): void {
  const { refreshToken } = req.body;

  if (!refreshToken || typeof refreshToken !== 'string') {
    res.status(400).json({
      success: false,
      error: '缺少 refreshToken 参数',
      code: 'VALIDATION_ERROR',
      timestamp: new Date().toISOString(),
    });
    return;
  }

  const result = consumeRefreshToken(refreshToken);
  if (!result) {
    res.status(401).json({
      success: false,
      error: '刷新令牌无效或已过期，请重新登录',
      code: 'REFRESH_TOKEN_INVALID',
      timestamp: new Date().toISOString(),
    });
    return;
  }

  log.info('Token refreshed', { userId: result.userId });

  res.json({
    success: true,
    data: {
      accessToken: result.accessToken,
      refreshToken: result.refreshToken,
      expiresIn: Math.floor(ACCESS_TOKEN_EXPIRY / 1000),
    },
    timestamp: new Date().toISOString(),
  });
}

/**
 * POST /api/auth/logout
 * 撤销当前访问令牌
 */
export function handleLogout(req: Request, res: Response): void {
  const aReq = req as AuthenticatedRequest;
  if (aReq.tokenPayload?.jti) {
    revokeToken(aReq.tokenPayload.jti);
  }

  res.json({
    success: true,
    message: '已登出',
    timestamp: new Date().toISOString(),
  });
}

// ==================== 清理导出 ====================

export function cleanup(): void {
  revokedTokens.clear();
  refreshTokenStore.clear();
}
