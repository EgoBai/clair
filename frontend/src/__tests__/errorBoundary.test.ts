import { describe, it, expect, vi } from 'vitest';
import {
  classifyError,
  buildErrorInfo,
  ErrorReporter,
  withFallback,
  CircuitFallback,
} from '../utils/errorBoundary';

describe('classifyError', () => {
  it('should classify network errors', () => {
    expect(classifyError(new Error('fetch failed'))).toBe('network');
    expect(classifyError(new Error('Network connection lost'))).toBe('network');
  });

  it('should classify permission errors', () => {
    expect(classifyError(new Error('Unauthorized access'))).toBe('permission');
    expect(classifyError(new Error('Forbidden'))).toBe('permission');
  });

  it('should classify data errors', () => {
    expect(classifyError(new Error('Invalid parse'))).toBe('data');
    expect(classifyError(new Error('data corruption'))).toBe('data');
  });

  it('should classify TypeError as render', () => {
    const err = new TypeError('undefined is not a function');
    expect(classifyError(err)).toBe('render');
  });

  it('should classify unknown errors', () => {
    expect(classifyError(new Error('Something weird'))).toBe('unknown');
  });
});

describe('buildErrorInfo', () => {
  it('should build error info', () => {
    const info = buildErrorInfo(new Error('test'));
    expect(info.message).toBe('test');
    expect(info.timestamp).toBeGreaterThan(0);
    expect(info.category).toBeDefined();
  });

  it('should include component stack', () => {
    const info = buildErrorInfo(new Error('test'), 'Component > Child');
    expect(info.componentStack).toBe('Component > Child');
  });

  it('should mark network errors as recoverable and retryable', () => {
    const info = buildErrorInfo(new Error('fetch failed'));
    expect(info.recoverable).toBe(true);
    expect(info.retryable).toBe(true);
  });

  it('should mark render errors as not retryable', () => {
    const info = buildErrorInfo(new TypeError('x'));
    expect(info.retryable).toBe(false);
  });
});

describe('ErrorReporter', () => {
  it('should report errors', () => {
    const reporter = new ErrorReporter();
    reporter.report(new Error('test1'));
    reporter.report(new Error('test2'));
    expect(reporter.getQueue()).toHaveLength(2);
  });

  it('should limit queue size', () => {
    const reporter = new ErrorReporter(3);
    for (let i = 0; i < 5; i++) reporter.report(new Error(`e${i}`));
    expect(reporter.getQueue()).toHaveLength(3);
  });

  it('should clear queue', () => {
    const reporter = new ErrorReporter();
    reporter.report(new Error('test'));
    reporter.clear();
    expect(reporter.getQueue()).toHaveLength(0);
  });

  it('should get stats by category', () => {
    const reporter = new ErrorReporter();
    reporter.report(new Error('fetch failed'));
    reporter.report(new Error('Unauthorized'));
    reporter.report(new Error('unknown'));
    const stats = reporter.getStats();
    expect(stats.network).toBe(1);
    expect(stats.permission).toBe(1);
    expect(stats.unknown).toBe(1);
  });
});

describe('withFallback', () => {
  it('should return primary result on success', async () => {
    const result = await withFallback(
      async () => 'primary',
      () => 'fallback'
    );
    expect(result).toBe('primary');
  });

  it('should use fallback on failure', async () => {
    const result = await withFallback(
      async () => { throw new Error('fail'); },
      () => 'fallback',
      { retries: 0 }
    );
    expect(result).toBe('fallback');
  });

  it('should retry before fallback', async () => {
    let attempts = 0;
    const result = await withFallback(
      async () => {
        attempts++;
        if (attempts < 3) throw new Error('fail');
        return 'success';
      },
      () => 'fallback',
      { retries: 2, retryDelay: 1 }
    );
    expect(result).toBe('success');
    expect(attempts).toBe(3);
  });

  it('should throw original error if fallback also fails', async () => {
    await expect(
      withFallback(
        async () => { throw new Error('primary fail'); },
        () => { throw new Error('fallback fail'); },
        { retries: 0 }
      )
    ).rejects.toThrow('primary fail');
  });
});

describe('CircuitFallback', () => {
  it('should use primary when closed', async () => {
    const circuit = new CircuitFallback(
      async () => 'primary',
      () => 'fallback'
    );
    const result = await circuit.execute();
    expect(result).toBe('primary');
  });

  it('should use fallback after failures', async () => {
    const circuit = new CircuitFallback(
      async () => { throw new Error('fail'); },
      () => 'fallback',
      2
    );
    await circuit.execute();
    await circuit.execute();
    // After threshold, should use fallback directly
    const result = await circuit.execute();
    expect(result).toBe('fallback');
  });

  it('should open circuit after threshold', async () => {
    const circuit = new CircuitFallback(
      async () => { throw new Error('fail'); },
      () => 'fallback',
      3
    );
    for (let i = 0; i < 3; i++) await circuit.execute();
    expect(circuit.getState()).toBe('open');
  });
});
