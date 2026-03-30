import { describe, it, expect } from 'vitest';

// 主题引擎 v3
interface ThemeTokens {
  colors: Record<string, string>;
  spacing: Record<string, number>;
  borderRadius: Record<string, string>;
  shadows: Record<string, string>;
  typography: { fontFamily: string; sizes: Record<string, string>; weights: Record<string, number> };
}

const LIGHT_TOKENS: ThemeTokens = {
  colors: { primary: '#1677ff', success: '#52c41a', warning: '#faad14', error: '#ff4d4f', bg: '#ffffff', bgSecondary: '#f5f5f5', text: '#262626', textSecondary: '#8c8c8c', border: '#d9d9d9' },
  spacing: { xs: 4, sm: 8, md: 16, lg: 24, xl: 32 },
  borderRadius: { sm: '4px', md: '8px', lg: '12px', full: '9999px' },
  shadows: { sm: '0 1px 2px rgba(0,0,0,0.05)', md: '0 4px 6px rgba(0,0,0,0.1)', lg: '0 10px 15px rgba(0,0,0,0.1)' },
  typography: { fontFamily: '-apple-system, sans-serif', sizes: { xs: '12px', sm: '14px', md: '16px', lg: '20px', xl: '24px' }, weights: { normal: 400, medium: 500, bold: 700 } },
};

const DARK_TOKENS: ThemeTokens = {
  ...LIGHT_TOKENS,
  colors: { primary: '#177ddc', success: '#49aa19', warning: '#d89614', error: '#a61d24', bg: '#141414', bgSecondary: '#1f1f1f', text: '#ffffffd9', textSecondary: '#ffffff73', border: '#424242' },
};

function getTokens(theme: 'light' | 'dark'): ThemeTokens {
  return theme === 'dark' ? DARK_TOKENS : LIGHT_TOKENS;
}

function generateCSSVars(tokens: ThemeTokens): Record<string, string> {
  const vars: Record<string, string> = {};
  Object.entries(tokens.colors).forEach(([k, v]) => { vars[`--color-${k}`] = v; });
  Object.entries(tokens.spacing).forEach(([k, v]) => { vars[`--spacing-${k}`] = `${v}px`; });
  Object.entries(tokens.borderRadius).forEach(([k, v]) => { vars[`--radius-${k}`] = v; });
  return vars;
}

function mergeThemes(base: ThemeTokens, override: Partial<ThemeTokens>): ThemeTokens {
  return {
    colors: { ...base.colors, ...override.colors },
    spacing: { ...base.spacing, ...override.spacing },
    borderRadius: { ...base.borderRadius, ...override.borderRadius },
    shadows: { ...base.shadows, ...override.shadows },
    typography: {
      ...base.typography,
      ...override.typography,
      sizes: { ...base.typography.sizes, ...override.typography?.sizes },
      weights: { ...base.typography.weights, ...override.typography?.weights },
    },
  };
}

function getColorWithOpacity(color: string, opacity: number): string {
  const r = parseInt(color.slice(1, 3), 16);
  const g = parseInt(color.slice(3, 5), 16);
  const b = parseInt(color.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${opacity})`;
}

function calcContrastRatio(color1: string, color2: string): number {
  const lum = (hex: string) => {
    const r = parseInt(hex.slice(1, 3), 16) / 255;
    const g = parseInt(hex.slice(3, 5), 16) / 255;
    const b = parseInt(hex.slice(5, 7), 16) / 255;
    const toLinear = (c: number) => c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
    return 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);
  };
  const l1 = lum(color1), l2 = lum(color2);
  const lighter = Math.max(l1, l2), darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

function meetsWCAG(ratio: number, level: 'AA' | 'AAA' = 'AA'): boolean {
  return level === 'AAA' ? ratio >= 7 : ratio >= 4.5;
}

describe('主题引擎 v3', () => {
  describe('主题获取', () => {
    it('light主题应有白色背景', () => {
      expect(getTokens('light').colors.bg).toBe('#ffffff');
    });

    it('dark主题应有深色背景', () => {
      expect(getTokens('dark').colors.bg).toBe('#141414');
    });
  });

  describe('CSS变量生成', () => {
    it('应生成颜色变量', () => {
      const vars = generateCSSVars(LIGHT_TOKENS);
      expect(vars['--color-primary']).toBe('#1677ff');
    });

    it('应生成间距变量', () => {
      const vars = generateCSSVars(LIGHT_TOKENS);
      expect(vars['--spacing-md']).toBe('16px');
    });

    it('应生成圆角变量', () => {
      const vars = generateCSSVars(LIGHT_TOKENS);
      expect(vars['--radius-lg']).toBe('12px');
    });
  });

  describe('主题合并', () => {
    it('应覆盖指定的token', () => {
      const merged = mergeThemes(LIGHT_TOKENS, { colors: { primary: '#ff0000' } });
      expect(merged.colors.primary).toBe('#ff0000');
      expect(merged.colors.bg).toBe('#ffffff');
    });
  });

  describe('颜色透明度', () => {
    it('应生成rgba格式', () => {
      expect(getColorWithOpacity('#ff0000', 0.5)).toBe('rgba(255,0,0,0.5)');
    });
  });

  describe('对比度', () => {
    it('黑白对比度应为21', () => {
      expect(calcContrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 0);
    });

    it('相同颜色对比度应为1', () => {
      expect(calcContrastRatio('#808080', '#808080')).toBeCloseTo(1, 0);
    });
  });

  describe('WCAG合规', () => {
    it('21对比度应通过AA', () => { expect(meetsWCAG(21)).toBe(true); });
    it('21对比度应通过AAA', () => { expect(meetsWCAG(21, 'AAA')).toBe(true); });
    it('3对比度不应通过AA', () => { expect(meetsWCAG(3)).toBe(false); });
    it('5对比度应通过AA', () => { expect(meetsWCAG(5)).toBe(true); });
    it('5对比度不应通过AAA', () => { expect(meetsWCAG(5, 'AAA')).toBe(false); });
  });
});
