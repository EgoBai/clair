import { describe, it, expect } from 'vitest';

describe('主题引擎V2', () => {
  type Theme = 'light' | 'dark';

  interface ThemeColors {
    bg: string; text: string; card: string; border: string;
    up: string; down: string; flat: string;
    primary: string; danger: string; warning: string; success: string;
  }

  const LIGHT: ThemeColors = {
    bg: '#ffffff', text: '#333333', card: '#fafafa', border: '#e8e8e8',
    up: '#ef5350', down: '#26a69a', flat: '#999999',
    primary: '#1890ff', danger: '#ff4d4f', warning: '#faad14', success: '#52c41a',
  };
  const DARK: ThemeColors = {
    bg: '#141414', text: '#e0e0e0', card: '#1f1f1f', border: '#303030',
    up: '#ef5350', down: '#26a69a', flat: '#666666',
    primary: '#177ddc', danger: '#a61d24', warning: '#d89614', success: '#49aa19',
  };

  function getColors(theme: Theme): ThemeColors {
    return theme === 'dark' ? DARK : LIGHT;
  }
  function generateCSSVars(colors: ThemeColors): Record<string, string> {
    return {
      '--bg': colors.bg, '--text': colors.text, '--card': colors.card, '--border': colors.border,
      '--up': colors.up, '--down': colors.down, '--flat': colors.flat,
      '--primary': colors.primary, '--danger': colors.danger, '--warning': colors.warning, '--success': colors.success,
    };
  }
  function cssVarsToString(vars: Record<string, string>): string {
    return Object.entries(vars).map(([k, v]) => `${k}: ${v};`).join(' ');
  }
  function invertHex(hex: string): string {
    const num = parseInt(hex.slice(1), 16);
    const inv = 0xffffff ^ num;
    return '#' + inv.toString(16).padStart(6, '0');
  }
  function hexToRGB(hex: string): { r: number; g: number; b: number } {
    const num = parseInt(hex.slice(1), 16);
    return { r: (num >> 16) & 255, g: (num >> 8) & 255, b: num & 255 };
  }
  function rgbToHex(r: number, g: number, b: number): string {
    return '#' + [r, g, b].map(c => c.toString(16).padStart(2, '0')).join('');
  }
  function calcLuminance(hex: string): number {
    const { r, g, b } = hexToRGB(hex);
    return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  }
  function isLight(hex: string): boolean {
    return calcLuminance(hex) > 0.5;
  }
  function blendColors(hex1: string, hex2: string, ratio: number): string {
    const c1 = hexToRGB(hex1), c2 = hexToRGB(hex2);
    const r = Math.round(c1.r + (c2.r - c1.r) * ratio);
    const g = Math.round(c1.g + (c2.g - c1.g) * ratio);
    const b = Math.round(c1.b + (c2.b - c1.b) * ratio);
    return rgbToHex(r, g, b);
  }
  function applyOpacity(hex: string, opacity: number): string {
    const alpha = Math.round(opacity * 255).toString(16).padStart(2, '0');
    return hex + alpha;
  }

  it('浅色主题背景', () => {
    expect(getColors('light').bg).toBe('#ffffff');
  });

  it('深色主题背景', () => {
    expect(getColors('dark').bg).toBe('#141414');
  });

  it('A股红涨绿跌 - 浅色', () => {
    const c = getColors('light');
    expect(c.up).toBe('#ef5350');
    expect(c.down).toBe('#26a69a');
  });

  it('A股红涨绿跌 - 深色', () => {
    const c = getColors('dark');
    expect(c.up).toBe('#ef5350');
    expect(c.down).toBe('#26a69a');
  });

  it('CSS变量生成', () => {
    const vars = generateCSSVars(LIGHT);
    expect(vars['--bg']).toBe('#ffffff');
    expect(vars['--up']).toBe('#ef5350');
  });

  it('CSS变量转字符串', () => {
    const str = cssVarsToString({ '--bg': '#fff', '--text': '#000' });
    expect(str).toBe('--bg: #fff; --text: #000;');
  });

  it('RGB转Hex', () => {
    expect(rgbToHex(255, 0, 0)).toBe('#ff0000');
    expect(rgbToHex(0, 255, 0)).toBe('#00ff00');
    expect(rgbToHex(0, 0, 255)).toBe('#0000ff');
  });

  it('Hex转RGB', () => {
    expect(hexToRGB('#ff0000')).toEqual({ r: 255, g: 0, b: 0 });
    expect(hexToRGB('#00ff00')).toEqual({ r: 0, g: 255, b: 0 });
  });

  it('Hex/RGB往返', () => {
    const hex = '#1a2b3c';
    const rgb = hexToRGB(hex);
    expect(rgbToHex(rgb.r, rgb.g, rgb.b)).toBe(hex);
  });

  it('亮度计算', () => {
    expect(calcLuminance('#ffffff')).toBeCloseTo(1, 1);
    expect(calcLuminance('#000000')).toBeCloseTo(0, 1);
  });

  it('浅色判断', () => {
    expect(isLight('#ffffff')).toBe(true);
    expect(isLight('#000000')).toBe(false);
  });

  it('颜色混合', () => {
    const blended = blendColors('#000000', '#ffffff', 0.5);
    expect(blended).toBe('#808080');
  });

  it('颜色混合0比例', () => {
    expect(blendColors('#ff0000', '#0000ff', 0)).toBe('#ff0000');
  });

  it('颜色混合1比例', () => {
    expect(blendColors('#ff0000', '#0000ff', 1)).toBe('#0000ff');
  });

  it('透明度', () => {
    const hex = applyOpacity('#ff0000', 0.5);
    expect(hex).toMatch(/^#ff0000[0-9a-f]{2}$/);
  });

  it('反转颜色', () => {
    expect(invertHex('#ffffff')).toBe('#000000');
    expect(invertHex('#000000')).toBe('#ffffff');
  });

  it('主题颜色完整性', () => {
    for (const colors of [LIGHT, DARK]) {
      expect(Object.keys(colors)).toHaveLength(11);
      for (const v of Object.values(colors)) {
        expect(v).toMatch(/^#[0-9a-f]{6}$/);
      }
    }
  });

  it('所有颜色有效', () => {
    for (const colors of [LIGHT, DARK]) {
      for (const v of Object.values(colors)) {
        expect(() => hexToRGB(v)).not.toThrow();
      }
    }
  });
});
