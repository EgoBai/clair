/**
 * requestLogger.test.ts
 * 结构化请求日志中间件测试（影子测试迁移）
 *
 * 迁移说明（测试内自实现 → import 生产真源）：
 * - LogLevel 类型 → backend/src/utils/logger.ts:13（export 于 L107）。
 *   与测试原联合类型完全一致（debug/info/warn/error）。注意 backend/src/services/logger.ts:6
 *   另有一个含 fatal 的 LogLevel，故此处以 utils/logger 为准，fatal 由下方 shouldLog 用例覆盖。
 * - maskSensitiveData → sanitizeData：backend/src/services/logger.ts:92
 *   契约一致：递归对象/数组，键名命中敏感模式即整体替换。脱敏标记以生产为准。
 * - 新增 shouldLog / configureLogger / resetLoggerConfig：backend/src/services/logger.ts:112 / 71 / 78
 * - 新增 formatLogEntry：backend/src/services/logger.ts:119
 * - 新增 middleware/requestLogger.ts:99 requestLogger 中间件行为绑定：
 *   traceId 生成（L57 crypto.randomUUID().slice(0, 8)）、X-Trace-Id 响应头（L116）、
 *   skipPaths 默认值（L41）、按状态码/耗时分级（L156-162）、query/headers 脱敏（L136-144）、
 *   日志字段名与耗时单位（L123-132：traceId / duration(ms) / contentLength）。
 * - 新增 services/logger.ts:239 requestLogger 中间件绑定：
 *   X-Request-Id（L245）与 req_ 前缀请求 id 生成（L242）。
 *
 * 旧断言订正（旧口径 → 生产真值）：
 * - 脱敏标记 '***MASKED***' → '***REDACTED***'（services/logger.ts:99）。
 * - 请求 id：旧断言 req_ + 20 位随机字符 → 生产 middleware/requestLogger.ts:57 为
 *   crypto.randomUUID().slice(0, 8)，即 8 位小写十六进制、无 req_ 前缀；
 *   旧断言 startsWith('req_') / length > 10 改绑到真正使用 req_ 前缀的
 *   services/logger.ts:242（同文件 requestLogger 中间件）。
 * - 字段名 durationMs → 生产日志字段为 duration（middleware/requestLogger.ts:127），单位 ms；
 *   请求追踪字段为 traceId（L124），不是 requestId。
 * - 旧注释称「apiKey 含 key 故被脱敏」，但旧内联敏感词表无 key，实际不会脱敏（旧断言未校验）；
 *   生产 SENSITIVE_PATTERNS 含 /api[_-]?key/i（services/logger.ts:51），已补断言。
 *
 * 保留内联（生产无同契约导出，逐条说明候选为何不符）：
 * - StructuredLogger 的实例级 minLevel/getLogs/clear/logRequest 元数据收集：
 *   生产 utils/logger.ts 的 Logger 类未导出（仅 createLogger，L103），且只写 console、无内存缓冲；
 *   services/logger.ts 的 level 是模块级全局（configureLogger），不是实例级。
 * - formatDuration：生产不格式化耗时，日志里直接记录数值 duration(ms)（middleware/requestLogger.ts:127）；
 *   候选 frontend/src/utils/formatters.ts:115 的 formatDuration 是中文展示口径（'0秒'/'2天5小时'），
 *   语义与日志字段不同，且跨包绑定会把日志用例变成 UI 文案用例，故不绑。
 * - categorizeStatus：生产无导出的状态码分类器，分级逻辑内联在
 *   middleware/requestLogger.ts:156-162（按 statusCode 与 slowThreshold/mediumThreshold 分支）；
 *   其真实行为已用中间件用例绑定（2xx→debug / 4xx→info / 5xx→warn / 慢请求→warn）。
 * - sanitizeForOutput（IP 末段脱敏）：生产无对应导出。middleware/requestLogger.ts:62
 *   maskSensitiveValue 为模块私有函数，且中间件 L130 直接记录原始 ip，不做 IP 脱敏。
 *
 * 非确定性清理：
 * - StructuredLogger 原先直接读取系统时钟取时间戳、用随机数生成 id；时间戳改为可注入固定时钟
 *   （默认常量），id 生成整体改绑生产中间件，测试内不再读取墙钟、也不再生成随机 id。
 */

