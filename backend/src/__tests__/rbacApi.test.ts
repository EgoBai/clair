import { describe, it, expect, beforeEach } from 'vitest';
import { RBACEngine, RBACContext } from '../utils/rbacEngine';

/**
 * RBAC REST API 模拟测试
 * 模拟角色管理、权限查询、审计查询等API端点
 */
describe('RBAC API模拟', () => {
  let engine: RBACEngine;

  // 模拟API handler
  const createAPIHandlers = (eng: RBACEngine) => ({
    // GET /api/roles
    listRoles: () => {
      return { status: 200, data: eng.getAllRoles() };
    },

    // GET /api/roles/:id
    getRole: (id: string) => {
      const role = eng.getRole(id);
      if (!role) return { status: 404, error: '角色不存在' };
      return { status: 200, data: role };
    },

    // POST /api/roles
    createRole: (body: any) => {
      if (!body.id || !body.name) {
        return { status: 400, error: '缺少必填字段' };
      }
      const validation = eng.validateRole(body);
      if (!validation.valid) {
        return { status: 400, error: validation.errors.join(', ') };
      }
      eng.addRole(body);
      return { status: 201, data: eng.getRole(body.id) };
    },

    // PUT /api/roles/:id
    updateRole: (id: string, body: any) => {
      const success = eng.updateRole(id, body);
      if (!success) return { status: 403, error: '无法更新角色（可能是系统角色或不存在）' };
      return { status: 200, data: eng.getRole(id) };
    },

    // DELETE /api/roles/:id
    deleteRole: (id: string) => {
      const success = eng.removeRole(id);
      if (!success) return { status: 403, error: '无法删除角色（可能是系统角色或被继承）' };
      return { status: 204 };
    },

    // POST /api/permissions/check
    checkPermission: (body: any) => {
      const { userId, roles, action, resourceType, resourceId } = body;
      const ctx: RBACContext = { userId, roles: roles || [] };
      const result = eng.checkPermission(ctx, action, { type: resourceType, id: resourceId });
      return { status: 200, data: result };
    },

    // GET /api/permissions/effective/:roleId
    getEffectivePermissions: (roleId: string) => {
      const role = eng.getRole(roleId);
      if (!role) return { status: 404, error: '角色不存在' };
      const perms = eng.getEffectivePermissions(roleId);
      return { status: 200, data: perms };
    },

    // GET /api/roles/:id/inheritance
    getInheritanceTree: (id: string) => {
      const role = eng.getRole(id);
      if (!role) return { status: 404, error: '角色不存在' };
      const tree = eng.getInheritanceTree(id);
      return { status: 200, data: tree };
    },

    // GET /api/audit
    getAuditLog: (query: any) => {
      const log = eng.getAuditLog({
        userId: query.userId,
        action: query.action,
        resource: query.resource,
        result: query.result,
        limit: query.limit ? parseInt(query.limit) : 100,
        offset: query.offset ? parseInt(query.offset) : 0,
      });
      return { status: 200, data: log };
    },

    // GET /api/audit/stats
    getAuditStats: () => {
      return { status: 200, data: eng.getAuditStats() };
    },

    // POST /api/permissions/batch-check
    batchCheck: (body: any) => {
      const { userId, roles, checks } = body;
      const ctx: RBACContext = { userId, roles: roles || [] };
      const results = checks.map((c: any) =>
        eng.checkPermission(ctx, c.action, { type: c.resourceType, id: c.resourceId })
      );
      return { status: 200, data: results };
    },
  });

  beforeEach(() => {
    engine = new RBACEngine();
  });

  // ===== 角色管理 API =====

  describe('角色管理 API', () => {
    it('GET /api/roles 返回所有角色', () => {
      const api = createAPIHandlers(engine);
      const res = api.listRoles();
      expect(res.status).toBe(200);
      expect(res.data.length).toBe(6);
    });

    it('GET /api/roles/:id 返回指定角色', () => {
      const api = createAPIHandlers(engine);
      const res = api.getRole('admin');
      expect(res.status).toBe(200);
      expect(res.data!.id).toBe('admin');
    });

    it('GET /api/roles/:id 不存在返回404', () => {
      const api = createAPIHandlers(engine);
      const res = api.getRole('nonexistent');
      expect(res.status).toBe(404);
    });

    it('POST /api/roles 创建角色', () => {
      const api = createAPIHandlers(engine);
      const res = api.createRole({
        id: 'new-role',
        name: '新角色',
        permissions: [{ id: 'nr-1', resource: 'stock', action: 'read', effect: 'allow' }],
      });
      expect(res.status).toBe(201);
      expect(res.data!.name).toBe('新角色');
    });

    it('POST /api/roles 缺少字段返回400', () => {
      const api = createAPIHandlers(engine);
      const res = api.createRole({ name: 'test' });
      expect(res.status).toBe(400);
    });

    it('POST /api/roles 无效角色返回400', () => {
      const api = createAPIHandlers(engine);
      const res = api.createRole({ id: '', name: '', permissions: [] });
      expect(res.status).toBe(400);
    });

    it('PUT /api/roles/:id 更新自定义角色', () => {
      engine.addRole({
        id: 'updatable',
        name: '原始',
        permissions: [{ id: 'u-1', resource: 'stock', action: 'read', effect: 'allow' }],
      });
      const api = createAPIHandlers(engine);
      const res = api.updateRole('updatable', { name: '更新后' });
      expect(res.status).toBe(200);
      expect(res.data!.name).toBe('更新后');
    });

    it('PUT /api/roles/:id 系统角色权限更新返回403', () => {
      const api = createAPIHandlers(engine);
      const res = api.updateRole('superadmin', {
        permissions: [{ id: 'limited', resource: 'stock', action: 'read', effect: 'allow' }],
      });
      expect(res.status).toBe(403);
    });

    it('DELETE /api/roles/:id 删除自定义角色', () => {
      engine.addRole({ id: 'deletable', name: '可删', permissions: [] });
      const api = createAPIHandlers(engine);
      const res = api.deleteRole('deletable');
      expect(res.status).toBe(204);
    });

    it('DELETE /api/roles/:id 系统角色返回403', () => {
      const api = createAPIHandlers(engine);
      const res = api.deleteRole('admin');
      expect(res.status).toBe(403);
    });
  });

  // ===== 权限查询 API =====

  describe('权限查询 API', () => {
    it('POST /api/permissions/check 检查权限', () => {
      const api = createAPIHandlers(engine);
      const res = api.checkPermission({
        userId: '1',
        roles: ['viewer'],
        action: 'read',
        resourceType: 'stock',
      });
      expect(res.status).toBe(200);
      expect(res.data.allowed).toBe(true);
    });

    it('POST /api/permissions/check 拒绝返回原因', () => {
      const api = createAPIHandlers(engine);
      const res = api.checkPermission({
        userId: '2',
        roles: ['viewer'],
        action: 'delete',
        resourceType: 'stock',
      });
      expect(res.status).toBe(200);
      expect(res.data.allowed).toBe(false);
      expect(res.data.reason).toBeTruthy();
    });

    it('GET /api/permissions/effective/:roleId 获取有效权限', () => {
      const api = createAPIHandlers(engine);
      const res = api.getEffectivePermissions('admin');
      expect(res.status).toBe(200);
      expect(res.data!.length).toBeGreaterThan(0);
    });

    it('GET /api/permissions/effective/:roleId 不存在返回404', () => {
      const api = createAPIHandlers(engine);
      const res = api.getEffectivePermissions('nonexistent');
      expect(res.status).toBe(404);
    });

    it('POST /api/permissions/batch-check 批量检查', () => {
      const api = createAPIHandlers(engine);
      const res = api.batchCheck({
        userId: 'batch',
        roles: ['analyst'],
        checks: [
          { action: 'read', resourceType: 'stock' },
          { action: 'export', resourceType: 'stock' },
          { action: 'admin', resourceType: 'system' },
        ],
      });
      expect(res.status).toBe(200);
      expect(res.data).toHaveLength(3);
      expect(res.data[0].allowed).toBe(true);
      expect(res.data[1].allowed).toBe(true);
      expect(res.data[2].allowed).toBe(false);
    });
  });

  // ===== 继承查询 API =====

  describe('继承查询 API', () => {
    it('GET /api/roles/:id/inheritance 获取继承树', () => {
      const api = createAPIHandlers(engine);
      const res = api.getInheritanceTree('admin');
      expect(res.status).toBe(200);
      expect(res.data!.some((n: any) => n.roleId === 'analyst')).toBe(true);
    });

    it('GET /api/roles/:id/inheritance 不存在返回404', () => {
      const api = createAPIHandlers(engine);
      const res = api.getInheritanceTree('nonexistent');
      expect(res.status).toBe(404);
    });
  });

  // ===== 审计查询 API =====

  describe('审计查询 API', () => {
    beforeEach(() => {
      const ctx: RBACContext = { userId: 'api-user', roles: ['superadmin'] };
      engine.checkPermission(ctx, 'read', { type: 'stock' });
      engine.checkPermission(ctx, 'create', { type: 'portfolio' });
    });

    it('GET /api/audit 返回审计日志', () => {
      const api = createAPIHandlers(engine);
      const res = api.getAuditLog({});
      expect(res.status).toBe(200);
      expect(res.data.length).toBe(2);
    });

    it('GET /api/audit?userId=xxx 过滤', () => {
      const api = createAPIHandlers(engine);
      const res = api.getAuditLog({ userId: 'api-user' });
      expect(res.status).toBe(200);
      expect(res.data.length).toBe(2);
    });

    it('GET /api/audit?limit=1 分页', () => {
      const api = createAPIHandlers(engine);
      const res = api.getAuditLog({ limit: '1' });
      expect(res.status).toBe(200);
      expect(res.data.length).toBe(1);
    });

    it('GET /api/audit/stats 返回统计', () => {
      const api = createAPIHandlers(engine);
      const res = api.getAuditStats();
      expect(res.status).toBe(200);
      expect(res.data.total).toBe(2);
      expect(res.data.allowed).toBe(2);
    });
  });

  // ===== 完整API流程 =====

  describe('完整API流程', () => {
    it('创建角色 → 检查权限 → 查看审计 → 删除角色', () => {
      const api = createAPIHandlers(engine);

      // 1. 创建角色
      const createRes = api.createRole({
        id: 'workflow-role',
        name: '工作流角色',
        permissions: [
          { id: 'wf-1', resource: 'stock', action: 'read', effect: 'allow' },
          { id: 'wf-2', resource: 'stock', action: 'export', effect: 'allow' },
        ],
      });
      expect(createRes.status).toBe(201);

      // 2. 检查权限
      const checkRes = api.checkPermission({
        userId: 'wf-user',
        roles: ['workflow-role'],
        action: 'read',
        resourceType: 'stock',
      });
      expect(checkRes.data.allowed).toBe(true);

      // 3. 查看有效权限
      const permsRes = api.getEffectivePermissions('workflow-role');
      expect(permsRes.data!.length).toBe(2);

      // 4. 查看审计
      const auditRes = api.getAuditLog({ userId: 'wf-user' });
      expect(auditRes.data.length).toBe(1);

      // 5. 删除角色
      const deleteRes = api.deleteRole('workflow-role');
      expect(deleteRes.status).toBe(204);

      // 6. 验证删除
      const getRes = api.getRole('workflow-role');
      expect(getRes.status).toBe(404);
    });
  });
});
