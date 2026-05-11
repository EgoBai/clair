/**
 * 统一API响应格式工具
 * 提供标准化的成功/失败响应和异步路由包装器
 */

import { Request, Response, NextFunction } from 'express';

// ==================== 响应接口 ====================

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  details?: string;
  code?: string;
  timestamp: string;
}

export interface PaginatedData<T> {
  items: T[];
  pagination: {
    page: number;
    pageSize: number;
    totalCount: number;
    totalPages: number;
  };
}

export interface ApiError extends Error {
  statusCode?: number;
  code?: string;
}

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
} as const;

// ==================== 成功响应 ====================

export function sendSuccess<T>(res: Response, data: T, statusCode = 200): void {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.status(statusCode).json({
    success: true,
    data,
    timestamp: new Date().toISOString(),
  } as ApiResponse<T>);
}

export function sendCreated<T>(res: Response, data: T): void {
  sendSuccess(res, data, 201);
}

export function sendPaginated<T>(
  res: Response,
  items: T[],
  page: number,
  pageSize: number,
  totalCount: number
): void {
  sendSuccess(res, {
    items,
    pagination: {
      page,
      pageSize,
      totalCount,
      totalPages: Math.ceil(totalCount / pageSize),
    },
  } as PaginatedData<T>);
}

// ==================== 错误响应 ====================

export function sendError(
  res: Response,
  statusCode: number,
  error: string,
  code?: string,
  details?: string
): void {
  const body: ApiResponse = {
    success: false,
    error,
    timestamp: new Date().toISOString(),
  };
  if (code) body.code = code;
  if (details && process.env.NODE_ENV === 'development') {
    body.details = details;
  }
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.status(statusCode).json(body);
}

export function sendValidationError(res: Response, details: string): void {
  sendError(res, 400, '参数验证失败', ErrorCodes.VALIDATION_ERROR, details);
}

export function sendNotFound(res: Response, resource = '资源'): void {
  sendError(res, 404, `${resource}未找到`, ErrorCodes.NOT_FOUND);
}

export function sendConflict(res: Response, message: string): void {
  sendError(res, 409, message, ErrorCodes.CONFLICT);
}

export function sendUnauthorized(res: Response, message = '未授权访问'): void {
  sendError(res, 401, message, ErrorCodes.UNAUTHORIZED);
}

export function sendForbidden(res: Response, message = '禁止访问'): void {
  sendError(res, 403, message, ErrorCodes.FORBIDDEN);
}

export function sendInternalError(res: Response, details?: string): void {
  sendError(res, 500, '服务器内部错误', ErrorCodes.INTERNAL, details);
}

export function sendServiceUnavailable(res: Response, message = '服务暂不可用'): void {
  sendError(res, 503, message, ErrorCodes.SERVICE_UNAVAILABLE);
}

// ==================== 异步路由包装器 ====================

/**
 * 包装异步路由处理器，自动捕获异常
 * 用法: router.get('/path', asyncHandler(async (req, res) => { ... }))
 * 支持返回 Promise<void> 和普通返回值（兼容 queryCache 回调）
 */
export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => void | Promise<void>
) {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = fn(req, res, next);
      if (result instanceof Promise) {
        result.catch(next);
      }
    } catch (error) {
      next(error);
    }
  };
}
