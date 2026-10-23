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

/**
 * 分页成功响应。
 *
 * @param extra 附加字段（会展开进 `data`）。用于让调用方补 `dataSource`
 *              等诚实契约字段——分页端点同样可能供数，缺 dataSource 会让
 *              前端无法判定「这是真实数据还是空态」（qa 蜂群 P2-⑨）。
 *              不传时行为与改前完全一致（不破坏既有调用方）。
 *
 *   extra.dataSource 若存在，会**同时提升到响应顶层**：此前它只落在 data 内，
 *   而前端的诚实契约是读顶层 dataSource，顶层缺失会让该字段形同虚设。
 *   顶层与 data 内取自同一入参，结构上不可能矛盾（同 sendHonest 思路）。
 */
export function sendPaginated<T>(
  res: Response,
  items: T[],
  page: number,
  pageSize: number,
  totalCount: number,
  extra?: Record<string, unknown>
): void {
  const ds = extra?.dataSource;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.status(200).json({
    success: true,
    ...(ds !== undefined ? { dataSource: ds } : {}),
    data: {
      items,
      pagination: {
        page,
        pageSize,
        totalCount,
        totalPages: Math.ceil(totalCount / pageSize),
      },
      ...extra,
    } as PaginatedData<T>,
    timestamp: new Date().toISOString(),
  } as ApiResponse<PaginatedData<T>>);
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
