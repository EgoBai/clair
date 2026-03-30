import { describe, it, expect } from 'vitest';

/**
 * 主题引擎测试
 */

type ThemeMode = 'light' | 'dark' | 'system';

interface ThemeColors {
  bg: string;
  bgSecondary: string;
  text: string;
  textSecondary: string;
  border: string;
  rise: string;
  fall: string;
  flat: string;
  primary: string;
  card: string;
}

const LIGHT: ThemeColors = {
  bg: '#ffffff', bgSecondary: '#f5f5f5', text: '#1a1a1a', textSecondary: '#666666',
  border: '#e8e8e8', rise: '#e74c3c', fall: '#2ecc71', flat: '#999999',
  primary: '#1890ff', card: '#ffffff',
};

const DARK: ThemeColors = {
  bg: '#141414', bgSecondary: '#1f1f1f', text: '#e0e0e0', textSecondary: '#999999',
  border: '#303030', rise: '#e74c3c', fall: '#2ecc71', flat: '#666666',
  primary: '#177ddc', card: '#1f1f1f',
};

function resolveTheme(mode: ThemeMode, systemPrefersDark: boolean): 'light' | 'dark' {
  if (mode === 'system') return systemPrefersDark ? 'dark' : 'light';
  return mode;
}

function getColors(mode: 'light' | 'dark'): ThemeColors {
  return mode === 'dark' ? DARK : LIGHT;
}

function generateCSSVariables(colors: ThemeColors): Record<string, string> {
  return {
    '--bg': colors.bg,
    '--bg-secondary': colors.bgSecondary,
    '--text': colors.text,
    '--text-secondary': colors.textSecondary,
    '--border': colors.border,
    '--rise': colors.rise,
    '--fall': colors.fall,
    '--flat': colors.flat,
    '--primary': colors.primary,
    '--card': colors.card,
  };
}

function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const match = hex.match(/^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i);
  if (!match) return null;
  return { r: parseInt(match[1], 16), g: parseInt(match[2], 16), b: parseInt(match[3], 16) };
}

function rgbToHex(r: number, g: number, b: number): string {
  return '#' + [r, g, b].map(c => Math.round(clamp(c, 0, 255)).toString(16).padStart(2, '0')).join('');
}

function clamp(v: number, min: number, max: number): number {
  return Math.min(Math.max(v, min), max);
}

