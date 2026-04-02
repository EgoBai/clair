import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  sendSuccess,
  sendCreated,
  sendPaginated,
  sendError,
  sendValidationError,
  sendNotFound,
  sendConflict,
  sendUnauthorized,
  sendForbidden,
  sendInternalError,
  sendServiceUnavailable,
  asyncHandler,
  ErrorCodes,
} from '../utils/apiResponse';

const mockRes = () => {
  const res: any = {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
  };
  return res;
};

describe('apiResponse', () => {
  let res: any;

  beforeEach(() => {
    res = mockRes();
  });

  describe('sendSuccess', () => {
    it('should send success response with 200 status', () => {
      sendSuccess(res, { id: 1 });
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ success: true, data: { id: 1 } })
      );
    });

    it('should accept custom status code', () => {
      sendSuccess(res, { id: 1 }, 201);
      expect(res.status).toHaveBeenCalledWith(201);
    });

    it('should include timestamp', () => {
      sendSuccess(res, {});
      const body = res.json.mock.calls[0][0];
      expect(body.timestamp).toBeDefined();
    });
  });

  describe('sendCreated', () => {
    it('should send 201 status', () => {
      sendCreated(res, { id: 1 });
      expect(res.status).toHaveBeenCalledWith(201);
    });
  });

  describe('sendPaginated', () => {
    it('should send paginated response', () => {
      sendPaginated(res, [{ id: 1 }], 1, 10, 50);
      const body = res.json.mock.calls[0][0];
      expect(body.data.items).toHaveLength(1);
      expect(body.data.pagination.page).toBe(1);
      expect(body.data.pagination.pageSize).toBe(10);
      expect(body.data.pagination.totalCount).toBe(50);
      expect(body.data.pagination.totalPages).toBe(5);
    });
  });

  describe('sendError', () => {
    it('should send error response', () => {
      sendError(res, 400, 'Bad request', 'VALIDATION_ERROR');
      expect(res.status).toHaveBeenCalledWith(400);
      const body = res.json.mock.calls[0][0];
      expect(body.success).toBe(false);
      expect(body.error).toBe('Bad request');
      expect(body.code).toBe('VALIDATION_ERROR');
    });

    it('should include details only in development', () => {
      const origEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'development';
      sendError(res, 400, 'Error', undefined, 'some details');
      const body = res.json.mock.calls[0][0];
      expect(body.details).toBe('some details');
      process.env.NODE_ENV = origEnv;
    });
  });

  describe('sendValidationError', () => {
    it('should send 400 with validation error code', () => {
      sendValidationError(res, 'invalid field');
      expect(res.status).toHaveBeenCalledWith(400);
      const body = res.json.mock.calls[0][0];
      expect(body.code).toBe(ErrorCodes.VALIDATION_ERROR);
    });
  });

  describe('sendNotFound', () => {
    it('should send 404 with default resource', () => {
      sendNotFound(res);
      expect(res.status).toHaveBeenCalledWith(404);
      const body = res.json.mock.calls[0][0];
      expect(body.error).toContain('未找到');
    });

    it('should use custom resource name', () => {
      sendNotFound(res, '股票');
      const body = res.json.mock.calls[0][0];
      expect(body.error).toContain('股票');
    });
  });

  describe('sendConflict', () => {
    it('should send 409 status', () => {
      sendConflict(res, '资源冲突');
      expect(res.status).toHaveBeenCalledWith(409);
      const body = res.json.mock.calls[0][0];
      expect(body.code).toBe(ErrorCodes.CONFLICT);
    });
  });

  describe('sendUnauthorized', () => {
    it('should send 401 status', () => {
      sendUnauthorized(res);
      expect(res.status).toHaveBeenCalledWith(401);
    });

    it('should use custom message', () => {
      sendUnauthorized(res, 'Token过期');
      const body = res.json.mock.calls[0][0];
      expect(body.error).toBe('Token过期');
    });
  });

  describe('sendForbidden', () => {
    it('should send 403 status', () => {
      sendForbidden(res);
      expect(res.status).toHaveBeenCalledWith(403);
    });
  });

  describe('sendInternalError', () => {
    it('should send 500 status', () => {
      sendInternalError(res);
      expect(res.status).toHaveBeenCalledWith(500);
      const body = res.json.mock.calls[0][0];
      expect(body.code).toBe(ErrorCodes.INTERNAL);
    });
  });

  describe('sendServiceUnavailable', () => {
    it('should send 503 status', () => {
      sendServiceUnavailable(res);
      expect(res.status).toHaveBeenCalledWith(503);
    });
  });

  describe('asyncHandler', () => {
    it('should call the function', async () => {
      const handler = vi.fn(async (_req, res) => {
        res.json({ ok: true });
      });
      const wrapped = asyncHandler(handler);
      const req = {} as any;
      const next = vi.fn();

      await wrapped(req, res, next);
      expect(handler).toHaveBeenCalled();
    });

    it('should catch errors and call next', async () => {
      const error = new Error('test error');
      const handler = vi.fn(async () => { throw error; });
      const wrapped = asyncHandler(handler);
      const req = {} as any;
      const next = vi.fn();

      await wrapped(req, res, next);
      await new Promise(r => setTimeout(r, 0));
      expect(next).toHaveBeenCalledWith(error);
    });
  });

  describe('ErrorCodes', () => {
    it('should have correct constant values', () => {
      expect(ErrorCodes.VALIDATION_ERROR).toBe('VALIDATION_ERROR');
      expect(ErrorCodes.NOT_FOUND).toBe('NOT_FOUND');
      expect(ErrorCodes.UNAUTHORIZED).toBe('UNAUTHORIZED');
      expect(ErrorCodes.FORBIDDEN).toBe('FORBIDDEN');
      expect(ErrorCodes.INTERNAL).toBe('INTERNAL_ERROR');
      expect(ErrorCodes.RATE_LIMITED).toBe('RATE_LIMITED');
      expect(ErrorCodes.SERVICE_UNAVAILABLE).toBe('SERVICE_UNAVAILABLE');
    });
  });
});
