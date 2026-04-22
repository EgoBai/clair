/**
 * 图表主题系统扩展测试
 */
import { describe, it, expect, vi } from 'vitest';
import {
  chartThemeManager,
  LIGHT_THEME,
  DARK_THEME,
  getMAColor,
  getKLineChartTheme,
} from '../utils/chartTheme';

describe('图表主题系统扩展', () => {
  describe('主题管理器', () => {
    it('初始应返回 light 主题', () => {
      chartThemeManager.set(LIGHT_THEME);
      expect(chartThemeManager.get().name).toBe('light');
    });

    it('应能切换到暗色主题', () => {
      chartThemeManager.set(DARK_THEME);
      expect(chartThemeManager.get().name).toBe('dark');
      chartThemeManager.set(LIGHT_THEME);
    });

    it('主题切换应通知订阅者', () => {
      const listener = vi.fn();
      const unsub = chartThemeManager.subscribe(listener);
      chartThemeManager.set(DARK_THEME);
      expect(listener).toHaveBeenCalled();
      unsub();
      chartThemeManager.set(LIGHT_THEME);
    });

    it('取消订阅后不应再通知', () => {
      const listener = vi.fn();
      const unsub = chartThemeManager.subscribe(listener);
      unsub();
      listener.mockClear();
      chartThemeManager.set(DARK_THEME);
      expect(listener).not.toHaveBeenCalled();
      chartThemeManager.set(LIGHT_THEME);
    });

    it('subscribe 返回取消订阅函数', () => {
      const unsub = chartThemeManager.subscribe(() => { );
      expect(typeof unsub).toBe('function');
      unsub();
    });
  });

  describe('LIGHT_THEME', () => {
    it('应为 A 股红涨绿跌', () => {
      expect(LIGHT_THEME.rise).toBe('#EF4444');
      expect(LIGHT_THEME.fall).toBe('#22C55E');
    });

    it('应包含 name 字段', () => {
      expect(LIGHT_THEME.name).toBe('light');
    });

    it('应包含完整配色方案', () => {
      expect(LIGHT_THEME.bg).toBeDefined();
      expect(LIGHT_THEME.text).toBeDefined();
      expect(LIGHT_THEME.textSecondary).toBeDefined();
      expect(LIGHT_THEME.grid).toBeDefined();
      expect(LIGHT_THEME.axis).toBeDefined();
    });

    it('应包含 8 色系列配色', () => {
      expect(LIGHT_THEME.series).toHaveLength(8);
    });

    it('应包含 primary 和 volume 颜色', () => {
      expect(LIGHT_THEME.primary).toBeDefined();
      expect(LIGHT_THEME.volume).toBeDefined();
    });
  });

  describe('DARK_THEME', () => {
    it('应为暗色命名', () => {
      expect(DARK_THEME.name).toBe('dark');
    });

    it('涨跌颜色应与浅色一致（A股标准）', () => {
      expect(DARK_THEME.rise).toBe(LIGHT_THEME.rise);
      expect(DARK_THEME.fall).toBe(LIGHT_THEME.fall);
    });

    it('背景色应不同于浅色', () => {
      expect(DARK_THEME.bg).not.toBe(LIGHT_THEME.bg);
    });
  });

  describe('getMAColor', () => {
    it('应返回有效的颜色字符串', () => {
      expect(getMAColor(0)).toMatch(/^#[0-9A-Fa-f]{6}$/);
      expect(getMAColor(1)).toMatch(/^#[0-9A-Fa-f]{6}$/);
    });

    it('循环取色不报错', () => {
      expect(getMAColor(10)).toMatch(/^#[0-9A-Fa-f]{6}$/);
    });
  });

  describe('getKLineChartTheme', () => {
    it('涨应返回红涨配色', () => {
      chartThemeManager.set(LIGHT_THEME);
      const theme = getKLineChartTheme(true);
      expect(theme.color).toBe(LIGHT_THEME.rise);
    });

    it('跌应返回绿跌配色', () => {
      chartThemeManager.set(LIGHT_THEME);
      const theme = getKLineChartTheme(false);
      expect(theme.color).toBe(LIGHT_THEME.fall);
    });

    it('应包含 itemStyle', () => {
      const theme = getKLineChartTheme(true);
      expect(theme.itemStyle).toBeDefined();
      expect(theme.itemStyle.color).toBeDefined();
      expect(theme.itemStyle.borderColor).toBeDefined();
      expect(theme.itemStyle.color0).toBeDefined();
      expect(theme.itemStyle.borderColor0).toBeDefined();
    });
  });
});
