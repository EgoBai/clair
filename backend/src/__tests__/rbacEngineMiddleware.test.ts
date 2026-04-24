import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  RBACEngine,
  requirePermission,
  requireRole,
  requireOwnerOrAdmin,
  Action,
  Role,
} from '../utils/rbacEngine';

// Helper to create mock Express Request
function mockReq(overrides: Record<string, any> = {}): any {
  return {
    user: {
      userId: 'user-1',
      roles: ['viewer'],
      ...(overrides.user || {}),
    },
    ip: '192.168.1.1',
    originalUrl: '/api/stocks',
    method: 'GET',
    ...overrides,
  };
}

// Helper to create mock Express Response
function mockRes(): any {
  const res: any = {
    statusCode: 200,
    _json: null,
    _ended: false,
  };
  res.status = vi.fn((code: number) => {
    res.statusCode = code;
    return res;
  });
  res.json = vi.fn((body: any) => {
    res._json = body;
    res._ended = true;
    return res;
  });
  return res;
}

function mockNext(): any {
  return vi.fn();
}

function createEngineWithRoles() {
  const engine = new RBACEngine();

  // Add viewer role
  engine.addRole({
    id: 'viewer',
    name: 'Viewer',
    permissions: [
      { id: 'viewer-read-stock', resource: 'stock', action: 'read', effect: 'allow' },
      { id: 'viewer-read-portfolio', resource: 'portfolio', action: 'read', effect: 'allow' },
    ],
    isSystem: true,
  });

  // Add trader role (inherits viewer)
  engine.addRole({
    id: 'trader',
    name: 'Trader',
    permissions: [
      { id: 'trader-trade', resource: 'stock', action: 'execute', effect: 'allow' },
      { id: 'trader-create-orders', resource: 'order', action: 'create', effect: 'allow' },
    ],
    inherits: ['viewer'],
    isSystem: true,
  });

  // Add admin role
  engine.addRole({
    id: 'admin',
    name: 'Admin',
    permissions: [
      { id: 'admin-all-stock', resource: 'stock', action: '*', effect: 'allow' },
      { id: 'admin-all-system', resource: 'system', action: '*', effect: 'allow' },
    ],
    inherits: ['trader'],
    isSystem: true,
  });

  // Add custom auditor role
  engine.addRole({
    id: 'auditor',
    name: 'Auditor',
    permissions: [
      { id: 'auditor-read-all', resource: '*', action: 'read', effect: 'allow' },
      { id: 'auditor-read-export', resource: 'report', action: 'export', effect: 'allow' },
    ],
    isSystem: false,
  });

  // Add role with deny override
  engine.addRole({
    id: 'restricted-viewer',
    name: 'Restricted Viewer',
    permissions: [
      { id: 'restricted-deny-delete', resource: '*', action: 'delete', effect: 'deny', priority: 10 },
      { id: 'restricted-read-portfolio', resource: 'portfolio', action: 'read', effect: 'allow' },
    ],
    inherits: ['viewer'],
    isSystem: false,
  });

  return engine;
}

function createEngineWithOwnerOnly() {
  const engine = new RBACEngine();
  engine.addRole({
    id: 'user',
    name: 'User',
    permissions: [
      { id: 'user-manage-own', resource: 'profile', action: 'update', effect: 'allow',
        conditions: [{ field: 'resource.attributes.ownerId', operator: 'eq', value: '${userId}' }] },
    ],
    isSystem: true,
  });
  engine.addRole({
    id: 'admin',
    name: 'Admin',
    permissions: [
      { id: 'admin-all', resource: '*', action: '*', effect: 'allow' },
    ],
    isSystem: true,
  });
  return engine;
}

