import { describe, it, expect } from 'vitest';

// CSS-in-JS Style System Logic
interface ThemeConfig {
  colors: Record<string, string>;
  spacing: Record<string, string>;
  breakpoints: Record<string, number>;
  typography: Record<string, string>;
}

const lightTheme: ThemeConfig = {
  colors: { primary: '#1890ff', success: '#52c41a', warning: '#faad14', error: '#f5222d', text: '#333333', bg: '#ffffff', border: '#d9d9d9', rise: '#ff4d4f', fall: '#52c41a' },
  spacing: { xs: '4px', sm: '8px', md: '16px', lg: '24px', xl: '32px' },
  breakpoints: { sm: 576, md: 768, lg: 992, xl: 1200, xxl: 1600 },
  typography: { h1: '32px', h2: '24px', h3: '20px', body: '14px', small: '12px' }
};

const darkTheme: ThemeConfig = {
  colors: { primary: '#177ddc', success: '#49aa19', warning: '#d89614', error: '#a61d24', text: '#e8e8e8', bg: '#141414', border: '#434343', rise: '#cf1322', fall: '#3f6600' },
  spacing: lightTheme.spacing,
  breakpoints: lightTheme.breakpoints,
  typography: lightTheme.typography
};

function generateCSSVars(theme: ThemeConfig): string {
  const lines: string[] = [];
  for (const [group, values] of Object.entries(theme)) {
    if (typeof values === 'object') {
      for (const [key, value] of Object.entries(values)) {
        lines.push(`--${group}-${key}: ${value};`);
      }
    }
  }
  return lines.join('\n');
}

function getResponsiveValue<T>(value: T | Record<string, T>, width: number, breakpoints: Record<string, number>): T {
  if (typeof value !== 'object' || value === null) return value as T;
  const entries = Object.entries(value as Record<string, T>).sort(
    ([a], [b]) => (breakpoints[a] || 0) - (breakpoints[b] || 0)
  );
  let result: T = entries[0]?.[1] as T;
  for (const [bp, val] of entries) {
    if (width >= (breakpoints[bp] || 0)) result = val;
  }
  return result;
}

function mergeThemes(base: ThemeConfig, overrides: Partial<ThemeConfig>): ThemeConfig {
  const result = { ...base };
  for (const [key, value] of Object.entries(overrides)) {
    if (value && typeof value === 'object' && key in result) {
      (result as any)[key] = { ...(result as any)[key], ...value };
    }
  }
  return result;
}

