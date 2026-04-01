/**
 * 后端特性开关引擎测试
 * 覆盖特性开关评估、用户分组、A/B测试
 */

import { describe, it, expect } from 'vitest';

describe('特性开关引擎', () => {
  describe('特性开关评估', () => {
    interface FeatureFlag {
      key: string;
      enabled: boolean;
      rolloutPercent: number;
      whitelist: string[];
      blacklist: string[];
    }

    function evaluateFlag(flag: FeatureFlag, userId: string): boolean {
      if (flag.blacklist.includes(userId)) return false;
      if (flag.whitelist.includes(userId)) return true;
      if (!flag.enabled) return false;

      // Hash-based consistent rollout
      let hash = 0;
      for (let i = 0; i < userId.length; i++) {
        hash = ((hash << 5) - hash + userId.charCodeAt(i)) | 0;
      }
      const bucket = Math.abs(hash) % 100;
      return bucket < flag.rolloutPercent;
    }

    it('白名单用户应始终启用', () => {
      const flag: FeatureFlag = { key: 'test', enabled: false, rolloutPercent: 0, whitelist: ['user1'], blacklist: [] };
      expect(evaluateFlag(flag, 'user1')).toBe(true);
    });

    it('黑名单用户应始终禁用', () => {
      const flag: FeatureFlag = { key: 'test', enabled: true, rolloutPercent: 100, whitelist: ['user1'], blacklist: ['user1'] };
      expect(evaluateFlag(flag, 'user1')).toBe(false);
    });

    it('禁用特性应返回false', () => {
      const flag: FeatureFlag = { key: 'test', enabled: false, rolloutPercent: 100, whitelist: [], blacklist: [] };
      expect(evaluateFlag(flag, 'user1')).toBe(false);
    });
  });

  describe('用户分桶', () => {
    function assignBucket(userId: string, bucketCount: number = 100): number {
      let hash = 0;
      for (let i = 0; i < userId.length; i++) {
        hash = ((hash << 5) - hash + userId.charCodeAt(i)) | 0;
      }
      return Math.abs(hash) % bucketCount;
    }

    it('同一用户应始终分到同一桶', () => {
      const bucket1 = assignBucket('user123');
      const bucket2 = assignBucket('user123');
      expect(bucket1).toBe(bucket2);
    });

    it('不同用户可能分到不同桶', () => {
      const buckets = new Set<number>();
      for (let i = 0; i < 100; i++) {
        buckets.add(assignBucket(`user${i}`));
      }
      expect(buckets.size).toBeGreaterThan(50);
    });
  });

  describe('A/B 测试分组', () => {
    interface ABTest {
      id: string;
      variants: { name: string; weight: number }[];
    }

    function assignVariant(test: ABTest, userId: string): string {
      let hash = 0;
      const seed = test.id + userId;
      for (let i = 0; i < seed.length; i++) {
        hash = ((hash << 5) - hash + seed.charCodeAt(i)) | 0;
      }
      const bucket = Math.abs(hash) % 100;
      let cumulative = 0;
      for (const variant of test.variants) {
        cumulative += variant.weight;
        if (bucket < cumulative) return variant.name;
      }
      return test.variants[test.variants.length - 1].name;
    }

    it('应分配到某个变体', () => {
      const test: ABTest = {
        id: 'exp1',
        variants: [
          { name: 'control', weight: 50 },
          { name: 'treatment', weight: 50 },
        ],
      };
      const variant = assignVariant(test, 'user1');
      expect(['control', 'treatment']).toContain(variant);
    });

    it('同一用户应一致分组', () => {
      const test: ABTest = {
        id: 'exp1',
        variants: [{ name: 'A', weight: 50 }, { name: 'B', weight: 50 }],
      };
      const v1 = assignVariant(test, 'user42');
      const v2 = assignVariant(test, 'user42');
      expect(v1).toBe(v2);
    });
  });

  describe('特性开关统计', () => {
    function calcFlagStats(evaluations: { flagKey: string; userId: string; result: boolean }[]): Record<string, { total: number; enabled: number; percent: number }> {
      const stats: Record<string, { total: number; enabled: number }> = {};
      for (const e of evaluations) {
        if (!stats[e.flagKey]) stats[e.flagKey] = { total: 0, enabled: 0 };
        stats[e.flagKey].total++;
        if (e.result) stats[e.flagKey].enabled++;
      }
      const result: Record<string, { total: number; enabled: number; percent: number }> = {};
      for (const [key, s] of Object.entries(stats)) {
        result[key] = { ...s, percent: Math.round((s.enabled / s.total) * 100) };
      }
      return result;
    }

    it('应正确统计启用率', () => {
      const evals = [
        { flagKey: 'dark_mode', userId: 'u1', result: true },
        { flagKey: 'dark_mode', userId: 'u2', result: false },
        { flagKey: 'dark_mode', userId: 'u3', result: true },
      ];
      const stats = calcFlagStats(evals);
      expect(stats['dark_mode'].percent).toBe(67);
    });
  });
});
