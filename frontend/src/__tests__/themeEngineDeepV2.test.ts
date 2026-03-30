import { describe, it, expect } from 'vitest';

// 主题引擎深度测试
interface ThemeConfig {
  name: string;
  colors: Record<string, string>;
  fonts: Record<string, string>;
  spacing: Record<string, string>;
  breakpoints: Record<string, number>;
  shadows: Record<string, string>;
  transitions: Record<string, string>;
  borderRadius: Record<string, string>;
  zIndex: Record<string, number>;
}

class ThemeEngine {
  static validateTheme(theme: ThemeConfig): { valid: boolean; errors: string[] } {
    const errors: string[] = [];
    if (!theme.name) errors.push('主题名称不能为空');
    if (!theme.colors.primary) errors.push('缺少主色');
    if (!theme.colors.background) errors.push('缺少背景色');
    if (!theme.colors.text) errors.push('缺少文字色');
    if (!theme.colors.error) errors.push('缺少错误色');
    if (!theme.colors.success) errors.push('缺少成功色');
    if (!theme.colors.warning) errors.push('缺少警告色');
    return { valid: errors.length === 0, errors };
  }

  static calculateContrastRatio(color1: string, color2: string): number {
    const lum1 = this.relativeLuminance(color1);
    const lum2 = this.relativeLuminance(color2);
    const lighter = Math.max(lum1, lum2);
    const darker = Math.min(lum1, lum2);
    return (lighter + 0.05) / (darker + 0.05);
  }

  static relativeLuminance(hex: string): number {
    const rgb = this.hexToRgb(hex);
    const [r, g, b] = [rgb.r / 255, rgb.g / 255, rgb.b / 255].map(c =>
      c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)
    );
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  }

  static hexToRgb(hex: string): { r: number; g: number; b: number } {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ? { r: parseInt(result[1], 16), g: parseInt(result[2], 16), b: parseInt(result[3], 16) } : { r: 0, g: 0, b: 0 };
  }

  static rgbToHex(r: number, g: number, b: number): string {
    return '#' + [r, g, b].map(x => Math.max(0, Math.min(255, Math.round(x))).toString(16).padStart(2, '0')).join('');
  }

  static lighten(hex: string, percent: number): string {
    const rgb = this.hexToRgb(hex);
    return this.rgbToHex(
      rgb.r + (255 - rgb.r) * percent / 100,
      rgb.g + (255 - rgb.g) * percent / 100,
      rgb.b + (255 - rgb.b) * percent / 100,
    );
  }

  static darken(hex: string, percent: number): string {
    const rgb = this.hexToRgb(hex);
    return this.rgbToHex(
      rgb.r * (1 - percent / 100),
      rgb.g * (1 - percent / 100),
      rgb.b * (1 - percent / 100),
    );
  }

  static generatePalette(baseColor: string, steps: number = 10): string[] {
    const palette: string[] = [];
    for (let i = steps; i >= 1; i--) {
      palette.push(this.lighten(baseColor, i * 8));
    }
    palette.push(baseColor);
    for (let i = 1; i <= steps; i++) {
      palette.push(this.darken(baseColor, i * 8));
    }
    return palette;
  }

  static meetsWCAG(contrastRatio: number, level: 'AA' | 'AAA' = 'AA'): boolean {
    return level === 'AA' ? contrastRatio >= 4.5 : contrastRatio >= 7;
  }

  static mergeThemes(base: ThemeConfig, override: Partial<ThemeConfig>): ThemeConfig {
    return {
      name: override.name || base.name,
      colors: { ...base.colors, ...override.colors },
      fonts: { ...base.fonts, ...override.fonts },
      spacing: { ...base.spacing, ...override.spacing },
      breakpoints: { ...base.breakpoints, ...override.breakpoints },
      shadows: { ...base.shadows, ...override.shadows },
      transitions: { ...base.transitions, ...override.transitions },
      borderRadius: { ...base.borderRadius, ...override.borderRadius },
      zIndex: { ...base.zIndex, ...override.zIndex },
    };
  }

  static generateCSSVars(theme: ThemeConfig): Record<string, string> {
    const vars: Record<string, string> = {};
    for (const [key, value] of Object.entries(theme.colors)) vars[`--color-${key}`] = value;
    for (const [key, value] of Object.entries(theme.fonts)) vars[`--font-${key}`] = value;
    for (const [key, value] of Object.entries(theme.spacing)) vars[`--spacing-${key}`] = value;
    return vars;
  }

  static isDarkTheme(theme: ThemeConfig): boolean {
    return this.relativeLuminance(theme.colors.background || '#000000') < 0.5;
  }

  static autoTextForBg(bgColor: string): string {
    return this.relativeLuminance(bgColor) > 0.5 ? '#000000' : '#ffffff';
  }

  static createResponsiveValue(base: string, breakpoints: Record<string, number>, viewport: number): string {
    const sorted = Object.entries(breakpoints).sort((a, b) => a[1] - b[1]);
    for (const [_, width] of sorted) {
      if (viewport <= width) return base;
    }
    return base;
  }
}

