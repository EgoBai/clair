import { describe, it, expect } from 'vitest';

/**
 * 错误边界组件逻辑测试
 * ErrorBoundary / EnhancedErrorBoundary / ChartErrorBoundary
 */

type ErrorSeverity = 'low' | 'medium' | 'high' | 'critical';

interface ErrorInfo {
  componentStack: string;
  errorBoundary?: string;
  eventType?: string;
}

interface CapturedError {
  error: Error;
  errorInfo: ErrorInfo;
  timestamp: number;
  component?: string;
  severity: ErrorSeverity;
}

interface ErrorBoundaryConfig {
  name?: string;
  maxRetries: number;
  retryDelay: number;
  reportToService: boolean;
  fallbackComponent?: string;
}

function classifyError(error: Error): ErrorSeverity {
  const msg = error.message.toLowerCase();
  if (msg.includes('network') || msg.includes('fetch')) return 'medium';
  if (msg.includes('permission') || msg.includes('unauthorized')) return 'high';
  if (msg.includes('chunk') || msg.includes('loading')) return 'low';
  if (msg.includes('memory') || msg.includes('stack overflow')) return 'critical';
  return 'medium';
}

function buildErrorMessage(error: Error, component?: string): string {
  const parts = [error.message];
  if (component) parts.push(`(组件: ${component})`);
  return parts.join(' ');
}

function shouldRetry(config: ErrorBoundaryConfig, attemptCount: number): boolean {
  return attemptCount < config.maxRetries;
}

function calcRetryDelay(config: ErrorBoundaryConfig, attempt: number): number {
  return config.retryDelay * Math.pow(2, attempt - 1);
}

function formatErrorForLog(captured: CapturedError): string {
  const ts = new Date(captured.timestamp).toISOString();
  return `[${ts}] [${captured.severity.toUpperCase()}] ${captured.error.message}${captured.component ? ` @ ${captured.component}` : ''}`;
}

function createErrorReport(captured: CapturedError): {
  message: string;
  stack: string;
  componentStack: string;
  severity: ErrorSeverity;
  timestamp: string;
  component?: string;
} {
  return {
    message: captured.error.message,
    stack: captured.error.stack ?? '',
    componentStack: captured.errorInfo.componentStack,
    severity: captured.severity,
    timestamp: new Date(captured.timestamp).toISOString(),
    component: captured.component,
  };
}

function isValidComponentStack(stack: string): boolean {
  if (!stack) return false;
  return stack.includes('\n') || stack.includes('at ');
}

function extractComponentName(stack: string): string[] {
  // Extract component names from React component stack
  const matches = stack.match(/at (\w+)/g);
  if (!matches) return [];
  return matches.map(m => m.replace('at ', ''));
}

function normalizeError(error: unknown): Error {
  if (error instanceof Error) return error;
  if (typeof error === 'string') return new Error(error);
  return new Error(String(error));
}

function createFallbackConfig(name: string, maxRetries = 3): ErrorBoundaryConfig {
  return {
    name,
    maxRetries,
    retryDelay: 1000,
    reportToService: true,
    fallbackComponent: 'ErrorFallback',
  };
}

