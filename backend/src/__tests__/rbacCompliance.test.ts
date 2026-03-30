import { describe, it, expect, beforeEach } from 'vitest';
import { RBACEngine, RBACContext } from '../utils/rbacEngine';

/**
 * RBAC 审计分析、报告和安全合规测试
 */
describe('RBAC审计分析与合规', () => {
  let engine: RBACEngine;

  beforeEach(() => {
    engine = new RBACEngine({ auditMaxSize: 5000 });
  });

  // ===== 审计分析 =====

  describe('审计分析', () => {
    it('统计各用户操作频率', () => {
      const users = ['alice', 'bob', 'charlie'];
      for (const uid of users) {
        const ctx: RBACContext = { userId: uid, roles: ['superadmin'] };
        for (let i = 0; i < 3; i++) {
          engine.checkPermission(ctx, 'read', { type: 'stock' });
        }
      }

      const stats = engine.getAuditStats();
      expect(stats.byUser['alice']).toBe(3);
      expect(stats.byUser['bob']).toBe(3);
      expect(stats.byUser['charlie']).toBe(3);
    });

    it('统计各资源访问频率', () => {
      const ctx: RBACContext = { userId: 'analyst', roles: ['superadmin'] };
      const resources = ['stock', 'stock', 'stock', 'market', 'index', 'index'];

      for (const r of resources) {
        engine.checkPermission(ctx, 'read', { type: r });
      }

      const stats = engine.getAuditStats();
      expect(stats.byResource['stock']).toBe(3);
      expect(stats.byResource['market']).toBe(1);
      expect(stats.byResource['index']).toBe(2);
    });

    it('统计各操作类型频率', () => {
      const ctx: RBACContext = { userId: 'ops', roles: ['superadmin'] };
      engine.checkPermission(ctx, 'read', { type: 'stock' });
      engine.checkPermission(ctx, 'read', { type: 'market' });
      engine.checkPermission(ctx, 'create', { type: 'portfolio' });
      engine.checkPermission(ctx, 'delete', { type: 'stock' });

      const stats = engine.getAuditStats();
      expect(stats.byAction['read']).toBe(2);
      expect(stats.byAction['create']).toBe(1);
      expect(stats.byAction['delete']).toBe(1);
    });

    it('允许/拒绝比率', () => {
      const viewer: RBACContext = { userId: 'v', roles: ['viewer'] };
      const admin: RBACContext = { userId: 'a', roles: ['admin'] };

      // viewer: read允许, delete拒绝
      engine.checkPermission(viewer, 'read', { type: 'stock' });
      engine.checkPermission(viewer, 'delete', { type: 'stock' });

      // admin: 都允许
      engine.checkPermission(admin, 'read', { type: 'stock' });
      engine.checkPermission(admin, 'admin', { type: 'user' });

      const stats = engine.getAuditStats();
      expect(stats.allowed).toBe(3);
      expect(stats.denied).toBe(1);
      expect(stats.total).toBe(4);
    });
  });

  // ===== 安全合规 =====

  describe('安全合规', () => {
    it('最小权限原则 - 查看者不能执行管理操作', () => {
      const ctx: RBACContext = { userId: 'min-priv', roles: ['viewer'] };

      const dangerousActions = [
        { action: 'delete', resource: 'stock' },
        { action: 'admin', resource: 'system' },
        { action: 'execute', resource: 'trade' },
        { action: 'create', resource: 'user' },
        { action: 'delete', resource: 'user' },
      ];

      for (const { action, resource } of dangerousActions) {
        const result = engine.checkPermission(ctx, action as any, { type: resource });
        expect(result.allowed).toBe(false);
      }
    });

    it('权限分离 - 交易员不能管理用户', () => {
      const ctx: RBACContext = { userId: 'trader', roles: ['trader'] };

      expect(engine.checkPermission(ctx, 'admin', { type: 'user' }).allowed).toBe(false);
      expect(engine.checkPermission(ctx, 'create', { type: 'user' }).allowed).toBe(false);
      expect(engine.checkPermission(ctx, 'delete', { type: 'user' }).allowed).toBe(false);
    });

    it('职责分离 - 分析师不能执行交易撤单', () => {
      const ctx: RBACContext = { userId: 'analyst', roles: ['analyst'] };

      // 分析师有export权限但没有delete权限
      expect(engine.checkPermission(ctx, 'export', { type: 'stock' }).allowed).toBe(true);
      expect(engine.checkPermission(ctx, 'delete', { type: 'trade' }).allowed).toBe(false);
    });

    it('所有权限检查都有审计记录', () => {
      const ctx: RBACContext = { userId: 'audit-all', roles: ['viewer'] };

      engine.checkPermission(ctx, 'read', { type: 'stock' });
      engine.checkPermission(ctx, 'delete', { type: 'stock' });
      engine.checkPermission(ctx, 'read', { type: 'market' });

      const log = engine.getAuditLog({ userId: 'audit-all' });
      expect(log.length).toBe(3);
    });

    it('审计记录包含IP地址', () => {
      const ctx: RBACContext = {
        userId: 'ip-test',
        roles: ['viewer'],
        ip: '192.168.1.100',
      };

      engine.checkPermission(ctx, 'read', { type: 'stock' });

      const log = engine.getAuditLog({ userId: 'ip-test' });
      expect(log[0].ip).toBe('192.168.1.100');
    });

    it('审计记录包含资源实例ID', () => {
      const ctx: RBACContext = { userId: 'res-id', roles: ['superadmin'] };

      engine.checkPermission(ctx, 'read', { type: 'stock', id: 'sh600519' });

      const log = engine.getAuditLog();
      expect(log[0].resourceId).toBe('sh600519');
    });
  });

  // ===== 角色管理合规 =====

  describe('角色管理合规', () => {
    it('系统角色完整性 - 所有系统角色都存在', () => {
      const systemRoles = ['superadmin', 'admin', 'analyst', 'trader', 'viewer', 'guest'];
      for (const roleId of systemRoles) {
        const role = engine.getRole(roleId);
        expect(role).toBeDefined();
        expect(role!.isSystem).toBe(true);
      }
    });

    it('系统角色权限不可修改', () => {
      const result = engine.updateRole('superadmin', {
        permissions: [{ id: 'limited', resource: 'stock', action: 'read', effect: 'allow' }],
      });
      expect(result).toBe(false);
    });

    it('系统角色不可删除', () => {
      for (const roleId of ['superadmin', 'admin', 'analyst', 'trader', 'viewer', 'guest']) {
        expect(engine.removeRole(roleId)).toBe(false);
      }
    });

    it('角色继承链不含循环', () => {
      for (const roleId of ['admin', 'analyst', 'trader', 'viewer', 'guest']) {
        const tree = engine.getInheritanceTree(roleId);
        const ids = tree.map(n => n.roleId);
        const uniqueIds = new Set(ids);
        expect(ids.length).toBe(uniqueIds.size); // 无重复
      }
    });

    it('角色验证 - 有效角色通过', () => {
      const valid: any = {
        id: 'valid',
        name: '有效角色',
        permissions: [{ id: 'v1', resource: 'stock', action: 'read', effect: 'allow' }],
      };
      expect(engine.validateRole(valid).valid).toBe(true);
    });

    it('角色验证 - 缺少必填字段失败', () => {
      expect(engine.validateRole({ id: '', name: 'test', permissions: [] }).valid).toBe(false);
      expect(engine.validateRole({ id: 'test', name: '', permissions: [] }).valid).toBe(false);
    });
  });

  // ===== 报告生成 =====

  describe('报告生成', () => {
    it('生成用户权限报告', () => {
      const ctx: RBACContext = { userId: 'report-user', roles: ['analyst'] };
      const perms = engine.getUserEffectivePermissions(ctx);

      expect(perms.length).toBeGreaterThan(0);

      const resources = [...new Set(perms.map(p => p.resource))];
      expect(resources.length).toBeGreaterThan(1);

      const actions = [...new Set(perms.map(p => p.action))];
      expect(actions.length).toBeGreaterThan(1);
    });

    it('生成角色权限矩阵', () => {
      const matrix: Record<string, string[]> = {};
      for (const role of engine.getAllRoles()) {
        const perms = engine.getEffectivePermissions(role.id);
        matrix[role.id] = perms.map(p => `${p.resource}:${p.action}`);
      }

      expect(matrix['superadmin'].length).toBeGreaterThan(0);
      expect(matrix['viewer'].length).toBeGreaterThan(0);
      // superadmin 通配符覆盖所有资源
      expect(matrix['superadmin'].some(p => p === '*:*')).toBe(true);
      // viewer 有具体权限
      expect(matrix['viewer'].some(p => p.startsWith('stock:'))).toBe(true);
    });

    it('审计摘要统计完整', () => {
      const viewer: RBACContext = { userId: 'v', roles: ['viewer'] };
      const trader: RBACContext = { userId: 't', roles: ['trader'] };
      const admin: RBACContext = { userId: 'a', roles: ['admin'] };

      engine.checkPermission(viewer, 'read', { type: 'stock' });
      engine.checkPermission(viewer, 'delete', { type: 'stock' });
      engine.checkPermission(trader, 'create', { type: 'portfolio' });
      engine.checkPermission(trader, 'read', { type: 'stock' });
      engine.checkPermission(admin, 'admin', { type: 'user' });

      const stats = engine.getAuditStats();
      expect(stats.total).toBe(5);
      expect(stats.allowed).toBe(4);
      expect(stats.denied).toBe(1);
      expect(Object.keys(stats.byUser).length).toBe(3);
      expect(Object.keys(stats.byResource).length).toBe(3);
      expect(Object.keys(stats.byAction).length).toBe(4);
    });
  });

  // ===== 复杂场景 =====

  describe('复杂业务场景', () => {
    it('股票交易完整流程权限检查', () => {
      // 交易员执行完整交易流程
      const trader: RBACContext = { userId: 'trader-1', roles: ['trader'] };

      // 1. 查看股票
      expect(engine.checkPermission(trader, 'read', { type: 'stock' }).allowed).toBe(true);

      // 2. 查看投资组合
      expect(engine.checkPermission(trader, 'read', { type: 'portfolio' }).allowed).toBe(true);

      // 3. 创建投资组合
      expect(engine.checkPermission(trader, 'create', { type: 'portfolio' }).allowed).toBe(true);

      // 4. 管理自选股
      expect(engine.checkPermission(trader, 'create', { type: 'watchlist' }).allowed).toBe(true);
      expect(engine.checkPermission(trader, 'update', { type: 'watchlist' }).allowed).toBe(true);
      expect(engine.checkPermission(trader, 'delete', { type: 'watchlist' }).allowed).toBe(true);

      // 5. 执行交易
      expect(engine.checkPermission(trader, 'execute', { type: 'trade' }).allowed).toBe(true);

      // 6. 不能管理用户
      expect(engine.checkPermission(trader, 'admin', { type: 'user' }).allowed).toBe(false);

      // 7. 不能修改系统
      expect(engine.checkPermission(trader, 'admin', { type: 'system' }).allowed).toBe(false);
    });

    it('分析师完整工作流权限检查', () => {
      const analyst: RBACContext = { userId: 'analyst-1', roles: ['analyst'] };

      // 分析师拥有交易员所有权限
      expect(engine.checkPermission(analyst, 'read', { type: 'stock' }).allowed).toBe(true);
      expect(engine.checkPermission(analyst, 'execute', { type: 'trade' }).allowed).toBe(true);
      expect(engine.checkPermission(analyst, 'create', { type: 'portfolio' }).allowed).toBe(true);

      // 额外：导出数据
      expect(engine.checkPermission(analyst, 'export', { type: 'stock' }).allowed).toBe(true);

      // 额外：创建报告
      expect(engine.checkPermission(analyst, 'create', { type: 'report' }).allowed).toBe(true);
      expect(engine.checkPermission(analyst, 'read', { type: 'report' }).allowed).toBe(true);

      // 不能管理用户
      expect(engine.checkPermission(analyst, 'admin', { type: 'user' }).allowed).toBe(false);
    });

    it('管理员完整权限检查', () => {
      const admin: RBACContext = { userId: 'admin-1', roles: ['admin'] };

      // 用户管理
      expect(engine.checkPermission(admin, 'create', { type: 'user' }).allowed).toBe(true);
      expect(engine.checkPermission(admin, 'read', { type: 'user' }).allowed).toBe(true);
      expect(engine.checkPermission(admin, 'update', { type: 'user' }).allowed).toBe(true);
      expect(engine.checkPermission(admin, 'delete', { type: 'user' }).allowed).toBe(true);

      // 系统管理
      expect(engine.checkPermission(admin, 'admin', { type: 'system' }).allowed).toBe(true);

      // 审计查看
      expect(engine.checkPermission(admin, 'read', { type: 'audit' }).allowed).toBe(true);

      // 不能修改超级管理员（无此资源类型权限）
      // admin 角色没有 superadmin 资源权限
      // 但 admin 有 system: * 权限
      expect(engine.checkPermission(admin, 'admin', { type: 'system' }).allowed).toBe(true);
    });

    it('访客权限最小化', () => {
      const guest: RBACContext = { userId: 'guest-1', roles: ['guest'] };

      // 仅可读取公开市场数据
      expect(engine.checkPermission(guest, 'read', {
        type: 'market',
        attributes: { public: true },
      }).allowed).toBe(true);

      // 其他操作全部拒绝
      expect(engine.checkPermission(guest, 'read', { type: 'stock' }).allowed).toBe(false);
      expect(engine.checkPermission(guest, 'read', {
        type: 'market',
        attributes: { public: false },
      }).allowed).toBe(false);
      expect(engine.checkPermission(guest, 'create', { type: 'portfolio' }).allowed).toBe(false);
    });
  });
});
