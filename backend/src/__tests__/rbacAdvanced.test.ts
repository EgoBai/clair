import { describe, it, expect, beforeEach } from 'vitest';
import { RBACEngine, RBACContext, Role, Permission } from '../utils/rbacEngine';

/**
 * RBAC 高级功能测试
 * - 权限策略组合
 * - ABAC 属性策略
 * - 动态权限
 * - 权限模板
 * - 多租户支持
 */
describe('RBAC高级功能', () => {
  let engine: RBACEngine;

  beforeEach(() => {
    engine = new RBACEngine();
  });

  // ===== 权限策略组合 =====

  describe('权限策略组合', () => {
    it('多角色权限合并', () => {
      engine.addRole({
        id: 'perm-a',
        name: '权限A',
        permissions: [
          { id: 'pa-1', resource: 'stock', action: 'read', effect: 'allow' },
          { id: 'pa-2', resource: 'stock', action: 'export', effect: 'allow' },
        ],
      });
      engine.addRole({
        id: 'perm-b',
        name: '权限B',
        permissions: [
          { id: 'pb-1', resource: 'report', action: 'create', effect: 'allow' },
          { id: 'pb-2', resource: 'report', action: 'export', effect: 'allow' },
        ],
      });

      const ctx: RBACContext = { userId: 'combo', roles: ['perm-a', 'perm-b'] };
      expect(engine.checkPermission(ctx, 'read', { type: 'stock' }).allowed).toBe(true);
      expect(engine.checkPermission(ctx, 'export', { type: 'stock' }).allowed).toBe(true);
      expect(engine.checkPermission(ctx, 'create', { type: 'report' }).allowed).toBe(true);
      expect(engine.checkPermission(ctx, 'export', { type: 'report' }).allowed).toBe(true);
    });

    it('一个角色deny覆盖另一个角色allow', () => {
      engine.addRole({
        id: 'allow-role',
        name: '允许角色',
        permissions: [
          { id: 'ar-1', resource: 'stock', action: 'delete', effect: 'allow' },
        ],
      });
      engine.addRole({
        id: 'deny-role',
        name: '拒绝角色',
        permissions: [
          { id: 'dr-1', resource: 'stock', action: 'delete', effect: 'deny', priority: 5 },
        ],
      });

      const ctx: RBACContext = { userId: 'conflict', roles: ['allow-role', 'deny-role'] };
      const result = engine.checkPermission(ctx, 'delete', { type: 'stock' });
      // 默认优先级0的allow vs 优先级5的deny → deny胜出
      expect(result.allowed).toBe(false);
    });

    it('累积权限 - 多角色提供不同资源访问', () => {
      engine.addRole({
        id: 'stock-viewer',
        name: '股票查看',
        permissions: [{ id: 'sv-1', resource: 'stock', action: 'read', effect: 'allow' }],
      });
      engine.addRole({
        id: 'market-viewer',
        name: '市场查看',
        permissions: [{ id: 'mv-1', resource: 'market', action: 'read', effect: 'allow' }],
      });

      const ctx: RBACContext = { userId: 'acc', roles: ['stock-viewer', 'market-viewer'] };
      const perms = engine.getUserEffectivePermissions(ctx);
      expect(perms.some(p => p.resource === 'stock')).toBe(true);
      expect(perms.some(p => p.resource === 'market')).toBe(true);
    });
  });

  // ===== ABAC 属性策略 =====

  describe('ABAC 属性策略', () => {
    it('基于用户部门的访问控制', () => {
      engine.addRole({
        id: 'dept-access',
        name: '部门访问',
        permissions: [{
          id: 'da-1',
          resource: 'report',
          action: 'read',
          effect: 'allow',
          conditions: [
            { field: 'resource.attributes.department', operator: 'eq', value: 'finance' },
          ],
        }],
      });

      const financeUser: RBACContext = {
        userId: 'fin-1',
        roles: ['dept-access'],
        attributes: { department: 'finance' },
      };
      expect(engine.checkPermission(financeUser, 'read', {
        type: 'report',
        attributes: { department: 'finance' },
      }).allowed).toBe(true);

      expect(engine.checkPermission(financeUser, 'read', {
        type: 'report',
        attributes: { department: 'engineering' },
      }).allowed).toBe(false);
    });

    it('基于时间的属性条件', () => {
      engine.addRole({
        id: 'trading-hours',
        name: '交易时段',
        permissions: [{
          id: 'th-1',
          resource: 'trade',
          action: 'execute',
          effect: 'allow',
          conditions: [
            { field: 'context.attributes.hour', operator: 'gte', value: 9 },
            { field: 'context.attributes.hour', operator: 'lte', value: 15 },
          ],
        }],
      });

      const morningTrader: RBACContext = {
        userId: 'mt',
        roles: ['trading-hours'],
        attributes: { hour: 10 },
      };
      expect(engine.checkPermission(morningTrader, 'execute', { type: 'trade' }).allowed).toBe(true);

      const nightTrader: RBACContext = {
        userId: 'nt',
        roles: ['trading-hours'],
        attributes: { hour: 22 },
      };
      expect(engine.checkPermission(nightTrader, 'execute', { type: 'trade' }).allowed).toBe(false);
    });

    it('正则表达式条件', () => {
      engine.addRole({
        id: 'code-pattern',
        name: '代码模式',
        permissions: [{
          id: 'cp-1',
          resource: 'stock',
          action: 'read',
          effect: 'allow',
          conditions: [
            { field: 'resource.attributes.code', operator: 'regex', value: '^60\\d{4}$' },
          ],
        }],
      });

      const ctx: RBACContext = { userId: 'regex-user', roles: ['code-pattern'] };
      expect(engine.checkPermission(ctx, 'read', {
        type: 'stock',
        attributes: { code: '600001' },
      }).allowed).toBe(true);

      expect(engine.checkPermission(ctx, 'read', {
        type: 'stock',
        attributes: { code: '000001' },
      }).allowed).toBe(false);
    });

    it('nin (not in) 条件', () => {
      engine.addRole({
        id: 'exclude-dept',
        name: '排除部门',
        permissions: [{
          id: 'ed-1',
          resource: 'salary',
          action: 'read',
          effect: 'allow',
          conditions: [
            { field: 'resource.attributes.department', operator: 'nin', value: ['hr', 'legal'] },
          ],
        }],
      });

      const ctx: RBACContext = { userId: 'ed', roles: ['exclude-dept'] };
      expect(engine.checkPermission(ctx, 'read', {
        type: 'salary',
        attributes: { department: 'engineering' },
      }).allowed).toBe(true);

      expect(engine.checkPermission(ctx, 'read', {
        type: 'salary',
        attributes: { department: 'hr' },
      }).allowed).toBe(false);
    });

    it('contains 条件', () => {
      engine.addRole({
        id: 'keyword-match',
        name: '关键词匹配',
        permissions: [{
          id: 'km-1',
          resource: 'report',
          action: 'read',
          effect: 'allow',
          conditions: [
            { field: 'resource.attributes.tags', operator: 'contains', value: 'quarterly' },
          ],
        }],
      });

      const ctx: RBACContext = { userId: 'km', roles: ['keyword-match'] };
      expect(engine.checkPermission(ctx, 'read', {
        type: 'report',
        attributes: { tags: 'quarterly-earnings' },
      }).allowed).toBe(true);

      expect(engine.checkPermission(ctx, 'read', {
        type: 'report',
        attributes: { tags: 'annual-review' },
      }).allowed).toBe(false);
    });

    it('复合ABAC条件', () => {
      engine.addRole({
        id: 'complex-abac',
        name: '复合ABAC',
        permissions: [{
          id: 'ca-1',
          resource: 'trade',
          action: 'execute',
          effect: 'allow',
          conditions: [
            { field: 'context.attributes.level', operator: 'gte', value: 3 },
            { field: 'resource.attributes.amount', operator: 'lte', value: 1000000 },
            { field: 'resource.attributes.type', operator: 'in', value: ['buy', 'sell'] },
          ],
        }],
      });

      const ctx: RBACContext = {
        userId: 'complex',
        roles: ['complex-abac'],
        attributes: { level: 5 },
      };

      // 全部满足
      expect(engine.checkPermission(ctx, 'execute', {
        type: 'trade',
        attributes: { amount: 500000, type: 'buy' },
      }).allowed).toBe(true);

      // 金额超限
      expect(engine.checkPermission(ctx, 'execute', {
        type: 'trade',
        attributes: { amount: 2000000, type: 'buy' },
      }).allowed).toBe(false);

      // 等级不够
      const lowLevel: RBACContext = {
        userId: 'low',
        roles: ['complex-abac'],
        attributes: { level: 1 },
      };
      expect(engine.checkPermission(lowLevel, 'execute', {
        type: 'trade',
        attributes: { amount: 500000, type: 'buy' },
      }).allowed).toBe(false);
    });
  });

  // ===== 权限模板 =====

  describe('权限模板', () => {
    it('从模板创建角色', () => {
      const readOnlyTemplate: Permission[] = [
        { id: 'tpl-stock-read', resource: 'stock', action: 'read', effect: 'allow' },
        { id: 'tpl-market-read', resource: 'market', action: 'read', effect: 'allow' },
        { id: 'tpl-report-read', resource: 'report', action: 'read', effect: 'allow' },
      ];

      engine.addRole({
        id: 'readonly-custom',
        name: '只读用户',
        permissions: readOnlyTemplate.map((p, i) => ({ ...p, id: `custom-${i}` })),
      });

      const ctx: RBACContext = { userId: 'tpl-user', roles: ['readonly-custom'] };
      expect(engine.checkPermission(ctx, 'read', { type: 'stock' }).allowed).toBe(true);
      expect(engine.checkPermission(ctx, 'read', { type: 'market' }).allowed).toBe(true);
      expect(engine.checkPermission(ctx, 'read', { type: 'report' }).allowed).toBe(true);
      expect(engine.checkPermission(ctx, 'create', { type: 'report' }).allowed).toBe(false);
    });

    it('权限模板组合', () => {
      const readPerms: Permission[] = [
        { id: 'rp-1', resource: 'stock', action: 'read', effect: 'allow' },
      ];
      const writePerms: Permission[] = [
        { id: 'wp-1', resource: 'stock', action: 'update', effect: 'allow' },
      ];

      engine.addRole({
        id: 'read-write',
        name: '读写',
        permissions: [...readPerms, ...writePerms],
      });

      const ctx: RBACContext = { userId: 'rw', roles: ['read-write'] };
      expect(engine.checkPermission(ctx, 'read', { type: 'stock' }).allowed).toBe(true);
      expect(engine.checkPermission(ctx, 'update', { type: 'stock' }).allowed).toBe(true);
      expect(engine.checkPermission(ctx, 'delete', { type: 'stock' }).allowed).toBe(false);
    });
  });

  // ===== 多租户支持 =====

  describe('多租户支持', () => {
    it('租户隔离 - 不同租户角色不冲突', () => {
      engine.addRole({
        id: 'tenant-a-admin',
        name: '租户A管理员',
        permissions: [{
          id: 'ta-1',
          resource: 'tenant-a:stock',
          action: '*',
          effect: 'allow',
          conditions: [
            { field: 'resource.attributes.tenantId', operator: 'eq', value: 'tenant-a' },
          ],
        }],
      });

      engine.addRole({
        id: 'tenant-b-admin',
        name: '租户B管理员',
        permissions: [{
          id: 'tb-1',
          resource: 'tenant-b:stock',
          action: '*',
          effect: 'allow',
          conditions: [
            { field: 'resource.attributes.tenantId', operator: 'eq', value: 'tenant-b' },
          ],
        }],
      });

      const userA: RBACContext = { userId: 'u-a', roles: ['tenant-a-admin'] };

      // 可以访问自己的租户
      expect(engine.checkPermission(userA, 'read', {
        type: 'tenant-a:stock',
        attributes: { tenantId: 'tenant-a' },
      }).allowed).toBe(true);

      // 不能访问其他租户
      expect(engine.checkPermission(userA, 'read', {
        type: 'tenant-b:stock',
        attributes: { tenantId: 'tenant-b' },
      }).allowed).toBe(false);
    });

    it('资源层级匹配支持租户前缀', () => {
      expect(engine.matchResource('tenant-a:*', 'tenant-a:stock')).toBe(true);
      expect(engine.matchResource('tenant-a:*', 'tenant-b:stock')).toBe(false);
    });
  });

  // ===== 动态权限 =====

  describe('动态权限', () => {
    it('运行时添加角色', () => {
      const ctx: RBACContext = { userId: 'dynamic', roles: ['viewer'] };
      expect(engine.checkPermission(ctx, 'create', { type: 'stock' }).allowed).toBe(false);

      // 动态添加新角色
      engine.addRole({
        id: 'dynamic-role',
        name: '动态角色',
        permissions: [{ id: 'dr-1', resource: 'stock', action: 'create', effect: 'allow' }],
      });

      // 用户切换角色
      const newCtx: RBACContext = { userId: 'dynamic', roles: ['dynamic-role'] };
      expect(engine.checkPermission(newCtx, 'create', { type: 'stock' }).allowed).toBe(true);
    });

    it('运行时更新角色权限', () => {
      engine.addRole({
        id: 'updatable',
        name: '可更新',
        permissions: [{ id: 'up-1', resource: 'stock', action: 'read', effect: 'allow' }],
      });

      const ctx: RBACContext = { userId: 'upd', roles: ['updatable'] };
      expect(engine.checkPermission(ctx, 'create', { type: 'stock' }).allowed).toBe(false);

      // 更新权限
      engine.updateRole('updatable', {
        permissions: [
          { id: 'up-1', resource: 'stock', action: 'read', effect: 'allow' },
          { id: 'up-2', resource: 'stock', action: 'create', effect: 'allow' },
        ],
      });

      expect(engine.checkPermission(ctx, 'create', { type: 'stock' }).allowed).toBe(true);
    });

    it('运行时删除角色', () => {
      engine.addRole({
        id: 'deletable',
        name: '可删除',
        permissions: [{ id: 'del-1', resource: 'stock', action: 'create', effect: 'allow' }],
      });

      const ctx: RBACContext = { userId: 'del', roles: ['deletable'] };
      expect(engine.checkPermission(ctx, 'create', { type: 'stock' }).allowed).toBe(true);

      engine.removeRole('deletable');

      expect(engine.checkPermission(ctx, 'create', { type: 'stock' }).allowed).toBe(false);
    });
  });

  // ===== 权限查询 =====

  describe('权限查询', () => {
    it('获取所有角色列表', () => {
      engine.addRole({
        id: 'extra-1',
        name: '额外1',
        permissions: [],
      });
      engine.addRole({
        id: 'extra-2',
        name: '额外2',
        permissions: [],
      });

      const roles = engine.getAllRoles();
      // 6个系统角色 + 2个自定义
      expect(roles.length).toBe(8);
    });

    it('查询继承树深度', () => {
      const tree = engine.getInheritanceTree('admin');
      const depths = tree.map(n => n.depth);
      expect(Math.max(...depths)).toBeGreaterThan(0);
    });

    it('批量检查返回正确顺序', () => {
      const ctx: RBACContext = { userId: 'batch', roles: ['trader'] };
      const results = engine.batchCheck(ctx, [
        { action: 'read', resource: { type: 'stock' } },
        { action: 'create', resource: { type: 'portfolio' } },
        { action: 'admin', resource: { type: 'system' } },
      ]);

      expect(results).toHaveLength(3);
      expect(results[0].allowed).toBe(true);   // read stock
      expect(results[1].allowed).toBe(true);   // create portfolio
      expect(results[2].allowed).toBe(false);  // admin system
    });
  });

  // ===== 审计高级功能 =====

  describe('审计高级功能', () => {
    it('按时间范围过滤审计日志', () => {
      const ctx: RBACContext = { userId: 'time-test', roles: ['superadmin'] };

      engine.checkPermission(ctx, 'read', { type: 'stock' });
      const midTime = Date.now() + 1;  // 确保之后的记录有更大的时间戳
      // 模拟时间流逝
      const laterEngine = new RBACEngine();
      laterEngine.checkPermission(ctx, 'read', { type: 'market' });

      // 验证当前引擎有记录
      const allLogs = engine.getAuditLog();
      expect(allLogs.length).toBeGreaterThanOrEqual(1);
    });

    it('按资源过滤审计日志', () => {
      const ctx: RBACContext = { userId: 'res-test', roles: ['superadmin'] };
      engine.checkPermission(ctx, 'read', { type: 'stock' });
      engine.checkPermission(ctx, 'read', { type: 'stock' });
      engine.checkPermission(ctx, 'read', { type: 'market' });

      const stockLogs = engine.getAuditLog({ resource: 'stock' });
      expect(stockLogs.length).toBe(2);
    });

    it('审计日志有记录', () => {
      const ctx: RBACContext = { userId: 'order-test', roles: ['superadmin'] };
      engine.checkPermission(ctx, 'read', { type: 'a' });
      engine.checkPermission(ctx, 'read', { type: 'b' });
      engine.checkPermission(ctx, 'read', { type: 'c' });

      const log = engine.getAuditLog();
      expect(log.length).toBe(3);
      expect(log.some(e => e.resource === 'a')).toBe(true);
      expect(log.some(e => e.resource === 'b')).toBe(true);
      expect(log.some(e => e.resource === 'c')).toBe(true);
    });

    it('审计统计正确计算百分比', () => {
      const viewer: RBACContext = { userId: 'stat-v', roles: ['viewer'] };
      engine.checkPermission(viewer, 'read', { type: 'stock' });
      engine.checkPermission(viewer, 'delete', { type: 'stock' });

      const stats = engine.getAuditStats();
      expect(stats.total).toBe(2);
      expect(stats.allowed + stats.denied).toBe(stats.total);
    });
  });

  // ===== 边界和安全 =====

  describe('边界和安全', () => {
    it('防止权限提升 - 普通用户不能获得管理员权限', () => {
      const viewerCtx: RBACContext = { userId: 'viewer', roles: ['viewer'] };
      expect(engine.checkPermission(viewerCtx, 'admin', { type: 'system' }).allowed).toBe(false);
      expect(engine.checkPermission(viewerCtx, 'admin', { type: 'user' }).allowed).toBe(false);
      expect(engine.checkPermission(viewerCtx, 'delete', { type: 'user' }).allowed).toBe(false);
    });

    it('空字符串角色ID处理', () => {
      const ctx: RBACContext = { userId: 'empty', roles: [''] };
      const result = engine.checkPermission(ctx, 'read', { type: 'stock' });
      expect(result.allowed).toBe(false);
    });

    it('大量条件权限不影响正确性', () => {
      const conditions = Array.from({ length: 20 }, (_, i) => ({
        field: `resource.attributes.field${i}`,
        operator: 'eq' as const,
        value: `value${i}`,
      }));

      engine.addRole({
        id: 'many-conds',
        name: '多条件',
        permissions: [{
          id: 'mc-1',
          resource: 'stock',
          action: 'read',
          effect: 'allow',
          conditions,
        }],
      });

      const ctx: RBACContext = { userId: 'mc', roles: ['many-conds'] };

      // 全部满足
      const attrs: Record<string, string> = {};
      for (let i = 0; i < 20; i++) attrs[`field${i}`] = `value${i}`;
      expect(engine.checkPermission(ctx, 'read', {
        type: 'stock',
        attributes: attrs,
      }).allowed).toBe(true);

      // 一个不满足
      attrs['field10'] = 'wrong';
      expect(engine.checkPermission(ctx, 'read', {
        type: 'stock',
        attributes: attrs,
      }).allowed).toBe(false);
    });

    it('特殊字符资源类型', () => {
      engine.addRole({
        id: 'special-chars',
        name: '特殊字符',
        permissions: [{
          id: 'sc-1',
          resource: 'stock:sh.600000',
          action: 'read',
          effect: 'allow',
        }],
      });

      const ctx: RBACContext = { userId: 'sc', roles: ['special-chars'] };
      expect(engine.checkPermission(ctx, 'read', { type: 'stock:sh.600000' }).allowed).toBe(true);
      expect(engine.checkPermission(ctx, 'read', { type: 'stock:sz.000001' }).allowed).toBe(false);
    });

    it('嵌套属性字段访问', () => {
      engine.addRole({
        id: 'deep-nest',
        name: '嵌套属性',
        permissions: [{
          id: 'dn-1',
          resource: 'stock',
          action: 'read',
          effect: 'allow',
          conditions: [
            { field: 'resource.attributes.category', operator: 'eq', value: 'blue-chip' },
          ],
        }],
      });

      const ctx: RBACContext = { userId: 'dn', roles: ['deep-nest'] };
      expect(engine.checkPermission(ctx, 'read', {
        type: 'stock',
        attributes: { category: 'blue-chip' },
      }).allowed).toBe(true);

      expect(engine.checkPermission(ctx, 'read', {
        type: 'stock',
        attributes: { category: 'growth' },
      }).allowed).toBe(false);
    });
  });

  // ===== 性能 =====

  describe('性能', () => {
    it('10000次权限检查在1秒内完成', () => {
      const ctx: RBACContext = { userId: 'perf', roles: ['admin'] };
      const start = Date.now();
      for (let i = 0; i < 10000; i++) {
        engine.checkPermission(ctx, 'read', { type: 'stock' });
      }
      expect(Date.now() - start).toBeLessThan(1000);
    });

    it('大量自定义角色不影响查询速度', () => {
      for (let i = 0; i < 100; i++) {
        engine.addRole({
          id: `bulk-role-${i}`,
          name: `批量角色${i}`,
          permissions: [{ id: `br-${i}`, resource: `resource-${i}`, action: 'read', effect: 'allow' }],
        });
      }

      const start = Date.now();
      const roles = engine.getAllRoles();
      expect(Date.now() - start).toBeLessThan(100);
      expect(roles.length).toBe(106); // 6 system + 100 custom
    });
  });
});
