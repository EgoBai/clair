import { describe, it, expect } from 'vitest';

// ===== 用户偏好与个性化设置测试 =====

interface UserPreferences {
  theme: 'light' | 'dark' | 'system';
  language: 'zh-CN' | 'en-US';
  klinePeriod: '5m' | '15m' | '60m' | 'day' | 'week' | 'month';
  showVolume: boolean;
  sidebarCollapsed: boolean;
  autoRefresh: boolean;
  refreshInterval: number;
  defaultPageSize: number;
  chartType: 'candlestick' | 'line' | 'area';
  showMA: boolean;
  maPeriods: number[];
}

const DEFAULT_PREFS: UserPreferences = {
  theme: 'system',
  language: 'zh-CN',
  klinePeriod: 'day',
  showVolume: true,
  sidebarCollapsed: false,
  autoRefresh: true,
  refreshInterval: 30,
  defaultPageSize: 20,
  chartType: 'candlestick',
  showMA: true,
  maPeriods: [5, 10, 20, 60],
};

function mergePreferences(base: UserPreferences, override: Partial<UserPreferences>): UserPreferences {
  return { ...base, ...override };
}

function validatePreferences(prefs: Partial<UserPreferences>): string[] {
  const errors: string[] = [];
  if (prefs.refreshInterval !== undefined && (prefs.refreshInterval < 5 || prefs.refreshInterval > 300)) {
    errors.push('refreshInterval must be between 5 and 300');
  }
  if (prefs.defaultPageSize !== undefined && (prefs.defaultPageSize < 5 || prefs.defaultPageSize > 100)) {
    errors.push('defaultPageSize must be between 5 and 100');
  }
  if (prefs.maPeriods !== undefined) {
    if (!Array.isArray(prefs.maPeriods) || prefs.maPeriods.length === 0) {
      errors.push('maPeriods must be non-empty array');
    } else if (prefs.maPeriods.some(p => p < 1 || p > 500)) {
      errors.push('maPeriods values must be between 1 and 500');
    }
  }
  const validThemes = ['light', 'dark', 'system'];
  if (prefs.theme && !validThemes.includes(prefs.theme)) {
    errors.push('Invalid theme');
  }
  return errors;
}

function serializePreferences(prefs: UserPreferences): string {
  return JSON.stringify(prefs);
}

function deserializePreferences(json: string): UserPreferences | null {
  try {
    const parsed = JSON.parse(json);
    return mergePreferences(DEFAULT_PREFS, parsed);
  } catch {
    return null;
  }
}

function getResolvedTheme(prefs: UserPreferences, systemPrefersDark: boolean): 'light' | 'dark' {
  if (prefs.theme === 'system') return systemPrefersDark ? 'dark' : 'light';
  return prefs.theme;
}

function generateCSSVariables(theme: 'light' | 'dark'): Record<string, string> {
  if (theme === 'dark') {
    return {
      '--bg-primary': '#1a1a2e',
      '--bg-secondary': '#16213e',
      '--text-primary': '#e0e0e0',
      '--text-secondary': '#a0a0a0',
      '--border-color': '#2a2a4a',
      '--up-color': '#ef4444',
      '--down-color': '#22c55e',
    };
  }
  return {
    '--bg-primary': '#ffffff',
    '--bg-secondary': '#f5f5f5',
    '--text-primary': '#1a1a1a',
    '--text-secondary': '#666666',
    '--border-color': '#e0e0e0',
    '--up-color': '#ef4444',
    '--down-color': '#22c55e',
  };
}

function migratePreferences(oldPrefs: Record<string, any>, version: number): UserPreferences {
  const migrated = { ...DEFAULT_PREFS };
  if (version < 2) {
    if (oldPrefs.darkMode) migrated.theme = 'dark';
    if (oldPrefs.lang) migrated.language = oldPrefs.lang === 'en' ? 'en-US' : 'zh-CN';
  }
  if (version < 3) {
    if (oldPrefs.showVolume !== undefined) migrated.showVolume = oldPrefs.showVolume;
    if (oldPrefs.refreshSec) migrated.refreshInterval = oldPrefs.refreshSec;
  }
  return mergePreferences(migrated, oldPrefs);
}

