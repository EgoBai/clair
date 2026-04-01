import { describe, it, expect } from 'vitest';

/**
 * 回滚管理器逻辑测试
 * RollbackManager 版本/状态/策略逻辑
 */

type DeploymentStatus = 'pending' | 'deploying' | 'active' | 'rollback' | 'failed';
type RollbackStrategy = 'immediate' | 'gradual' | 'canary';

interface Deployment {
  id: string;
  version: string;
  status: DeploymentStatus;
  createdAt: number;
  deployedAt?: number;
  rollbackFrom?: string;
  health: 'healthy' | 'unhealthy' | 'unknown';
}

interface RollbackPlan {
  fromVersion: string;
  toVersion: string;
  strategy: RollbackStrategy;
  reason: string;
  createdAt: number;
}

function canRollback(deployment: Deployment): boolean {
  return deployment.status === 'active' || deployment.status === 'failed';
}

function findRollbackTarget(
  deployments: Deployment[],
  currentId: string
): Deployment | null {
  const sorted = [...deployments]
    .filter(d => d.status === 'active' && d.id !== currentId)
    .sort((a, b) => (b.deployedAt || 0) - (a.deployedAt || 0));
  return sorted[0] || null;
}

function createRollbackPlan(
  from: Deployment,
  to: Deployment,
  strategy: RollbackStrategy,
  reason: string
): RollbackPlan {
  return {
    fromVersion: from.version,
    toVersion: to.version,
    strategy,
    reason,
    createdAt: Date.now(),
  };
}

function validateRollbackPlan(plan: RollbackPlan, deployments: Deployment[]): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];
  if (plan.fromVersion === plan.toVersion) {
    errors.push('Cannot rollback to same version');
  }
  const fromExists = deployments.some(d => d.version === plan.fromVersion);
  const toExists = deployments.some(d => d.version === plan.toVersion);
  if (!fromExists) errors.push('Source version not found');
  if (!toExists) errors.push('Target version not found');
  return { valid: errors.length === 0, errors };
}

function calcRollbackDuration(strategy: RollbackStrategy): number {
  const durations: Record<RollbackStrategy, number> = {
    immediate: 0,
    gradual: 300_000, // 5 minutes
    canary: 600_000,  // 10 minutes
  };
  return durations[strategy];
}

function shouldAutoRollback(
  deployment: Deployment,
  errorThreshold: number,
  errorCount: number,
  healthCheckFails: number
): boolean {
  if (deployment.status !== 'active') return false;
  return errorCount >= errorThreshold || healthCheckFails >= 3;
}

function getDeploymentHistory(
  deployments: Deployment[],
  limit = 10
): Deployment[] {
  return [...deployments]
    .sort((a, b) => (b.deployedAt || b.createdAt) - (a.deployedAt || a.createdAt))
    .slice(0, limit);
}

function calcDeploymentAge(deployment: Deployment, now: number): number {
  return now - (deployment.deployedAt || deployment.createdAt);
}

function formatVersion(version: string): {
  major: number;
  minor: number;
  patch: number;
  raw: string;
} {
  const parts = version.replace(/^v/, '').split('.').map(Number);
  return {
    major: parts[0] || 0,
    minor: parts[1] || 0,
    patch: parts[2] || 0,
    raw: version,
  };
}

function compareVersions(a: string, b: string): number {
  const va = formatVersion(a);
  const vb = formatVersion(b);
  if (va.major !== vb.major) return va.major - vb.major;
  if (va.minor !== vb.minor) return va.minor - vb.minor;
  return va.patch - vb.patch;
}

function isVersionNewer(a: string, b: string): boolean {
  return compareVersions(a, b) > 0;
}

function buildDeploymentTag(version: string, env: string): string {
  return `${version}-${env}-${Date.now()}`;
}

function categorizeDeployments(deployments: Deployment[]): {
  active: Deployment[];
  failed: Deployment[];
  pending: Deployment[];
  other: Deployment[];
} {
  return {
    active: deployments.filter(d => d.status === 'active'),
    failed: deployments.filter(d => d.status === 'failed'),
    pending: deployments.filter(d => d.status === 'pending' || d.status === 'deploying'),
    other: deployments.filter(d => d.status === 'rollback'),
  };
}

