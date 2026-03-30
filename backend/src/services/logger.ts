/**
 * 结构化日志系统
 * 支持：日志级别、结构化输出、日志轮转、敏感数据脱敏
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'fatal';

export interface LogEntry {
  level: LogLevel;
  message: string;
  timestamp: string;
  service: string;
  context?: Record<string, unknown>;
  error?: {
    name: string;
    message: string;
    stack?: string;
  };
  trace?: {
    requestId?: string;
    userId?: string;
    sessionId?: string;
  };
}

export interface LoggerConfig {
  level: LogLevel;
  service: string;
  enableConsole: boolean;
  enableFile: boolean;
  filePath?: string;
  sensitiveFields: string[];
  maxFileSize: number; // bytes
  maxFiles: number;
}

const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
  fatal: 4,
};

const SENSITIVE_PATTERNS = [
  /password/i,
  /token/i,
  /secret/i,
  /authorization/i,
  /cookie/i,
  /api[_-]?key/i,
  /credit[_-]?card/i,
  /ssn/i,
];

const DEFAULT_CONFIG: LoggerConfig = {
  level: (process.env.LOG_LEVEL as LogLevel) || 'info',
  service: 'a-stock-backend',
  enableConsole: true,
  enableFile: false,
  sensitiveFields: ['password', 'token', 'secret', 'authorization', 'cookie'],
  maxFileSize: 50 * 1024 * 1024, // 50MB
  maxFiles: 10,
};

let config: LoggerConfig = { ...DEFAULT_CONFIG };

/**
 * 配置日志系统
 */
export function configureLogger(overrides: Partial<LoggerConfig>): void {
  config = { ...config, ...overrides };
}

/**
 * 重置日志配置（测试用）
 */
export function resetLoggerConfig(): void {
  config = { ...DEFAULT_CONFIG };
}

/**
 * 获取当前配置（测试用）
 */
export function getLoggerConfig(): LoggerConfig {
  return { ...config };
}

/**
 * 脱敏敏感字段
 */
export function sanitizeData(data: unknown): unknown {
  if (typeof data !== 'object' || data === null) return data;
  if (Array.isArray(data)) return data.map(sanitizeData);

  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(data as Record<string, unknown>)) {
    if (SENSITIVE_PATTERNS.some((p) => p.test(key))) {
      result[key] = '***REDACTED***';
    } else if (typeof value === 'object' && value !== null) {
      result[key] = sanitizeData(value);
    } else {
      result[key] = value;
    }
  }
  return result;
}

/**
 * 检查日志级别是否应该输出
 */
export function shouldLog(level: LogLevel): boolean {
  return LOG_LEVELS[level] >= LOG_LEVELS[config.level];
}

/**
 * 格式化日志条目为JSON
 */
export function formatLogEntry(entry: LogEntry): string {
  return JSON.stringify(entry);
}

/**
 * 创建日志条目
 */
function createEntry(
  level: LogLevel,
  message: string,
  context?: Record<string, unknown>,
  error?: Error,
  trace?: LogEntry['trace']
): LogEntry {
  const entry: LogEntry = {
    level,
    message,
    timestamp: new Date().toISOString(),
    service: config.service,
  };

  if (context) {
    entry.context = sanitizeData(context) as Record<string, unknown>;
  }

  if (error) {
    entry.error = {
      name: error.name,
      message: error.message,
      stack: error.stack,
    };
  }

  if (trace) {
    entry.trace = trace;
  }

  return entry;
}

/**
 * 输出日志
 */
