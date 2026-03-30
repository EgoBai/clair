import { describe, it, expect } from 'vitest';

// API Versioning System
interface ApiVersion {
  major: number;
  minor: number;
  patch: number;
}

interface VersionedRoute {
  path: string;
  version: ApiVersion;
  deprecated: boolean;
  sunsetDate?: string;
}

function parseVersion(versionStr: string): ApiVersion | null {
  const match = versionStr.match(/^v?(\d+)\.(\d+)\.(\d+)$/);
  if (!match) return null;
  return {
    major: parseInt(match[1]),
    minor: parseInt(match[2]),
    patch: parseInt(match[3]),
  };
}

function compareVersions(a: ApiVersion, b: ApiVersion): number {
  if (a.major !== b.major) return a.major - b.major;
  if (a.minor !== b.minor) return a.minor - b.minor;
  return a.patch - b.patch;
}

function formatVersion(v: ApiVersion): string {
  return `v${v.major}.${v.minor}.${v.patch}`;
}

function isVersionSupported(version: ApiVersion, minVersion: ApiVersion): boolean {
  return compareVersions(version, minVersion) >= 0;
}

function findMatchingRoute(routes: VersionedRoute[], path: string, requestedVersion: ApiVersion): VersionedRoute | null {
  const matching = routes
    .filter(r => r.path === path && compareVersions(r.version, requestedVersion) <= 0)
    .sort((a, b) => compareVersions(b.version, a.version));

  return matching[0] || null;
}

function generateDeprecationWarning(route: VersionedRoute): string | null {
  if (!route.deprecated) return null;
  let msg = `API ${route.path} version ${formatVersion(route.version)} is deprecated.`;
  if (route.sunsetDate) {
    msg += ` Sunset date: ${route.sunsetDate}.`;
  }
  msg += ' Please migrate to the latest version.';
  return msg;
}

function migrateParams(params: Record<string, unknown>, fromVersion: ApiVersion, toVersion: ApiVersion): Record<string, unknown> {
  const result = { ...params };

  // v1.0.0 -> v2.0.0: rename 'code' to 'symbol'
  if (fromVersion.major < 2 && toVersion.major >= 2) {
    if ('code' in result && !('symbol' in result)) {
      result.symbol = result.code;
      delete result.code;
    }
  }

  // v1.x -> v1.2+: add default pageSize
  if (fromVersion.minor < 2 && toVersion.minor >= 2) {
    if (!('pageSize' in result)) {
      result.pageSize = 20;
    }
  }

  return result;
}

