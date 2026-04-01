import { describe, it, expect } from 'vitest';

/**
 * 主题提供者逻辑测试
 * ThemeProvider 主题切换/持久化/变量逻辑
 */

type ThemeMode = 'light' | 'dark' | 'auto';
type ColorScheme = 'blue' | 'green' | 'red' | 'purple' | 'orange';

interface ThemeConfig {
  mode: ThemeMode;
  primaryColor: string;
  colorScheme: ColorScheme;
  borderRadius: number;
  compactMode: boolean;
  fontSize: 'small' | 'medium' | 'large';
}

interface ThemeVariables {
  '--primary-color': string;
  '--bg-color': string;
  '--text-color': string;
  '--border-color': string;
  '--card-bg': string;
  '--shadow': string;
  '--border-radius': string;
  '--font-size-base': string;
}

const COLOR_SCHEMES: Record<ColorScheme, string> = {
  blue: '#1890ff',
  green: '#52c41a',
  red: '#ff4d4f',
  purple: '#722ed1',
  orange: '#fa8c16',
};

const LIGHT_VARS: Partial<ThemeVariables> = {
  '--bg-color': '#f0f2f5',
  '--text-color': '#333333',
  '--border-color': '#e8e8e8',
  '--card-bg': '#ffffff',
  '--shadow': '0 2px 8px rgba(0,0,0,0.08)',
};

const DARK_VARS: Partial<ThemeVariables> = {
  '--bg-color': '#141414',
  '--text-color': '#e0e0e0',
  '--border-color': '#303030',
  '--card-bg': '#1f1f1f',
  '--shadow': '0 2px 8px rgba(0,0,0,0.4)',
};

function getDefaultConfig(): ThemeConfig {
  return {
    mode: 'light',
    primaryColor: '#1890ff',
    colorScheme: 'blue',
    borderRadius: 6,
    compactMode: false,
    fontSize: 'medium',
  };
}

function resolveThemeMode(mode: ThemeMode, systemPreference: 'light' | 'dark'): 'light' | 'dark' {
  if (mode === 'auto') return systemPreference;
  return mode;
}

function buildThemeVariables(config: ThemeConfig, resolvedMode: 'light' | 'dark'): ThemeVariables {
  const baseVars = resolvedMode === 'dark' ? DARK_VARS : LIGHT_VARS;
  const fontSizeMap = { small: '12px', medium: '14px', large: '16px' };

  return {
    '--primary-color': config.primaryColor,
    '--bg-color': baseVars['--bg-color']!,
    '--text-color': baseVars['--text-color']!,
    '--border-color': baseVars['--border-color']!,
    '--card-bg': baseVars['--card-bg']!,
    '--shadow': baseVars['--shadow']!,
    '--border-radius': `${config.borderRadius}px`,
    '--font-size-base': fontSizeMap[config.fontSize],
  };
}

function applyThemeToCSS(vars: ThemeVariables): string {
  return Object.entries(vars)
    .map(([key, value]) => `${key}: ${value};`)
    .join('\n');
}

function mergeThemeConfig(base: ThemeConfig, overrides: Partial<ThemeConfig>): ThemeConfig {
  return { ...base, ...overrides };
}

function getColorSchemePrimary(scheme: ColorScheme): string {
  return COLOR_SCHEMES[scheme];
}

function isValidColorScheme(scheme: string): scheme is ColorScheme {
  return scheme in COLOR_SCHEMES;
}

function serializeThemeConfig(config: ThemeConfig): string {
  return JSON.stringify(config);
}

function deserializeThemeConfig(raw: string): ThemeConfig | null {
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    return { ...getDefaultConfig(), ...parsed };
  } catch {
    return null;
  }
}