describe('用户偏好管理', () => {
  describe('偏好合并', () => {
    it('覆盖指定字段', () => {
      const merged = mergePreferences(DEFAULT_PREFS, { theme: 'dark' });
      expect(merged.theme).toBe('dark');
      expect(merged.language).toBe(DEFAULT_PREFS.language);
    });

    it('多字段覆盖', () => {
      const merged = mergePreferences(DEFAULT_PREFS, { theme: 'dark', language: 'en-US', showVolume: false });
      expect(merged.theme).toBe('dark');
      expect(merged.language).toBe('en-US');
      expect(merged.showVolume).toBe(false);
    });

    it('空覆盖返回原样', () => {
      const merged = mergePreferences(DEFAULT_PREFS, {});
      expect(merged).toEqual(DEFAULT_PREFS);
    });

    it('不修改原对象', () => {
      mergePreferences(DEFAULT_PREFS, { theme: 'dark' });
      expect(DEFAULT_PREFS.theme).toBe('system');
    });
  });

  describe('偏好验证', () => {
    it('有效偏好无错误', () => {
      expect(validatePreferences({ theme: 'dark', refreshInterval: 30 })).toHaveLength(0);
    });

    it('刷新间隔太短', () => {
      expect(validatePreferences({ refreshInterval: 1 }).length).toBeGreaterThan(0);
    });

    it('刷新间隔太长', () => {
      expect(validatePreferences({ refreshInterval: 500 }).length).toBeGreaterThan(0);
    });

    it('页面大小超范围', () => {
      expect(validatePreferences({ defaultPageSize: 1 }).length).toBeGreaterThan(0);
      expect(validatePreferences({ defaultPageSize: 200 }).length).toBeGreaterThan(0);
    });

    it('MA周期为空数组', () => {
      expect(validatePreferences({ maPeriods: [] }).length).toBeGreaterThan(0);
    });

    it('MA周期超范围', () => {
      expect(validatePreferences({ maPeriods: [0] }).length).toBeGreaterThan(0);
      expect(validatePreferences({ maPeriods: [600] }).length).toBeGreaterThan(0);
    });

    it('无效主题', () => {
      expect(validatePreferences({ theme: 'blue' as any }).length).toBeGreaterThan(0);
    });

    it('边界值有效', () => {
      expect(validatePreferences({ refreshInterval: 5 })).toHaveLength(0);
      expect(validatePreferences({ refreshInterval: 300 })).toHaveLength(0);
      expect(validatePreferences({ defaultPageSize: 5 })).toHaveLength(0);
      expect(validatePreferences({ defaultPageSize: 100 })).toHaveLength(0);
    });
  });

  describe('序列化/反序列化', () => {
    it('往返一致性', () => {
      const json = serializePreferences(DEFAULT_PREFS);
      const restored = deserializePreferences(json);
      expect(restored).toEqual(DEFAULT_PREFS);
    });

    it('无效JSON返回null', () => {
      expect(deserializePreferences('not json')).toBeNull();
    });

    it('部分JSON使用默认值补全', () => {
      const partial = deserializePreferences('{"theme":"dark"}');
      expect(partial?.theme).toBe('dark');
      expect(partial?.language).toBe(DEFAULT_PREFS.language);
    });
  });

  describe('主题解析', () => {
    it('浅色主题', () => {
      expect(getResolvedTheme({ ...DEFAULT_PREFS, theme: 'light' }, true)).toBe('light');
    });

    it('暗色主题', () => {
      expect(getResolvedTheme({ ...DEFAULT_PREFS, theme: 'dark' }, false)).toBe('dark');
    });

    it('跟随系统-暗色', () => {
      expect(getResolvedTheme(DEFAULT_PREFS, true)).toBe('dark');
    });

    it('跟随系统-浅色', () => {
      expect(getResolvedTheme(DEFAULT_PREFS, false)).toBe('light');
    });
  });

  describe('CSS变量生成', () => {
    it('浅色主题变量', () => {
      const vars = generateCSSVariables('light');
      expect(vars['--bg-primary']).toBe('#ffffff');
      expect(vars['--up-color']).toBe('#ef4444');
    });

    it('暗色主题变量', () => {
      const vars = generateCSSVariables('dark');
      expect(vars['--bg-primary']).toBe('#1a1a2e');
    });

    it('涨跌颜色一致', () => {
      const light = generateCSSVariables('light');
      const dark = generateCSSVariables('dark');
      expect(light['--up-color']).toBe(dark['--up-color']);
      expect(light['--down-color']).toBe(dark['--down-color']);
    });

    it('包含所有必要变量', () => {
      const vars = generateCSSVariables('light');
      const required = ['--bg-primary', '--bg-secondary', '--text-primary', '--text-secondary', '--border-color', '--up-color', '--down-color'];
      required.forEach(v => expect(vars[v]).toBeDefined());
    });
  });

  describe('偏好迁移', () => {
    it('v1格式迁移', () => {
      const old = { darkMode: true, lang: 'en' };
      const migrated = migratePreferences(old, 1);
      expect(migrated.theme).toBe('dark');
      expect(migrated.language).toBe('en-US');
    });

    it('v2格式迁移', () => {
      const old = { showVolume: false, refreshSec: 60 };
      const migrated = migratePreferences(old, 2);
      expect(migrated.showVolume).toBe(false);
      expect(migrated.refreshInterval).toBe(60);
    });

    it('新字段保留默认值', () => {
      const migrated = migratePreferences({}, 1);
      expect(migrated.chartType).toBe(DEFAULT_PREFS.chartType);
      expect(migrated.maPeriods).toEqual(DEFAULT_PREFS.maPeriods);
    });
  });
});
