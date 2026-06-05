/**
 * Sentry 错误追踪集成测试
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  configureSentry,
  getSentryConfig,
  captureException,
  captureMessage,
  addBreadcrumb,
  setUser,
  startTransaction,
  sentryErrorHandler,
} from '../services/sentry';

// Mock logger
vi.mock('../services/logger', () => ({
  logger: {
    info: vi.fn(),
    debug: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
  },
}));

describe('Sentry Service', () => {
  beforeEach(() => {
    configureSentry({ enabled: false });
  });

  describe('configureSentry', () => {
    it('should update configuration', () => {
      configureSentry({
        dsn: 'https://test@sentry.io/123',
        environment: 'production',
        tracesSampleRate: 0.5,
        enabled: true,
      });
      const config = getSentryConfig();
      expect(config.dsn).toBe('https://test@sentry.io/123');
      expect(config.environment).toBe('production');
      expect(config.tracesSampleRate).toBe(0.5);
      expect(config.enabled).toBe(true);
    });
  });

  describe('getSentryConfig', () => {
    it('should return a copy of config', () => {
      const config1 = getSentryConfig();
      const config2 = getSentryConfig();
      expect(config1).toEqual(config2);
      expect(config1).not.toBe(config2);
    });

    it('should have default values', () => {
      const config = getSentryConfig();
      expect(config.release).toBeTruthy();
      expect(config.tracesSampleRate).toBeGreaterThan(0);
    });
  });

  describe('captureException', () => {
    it('should return event ID', () => {
      const error = new Error('test error');
      const eventId = captureException(error);
      expect(eventId).toMatch(/^evt_\d+_[a-z0-9]+$/);
    });

    it('should accept context', () => {
      const error = new Error('test error');
      const eventId = captureException(error, {
        user: { id: '123' },
        tags: { module: 'test' },
        extra: { detail: 'info' },
      });
      expect(eventId).toBeTruthy();
    });

    it('should support different severity levels', () => {
      const error = new Error('fatal error');
      const eventId = captureException(error, { level: 'fatal' });
      expect(eventId).toBeTruthy();
    });
  });

  describe('captureMessage', () => {
    it('should return event ID', () => {
      const eventId = captureMessage('test message');
      expect(eventId).toMatch(/^evt_\d+_[a-z0-9]+$/);
    });

    it('should accept context', () => {
      const eventId = captureMessage('test message', {
        tags: { source: 'test' },
        level: 'warning',
      });
      expect(eventId).toBeTruthy();
    });
  });

  describe('addBreadcrumb', () => {
    it('should not throw', () => {
      expect(() => {
        addBreadcrumb('user clicked', 'ui', { button: 'submit' });
      }).not.toThrow();
    });
  });

  describe('setUser', () => {
    it('should not throw', () => {
      expect(() => {
        setUser({ id: '123', email: 'test@example.com' });
      }).not.toThrow();
    });
  });

  describe('startTransaction', () => {
    it('should return a transaction with finish method', () => {
      const tx = startTransaction('GET /api/stock', 'http.server');
      expect(tx).toHaveProperty('finish');
      expect(typeof tx.finish).toBe('function');
    });

    it('should not throw on finish', () => {
      const tx = startTransaction('test', 'test');
      expect(() => tx.finish()).not.toThrow();
    });
  });

  describe('sentryErrorHandler', () => {
    it('should create express middleware', () => {
      const middleware = sentryErrorHandler();
      expect(typeof middleware).toBe('function');
    });

    it('should call next with error', () => {
      const middleware = sentryErrorHandler();
      const err = new Error('test');
      const req = { method: 'GET', path: '/test', requestId: 'req-1' };
      const res = {};
      const next = vi.fn();

      middleware(err, req, res, next);
      expect(next).toHaveBeenCalledWith(err);
    });
  });
});
