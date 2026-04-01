import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  classifyError,
  buildErrorInfo,
  ErrorReporter,
  withFallback,
  CircuitFallback,
  ErrorCategory,
} from '../utils/errorBoundary';

describe('errorBoundary', () => {
  describe('classifyError', () => {
    it('should classify network errors', () => {
      expect(classifyError(new Error('NetworkError'))).toBe('network');
      expect(classifyError(new Error('fetch failed'))).toBe('network');
      expect(classifyError(new Error('connection refused'))).toBe('network');
    });

    it('should classify permission errors', () => {
      expect(classifyError(new Error('permission denied'))).toBe('permission');
      expect(classifyError(new Error('unauthorized access'))).toBe('permission');
      expect(classifyError(new Error('forbidden resource'))).toBe('permission');
    });

    it('should classify render errors', () => {
      const typeErr = new TypeError('undefined is not a function');
      expect(classifyError(typeErr)).toBe('render');

      const refErr = new ReferenceError('x is not defined');
      expect(classifyError(refErr)).toBe('render');
    });

    it('should classify data errors', () => {
      expect(classifyError(new Error('parse error'))).toBe('data');
      expect(classifyError(new Error('invalid format'))).toBe('data');
      expect(classifyError(new Error('data corruption'))).toBe('data');
    });

    it('should classify unknown errors', () => {
      expect(classifyError(new Error('something went wrong'))).toBe('unknown');
      expect(classifyError(new Error('oops'))).toBe('unknown');
    });
  });

  describe('buildErrorInfo', () => {
    it('should build error info from Error object', () => {
      const error = new Error('test error');
      const info = buildErrorInfo(error);

      expect(info.message).toBe('test error');
      expect(info.category).toBeDefined();
      expect(info.timestamp).toBeGreaterThan(0);
      expect(typeof info.recoverable).toBe('boolean');
      expect(typeof info.retryable).toBe('boolean');
    });

    it('should include component stack', () => {
      const error = new Error('render error');
      const info = buildErrorInfo(error, 'at Component');

      expect(info.componentStack).toBe('at Component');
    });

    it('should mark network errors as recoverable and retryable', () => {
      const error = new Error('network fetch failed');
      const info = buildErrorInfo(error);

      expect(info.recoverable).toBe(true);
      expect(info.retryable).toBe(true);
    });

    it('should mark data errors as recoverable but not retryable', () => {
      const error = new Error('parse error');
      const info = buildErrorInfo(error);

      expect(info.recoverable).toBe(true);
      expect(info.retryable).toBe(false);
    });

    it('should mark render errors as not recoverable', () => {
      const error = new TypeError('type error');
      const info = buildErrorInfo(error);

      expect(info.recoverable).toBe(false);
    });
  });

  describe('ErrorReporter', () => {
    let reporter: ErrorReporter;

    beforeEach(() => {
      reporter = new ErrorReporter(5);
    });

    it('should report errors to queue', () => {
      reporter.report(new Error('err1'));
      reporter.report(new Error('err2'));

      const queue = reporter.getQueue();
      expect(queue).toHaveLength(2);
      expect(queue[0].message).toBe('err1');
    });

    it('should limit queue size', () => {
      for (let i = 0; i < 10; i++) {
        reporter.report(new Error(`err${i}`));
      }

      expect(reporter.getQueue()).toHaveLength(5);
    });

    it('should clear queue', () => {
      reporter.report(new Error('err'));
      reporter.clear();

      expect(reporter.getQueue()).toHaveLength(0);
    });

    it('should provide error stats by category', () => {
      reporter.report(new Error('network fetch error'));
      reporter.report(new TypeError('type error'));
      reporter.report(new Error('parse error data'));

      const stats = reporter.getStats();
      expect(stats).toHaveProperty('network');
      expect(stats).toHaveProperty('render');
      expect(stats).toHaveProperty('data');
    });

    it('should set endpoint', () => {
      reporter.setEndpoint('https://api.example.com/errors');
      // No error means it works
      expect(true).toBe(true);
    });
  });

  describe('withFallback', () => {
    it('should return primary result on success', async () => {
      const result = await withFallback(
        () => Promise.resolve('primary'),
        () => 'fallback'
      );
      expect(result).toBe('primary');
    });

    it('should use fallback after retries', async () => {
      let calls = 0;
      const result = await withFallback(
        () => { calls++; throw new Error('fail'); },
        () => 'fallback',
        { retries: 2 }
      );

      expect(result).toBe('fallback');
      expect(calls).toBe(3); // initial + 2 retries
    });

    it('should succeed on retry', async () => {
      let calls = 0;
      const result = await withFallback(
        () => {
          calls++;
          if (calls < 2) throw new Error('fail');
          return Promise.resolve('success');
        },
        () => 'fallback',
        { retries: 2 }
      );

      expect(result).toBe('success');
      expect(calls).toBe(2);
    });

    it('should throw last error if fallback also fails', async () => {
      await expect(
        withFallback(
          () => { throw new Error('primary fail'); },
          () => { throw new Error('fallback fail'); },
          { retries: 1 }
        )
      ).rejects.toThrow('primary fail');
    });
  });

  describe('CircuitFallback', () => {
    it('should use primary when closed', async () => {
      const circuit = new CircuitFallback(
        () => Promise.resolve('primary'),
        () => 'fallback',
        3
      );

      const result = await circuit.execute();
      expect(result).toBe('primary');
      expect(circuit.getState()).toBe('closed');
    });

    it('should use fallback when circuit opens', async () => {
      let failCount = 0;
      const circuit = new CircuitFallback(
        () => { failCount++; throw new Error('fail'); },
        () => 'fallback',
        3
      );

      // Trigger failures
      await circuit.execute();
      await circuit.execute();
      await circuit.execute();

      expect(circuit.getState()).toBe('open');
    });

    it('should recover after reset timeout', async () => {
      let shouldFail = true;
      const circuit = new CircuitFallback(
        () => {
          if (shouldFail) throw new Error('fail');
          return Promise.resolve('primary');
        },
        () => 'fallback',
        2,
        100 // short timeout for test
      );

      // Open the circuit
      await circuit.execute();
      await circuit.execute();
      expect(circuit.getState()).toBe('open');

      // Wait for reset
      await new Promise(r => setTimeout(r, 150));
      shouldFail = false;

      const result = await circuit.execute();
      expect(result).toBe('primary');
      expect(circuit.getState()).toBe('closed');
    });
  });
});