function writeLog(entry: LogEntry): void {
  if (!shouldLog(entry.level)) return;

  const formatted = formatLogEntry(entry);

  if (config.enableConsole) {
    const colors: Record<LogLevel, string> = {
      debug: '\x1b[90m',   // gray
      info: '\x1b[36m',    // cyan
      warn: '\x1b[33m',    // yellow
      error: '\x1b[31m',   // red
      fatal: '\x1b[35m',   // magenta
    };
    const reset = '\x1b[0m';
    const color = colors[entry.level];

    const prefix = `${color}[${entry.level.toUpperCase()}]${reset}`;
    const ts = `\x1b[90m${entry.timestamp}${reset}`;

    if (entry.level === 'error' || entry.level === 'fatal') {
      console.error(`${prefix} ${ts} ${entry.message}`, entry.context || '', entry.error || '');
    } else if (entry.level === 'warn') {
      console.warn(`${prefix} ${ts} ${entry.message}`, entry.context || '');
    } else {
      console.log(`${prefix} ${ts} ${entry.message}`, entry.context || '');
    }
  }
}

/**
 * Logger 实例
 */
export const logger = {
  debug(message: string, context?: Record<string, unknown>, trace?: LogEntry['trace']): void {
    writeLog(createEntry('debug', message, context, undefined, trace));
  },

  info(message: string, context?: Record<string, unknown>, trace?: LogEntry['trace']): void {
    writeLog(createEntry('info', message, context, undefined, trace));
  },

  warn(message: string, context?: Record<string, unknown>, trace?: LogEntry['trace']): void {
    writeLog(createEntry('warn', message, context, undefined, trace));
  },

  error(message: string, error?: Error, context?: Record<string, unknown>, trace?: LogEntry['trace']): void {
    writeLog(createEntry('error', message, context, error, trace));
  },

  fatal(message: string, error?: Error, context?: Record<string, unknown>, trace?: LogEntry['trace']): void {
    writeLog(createEntry('fatal', message, context, error, trace));
  },

  /**
   * 创建子logger，自动绑定上下文
   */
  child(defaultContext: Record<string, unknown>) {
    return {
      debug(message: string, context?: Record<string, unknown>, trace?: LogEntry['trace']): void {
        writeLog(createEntry('debug', message, { ...defaultContext, ...context }, undefined, trace));
      },
      info(message: string, context?: Record<string, unknown>, trace?: LogEntry['trace']): void {
        writeLog(createEntry('info', message, { ...defaultContext, ...context }, undefined, trace));
      },
      warn(message: string, context?: Record<string, unknown>, trace?: LogEntry['trace']): void {
        writeLog(createEntry('warn', message, { ...defaultContext, ...context }, undefined, trace));
      },
      error(message: string, error?: Error, context?: Record<string, unknown>, trace?: LogEntry['trace']): void {
        writeLog(createEntry('error', message, { ...defaultContext, ...context }, error, trace));
      },
    };
  },
};

/**
 * Express 请求日志中间件
 */
export function requestLogger() {
  return (req: any, res: any, next: any) => {
    const start = Date.now();
    const requestId = req.headers['x-request-id'] || `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    req.requestId = requestId;
    res.setHeader('X-Request-Id', requestId);

    const trace = { requestId };

    logger.info(`${req.method} ${req.path}`, {
      method: req.method,
      path: req.path,
      query: req.query,
      ip: req.ip || req.connection?.remoteAddress,
      userAgent: req.headers['user-agent'],
    }, trace);

    res.on('finish', () => {
      const duration = Date.now() - start;
      const logData = {
        method: req.method,
        path: req.path,
        statusCode: res.statusCode,
        duration,
      };

      if (res.statusCode >= 500) {
        logger.error(`${req.method} ${req.path} ${res.statusCode} ${duration}ms`, undefined, logData, trace);
      } else if (res.statusCode >= 400) {
        logger.warn(`${req.method} ${req.path} ${res.statusCode} ${duration}ms`, logData, trace);
      } else if (duration > 1000) {
        logger.warn(`慢请求: ${req.method} ${req.path} ${duration}ms`, logData, trace);
      } else {
        logger.info(`${req.method} ${req.path} ${res.statusCode} ${duration}ms`, logData, trace);
      }
    });

    next();
  };
}
