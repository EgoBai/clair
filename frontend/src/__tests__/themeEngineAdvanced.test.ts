import { describe, it, expect } from 'vitest';

// 前端主题引擎
interface ThemeConfig {
  name: string;
  colors: {
    primary: string;
    secondary: string;
    success: string;
    warning: string;
    error: string;
    info: string;
    background: string;
    surface: string;
    text: string;
    textSecondary: string;
    border: string;
    up: string;    // 涨
    down: string;  // 跌
    flat: string;  // 平
  };
  typography: {
    fontFamily: string;
    fontSizeBase: string;
    fontSizeSmall: string;
    fontSizeLarge: string;
    lineHeight: number;
  };
  spacing: {
    unit: number;
    xs: number;
    sm: number;
    md: number;
    lg: number;
    xl: number;
  };
  borderRadius: {
    sm: string;
    md: string;
    lg: string;
    full: string;
  };
  shadows: {
    sm: string;
    md: string;
    lg: string;
  };
}

const lightTheme: ThemeConfig = {
  name: 'light',
  colors: {
    primary: '#1890ff',
    secondary: '#722ed1',
    success: '#52c41a',
    warning: '#faad14',
    error: '#f5222d',
    info: '#1890ff',
    background: '#f0f2f5',
    surface: '#ffffff',
    text: '#333333',
    textSecondary: '#666666',
    border: '#d9d9d9',
    up: '#f5222d',
    down: '#52c41a',
    flat: '#999999',
  },
  typography: {
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    fontSizeBase: '14px',
    fontSizeSmall: '12px',
    fontSizeLarge: '16px',
    lineHeight: 1.5,
  },
  spacing: { unit: 4, xs: 4, sm: 8, md: 16, lg: 24, xl: 32 },
  borderRadius: { sm: '2px', md: '4px', lg: '8px', full: '50%' },
  shadows: {
    sm: '0 1px 2px rgba(0,0,0,0.1)',
    md: '0 2px 8px rgba(0,0,0,0.15)',
    lg: '0 4px 16px rgba(0,0,0,0.2)',
  },
};

const darkTheme: ThemeConfig = {
  ...lightTheme,
  name: 'dark',
  colors: {
    ...lightTheme.colors,
    background: '#141414',
    surface: '#1f1f1f',
    text: '#e8e8e8',
    textSecondary: '#a0a0a0',
    border: '#434343',
    up: '#f5222d',
    down: '#52c41a',
  },
};

function generateCSSVariables(theme: ThemeConfig): Record<string, string> {
  const vars: Record<string, string> = {};

  // Colors
  for (const [key, value] of Object.entries(theme.colors)) {
    vars[`--color-${key.replace(/([A-Z])/g, '-$1').toLowerCase()}`] = value;
  }

  // Typography
  vars['--font-family'] = theme.typography.fontFamily;
  vars['--font-size-base'] = theme.typography.fontSizeBase;
  vars['--font-size-small'] = theme.typography.fontSizeSmall;
  vars['--font-size-large'] = theme.typography.fontSizeLarge;
  vars['--line-height'] = String(theme.typography.lineHeight);

  // Spacing
  for (const [key, value] of Object.entries(theme.spacing)) {
    vars[`--spacing-${key}`] = `${value}px`;
  }

  // Border radius
  for (const [key, value] of Object.entries(theme.borderRadius)) {
    vars[`--border-radius-${key}`] = value;
  }

  return vars;
}

function applyTheme(theme: ThemeConfig, element?: HTMLElement): void {
  const vars = generateCSSVariables(theme);
  const target = element || document.documentElement;
  for (const [key, value] of Object.entries(vars)) {
    target.style.setProperty(key, value);
  }
}

