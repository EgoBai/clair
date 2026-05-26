/**
 * 结构化请求日志中间件
 *
 * 替换 app.ts 中的内联日志逻辑，提供：
 * - JSON 格式结构化日志（可直接被日志采集系统解析）
 * - 请求追踪 ID (traceId)
 * - 自动分类日志级别 (按响应时间)
 * - 慢请求警告
 * - 敏感字段脱敏
 * - 可配置的跳过路径
 */

import { Request, Response, NextFunction } from 'express';
import { createLogger } from '../utils/logger';
import crypto from 'crypto';

const log = createLogger('HTTP');

// ==================== 配置 ====================

interface RequestLoggingOptions {
  /** 慢请求阈值（毫秒），超过此值记录 warn 级别 */
  slowThreshold: number;
  /** 一般请求阈值，超过此值记录 info 级别 */
  mediumThreshold: number;
  /** 跳过日志的路径前缀 */
  skipPaths: string[];
  /** 需要脱敏的请求头字段 */
  sensitiveHeaders: string[];
  /** 需要脱敏的查询参数 */
  sensitiveQueryParams: string[];
  /** 是否记录请求体（默认仅在 warn+ 级别记录） */
  logBody: boolean;
  /** 请求体最大记录长度 */
  maxBodyLength: number;
}

const DEFAULT_OPTIONS: RequestLoggingOptions = {
  slowThreshold: 1000,
  mediumThreshold: 500,
  skipPaths: ['/health', '/metrics'],
  sensitiveHeaders: ['authorization', 'cookie', 'x-csrf-token'],
  sensitiveQueryParams: ['token', 'password', 'secret', 'apiKey'],
  logBody: false,
  maxBodyLength: 500,
};

// ==================== 请求追踪 ID ====================

/**
 * 生成或提取请求追踪 ID
 * 优先使用客户端传入的 X-Trace-Id，否则自动生成
 */
function getTraceId(req: Request): string {
  const existing = req.headers['x-trace-id'] || req.headers['x-request-id'];
  if (existing) return Array.isArray(existing) ? existing[0] : existing;
  return crypto.randomUUID().slice(0, 8);
}

// ==================== 字段脱敏 ====================

function maskSensitiveValue(value: string): string {
  if (value.length <= 4) return '****';
  return value.slice(0, 2) + '****' + value.slice(-2);
}

function sanitizeHeaders(
  headers: Record<string, unknown>,
  sensitiveKeys: string[],
): Record<string, unknown> {
  const sanitized: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(headers)) {
    if (sensitiveKeys.includes(key.toLowerCase())) {
      sanitized[key] = maskSensitiveValue(String(value));
    } else {
      sanitized[key] = value;
    }
  }
  return sanitized;
}

function sanitizeQuery(
  query: Record<string, unknown>,
  sensitiveKeys: string[],
): Record<string, unknown> {
  const sanitized: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(query)) {
    if (sensitiveKeys.includes(key)) {
      sanitized[key] = maskSensitiveValue(String(value));
    } else {
      sanitized[key] = value;
    }
  }
  return sanitized;
}

// ==================== 结构化日志中间件 ====================

export function requestLogger(options: Partial<RequestLoggingOptions> = {}) {
  const opts: RequestLoggingOptions = { ...DEFAULT_OPTIONS, ...options };

  return (req: Request, res: Response, next: NextFunction): void => {
    // 跳过健康检查等路径
    if (opts.skipPaths.some(p => req.path.startsWith(p))) {
      next();
      return;
    }

    const start = Date.now();
    const traceId = getTraceId(req);

    // 将 traceId 注入请求对象，供后续处理使用
    req.traceId = traceId;

    // 设置响应头，方便客户端追踪
    res.setHeader('X-Trace-Id', traceId);

    res.on('finish', () => {
      const duration = Date.now() - start;
      const statusCode = res.statusCode;

      // 结构化日志上下文
      const logContext: Record<string, unknown> = {
        traceId,
        method: req.method,
        path: req.path,
        statusCode,
        duration,
        userAgent: req.get('user-agent') || '',
        ip: req.ip || req.socket.remoteAddress || '',
        contentLength: res.getHeader('content-length') || 0,
      };

      // 记录请求参数（GET 的 query）
      if (Object.keys(req.query).length > 0) {
        logContext.query = sanitizeQuery(req.query as Record<string, unknown>, opts.sensitiveQueryParams);
      }

      // 重要请求记录请求头（脱敏后）
      if (statusCode >= 400) {
        logContext.headers = sanitizeHeaders(
          req.headers as Record<string, unknown>,
          opts.sensitiveHeaders,
        );
      }

      // 错误时记录请求体摘要
      if (statusCode >= 500 && opts.logBody && req.body && typeof req.body === 'object') {
        const bodyStr = JSON.stringify(req.body);
        logContext.body = bodyStr.length > opts.maxBodyLength
          ? bodyStr.slice(0, opts.maxBodyLength) + '...'
          : bodyStr;
      }

      // 根据状态码和持续时间决定日志级别
      if (statusCode >= 500 || duration > opts.slowThreshold) {
        log.warn(`[${traceId}] ${req.method} ${req.path}`, logContext);
      } else if (statusCode >= 400 || duration > opts.mediumThreshold) {
        log.info(`[${traceId}] ${req.method} ${req.path}`, logContext);
      } else {
        log.debug(`[${traceId}] ${req.method} ${req.path}`, logContext);
      }
    });

    next();
  };
}
