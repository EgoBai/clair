import { describe, it, expect } from 'vitest';
import { AppError, ErrorCodes, createValidationError, createNotFoundError, globalErrorHandler, notFoundHandler } from '../middleware/errorHandler';

describe('Error Handler Middleware', () => {
  describe('AppError', () => {
    it('should create an AppError with correct properties', () => {
      const err = new AppError(400, ErrorCodes.VALIDATION_ERROR, '参数验证失败', '详细原因');
      expect(err.statusCode).toBe(400);
      expect(err.code).toBe('VALIDATION_ERROR');
      expect(err.message).toBe('参数验证失败');
      expect(err.detail).toBe('详细原因');
      expect(err.isOperational).toBe(true);
      expect(err.name).toBe('AppError');
    });

    it('should default isOperational to true', () => {
      const err = new AppError(500, 'INTERNAL', 'err');
      expect(err.isOperational).toBe(true);
    });

    it('should accept isOperational = false for unexpected errors', () => {
      const err = new AppError(500, 'INTERNAL', 'err', undefined, false);
      expect(err.isOperational).toBe(false);
    });
  });

  describe('createValidationError', () => {
    it('should create 400 validation error', () => {
      const err = createValidationError('email is required');
      expect(err.statusCode).toBe(400);
      expect(err.code).toBe('VALIDATION_ERROR');
      expect(err.message).toBe('参数验证失败');
      expect(err.detail).toBe('email is required');
    });
  });

  describe('createNotFoundError', () => {
    it('should create 404 not found error', () => {
      const err = createNotFoundError('用户');
      expect(err.statusCode).toBe(404);
      expect(err.code).toBe('NOT_FOUND');
      expect(err.message).toBe('用户未找到');
    });

    it('should use default resource name', () => {
      const err = createNotFoundError();
      expect(err.message).toBe('资源未找到');
    });
  });

  describe('notFoundHandler', () => {
    it('should pass AppError to next with 404', () => {
      let passedError: any = null;
      const next = (err: any) => { passedError = err; };
      const req = { method: 'GET', path: '/api/unknown' } as any;
      const res = {} as any;

      notFoundHandler(req, res, next);
      expect(passedError).toBeInstanceOf(AppError);
      expect(passedError.statusCode).toBe(404);
      expect(passedError.code).toBe('NOT_FOUND');
      expect(passedError.message).toContain('/api/unknown');
    });
  });

  describe('globalErrorHandler', () => {
    it('should format AppError response correctly', () => {
      const ERROR_CODE = 'VALIDATION_ERROR';
      const err = new AppError(400, ERROR_CODE, 'Bad input', 'field x is wrong');
      let statusCode: number | undefined;
      let jsonBody: any;
      const req = { method: 'GET', path: '/test', query: {}, ip: '127.0.0.1', get: () => 'test' } as any;
      const res = {
        status: (code: number) => {
          statusCode = code;
          return { json: (body: any) => { jsonBody = body; } };
        },
      } as any;

      globalErrorHandler(err, req, res, () => {});

      expect(statusCode).toBe(400);
      expect(jsonBody.code).toBe(ERROR_CODE);
      expect(jsonBody.message).toBe('Bad input');
      expect(jsonBody.detail).toBe('field x is wrong'); // dev mode
      expect(jsonBody.timestamp).toBeDefined();
      expect(jsonBody.success).toBeUndefined(); // should NOT have old format
    });

    it('should hide details in production', () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';
      
      const err = new AppError(500, 'INTERNAL', 'Internal error', 'sensitive detail');
      let jsonBody: any;
      const req = { method: 'GET', path: '/test', query: {}, ip: '127.0.0.1', get: () => 'test' } as any;
      const res = {
        status: () => ({ json: (body: any) => { jsonBody = body; } }),
      } as any;

      globalErrorHandler(err, req, res, () => {});
      
      expect(jsonBody.code).toBe('INTERNAL');
      expect(jsonBody.detail).toBeUndefined(); // hidden in production
      
      process.env.NODE_ENV = originalEnv;
    });

    it('should handle regular Error objects (unexpected)', () => {
      let jsonBody: any;
      const req = { method: 'GET', path: '/test', query: {}, ip: '127.0.0.1', get: () => 'test' } as any;
      const res = {
        status: () => ({ json: (body: any) => { jsonBody = body; } }),
      } as any;

      globalErrorHandler(new Error('Database connection failed'), req, res, () => {});

      expect(jsonBody.code).toBe('DATABASE_ERROR');
      expect(jsonBody.message).toBe('数据库服务异常');
      expect(jsonBody.timestamp).toBeDefined();
    });

    it('should handle timeout errors', () => {
      let jsonBody: any;
      const req = { method: 'GET', path: '/test', query: {}, ip: '127.0.0.1', get: () => 'test' } as any;
      const res = {
        status: (code: number) => {
          expect(code).toBe(504);
          return { json: (body: any) => { jsonBody = body; } };
        },
      } as any;

      globalErrorHandler(new Error('Request timeout'), req, res, () => {});

      expect(jsonBody.code).toBe('TIMEOUT');
      expect(jsonBody.message).toBe('请求超时或连接异常');
    });
  });
});
