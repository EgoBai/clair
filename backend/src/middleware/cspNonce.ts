/**
 * CSP Nonce 中间件
 * 为每个请求生成唯一 nonce，用于 Content-Security-Policy script-src/style-src
 * 替代 'unsafe-inline'，符合 OWASP CSP 最佳实践
 */

import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';

export interface CspNonceConfig {
  /** nonce 字节长度（默认 16） */
  nonceLength?: number;
  /** 是否在响应头中暴露 nonce（供前端 SSR 使用） */
  exposeNonce?: boolean;
}

declare global {
  namespace Express {
    interface Request {
      cspNonce?: string;
    }
  }
}

/**
 * 生成加密安全的随机 nonce
 */
export function generateNonce(length: number = 16): string {
  return crypto.randomBytes(length).toString('base64');
}

/**
 * CSP Nonce 中间件
 * 为每个请求生成唯一 nonce，挂载到 req.cspNonce
 * 并设置带 nonce 的 CSP 头
 */
export function cspNonceMiddleware(config: CspNonceConfig = {}) {
  const { nonceLength = 16, exposeNonce = true } = config;

  return (req: Request, res: Response, next: NextFunction) => {
    const nonce = generateNonce(nonceLength);
    req.cspNonce = nonce;

    // 设置带 nonce 的 CSP
    const csp = [
      "default-src 'self'",
      `script-src 'self' 'nonce-${nonce}'`,
      `style-src 'self' 'nonce-${nonce}'`,
      "img-src 'self' data: https:",
      "font-src 'self' data:",
      "connect-src 'self' ws: wss:",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
    ].join('; ');

    res.setHeader('Content-Security-Policy', csp);

    // 将 nonce 暴露在响应头中，供 SSR 或前端读取
    if (exposeNonce) {
      res.setHeader('X-CSP-Nonce', nonce);
    }

    next();
  };
}

/**
 * 生成 CSP 元标签内容（用于 SSR 模板注入）
 */
export function getCspMetaContent(nonce: string): string {
  return [
    `script-src 'self' 'nonce-${nonce}'`,
    `style-src 'self' 'nonce-${nonce}'`,
  ].join('; ');
}

/**
 * 构建带 nonce 的 script 标签属性
 */
export function nonceAttr(nonce: string): string {
  return `nonce="${nonce}"`;
}