import { describe, it, expect, beforeEach, afterEach, vi, type MockInstance } from 'vitest';
import type { LogLevel } from '../utils/logger';
import {
  sanitizeData,
  shouldLog,
  configureLogger,
  resetLoggerConfig,
  formatLogEntry,
  requestLogger as legacyRequestLogger,
  type LogEntry as ServiceLogEntry,
} from '../services/logger';
import { requestLogger as httpRequestLogger } from '../middleware/requestLogger';

interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  requestId?: string;
  method?: string;
  path?: string;
  statusCode?: number;
  durationMs?: number;
  ip?: string;
  userAgent?: string;
  error?: string;
  meta?: Record<string, unknown>;
}

// 说明：这是「内存采集型」logger 的测试替身，生产没有等价类可绑（见文件头「保留内联」）。
// 时间戳使用可注入固定时钟，避免测试读墙钟。
class StructuredLogger {
  private logs: LogEntry[] = [];
  private minLevel: LogLevel = 'debug';
  private includeTimestamps: boolean = true;
  private readonly clock: () => string;

  private readonly levelOrder: Record<LogLevel, number> = {
    debug: 0,
    info: 1,
    warn: 2,
    error: 3,
  };

  constructor(config?: { minLevel?: LogLevel; includeTimestamps?: boolean; clock?: () => string }) {
    if (config?.minLevel) this.minLevel = config.minLevel;
    if (config?.includeTimestamps !== undefined) this.includeTimestamps = config.includeTimestamps;
    this.clock = config?.clock ?? (() => '2026-01-01T00:00:00.000Z');
  }

  setMinLevel(level: LogLevel): void {
    this.minLevel = level;
  }

  getLogs(): LogEntry[] {
    return [...this.logs];
  }

  clear(): void {
    this.logs = [];
  }

  private shouldLog(level: LogLevel): boolean {
    return this.levelOrder[level] >= this.levelOrder[this.minLevel];
  }

  private createEntry(level: LogLevel, message: string, meta?: Record<string, unknown>): LogEntry {
    const entry: LogEntry = {
      timestamp: this.includeTimestamps ? this.clock() : '',
      level,
      message,
      ...(meta || {}),
    };
    return entry;
  }

  logRequest(level: LogLevel, message: string, reqMeta: {
    requestId?: string;
    method?: string;
    path?: string;
    statusCode?: number;
    durationMs?: number;
    ip?: string;
    userAgent?: string;
  }): void {
    if (!this.shouldLog(level)) return;
    this.logs.push(this.createEntry(level, message, reqMeta as unknown as Record<string, unknown>));
  }

  logError(error: Error, reqMeta?: {
    requestId?: string;
    method?: string;
    path?: string;
  }): void {
    const entry = this.createEntry('error', error.message, {
      error: error.name,
      stack: error.stack,
      ...(reqMeta || {}),
    } as unknown as Record<string, unknown>);
    this.logs.push(entry);
  }

  info(message: string, meta?: Record<string, unknown>): void {
    if (!this.shouldLog('info')) return;
    this.logs.push(this.createEntry('info', message, meta));
  }

  warn(message: string, meta?: Record<string, unknown>): void {
    if (!this.shouldLog('warn')) return;
    this.logs.push(this.createEntry('warn', message, meta));
  }

  error(message: string, meta?: Record<string, unknown>): void {
    if (!this.shouldLog('error')) return;
    this.logs.push(this.createEntry('error', message, meta));
  }

  debug(message: string, meta?: Record<string, unknown>): void {
    if (!this.shouldLog('debug')) return;
    this.logs.push(this.createEntry('debug', message, meta));
  }

  // Request duration formatting（生产无对应实现，见文件头）
  formatDuration(ms: number): string {
    if (ms < 1) return '<1ms';
    if (ms < 1000) return Math.round(ms) + 'ms';
    return (ms / 1000).toFixed(2) + 's';
  }

