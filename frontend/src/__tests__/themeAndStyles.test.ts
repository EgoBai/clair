/**
 * 主题系统与样式计算测试
 */
import { describe, it, expect } from 'vitest';

type Theme = 'light' | 'dark';

interface ThemeColors {
  background: string;
  text: string;
  card: string;
  border: string;
  red: string;
  green: string;
  primary: string;
}

const LIGHT_THEME: ThemeColors = {
  background: '#f5f5f5',
  text: '#333333',
  card: '#ffffff',
  border: '#e8e8e8',
  red: '#ef4444',
  green: '#22c55e',
  primary: '#1890ff',
};

const DARK_THEME: ThemeColors = {
  background: '#141414',
  text: '#e0e0e0',
  card: '#1f1f1f',
  border: '#434343',
  red: '#f87171',
  green: '#4ade80',
  primary: '#4096ff',
};

function getThemeColors(theme: Theme): ThemeColors {
  return theme === 'dark' ? DARK_THEME : LIGHT_THEME;
}

function hexToRgba(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function getContrastRatio(hex1: string, hex2: string): number {
  const lum1 = getLuminance(hex1);
  const lum2 = getLuminance(hex2);
  const lighter = Math.max(lum1, lum2);
  const darker = Math.min(lum1, lum2);
  return (lighter + 0.05) / (darker + 0.05);
}

function getLuminance(hex: string): number {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  const toLinear = (c: number) => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
  return 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);
}

function getChangeColor(change: number, theme: Theme): string {
  const colors = getThemeColors(theme);
  if (change > 0) return colors.red;
  if (change < 0) return colors.green;
  return colors.text;
}

function generateCSSVariables(colors: ThemeColors): Record<string, string> {
  return {
    '--bg-color': colors.background,
    '--text-color': colors.text,
    '--card-color': colors.card,
    '--border-color': colors.border,
    '--red': colors.red,
    '--green': colors.green,
    '--primary': colors.primary,
  };
}

describe('主题系统', () => {
  describe('主题切换', () => {
    it('浅色主题配色正确', () => {
      const colors = getThemeColors('light');
      expect(colors.background).toBe('#f5f5f5');
      expect(colors.text).toBe('#333333');
    });

    it('深色主题配色正确', () => {
      const colors = getThemeColors('dark');
      expect(colors.background).toBe('#141414');
    });

    it('两套主题颜色不同', () => {
      const light = getThemeColors('light');
      const dark = getThemeColors('dark');
      expect(light.background).not.toBe(dark.background);
    });

    it('涨跌颜色一致（红涨绿跌）', () => {
      expect(getChangeColor(5, 'light')).toBe(LIGHT_THEME.red);
      expect(getChangeColor(-5, 'light')).toBe(LIGHT_THEME.green);
      expect(getChangeColor(5, 'dark')).toBe(DARK_THEME.red);
      expect(getChangeColor(-5, 'dark')).toBe(DARK_THEME.green);
    });

    it('平盘返回文字色', () => {
      expect(getChangeColor(0, 'light')).toBe(LIGHT_THEME.text);
    });
  });

  describe('RGBA转换', () => {
    it('不透明度100%', () => {
      expect(hexToRgba('#ff0000', 1)).toBe('rgba(255, 0, 0, 1)');
    });

    it('半透明', () => {
      expect(hexToRgba('#00ff00', 0.5)).toBe('rgba(0, 255, 0, 0.5)');
    });

    it('白色', () => {
      expect(hexToRgba('#ffffff', 1)).toBe('rgba(255, 255, 255, 1)');
    });

    it('黑色', () => {
      expect(hexToRgba('#000000', 1)).toBe('rgba(0, 0, 0, 1)');
    });
  });

  describe('亮度与对比度', () => {
    it('白色亮度最高', () => {
      expect(getLuminance('#ffffff')).toBeCloseTo(1, 1);
    });

    it('黑色亮度最低', () => {
      expect(getLuminance('#000000')).toBeCloseTo(0, 1);
    });

    it('黑白对比度最高', () => {
      const ratio = getContrastRatio('#000000', '#ffffff');
      expect(ratio).toBeCloseTo(21, 0);
    });

    it('同色对比度为1', () => {
      expect(getContrastRatio('#333333', '#333333')).toBeCloseTo(1);
    });
  });

  describe('CSS变量生成', () => {
    it('生成全部变量', () => {
      const vars = generateCSSVariables(LIGHT_THEME);
      expect(Object.keys(vars)).toHaveLength(7);
    });

    it('变量名正确', () => {
      const vars = generateCSSVariables(LIGHT_THEME);
      expect(vars).toHaveProperty('--bg-color');
      expect(vars).toHaveProperty('--red');
    });

    it('深色主题变量', () => {
      const vars = generateCSSVariables(DARK_THEME);
      expect(vars['--bg-color']).toBe('#141414');
    });
  });
});
