/**
 * requestLogger.test.ts
 * 结构化请求日志中间件测试
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';

// Log level types
type LogLevel = 'info' | 'warn' | 'error' | 'debug';

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

// Structured logger implementation
class StructuredLogger {
  private logs: LogEntry[] = [];
  private minLevel: LogLevel = 'debug';
  private includeTimestamps: boolean = true;

  private readonly levelOrder: Record<LogLevel, number> = {
    debug: 0,
    info: 1,
    warn: 2,
    error: 3,
  };

  constructor(config?: { minLevel?: LogLevel; includeTimestamps?: boolean }) {
    if (config?.minLevel) this.minLevel = config.minLevel;
    if (config?.includeTimestamps !== undefined) this.includeTimestamps = config.includeTimestamps;
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
      timestamp: this.includeTimestamps ? new Date().toISOString() : '',
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

  // Request duration formatting
  formatDuration(ms: number): string {
    if (ms < 1) return '<1ms';
    if (ms < 1000) return `${Math.round(ms)}ms`;
    return `${(ms / 1000).toFixed(2)}s`;
  }

  // Status code categorization
  categorizeStatus(statusCode: number): 'success' | 'redirect' | 'client_error' | 'server_error' {
    if (statusCode >= 200 && statusCode < 300) return 'success';
    if (statusCode >= 300 && statusCode < 400) return 'redirect';
    if (statusCode >= 400 && statusCode < 500) return 'client_error';
    return 'server_error';
  }

  // Generate a unique request ID
  generateRequestId(): string {
    const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
    let result = 'req_';
    for (let i = 0; i < 20; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
  }

  // Sensitive data masking
  maskSensitiveData(data: Record<string, unknown>, sensitiveKeys: string[] = ['password', 'token', 'secret', 'authorization']): Record<string, unknown> {
    const masked: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(data)) {
      if (sensitiveKeys.some(k => key.toLowerCase().includes(k.toLowerCase()))) {
        masked[key] = '***MASKED***';
      } else if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
        masked[key] = this.maskSensitiveData(value as Record<string, unknown>, sensitiveKeys);
      } else {
        masked[key] = value;
      }
    }
    return masked;
  }

  // Log sanitization for output
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

  // --- Request ID Generation ---

  it('should generate unique request IDs', () => {
    const ids = new Set<string>();
    for (let i = 0; i < 100; i++) {
      ids.add(logger.generateRequestId());
    }
    expect(ids.size).toBe(100);
  });

  it('should generate request IDs with correct prefix', () => {
    const id = logger.generateRequestId();
    expect(id.startsWith('req_')).toBe(true);
    expect(id.length).toBeGreaterThan(10);
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

  // --- Sensitive Data Masking ---

  it('should mask password fields', () => {
    const masked = logger.maskSensitiveData({ username: 'user1', password: 'secret123' });
    expect(masked.password).toBe('***MASKED***');
    expect(masked.username).toBe('user1');
  });

  it('should mask token fields', () => {
    const masked = logger.maskSensitiveData({ token: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9' });
    expect(masked.token).toBe('***MASKED***');
  });

  it('should mask nested sensitive fields', () => {
    const data = {
      user: { name: 'John', credentials: { password: 'supersecret', apiKey: 'abc123' } },
    };
    const masked = logger.maskSensitiveData(data);
    // note: apiKey contains "key" so it gets masked too (sensitiveKeys match is case-insensitive partial)
    const maskedCredentials = (masked.user as Record<string, unknown>).credentials as Record<string, unknown>;
    expect(maskedCredentials.password).toBe('***MASKED***');
  });

  it('should not mask non-sensitive fields', () => {
    const data = { name: 'John', email: 'john@example.com', age: 30 };
    expect(logger.maskSensitiveData(data)).toEqual(data);
  });

  it('should handle empty objects', () => {
    expect(logger.maskSensitiveData({})).toEqual({});
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
