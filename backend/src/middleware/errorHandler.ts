/**
 * 统一错误处理中间件
 *
 * 提供：
 * - AppError 类（带 code, statusCode, detail）
 * - 统一错误响应格式 { code, message, detail, timestamp }
 * - 全局异常拦截中间件
 * - 404 处理
 * - 开发环境可选的详细错误信息
 */

import { Request, Response, NextFunction } from 'express';
import { createLogger } from '../utils/logger';

const log = createLogger('ErrorHandler');

// ==================== 错误码常量 ====================

export const ErrorCodes = {
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  NOT_FOUND: 'NOT_FOUND',
  UNAUTHORIZED: 'UNAUTHORIZED',
  FORBIDDEN: 'FORBIDDEN',
  CONFLICT: 'CONFLICT',
  RATE_LIMITED: 'RATE_LIMITED',
  INTERNAL: 'INTERNAL_ERROR',
  SERVICE_UNAVAILABLE: 'SERVICE_UNAVAILABLE',
  TIMEOUT: 'TIMEOUT',
  DATABASE_ERROR: 'DATABASE_ERROR',
  BAD_REQUEST: 'BAD_REQUEST',
  PAYLOAD_TOO_LARGE: 'PAYLOAD_TOO_LARGE',
  UNSUPPORTED_MEDIA: 'UNSUPPORTED_MEDIA',
} as const;

// ==================== 统一错误响应接口 ====================

export interface ErrorResponse {
  code: string;
  message: string;
  detail?: string;
  timestamp: string;
}

// ==================== AppError 类 ====================

export class AppError extends Error {
  public readonly statusCode: number;
  public readonly code: string;
  public readonly detail?: string;
  public readonly isOperational: boolean;

  constructor(
    statusCode: number,
    code: string,
    message: string,
    detail?: string,
    isOperational = true,
  ) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.detail = detail;
    this.isOperational = isOperational;
    this.name = 'AppError';
    Error.captureStackTrace(this, this.constructor);
  }
}

// ==================== 便捷工厂方法 ====================

export function createValidationError(detail: string): AppError {
  return new AppError(400, ErrorCodes.VALIDATION_ERROR, '参数验证失败', detail);
}

export function createNotFoundError(resource = '资源'): AppError {
  return new AppError(404, ErrorCodes.NOT_FOUND, `${resource}未找到`);
}

export function createConflictError(message: string): AppError {
  return new AppError(409, ErrorCodes.CONFLICT, message);
}

export function createUnauthorizedError(message = '未授权访问'): AppError {
  return new AppError(401, ErrorCodes.UNAUTHORIZED, message);
}

export function createForbiddenError(message = '禁止访问'): AppError {
  return new AppError(403, ErrorCodes.FORBIDDEN, message);
}

export function createRateLimitError(message = '请求过于频繁，请稍后重试'): AppError {
  return new AppError(429, ErrorCodes.RATE_LIMITED, message);
}

export function createInternalError(detail?: string): AppError {
  return new AppError(500, ErrorCodes.INTERNAL, '服务器内部错误', detail, false);
}

export function createServiceUnavailableError(message = '服务暂不可用'): AppError {
  return new AppError(503, ErrorCodes.SERVICE_UNAVAILABLE, message);
}

// ==================== 错误分类逻辑 ====================

interface ClassifiedError {
  statusCode: number;
  code: string;
  message: string;
  detail?: string;
}

function classifyUnknownError(err: Error): ClassifiedError {
  const msg = err.message.toLowerCase();

  if (msg.includes('timeout') || msg.includes('econnrefused') || msg.includes('econnreset')) {
    return { statusCode: 504, code: ErrorCodes.TIMEOUT, message: '请求超时或连接异常', detail: err.message };
  }
  if (msg.includes('not found') || msg.includes('does not exist')) {
    return { statusCode: 404, code: ErrorCodes.NOT_FOUND, message: '资源未找到', detail: err.message };
  }
  if (msg.includes('unauthorized') || msg.includes('invalid token') || msg.includes('jwt')) {
    return { statusCode: 401, code: ErrorCodes.UNAUTHORIZED, message: '未授权访问', detail: err.message };
  }
  if (msg.includes('forbidden') || msg.includes('permission')) {
    return { statusCode: 403, code: ErrorCodes.FORBIDDEN, message: '禁止访问', detail: err.message };
  }
  if (msg.includes('rate limit') || msg.includes('too many')) {
    return { statusCode: 429, code: ErrorCodes.RATE_LIMITED, message: '请求过于频繁', detail: err.message };
  }
  if (msg.includes('database') || msg.includes('connection') || msg.includes('knex') || msg.includes('pg')) {
    return { statusCode: 503, code: ErrorCodes.DATABASE_ERROR, message: '数据库服务异常', detail: err.message };
  }
  if (msg.includes('validation') || msg.includes('joi') || msg.includes('invalid')) {
    return { statusCode: 400, code: ErrorCodes.VALIDATION_ERROR, message: '请求参数无效', detail: err.message };
  }
  if (msg.includes('payload too large') || msg.includes('entity too large')) {
    return { statusCode: 413, code: ErrorCodes.PAYLOAD_TOO_LARGE, message: '请求体过大', detail: err.message };
  }

  return { statusCode: 500, code: ErrorCodes.INTERNAL, message: '服务器内部错误', detail: err.message };
}

// ==================== 异步路由包装器 ====================

/**
 * 包装异步路由处理器，自动传递异常到错误中间件
 */
export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<void>,
) {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

// ==================== 404 处理中间件 ====================

export function notFoundHandler(req: Request, _res: Response, next: NextFunction): void {
  next(new AppError(404, ErrorCodes.NOT_FOUND, `接口未找到: ${req.method} ${req.path}`, `Path: ${req.path}`));
}

// ==================== 全局错误处理中间件 ====================

export function globalErrorHandler(
  err: Error,
  req: Request,
  res: Response,
  _next: NextFunction,
): void {
  const isProduction = process.env.NODE_ENV === 'production';

  // 结构化日志：记录所有错误
  const requestInfo = {
    method: req.method,
    path: req.path,
    query: req.query,
    ip: req.ip,
    userAgent: req.get('user-agent') || 'unknown',
  };

  if (err instanceof AppError) {
    // 可预见的操作错误
    if (err.isOperational) {
      log.warn(`[${err.code}] ${err.message}`, {
        ...requestInfo,
        detail: err.detail,
        statusCode: err.statusCode,
      });
    } else {
      log.error(`[${err.code}] ${err.message}`, err, {
        ...requestInfo,
        detail: err.detail,
        statusCode: err.statusCode,
      });
    }

    const body: ErrorResponse = {
      code: err.code,
      message: err.message,
      timestamp: new Date().toISOString(),
    };

    if (!isProduction && err.detail) {
      body.detail = err.detail;
    }

    res.status(err.statusCode).json(body);
    return;
  }

  // 未预期的错误
  log.error('未捕获的服务器错误', err, requestInfo);

  const classified = classifyUnknownError(err);

  const body: ErrorResponse = {
    code: classified.code,
    message: classified.message,
    timestamp: new Date().toISOString(),
  };

  if (!isProduction) {
    body.detail = classified.detail;
  }

  res.status(classified.statusCode).json(body);
}
