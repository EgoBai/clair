import { describe, it, expect } from 'vitest';

/**
 * 特性开关引擎逻辑测试
 * FeatureFlags 规则/百分比/条件逻辑
 */

type FeatureStatus = 'enabled' | 'disabled' | 'partial';

interface FeatureRule {
  type: 'percentage' | 'user_id' | 'group' | 'date_range';
  value: any;
}

interface FeatureFlag {
  key: string;
  name: string;
  status: FeatureStatus;
  rules: FeatureRule[];
  description?: string;
  createdAt: number;
  updatedAt: number;
}

interface EvalContext {
  userId?: string;
  groups?: string[];
  now?: number;
}

function evaluatePercentage(rule: FeatureRule, userId: string): boolean {
  if (rule.type !== 'percentage') return false;
  const pct = rule.value as number;
  // Deterministic hash based on userId
  let hash = 0;
  for (let i = 0; i < userId.length; i++) {
    hash = ((hash << 5) - hash + userId.charCodeAt(i)) | 0;
  }
  const bucket = Math.abs(hash) % 100;
  return bucket < pct;
}

function evaluateUserId(rule: FeatureRule, userId: string): boolean {
  if (rule.type !== 'user_id') return false;
  const allowedIds: string[] = rule.value;
  return allowedIds.includes(userId);
}

function evaluateGroup(rule: FeatureRule, userGroups: string[]): boolean {
  if (rule.type !== 'group') return false;
  const requiredGroups: string[] = rule.value;
  return requiredGroups.some(g => userGroups.includes(g));
}

function evaluateDateRange(rule: FeatureRule, now: number): boolean {
  if (rule.type !== 'date_range') return false;
  const { start, end } = rule.value as { start: number; end: number };
  return now >= start && now <= end;
}

function evaluateFlag(flag: FeatureFlag, context: EvalContext): boolean {
  if (flag.status === 'disabled') return false;
  if (flag.status === 'enabled') return true;

  // Partial: any rule match enables
  if (flag.rules.length === 0) return false;

  return flag.rules.some(rule => {
    switch (rule.type) {
      case 'percentage':
        return context.userId ? evaluatePercentage(rule, context.userId) : false;
      case 'user_id':
        return context.userId ? evaluateUserId(rule, context.userId) : false;
      case 'group':
        return context.groups ? evaluateGroup(rule, context.groups) : false;
      case 'date_range':
        return evaluateDateRange(rule, context.now ?? Date.now());
      default:
        return false;
    }
  });
}

function createFlag(
  key: string,
  status: FeatureStatus,
  rules: FeatureRule[] = []
): FeatureFlag {
  const now = Date.now();
  return {
    key,
    name: key,
    status,
    rules,
    createdAt: now,
    updatedAt: now,
  };
}

function mergeFlags(
  base: Map<string, FeatureFlag>,
  overrides: Map<string, FeatureFlag>
): Map<string, FeatureFlag> {
  const merged = new Map(base);
  for (const [key, flag] of overrides) {
    merged.set(key, flag);
  }
  return merged;
}

function getActiveFlags(
  flags: Map<string, FeatureFlag>,
  context: EvalContext
): string[] {
  const active: string[] = [];
  for (const [key, flag] of flags) {
    if (evaluateFlag(flag, context)) {
      active.push(key);
    }
  }
  return active;
}

function validateFlag(flag: FeatureFlag): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  if (!flag.key) errors.push('key is required');
  if (!['enabled', 'disabled', 'partial'].includes(flag.status)) {
    errors.push('invalid status');
  }
  for (const rule of flag.rules) {
    if (!['percentage', 'user_id', 'group', 'date_range'].includes(rule.type)) {
      errors.push(`invalid rule type: ${rule.type}`);
    }
    if (rule.type === 'percentage' && (rule.value < 0 || rule.value > 100)) {
      errors.push('percentage must be 0-100');
    }
  }
  return { valid: errors.length === 0, errors };
}

function calcPercentageBucket(userId: string): number {
  let hash = 0;
  for (let i = 0; i < userId.length; i++) {
    hash = ((hash << 5) - hash + userId.charCodeAt(i)) | 0;
  }
  return Math.abs(hash) % 100;
}