function getColorWithOpacity(hex: string, opacity: number): string {
  if (!hex.startsWith('#')) return hex;
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${opacity})`;
}

function getContrastColor(hex: string): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.5 ? '#000000' : '#ffffff';
}

function interpolateColor(color1: string, color2: string, ratio: number): string {
  const r1 = parseInt(color1.slice(1, 3), 16);
  const g1 = parseInt(color1.slice(3, 5), 16);
  const b1 = parseInt(color1.slice(5, 7), 16);
  const r2 = parseInt(color2.slice(1, 3), 16);
  const g2 = parseInt(color2.slice(3, 5), 16);
  const b2 = parseInt(color2.slice(5, 7), 16);

  const r = Math.round(r1 + (r2 - r1) * ratio);
  const g = Math.round(g1 + (g2 - g1) * ratio);
  const b = Math.round(b1 + (b2 - b1) * ratio);

  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
}

function generateGradient(startColor: string, endColor: string, steps: number): string[] {
  const colors: string[] = [];
  for (let i = 0; i < steps; i++) {
    colors.push(interpolateColor(startColor, endColor, i / (steps - 1)));
  }
  return colors;
}

function isValidHexColor(hex: string): boolean {
  return /^#([0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/.test(hex);
}

function parseColorToRGB(hex: string): { r: number; g: number; b: number; a?: number } {
  if (!isValidHexColor(hex)) throw new Error('Invalid hex color');
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const a = hex.length === 9 ? parseInt(hex.slice(7, 9), 16) / 255 : undefined;
  return { r, g, b, a };
}

describe('前端主题引擎', () => {
  describe('主题配置', () => {
    it('light主题应该有完整配置', () => {
      expect(lightTheme.name).toBe('light');
      expect(lightTheme.colors).toBeDefined();
      expect(lightTheme.typography).toBeDefined();
      expect(lightTheme.spacing).toBeDefined();
      expect(lightTheme.borderRadius).toBeDefined();
      expect(lightTheme.shadows).toBeDefined();
    });

    it('dark主题应该覆盖颜色', () => {
      expect(darkTheme.name).toBe('dark');
      expect(darkTheme.colors.background).not.toBe(lightTheme.colors.background);
    });

    it('应该有涨跌颜色', () => {
      expect(lightTheme.colors.up).toBeDefined();
      expect(lightTheme.colors.down).toBeDefined();
      expect(lightTheme.colors.flat).toBeDefined();
    });

    it('A股主题: 红涨绿跌', () => {
      expect(lightTheme.colors.up).toBe('#f5222d'); // 红色
      expect(lightTheme.colors.down).toBe('#52c41a'); // 绿色
    });
  });

  describe('generateCSSVariables', () => {
    it('应该生成CSS变量', () => {
      const vars = generateCSSVariables(lightTheme);
      expect(vars['--color-primary']).toBe('#1890ff');
      expect(vars['--color-background']).toBe('#f0f2f5');
      expect(vars['--font-family']).toBeDefined();
      expect(vars['--spacing-unit']).toBe('4px');
    });

    it('应该包含所有颜色', () => {
      const vars = generateCSSVariables(lightTheme);
      expect(vars['--color-up']).toBeDefined();
      expect(vars['--color-down']).toBeDefined();
    });

    it('应该包含spacing变量', () => {
      const vars = generateCSSVariables(lightTheme);
      expect(vars['--spacing-xs']).toBe('4px');
      expect(vars['--spacing-sm']).toBe('8px');
      expect(vars['--spacing-md']).toBe('16px');
      expect(vars['--spacing-lg']).toBe('24px');
      expect(vars['--spacing-xl']).toBe('32px');
    });

    it('应该包含border-radius变量', () => {
      const vars = generateCSSVariables(lightTheme);
      expect(vars['--border-radius-sm']).toBe('2px');
      expect(vars['--border-radius-md']).toBe('4px');
      expect(vars['--border-radius-lg']).toBe('8px');
      expect(vars['--border-radius-full']).toBe('50%');
    });

    it('dark主题应该有不同的背景色', () => {
      const darkVars = generateCSSVariables(darkTheme);
      const lightVars = generateCSSVariables(lightTheme);
      expect(darkVars['--color-background']).not.toBe(lightVars['--color-background']);
    });
  });

  describe('getColorWithOpacity', () => {
    it('应该正确添加透明度', () => {
      expect(getColorWithOpacity('#ff0000', 0.5)).toBe('rgba(255,0,0,0.5)');
    });

    it('白色应该正确', () => {
      expect(getColorWithOpacity('#ffffff', 1)).toBe('rgba(255,255,255,1)');
    });

    it('黑色应该正确', () => {
      expect(getColorWithOpacity('#000000', 0.8)).toBe('rgba(0,0,0,0.8)');
    });

    it('非hex应该原样返回', () => {
      expect(getColorWithOpacity('red', 0.5)).toBe('red');
    });

    it('透明度0应该有效', () => {
      expect(getColorWithOpacity('#123456', 0)).toBe('rgba(18,52,86,0)');
    });
  });

  describe('getContrastColor', () => {
    it('浅色背景应该返回黑色文字', () => {
      expect(getContrastColor('#ffffff')).toBe('#000000');
      expect(getContrastColor('#f0f0f0')).toBe('#000000');
    });

    it('深色背景应该返回白色文字', () => {
      expect(getContrastColor('#000000')).toBe('#ffffff');
      expect(getContrastColor('#333333')).toBe('#ffffff');
    });

    it('中等亮度应该选择一个', () => {
      const result = getContrastColor('#808080');
      expect(['#000000', '#ffffff']).toContain(result);
    });
  });

  describe('interpolateColor', () => {
    it('ratio=0应该返回起始色', () => {
      expect(interpolateColor('#ff0000', '#0000ff', 0)).toBe('#ff0000');
    });

    it('ratio=1应该返回结束色', () => {
      expect(interpolateColor('#ff0000', '#0000ff', 1)).toBe('#0000ff');
    });

    it('ratio=0.5应该返回中间色', () => {
      const result = interpolateColor('#000000', '#ffffff', 0.5);
      expect(result).toMatch(/^#[0-9a-f]{6}$/);
    });

    it('相同颜色应该返回自身', () => {
      expect(interpolateColor('#abcdef', '#abcdef', 0.5)).toBe('#abcdef');
    });
  });

  describe('generateGradient', () => {
    it('应该生成指定步数的颜色', () => {
      const gradient = generateGradient('#000000', '#ffffff', 5);
      expect(gradient).toHaveLength(5);
      expect(gradient[0]).toBe('#000000');
      expect(gradient[4]).toBe('#ffffff');
    });

    it('2步应该返回起始和结束', () => {
      const gradient = generateGradient('#ff0000', '#0000ff', 2);
      expect(gradient).toEqual(['#ff0000', '#0000ff']);
    });

    it('每步颜色都应该是合法hex', () => {
      const gradient = generateGradient('#123456', '#abcdef', 10);
      gradient.forEach(c => {
        expect(c).toMatch(/^#[0-9a-f]{6}$/);
      });
    });
  });

  describe('isValidHexColor', () => {
    it('6位hex应该有效', () => {
      expect(isValidHexColor('#ff0000')).toBe(true);
      expect(isValidHexColor('#123abc')).toBe(true);
    });

    it('8位hex应该有效（含alpha）', () => {
      expect(isValidHexColor('#ff0000ff')).toBe(true);
    });

    it('无#应该无效', () => {
      expect(isValidHexColor('ff0000')).toBe(false);
    });

    it('长度不对应该无效', () => {
      expect(isValidHexColor('#fff')).toBe(false);
      expect(isValidHexColor('#ffff')).toBe(false);
    });

    it('含非法字符应该无效', () => {
      expect(isValidHexColor('#gggggg')).toBe(false);
    });

    it('空字符串应该无效', () => {
      expect(isValidHexColor('')).toBe(false);
    });
  });

  describe('parseColorToRGB', () => {
    it('应该正确解析颜色', () => {
      const result = parseColorToRGB('#ff0000');
      expect(result.r).toBe(255);
      expect(result.g).toBe(0);
      expect(result.b).toBe(0);
    });

    it('应该正确解析含alpha的颜色', () => {
      const result = parseColorToRGB('#ff000080');
      expect(result.r).toBe(255);
      expect(result.a).toBeCloseTo(0.502, 2);
    });

    it('黑色应该是0,0,0', () => {
      const result = parseColorToRGB('#000000');
      expect(result).toEqual({ r: 0, g: 0, b: 0 });
    });

    it('白色应该是255,255,255', () => {
      const result = parseColorToRGB('#ffffff');
      expect(result).toEqual({ r: 255, g: 255, b: 255 });
    });

    it('无效颜色应该抛错', () => {
      expect(() => parseColorToRGB('invalid')).toThrow();
    });
  });
});
