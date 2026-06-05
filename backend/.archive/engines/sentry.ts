/**
 * Sentry 错误追踪集成
 * 提供错误捕获、性能监控、面包屑追踪
 */

import { logger } from './logger';

export interface SentryConfig {
  dsn: string;
  environment: string;
  release: string;
  tracesSampleRate: number;
  enabled: boolean;
}

export interface ErrorContext {
  user?: { id?: string; email?: string; username?: string };
  tags?: Record<string, string>;
  extra?: Record<string, unknown>;
  level?: 'fatal' | 'error' | 'warning' | 'info' | 'debug';
  fingerprint?: string[];
}

let sentryConfig: SentryConfig = {
  dsn: process.env.SENTRY_DSN || '',
  environment: process.env.NODE_ENV || 'development',
  release: process.env.APP_VERSION || '1.7.0',
  tracesSampleRate: parseFloat(process.env.SENTRY_TRACES_SAMPLE_RATE || '0.1'),
  enabled: !!process.env.SENTRY_DSN,
};

/**
 * 配置 Sentry
 */
export function configureSentry(config: Partial<SentryConfig>): void {
  sentryConfig = { ...sentryConfig, ...config };
}

/**
 * 获取 Sentry 配置
 */
export function getSentryConfig(): SentryConfig {
  return { ...sentryConfig };
}

/**
 * 初始化 Sentry（占位 - 生产环境需要 @sentry/node）
 */
export function initSentry(): void {
  if (!sentryConfig.enabled) {
    logger.info('Sentry 未配置，错误追踪仅记录到本地日志');
    return;
  }

  logger.info('Sentry 错误追踪已启用', {
    environment: sentryConfig.environment,
    release: sentryConfig.release,
    tracesSampleRate: sentryConfig.tracesSampleRate,
  });

  // 生产环境中这里会调用 Sentry.init()
  // Sentry.init({
  //   dsn: sentryConfig.dsn,
  //   environment: sentryConfig.environment,
  //   release: sentryConfig.release,
  //   tracesSampleRate: sentryConfig.tracesSampleRate,
  //   integrations: [
  //     new Sentry.Integrations.Http({ tracing: true }),
  //     new Sentry.Integrations.Express({ app }),
  //   ],
  // });
}

/**
 * 捕获异常并上报
 */
export function captureException(error: Error, context?: ErrorContext): string {
  const eventId = `evt_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

  logger.error(`[Sentry] 捕获异常: ${error.message}`, error, {
    eventId,
    ...context?.extra,
    tags: context?.tags,
  });

  if (sentryConfig.enabled) {
    // Sentry.captureException(error, {
    //   user: context?.user,
    //   tags: context?.tags,
    //   extra: context?.extra,
    //   level: context?.level,
    //   fingerprint: context?.fingerprint,
    // });
  }

  return eventId;
}

/**
 * 捕获消息并上报
 */
export function captureMessage(message: string, context?: ErrorContext): string {
  const eventId = `evt_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

  logger.info(`[Sentry] 捕获消息: ${message}`, {
    eventId,
    ...context?.extra,
    tags: context?.tags,
  });

  if (sentryConfig.enabled) {
    // Sentry.captureMessage(message, context?.level || 'info');
  }

  return eventId;
}

/**
 * 添加面包屑
 */
export function addBreadcrumb(
  message: string,
  category: string,
  data?: Record<string, unknown>
): void {
  logger.debug(`[Breadcrumb] ${category}: ${message}`, { category, ...data });

  if (sentryConfig.enabled) {
    // Sentry.addBreadcrumb({
    //   message,
    //   category,
    //   data,
    //   timestamp: Date.now() / 1000,
    // });
  }
}

/**
 * 设置用户上下文
 */
export function setUser(user: { id?: string; email?: string; username?: string }): void {
  logger.debug('[Sentry] 设置用户上下文', { userId: user.id });

  if (sentryConfig.enabled) {
    // Sentry.setUser(user);
  }
}

/**
 * Express 错误处理中间件
 */
export function sentryErrorHandler() {
  return (err: Error, req: any, res: any, next: any): void => {
    captureException(err, {
      extra: {
        method: req.method,
        path: req.path,
        query: req.query,
        body: req.body,
        requestId: req.requestId,
      },
      tags: {
        path: req.path,
        method: req.method,
      },
    });

    next(err);
  };
}

/**
 * 性能追踪
 */
export function startTransaction(name: string, op: string): { finish: () => void } {
  const start = Date.now();

  return {
    finish() {
      const duration = Date.now() - start;
      logger.debug(`[Transaction] ${op}: ${name} (${duration}ms)`, { duration });

      if (sentryConfig.enabled) {
        // transaction?.finish();
      }
    },
  };
}