describe('特性开关逻辑', () => {
  describe('evaluatePercentage', () => {
    it('should deterministically assign buckets', () => {
      const rule: FeatureRule = { type: 'percentage', value: 50 };
      const result1 = evaluatePercentage(rule, 'user-1');
      const result2 = evaluatePercentage(rule, 'user-1');
      expect(result1).toBe(result2);
    });

    it('should enable for some users at 50%', () => {
      const rule: FeatureRule = { type: 'percentage', value: 50 };
      let enabled = 0;
      for (let i = 0; i < 100; i++) {
        if (evaluatePercentage(rule, `user-${i}`)) enabled++;
      }
      expect(enabled).toBeGreaterThan(20);
      expect(enabled).toBeLessThan(80);
    });

    it('should enable all at 100%', () => {
      const rule: FeatureRule = { type: 'percentage', value: 100 };
      for (let i = 0; i < 10; i++) {
        expect(evaluatePercentage(rule, `user-${i}`)).toBe(true);
      }
    });

    it('should disable all at 0%', () => {
      const rule: FeatureRule = { type: 'percentage', value: 0 };
      for (let i = 0; i < 10; i++) {
        expect(evaluatePercentage(rule, `user-${i}`)).toBe(false);
      }
    });
  });

  describe('evaluateUserId', () => {
    it('should match specific users', () => {
      const rule: FeatureRule = { type: 'user_id', value: ['u1', 'u2'] };
      expect(evaluateUserId(rule, 'u1')).toBe(true);
      expect(evaluateUserId(rule, 'u3')).toBe(false);
    });
  });

  describe('evaluateGroup', () => {
    it('should match any group', () => {
      const rule: FeatureRule = { type: 'group', value: ['beta', 'admin'] };
      expect(evaluateGroup(rule, ['user', 'beta'])).toBe(true);
      expect(evaluateGroup(rule, ['user'])).toBe(false);
    });
  });

  describe('evaluateDateRange', () => {
    it('should check date range', () => {
      const rule: FeatureRule = { type: 'date_range', value: { start: 1000, end: 2000 } };
      expect(evaluateDateRange(rule, 1500)).toBe(true);
      expect(evaluateDateRange(rule, 500)).toBe(false);
      expect(evaluateDateRange(rule, 2500)).toBe(false);
    });

    it('should include boundaries', () => {
      const rule: FeatureRule = { type: 'date_range', value: { start: 1000, end: 2000 } };
      expect(evaluateDateRange(rule, 1000)).toBe(true);
      expect(evaluateDateRange(rule, 2000)).toBe(true);
    });
  });

  describe('evaluateFlag', () => {
    it('should return false for disabled', () => {
      const flag = createFlag('test', 'disabled');
      expect(evaluateFlag(flag, { userId: 'u1' })).toBe(false);
    });

    it('should return true for enabled', () => {
      const flag = createFlag('test', 'enabled');
      expect(evaluateFlag(flag, { userId: 'u1' })).toBe(true);
    });

    it('should evaluate rules for partial', () => {
      const flag = createFlag('test', 'partial', [
        { type: 'user_id', value: ['u1'] },
      ]);
      expect(evaluateFlag(flag, { userId: 'u1' })).toBe(true);
      expect(evaluateFlag(flag, { userId: 'u2' })).toBe(false);
    });

    it('should return false for partial with no rules', () => {
      const flag = createFlag('test', 'partial', []);
      expect(evaluateFlag(flag, { userId: 'u1' })).toBe(false);
    });

    it('should OR multiple rules', () => {
      const flag = createFlag('test', 'partial', [
        { type: 'user_id', value: ['u1'] },
        { type: 'user_id', value: ['u2'] },
      ]);
      expect(evaluateFlag(flag, { userId: 'u2' })).toBe(true);
    });
  });

  describe('mergeFlags', () => {
    it('should override existing flags', () => {
      const base = new Map([
        ['a', createFlag('a', 'disabled')],
        ['b', createFlag('b', 'enabled')],
      ]);
      const overrides = new Map([
        ['a', createFlag('a', 'enabled')],
      ]);
      const merged = mergeFlags(base, overrides);
      expect(merged.get('a')?.status).toBe('enabled');
      expect(merged.get('b')?.status).toBe('enabled');
    });
  });

  describe('getActiveFlags', () => {
    it('should return all active flag keys', () => {
      const flags = new Map([
        ['on', createFlag('on', 'enabled')],
        ['off', createFlag('off', 'disabled')],
        ['partial', createFlag('partial', 'partial', [{ type: 'user_id', value: ['u1'] }])],
      ]);
      const active = getActiveFlags(flags, { userId: 'u1' });
      expect(active).toContain('on');
      expect(active).toContain('partial');
      expect(active).not.toContain('off');
    });
  });

  describe('validateFlag', () => {
    it('should accept valid flag', () => {
      const flag = createFlag('test', 'enabled');
      expect(validateFlag(flag).valid).toBe(true);
    });

    it('should reject empty key', () => {
      const flag = createFlag('', 'enabled');
      expect(validateFlag(flag).valid).toBe(false);
    });

    it('should reject invalid percentage', () => {
      const flag = createFlag('test', 'partial', [
        { type: 'percentage', value: 150 },
      ]);
      expect(validateFlag(flag).valid).toBe(false);
    });
  });

  describe('calcPercentageBucket', () => {
    it('should return consistent bucket', () => {
      const b1 = calcPercentageBucket('user-42');
      const b2 = calcPercentageBucket('user-42');
      expect(b1).toBe(b2);
    });

    it('should return value 0-99', () => {
      for (let i = 0; i < 100; i++) {
        const bucket = calcPercentageBucket(`user-${i}`);
        expect(bucket).toBeGreaterThanOrEqual(0);
        expect(bucket).toBeLessThan(100);
      }
    });
  });
});