function calcContrastRatio(fg: string, bg: string): number {
  // Simplified relative luminance
  const hexToLum = (hex: string): number => {
    const r = parseInt(hex.slice(1, 3), 16) / 255;
    const g = parseInt(hex.slice(3, 5), 16) / 255;
    const b = parseInt(hex.slice(5, 7), 16) / 255;
    const srgb = [r, g, b].map(c => c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
    return 0.2126 * srgb[0] + 0.7152 * srgb[1] + 0.0722 * srgb[2];
  };

  const l1 = hexToLum(fg);
  const l2 = hexToLum(bg);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

function isAccessibleContrast(ratio: number): boolean {
  return ratio >= 4.5; // WCAG AA
}

function generateCSSClassPrefix(scheme: ColorScheme): string {
  return `theme-${scheme}`;
}

function buildCompactOverrides(compact: boolean): Partial<ThemeVariables> {
  if (!compact) return {};
  return {
    '--border-radius': '2px',
    '--font-size-base': '12px',
  };
}

describe('主题提供者逻辑', () => {
  describe('getDefaultConfig', () => {
    it('should return default config', () => {
      const config = getDefaultConfig();
      expect(config.mode).toBe('light');
      expect(config.primaryColor).toBe('#1890ff');
      expect(config.borderRadius).toBe(6);
    });
  });

  describe('resolveThemeMode', () => {
    it('should resolve light', () => {
      expect(resolveThemeMode('light', 'dark')).toBe('light');
    });

    it('should resolve dark', () => {
      expect(resolveThemeMode('dark', 'light')).toBe('dark');
    });

    it('should use system preference for auto', () => {
      expect(resolveThemeMode('auto', 'dark')).toBe('dark');
      expect(resolveThemeMode('auto', 'light')).toBe('light');
    });
  });

  describe('buildThemeVariables', () => {
    it('should build light variables', () => {
      const vars = buildThemeVariables(getDefaultConfig(), 'light');
      expect(vars['--bg-color']).toBe('#f0f2f5');
      expect(vars['--primary-color']).toBe('#1890ff');
    });

    it('should build dark variables', () => {
      const vars = buildThemeVariables(getDefaultConfig(), 'dark');
      expect(vars['--bg-color']).toBe('#141414');
    });

    it('should apply border radius', () => {
      const vars = buildThemeVariables({ ...getDefaultConfig(), borderRadius: 12 }, 'light');
      expect(vars['--border-radius']).toBe('12px');
    });

    it('should apply font size', () => {
      const vars = buildThemeVariables({ ...getDefaultConfig(), fontSize: 'large' }, 'light');
      expect(vars['--font-size-base']).toBe('16px');
    });
  });

  describe('applyThemeToCSS', () => {
    it('should generate CSS string', () => {
      const vars = buildThemeVariables(getDefaultConfig(), 'light');
      const css = applyThemeToCSS(vars);
      expect(css).toContain('--primary-color: #1890ff;');
      expect(css).toContain('--bg-color:');
    });
  });

  describe('mergeThemeConfig', () => {
    it('should merge overrides', () => {
      const merged = mergeThemeConfig(getDefaultConfig(), { mode: 'dark', borderRadius: 8 });
      expect(merged.mode).toBe('dark');
      expect(merged.borderRadius).toBe(8);
      expect(merged.primaryColor).toBe('#1890ff');
    });
  });

  describe('getColorSchemePrimary', () => {
    it('should return colors', () => {
      expect(getColorSchemePrimary('blue')).toBe('#1890ff');
      expect(getColorSchemePrimary('green')).toBe('#52c41a');
      expect(getColorSchemePrimary('red')).toBe('#ff4d4f');
    });
  });

  describe('isValidColorScheme', () => {
    it('should validate schemes', () => {
      expect(isValidColorScheme('blue')).toBe(true);
      expect(isValidColorScheme('unknown')).toBe(false);
    });
  });

  describe('serializeThemeConfig / deserializeThemeConfig', () => {
    it('should round-trip config', () => {
      const config = getDefaultConfig();
      const serialized = serializeThemeConfig(config);
      const deserialized = deserializeThemeConfig(serialized);
      expect(deserialized?.mode).toBe(config.mode);
      expect(deserialized?.primaryColor).toBe(config.primaryColor);
    });

    it('should handle invalid JSON', () => {
      expect(deserializeThemeConfig('not json')).toBeNull();
    });
  });

  describe('calcContrastRatio', () => {
    it('should calculate contrast', () => {
      const ratio = calcContrastRatio('#000000', '#ffffff');
      expect(ratio).toBeGreaterThan(10);
    });

    it('should return 1 for same colors', () => {
      expect(calcContrastRatio('#808080', '#808080')).toBeCloseTo(1);
    });
  });

  describe('isAccessibleContrast', () => {
    it('should check WCAG AA', () => {
      expect(isAccessibleContrast(7)).toBe(true);
      expect(isAccessibleContrast(4.5)).toBe(true);
      expect(isAccessibleContrast(3)).toBe(false);
    });
  });

  describe('generateCSSClassPrefix', () => {
    it('should generate prefix', () => {
      expect(generateCSSClassPrefix('blue')).toBe('theme-blue');
      expect(generateCSSClassPrefix('dark' as ColorScheme)).toBe('theme-dark');
    });
  });

  describe('buildCompactOverrides', () => {
    it('should return overrides when compact', () => {
      const overrides = buildCompactOverrides(true);
      expect(overrides['--border-radius']).toBe('2px');
    });

    it('should return empty when not compact', () => {
      expect(buildCompactOverrides(false)).toEqual({});
    });
  });
});
