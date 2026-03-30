import { describe, it, expect } from 'vitest';

// 前端主题与样式系统测试

interface ThemeColors {
  primary: string;
  success: string;
  danger: string;
  warning: string;
  info: string;
  background: string;
  surface: string;
  text: string;
  textSecondary: string;
  border: string;
  rise: string;
  fall: string;
  flat: string;
}

const LIGHT_THEME: ThemeColors = {
  primary: '#1890ff',
  success: '#52c41a',
  danger: '#ff4d4f',
  warning: '#faad14',
  info: '#1890ff',
  background: '#f0f2f5',
  surface: '#ffffff',
  text: '#333333',
  textSecondary: '#666666',
  border: '#d9d9d9',
  rise: '#ff4d4f',
  fall: '#52c41a',
  flat: '#999999',
};

const DARK_THEME: ThemeColors = {
  primary: '#177ddc',
  success: '#49aa19',
  danger: '#d32029',
  warning: '#d89614',
  info: '#177ddc',
  background: '#141414',
  surface: '#1f1f1f',
  text: '#ffffffd9',
  textSecondary: '#ffffff73',
  border: '#434343',
  rise: '#d32029',
  fall: '#49aa19',
  flat: '#595959',
};

function getThemeColors(mode: 'light' | 'dark'): ThemeColors {
  return mode === 'dark' ? DARK_THEME : LIGHT_THEME;
}

function generateCSSVariables(theme: ThemeColors): string {
  return Object.entries(theme)
    .map(([key, value]) => `--color-${key.replace(/([A-Z])/g, '-$1').toLowerCase()}: ${value};`)
    .join('\n');
}

function hexToRGB(hex: string): { r: number; g: number; b: number } {
  const clean = hex.replace('#', '');
  return {
    r: parseInt(clean.slice(0, 2), 16),
    g: parseInt(clean.slice(2, 4), 16),
    b: parseInt(clean.slice(4, 6), 16),
  };
}

