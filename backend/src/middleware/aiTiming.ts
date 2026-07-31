/**
 * AI 接口耗时日志中间件（F12 / A-07 后端侧）
 *
 * 为 /api/ai/* 记录：端点、HTTP 方法、状态码、成败、耗时(ms)。
 * 流式接口（SSE）以响应结束时刻为完整响应时延，同时记录首字节时延。
 * 零外部依赖，只用进程内 logger。
 */

import { NextFunction, Request, Response } from 'express';
import { createLogger } from '../utils/logger';

const log = createLogger('AIPerf');

/** 超过该阈值视为慢响应，用 warn 级别输出 */
const SLOW_THRESHOLD_MS = 8000;

/**
 * 只对 AI 路由生效的耗时日志中间件
 */
export function aiTiming(req: Request, res: Response, next: NextFunction): void {
  if (!req.path.startsWith('/ai')) {
    next();
    return;
  }

  const start = Date.now();
  let firstByteAt: number | null = null;

  // 包装 write 以捕获首字节时延（流式接口有效）
  const originalWrite = res.write.bind(res);
  (res as Response).write = function patchedWrite(...args: unknown[]): boolean {
    if (firstByteAt === null) firstByteAt = Date.now();
    return (originalWrite as (...a: unknown[]) => boolean)(...args);
  } as Response['write'];

  res.on('finish', () => {
    const duration = Date.now() - start;
    const ok = res.statusCode < 400;
    const context: Record<string, unknown> = {
      endpoint: req.baseUrl + req.path,
      method: req.method,
      status: res.statusCode,
      ok,
      durationMs: duration,
    };
    if (firstByteAt !== null) {
      context.firstByteMs = firstByteAt - start;
    }

    if (!ok || duration > SLOW_THRESHOLD_MS) {
      log.warn('AI 接口响应', context);
    } else {
      log.info('AI 接口响应', context);
    }
  });

  next();
}

export default aiTiming;
