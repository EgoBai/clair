/**
 * CSRF 防护中间件
 * 基于 Double Submit Cookie 模式
 * 参考 OWASP CSRF Prevention Cheat Sheet
 */

import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';

const CSRF_TOKEN_HEADER = 'x-csrf-token';
const CSRF_COOKIE_NAME = '__csrf_token';
const TOKEN_LENGTH = 32;

/**
 * 生成 CSRF Token
 */
export function generateCsrfToken(): string {
  return crypto.randomBytes(TOKEN_LENGTH).toString('hex');
}

/**
 * 创建 CSRF 中间件
 * 
 * 工作原理:
 * 1. GET 请求时，在 cookie 中设置 CSRF token
 * 2. 前端读取 cookie 中的 token，放入请求头 x-csrf-token
 * 3. POST/PUT/DELETE 时，验证 header 中的 token 与 cookie 中的一致
 */
export function csrfProtection(options: {
  cookieName?: string;
  headerName?: string;
  ignoreMethods?: string[];
  cookieOptions?: {
    httpOnly?: boolean;
    secure?: boolean;
    sameSite?: 'strict' | 'lax' | 'none';
    maxAge?: number;
  };
} = {}) {
  const {
    cookieName = CSRF_COOKIE_NAME,
    headerName = CSRF_TOKEN_HEADER,
    ignoreMethods = ['GET', 'HEAD', 'OPTIONS'],
    cookieOptions = {
      httpOnly: false, // 前端需要读取
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 24 * 60 * 60 * 1000, // 24小时
    },
  } = options;

  return (req: Request, res: Response, next: NextFunction) => {
    // 对于安全方法，跳过 CSRF 检查
    if (ignoreMethods.includes(req.method)) {
      // 仅在首次请求时设置 token
      if (!req.cookies?.[cookieName]) {
        const token = generateCsrfToken();
        res.cookie(cookieName, token, cookieOptions);
      }
      return next();
    }

    // 对于状态变更方法，验证 CSRF token
    const cookieToken = req.cookies?.[cookieName];
    const headerToken = req.headers[headerName] as string;

    if (!cookieToken || !headerToken) {
      return res.status(403).json({
        success: false,
        error: 'CSRF token 缺失',
        code: 'CSRF_TOKEN_MISSING',
      });
    }

    // 使用时间安全比较防止时序攻击
    if (!timingSafeEqual(cookieToken, headerToken)) {
      return res.status(403).json({
        success: false,
        error: 'CSRF token 无效',
        code: 'CSRF_TOKEN_INVALID',
      });
    }

    next();
  };
}

/**
 * 时间安全的字符串比较，防止时序攻击
 */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) {
    // 仍然做比较以保持恒定时间
    crypto.timingSafeEqual(
      Buffer.from(a.padEnd(64, '\0')),
      Buffer.from(b.padEnd(64, '\0'))
    );
    return false;
  }
  try {
    return crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
  } catch {
    return false;
  }
}

/**
 * CSRF Token 生成端点（供前端获取初始 token）
 */
export function csrfTokenEndpoint(req: Request, res: Response) {
  const token = generateCsrfToken();
  res.cookie(CSRF_COOKIE_NAME, token, {
    httpOnly: false,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 24 * 60 * 60 * 1000,
  });
  res.json({
    success: true,
    data: { token },
  });
}