describe('错误边界组件逻辑', () => {
  describe('classifyError', () => {
    it('should classify network errors as medium', () => {
      expect(classifyError(new Error('Network request failed'))).toBe('medium');
      expect(classifyError(new Error('fetch timeout'))).toBe('medium');
    });

    it('should classify permission errors as high', () => {
      expect(classifyError(new Error('permission denied'))).toBe('high');
      expect(classifyError(new Error('Unauthorized access'))).toBe('high');
    });

    it('should classify chunk errors as low', () => {
      expect(classifyError(new Error('ChunkLoadError'))).toBe('low');
      expect(classifyError(new Error('Loading chunk failed'))).toBe('low');
    });

    it('should classify memory errors as critical', () => {
      expect(classifyError(new Error('Out of memory'))).toBe('critical');
      expect(classifyError(new Error('stack overflow'))).toBe('critical');
    });

    it('should default to medium', () => {
      expect(classifyError(new Error('something went wrong'))).toBe('medium');
    });
  });

  describe('buildErrorMessage', () => {
    it('should include error message', () => {
      expect(buildErrorMessage(new Error('fail'))).toBe('fail');
    });

    it('should include component name', () => {
      expect(buildErrorMessage(new Error('fail'), 'Chart')).toBe('fail (组件: Chart)');
    });
  });

  describe('shouldRetry', () => {
    it('should allow retries within limit', () => {
      const config = createFallbackConfig('test', 3);
      expect(shouldRetry(config, 1)).toBe(true);
      expect(shouldRetry(config, 2)).toBe(true);
    });

    it('should deny retries at limit', () => {
      const config = createFallbackConfig('test', 3);
      expect(shouldRetry(config, 3)).toBe(false);
    });
  });

  describe('calcRetryDelay', () => {
    it('should use exponential backoff', () => {
      const config = createFallbackConfig('test');
      expect(calcRetryDelay(config, 1)).toBe(1000);
      expect(calcRetryDelay(config, 2)).toBe(2000);
      expect(calcRetryDelay(config, 3)).toBe(4000);
    });
  });

  describe('formatErrorForLog', () => {
    it('should format error with timestamp and severity', () => {
      const captured: CapturedError = {
        error: new Error('test error'),
        errorInfo: { componentStack: '' },
        timestamp: 1700000000000,
        severity: 'high',
      };
      const log = formatErrorForLog(captured);
      expect(log).toContain('[HIGH]');
      expect(log).toContain('test error');
    });

    it('should include component name when available', () => {
      const captured: CapturedError = {
        error: new Error('test error'),
        errorInfo: { componentStack: '' },
        timestamp: 1700000000000,
        severity: 'medium',
        component: 'Chart',
      };
      const log = formatErrorForLog(captured);
      expect(log).toContain('@ Chart');
    });
  });

  describe('createErrorReport', () => {
    it('should create report with all fields', () => {
      const captured: CapturedError = {
        error: new Error('fail'),
        errorInfo: { componentStack: 'at Chart\nat App' },
        timestamp: 1700000000000,
        severity: 'high',
        component: 'Chart',
      };
      const report = createErrorReport(captured);
      expect(report.message).toBe('fail');
      expect(report.severity).toBe('high');
      expect(report.component).toBe('Chart');
      expect(report.timestamp).toContain('2023');
    });
  });

  describe('isValidComponentStack', () => {
    it('should validate proper stacks', () => {
      expect(isValidComponentStack('at Chart\nat App')).toBe(true);
      expect(isValidComponentStack('at Component')).toBe(true);
    });

    it('should reject empty/invalid stacks', () => {
      expect(isValidComponentStack('')).toBe(false);
      expect(isValidComponentStack('just text')).toBe(false);
    });
  });

  describe('extractComponentName', () => {
    it('should extract component names from stack', () => {
      const names = extractComponentName('at Chart\nat App\nat Router');
      expect(names).toEqual(['Chart', 'App', 'Router']);
    });

    it('should handle empty stack', () => {
      expect(extractComponentName('')).toEqual([]);
    });
  });

  describe('normalizeError', () => {
    it('should pass through Error instances', () => {
      const err = new Error('test');
      expect(normalizeError(err)).toBe(err);
    });

    it('should convert strings to Error', () => {
      const err = normalizeError('something failed');
      expect(err).toBeInstanceOf(Error);
      expect(err.message).toBe('something failed');
    });

    it('should convert other values to Error', () => {
      const err = normalizeError(42);
      expect(err).toBeInstanceOf(Error);
      expect(err.message).toBe('42');
    });
  });

  describe('createFallbackConfig', () => {
    it('should create config with defaults', () => {
      const config = createFallbackConfig('MyComponent');
      expect(config.name).toBe('MyComponent');
      expect(config.maxRetries).toBe(3);
      expect(config.reportToService).toBe(true);
    });

    it('should accept custom maxRetries', () => {
      const config = createFallbackConfig('MyComponent', 5);
      expect(config.maxRetries).toBe(5);
    });
  });
});
