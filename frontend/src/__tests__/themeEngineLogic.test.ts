import { describe, it, expect } from 'vitest';

// 主题引擎逻辑测试
describe('主题引擎逻辑', () => {
  // 颜色操作
  describe('颜色操作', () => {
    function hexToRGB(hex: string): { r: number; g: number; b: number } {
      const clean = hex.replace('#', '');
      return {
        r: parseInt(clean.substring(0, 2), 16),
        g: parseInt(clean.substring(2, 4), 16),
        b: parseInt(clean.substring(4, 6), 16),
      };
    }

    function rgbToHex(r: number, g: number, b: number): string {
      return '#' + [r, g, b].map(v => Math.max(0, Math.min(255, v)).toString(16).padStart(2, '0')).join('');
    }

    function adjustBrightness(hex: string, percent: number): string {
      const { r, g, b } = hexToRGB(hex);
      const adjust = (v: number) => Math.round(v + (255 - v) * percent / 100);
      return rgbToHex(adjust(r), adjust(g), adjust(b));
    }

    function blendColors(hex1: string, hex2: string, ratio: number): string {
      const c1 = hexToRGB(hex1);
      const c2 = hexToRGB(hex2);
      return rgbToHex(
        Math.round(c1.r + (c2.r - c1.r) * ratio),
        Math.round(c1.g + (c2.g - c1.g) * ratio),
        Math.round(c1.b + (c2.b - c1.b) * ratio),
      );
    }

    it('应该正确转换HEX到RGB', () => {
      const rgb = hexToRGB('#ff0000');
      expect(rgb.r).toBe(255);
      expect(rgb.g).toBe(0);
      expect(rgb.b).toBe(0);
    });

    it('应该正确转换RGB到HEX', () => {
      expect(rgbToHex(255, 0, 0)).toBe('#ff0000');
      expect(rgbToHex(0, 255, 0)).toBe('#00ff00');
      expect(rgbToHex(0, 0, 255)).toBe('#0000ff');
    });

    it('应该正确调整亮度', () => {
      const lighter = adjustBrightness('#000000', 50);
      const { r, g, b } = hexToRGB(lighter);
      expect(r).toBeGreaterThan(0);
    });

    it('混合颜色应该在两个颜色之间', () => {
      const mixed = blendColors('#000000', '#ffffff', 0.5);
      const { r, g, b } = hexToRGB(mixed);
      expect(r).toBeCloseTo(128, 0);
    });

    it('ratio=0应该返回第一个颜色', () => {
      expect(blendColors('#ff0000', '#0000ff', 0)).toBe('#ff0000');
    });

    it('ratio=1应该返回第二个颜色', () => {
      expect(blendColors('#ff0000', '#0000ff', 1)).toBe('#0000ff');
    });

    it('超出范围的值应该钳制', () => {
      expect(rgbToHex(-10, 300, 128)).toBe('#00ff80');
    });
  });

  // CSS变量生成
  describe('CSS变量生成', () => {
    interface ThemeTokens {
      colors: Record<string, string>;
      spacing: Record<string, string>;
      borderRadius: Record<string, string>;
    }

    function generateCSSVariables(tokens: ThemeTokens): string {
      const lines: string[] = [':root {'];
      for (const [name, value] of Object.entries(tokens.colors)) {
        lines.push(`  --color-${name}: ${value};`);
      }
      for (const [name, value] of Object.entries(tokens.spacing)) {
        lines.push(`  --spacing-${name}: ${value};`);
      }
      for (const [name, value] of Object.entries(tokens.borderRadius)) {
        lines.push(`  --radius-${name}: ${value};`);
      }
      lines.push('}');
      return lines.join('\n');
    }

    function applyThemeToElement(element: Record<string, string>, tokens: ThemeTokens): Record<string, string> {
      const styled = { ...element };
      for (const [name, value] of Object.entries(tokens.colors)) {
        styled[`--color-${name}`] = value;
      }
      return styled;
    }

    it('应该生成正确的CSS变量', () => {
      const tokens: ThemeTokens = {
        colors: { primary: '#1890ff', danger: '#ff4d4f' },
        spacing: { sm: '8px', md: '16px' },
        borderRadius: { sm: '4px' },
      };
      const css = generateCSSVariables(tokens);
      expect(css).toContain('--color-primary: #1890ff');
      expect(css).toContain('--spacing-sm: 8px');
      expect(css).toContain('--radius-sm: 4px');
    });

    it('空tokens应该生成空root', () => {
      const css = generateCSSVariables({ colors: {}, spacing: {}, borderRadius: {} });
      expect(css).toContain(':root {');
      expect(css).toContain('}');
    });

    it('应该正确应用主题到元素', () => {
      const tokens: ThemeTokens = {
        colors: { primary: '#1890ff' },
        spacing: {},
        borderRadius: {},
      };
      const element = { className: 'btn' };
      const styled = applyThemeToElement(element, tokens);
      expect(styled['--color-primary']).toBe('#1890ff');
    });
  });

  // 响应式断点
  describe('响应式断点', () => {
    const breakpoints = {
      xs: 0,
      sm: 576,
      md: 768,
      lg: 992,
      xl: 1200,
      xxl: 1600,
    };

    function getBreakpoint(width: number): string {
      if (width >= breakpoints.xxl) return 'xxl';
      if (width >= breakpoints.xl) return 'xl';
      if (width >= breakpoints.lg) return 'lg';
      if (width >= breakpoints.md) return 'md';
      if (width >= breakpoints.sm) return 'sm';
      return 'xs';
    }

    function getColumnCount(width: number): number {
      const bp = getBreakpoint(width);
      switch (bp) {
        case 'xxl': case 'xl': return 4;
        case 'lg': return 3;
        case 'md': return 2;
        default: return 1;
      }
    }

    function getSidebarMode(width: number): 'expanded' | 'collapsed' | 'hidden' {
      if (width >= breakpoints.lg) return 'expanded';
      if (width >= breakpoints.md) return 'collapsed';
      return 'hidden';
    }

    it('应该正确识别断点', () => {
      expect(getBreakpoint(1920)).toBe('xxl');
      expect(getBreakpoint(1400)).toBe('xl');
      expect(getBreakpoint(1000)).toBe('lg');
      expect(getBreakpoint(800)).toBe('md');
      expect(getBreakpoint(600)).toBe('sm');
      expect(getBreakpoint(320)).toBe('xs');
    });

    it('边界值应该正确归属', () => {
      expect(getBreakpoint(1600)).toBe('xxl');
      expect(getBreakpoint(1599)).toBe('xl');
      expect(getBreakpoint(1200)).toBe('xl');
      expect(getBreakpoint(1199)).toBe('lg');
    });

    it('列数应该随断点变化', () => {
      expect(getColumnCount(1920)).toBe(4);
      expect(getColumnCount(1000)).toBe(3);
      expect(getColumnCount(800)).toBe(2);
      expect(getColumnCount(400)).toBe(1);
    });

    it('侧边栏模式应该正确', () => {
      expect(getSidebarMode(1200)).toBe('expanded');
      expect(getSidebarMode(800)).toBe('collapsed');
      expect(getSidebarMode(400)).toBe('hidden');
    });

    it('边界值侧边栏应该正确', () => {
      expect(getSidebarMode(992)).toBe('expanded');
      expect(getSidebarMode(991)).toBe('collapsed');
      expect(getSidebarMode(768)).toBe('collapsed');
      expect(getSidebarMode(767)).toBe('hidden');
    });
  });

  // A股颜色方案
  describe('A股颜色方案', () => {
    const aStockColors = {
      rise: '#ef4444',
      fall: '#22c55e',
      flat: '#9ca3af',
      limitUp: '#dc2626',
      limitDown: '#16a34a',
      volume: { up: 'rgba(239,68,68,0.7)', down: 'rgba(34,197,94,0.7)' },
    };

    function getStockColor(changePercent: number): string {
      if (changePercent > 0.099) return aStockColors.limitUp;
      if (changePercent < -0.099) return aStockColors.limitDown;
      if (changePercent > 0) return aStockColors.rise;
      if (changePercent < 0) return aStockColors.fall;
      return aStockColors.flat;
    }

    function getStockBgColor(changePercent: number): string {
      const color = getStockColor(changePercent);
      return color.replace(')', ',0.1)').replace('rgb', 'rgba').replace('#', '');
    }

    it('涨停应该返回limitUp颜色', () => {
      expect(getStockColor(0.1)).toBe(aStockColors.limitUp);
    });

    it('跌停应该返回limitDown颜色', () => {
      expect(getStockColor(-0.1)).toBe(aStockColors.limitDown);
    });

    it('上涨应该返回rise颜色', () => {
      expect(getStockColor(0.05)).toBe(aStockColors.rise);
    });

    it('下跌应该返回fall颜色', () => {
      expect(getStockColor(-0.05)).toBe(aStockColors.fall);
    });

    it('平盘应该返回flat颜色', () => {
      expect(getStockColor(0)).toBe(aStockColors.flat);
    });

    it('A股红色应该是涨', () => {
      expect(getStockColor(0.01)).toBe('#ef4444');
    });

    it('A股绿色应该是跌', () => {
      expect(getStockColor(-0.01)).toBe('#22c55e');
    });
  });
});
