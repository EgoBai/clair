import { describe, it, expect, beforeEach } from 'vitest';
import { featureFlagService, FeatureFlag, FlagEvaluationContext } from '../services/featureFlags';

describe('FeatureFlagService', () => {
  describe('getAllFlags', () => {
    it('应该返回所有预设开关', () => {
      const flags = featureFlagService.getAllFlags();
      expect(flags.length).toBeGreaterThanOrEqual(8);
    });

    it('应该包含 dark_mode 开关', () => {
      const flags = featureFlagService.getAllFlags();
      const darkMode = flags.find(f => f.key === 'dark_mode');
      expect(darkMode).toBeDefined();
      expect(darkMode?.strategy).toBe('boolean');
    });
  });

  describe('getFlag', () => {
    it('应该返回存在的开关', () => {
      const flag = featureFlagService.getFlag('dark_mode');
      expect(flag).toBeDefined();
      expect(flag?.key).toBe('dark_mode');
    });

    it('不存在的开关应返回 undefined', () => {
      const flag = featureFlagService.getFlag('nonexistent_flag');
      expect(flag).toBeUndefined();
    });
  });

  describe('upsertFlag', () => {
    it('应该创建新开关', () => {
      const flag: FeatureFlag = {
        key: 'test_flag',
        name: '测试开关',
        description: '用于测试',
        enabled: true,
        strategy: 'boolean',
        tags: ['test'],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      featureFlagService.upsertFlag(flag);
      const found = featureFlagService.getFlag('test_flag');
      expect(found?.name).toBe('测试开关');
    });

    it('应该更新已有开关', () => {
      const flag = featureFlagService.getFlag('dark_mode');
      if (flag) {
        flag.description = '更新后的描述';
        featureFlagService.upsertFlag(flag);
        const updated = featureFlagService.getFlag('dark_mode');
        expect(updated?.description).toBe('更新后的描述');
      }
    });
  });

  describe('deleteFlag', () => {
    it('应该删除已存在的开关', () => {
      // 先创建一个临时开关
      featureFlagService.upsertFlag({
        key: 'temp_delete_test',
        name: '临时',
        description: '临时',
        enabled: true,
        strategy: 'boolean',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
      expect(featureFlagService.getFlag('temp_delete_test')).toBeDefined();
      const deleted = featureFlagService.deleteFlag('temp_delete_test');
      expect(deleted).toBe(true);
      expect(featureFlagService.getFlag('temp_delete_test')).toBeUndefined();
    });

    it('删除不存在的开关应返回 false', () => {
      const deleted = featureFlagService.deleteFlag('nonexistent_xyz');
      expect(deleted).toBe(false);
    });
  });

  describe('evaluate - boolean strategy', () => {
    it('boolean 开关应该返回启用', () => {
      const result = featureFlagService.evaluate('dark_mode');
      expect(result.enabled).toBe(true);
      expect(result.reason).toBe('boolean_enabled');
    });

    it('disabled 开关应该返回禁用', () => {
      const result = featureFlagService.evaluate('options_analyzer');
      expect(result.enabled).toBe(false);
      expect(result.reason).toBe('flag_disabled');
    });

    it('不存在的开关应该返回 flag_not_found', () => {
      const result = featureFlagService.evaluate('not_exist');
      expect(result.enabled).toBe(false);
      expect(result.reason).toBe('flag_not_found');
    });
  });

  describe('evaluate - percentage strategy', () => {
    it('百分比策略应该基于用户ID一致性', () => {
      const ctx: FlagEvaluationContext = { userId: 'user_abc' };
      const result1 = featureFlagService.evaluate('advanced_charts', ctx);
      const result2 = featureFlagService.evaluate('advanced_charts', ctx);
      expect(result1.enabled).toBe(result2.enabled);
      expect(['percentage_match', 'percentage_skip']).toContain(result1.reason);
    });

    it('无 userId 应该随机评估', () => {
      const result = featureFlagService.evaluate('advanced_charts');
      expect(typeof result.enabled).toBe('boolean');
    });
  });

  describe('evaluate - user_list strategy', () => {
    it('白名单用户应该被允许', () => {
      const result = featureFlagService.evaluate('ai_analysis', { userId: 'admin' });
      expect(result.enabled).toBe(true);
      expect(result.reason).toBe('user_allowed');
    });

    it('非白名单用户应该被拒绝', () => {
      const result = featureFlagService.evaluate('ai_analysis', { userId: 'random_user' });
      expect(result.enabled).toBe(false);
      expect(result.reason).toBe('user_not_allowed');
    });

    it('无 userId 应该被拒绝', () => {
      const result = featureFlagService.evaluate('ai_analysis');
      expect(result.enabled).toBe(false);
    });
  });

  describe('evaluate - group strategy', () => {
    it('匹配分组应该返回启用', () => {
      // options_analyzer is disabled, so create a test one
      featureFlagService.upsertFlag({
        key: 'group_test',
        name: '分组测试',
        description: '测试',
        enabled: true,
        strategy: 'group',
        groups: ['premium'],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      const result = featureFlagService.evaluate('group_test', {
        userGroups: ['premium', 'basic'],
      });
      expect(result.enabled).toBe(true);
      expect(result.reason).toBe('group_match');
    });

    it('不匹配分组应该返回禁用', () => {
      const result = featureFlagService.evaluate('group_test', {
        userGroups: ['basic'],
      });
      expect(result.enabled).toBe(false);
      expect(result.reason).toBe('group_no_match');
    });
  });

  describe('evaluate - time_window strategy', () => {
    it('时间窗口内应该启用', () => {
      // webhook_notifications uses time_window with wide range
      const result = featureFlagService.evaluate('webhook_notifications');
      expect(result.enabled).toBe(true);
    });
  });

  describe('evaluateAll', () => {
    it('应该评估所有开关', () => {
      const results = featureFlagService.evaluateAll({ userId: 'test_user' });
      expect(results.length).toBeGreaterThan(0);
      expect(results.every(r => typeof r.enabled === 'boolean')).toBe(true);
    });

    it('无上下文应该也能评估', () => {
      const results = featureFlagService.evaluateAll();
      expect(results.length).toBeGreaterThan(0);
    });
  });

  describe('getStats', () => {
    it('应该返回正确的统计', () => {
      const stats = featureFlagService.getStats();
      expect(stats.total).toBeGreaterThan(0);
      expect(stats.enabled).toBeGreaterThan(0);
      expect(typeof stats.byStrategy).toBe('object');
      expect(typeof stats.byTag).toBe('object');
    });

    it('策略统计应该包含 boolean', () => {
      const stats = featureFlagService.getStats();
      expect(stats.byStrategy['boolean']).toBeGreaterThanOrEqual(1);
    });

    it('标签统计应该包含 ui', () => {
      const stats = featureFlagService.getStats();
      expect(stats.byTag['ui']).toBeGreaterThanOrEqual(1);
    });
  });

  describe('exportFlags / importFlags', () => {
    it('应该导出为 JSON 字符串', () => {
      const json = featureFlagService.exportFlags();
      expect(() => JSON.parse(json)).not.toThrow();
      const parsed = JSON.parse(json);
      expect(Array.isArray(parsed)).toBe(true);
    });

    it('应该导入开关', () => {
      const flags = [{
        key: 'imported_flag',
        name: '导入测试',
        description: '通过导入创建',
        enabled: true,
        strategy: 'boolean' as const,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }];

      const count = featureFlagService.importFlags(JSON.stringify(flags));
      expect(count).toBe(1);
      expect(featureFlagService.getFlag('imported_flag')).toBeDefined();
    });
  });
});