  // Status code categorization（生产内联在 middleware/requestLogger.ts:156-162，见文件头）
  categorizeStatus(statusCode: number): 'success' | 'redirect' | 'client_error' | 'server_error' {
    if (statusCode >= 200 && statusCode < 300) return 'success';
    if (statusCode >= 300 && statusCode < 400) return 'redirect';
    if (statusCode >= 400 && statusCode < 500) return 'client_error';
    return 'server_error';
  }

  // Log sanitization for output（生产无 IP 脱敏，见文件头）
  sanitizeForOutput(entry: LogEntry): Record<string, unknown> {
    const output: Record<string, unknown> = { ...entry };
    if (output.ip) {
      // Mask last octet of IP
      const ip = output.ip as string;
      if (ip.includes('.')) {
        output.ip = ip.replace(/\.\d+$/, '.xxx');
      }
    }
    return output;
  }
}

// ==================== 生产中间件测试替身 ====================

function createFakeRequest(overrides: Record<string, unknown> = {}): any {
  const req: any = {
    headers: {},
    method: 'GET',
    path: '/api/stocks',
    query: {},
    ip: '192.168.1.100',
    socket: { remoteAddress: '10.0.0.1' },
    get(name: string) {
      const value = req.headers[name.toLowerCase()];
      return Array.isArray(value) ? value[0] : value;
    },
    ...overrides,
  };
  return req;
}

function createFakeResponse(): any {
  const listeners: Record<string, Array<() => void>> = {};
  const res: any = {
    statusCode: 200,
    headers: {} as Record<string, string>,
    on(event: string, cb: () => void) {
      (listeners[event] = listeners[event] || []).push(cb);
      return res;
    },
    setHeader(name: string, value: string) {
      res.headers[name.toLowerCase()] = value;
      return res;
    },
    getHeader(name: string) {
      return res.headers[name.toLowerCase()];
    },
    emit(event: string) {
      (listeners[event] || []).forEach(cb => cb());
    },
  };
  return res;
}

function parseLogContext(output: unknown): Record<string, any> {
  const text = String(output);
  const start = text.indexOf('{');
  if (start < 0) throw new Error('日志输出中未找到 JSON 上下文: ' + text);
  return JSON.parse(text.slice(start));
}

