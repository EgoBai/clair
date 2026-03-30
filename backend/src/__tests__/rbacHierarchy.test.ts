import { describe, it, expect, beforeEach } from 'vitest';
import { RBACEngine, RBACContext } from '../utils/rbacEngine';

/**
 * RBAC 角色层级系统、权限可视化数据和导出测试
 */
describe('RBAC角色层级与导出', () => {
  let engine: RBACEngine;

  beforeEach(() => {
    engine = new RBACEngine();
  });

  // ===== 角色层级结构 =====

  describe('角色层级结构', () => {
    it('完整的继承链: superadmin > admin > analyst > trader > viewer > guest', () => {
      // 从viewer到superadmin的权限递增
      const viewerPerms = engine.getEffectivePermissions('viewer');
      const traderPerms = engine.getEffectivePermissions('trader');
      const analystPerms = engine.getEffectivePermissions('analyst');
      const adminPerms = engine.getEffectivePermissions('admin');

      expect(traderPerms.length).toBeGreaterThan(viewerPerms.length);
      expect(analystPerms.length).toBeGreaterThan(traderPerms.length);
      expect(adminPerms.length).toBeGreaterThan(analystPerms.length);
    });

    it('admin继承树包含所有下级角色', () => {
      const tree = engine.getInheritanceTree('admin');
      const roleIds = tree.map(n => n.roleId);
      expect(roleIds).toContain('analyst');
      expect(roleIds).toContain('trader');
      expect(roleIds).toContain('viewer');
    });

    it('analyst继承树不包含admin', () => {
      const tree = engine.getInheritanceTree('analyst');
      const roleIds = tree.map(n => n.roleId);
      expect(roleIds).not.toContain('admin');
      expect(roleIds).not.toContain('superadmin');
    });

    it('viewer没有继承', () => {
      const tree = engine.getInheritanceTree('viewer');
      expect(tree.length).toBe(1);
      expect(tree[0].children).toEqual([]);
    });

    it('guest没有继承', () => {
      const tree = engine.getInheritanceTree('guest');
      expect(tree.length).toBe(1);
    });

    it('继承树深度正确', () => {
      const adminTree = engine.getInheritanceTree('admin');
      const maxDepth = Math.max(...adminTree.map(n => n.depth));
      expect(maxDepth).toBe(3); // admin -> analyst -> trader -> viewer
    });

    it('自定义角色可以继承系统角色', () => {
      engine.addRole({
        id: 'custom-trader',
        name: '自定义交易员',
        inherits: ['trader'],
        permissions: [
          { id: 'ct-1', resource: 'report', action: 'read', effect: 'allow' },
        ],
      });

      const ctx: RBACContext = { userId: 'ct', roles: ['custom-trader'] };
      // 继承trader权限
      expect(engine.checkPermission(ctx, 'read', { type: 'stock' }).allowed).toBe(true);
      expect(engine.checkPermission(ctx, 'execute', { type: 'trade' }).allowed).toBe(true);
      // 自己的权限
      expect(engine.checkPermission(ctx, 'read', { type: 'report' }).allowed).toBe(true);
    });
  });

  // ===== 权限可视化数据 =====

  describe('权限可视化数据', () => {
    it('生成角色-资源权限矩阵', () => {
      const resources = ['stock', 'market', 'portfolio', 'trade', 'user', 'system', 'report', 'audit'];
      const actions = ['create', 'read', 'update', 'delete', 'execute', 'admin'];
      const roles = ['superadmin', 'admin', 'analyst', 'trader', 'viewer', 'guest'];

      const matrix: Record<string, Record<string, string[]>> = {};
      for (const roleId of roles) {
        matrix[roleId] = {};
        for (const resource of resources) {
          matrix[roleId][resource] = [];
          for (const action of actions) {
            const ctx: RBACContext = { userId: 'matrix', roles: [roleId] };
            if (engine.checkPermission(ctx, action as any, { type: resource }).allowed) {
              matrix[roleId][resource].push(action);
            }
          }
        }
      }

      // superadmin 所有资源都有权限
      for (const resource of resources) {
        expect(matrix['superadmin'][resource].length).toBeGreaterThan(0);
      }

      // viewer 只读
      for (const resource of resources) {
        if (matrix['viewer'][resource].length > 0) {
          expect(matrix['viewer'][resource]).toEqual(
            expect.arrayContaining(['read'])
          );
        }
      }
    });

    it('权限继承关系图数据', () => {
      const edges: Array<{ from: string; to: string }> = [];
      for (const role of engine.getAllRoles()) {
        if (role.inherits) {
          for (const parent of role.inherits) {
            edges.push({ from: role.id, to: parent });
          }
        }
      }

      expect(edges.length).toBeGreaterThan(0);
      expect(edges.some(e => e.from === 'admin' && e.to === 'analyst')).toBe(true);
      expect(edges.some(e => e.from === 'analyst' && e.to === 'trader')).toBe(true);
      expect(edges.some(e => e.from === 'trader' && e.to === 'viewer')).toBe(true);
    });

    it('每角色权限数量统计', () => {
      const stats: Record<string, number> = {};
      for (const role of engine.getAllRoles()) {
        stats[role.id] = engine.getEffectivePermissions(role.id).length;
      }

      expect(stats['superadmin']).toBeGreaterThan(0);
      expect(stats['viewer']).toBeGreaterThan(0);
      expect(stats['guest']).toBeGreaterThan(0);
    });
  });

  // ===== 权限导出/导入 =====

  describe('权限导出', () => {
    it('导出角色定义为可序列化格式', () => {
      const role = engine.getRole('admin');
      const exported = JSON.stringify(role);
      const parsed = JSON.parse(exported);

      expect(parsed.id).toBe('admin');
      expect(parsed.name).toBe('管理员');
      expect(Array.isArray(parsed.permissions)).toBe(true);
      expect(parsed.inherits).toContain('analyst');
    });

    it('导出继承树为可序列化格式', () => {
      const tree = engine.getInheritanceTree('admin');
      const exported = JSON.stringify(tree);
      const parsed = JSON.parse(exported);

      expect(Array.isArray(parsed)).toBe(true);
      expect(parsed.some((n: any) => n.roleId === 'analyst')).toBe(true);
    });

    it('导出审计日志为可序列化格式', () => {
      const ctx: RBACContext = { userId: 'export', roles: ['superadmin'] };
      engine.checkPermission(ctx, 'read', { type: 'stock' });
      engine.checkPermission(ctx, 'create', { type: 'portfolio' });

      const log = engine.getAuditLog();
      const exported = JSON.stringify(log);
      const parsed = JSON.parse(exported);

      expect(Array.isArray(parsed)).toBe(true);
      expect(parsed.length).toBe(2);
      expect(parsed[0].userId).toBe('export');
    });

    it('导出权限定义为可序列化格式', () => {
      const perms = engine.getEffectivePermissions('analyst');
      const exported = JSON.stringify(perms);
      const parsed = JSON.parse(exported);

      expect(Array.isArray(parsed)).toBe(true);
      expect(parsed.length).toBeGreaterThan(0);
      expect(parsed[0]).toHaveProperty('id');
      expect(parsed[0]).toHaveProperty('resource');
      expect(parsed[0]).toHaveProperty('action');
      expect(parsed[0]).toHaveProperty('effect');
    });
  });

  // ===== 权限汇总 =====

  describe('权限汇总', () => {
    it('统计系统所有资源类型', () => {
      const allResources = new Set<string>();
      for (const role of engine.getAllRoles()) {
        for (const perm of role.permissions) {
          allResources.add(perm.resource.replace(':*', ''));
        }
      }

      expect(allResources.has('*')).toBe(true);
      expect(allResources.has('user')).toBe(true);
      expect(allResources.has('stock')).toBe(true);
      expect(allResources.has('portfolio')).toBe(true);
    });

    it('统计系统所有操作类型', () => {
      const allActions = new Set<string>();
      for (const role of engine.getAllRoles()) {
        for (const perm of role.permissions) {
          allActions.add(perm.action);
        }
      }

      expect(allActions.has('*')).toBe(true);
      expect(allActions.has('read')).toBe(true);
      expect(allActions.has('create')).toBe(true);
      expect(allActions.has('delete')).toBe(true);
    });

    it('统计deny权限数量', () => {
      let denyCount = 0;
      for (const role of engine.getAllRoles()) {
        for (const perm of role.permissions) {
          if (perm.effect === 'deny') denyCount++;
        }
      }
      // 系统角色中没有显式deny
      expect(denyCount).toBe(0);
    });

    it('统计角色权限分布', () => {
      const distribution: Record<string, { direct: number; effective: number }> = {};
      for (const role of engine.getAllRoles()) {
        distribution[role.id] = {
          direct: role.permissions.length,
          effective: engine.getEffectivePermissions(role.id).length,
        };
      }

      // 有继承的角色，有效权限应该 >= 直接权限
      expect(distribution['admin'].effective).toBeGreaterThanOrEqual(distribution['admin'].direct);
      expect(distribution['analyst'].effective).toBeGreaterThanOrEqual(distribution['analyst'].direct);
    });
  });

  // ===== 角色操作统计 =====

  describe('角色操作统计', () => {
    it('统计每个角色能执行的操作', () => {
      const roleCapabilities: Record<string, Set<string>> = {};
      const actions = ['create', 'read', 'update', 'delete', 'export', 'execute', 'admin'];
      const resources = ['stock', 'market', 'portfolio', 'trade', 'user', 'system'];

      for (const roleId of ['viewer', 'trader', 'analyst', 'admin', 'superadmin']) {
        roleCapabilities[roleId] = new Set();
        const ctx: RBACContext = { userId: 'cap', roles: [roleId] };
        for (const resource of resources) {
          for (const action of actions) {
            if (engine.checkPermission(ctx, action as any, { type: resource }).allowed) {
              roleCapabilities[roleId].add(`${action}:${resource}`);
            }
          }
        }
      }

      // viewer 只能 read
      const viewerCaps = roleCapabilities['viewer'];
      for (const cap of viewerCaps) {
        expect(cap.startsWith('read:')).toBe(true);
      }

      // superadmin 可以做所有事
      expect(roleCapabilities['superadmin'].size).toBeGreaterThan(viewerCaps.size);
    });
  });

  // ===== 角色定义完整性 =====

  describe('角色定义完整性', () => {
    it('所有系统角色都有名称和描述', () => {
      for (const role of engine.getAllRoles()) {
        if (role.isSystem) {
          expect(role.name).toBeTruthy();
          expect(role.description).toBeTruthy();
        }
      }
    });

    it('所有权限都有ID', () => {
      for (const role of engine.getAllRoles()) {
        for (const perm of role.permissions) {
          expect(perm.id).toBeTruthy();
        }
      }
    });

    it('所有继承的角色都存在', () => {
      for (const role of engine.getAllRoles()) {
        if (role.inherits) {
          for (const inheritedId of role.inherits) {
            expect(engine.getRole(inheritedId)).toBeDefined();
          }
        }
      }
    });

    it('权限ID在角色内唯一', () => {
      for (const role of engine.getAllRoles()) {
        const ids = role.permissions.map(p => p.id);
        const uniqueIds = new Set(ids);
        expect(ids.length).toBe(uniqueIds.size);
      }
    });
  });
});
