/**
 * 结构化日志系统测试
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  logger,
  configureLogger,
  resetLoggerConfig,
  getLoggerConfig,
  sanitizeData,
  shouldLog,
  formatLogEntry,
  requestLogger,
} from '../services/logger';

describe('Logger Service', () => {
  let consoleSpy: any;

  beforeEach(() => {
    resetLoggerConfig();
    consoleSpy = {
      log: vi.spyOn(console, 'log').mockImplementation(() => {}),
      warn: vi.spyOn(console, 'warn').mockImplementation(() => {}),
      error: vi.spyOn(console, 'error').mockImplementation(() => {}),
    };
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('configureLogger', () => {
    it('should update configuration', () => {
      configureLogger({ level: 'error', service: 'test-service' });
      const config = getLoggerConfig();
      expect(config.level).toBe('error');
      expect(config.service).toBe('test-service');
    });

    it('should merge with defaults', () => {
      configureLogger({ level: 'warn' });
      const config = getLoggerConfig();
      expect(config.level).toBe('warn');
      expect(config.enableConsole).toBe(true);
    });
  });

  describe('shouldLog', () => {
    it('should respect log level hierarchy', () => {
      configureLogger({ level: 'warn' });
      expect(shouldLog('debug')).toBe(false);
      expect(shouldLog('info')).toBe(false);
      expect(shouldLog('warn')).toBe(true);
      expect(shouldLog('error')).toBe(true);
      expect(shouldLog('fatal')).toBe(true);
    });

    it('should log everything at debug level', () => {
      configureLogger({ level: 'debug' });
      expect(shouldLog('debug')).toBe(true);
      expect(shouldLog('info')).toBe(true);
      expect(shouldLog('warn')).toBe(true);
      expect(shouldLog('error')).toBe(true);
      expect(shouldLog('fatal')).toBe(true);
    });

    it('should only log fatal at fatal level', () => {
      configureLogger({ level: 'fatal' });
      expect(shouldLog('debug')).toBe(false);
      expect(shouldLog('info')).toBe(false);
      expect(shouldLog('warn')).toBe(false);
      expect(shouldLog('error')).toBe(false);
      expect(shouldLog('fatal')).toBe(true);
    });
  });

  describe('sanitizeData', () => {
    it('should redact sensitive fields', () => {
      const data = {
        username: 'test',
        password: 'secret123',
        token: 'abc',
        apiKey: 'key123',
      };
      const sanitized = sanitizeData(data) as Record<string, unknown>;
      expect(sanitized.username).toBe('test');
      expect(sanitized.password).toBe('***REDACTED***');
      expect(sanitized.token).toBe('***REDACTED***');
      expect(sanitized.apiKey).toBe('***REDACTED***');
    });

    it('should handle nested objects', () => {
      const data = {
        user: { name: 'test', password: 'secret' },
        auth: { Authorization: 'Bearer xyz' },
      };
      const sanitized = sanitizeData(data) as any;
      expect(sanitized.user.name).toBe('test');
      expect(sanitized.user.password).toBe('***REDACTED***');
      expect(sanitized.auth.Authorization).toBe('***REDACTED***');
    });

    it('should handle arrays', () => {
      const data = [{ password: 'a' }, { name: 'b' }];
      const sanitized = sanitizeData(data) as any[];
      expect(sanitized[0].password).toBe('***REDACTED***');
      expect(sanitized[1].name).toBe('b');
    });

    it('should handle primitives', () => {
      expect(sanitizeData(null)).toBe(null);
      expect(sanitizeData(42)).toBe(42);
      expect(sanitizeData('hello')).toBe('hello');
    });
  });

  describe('formatLogEntry', () => {
    it('should serialize to JSON', () => {
      const entry = {
        level: 'info' as const,
        message: 'test',
        timestamp: '2024-01-01T00:00:00.000Z',
        service: 'test',
      };
      const formatted = formatLogEntry(entry);
      expect(JSON.parse(formatted)).toEqual(entry);
    });
  });

  describe('logger methods', () => {
    it('should log info messages', () => {
      logger.info('test message', { key: 'value' });
      expect(consoleSpy.log).toHaveBeenCalled();
    });

    it('should log error messages with error object', () => {
      const error = new Error('test error');
      logger.error('Something failed', error, { context: 'test' });
      expect(consoleSpy.error).toHaveBeenCalled();
    });

    it('should log warn messages', () => {
      logger.warn('warning message');
      expect(consoleSpy.warn).toHaveBeenCalled();
    });

    it('should not log debug when level is info', () => {
      configureLogger({ level: 'info' });
      logger.debug('should not appear');
      expect(consoleSpy.log).not.toHaveBeenCalled();
    });

    it('should create child logger with default context', () => {
      const child = logger.child({ module: 'test-module' });
      child.info('child message');
      expect(consoleSpy.log).toHaveBeenCalled();
    });

    it('should include trace info', () => {
      logger.info('traced message', {}, { requestId: 'req-123' });
      expect(consoleSpy.log).toHaveBeenCalled();
    });
  });

  describe('requestLogger middleware', () => {
    it('should create middleware function', () => {
      const middleware = requestLogger();
      expect(typeof middleware).toBe('function');
    });

    it('should log request and response', () => {
      const middleware = requestLogger();
      const req = {
        method: 'GET',
        path: '/api/test',
        query: {},
        headers: { 'user-agent': 'test' },
        ip: '127.0.0.1',
      };
      const res = {
        statusCode: 200,
        setHeader: vi.fn(),
        on: vi.fn((event: string, cb: Function) => {
          if (event === 'finish') {
            // Simulate finish event
          }
        }),
      };
      const next = vi.fn();

      middleware(req, res, next);
      expect(next).toHaveBeenCalled();
      expect(res.setHeader).toHaveBeenCalledWith('X-Request-Id', expect.any(String));
    });
  });
});