describe('Structured Request Logger', () => {
  let logger: StructuredLogger;

  beforeEach(() => {
    logger = new StructuredLogger();
  });

  afterEach(() => {
    logger.clear();
  });

  // --- Basic Logging ---

  it('should log a request entry', () => {
    logger.logRequest('info', 'GET /api/stocks', {
      method: 'GET',
      path: '/api/stocks',
      statusCode: 200,
      durationMs: 42,
    });

    const logs = logger.getLogs();
    expect(logs).toHaveLength(1);
    expect(logs[0].level).toBe('info');
    expect(logs[0].method).toBe('GET');
    expect(logs[0].statusCode).toBe(200);
  });

  it('should log multiple request entries', () => {
    logger.logRequest('info', 'GET /api/stocks', { method: 'GET', path: '/api/stocks', statusCode: 200, durationMs: 10 });
    logger.logRequest('info', 'POST /api/watchlist', { method: 'POST', path: '/api/watchlist', statusCode: 201, durationMs: 25 });
    logger.logRequest('warn', 'GET /api/stocks', { method: 'GET', path: '/api/stocks', statusCode: 404, durationMs: 5 });

    expect(logger.getLogs()).toHaveLength(3);
  });

  it('should include request ID in log entries', () => {
    logger.logRequest('info', 'Request', { requestId: 'req_abc123', method: 'GET', path: '/health' });

    const logs = logger.getLogs();
    expect(logs[0].requestId).toBe('req_abc123');
  });

  it('should include timestamp in log entries by default', () => {
    logger.logRequest('info', 'test', { method: 'GET', path: '/' });
    expect(logger.getLogs()[0].timestamp).toBeTruthy();
    expect(() => new Date(logger.getLogs()[0].timestamp)).not.toThrow();
  });

  // --- Log Level Filtering ---

  it('should respect minLevel setting', () => {
    const verboseLogger = new StructuredLogger({ minLevel: 'warn' });
    verboseLogger.logRequest('info', 'should not appear', { method: 'GET', path: '/' });
    verboseLogger.logRequest('warn', 'should appear', { method: 'GET', path: '/' });
    verboseLogger.logRequest('error', 'should appear too', { method: 'GET', path: '/' });

    expect(verboseLogger.getLogs()).toHaveLength(2);
    expect(verboseLogger.getLogs()[0].level).toBe('warn');
    expect(verboseLogger.getLogs()[1].level).toBe('error');
  });

  it('should allow all levels when minLevel is debug', () => {
    const verboseLogger = new StructuredLogger({ minLevel: 'debug' });
    verboseLogger.debug('debug msg');
    verboseLogger.info('info msg');
    verboseLogger.warn('warn msg');
    verboseLogger.error('error msg');

    expect(verboseLogger.getLogs()).toHaveLength(4);
  });

  it('should filter debug level when minLevel is info', () => {
    const verboseLogger = new StructuredLogger({ minLevel: 'info' });
    verboseLogger.debug('should not appear');
    verboseLogger.info('should appear');

    expect(verboseLogger.getLogs()).toHaveLength(1);
    expect(verboseLogger.getLogs()[0].level).toBe('info');
  });

  // --- Error Logging ---

  it('should log errors with stack traces', () => {
    const error = new Error('Database connection failed');
    logger.logError(error, { requestId: 'req_err_1', method: 'GET', path: '/api/stocks' });

    const logs = logger.getLogs();
    expect(logs).toHaveLength(1);
    expect(logs[0].level).toBe('error');
    expect(logs[0].message).toBe('Database connection failed');
    expect(logs[0].error).toBe('Error');
    expect(logs[0].requestId).toBe('req_err_1');
  });

  it('should log errors without request meta', () => {
    const error = new Error('Unknown error');
    logger.logError(error);

    expect(logger.getLogs()).toHaveLength(1);
    expect(logger.getLogs()[0].message).toBe('Unknown error');
  });

  it('should log different error types', () => {
    const errors = [
      new TypeError('Type error'),
      new RangeError('Range error'),
      new SyntaxError('Syntax error'),
    ];

    for (const err of errors) {
      logger.logError(err);
    }

    expect(logger.getLogs()).toHaveLength(3);
    expect(logger.getLogs().map(l => l.error)).toContain('TypeError');
    expect(logger.getLogs().map(l => l.error)).toContain('RangeError');
  });

  // --- Duration Formatting ---

  it('should format durations under 1ms', () => {
    expect(logger.formatDuration(0.5)).toBe('<1ms');
  });

  it('should format durations in ms', () => {
    expect(logger.formatDuration(42)).toBe('42ms');
    expect(logger.formatDuration(999)).toBe('999ms');
  });

  it('should format durations over 1s', () => {
    expect(logger.formatDuration(1500)).toBe('1.50s');
    expect(logger.formatDuration(3000)).toBe('3.00s');
  });

  it('should format exact durations', () => {
    expect(logger.formatDuration(0)).toBe('<1ms');
    expect(logger.formatDuration(1000)).toBe('1.00s');
  });

  // --- Status Code Categorization ---

  it('should categorize 2xx as success', () => {
    expect(logger.categorizeStatus(200)).toBe('success');
    expect(logger.categorizeStatus(201)).toBe('success');
    expect(logger.categorizeStatus(204)).toBe('success');
  });

  it('should categorize 3xx as redirect', () => {
    expect(logger.categorizeStatus(301)).toBe('redirect');
    expect(logger.categorizeStatus(302)).toBe('redirect');
    expect(logger.categorizeStatus(304)).toBe('redirect');
  });

  it('should categorize 4xx as client error', () => {
    expect(logger.categorizeStatus(400)).toBe('client_error');
    expect(logger.categorizeStatus(401)).toBe('client_error');
    expect(logger.categorizeStatus(403)).toBe('client_error');
    expect(logger.categorizeStatus(404)).toBe('client_error');
    expect(logger.categorizeStatus(429)).toBe('client_error');
  });

  it('should categorize 5xx as server error', () => {
    expect(logger.categorizeStatus(500)).toBe('server_error');
    expect(logger.categorizeStatus(502)).toBe('server_error');
    expect(logger.categorizeStatus(503)).toBe('server_error');
  });

  // --- Info/Warn/Error/Debug Methods ---

  it('should log info messages', () => {
    logger.info('Server started', { port: 3001, env: 'development' });
    const logs = logger.getLogs();
    expect(logs[0].level).toBe('info');
    expect(logs[0].message).toBe('Server started');
  });

  it('should log warn messages', () => {
    logger.warn('Rate limit approaching', { current: 95, limit: 100 });
    const logs = logger.getLogs();
    expect(logs[0].level).toBe('warn');
  });

  it('should log error messages', () => {
    logger.error('Uncaught exception', { module: 'payment' });
    const logs = logger.getLogs();
    expect(logs[0].level).toBe('error');
  });

  it('should log debug messages', () => {
    logger.debug('Verbose debugging info', { details: 'something' });
    const logs = logger.getLogs();
    expect(logs[0].level).toBe('debug');
  });

  // --- Sanitize for Output ---

  it('should mask IP addresses for output', () => {
    const entry: LogEntry = {
      timestamp: '2026-01-01T00:00:00.000Z',
      level: 'info',
      message: 'Request',
      ip: '192.168.1.100',
    };
    const sanitized = logger.sanitizeForOutput(entry);
    expect(sanitized.ip).toBe('192.168.1.xxx');
  });

  it('should pass through entries without IP', () => {
    const entry: LogEntry = { timestamp: '', level: 'info', message: 'No IP' };
    const sanitized = logger.sanitizeForOutput(entry);
    expect(sanitized.message).toBe('No IP');
  });

  // --- Clear / Reset ---

  it('should clear all logs', () => {
    logger.info('test message');
    expect(logger.getLogs()).toHaveLength(1);
    logger.clear();
    expect(logger.getLogs()).toHaveLength(0);
  });

  // --- Level Updates ---

  it('should allow changing min level dynamically', () => {
    logger.setMinLevel('error');
    logger.info('should not appear');
    logger.error('should appear');

    expect(logger.getLogs()).toHaveLength(1);
    expect(logger.getLogs()[0].level).toBe('error');
  });

  // --- Edge Cases ---

  it('should handle missing optional metadata', () => {
    logger.logRequest('info', 'simple request', { method: 'GET', path: '/' });
    const entry = logger.getLogs()[0];
    expect(entry.method).toBe('GET');
    expect(entry.ip).toBeUndefined();
    expect(entry.userAgent).toBeUndefined();
    expect(entry.durationMs).toBeUndefined();
  });

  it('should handle zero or negative durations', () => {
    logger.logRequest('info', 'fast request', { method: 'GET', path: '/', statusCode: 200, durationMs: 0 });
    logger.logRequest('info', 'impossible request', { method: 'GET', path: '/', statusCode: 200, durationMs: -5 });
    expect(logger.getLogs()).toHaveLength(2);
  });

  it('should handle empty message strings', () => {
    logger.info('');
    expect(logger.getLogs()).toHaveLength(1);
    expect(logger.getLogs()[0].message).toBe('');
  });

  it('should not log when disabled via error level', () => {
    const silentLogger = new StructuredLogger({ minLevel: 'error' });
    silentLogger.info('not logged');
    silentLogger.warn('not logged');
    silentLogger.debug('not logged');
    silentLogger.logRequest('info', 'not logged', { method: 'GET', path: '/' });
    expect(silentLogger.getLogs()).toHaveLength(0);
  });
});

