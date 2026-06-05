import { describe, it, expect, beforeEach } from 'vitest';
import { featureFlagService } from '../../../backend/src/services/featureFlags';

describe('Feature Flags Service', () => {
  describe('开关CRUD', () => {
    it('应返回所有默认开关', () => {
      const flags = featureFlagService.getAllFlags();
      expect(flags.length).toBeGreaterThanOrEqual(8);
    });

    it('应能获取单个开关', () => {
      const flag = featureFlagService.getFlag('dark_mode');
      expect(flag).toBeDefined();
      expect(flag?.key).toBe('dark_mode');
      expect(flag?.strategy).toBe('boolean');
    });

    it('应能创建新开关', () => {
      const flag = featureFlagService.upsertFlag({
        key: 'test_flag',
        name: '测试开关',
        description: '测试',
        enabled: true,
        strategy: 'boolean',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
      expect(flag.key).toBe('test_flag');
      expect(featureFlagService.getFlag('test_flag')).toBeDefined();
    });

    it('应能更新开关', () => {
      featureFlagService.upsertFlag({
        key: 'update_test',
        name: '原始',
        description: '',
        enabled: true,
        strategy: 'boolean',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
      featureFlagService.upsertFlag({
        key: 'update_test',
        name: '更新后',
        description: '',
        enabled: false,
        strategy: 'boolean',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
      const flag = featureFlagService.getFlag('update_test');
      expect(flag?.name).toBe('更新后');
      expect(flag?.enabled).toBe(false);
    });

    it('应能删除开关', () => {
      featureFlagService.upsertFlag({
        key: 'to_delete',
        name: '',
        description: '',
        enabled: true,
        strategy: 'boolean',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
      expect(featureFlagService.deleteFlag('to_delete')).toBe(true);
      expect(featureFlagService.getFlag('to_delete')).toBeUndefined();
    });

    it('不存在的开关返回false', () => {
      expect(featureFlagService.deleteFlag('nonexistent')).toBe(false);
    });
  });

  describe('开关评估', () => {
    it('boolean策略应返回true', () => {
      const result = featureFlagService.evaluate('dark_mode');
      expect(result.enabled).toBe(true);
      expect(result.reason).toBe('boolean_enabled');
    });

    it('不存在的开关返回false', () => {
      const result = featureFlagService.evaluate('nonexistent_flag');
      expect(result.enabled).toBe(false);
      expect(result.reason).toBe('flag_not_found');
    });

    it('禁用的开关返回false', () => {
      featureFlagService.upsertFlag({
        key: 'disabled_test',
        name: '',
        description: '',
        enabled: false,
        strategy: 'boolean',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
      const result = featureFlagService.evaluate('disabled_test');
      expect(result.enabled).toBe(false);
      expect(result.reason).toBe('flag_disabled');
    });

    it('百分比策略应一致返回结果', () => {
      const result1 = featureFlagService.evaluate('advanced_charts', { userId: 'user_123' });
      const result2 = featureFlagService.evaluate('advanced_charts', { userId: 'user_123' });
      expect(result1.enabled).toBe(result2.enabled);
    });

    it('用户白名单策略', () => {
      const adminResult = featureFlagService.evaluate('ai_analysis', { userId: 'admin' });
      expect(adminResult.enabled).toBe(true);

      const unknownResult = featureFlagService.evaluate('ai_analysis', { userId: 'unknown_user' });
      expect(unknownResult.enabled).toBe(false);
    });

    it('无用户ID时用户白名单返回false', () => {
      const result = featureFlagService.evaluate('ai_analysis');
      expect(result.enabled).toBe(false);
    });

    it('分组策略', () => {
      // options_analyzer is disabled, so evaluate returns false regardless of group
      const disabledResult = featureFlagService.evaluate('options_analyzer', { userGroups: ['premium'] });
      expect(disabledResult.enabled).toBe(false);
      expect(disabledResult.reason).toBe('flag_disabled');

      // Test group strategy with an enabled flag
      featureFlagService.upsertFlag({
        key: 'group_test',
        name: '',
        description: '',
        enabled: true,
        strategy: 'group',
        groups: ['premium'],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
      const premiumResult = featureFlagService.evaluate('group_test', { userGroups: ['premium'] });
      expect(premiumResult.enabled).toBe(true);

      const basicResult = featureFlagService.evaluate('group_test', { userGroups: ['basic'] });
      expect(basicResult.enabled).toBe(false);
    });

    it('应能批量评估所有开关', () => {
      const results = featureFlagService.evaluateAll({ userId: 'admin', userGroups: ['premium'] });
      expect(results.length).toBeGreaterThan(0);
      expect(results.every(r => typeof r.enabled === 'boolean')).toBe(true);
    });
  });

  describe('统计与导入导出', () => {
    it('应返回统计信息', () => {
      const stats = featureFlagService.getStats();
      expect(stats.total).toBeGreaterThan(0);
      expect(stats.enabled).toBeGreaterThan(0);
      expect(Object.keys(stats.byStrategy).length).toBeGreaterThan(0);
    });

    it('应能导出配置', () => {
      const exported = featureFlagService.exportFlags();
      const parsed = JSON.parse(exported);
      expect(Array.isArray(parsed)).toBe(true);
      expect(parsed.length).toBeGreaterThan(0);
    });

    it('应能导入配置', () => {
      const flags = JSON.stringify([{
        key: 'imported_flag',
        name: '导入的',
        description: '测试导入',
        enabled: true,
        strategy: 'boolean',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }]);
      const count = featureFlagService.importFlags(flags);
      expect(count).toBe(1);
      expect(featureFlagService.getFlag('imported_flag')).toBeDefined();
    });
  });
});
