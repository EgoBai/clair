import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  LIGHT_COLORS,
  DARK_COLORS,
  LIGHT_THEME,
  DARK_THEME,
  chartThemeManager,
  getMAColor,
  getKLineChartTheme,
} from '../utils/chartTheme';

/**
 * 图表主题引擎测试
 * (Rewritten to import the real module: color palettes, theme manager, MA colors, K-line theme.)
 */

describe('Chart Theme Engine', () => {
  beforeEach(() => {
    // 重置为默认 light 主题，避免测试间相互影响
    chartThemeManager.set(LIGHT_THEME);
  });

  describe('主题定义', () => {
    it('应该有 light 与 dark 配色', () => {
      expect(LIGHT_COLORS).toBeDefined();
      expect(DARK_COLORS).toBeDefined();
    });

    it('所有配色应有完整的颜色定义', () => {
      for (const c of [LIGHT_COLORS, DARK_COLORS]) {
        expect(c.bg).toBeTruthy();
        expect(c.text).toBeTruthy();
        expect(c.rise).toBeTruthy();
        expect(c.fall).toBeTruthy();
        expect(c.series.length).toBeGreaterThan(0);
      }
    });

    it('应该有 light 与 dark 的 ChartTheme 对象', () => {
      expect(LIGHT_THEME.name).toBe('light');
      expect(DARK_THEME.name).toBe('dark');
      expect(LIGHT_THEME.bg).toBe('#ffffff');
    });
  });

  describe('中国股市配色', () => {
    it('上涨应该是红色', () => {
      expect(LIGHT_COLORS.rise).toBe('#EF4444');
    });

    it('下跌应该是绿色', () => {
      expect(LIGHT_COLORS.fall).toBe('#22C55E');
    });
  });

  describe('chartThemeManager', () => {
    it('默认返回 light 主题', () => {
      expect(chartThemeManager.get().name).toBe('light');
    });

    it('set 切换主题并通知订阅者', () => {
      const listener = vi.fn();
      const unsub = chartThemeManager.subscribe(listener);
      chartThemeManager.set(DARK_THEME);
      expect(chartThemeManager.get().name).toBe('dark');
      expect(listener).toHaveBeenCalled();
      unsub();
    });
  });

  describe('getMAColor', () => {
    it('按索引返回均线颜色并循环', () => {
      expect(getMAColor(0)).toBe('#3B82F6');
      expect(getMAColor(1)).toBe('#F59E0B');
      expect(getMAColor(2)).toBe('#EF4444');
      expect(getMAColor(3)).toBe('#8B5CF6');
      expect(getMAColor(4)).toBe('#3B82F6'); // 循环
    });
  });

  describe('getKLineChartTheme', () => {
    it('上涨使用红色 (light)', () => {
      expect(getKLineChartTheme(true).color).toBe('#EF4444');
    });

    it('下跌使用绿色 (light)', () => {
      expect(getKLineChartTheme(false).color).toBe('#22C55E');
    });

    it('遵循 manager 当前主题', () => {
      chartThemeManager.set(DARK_THEME);
      expect(getKLineChartTheme(true).color).toBe(DARK_THEME.rise);
      expect(getKLineChartTheme(false).color).toBe(DARK_THEME.fall);
    });
  });
});