describe('requirePermission middleware', () => {
  let engine: RBACEngine;

  beforeEach(() => {
    engine = createEngineWithRoles();
  });

  it('should call next() when user has permission', () => {
    const middleware = requirePermission(engine, 'read', 'stock');
    const req = mockReq({ user: { userId: 'u1', roles: ['viewer'] } });
    const res = mockRes();
    const next = mockNext();

    middleware(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(res._ended).toBe(false);
  });

  it('should return 403 when user lacks permission', () => {
    const middleware = requirePermission(engine, 'delete', 'stock');
    const req = mockReq({ user: { userId: 'u1', roles: ['viewer'] } });
    const res = mockRes();
    const next = mockNext();

    middleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res._json).toHaveProperty('error', '权限不足');
    expect(res._json).toHaveProperty('code', 'FORBIDDEN');
    expect(next).not.toHaveBeenCalled();
  });

  it('should return 401 when user is not authenticated', () => {
    const middleware = requirePermission(engine, 'read', 'stock');
    const req = mockReq({ user: undefined });
    const res = mockRes();
    const next = mockNext();

    middleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res._json).toHaveProperty('code', 'UNAUTHENTICATED');
    expect(next).not.toHaveBeenCalled();
  });

  it('should support getResourceId callback', () => {
    const getResourceId = (req: any) => req.params?.id || 'stock-123';
    const middleware = requirePermission(engine, 'read', 'stock', getResourceId);
    const req = mockReq({ params: { id: 'stock-456' } });
    const res = mockRes();
    const next = mockNext();

    middleware(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
  });

  it('should return 403 with correct reason in response', () => {
    const middleware = requirePermission(engine, 'delete', 'system');
    const req = mockReq({ user: { userId: 'u1', roles: ['viewer'] } });
    const res = mockRes();
    const next = mockNext();

    middleware(req, res, next);

    expect(res._json).toHaveProperty('reason');
    expect(res._json).toHaveProperty('required');
    expect(res._json.required).toHaveProperty('action', 'delete');
    expect(res._json.required).toHaveProperty('resource', 'system');
  });

  it('should use user.role as fallback when user.roles is absent', () => {
    const middleware = requirePermission(engine, 'read', 'stock');
    const req = mockReq({ user: { userId: 'u2', role: 'viewer' } });
    const res = mockRes();
    const next = mockNext();

    middleware(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
  });

  it('should use user.id as fallback for userId', () => {
    const middleware = requirePermission(engine, 'read', 'portfolio');
    const req = mockReq({ user: { id: 'u3', roles: ['viewer'] } });
    const res = mockRes();
    const next = mockNext();

    middleware(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
  });

  it('should allow admin wildcard permissions', () => {
    const middleware = requirePermission(engine, 'delete', 'stock');
    const req = mockReq({ user: { userId: 'admin1', roles: ['admin'] } });
    const res = mockRes();
    const next = mockNext();

    middleware(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
  });
});

describe('requireRole middleware', () => {
  let engine: RBACEngine;

  beforeEach(() => {
    engine = createEngineWithRoles();
  });

  it('should call next() when user has required role', () => {
    const middleware = requireRole(engine, 'trader');
    const req = mockReq({ user: { userId: 'u1', roles: ['trader'] } });
    const res = mockRes();
    const next = mockNext();

    middleware(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
  });

  it('should check inherited roles', () => {
    // admin inherits trader and viewer
    const middleware = requireRole(engine, 'trader');
    const req = mockReq({ user: { userId: 'u1', roles: ['admin'] } });
    const res = mockRes();
    const next = mockNext();

    middleware(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
  });

  it('should accept any of multiple required roles', () => {
    const middleware = requireRole(engine, 'admin', 'auditor');
    const req = mockReq({ user: { userId: 'u1', roles: ['auditor'] } });
    const res = mockRes();
    const next = mockNext();

    middleware(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
  });

  it('should return 403 when user lacks required role', () => {
    const middleware = requireRole(engine, 'admin');
    const req = mockReq({ user: { userId: 'u1', roles: ['viewer'] } });
    const res = mockRes();
    const next = mockNext();

    middleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res._json).toHaveProperty('code', 'INSUFFICIENT_ROLE');
    expect(res._json).toHaveProperty('required');
    expect(res._json).toHaveProperty('current');
    expect(next).not.toHaveBeenCalled();
  });

  it('should return 401 when not authenticated', () => {
    const middleware = requireRole(engine, 'viewer');
    const req = mockReq({ user: undefined });
    const res = mockRes();
    const next = mockNext();

    middleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res._json).toHaveProperty('code', 'UNAUTHENTICATED');
    expect(next).not.toHaveBeenCalled();
  });

  it('should use user.role fallback when user.roles absent', () => {
    const middleware = requireRole(engine, 'viewer');
    const req = mockReq({ user: { userId: 'u1', role: 'viewer' } });
    const res = mockRes();
    const next = mockNext();

    middleware(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
  });

  it('should grant viewer when role is viewer via inheritance', () => {
    // trader inherits viewer
    const middleware = requireRole(engine, 'viewer');
    const req = mockReq({ user: { userId: 'u1', roles: ['trader'] } });
    const res = mockRes();
    const next = mockNext();

    middleware(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
  });
});

describe('requireOwnerOrAdmin middleware', () => {
  let engine: RBACEngine;

  beforeEach(() => {
    engine = createEngineWithOwnerOnly();
  });

  it('should call next() when user is resource owner', () => {
    const getOwnerId = (req: any) => req.params?.ownerId || 'user-1';
    const middleware = requireOwnerOrAdmin(engine, 'profile', getOwnerId);
    const req = mockReq({ params: { ownerId: 'user-1' } });
    const res = mockRes();
    const next = mockNext();

    middleware(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
  });

  it('should call next() when user is admin (even if not owner)', () => {
    const getOwnerId = () => 'some-other-user';
    const middleware = requireOwnerOrAdmin(engine, 'profile', getOwnerId);
    const req = mockReq({ user: { userId: 'admin1', roles: ['admin'] } });
    const res = mockRes();
    const next = mockNext();

    middleware(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
  });

  it('should return 403 when user is neither owner nor admin', () => {
    const getOwnerId = () => 'some-other-user';
    const middleware = requireOwnerOrAdmin(engine, 'profile', getOwnerId);
    const req = mockReq({ user: { userId: 'u1', roles: ['user'] } });
    const res = mockRes();
    const next = mockNext();

    middleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res._json).toHaveProperty('code', 'OWNER_OR_ADMIN_REQUIRED');
    expect(next).not.toHaveBeenCalled();
  });

  it('should return 401 when user is not authenticated', () => {
    const getOwnerId = () => 'some-owner';
    const middleware = requireOwnerOrAdmin(engine, 'profile', getOwnerId);
    const req = mockReq({ user: undefined });
    const res = mockRes();
    const next = mockNext();

    middleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res._json).toHaveProperty('code', 'UNAUTHENTICATED');
    expect(next).not.toHaveBeenCalled();
  });

  it('should use user.id fallback for userId comparison', () => {
    const getOwnerId = (req: any) => req.params?.ownerId || 'u3';
    const middleware = requireOwnerOrAdmin(engine, 'profile', getOwnerId);
    const req = mockReq({ user: { id: 'u3', roles: ['user'] } });
    const res = mockRes();
    const next = mockNext();

    middleware(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
  });
});
