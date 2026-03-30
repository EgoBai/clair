import { describe, it, expect } from 'vitest';
import {
  PRESET_THEMES,
  getThemeById,
  mergeTheme,
  themeToCssVars,
  validateTheme,
} from '../utils/customThemes';
import type { AppTheme } from '../utils/customThemes';

describe('自定义主题系统', () => {
  describe('PRESET_THEMES', () => {
    it('应包含多个预设主题', () => {
      expect(PRESET_THEMES.length).toBeGreaterThanOrEqual(4);
    });

    it('每个主题应有唯一ID', () => {
      const ids = PRESET_THEMES.map(t => t.id);
      expect(new Set(ids).size).toBe(ids.length);
    });

    it('每个主题应有名称和描述', () => {
      PRESET_THEMES.forEach(t => {
        expect(t.name).toBeTruthy();
        expect(t.description).toBeTruthy();
      });
    });

    it('亮色和暗色主题都应存在', () => {
      const hasLight = PRESET_THEMES.some(t => !t.isDark);
      const hasDark = PRESET_THEMES.some(t => t.isDark);
      expect(hasLight).toBe(true);
      expect(hasDark).toBe(true);
    });

    it('每个主题应包含完整的颜色配置', () => {
      PRESET_THEMES.forEach(t => {
        expect(t.colors.primary).toBeTruthy();
        expect(t.colors.success).toBeTruthy();
        expect(t.colors.error).toBeTruthy();
        expect(t.colors.up).toBeTruthy();
        expect(t.colors.down).toBeTruthy();
      });
    });

    it('每个主题应包含图表颜色配置', () => {
      PRESET_THEMES.forEach(t => {
        expect(t.chart.backgroundColor).toBeTruthy();
        expect(t.chart.ma5).toBeTruthy();
        expect(t.chart.ma10).toBeTruthy();
        expect(t.chart.ma20).toBeTruthy();
      });
    });

    it('涨跌颜色应不同', () => {
      PRESET_THEMES.forEach(t => {
        expect(t.colors.up).not.toBe(t.colors.down);
      });
    });

    it('borderRadius应为正数', () => {
      PRESET_THEMES.forEach(t => {
        expect(t.borderRadius).toBeGreaterThanOrEqual(0);
      });
    });
  });

  describe('getThemeById', () => {
    it('应返回对应主题', () => {
      const theme = getThemeById('dark');
      expect(theme.id).toBe('dark');
      expect(theme.isDark).toBe(true);
    });

    it('不存在的ID应返回默认主题', () => {
      const theme = getThemeById('nonexistent');
      expect(theme.id).toBe('light');
    });
  });

  describe('mergeTheme', () => {
    it('应合并颜色覆盖', () => {
      const base = getThemeById('light');
      const merged = mergeTheme(base, { colors: { primary: '#ff0000' } });
      expect(merged.colors.primary).toBe('#ff0000');
      expect(merged.colors.success).toBe(base.colors.success);
    });

    it('应合并图表颜色覆盖', () => {
      const base = getThemeById('light');
      const merged = mergeTheme(base, { chart: { ma5: '#00ff00' } });
      expect(merged.chart.ma5).toBe('#00ff00');
      expect(merged.chart.ma10).toBe(base.chart.ma10);
    });

    it('应合并基础属性', () => {
      const base = getThemeById('light');
      const merged = mergeTheme(base, { name: '自定义', borderRadius: 12 });
      expect(merged.name).toBe('自定义');
      expect(merged.borderRadius).toBe(12);
    });

    it('未覆盖的属性应保持原值', () => {
      const base = getThemeById('dark');
      const merged = mergeTheme(base, {});
      expect(merged.id).toBe(base.id);
      expect(merged.isDark).toBe(base.isDark);
    });
  });

  describe('themeToCssVars', () => {
    it('应生成CSS变量', () => {
      const theme = getThemeById('light');
      const css = themeToCssVars(theme);
      expect(css).toContain(':root');
      expect(css).toContain('--color-primary');
      expect(css).toContain('--chart-backgroundColor');
    });

    it('应包含字体大小变量', () => {
      const theme = getThemeById('light');
      const css = themeToCssVars(theme);
      expect(css).toContain('--font-xs');
      expect(css).toContain('--font-lg');
    });

    it('应包含间距变量', () => {
      const theme = getThemeById('light');
      const css = themeToCssVars(theme);
      expect(css).toContain('--space-xs');
      expect(css).toContain('--space-xl');
    });

    it('应包含borderRadius', () => {
      const theme = getThemeById('light');
      const css = themeToCssVars(theme);
      expect(css).toContain('--border-radius');
    });

    it('应为有效的CSS语法', () => {
      const theme = getThemeById('light');
      const css = themeToCssVars(theme);
      expect(css).toMatch(/^:root\s*{/);
      expect(css).toMatch(/}$/);
    });
  });

  describe('validateTheme', () => {
    it('完整主题应通过验证', () => {
      const theme = PRESET_THEMES[0];
      const result = validateTheme(theme);
      expect(result.valid).toBe(true);
      expect(result.errors.length).toBe(0);
    });

    it('缺少ID应报错', () => {
      const result = validateTheme({ name: 'test' });
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('主题ID不能为空');
    });

    it('缺少名称应报错', () => {
      const result = validateTheme({ id: 'test' });
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('主题名称不能为空');
    });

    it('缺少主色调应报错', () => {
      const result = validateTheme({ id: 'test', name: 'test' });
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('必须指定主色调');
    });

    it('无效颜色格式应报错', () => {
      const result = validateTheme({
        id: 'test', name: 'test',
        colors: { primary: 'invalid' } as any,
      });
      expect(result.valid).toBe(false);
    });

    it('有效hex颜色应通过', () => {
      const result = validateTheme({
        id: 'test', name: 'test',
        colors: { primary: '#1890ff' } as any,
      });
      expect(result.valid).toBe(true);
    });

    it('带透明度的hex颜色应通过', () => {
      const result = validateTheme({
        id: 'test', name: 'test',
        colors: { primary: '#1890ff80' } as any,
      });
      expect(result.valid).toBe(true);
    });
  });

  describe('主题完整性', () => {
    it('每个主题应有fontSize配置', () => {
      PRESET_THEMES.forEach(t => {
        expect(t.fontSize.xs).toBeTruthy();
        expect(t.fontSize.sm).toBeTruthy();
        expect(t.fontSize.md).toBeTruthy();
        expect(t.fontSize.lg).toBeTruthy();
        expect(t.fontSize.xl).toBeTruthy();
      });
    });

    it('每个主题应有spacing配置', () => {
      PRESET_THEMES.forEach(t => {
        expect(t.spacing.xs).toBeTruthy();
        expect(t.spacing.sm).toBeTruthy();
        expect(t.spacing.md).toBeTruthy();
        expect(t.spacing.lg).toBeTruthy();
        expect(t.spacing.xl).toBeTruthy();
      });
    });

    it('暗色主题背景应比亮色暗', () => {
      const light = PRESET_THEMES.find(t => t.id === 'light')!;
      const dark = PRESET_THEMES.find(t => t.id === 'dark')!;
      // 简单检测: 暗色主题背景色hex值应较小
      const lightBg = parseInt(light.colors.background.replace('#', ''), 16);
      const darkBg = parseInt(dark.colors.background.replace('#', ''), 16);
      expect(darkBg).toBeLessThan(lightBg);
    });
  });
});
