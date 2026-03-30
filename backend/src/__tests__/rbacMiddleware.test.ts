import { describe, it, expect, beforeEach, vi } from 'vitest';
import { RBACEngine, requirePermission, requireRole, requireOwnerOrAdmin } from '../utils/rbacEngine';

/**
 * RBAC 中间件和API集成测试
 */
describe('RBAC中间件集成', () => {
  let engine: RBACEngine;

  // 模拟 Express Request/Response
  const createMockReq = (user?: any, params?: any, ip?: string) => ({
    user,
    params: params || {},
    ip: ip || '127.0.0.1',
    path: '/test',
    method: 'GET',
  } as any);

  const createMockRes = () => {
    const res: any = {
      statusCode: 200,
      body: null,
      status(code: number) { res.statusCode = code; return res; },
      json(data: any) { res.body = data; return res; },
    };
    return res;
  };

  const mockNext = () => {
    let called = false;
    const fn = () => { called = true; };
    (fn as any).wasCalled = () => called;
    return fn as any;
  };

  beforeEach(() => {
    engine = new RBACEngine();
  });

  // ===== requirePermission 中间件 =====

  describe('requirePermission 中间件', () => {
    it('未认证用户返回401', () => {
      const middleware = requirePermission(engine, 'read', 'stock');
      const req = createMockReq(undefined);
      const res = createMockRes();
      const next = mockNext();

      middleware(req, res, next);

      expect(res.statusCode).toBe(401);
      expect(res.body.code).toBe('UNAUTHENTICATED');
      expect(next.wasCalled()).toBe(false);
    });

    it('有权限用户通过中间件', () => {
      const middleware = requirePermission(engine, 'read', 'stock');
      const req = createMockReq({ userId: '1', role: 'viewer' });
      const res = createMockRes();
      const next = mockNext();

      middleware(req, res, next);

      expect(next.wasCalled()).toBe(true);
    });

    it('无权限用户返回403', () => {
      const middleware = requirePermission(engine, 'delete', 'stock');
      const req = createMockReq({ userId: '2', role: 'viewer' });
      const res = createMockRes();
      const next = mockNext();

      middleware(req, res, next);

      expect(res.statusCode).toBe(403);
      expect(res.body.code).toBe('FORBIDDEN');
      expect(next.wasCalled()).toBe(false);
    });

    it('支持从请求中提取资源ID', () => {
      const middleware = requirePermission(
        engine,
        'read',
        'stock',
        (req) => req.params.stockId
      );
      const req = createMockReq(
        { userId: '1', role: 'viewer' },
        { stockId: 'sh600000' }
      );
      const res = createMockRes();
      const next = mockNext();

      middleware(req, res, next);

      expect(next.wasCalled()).toBe(true);
    });

    it('管理员用户可以通过所有中间件', () => {
      const readMiddleware = requirePermission(engine, 'read', 'stock');
      const writeMiddleware = requirePermission(engine, 'create', 'user');
      const deleteMiddleware = requirePermission(engine, 'delete', 'system');

      const req = createMockReq({ userId: 'admin', role: 'admin' });

      for (const middleware of [readMiddleware, writeMiddleware, deleteMiddleware]) {
        const res = createMockRes();
        const next = mockNext();
        middleware(req, res, next);
        expect(next.wasCalled()).toBe(true);
      }
    });

    it('支持用户多角色', () => {
      const middleware = requirePermission(engine, 'create', 'portfolio');
      const req = createMockReq({ userId: '5', roles: ['trader'] });
      const res = createMockRes();
      const next = mockNext();

      middleware(req, res, next);

      expect(next.wasCalled()).toBe(true);
    });

    it('403响应包含详细信息', () => {
      const middleware = requirePermission(engine, 'execute', 'trade');
      const req = createMockReq({ userId: '2', role: 'viewer' });
      const res = createMockRes();
      const next = mockNext();

      middleware(req, res, next);

      expect(res.body.error).toBeDefined();
      expect(res.body.required).toEqual({ action: 'execute', resource: 'trade' });
    });
  });

  // ===== requireRole 中间件 =====

  describe('requireRole 中间件', () => {
    it('未认证用户返回401', () => {
      const middleware = requireRole(engine, 'admin');
      const req = createMockReq(undefined);
      const res = createMockRes();
      const next = mockNext();

      middleware(req, res, next);

      expect(res.statusCode).toBe(401);
    });

    it('有指定角色的用户通过', () => {
      const middleware = requireRole(engine, 'admin');
      const req = createMockReq({ userId: '7', role: 'admin' });
      const res = createMockRes();
      const next = mockNext();

      middleware(req, res, next);

      expect(next.wasCalled()).toBe(true);
    });

    it('无指定角色的用户返回403', () => {
      const middleware = requireRole(engine, 'admin');
      const req = createMockReq({ userId: '2', role: 'viewer' });
      const res = createMockRes();
      const next = mockNext();

      middleware(req, res, next);

      expect(res.statusCode).toBe(403);
      expect(res.body.code).toBe('INSUFFICIENT_ROLE');
    });

    it('继承角色可以通过中间件', () => {
      // admin 继承 analyst 继承 trader 继承 viewer
      const middleware = requireRole(engine, 'viewer');
      const req = createMockReq({ userId: '7', role: 'admin' });
      const res = createMockRes();
      const next = mockNext();

      middleware(req, res, next);

      expect(next.wasCalled()).toBe(true);
    });

    it('支持多角色要求（任一匹配）', () => {
      const middleware = requireRole(engine, 'admin', 'analyst');
      const req = createMockReq({ userId: '6', role: 'analyst' });
      const res = createMockRes();
      const next = mockNext();

      middleware(req, res, next);

      expect(next.wasCalled()).toBe(true);
    });

    it('角色继承链中任一角色匹配即可', () => {
      // trader 继承 viewer
      const middleware = requireRole(engine, 'viewer');
      const req = createMockReq({ userId: '5', role: 'trader' });
      const res = createMockRes();
      const next = mockNext();

      middleware(req, res, next);

      expect(next.wasCalled()).toBe(true);
    });
  });

  // ===== requireOwnerOrAdmin 中间件 =====

  describe('requireOwnerOrAdmin 中间件', () => {
    it('资源所有者可以通过', () => {
      const middleware = requireOwnerOrAdmin(
        engine,
        'portfolio',
        (req) => req.params.userId
      );
      const req = createMockReq(
        { userId: 'user-1', role: 'viewer' },
        { userId: 'user-1' }
      );
      const res = createMockRes();
      const next = mockNext();

      middleware(req, res, next);

      expect(next.wasCalled()).toBe(true);
    });

    it('非所有者非管理员返回403', () => {
      const middleware = requireOwnerOrAdmin(
        engine,
        'portfolio',
        (req) => req.params.userId
      );
      const req = createMockReq(
        { userId: 'user-1', role: 'viewer' },
        { userId: 'user-2' }
      );
      const res = createMockRes();
      const next = mockNext();

      middleware(req, res, next);

      expect(res.statusCode).toBe(403);
      expect(res.body.code).toBe('OWNER_OR_ADMIN_REQUIRED');
    });

    it('管理员可以访问他人资源', () => {
      const middleware = requireOwnerOrAdmin(
        engine,
        'user',
        (req) => req.params.userId
      );
      const req = createMockReq(
        { userId: 'admin-1', role: 'admin' },
        { userId: 'user-2' }
      );
      const res = createMockRes();
      const next = mockNext();

      middleware(req, res, next);

      expect(next.wasCalled()).toBe(true);
    });

    it('未认证用户返回401', () => {
      const middleware = requireOwnerOrAdmin(
        engine,
        'portfolio',
        (req) => req.params.userId
      );
      const req = createMockReq(undefined);
      const res = createMockRes();
      const next = mockNext();

      middleware(req, res, next);

      expect(res.statusCode).toBe(401);
    });
  });

  // ===== 中间件链 =====

  describe('中间件链', () => {
    it('多个中间件顺序执行', () => {
      const mw1 = requireRole(engine, 'viewer');
      const mw2 = requirePermission(engine, 'read', 'stock');

      const req = createMockReq({ userId: '5', role: 'trader' });
      const res = createMockRes();
      const next1 = mockNext();
      const next2 = mockNext();

      mw1(req, res, next1);
      expect(next1.wasCalled()).toBe(true);

      mw2(req, res, next2);
      expect(next2.wasCalled()).toBe(true);
    });

    it('中间件链中第一个失败就中断', () => {
      const mw1 = requireRole(engine, 'admin');
      const mw2 = requirePermission(engine, 'read', 'stock');

      const req = createMockReq({ userId: '2', role: 'viewer' });
      const res = createMockRes();
      const next1 = mockNext();
      const next2 = mockNext();

      mw1(req, res, next1);
      expect(next1.wasCalled()).toBe(false);
      expect(res.statusCode).toBe(403);

      // 第二个中间件不会被调用（因为第一个已经返回了）
    });
  });

  // ===== 审计日志中间件集成 =====

  describe('审计日志中间件集成', () => {
    it('中间件检查产生审计记录', () => {
      const middleware = requirePermission(engine, 'read', 'stock');
      const req = createMockReq({ userId: 'audit-test', role: 'viewer' });
      const res = createMockRes();
      const next = mockNext();

      middleware(req, res, next);

      const log = engine.getAuditLog({ userId: 'audit-test' });
      expect(log.length).toBe(1);
      expect(log[0].result).toBe('allow');
    });

    it('拒绝的请求也记录审计', () => {
      const middleware = requirePermission(engine, 'delete', 'stock');
      const req = createMockReq({ userId: 'deny-test', role: 'viewer' });
      const res = createMockRes();
      const next = mockNext();

      middleware(req, res, next);

      const log = engine.getAuditLog({ userId: 'deny-test' });
      expect(log.length).toBe(1);
      expect(log[0].result).toBe('deny');
    });
  });
});
