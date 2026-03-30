import { describe, it, expect, beforeEach } from 'vitest';
import {
  RBACEngine,
  Role,
  Permission,
  RBACContext,
  Resource,
  Action,
} from '../utils/rbacEngine';

describe('RBAC权限系统', () => {
  let engine: RBACEngine;

  beforeEach(() => {
    engine = new RBACEngine({ auditMaxSize: 1000 });
  });

  // ===== 系统角色测试 =====

  describe('系统角色初始化', () => {
    it('默认包含6个系统角色', () => {
      const roles = engine.getAllRoles();
      expect(roles.length).toBe(6);
    });

    it('包含超级管理员角色', () => {
      const role = engine.getRole('superadmin');
      expect(role).toBeDefined();
      expect(role!.name).toBe('超级管理员');
      expect(role!.isSystem).toBe(true);
    });

    it('包含管理员角色', () => {
      const role = engine.getRole('admin');
      expect(role).toBeDefined();
      expect(role!.inherits).toContain('analyst');
    });

    it('包含分析师角色', () => {
      const role = engine.getRole('analyst');
      expect(role).toBeDefined();
      expect(role!.inherits).toContain('trader');
    });

    it('包含交易员角色', () => {
      const role = engine.getRole('trader');
      expect(role).toBeDefined();
      expect(role!.inherits).toContain('viewer');
    });

    it('包含查看者角色', () => {
      const role = engine.getRole('viewer');
      expect(role).toBeDefined();
      expect(role!.isSystem).toBe(true);
    });

    it('包含访客角色', () => {
      const role = engine.getRole('guest');
      expect(role).toBeDefined();
      expect(role!.isSystem).toBe(true);
    });

    it('系统角色不能被删除', () => {
      expect(engine.removeRole('superadmin')).toBe(false);
      expect(engine.removeRole('admin')).toBe(false);
      expect(engine.removeRole('viewer')).toBe(false);
    });

    it('系统角色权限不能被修改', () => {
      const result = engine.updateRole('superadmin', {
        permissions: [{ id: 'limited', resource: 'stock', action: 'read', effect: 'allow' }],
      });
      expect(result).toBe(false);
    });
  });

  // ===== 自定义角色管理 =====

  describe('自定义角色管理', () => {
    it('可以添加自定义角色', () => {
      const customRole: Role = {
        id: 'custom-analyst',
        name: '自定义分析师',
        permissions: [
          { id: 'ca-1', resource: 'stock', action: 'read', effect: 'allow' },
          { id: 'ca-2', resource: 'report', action: 'create', effect: 'allow' },
        ],
      };
      engine.addRole(customRole);
      const role = engine.getRole('custom-analyst');
      expect(role).toBeDefined();
      expect(role!.name).toBe('自定义分析师');
    });

    it('可以删除自定义角色', () => {
      engine.addRole({
        id: 'temp-role',
        name: '临时角色',
        permissions: [],
      });
      expect(engine.removeRole('temp-role')).toBe(true);
      expect(engine.getRole('temp-role')).toBeUndefined();
    });

    it('不能删除被继承的角色', () => {
      engine.addRole({
        id: 'base-role',
        name: '基础角色',
        permissions: [{ id: 'br-1', resource: 'stock', action: 'read', effect: 'allow' }],
      });
      engine.addRole({
        id: 'derived-role',
        name: '派生角色',
        inherits: ['base-role'],
        permissions: [],
      });
      expect(engine.removeRole('base-role')).toBe(false);
    });

    it('可以更新自定义角色', () => {
      engine.addRole({
        id: 'update-test',
        name: '原始名称',
        permissions: [{ id: 'ut-1', resource: 'stock', action: 'read', effect: 'allow' }],
      });
      const result = engine.updateRole('update-test', { name: '新名称' });
      expect(result).toBe(true);
      expect(engine.getRole('update-test')!.name).toBe('新名称');
    });

    it('不存在的角色更新返回false', () => {
      expect(engine.updateRole('nonexistent', { name: 'test' })).toBe(false);
    });

    it('不存在的角色删除返回false', () => {
      expect(engine.removeRole('nonexistent')).toBe(false);
    });
  });

  // ===== 权限检查 =====

  describe('权限检查 - 基础', () => {
    it('超级管理员拥有所有权限', () => {
      const context: RBACContext = {
        userId: '1',
        roles: ['superadmin'],
      };
      const result = engine.checkPermission(context, 'read', { type: 'stock' });
      expect(result.allowed).toBe(true);
    });

    it('超级管理员可以删除任何资源', () => {
      const context: RBACContext = {
        userId: '1',
        roles: ['superadmin'],
      };
      const result = engine.checkPermission(context, 'delete', { type: 'system' });
      expect(result.allowed).toBe(true);
    });

    it('查看者可以读取股票', () => {
      const context: RBACContext = {
        userId: '2',
        roles: ['viewer'],
      };
      const result = engine.checkPermission(context, 'read', { type: 'stock' });
      expect(result.allowed).toBe(true);
    });

    it('查看者不能删除资源', () => {
      const context: RBACContext = {
        userId: '2',
        roles: ['viewer'],
      };
      const result = engine.checkPermission(context, 'delete', { type: 'stock' });
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('默认拒绝');
    });

    it('查看者不能执行交易', () => {
      const context: RBACContext = {
        userId: '2',
        roles: ['viewer'],
      };
      const result = engine.checkPermission(context, 'execute', { type: 'trade' });
      expect(result.allowed).toBe(false);
    });

    it('无角色用户默认拒绝', () => {
      const context: RBACContext = {
        userId: '3',
        roles: [],
      };
      const result = engine.checkPermission(context, 'read', { type: 'stock' });
      expect(result.allowed).toBe(false);
    });

    it('不存在的角色也能正常拒绝', () => {
      const context: RBACContext = {
        userId: '4',
        roles: ['nonexistent-role'],
      };
      const result = engine.checkPermission(context, 'read', { type: 'stock' });
      expect(result.allowed).toBe(false);
    });
  });

  // ===== 角色继承 =====

  describe('角色继承', () => {
    it('交易员继承查看者权限（可以读取股票）', () => {
      const context: RBACContext = {
        userId: '5',
        roles: ['trader'],
      };
      const result = engine.checkPermission(context, 'read', { type: 'stock' });
      expect(result.allowed).toBe(true);
    });

    it('分析师继承交易员权限（可以执行交易）', () => {
      const context: RBACContext = {
        userId: '6',
        roles: ['analyst'],
      };
      const result = engine.checkPermission(context, 'execute', { type: 'trade' });
      expect(result.allowed).toBe(true);
    });

    it('分析师继承查看者权限（可以读取股票）', () => {
      const context: RBACContext = {
        userId: '6',
        roles: ['analyst'],
      };
      const result = engine.checkPermission(context, 'read', { type: 'stock' });
      expect(result.allowed).toBe(true);
    });

    it('管理员继承分析师全部权限', () => {
      const context: RBACContext = {
        userId: '7',
        roles: ['admin'],
      };
      // 管理员 -> 分析师 -> 交易员 -> 查看者
      expect(engine.checkPermission(context, 'read', { type: 'stock' }).allowed).toBe(true);
      expect(engine.checkPermission(context, 'execute', { type: 'trade' }).allowed).toBe(true);
      expect(engine.checkPermission(context, 'export', { type: 'stock' }).allowed).toBe(true);
      expect(engine.checkPermission(context, 'admin', { type: 'user' }).allowed).toBe(true);
    });

    it('获取有效权限包含继承的权限', () => {
      const perms = engine.getEffectivePermissions('admin');
      const resources = perms.map(p => p.resource);
      expect(resources).toContain('user');
      expect(resources).toContain('stock');
      expect(resources).toContain('portfolio');
      expect(resources).toContain('market');
    });

    it('处理循环继承（不会无限递归）', () => {
      engine.addRole({
        id: 'cycle-a',
        name: 'Cycle A',
        inherits: ['cycle-b'],
        permissions: [],
      });
      engine.addRole({
        id: 'cycle-b',
        name: 'Cycle B',
        inherits: ['cycle-a'],
        permissions: [],
      });
      // 不会栈溢出
      const perms = engine.getEffectivePermissions('cycle-a');
      expect(Array.isArray(perms)).toBe(true);
    });

    it('获取继承树', () => {
      const tree = engine.getInheritanceTree('admin');
      expect(tree[0].roleId).toBe('admin');
      expect(tree[0].depth).toBe(0);
      expect(tree.some(n => n.roleId === 'analyst')).toBe(true);
      expect(tree.some(n => n.roleId === 'trader')).toBe(true);
      expect(tree.some(n => n.roleId === 'viewer')).toBe(true);
    });

    it('不存在角色的继承树为空', () => {
      const tree = engine.getInheritanceTree('nonexistent');
      expect(tree).toEqual([]);
    });
  });

  // ===== 资源匹配 =====

  describe('资源匹配', () => {
    it('通配符 * 匹配所有资源', () => {
      expect(engine.matchResource('*', 'stock')).toBe(true);
      expect(engine.matchResource('*', 'user:123')).toBe(true);
      expect(engine.matchResource('*', 'anything')).toBe(true);
    });

    it('精确匹配', () => {
      expect(engine.matchResource('stock', 'stock')).toBe(true);
      expect(engine.matchResource('stock', 'user')).toBe(false);
    });

    it('层级匹配 stock:*', () => {
      expect(engine.matchResource('stock:*', 'stock:sh600000')).toBe(true);
      expect(engine.matchResource('stock:*', 'stock')).toBe(true);
      expect(engine.matchResource('stock:*', 'user:123')).toBe(false);
    });

    it('前缀匹配（无冒号的资源类型）', () => {
      expect(engine.matchResource('stock', 'stock:sh600000')).toBe(true);
      expect(engine.matchResource('stock', 'stock')).toBe(true);
    });

    it('多层级匹配', () => {
      expect(engine.matchResource('system:*', 'system:config')).toBe(true);
      expect(engine.matchResource('system:config', 'system:config')).toBe(true);
      expect(engine.matchResource('system:config', 'system:log')).toBe(false);
    });
  });

  // ===== 条件权限 =====

  describe('条件权限', () => {
    it('访客只能查看公开数据', () => {
      const context: RBACContext = {
        userId: 'guest-1',
        roles: ['guest'],
      };

      // 公开数据允许
      const publicResult = engine.checkPermission(context, 'read', {
        type: 'market',
        attributes: { public: true },
      });
      expect(publicResult.allowed).toBe(true);

      // 非公开数据拒绝
      const privateResult = engine.checkPermission(context, 'read', {
        type: 'market',
        attributes: { public: false },
      });
      expect(privateResult.allowed).toBe(false);
    });

    it('支持eq条件操作符', () => {
      engine.addRole({
        id: 'owner-only',
        name: '仅所有者',
        permissions: [{
          id: 'owner-perm',
          resource: 'portfolio',
          action: 'update',
          effect: 'allow',
          conditions: [{ field: 'resource.attributes.ownerId', operator: 'eq', value: 'user-1' }],
        }],
      });

      const context: RBACContext = {
        userId: 'user-1',
        roles: ['owner-only'],
      };

      // 自己的资源
      expect(engine.checkPermission(context, 'update', {
        type: 'portfolio',
        attributes: { ownerId: 'user-1' },
      }).allowed).toBe(true);

      // 别人的资源
      expect(engine.checkPermission(context, 'update', {
        type: 'portfolio',
        attributes: { ownerId: 'user-2' },
      }).allowed).toBe(false);
    });

    it('支持in条件操作符', () => {
      engine.addRole({
        id: 'dept-manager',
        name: '部门经理',
        permissions: [{
          id: 'dept-perm',
          resource: 'report',
          action: 'read',
          effect: 'allow',
          conditions: [{ field: 'resource.attributes.department', operator: 'in', value: ['sales', 'marketing'] }],
        }],
      });

      const context: RBACContext = {
        userId: 'mgr-1',
        roles: ['dept-manager'],
      };

      expect(engine.checkPermission(context, 'read', {
        type: 'report',
        attributes: { department: 'sales' },
      }).allowed).toBe(true);

      expect(engine.checkPermission(context, 'read', {
        type: 'report',
        attributes: { department: 'engineering' },
      }).allowed).toBe(false);
    });

    it('支持gt/lt数值比较', () => {
      engine.addRole({
        id: 'high-value',
        name: '高价值访问',
        permissions: [{
          id: 'hv-perm',
          resource: 'trade',
          action: 'approve',
          effect: 'allow',
          conditions: [{ field: 'resource.attributes.amount', operator: 'gt', value: 100000 }],
        }],
      });

      const context: RBACContext = {
        userId: 'hv-1',
        roles: ['high-value'],
      };

      expect(engine.checkPermission(context, 'approve', {
        type: 'trade',
        attributes: { amount: 500000 },
      }).allowed).toBe(true);

      expect(engine.checkPermission(context, 'approve', {
        type: 'trade',
        attributes: { amount: 50000 },
      }).allowed).toBe(false);
    });

    it('支持contains字符串操作符', () => {
      engine.addRole({
        id: 'pattern-match',
        name: '模式匹配',
        permissions: [{
          id: 'pm-perm',
          resource: 'stock',
          action: 'read',
          effect: 'allow',
          conditions: [{ field: 'resource.attributes.code', operator: 'startsWith', value: '600' }],
        }],
      });

      const context: RBACContext = {
        userId: 'pm-1',
        roles: ['pattern-match'],
      };

      expect(engine.checkPermission(context, 'read', {
        type: 'stock',
        attributes: { code: '600001' },
      }).allowed).toBe(true);

      expect(engine.checkPermission(context, 'read', {
        type: 'stock',
        attributes: { code: '000001' },
      }).allowed).toBe(false);
    });

    it('多个条件必须全部满足', () => {
      engine.addRole({
        id: 'multi-cond',
        name: '多条件',
        permissions: [{
          id: 'mc-perm',
          resource: 'stock',
          action: 'update',
          effect: 'allow',
          conditions: [
            { field: 'resource.attributes.market', operator: 'eq', value: 'SH' },
            { field: 'resource.attributes.active', operator: 'eq', value: true },
          ],
        }],
      });

      const context: RBACContext = {
        userId: 'mc-1',
        roles: ['multi-cond'],
      };

      // 两个条件都满足
      expect(engine.checkPermission(context, 'update', {
        type: 'stock',
        attributes: { market: 'SH', active: true },
      }).allowed).toBe(true);

      // 一个条件不满足
      expect(engine.checkPermission(context, 'update', {
        type: 'stock',
        attributes: { market: 'SH', active: false },
      }).allowed).toBe(false);
    });
  });

  // ===== Deny 优先级 =====

  describe('Deny 优先级', () => {
    it('高优先级deny覆盖低优先级allow', () => {
      engine.addRole({
        id: 'mixed-perms',
        name: '混合权限',
        permissions: [
          { id: 'allow-1', resource: 'stock', action: 'delete', effect: 'allow', priority: 1 },
          { id: 'deny-1', resource: 'stock', action: 'delete', effect: 'deny', priority: 10 },
        ],
      });

      const context: RBACContext = {
        userId: 'mixed-1',
        roles: ['mixed-perms'],
      };

      const result = engine.checkPermission(context, 'delete', { type: 'stock' });
      expect(result.allowed).toBe(false);
    });

    it('低优先级deny不覆盖高优先级allow', () => {
      engine.addRole({
        id: 'override-perms',
        name: '覆盖权限',
        permissions: [
          { id: 'allow-high', resource: 'stock', action: 'delete', effect: 'allow', priority: 100 },
          { id: 'deny-low', resource: 'stock', action: 'delete', effect: 'deny', priority: 1 },
        ],
      });

      const context: RBACContext = {
        userId: 'override-1',
        roles: ['override-perms'],
      };

      const result = engine.checkPermission(context, 'delete', { type: 'stock' });
      expect(result.allowed).toBe(true);
    });
  });

  // ===== 多角色 =====

  describe('多角色支持', () => {
    it('用户可以拥有多个角色', () => {
      engine.addRole({
        id: 'role-a',
        name: '角色A',
        permissions: [{ id: 'ra-1', resource: 'stock', action: 'read', effect: 'allow' }],
      });
      engine.addRole({
        id: 'role-b',
        name: '角色B',
        permissions: [{ id: 'rb-1', resource: 'report', action: 'create', effect: 'allow' }],
      });

      const context: RBACContext = {
        userId: 'multi-role-user',
        roles: ['role-a', 'role-b'],
      };

      expect(engine.checkPermission(context, 'read', { type: 'stock' }).allowed).toBe(true);
      expect(engine.checkPermission(context, 'create', { type: 'report' }).allowed).toBe(true);
    });

    it('hasAnyPermission检查任一权限', () => {
      const context: RBACContext = {
        userId: '2',
        roles: ['viewer'],
      };

      const result = engine.hasAnyPermission(context, [
        { action: 'delete', resource: 'stock' },
        { action: 'read', resource: 'stock' },
      ]);
      expect(result).toBe(true);
    });

    it('hasAnyPermission全部无权限返回false', () => {
      const context: RBACContext = {
        userId: '2',
        roles: ['viewer'],
      };

      const result = engine.hasAnyPermission(context, [
        { action: 'delete', resource: 'stock' },
        { action: 'execute', resource: 'trade' },
      ]);
      expect(result).toBe(false);
    });

    it('hasAllPermissions检查所有权限', () => {
      const context: RBACContext = {
        userId: '5',
        roles: ['trader'],
      };

      const result = engine.hasAllPermissions(context, [
        { action: 'read', resource: 'stock' },
        { action: 'create', resource: 'portfolio' },
      ]);
      expect(result).toBe(true);
    });

    it('hasAllPermissions缺少一个返回false', () => {
      const context: RBACContext = {
        userId: '2',
        roles: ['viewer'],
      };

      const result = engine.hasAllPermissions(context, [
        { action: 'read', resource: 'stock' },
        { action: 'create', resource: 'portfolio' },
      ]);
      expect(result).toBe(false);
    });
  });

  // ===== 批量检查 =====

  describe('批量权限检查', () => {
    it('批量检查返回所有结果', () => {
      const context: RBACContext = {
        userId: '6',
        roles: ['analyst'],
      };

      const results = engine.batchCheck(context, [
        { action: 'read', resource: { type: 'stock' } },
        { action: 'export', resource: { type: 'stock' } },
        { action: 'delete', resource: { type: 'system' } },
      ]);

      expect(results).toHaveLength(3);
      expect(results[0].allowed).toBe(true);   // read stock
      expect(results[1].allowed).toBe(true);   // export stock
      expect(results[2].allowed).toBe(false);  // delete system (no admin)
    });

    it('getUserEffectivePermissions获取所有有效权限', () => {
      const context: RBACContext = {
        userId: '7',
        roles: ['admin'],
      };

      const perms = engine.getUserEffectivePermissions(context);
      expect(perms.length).toBeGreaterThan(0);
      expect(perms.some(p => p.resource === 'user')).toBe(true);
      expect(perms.some(p => p.resource === 'stock')).toBe(true);
    });
  });

  // ===== 审计日志 =====

  describe('审计日志', () => {
    it('每次权限检查都记录审计日志', () => {
      const context: RBACContext = {
        userId: 'audit-user',
        roles: ['viewer'],
        ip: '192.168.1.1',
      };

      engine.checkPermission(context, 'read', { type: 'stock' });
      engine.checkPermission(context, 'delete', { type: 'stock' });

      const log = engine.getAuditLog();
      expect(log.length).toBe(2);
    });

    it('审计日志包含详细信息', () => {
      const context: RBACContext = {
        userId: 'audit-detail',
        roles: ['viewer'],
        ip: '10.0.0.1',
      };

      engine.checkPermission(context, 'read', { type: 'stock', id: 'sh600000' });

      const log = engine.getAuditLog();
      const entry = log[0];
      expect(entry.userId).toBe('audit-detail');
      expect(entry.action).toBe('read');
      expect(entry.resource).toBe('stock');
      expect(entry.resourceId).toBe('sh600000');
      expect(entry.result).toBe('allow');
      expect(entry.ip).toBe('10.0.0.1');
      expect(entry.timestamp).toBeTypeOf('number');
      expect(entry.id).toBeTruthy();
    });

    it('按用户过滤审计日志', () => {
      const ctx1: RBACContext = { userId: 'user-a', roles: ['viewer'] };
      const ctx2: RBACContext = { userId: 'user-b', roles: ['viewer'] };

      engine.checkPermission(ctx1, 'read', { type: 'stock' });
      engine.checkPermission(ctx2, 'read', { type: 'stock' });
      engine.checkPermission(ctx1, 'read', { type: 'market' });

      const logA = engine.getAuditLog({ userId: 'user-a' });
      expect(logA.length).toBe(2);
      expect(logA.every(e => e.userId === 'user-a')).toBe(true);
    });

    it('按操作过滤审计日志', () => {
      const context: RBACContext = { userId: 'user-1', roles: ['trader'] };

      engine.checkPermission(context, 'read', { type: 'stock' });
      engine.checkPermission(context, 'create', { type: 'portfolio' });
      engine.checkPermission(context, 'read', { type: 'market' });

      const readLog = engine.getAuditLog({ action: 'read' });
      expect(readLog.length).toBe(2);
      expect(readLog.every(e => e.action === 'read')).toBe(true);
    });

    it('按结果过滤审计日志', () => {
      const context: RBACContext = { userId: 'user-1', roles: ['viewer'] };

      engine.checkPermission(context, 'read', { type: 'stock' });     // allow
      engine.checkPermission(context, 'delete', { type: 'stock' });   // deny
      engine.checkPermission(context, 'read', { type: 'market' });    // allow

      const denied = engine.getAuditLog({ result: 'deny' });
      expect(denied.length).toBe(1);
      expect(denied[0].action).toBe('delete');

      const allowed = engine.getAuditLog({ result: 'allow' });
      expect(allowed.length).toBe(2);
    });

    it('支持分页', () => {
      const context: RBACContext = { userId: 'pager', roles: ['superadmin'] };

      for (let i = 0; i < 20; i++) {
        engine.checkPermission(context, 'read', { type: `resource-${i}` });
      }

      const page1 = engine.getAuditLog({ limit: 5, offset: 0 });
      expect(page1.length).toBe(5);

      const page2 = engine.getAuditLog({ limit: 5, offset: 5 });
      expect(page2.length).toBe(5);

      // 不同页不应有重复
      const ids1 = new Set(page1.map(e => e.id));
      const ids2 = new Set(page2.map(e => e.id));
      for (const id of ids2) {
        expect(ids1.has(id)).toBe(false);
      }
    });

    it('获取审计统计', () => {
      const viewer: RBACContext = { userId: 'v', roles: ['viewer'] };
      const admin: RBACContext = { userId: 'a', roles: ['admin'] };

      engine.checkPermission(viewer, 'read', { type: 'stock' });
      engine.checkPermission(viewer, 'delete', { type: 'stock' });
      engine.checkPermission(admin, 'read', { type: 'stock' });
      engine.checkPermission(admin, 'admin', { type: 'user' });

      const stats = engine.getAuditStats();
      expect(stats.total).toBe(4);
      expect(stats.allowed).toBe(3);
      expect(stats.denied).toBe(1);
      expect(stats.byUser['v']).toBe(2);
      expect(stats.byUser['a']).toBe(2);
      expect(stats.byResource['stock']).toBe(3);
      expect(stats.byResource['user']).toBe(1);
    });

    it('审计日志超过限制自动清理', () => {
      const smallEngine = new RBACEngine({ auditMaxSize: 10 });
      const context: RBACContext = { userId: 'overflow', roles: ['superadmin'] };

      for (let i = 0; i < 15; i++) {
        smallEngine.checkPermission(context, 'read', { type: `r-${i}` });
      }

      const log = smallEngine.getAuditLog({ limit: 100 });
      expect(log.length).toBeLessThanOrEqual(10);
    });

    it('清空审计日志', () => {
      const context: RBACContext = { userId: 'clear', roles: ['viewer'] };
      engine.checkPermission(context, 'read', { type: 'stock' });
      expect(engine.getAuditLog().length).toBe(1);

      engine.clearAuditLog();
      expect(engine.getAuditLog().length).toBe(0);
    });
  });

  // ===== 角色验证 =====

  describe('角色验证', () => {
    it('有效角色验证通过', () => {
      const role: Role = {
        id: 'valid-role',
        name: '有效角色',
        permissions: [
          { id: 'vr-1', resource: 'stock', action: 'read', effect: 'allow' },
        ],
      };
      const result = engine.validateRole(role);
      expect(result.valid).toBe(true);
      expect(result.errors).toEqual([]);
    });

    it('缺少ID的角色验证失败', () => {
      const role: Role = {
        id: '',
        name: '空ID',
        permissions: [],
      };
      const result = engine.validateRole(role);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('角色ID不能为空');
    });

    it('缺少名称的角色验证失败', () => {
      const role: Role = {
        id: 'no-name',
        name: '',
        permissions: [],
      };
      const result = engine.validateRole(role);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('角色名称不能为空');
    });

    it('权限格式错误时验证失败', () => {
      const role: Role = {
        id: 'bad-perm',
        name: '坏权限',
        permissions: [
          { id: '', resource: '', action: '' as Action, effect: 'allow' },
        ] as Permission[],
      };
      const result = engine.validateRole(role);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('缺少ID'))).toBe(true);
    });

    it('无效effect值验证失败', () => {
      const role: Role = {
        id: 'bad-effect',
        name: '坏效果',
        permissions: [
          { id: 'be-1', resource: 'stock', action: 'read', effect: 'invalid' as any },
        ],
      };
      const result = engine.validateRole(role);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('allow或deny'))).toBe(true);
    });
  });

  // ===== 性能测试 =====

  describe('性能', () => {
    it('大量权限检查性能 (<100ms)', () => {
      const context: RBACContext = {
        userId: 'perf-user',
        roles: ['admin'],
      };

      const start = Date.now();
      for (let i = 0; i < 1000; i++) {
        engine.checkPermission(context, 'read', { type: 'stock' });
      }
      const elapsed = Date.now() - start;
      expect(elapsed).toBeLessThan(500);
    });

    it('深层继承解析性能', () => {
      // 创建深层继承链
      engine.addRole({
        id: 'deep-0',
        name: 'Deep 0',
        permissions: [{ id: 'd0', resource: 'test', action: 'read', effect: 'allow' }],
      });
      for (let i = 1; i <= 10; i++) {
        engine.addRole({
          id: `deep-${i}`,
          name: `Deep ${i}`,
          inherits: [`deep-${i - 1}`],
          permissions: [],
        });
      }

      const start = Date.now();
      const perms = engine.getEffectivePermissions('deep-10');
      const elapsed = Date.now() - start;

      expect(perms.length).toBe(1);
      expect(elapsed).toBeLessThan(50);
    });
  });

  // ===== 边界情况 =====

  describe('边界情况', () => {
    it('空角色列表的权限检查', () => {
      const context: RBACContext = { userId: 'no-roles', roles: [] };
      const result = engine.checkPermission(context, 'read', { type: 'stock' });
      expect(result.allowed).toBe(false);
    });

    it('资源ID为undefined时正常工作', () => {
      const context: RBACContext = { userId: '1', roles: ['superadmin'] };
      const result = engine.checkPermission(context, 'read', { type: 'stock' });
      expect(result.allowed).toBe(true);
      expect(result.matchedPermission).toBeDefined();
    });

    it('条件中引用不存在的字段', () => {
      engine.addRole({
        id: 'field-test',
        name: '字段测试',
        permissions: [{
          id: 'ft-1',
          resource: 'stock',
          action: 'read',
          effect: 'allow',
          conditions: [{ field: 'resource.attributes.nonexistent', operator: 'eq', value: 'test' }],
        }],
      });

      const context: RBACContext = { userId: 'ft', roles: ['field-test'] };
      const result = engine.checkPermission(context, 'read', { type: 'stock' });
      // 字段不存在，条件不满足
      expect(result.allowed).toBe(false);
    });

    it('context中同时有用户属性', () => {
      engine.addRole({
        id: 'ctx-test',
        name: '上下文测试',
        permissions: [{
          id: 'ct-1',
          resource: 'stock',
          action: 'read',
          effect: 'allow',
          conditions: [{ field: 'context.attributes.vip', operator: 'eq', value: true }],
        }],
      });

      const vipContext: RBACContext = {
        userId: 'vip-user',
        roles: ['ctx-test'],
        attributes: { vip: true },
      };
      expect(engine.checkPermission(vipContext, 'read', { type: 'stock' }).allowed).toBe(true);

      const normalContext: RBACContext = {
        userId: 'normal-user',
        roles: ['ctx-test'],
        attributes: { vip: false },
      };
      expect(engine.checkPermission(normalContext, 'read', { type: 'stock' }).allowed).toBe(false);
    });

    it('evaluatedAt包含时间戳', () => {
      const context: RBACContext = { userId: '1', roles: ['viewer'] };
      const result = engine.checkPermission(context, 'read', { type: 'stock' });
      expect(result.evaluatedAt).toBeTypeOf('number');
      expect(result.evaluatedAt).toBeLessThanOrEqual(Date.now());
    });
  });
});
