import { describe, it, expect } from 'vitest';

// Error Handling Chain
type ErrorSeverity = 'low' | 'medium' | 'high' | 'critical';

interface AppError {
  code: string;
  message: string;
  severity: ErrorSeverity;
  timestamp: number;
  context?: Record<string, unknown>;
  recoverable: boolean;
}

interface ErrorHandlingResult {
  handled: boolean;
  response: {
    statusCode: number;
    body: Record<string, unknown>;
  };
  logged: boolean;
  alert: boolean;
}

function classifyError(error: Error): AppError {
  const msg = error.message.toLowerCase();
  let code = 'INTERNAL_ERROR';
  let severity: ErrorSeverity = 'medium';
  let recoverable = true;

  if (msg.includes('timeout')) {
    code = 'TIMEOUT';
    severity = 'medium';
  } else if (msg.includes('not found') || msg.includes('404')) {
    code = 'NOT_FOUND';
    severity = 'low';
    recoverable = false;
  } else if (msg.includes('unauthorized') || msg.includes('401')) {
    code = 'UNAUTHORIZED';
    severity = 'medium';
    recoverable = false;
  } else if (msg.includes('forbidden') || msg.includes('403')) {
    code = 'FORBIDDEN';
    severity = 'medium';
    recoverable = false;
  } else if (msg.includes('rate limit') || msg.includes('429')) {
    code = 'RATE_LIMITED';
    severity = 'low';
  } else if (msg.includes('database') || msg.includes('connection')) {
    code = 'DATABASE_ERROR';
    severity = 'high';
  } else if (msg.includes('memory') || msg.includes('heap')) {
    code = 'OUT_OF_MEMORY';
    severity = 'critical';
    recoverable = false;
  }

  return {
    code,
    message: error.message,
    severity,
    timestamp: Date.now(),
    recoverable,
  };
}

function getStatusCode(appError: AppError): number {
  const codeMap: Record<string, number> = {
    NOT_FOUND: 404,
    UNAUTHORIZED: 401,
    FORBIDDEN: 403,
    RATE_LIMITED: 429,
    TIMEOUT: 504,
    DATABASE_ERROR: 503,
    OUT_OF_MEMORY: 500,
    INTERNAL_ERROR: 500,
  };
  return codeMap[appError.code] || 500;
}

function formatErrorResponse(appError: AppError, isProduction: boolean): Record<string, unknown> {
  const response: Record<string, unknown> = {
    error: appError.code,
    message: isProduction && appError.severity === 'critical'
      ? 'Internal server error'
      : appError.message,
    timestamp: appError.timestamp,
  };

  if (!isProduction) {
    response.severity = appError.severity;
    response.recoverable = appError.recoverable;
    if (appError.context) {
      response.context = appError.context;
    }
  }

  return response;
}

function shouldAlert(appError: AppError): boolean {
  return appError.severity === 'critical' || appError.severity === 'high';
}

function handleError(error: Error, isProduction = false): ErrorHandlingResult {
  const appError = classifyError(error);
  const statusCode = getStatusCode(appError);
  const body = formatErrorResponse(appError, isProduction);
  const alert = shouldAlert(appError);

  return {
    handled: true,
    response: { statusCode, body },
    logged: true,
    alert,
  };
}

function buildErrorChain(errors: AppError[]): AppError | null {
  if (errors.length === 0) return null;
  return errors.reduce((worst, current) => {
    const severityOrder = { low: 0, medium: 1, high: 2, critical: 3 };
    return severityOrder[current.severity] > severityOrder[worst.severity] ? current : worst;
  });
}

