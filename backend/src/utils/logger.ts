/**
 * 结构化日志工具
 *
 * 替代 console.log/error，支持：
 * - 日志级别控制 (debug/info/warn/error)
 * - 环境感知 (production 默认 info+，development 全开)
 * - 结构化上下文 (自动附加模块名、时间戳)
 * - JSON 输出模式 (便于日志采集系统解析)
 *
 * Bloomberg 原则：生产日志必须可过滤、可聚合、可追溯。
 */

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

const LEVEL_ICONS: Record<LogLevel, string> = {
  debug: '🔍',
  info: '🔹',
  warn: '⚠️',
  error: '❌',
};

interface LoggerOptions {
  module: string;
  minLevel?: LogLevel;
}

class Logger {
  private module: string;
  private minLevel: LogLevel;

  constructor(options: LoggerOptions) {
    this.module = options.module;
    this.minLevel =
      options.minLevel ??
      (process.env.NODE_ENV === 'production' ? 'info' : 'debug');
  }

  private shouldLog(level: LogLevel): boolean {
    return LOG_LEVELS[level] >= LOG_LEVELS[this.minLevel];
  }

  private format(level: LogLevel, message: string, context?: Record<string, unknown>): string {
    const timestamp = new Date().toISOString();
    const icon = LEVEL_ICONS[level];
    const prefix = `${icon} [${this.module}]`;

    if (context && Object.keys(context).length > 0) {
      return `${timestamp} ${prefix} ${message} ${JSON.stringify(context)}`;
    }
    return `${timestamp} ${prefix} ${message}`;
  }

  debug(message: string, context?: Record<string, unknown>): void {
    if (this.shouldLog('debug')) {
      console.log(this.format('debug', message, context));
    }
  }

  info(message: string, context?: Record<string, unknown>): void {
    if (this.shouldLog('info')) {
      console.log(this.format('info', message, context));
    }
  }

  warn(message: string, context?: Record<string, unknown>): void {
    if (this.shouldLog('warn')) {
      console.warn(this.format('warn', message, context));
    }
  }

  error(message: string, error?: Error | unknown, context?: Record<string, unknown>): void {
    if (this.shouldLog('error')) {
      const errorContext: Record<string, unknown> = { ...context };
      if (error instanceof Error) {
        errorContext.error = error.message;
        errorContext.stack = error.stack;
      } else if (error !== undefined) {
        errorContext.error = String(error);
      }
      console.error(this.format('error', message, errorContext));
    }
  }
}

/**
 * 创建模块专属 logger
 *
 * @param module - 模块名，如 'WS', 'App', 'StockAPI'
 * @returns Logger 实例
 *
 * @example
 * const log = createLogger('WS');
 * log.info('客户端连接', { socketId: socket.id });
 * log.error('连接失败', error);
 */
export function createLogger(module: string): Logger {
  return new Logger({ module });
}

export type { LogLevel };