function getColorContrast(bg: string): string {
  const hex = bg.replace('#', '');
  const r = parseInt(hex.substr(0, 2), 16);
  const g = parseInt(hex.substr(2, 2), 16);
  const b = parseInt(hex.substr(4, 2), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.5 ? '#000000' : '#ffffff';
}

function interpolateColor(color1: string, color2: string, ratio: number): string {
  const hex1 = color1.replace('#', '');
  const hex2 = color2.replace('#', '');
  const clamp = (v: number) => Math.max(0, Math.min(255, Math.round(v)));
  const r = clamp(parseInt(hex1.substr(0, 2), 16) * (1 - ratio) + parseInt(hex2.substr(0, 2), 16) * ratio);
  const g = clamp(parseInt(hex1.substr(2, 2), 16) * (1 - ratio) + parseInt(hex2.substr(2, 2), 16) * ratio);
  const b = clamp(parseInt(hex1.substr(4, 2), 16) * (1 - ratio) + parseInt(hex2.substr(4, 2), 16) * ratio);
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
}

describe('Theme & Style System', () => {
  describe('CSS Variables Generation', () => {
    it('should generate CSS variables from theme', () => {
      const css = generateCSSVars(lightTheme);
      expect(css).toContain('--colors-primary:');
      expect(css).toContain('--spacing-md:');
    });

    it('should include all color keys', () => {
      const css = generateCSSVars(lightTheme);
      for (const key of Object.keys(lightTheme.colors)) {
        expect(css).toContain(`--colors-${key}:`);
      }
    });

    it('should include spacing values', () => {
      const css = generateCSSVars(lightTheme);
      expect(css).toContain('--spacing-xs: 4px');
      expect(css).toContain('--spacing-lg: 24px');
    });

    it('should include breakpoint values', () => {
      const css = generateCSSVars(lightTheme);
      expect(css).toContain('--breakpoints-md: 768');
    });

    it('should handle dark theme differently', () => {
      const lightCSS = generateCSSVars(lightTheme);
      const darkCSS = generateCSSVars(darkTheme);
      expect(lightCSS).not.toEqual(darkCSS);
    });
  });

  describe('Responsive Values', () => {
    it('should return correct value for given width', () => {
      const result = getResponsiveValue({ sm: 'small', lg: 'large' }, 1000, lightTheme.breakpoints);
      expect(result).toBe('large');
    });

    it('should return smallest matching value', () => {
      const result = getResponsiveValue({ sm: 'small', lg: 'large' }, 400, lightTheme.breakpoints);
      expect(result).toBe('small');
    });

    it('should handle non-object values', () => {
      expect(getResponsiveValue('fixed', 1000, lightTheme.breakpoints)).toBe('fixed');
      expect(getResponsiveValue(42, 1000, lightTheme.breakpoints)).toBe(42);
    });

    it('should handle exact breakpoint', () => {
      const result = getResponsiveValue({ md: 'medium', lg: 'large' }, 768, lightTheme.breakpoints);
      expect(result).toBe('medium');
    });
  });

  describe('Theme Merging', () => {
    it('should merge color overrides', () => {
      const merged = mergeThemes(lightTheme, { colors: { primary: '#ff0000' } });
      expect(merged.colors.primary).toBe('#ff0000');
      expect(merged.colors.success).toBe(lightTheme.colors.success);
    });

    it('should merge spacing overrides', () => {
      const merged = mergeThemes(lightTheme, { spacing: { md: '20px' } });
      expect(merged.spacing.md).toBe('20px');
      expect(merged.spacing.sm).toBe(lightTheme.spacing.sm);
    });

    it('should not mutate original', () => {
      mergeThemes(lightTheme, { colors: { primary: '#ff0000' } });
      expect(lightTheme.colors.primary).toBe('#1890ff');
    });

    it('should handle empty overrides', () => {
      const merged = mergeThemes(lightTheme, {});
      expect(merged).toEqual(lightTheme);
    });
  });

  describe('Color Contrast', () => {
    it('should return black for light background', () => {
      expect(getColorContrast('#ffffff')).toBe('#000000');
      expect(getColorContrast('#eeeeee')).toBe('#000000');
    });

    it('should return white for dark background', () => {
      expect(getColorContrast('#000000')).toBe('#ffffff');
      expect(getColorContrast('#333333')).toBe('#ffffff');
    });

    it('should handle mid-range colors', () => {
      const contrast = getColorContrast('#888888');
      expect(['#000000', '#ffffff']).toContain(contrast);
    });
  });

  describe('Color Interpolation', () => {
    it('should return start color at ratio 0', () => {
      expect(interpolateColor('#ff0000', '#0000ff', 0)).toBe('#ff0000');
    });

    it('should return end color at ratio 1', () => {
      expect(interpolateColor('#ff0000', '#0000ff', 1)).toBe('#0000ff');
    });

    it('should interpolate midpoint', () => {
      const mid = interpolateColor('#000000', '#ffffff', 0.5);
      expect(mid).toMatch(/^#[0-9a-f]{6}$/);
    });

    it('should handle ratio > 1', () => {
      const result = interpolateColor('#000000', '#ffffff', 1.5);
      expect(result).toMatch(/^#[0-9a-f]{6}$/);
    });

    it('should handle ratio < 0', () => {
      const result = interpolateColor('#ffffff', '#000000', -0.5);
      expect(result).toMatch(/^#[0-9a-f]{6}$/);
    });
  });
});