describe('Error Handling Chain', () => {
  it('should classify timeout errors', () => {
    const err = classifyError(new Error('Request timeout'));
    expect(err.code).toBe('TIMEOUT');
    expect(err.recoverable).toBe(true);
  });

  it('should classify not found errors', () => {
    const err = classifyError(new Error('Resource not found'));
    expect(err.code).toBe('NOT_FOUND');
    expect(err.severity).toBe('low');
    expect(err.recoverable).toBe(false);
  });

  it('should classify unauthorized errors', () => {
    const err = classifyError(new Error('401 Unauthorized'));
    expect(err.code).toBe('UNAUTHORIZED');
  });

  it('should classify forbidden errors', () => {
    const err = classifyError(new Error('403 Forbidden access'));
    expect(err.code).toBe('FORBIDDEN');
  });

  it('should classify rate limit errors', () => {
    const err = classifyError(new Error('Rate limit exceeded'));
    expect(err.code).toBe('RATE_LIMITED');
    expect(err.recoverable).toBe(true);
  });

  it('should classify database errors', () => {
    const err = classifyError(new Error('Database connection failed'));
    expect(err.code).toBe('DATABASE_ERROR');
    expect(err.severity).toBe('high');
  });

  it('should classify memory errors', () => {
    const err = classifyError(new Error('heap out of memory'));
    expect(err.code).toBe('OUT_OF_MEMORY');
    expect(err.severity).toBe('critical');
    expect(err.recoverable).toBe(false);
  });

  it('should default to internal error', () => {
    const err = classifyError(new Error('Something went wrong'));
    expect(err.code).toBe('INTERNAL_ERROR');
  });

  it('should map error codes to status codes', () => {
    expect(getStatusCode({ code: 'NOT_FOUND', message: '', severity: 'low', timestamp: 0, recoverable: false })).toBe(404);
    expect(getStatusCode({ code: 'UNAUTHORIZED', message: '', severity: 'medium', timestamp: 0, recoverable: false })).toBe(401);
    expect(getStatusCode({ code: 'RATE_LIMITED', message: '', severity: 'low', timestamp: 0, recoverable: true })).toBe(429);
    expect(getStatusCode({ code: 'TIMEOUT', message: '', severity: 'medium', timestamp: 0, recoverable: true })).toBe(504);
    expect(getStatusCode({ code: 'DATABASE_ERROR', message: '', severity: 'high', timestamp: 0, recoverable: true })).toBe(503);
    expect(getStatusCode({ code: 'INTERNAL_ERROR', message: '', severity: 'medium', timestamp: 0, recoverable: true })).toBe(500);
  });

  it('should format production error response without internals', () => {
    const appError: AppError = {
      code: 'OUT_OF_MEMORY', message: 'heap overflow', severity: 'critical', timestamp: 1000, recoverable: false,
    };
    const response = formatErrorResponse(appError, true);
    expect(response.message).toBe('Internal server error');
    expect(response.severity).toBeUndefined();
  });

  it('should format development error response with details', () => {
    const appError: AppError = {
      code: 'INTERNAL_ERROR', message: 'details', severity: 'medium', timestamp: 1000, recoverable: true,
    };
    const response = formatErrorResponse(appError, false);
    expect(response.severity).toBe('medium');
    expect(response.recoverable).toBe(true);
  });

  it('should include context in dev mode', () => {
    const appError: AppError = {
      code: 'TEST', message: 'msg', severity: 'low', timestamp: 0, recoverable: true,
      context: { userId: '123' },
    };
    const response = formatErrorResponse(appError, false);
    expect(response.context).toEqual({ userId: '123' });
  });

  it('should alert on critical and high severity', () => {
    expect(shouldAlert({ code: '', message: '', severity: 'critical', timestamp: 0, recoverable: false })).toBe(true);
    expect(shouldAlert({ code: '', message: '', severity: 'high', timestamp: 0, recoverable: true })).toBe(true);
    expect(shouldAlert({ code: '', message: '', severity: 'medium', timestamp: 0, recoverable: true })).toBe(false);
    expect(shouldAlert({ code: '', message: '', severity: 'low', timestamp: 0, recoverable: true })).toBe(false);
  });

  it('should handle error completely', () => {
    const result = handleError(new Error('Database connection failed'));
    expect(result.handled).toBe(true);
    expect(result.logged).toBe(true);
    expect(result.alert).toBe(true);
    expect(result.response.statusCode).toBe(503);
  });

  it('should return null for empty error chain', () => {
    expect(buildErrorChain([])).toBeNull();
  });

  it('should find worst error in chain', () => {
    const errors: AppError[] = [
      { code: 'LOW', message: '', severity: 'low', timestamp: 0, recoverable: true },
      { code: 'CRIT', message: '', severity: 'critical', timestamp: 0, recoverable: false },
      { code: 'MED', message: '', severity: 'medium', timestamp: 0, recoverable: true },
    ];
    const worst = buildErrorChain(errors);
    expect(worst?.code).toBe('CRIT');
  });

  it('should handle single error in chain', () => {
    const errors: AppError[] = [
      { code: 'ONLY', message: '', severity: 'high', timestamp: 0, recoverable: true },
    ];
    expect(buildErrorChain(errors)?.code).toBe('ONLY');
  });
});