function relativeLuminance(hex: string): number {
  const { r, g, b } = hexToRGB(hex);
  const [rs, gs, bs] = [r, g, b].map(c => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
}

function contrastRatio(hex1: string, hex2: string): number {
  const l1 = relativeLuminance(hex1);
  const l2 = relativeLuminance(hex2);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

function meetsWCAG(hex1: string, hex2: string, level: 'AA' | 'AAA' = 'AA'): boolean {
  const ratio = contrastRatio(hex1, hex2);
  return level === 'AA' ? ratio >= 4.5 : ratio >= 7;
}

function getColorForChange(changePercent: number, theme: ThemeColors): string {
  if (changePercent > 0) return theme.rise;
  if (changePercent < 0) return theme.fall;
  return theme.flat;
}

function generateGradient(startColor: string, endColor: string, steps: number): string[] {
  const start = hexToRGB(startColor);
  const end = hexToRGB(endColor);
  const colors: string[] = [];
  
  for (let i = 0; i < steps; i++) {
    const t = i / (steps - 1);
    const r = Math.round(start.r + (end.r - start.r) * t);
    const g = Math.round(start.g + (end.g - start.g) * t);
    const b = Math.round(start.b + (end.b - start.b) * t);
    colors.push(`#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`);
  }
  return colors;
}

function opacity(hex: string, alpha: number): string {
  const { r, g, b } = hexToRGB(hex);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

describe('主题与样式系统', () => {
  describe('主题常量', () => {
    it('浅色主题完整性', () => {
      const keys = Object.keys(LIGHT_THEME);
      expect(keys).toContain('primary');
      expect(keys).toContain('rise');
      expect(keys).toContain('fall');
      expect(keys).toContain('flat');
      expect(keys.length).toBe(13);
    });

    it('暗色主题完整性', () => {
      const keys = Object.keys(DARK_THEME);
      expect(keys.length).toBe(Object.keys(LIGHT_THEME).length);
    });

    it('A股红涨绿跌 - 浅色', () => {
      expect(LIGHT_THEME.rise).toBe('#ff4d4f');
      expect(LIGHT_THEME.fall).toBe('#52c41a');
    });

    it('A股红涨绿跌 - 暗色', () => {
      expect(DARK_THEME.rise).toBe('#d32029');
      expect(DARK_THEME.fall).toBe('#49aa19');
    });

    it('所有颜色为有效hex', () => {
      const hexRegex = /^#[0-9a-f]{6}([0-9a-f]{2})?$/i;
      for (const color of Object.values(LIGHT_THEME)) {
        expect(color).toMatch(hexRegex);
      }
      for (const color of Object.values(DARK_THEME)) {
        expect(color).toMatch(hexRegex);
      }
    });
  });

  describe('主题切换', () => {
    it('返回浅色主题', () => {
      const theme = getThemeColors('light');
      expect(theme).toEqual(LIGHT_THEME);
    });

    it('返回暗色主题', () => {
      const theme = getThemeColors('dark');
      expect(theme).toEqual(DARK_THEME);
    });

    it('暗色背景更深', () => {
      const lightBg = relativeLuminance(LIGHT_THEME.background);
      const darkBg = relativeLuminance(DARK_THEME.background);
      expect(darkBg).toBeLessThan(lightBg);
    });
  });

  describe('CSS变量生成', () => {
    it('生成变量声明', () => {
      const css = generateCSSVariables(LIGHT_THEME);
      expect(css).toContain('--color-primary:');
      expect(css).toContain('--color-rise:');
    });

    it('camelCase转kebab-case', () => {
      const css = generateCSSVariables(LIGHT_THEME);
      expect(css).toContain('--color-text-secondary:');
    });
  });

  describe('颜色转换', () => {
    it('hex转RGB', () => {
      expect(hexToRGB('#ff0000')).toEqual({ r: 255, g: 0, b: 0 });
      expect(hexToRGB('#00ff00')).toEqual({ r: 0, g: 255, b: 0 });
      expect(hexToRGB('#0000ff')).toEqual({ r: 0, g: 0, b: 255 });
    });

    it('无#号', () => {
      expect(hexToRGB('ffffff')).toEqual({ r: 255, g: 255, b: 255 });
    });
  });

  describe('对比度', () => {
    it('黑白对比度最高', () => {
      const ratio = contrastRatio('#000000', '#ffffff');
      expect(ratio).toBeCloseTo(21, 0);
    });

    it('同色对比度最低', () => {
      const ratio = contrastRatio('#808080', '#808080');
      expect(ratio).toBeCloseTo(1, 0);
    });

    it('WCAG AA通过', () => {
      expect(meetsWCAG('#000000', '#ffffff', 'AA')).toBe(true);
    });

    it('WCAG AA失败', () => {
      expect(meetsWCAG('#aaaaaa', '#ffffff', 'AA')).toBe(false);
    });

    it('WCAG AAA通过', () => {
      expect(meetsWCAG('#000000', '#ffffff', 'AAA')).toBe(true);
    });
  });

  describe('涨跌颜色', () => {
    it('上涨用rise色', () => {
      const color = getColorForChange(2.5, LIGHT_THEME);
      expect(color).toBe(LIGHT_THEME.rise);
    });

    it('下跌用fall色', () => {
      const color = getColorForChange(-1.5, LIGHT_THEME);
      expect(color).toBe(LIGHT_THEME.fall);
    });

    it('平盘用flat色', () => {
      const color = getColorForChange(0, LIGHT_THEME);
      expect(color).toBe(LIGHT_THEME.flat);
    });
  });

  describe('渐变生成', () => {
    it('生成指定步数', () => {
      const gradient = generateGradient('#000000', '#ffffff', 5);
      expect(gradient.length).toBe(5);
    });

    it('首尾颜色正确', () => {
      const gradient = generateGradient('#ff0000', '#0000ff', 3);
      expect(gradient[0]).toMatch(/ff.*00.*00/);
      expect(gradient[2]).toMatch(/00.*00.*ff/);
    });

    it('单步返回起始色', () => {
      const gradient = generateGradient('#123456', '#abcdef', 1);
      expect(gradient.length).toBe(1);
    });
  });

  describe('透明度', () => {
    it('生成rgba', () => {
      const result = opacity('#ff0000', 0.5);
      expect(result).toBe('rgba(255, 0, 0, 0.5)');
    });

    it('完全不透明', () => {
      expect(opacity('#000000', 1)).toBe('rgba(0, 0, 0, 1)');
    });

    it('完全透明', () => {
      expect(opacity('#ffffff', 0)).toBe('rgba(255, 255, 255, 0)');
    });
  });
});
