import { describe, it, expect, beforeEach } from 'vitest';
import { RBACEngine, RBACContext } from '../utils/rbacEngine';

/**
 * RBAC 综合场景测试 - 完整业务流程
 */
describe('RBAC综合业务场景', () => {
  let engine: RBACEngine;

  beforeEach(() => {
    engine = new RBACEngine();
  });

  // ===== 证券公司场景 =====

  describe('证券公司完整场景', () => {
    it('交易员日常操作流程', () => {
      const trader: RBACContext = { userId: 'trader-001', roles: ['trader'] };

      // 查看行情
      expect(engine.checkPermission(trader, 'read', { type: 'stock' }).allowed).toBe(true);
      expect(engine.checkPermission(trader, 'read', { type: 'market' }).allowed).toBe(true);
      expect(engine.checkPermission(trader, 'read', { type: 'index' }).allowed).toBe(true);

      // 管理自选
      expect(engine.checkPermission(trader, 'create', { type: 'watchlist' }).allowed).toBe(true);
      expect(engine.checkPermission(trader, 'update', { type: 'watchlist' }).allowed).toBe(true);
      expect(engine.checkPermission(trader, 'delete', { type: 'watchlist' }).allowed).toBe(true);

      // 管理投资组合
      expect(engine.checkPermission(trader, 'create', { type: 'portfolio' }).allowed).toBe(true);
      expect(engine.checkPermission(trader, 'update', { type: 'portfolio' }).allowed).toBe(true);
      expect(engine.checkPermission(trader, 'delete', { type: 'portfolio' }).allowed).toBe(true);

      // 执行交易
      expect(engine.checkPermission(trader, 'execute', { type: 'trade' }).allowed).toBe(true);

      // 不能做的事
      expect(engine.checkPermission(trader, 'export', { type: 'stock' }).allowed).toBe(false);
      expect(engine.checkPermission(trader, 'admin', { type: 'user' }).allowed).toBe(false);
      expect(engine.checkPermission(trader, 'admin', { type: 'system' }).allowed).toBe(false);
    });

    it('分析师研究报告流程', () => {
      const analyst: RBACContext = { userId: 'analyst-001', roles: ['analyst'] };

      // 导出数据用于分析
      expect(engine.checkPermission(analyst, 'export', { type: 'stock' }).allowed).toBe(true);
      expect(engine.checkPermission(analyst, 'read', { type: 'stock' }).allowed).toBe(true);

      // 创建和查看报告
      expect(engine.checkPermission(analyst, 'create', { type: 'report' }).allowed).toBe(true);
      expect(engine.checkPermission(analyst, 'read', { type: 'report' }).allowed).toBe(true);

      // 批量读取
      expect(engine.checkPermission(analyst, 'read', { type: 'stock:bulk' }).allowed).toBe(true);

      // 不能管理用户
      expect(engine.checkPermission(analyst, 'admin', { type: 'user' }).allowed).toBe(false);
    });

    it('管理员用户管理流程', () => {
      const admin: RBACContext = { userId: 'admin-001', roles: ['admin'] };

      // 用户管理
      for (const action of ['create', 'read', 'update', 'delete']) {
        expect(engine.checkPermission(admin, action as any, { type: 'user' }).allowed).toBe(true);
      }

      // 系统管理
      expect(engine.checkPermission(admin, 'admin', { type: 'system' }).allowed).toBe(true);

      // 报告管理
      for (const action of ['create', 'read', 'update', 'delete']) {
        expect(engine.checkPermission(admin, action as any, { type: 'report' }).allowed).toBe(true);
      }

      // 审计查看
      expect(engine.checkPermission(admin, 'read', { type: 'audit' }).allowed).toBe(true);
    });

    it('访客权限最小化', () => {
      const guest: RBACContext = { userId: 'guest-001', roles: ['guest'] };

      // 只能读取公开市场数据
      expect(engine.checkPermission(guest, 'read', {
        type: 'market',
        attributes: { public: true },
      }).allowed).toBe(true);

      // 一切非公开数据都拒绝
      expect(engine.checkPermission(guest, 'read', { type: 'stock' }).allowed).toBe(false);
      expect(engine.checkPermission(guest, 'read', {
        type: 'market',
        attributes: { public: false },
      }).allowed).toBe(false);
      expect(engine.checkPermission(guest, 'create', { type: 'portfolio' }).allowed).toBe(false);
    });
  });

  // ===== 多角色协作场景 =====

  describe('多角色协作', () => {
    it('同一用户可以拥有多个角色', () => {
      engine.addRole({
        id: 'quant',
        name: '量化分析师',
        permissions: [
          { id: 'q-1', resource: 'backtest', action: 'execute', effect: 'allow' },
          { id: 'q-2', resource: 'strategy', action: 'create', effect: 'allow' },
        ],
      });

      const quantTrader: RBACContext = {
        userId: 'qt-001',
        roles: ['trader', 'quant'],
      };

      // 交易员权限
      expect(engine.checkPermission(quantTrader, 'read', { type: 'stock' }).allowed).toBe(true);
      expect(engine.checkPermission(quantTrader, 'execute', { type: 'trade' }).allowed).toBe(true);

      // 量化分析师权限
      expect(engine.checkPermission(quantTrader, 'execute', { type: 'backtest' }).allowed).toBe(true);
      expect(engine.checkPermission(quantTrader, 'create', { type: 'strategy' }).allowed).toBe(true);

      // 不能管理用户
      expect(engine.checkPermission(quantTrader, 'admin', { type: 'user' }).allowed).toBe(false);
    });
  });

  // ===== 动态权限场景 =====

  describe('动态权限管理', () => {
    it('权限升降级', () => {
      const ctx: RBACContext = { userId: 'dynamic', roles: ['viewer'] };

      // 初始：只读
      expect(engine.checkPermission(ctx, 'read', { type: 'stock' }).allowed).toBe(true);
      expect(engine.checkPermission(ctx, 'create', { type: 'portfolio' }).allowed).toBe(false);

      // 升级为交易员
      const upgraded: RBACContext = { userId: 'dynamic', roles: ['trader'] };
      expect(engine.checkPermission(upgraded, 'create', { type: 'portfolio' }).allowed).toBe(true);
      expect(engine.checkPermission(upgraded, 'execute', { type: 'trade' }).allowed).toBe(true);

      // 降级为访客
      const downgraded: RBACContext = { userId: 'dynamic', roles: ['guest'] };
      expect(engine.checkPermission(downgraded, 'read', { type: 'stock' }).allowed).toBe(false);
    });

    it('自定义角色生命周期', () => {
      // 创建
      engine.addRole({
        id: 'temp-role',
        name: '临时角色',
        permissions: [
          { id: 'tr-1', resource: 'stock', action: 'read', effect: 'allow' },
          { id: 'tr-2', resource: 'stock', action: 'export', effect: 'allow' },
        ],
      });

      const ctx: RBACContext = { userId: 'temp', roles: ['temp-role'] };
      expect(engine.checkPermission(ctx, 'export', { type: 'stock' }).allowed).toBe(true);

      // 更新权限
      engine.updateRole('temp-role', {
        permissions: [
          { id: 'tr-3', resource: 'stock', action: 'read', effect: 'allow' },
        ],
      });
      expect(engine.checkPermission(ctx, 'export', { type: 'stock' }).allowed).toBe(false);
      expect(engine.checkPermission(ctx, 'read', { type: 'stock' }).allowed).toBe(true);

      // 删除
      engine.removeRole('temp-role');
      expect(engine.checkPermission(ctx, 'read', { type: 'stock' }).allowed).toBe(false);
    });
  });

  // ===== 审计与合规场景 =====

  describe('审计与合规', () => {
    it('完整交易审计链', () => {
      const trader: RBACContext = {
        userId: 'trader-audit',
        roles: ['trader'],
        ip: '10.0.1.50',
      };

      // 模拟一天的操作
      engine.checkPermission(trader, 'read', { type: 'stock', id: 'sh600519' });
      engine.checkPermission(trader, 'read', { type: 'stock', id: 'sz000858' });
      engine.checkPermission(trader, 'create', { type: 'watchlist', id: 'wl-1' });
      engine.checkPermission(trader, 'execute', { type: 'trade', id: 't-1' });
      engine.checkPermission(trader, 'create', { type: 'portfolio', id: 'pf-1' });
      engine.checkPermission(trader, 'execute', { type: 'trade', id: 't-2' });

      const log = engine.getAuditLog({ userId: 'trader-audit' });
      expect(log.length).toBe(6);

      // 所有记录都通过
      expect(log.every(e => e.result === 'allow')).toBe(true);

      // IP地址一致
      expect(log.every(e => e.ip === '10.0.1.50')).toBe(true);

      // 资源ID都有
      expect(log.every(e => e.resourceId)).toBe(true);

      // 统计
      const stats = engine.getAuditStats();
      expect(stats.byUser['trader-audit']).toBe(6);
      expect(stats.allowed).toBe(6);
      expect(stats.denied).toBe(0);
    });

    it('违规操作审计', () => {
      const viewer: RBACContext = {
        userId: 'viewer-violation',
        roles: ['viewer'],
        ip: '192.168.1.100',
      };

      // 尝试各种非法操作
      engine.checkPermission(viewer, 'delete', { type: 'stock' });
      engine.checkPermission(viewer, 'execute', { type: 'trade' });
      engine.checkPermission(viewer, 'admin', { type: 'system' });
      engine.checkPermission(viewer, 'create', { type: 'user' });

      const denied = engine.getAuditLog({
        userId: 'viewer-violation',
        result: 'deny',
      });
      expect(denied.length).toBe(4);

      const stats = engine.getAuditStats();
      expect(stats.denied).toBe(4);
    });
  });

  // ===== 性能场景 =====

  describe('性能场景', () => {
    it('高频交易场景权限检查', () => {
      const trader: RBACContext = { userId: 'hft', roles: ['trader'] };
      const start = Date.now();

      for (let i = 0; i < 1000; i++) {
        engine.checkPermission(trader, 'execute', { type: 'trade' });
      }

      expect(Date.now() - start).toBeLessThan(1000);
    });

    it('大规模权限查询', () => {
      const start = Date.now();
      for (const role of engine.getAllRoles()) {
        engine.getEffectivePermissions(role.id);
        engine.getInheritanceTree(role.id);
      }
      expect(Date.now() - start).toBeLessThan(100);
    });
  });

  // ===== 数据完整性 =====

  describe('数据完整性', () => {
    it('所有系统角色定义完整', () => {
      const systemRoles = engine.getAllRoles().filter(r => r.isSystem);
      expect(systemRoles.length).toBe(6);

      for (const role of systemRoles) {
        expect(role.id).toBeTruthy();
        expect(role.name).toBeTruthy();
        expect(role.description).toBeTruthy();
        expect(Array.isArray(role.permissions)).toBe(true);
      }
    });

    it('权限定义完整', () => {
      for (const role of engine.getAllRoles()) {
        for (const perm of role.permissions) {
          expect(perm.id).toBeTruthy();
          expect(perm.resource).toBeTruthy();
          expect(perm.action).toBeTruthy();
          expect(['allow', 'deny']).toContain(perm.effect);
        }
      }
    });

    it('继承链无循环', () => {
      for (const role of engine.getAllRoles()) {
        const tree = engine.getInheritanceTree(role.id);
        const ids = tree.map(n => n.roleId);
        expect(new Set(ids).size).toBe(ids.length);
      }
    });
  });
});