describe('主题引擎深度测试', () => {
  const lightTheme: ThemeConfig = {
    name: 'light',
    colors: { primary: '#1890ff', background: '#ffffff', text: '#000000', error: '#ff4d4f', success: '#52c41a', warning: '#faad14', border: '#d9d9d9', surface: '#f5f5f5' },
    fonts: { body: 'system-ui', heading: 'Georgia' },
    spacing: { xs: '4px', sm: '8px', md: '16px', lg: '24px', xl: '32px' },
    breakpoints: { sm: 576, md: 768, lg: 992, xl: 1200 },
    shadows: { sm: '0 1px 2px rgba(0,0,0,0.1)', md: '0 4px 8px rgba(0,0,0,0.1)' },
    transitions: { fast: '150ms', normal: '300ms', slow: '500ms' },
    borderRadius: { sm: '4px', md: '8px', lg: '16px', full: '9999px' },
    zIndex: { dropdown: 100, modal: 1000, tooltip: 1100 },
  };

  const darkTheme: ThemeConfig = {
    ...lightTheme,
    name: 'dark',
    colors: { primary: '#177ddc', background: '#141414', text: '#ffffff', error: '#a61d24', success: '#49aa19', warning: '#d89614', border: '#434343', surface: '#1f1f1f' },
  };

  describe('主题验证', () => {
    it('应该通过有效的主题', () => {
      expect(ThemeEngine.validateTheme(lightTheme).valid).toBe(true);
    });

    it('应该拒绝缺少必填色', () => {
      const bad = { ...lightTheme, colors: { primary: '#000' } };
      const r = ThemeEngine.validateTheme(bad);
      expect(r.valid).toBe(false);
      expect(r.errors.length).toBeGreaterThan(0);
    });

    it('应该拒绝空名称', () => {
      expect(ThemeEngine.validateTheme({ ...lightTheme, name: '' }).valid).toBe(false);
    });
  });

  describe('颜色操作', () => {
    it('应该转hex到rgb', () => {
      const rgb = ThemeEngine.hexToRgb('#ff0000');
      expect(rgb.r).toBe(255);
      expect(rgb.g).toBe(0);
      expect(rgb.b).toBe(0);
    });

    it('应该转rgb到hex', () => {
      expect(ThemeEngine.rgbToHex(255, 0, 0)).toBe('#ff0000');
    });

    it('应该限制rgb范围', () => {
      expect(ThemeEngine.rgbToHex(-10, 300, 128)).toBe('#00ff80');
    });

    it('应该提亮颜色', () => {
      const light = ThemeEngine.lighten('#000000', 50);
      expect(ThemeEngine.relativeLuminance(light)).toBeGreaterThan(0);
    });

    it('应该加深颜色', () => {
      const dark = ThemeEngine.darken('#ffffff', 50);
      expect(ThemeEngine.relativeLuminance(dark)).toBeLessThan(1);
    });

    it('应该生成调色板', () => {
      const palette = ThemeEngine.generatePalette('#1890ff', 5);
      expect(palette).toHaveLength(11);
    });
  });

  describe('对比度检查', () => {
    it('黑白对比度应该为21', () => {
      expect(ThemeEngine.calculateContrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 0);
    });

    it('相同颜色对比度应该为1', () => {
      expect(ThemeEngine.calculateContrastRatio('#808080', '#808080')).toBeCloseTo(1, 0);
    });

    it('应该检查WCAG AA标准', () => {
      expect(ThemeEngine.meetsWCAG(4.5, 'AA')).toBe(true);
      expect(ThemeEngine.meetsWCAG(4, 'AA')).toBe(false);
    });

    it('应该检查WCAG AAA标准', () => {
      expect(ThemeEngine.meetsWCAG(7, 'AAA')).toBe(true);
      expect(ThemeEngine.meetsWCAG(6, 'AAA')).toBe(false);
    });
  });

  describe('主题合并', () => {
    it('应该合并主题覆盖', () => {
      const merged = ThemeEngine.mergeThemes(lightTheme, { colors: { ...lightTheme.colors, primary: '#ff0000' } });
      expect(merged.colors.primary).toBe('#ff0000');
      expect(merged.colors.background).toBe('#ffffff');
    });

    it('应该保留基础主题名称', () => {
      const merged = ThemeEngine.mergeThemes(lightTheme, {});
      expect(merged.name).toBe('light');
    });

    it('应该允许覆盖名称', () => {
      const merged = ThemeEngine.mergeThemes(lightTheme, { name: 'custom' });
      expect(merged.name).toBe('custom');
    });
  });

  describe('CSS变量生成', () => {
    it('应该生成CSS变量', () => {
      const vars = ThemeEngine.generateCSSVars(lightTheme);
      expect(vars['--color-primary']).toBe('#1890ff');
      expect(vars['--font-body']).toBe('system-ui');
      expect(vars['--spacing-md']).toBe('16px');
    });
  });

  describe('暗色主题检测', () => {
    it('应该检测暗色主题', () => {
      expect(ThemeEngine.isDarkTheme(darkTheme)).toBe(true);
    });

    it('应该检测亮色主题', () => {
      expect(ThemeEngine.isDarkTheme(lightTheme)).toBe(false);
    });
  });

  describe('自动文字颜色', () => {
    it('亮背景应该返回黑色文字', () => {
      expect(ThemeEngine.autoTextForBg('#ffffff')).toBe('#000000');
    });

    it('暗背景应该返回白色文字', () => {
      expect(ThemeEngine.autoTextForBg('#000000')).toBe('#ffffff');
    });
  });
});