describe('API Versioning System', () => {
  describe('parseVersion', () => {
    it('should parse valid version string', () => {
      expect(parseVersion('1.2.3')).toEqual({ major: 1, minor: 2, patch: 3 });
      expect(parseVersion('v2.0.0')).toEqual({ major: 2, minor: 0, patch: 0 });
    });

    it('should reject invalid version strings', () => {
      expect(parseVersion('abc')).toBeNull();
      expect(parseVersion('1.2')).toBeNull();
      expect(parseVersion('')).toBeNull();
      expect(parseVersion('v1.2')).toBeNull();
    });

    it('should handle large version numbers', () => {
      const v = parseVersion('99.99.99');
      expect(v?.major).toBe(99);
    });
  });

  describe('compareVersions', () => {
    it('should compare major versions', () => {
      expect(compareVersions({ major: 2, minor: 0, patch: 0 }, { major: 1, minor: 0, patch: 0 })).toBeGreaterThan(0);
      expect(compareVersions({ major: 1, minor: 0, patch: 0 }, { major: 2, minor: 0, patch: 0 })).toBeLessThan(0);
    });

    it('should compare minor versions', () => {
      expect(compareVersions({ major: 1, minor: 2, patch: 0 }, { major: 1, minor: 1, patch: 0 })).toBeGreaterThan(0);
    });

    it('should compare patch versions', () => {
      expect(compareVersions({ major: 1, minor: 0, patch: 2 }, { major: 1, minor: 0, patch: 1 })).toBeGreaterThan(0);
    });

    it('should return 0 for equal versions', () => {
      expect(compareVersions({ major: 1, minor: 2, patch: 3 }, { major: 1, minor: 2, patch: 3 })).toBe(0);
    });
  });

  describe('formatVersion', () => {
    it('should format version with v prefix', () => {
      expect(formatVersion({ major: 1, minor: 2, patch: 3 })).toBe('v1.2.3');
      expect(formatVersion({ major: 2, minor: 0, patch: 0 })).toBe('v2.0.0');
    });
  });

  describe('isVersionSupported', () => {
    it('should support versions >= minimum', () => {
      expect(isVersionSupported({ major: 2, minor: 0, patch: 0 }, { major: 1, minor: 0, patch: 0 })).toBe(true);
      expect(isVersionSupported({ major: 1, minor: 0, patch: 0 }, { major: 1, minor: 0, patch: 0 })).toBe(true);
    });

    it('should not support versions below minimum', () => {
      expect(isVersionSupported({ major: 1, minor: 0, patch: 0 }, { major: 2, minor: 0, patch: 0 })).toBe(false);
    });
  });

  describe('findMatchingRoute', () => {
    const routes: VersionedRoute[] = [
      { path: '/api/stocks', version: { major: 1, minor: 0, patch: 0 }, deprecated: true },
      { path: '/api/stocks', version: { major: 1, minor: 1, patch: 0 }, deprecated: false },
      { path: '/api/stocks', version: { major: 2, minor: 0, patch: 0 }, deprecated: false },
      { path: '/api/etf', version: { major: 1, minor: 0, patch: 0 }, deprecated: false },
    ];

    it('should find latest version <= requested', () => {
      const route = findMatchingRoute(routes, '/api/stocks', { major: 1, minor: 1, patch: 0 });
      expect(route?.version).toEqual({ major: 1, minor: 1, patch: 0 });
    });

    it('should find latest when requesting higher version', () => {
      const route = findMatchingRoute(routes, '/api/stocks', { major: 3, minor: 0, patch: 0 });
      expect(route?.version.major).toBe(2);
    });

    it('should return null for non-existent path', () => {
      const route = findMatchingRoute(routes, '/api/nonexistent', { major: 1, minor: 0, patch: 0 });
      expect(route).toBeNull();
    });

    it('should return null when no version matches', () => {
      const route = findMatchingRoute(routes, '/api/stocks', { major: 0, minor: 1, patch: 0 });
      expect(route).toBeNull();
    });
  });

  describe('generateDeprecationWarning', () => {
    it('should return null for non-deprecated route', () => {
      const route: VersionedRoute = {
        path: '/api/stocks', version: { major: 1, minor: 0, patch: 0 }, deprecated: false,
      };
      expect(generateDeprecationWarning(route)).toBeNull();
    });

    it('should generate warning for deprecated route', () => {
      const route: VersionedRoute = {
        path: '/api/stocks', version: { major: 1, minor: 0, patch: 0 }, deprecated: true,
      };
      const warning = generateDeprecationWarning(route);
      expect(warning).toContain('deprecated');
    });

    it('should include sunset date when set', () => {
      const route: VersionedRoute = {
        path: '/api/stocks', version: { major: 1, minor: 0, patch: 0 },
        deprecated: true, sunsetDate: '2026-06-01',
      };
      const warning = generateDeprecationWarning(route);
      expect(warning).toContain('2026-06-01');
    });
  });

  describe('migrateParams', () => {
    it('should rename code to symbol for v1 to v2', () => {
      const result = migrateParams({ code: '600519' }, { major: 1, minor: 0, patch: 0 }, { major: 2, minor: 0, patch: 0 });
      expect(result.symbol).toBe('600519');
      expect(result.code).toBeUndefined();
    });

    it('should not overwrite existing symbol', () => {
      const result = migrateParams({ code: '600519', symbol: '000001' }, { major: 1, minor: 0, patch: 0 }, { major: 2, minor: 0, patch: 0 });
      expect(result.symbol).toBe('000001');
    });

    it('should add default pageSize for minor upgrade', () => {
      const result = migrateParams({}, { major: 1, minor: 0, patch: 0 }, { major: 1, minor: 2, patch: 0 });
      expect(result.pageSize).toBe(20);
    });

    it('should not overwrite existing pageSize', () => {
      const result = migrateParams({ pageSize: 50 }, { major: 1, minor: 0, patch: 0 }, { major: 1, minor: 2, patch: 0 });
      expect(result.pageSize).toBe(50);
    });

    it('should not migrate if versions are same', () => {
      const params = { code: '600519' };
      const result = migrateParams(params, { major: 1, minor: 0, patch: 0 }, { major: 1, minor: 0, patch: 0 });
      expect(result).toEqual(params);
    });
  });
});