describe('回滚管理器逻辑', () => {
  const mockDeployments: Deployment[] = [
    { id: 'd1', version: '1.0.0', status: 'active', createdAt: 1000, deployedAt: 1000, health: 'healthy' },
    { id: 'd2', version: '1.1.0', status: 'active', createdAt: 2000, deployedAt: 2000, health: 'healthy' },
    { id: 'd3', version: '2.0.0', status: 'failed', createdAt: 3000, deployedAt: 3000, health: 'unhealthy' },
    { id: 'd4', version: '2.1.0', status: 'active', createdAt: 4000, deployedAt: 4000, health: 'healthy' },
  ];

  describe('canRollback', () => {
    it('should allow rollback for active', () => {
      expect(canRollback(mockDeployments[0])).toBe(true);
    });

    it('should allow rollback for failed', () => {
      expect(canRollback(mockDeployments[2])).toBe(true);
    });

    it('should not allow rollback for pending', () => {
      const d: Deployment = { id: 'x', version: '1.0', status: 'pending', createdAt: 0, health: 'unknown' };
      expect(canRollback(d)).toBe(false);
    });
  });

  describe('findRollbackTarget', () => {
    it('should find most recent active deployment', () => {
      const target = findRollbackTarget(mockDeployments, 'd4');
      expect(target?.id).toBe('d2');
    });

    it('should exclude current deployment', () => {
      const target = findRollbackTarget(mockDeployments, 'd2');
      expect(target?.id).toBe('d4');
    });

    it('should return null if no target', () => {
      const target = findRollbackTarget([mockDeployments[0]], 'd1');
      expect(target).toBeNull();
    });
  });

  describe('createRollbackPlan', () => {
    it('should create plan', () => {
      const plan = createRollbackPlan(
        mockDeployments[3],
        mockDeployments[1],
        'immediate',
        'Critical bug'
      );
      expect(plan.fromVersion).toBe('2.1.0');
      expect(plan.toVersion).toBe('1.1.0');
      expect(plan.strategy).toBe('immediate');
    });
  });

  describe('validateRollbackPlan', () => {
    it('should validate correct plan', () => {
      const plan = createRollbackPlan(mockDeployments[3], mockDeployments[1], 'immediate', 'test');
      expect(validateRollbackPlan(plan, mockDeployments).valid).toBe(true);
    });

    it('should reject same version', () => {
      const plan: RollbackPlan = { fromVersion: '1.0', toVersion: '1.0', strategy: 'immediate', reason: '', createdAt: 0 };
      expect(validateRollbackPlan(plan, mockDeployments).valid).toBe(false);
    });

    it('should reject missing versions', () => {
      const plan: RollbackPlan = { fromVersion: '9.9.9', toVersion: '1.0', strategy: 'immediate', reason: '', createdAt: 0 };
      expect(validateRollbackPlan(plan, mockDeployments).valid).toBe(false);
    });
  });

  describe('calcRollbackDuration', () => {
    it('should return durations', () => {
      expect(calcRollbackDuration('immediate')).toBe(0);
      expect(calcRollbackDuration('gradual')).toBe(300000);
      expect(calcRollbackDuration('canary')).toBe(600000);
    });
  });

  describe('shouldAutoRollback', () => {
    it('should trigger on error threshold', () => {
      expect(shouldAutoRollback(mockDeployments[0], 10, 10, 0)).toBe(true);
    });

    it('should trigger on health check fails', () => {
      expect(shouldAutoRollback(mockDeployments[0], 10, 0, 3)).toBe(true);
    });

    it('should not trigger below threshold', () => {
      expect(shouldAutoRollback(mockDeployments[0], 10, 5, 1)).toBe(false);
    });

    it('should not trigger for non-active', () => {
      expect(shouldAutoRollback(mockDeployments[2], 10, 100, 0)).toBe(false);
    });
  });

  describe('getDeploymentHistory', () => {
    it('should return sorted by date', () => {
      const history = getDeploymentHistory(mockDeployments);
      expect(history[0].id).toBe('d4');
    });

    it('should limit results', () => {
      expect(getDeploymentHistory(mockDeployments, 2)).toHaveLength(2);
    });
  });

  describe('formatVersion', () => {
    it('should parse semver', () => {
      const v = formatVersion('1.2.3');
      expect(v.major).toBe(1);
      expect(v.minor).toBe(2);
      expect(v.patch).toBe(3);
    });

    it('should handle v prefix', () => {
      expect(formatVersion('v2.0.0').major).toBe(2);
    });
  });

  describe('compareVersions', () => {
    it('should compare correctly', () => {
      expect(compareVersions('2.0.0', '1.0.0')).toBeGreaterThan(0);
      expect(compareVersions('1.0.0', '1.0.0')).toBe(0);
      expect(compareVersions('1.0.0', '2.0.0')).toBeLessThan(0);
    });

    it('should compare patches', () => {
      expect(compareVersions('1.0.1', '1.0.0')).toBeGreaterThan(0);
    });
  });

  describe('isVersionNewer', () => {
    it('should check if a is newer than b', () => {
      expect(isVersionNewer('2.0.0', '1.0.0')).toBe(true);
      expect(isVersionNewer('1.0.0', '2.0.0')).toBe(false);
      expect(isVersionNewer('1.0.0', '1.0.0')).toBe(false);
    });
  });

  describe('buildDeploymentTag', () => {
    it('should build tag', () => {
      const tag = buildDeploymentTag('1.0.0', 'production');
      expect(tag).toContain('1.0.0');
      expect(tag).toContain('production');
    });
  });

  describe('categorizeDeployments', () => {
    it('should categorize correctly', () => {
      const cats = categorizeDeployments(mockDeployments);
      expect(cats.active).toHaveLength(3);
      expect(cats.failed).toHaveLength(1);
      expect(cats.pending).toHaveLength(0);
    });
  });
});