// ==================== 生产脱敏（services/logger.ts:92）====================

describe('sanitizeData（生产：services/logger.ts:92）', () => {
  it('should mask password fields', () => {
    const masked = sanitizeData({ username: 'user1', password: 'secret123' }) as Record<string, unknown>;
    expect(masked.password).toBe('***REDACTED***');
    expect(masked.username).toBe('user1');
  });

  it('should mask token fields', () => {
    const masked = sanitizeData({ token: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9' }) as Record<string, unknown>;
    expect(masked.token).toBe('***REDACTED***');
  });

  it('should mask nested sensitive fields', () => {
    const data = {
      user: { name: 'John', credentials: { password: 'supersecret', apiKey: 'abc123' } },
    };
    const masked = sanitizeData(data) as Record<string, any>;
    expect(masked.user.credentials.password).toBe('***REDACTED***');
    // 生产 SENSITIVE_PATTERNS 含 /api[_-]?key/i（services/logger.ts:51），apiKey 也会被脱敏
    expect(masked.user.credentials.apiKey).toBe('***REDACTED***');
    expect(masked.user.name).toBe('John');
  });

  it('should not mask non-sensitive fields', () => {
    const data = { name: 'John', email: 'john@example.com', age: 30 };
    expect(sanitizeData(data)).toEqual(data);
  });

  it('should handle empty objects', () => {
    expect(sanitizeData({})).toEqual({});
  });

  it('should recurse into arrays', () => {
    const sanitized = sanitizeData([{ password: 'p' }, { name: 'n' }]) as Array<Record<string, unknown>>;
    expect(sanitized[0].password).toBe('***REDACTED***');
    expect(sanitized[1].name).toBe('n');
  });

  it('should mask cookie and api_key variants', () => {
    const sanitized = sanitizeData({ cookie: 'sid=1', api_key: 'k-1' }) as Record<string, unknown>;
    expect(sanitized.cookie).toBe('***REDACTED***');
    expect(sanitized.api_key).toBe('***REDACTED***');
  });

  it('should return primitive values unchanged', () => {
    expect(sanitizeData('plain')).toBe('plain');
    expect(sanitizeData(null)).toBe(null);
  });
});

// ==================== 生产级别过滤（services/logger.ts:112）====================

describe('shouldLog / configureLogger（生产：services/logger.ts:112 / 71）', () => {
  afterEach(() => {
    resetLoggerConfig();
  });

  it('should respect configured global level', () => {
    configureLogger({ level: 'warn' });
    expect(shouldLog('debug')).toBe(false);
    expect(shouldLog('info')).toBe(false);
    expect(shouldLog('warn')).toBe(true);
    expect(shouldLog('error')).toBe(true);
  });

  it('should allow every level when configured debug', () => {
    configureLogger({ level: 'debug' });
    expect(shouldLog('debug')).toBe(true);
    expect(shouldLog('info')).toBe(true);
    expect(shouldLog('warn')).toBe(true);
    expect(shouldLog('error')).toBe(true);
  });

  it('should treat fatal as above error', () => {
    configureLogger({ level: 'fatal' });
    expect(shouldLog('error')).toBe(false);
    expect(shouldLog('fatal')).toBe(true);
  });
});

// ==================== 生产 JSON 输出（services/logger.ts:119）====================

describe('formatLogEntry（生产：services/logger.ts:119）', () => {
  it('should serialize entry as JSON', () => {
    const entry: ServiceLogEntry = {
      level: 'info',
      message: 'hello',
      timestamp: '2026-01-01T00:00:00.000Z',
      service: 'a-stock-backend',
      context: { a: 1 },
    };
    expect(JSON.parse(formatLogEntry(entry))).toEqual(entry);
  });

  it('should keep nested error and trace fields', () => {
    const entry: ServiceLogEntry = {
      level: 'error',
      message: 'boom',
      timestamp: '2026-01-01T00:00:00.000Z',
      service: 'a-stock-backend',
      error: { name: 'Error', message: 'boom', stack: 'stack-line' },
      trace: { requestId: 'r-1' },
    };
    const parsed = JSON.parse(formatLogEntry(entry));
    expect(parsed.error.name).toBe('Error');
    expect(parsed.trace.requestId).toBe('r-1');
  });
});

// ==================== 生产中间件（middleware/requestLogger.ts:99）====================

describe('requestLogger 中间件（生产：middleware/requestLogger.ts:99）', () => {
  let logSpy: MockInstance;
  let warnSpy: MockInstance;

  beforeEach(() => {
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('should reuse client trace id and expose it on the response', () => {
    const req = createFakeRequest({ headers: { 'x-trace-id': 'client-trace-1' } });
    const res = createFakeResponse();
    const next = vi.fn();

    httpRequestLogger()(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(req.traceId).toBe('client-trace-1');
    expect(res.headers['x-trace-id']).toBe('client-trace-1');
  });

  it('should generate an 8-char hex trace id when no header is present', () => {
    const req = createFakeRequest();
    const res = createFakeResponse();

    httpRequestLogger()(req, res, vi.fn());

    // middleware/requestLogger.ts:57 = crypto.randomUUID().slice(0, 8)
    expect(req.traceId).toMatch(/^[0-9a-f]{8}$/);
    expect(res.headers['x-trace-id']).toBe(req.traceId);
  });

  it('should generate unique trace ids', () => {
    const ids = new Set<string>();
    for (let i = 0; i < 100; i++) {
      const req = createFakeRequest();
      httpRequestLogger()(req, createFakeResponse(), vi.fn());
      ids.add(req.traceId as string);
    }
    expect(ids.size).toBe(100);
  });

  it('should skip configured paths without logging', () => {
    const req = createFakeRequest({ path: '/health/live' });
    const res = createFakeResponse();
    const next = vi.fn();

    httpRequestLogger()(req, res, next);
    res.emit('finish');

    expect(next).toHaveBeenCalledTimes(1);
    expect(res.headers['x-trace-id']).toBeUndefined();
    expect(logSpy).not.toHaveBeenCalled();
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('should log 5xx at warn level with traceId/duration(ms) field names', () => {
    const req = createFakeRequest({ headers: { 'x-trace-id': 'trace-9' }, path: '/api/boom' });
    const res = createFakeResponse();

    httpRequestLogger()(req, res, vi.fn());
    res.statusCode = 500;
    vi.advanceTimersByTime(42);
    res.emit('finish');

    expect(warnSpy).toHaveBeenCalledTimes(1);
    const output = String(warnSpy.mock.calls[0][0]);
    expect(output).toContain('⚠️');
    expect(output).toContain('[trace-9]');
    expect(output).toContain('GET /api/boom');

    const context = parseLogContext(output);
    expect(context.traceId).toBe('trace-9');
    expect(context.method).toBe('GET');
    expect(context.path).toBe('/api/boom');
    expect(context.statusCode).toBe(500);
    expect(context.duration).toBe(42);           // 生产字段：duration，单位 ms
    expect(context.durationMs).toBeUndefined();  // 旧测试口径 durationMs 不存在
    expect(context.contentLength).toBe(0);
    expect(context.ip).toBe('192.168.1.100');
  });

  it('should warn on slow requests above slowThreshold(1000ms)', () => {
    const req = createFakeRequest({ headers: { 'x-trace-id': 'slow-1' } });
    const res = createFakeResponse();

    httpRequestLogger()(req, res, vi.fn());
    res.statusCode = 200;
    vi.advanceTimersByTime(1500);
    res.emit('finish');

    expect(warnSpy).toHaveBeenCalledTimes(1);
    const context = parseLogContext(warnSpy.mock.calls[0][0]);
    expect(context.statusCode).toBe(200);
    expect(context.duration).toBe(1500);
  });

  it('should log 4xx at info level and mask sensitive query params', () => {
    const req = createFakeRequest({
      headers: { 'x-trace-id': 'q-1' },
      path: '/api/search',
      query: { token: 'secret123', symbol: '600519' },
    });
    const res = createFakeResponse();

    httpRequestLogger()(req, res, vi.fn());
    res.statusCode = 404;
    res.emit('finish');

    expect(logSpy).toHaveBeenCalledTimes(1);
    const output = String(logSpy.mock.calls[0][0]);
    expect(output).toContain('🔹');

    const context = parseLogContext(output);
    // middleware/requestLogger.ts:62-65 maskSensitiveValue：首2 + **** + 尾2
    expect(context.query.token).toBe('se****23');
    expect(context.query.symbol).toBe('600519');
    // 4xx 记录脱敏后的请求头（L140-145）
    expect(context.headers['x-trace-id']).toBe('q-1');
  });

  // middleware/requestLogger.ts:82 sanitizeQuery：旧实现用 includes 大小写敏感，
  // ?Token= / ?APIKEY= 会原样进日志；现已与 sanitizeHeaders 对齐为小写比较
  it('should mask sensitive query params case-insensitively', () => {
    const req = createFakeRequest({
      headers: { 'x-trace-id': 'q-2' },
      path: '/api/search',
      query: { Token: 'secret456', APIKEY: 'key12345', Symbol: '600519' },
    });
    const res = createFakeResponse();

    httpRequestLogger()(req, res, vi.fn());
    res.statusCode = 404;
    res.emit('finish');

    const context = parseLogContext(String(logSpy.mock.calls[0][0]));
    expect(context.query.Token).toBe('se****56');
    expect(context.query.APIKEY).toBe('ke****45');
    expect(context.query.Symbol).toBe('600519');
  });

  it('should log fast 2xx at debug level', () => {
    const req = createFakeRequest({ headers: { 'x-trace-id': 'fast-1' } });
    const res = createFakeResponse();

    httpRequestLogger()(req, res, vi.fn());
    res.emit('finish');

    expect(logSpy).toHaveBeenCalledTimes(1);
    const output = String(logSpy.mock.calls[0][0]);
    expect(output).toContain('🔍');
    const context = parseLogContext(output);
    expect(context.statusCode).toBe(200);
    expect(context.duration).toBe(0);
  });

  it('should mask sensitive request headers on error responses', () => {
    const req = createFakeRequest({
      headers: { 'x-trace-id': 'h-1', authorization: 'Bearer abc123' },
    });
    const res = createFakeResponse();

    httpRequestLogger()(req, res, vi.fn());
    res.statusCode = 401;
    res.emit('finish');

    const context = parseLogContext(logSpy.mock.calls[0][0]);
    expect(context.headers.authorization).toBe('Be****23');
    expect(context.headers['x-trace-id']).toBe('h-1');
  });
});

// ==================== 生产中间件（services/logger.ts:239）====================

describe('services/logger requestLogger（生产：services/logger.ts:239）', () => {
  let logSpy: MockInstance;
  let errorSpy: MockInstance;

  beforeEach(() => {
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('should set X-Request-Id with req_ prefix', () => {
    const req = createFakeRequest();
    const res = createFakeResponse();
    const next = vi.fn();

    legacyRequestLogger()(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(String(res.headers['x-request-id']).startsWith('req_')).toBe(true);
    expect(String(res.headers['x-request-id']).length).toBeGreaterThan(10);
    expect(req.requestId).toBe(res.headers['x-request-id']);
  });

  it('should reuse incoming x-request-id header', () => {
    const req = createFakeRequest({ headers: { 'x-request-id': 'upstream-1' } });
    const res = createFakeResponse();

    legacyRequestLogger()(req, res, vi.fn());

    expect(res.headers['x-request-id']).toBe('upstream-1');
    expect(req.requestId).toBe('upstream-1');
  });

  it('should log 5xx via error level on finish', () => {
    const req = createFakeRequest({ headers: { 'x-request-id': 'e-1' }, path: '/api/fail' });
    const res = createFakeResponse();

    legacyRequestLogger()(req, res, vi.fn());
    res.statusCode = 500;
    vi.advanceTimersByTime(30);
    res.emit('finish');

    expect(logSpy).toHaveBeenCalled();
    expect(errorSpy).toHaveBeenCalledTimes(1);
    expect(String(errorSpy.mock.calls[0][0])).toContain('500');
  });
});