function getContrastRatio(c1: string, c2: string): number {
  const rgb1 = hexToRgb(c1), rgb2 = hexToRgb(c2);
  if (!rgb1 || !rgb2) return 0;
  const l1 = (0.299 * rgb1.r + 0.587 * rgb1.g + 0.114 * rgb1.b) / 255;
  const l2 = (0.299 * rgb2.r + 0.587 * rgb2.g + 0.114 * rgb2.b) / 255;
  const lighter = Math.max(l1, l2), darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

function adjustBrightness(hex: string, percent: number): string {
  const rgb = hexToRgb(hex);
  if (!rgb) return hex;
  return rgbToHex(
    rgb.r + (255 - rgb.r) * percent / 100,
    rgb.g + (255 - rgb.g) * percent / 100,
    rgb.b + (255 - rgb.b) * percent / 100,
  );
}

function getRiseFallColor(change: number, theme: 'light' | 'dark'): string {
  if (change > 0) return theme === 'dark' ? '#e74c3c' : '#e74c3c';
  if (change < 0) return theme === 'dark' ? '#2ecc71' : '#2ecc71';
  return theme === 'dark' ? '#666666' : '#999999';
}

describe('主题引擎', () => {
  describe('主题解析', () => {
    it('浅色模式', () => {
      expect(resolveTheme('light', true)).toBe('light');
    });

    it('深色模式', () => {
      expect(resolveTheme('dark', false)).toBe('dark');
    });

    it('跟随系统-深色', () => {
      expect(resolveTheme('system', true)).toBe('dark');
    });

    it('跟随系统-浅色', () => {
      expect(resolveTheme('system', false)).toBe('light');
    });
  });

  describe('颜色方案', () => {
    it('浅色背景白色', () => {
      expect(getColors('light').bg).toBe('#ffffff');
    });

    it('深色背景深色', () => {
      expect(getColors('dark').bg).toBe('#141414');
    });

    it('两种主题字段一致', () => {
      const lightKeys = Object.keys(getColors('light')).sort();
      const darkKeys = Object.keys(getColors('dark')).sort();
      expect(lightKeys).toEqual(darkKeys);
    });

    it('涨跌颜色一致', () => {
      expect(getColors('light').rise).toBe(getColors('dark').rise);
      expect(getColors('light').fall).toBe(getColors('dark').fall);
    });
  });

  describe('CSS变量', () => {
    it('生成正确数量', () => {
      const vars = generateCSSVariables(LIGHT);
      expect(Object.keys(vars).length).toBe(10);
    });

    it('所有键以--开头', () => {
      const vars = generateCSSVariables(LIGHT);
      for (const key of Object.keys(vars)) {
        expect(key.startsWith('--')).toBe(true);
      }
    });

    it('值非空', () => {
      const vars = generateCSSVariables(DARK);
      for (const val of Object.values(vars)) {
        expect(val.length).toBeGreaterThan(0);
      }
    });
  });

  describe('颜色转换', () => {
    it('hex转rgb', () => {
      const rgb = hexToRgb('#ff0000');
      expect(rgb).toEqual({ r: 255, g: 0, b: 0 });
    });

    it('rgb转hex', () => {
      expect(rgbToHex(255, 0, 0)).toBe('#ff0000');
    });

    it('无效hex返回null', () => {
      expect(hexToRgb('invalid')).toBeNull();
    });

    it('往返转换', () => {
      const hex = '#1a2b3c';
      const rgb = hexToRgb(hex)!;
      expect(rgbToHex(rgb.r, rgb.g, rgb.b)).toBe(hex);
    });

    it('rgb clamp', () => {
      expect(rgbToHex(300, -10, 128)).toBe('#ff0080');
    });
  });

  describe('对比度', () => {
    it('黑白对比度最高', () => {
      expect(getContrastRatio('#000000', '#ffffff')).toBeGreaterThan(10);
    });

    it('同色对比度为1', () => {
      expect(getContrastRatio('#ff0000', '#ff0000')).toBeCloseTo(1);
    });

    it('无效颜色返回零', () => {
      expect(getContrastRatio('bad', 'bad')).toBe(0);
    });

    it('浅色主题文字对比度达标', () => {
      expect(getContrastRatio(LIGHT.text, LIGHT.bg)).toBeGreaterThan(6);
    });

    it('深色主题文字对比度达标', () => {
      expect(getContrastRatio(DARK.text, DARK.bg)).toBeGreaterThan(7);
    });
  });

  describe('亮度调整', () => {
    it('增亮', () => {
      const result = adjustBrightness('#000000', 50);
      expect(result).not.toBe('#000000');
    });

    it('100%变为白色', () => {
      expect(adjustBrightness('#000000', 100)).toBe('#ffffff');
    });

    it('0%不变', () => {
      expect(adjustBrightness('#ff0000', 0)).toBe('#ff0000');
    });

    it('无效颜色返回原值', () => {
      expect(adjustBrightness('invalid', 50)).toBe('invalid');
    });
  });

  describe('涨跌颜色', () => {
    it('上涨红色', () => {
      expect(getRiseFallColor(1, 'light')).toBe('#e74c3c');
    });

    it('下跌绿色', () => {
      expect(getRiseFallColor(-1, 'light')).toBe('#2ecc71');
    });

    it('平盘灰色', () => {
      expect(getRiseFallColor(0, 'light')).toBe('#999999');
    });

    it('深色模式同色', () => {
      expect(getRiseFallColor(1, 'dark')).toBe(getRiseFallColor(1, 'light'));
    });
  });
});
