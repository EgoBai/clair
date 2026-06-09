/**
 * 错误追踪工具
 * 提供统一的错误捕获、上报和日志记录
 */

import { createLogger } from './logger';

const log = createLogger('ErrorTracker');

// ==================== 错误类型定义 ====================

export interface ErrorContext {
  userId?: string;
  requestId?: string;
  path?: string;
  method?: string;
  query?: Record<string, any>;
  body?: Record<string, any>;
  headers?: Record<string, string>;
  ip?: string;
  userAgent?: string;
  environment?: string;
}

export interface ErrorReport {
  id: string;
  timestamp: string;
  error: {
    name: string;
    message: string;
    stack?: string;
    code?: string;
  };
  context: ErrorContext;
  environment: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
}

// ==================== 错误追踪器 ====================

class ErrorTracker {
  private errors: ErrorReport[] = [];
  private maxErrors = 1000;
  private environment: string;

  constructor() {
    this.environment = process.env.NODE_ENV || 'development';
  }

  /**
   * 捕获并记录错误
   */
  captureError(
    error: Error | unknown,
    context: ErrorContext = {},
    severity: ErrorReport['severity'] = 'medium'
  ): string {
    const errorId = this.generateErrorId();
    
    const errorReport: ErrorReport = {
      id: errorId,
      timestamp: new Date().toISOString(),
      error: this.normalizeError(error),
      context: {
        ...context,
        environment: this.environment
      },
      environment: this.environment,
      severity
    };

    // 存储错误
    this.errors.push(errorReport);
    if (this.errors.length > this.maxErrors) {
      this.errors.shift();
    }

    // 记录日志
    this.logError(errorReport);

    // 生产环境可以发送到外部服务
    if (this.environment === 'production') {
      this.sendToExternalService(errorReport);
    }

    return errorId;
  }

  /**
   * 捕获异常并重新抛出
   */
  captureAndThrow(
    error: Error | unknown,
    context: ErrorContext = {},
    severity: ErrorReport['severity'] = 'medium'
  ): never {
    this.captureError(error, context, severity);
    throw error;
  }

  /**
   * 包装异步函数，自动捕获错误
   */
  wrapAsync<T extends (...args: any[]) => Promise<any>>(
    fn: T,
    context: ErrorContext = {}
  ): T {
    return (async (...args: any[]) => {
      try {
        return await fn(...args);
      } catch (error) {
        this.captureError(error, context);
        throw error;
      }
    }) as T;
  }

  /**
   * 获取错误统计
   */
  getStats(): {
    total: number;
    bySeverity: Record<string, number>;
    recent: ErrorReport[];
  } {
    const bySeverity: Record<string, number> = {};
    
    for (const error of this.errors) {
      bySeverity[error.severity] = (bySeverity[error.severity] || 0) + 1;
    }

    return {
      total: this.errors.length,
      bySeverity,
      recent: this.errors.slice(-10)
    };
  }

  /**
   * 获取特定错误
   */
  getError(id: string): ErrorReport | undefined {
    return this.errors.find(e => e.id === id);
  }

  /**
   * 清除错误记录
   */
  clearErrors(): void {
    this.errors = [];
  }

  // ==================== 内部方法 ====================

  private normalizeError(error: unknown): ErrorReport['error'] {
    if (error instanceof Error) {
      return {
        name: error.name,
        message: error.message,
        stack: error.stack,
        code: (error as any).code
      };
    }

    if (typeof error === 'string') {
      return {
        name: 'Error',
        message: error
      };
    }

    return {
      name: 'UnknownError',
      message: JSON.stringify(error)
    };
  }

  private generateErrorId(): string {
    return `err_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private logError(report: ErrorReport): void {
    const logMessage = `[${report.severity.toUpperCase()}] ${report.error.name}: ${report.error.message}`;
    
    switch (report.severity) {
      case 'critical':
      case 'high':
        log.error(logMessage, {
          id: report.id,
          context: report.context,
          stack: report.error.stack
        });
        break;
      case 'medium':
        log.warn(logMessage, { id: report.id });
        break;
      case 'low':
        log.info(logMessage, { id: report.id });
        break;
    }
  }

  private async sendToExternalService(report: ErrorReport): Promise<void> {
    // 这里可以集成 Sentry、LogRocket 等服务
    // 示例：
    // if (process.env.SENTRY_DSN) {
    //   Sentry.captureException(report.error, {
    //     extra: report.context,
    //     level: report.severity
    //   });
    // }
  }
}

// 单例导出
export const errorTracker = new ErrorTracker();

// ==================== Express 错误处理中间件 ====================

import { Request, Response, NextFunction } from 'express';

export function errorTrackingMiddleware(
  err: Error,
  req: Request,
  res: Response,
  next: NextFunction
): void {
  // 捕获错误
  const errorId = errorTracker.captureError(err, {
    path: req.path,
    method: req.method,
    query: req.query as Record<string, any>,
    body: req.body,
    ip: req.ip,
    userAgent: req.get('user-agent')
  }, 'high');

  // 返回错误响应
  res.status(500).json({
    success: false,
    error: '服务器内部错误',
    errorId,
    ...(process.env.NODE_ENV === 'development' ? { details: err.message } : {})
  });
}

// ==================== 未捕获异常处理 ====================

export function setupGlobalErrorHandlers(): void {
  process.on('uncaughtException', (error: Error) => {
    log.error('Uncaught Exception:', error);
    errorTracker.captureError(error, {}, 'critical');
    
    // 给进程一点时间处理日志，然后退出
    setTimeout(() => {
      process.exit(1);
    }, 1000);
  });

  process.on('unhandledRejection', (reason: unknown) => {
    log.error('Unhandled Rejection:', reason);
    errorTracker.captureError(
      reason instanceof Error ? reason : new Error(String(reason)),
      {},
      'high'
    );
  });
}

// ==================== 错误查询 API ====================

export function getErrorsEndpoint(req: Request, res: Response): void {
  const { severity, limit = 50 } = req.query;
  
  let errors = errorTracker.getStats().recent;
  
  if (severity) {
    errors = errors.filter(e => e.severity === severity);
  }
  
  const limitNum = parseInt(limit as string, 10);
  if (limitNum > 0) {
    errors = errors.slice(-limitNum);
  }

  res.json({
    success: true,
    data: {
      stats: errorTracker.getStats(),
      errors
    }
  });
}

export function getErrorByIdEndpoint(req: Request, res: Response): void {
  const { id } = req.params;
  const error = errorTracker.getError(id);
  
  if (!error) {
    res.status(404).json({
      success: false,
      error: '错误记录不存在'
    });
    return;
  }

  res.json({
    success: true,
    data: error
  });
}
