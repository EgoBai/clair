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
  getEChartsThemeOption,
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
      expect(listener).toHaveBeenCalledWith(DARK_THEME);
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
      const unsub = chartThemeManager.subscribe(() => {});
      expect(typeof unsub).toBe('function');
      unsub();
    });
  });

  describe('LIGHT_THEME', () => {
    it('应为 A 股红涨绿跌', () => {
      expect(LIGHT_THEME.colors.rise).toBe('#EF4444');
      expect(LIGHT_THEME.colors.fall).toBe('#22C55E');
    });

    it('应包含完整的 K 线配色', () => {
      expect(LIGHT_THEME.candlestick.upColor).toBeDefined();
      expect(LIGHT_THEME.candlestick.downColor).toBeDefined();
    });

    it('应包含至少 4 色 MA 均线', () => {
      expect(LIGHT_THEME.indicators.ma.length).toBeGreaterThanOrEqual(4);
    });

    it('应包含 MACD 四色配色', () => {
      const { macd } = LIGHT_THEME.indicators;
      expect(macd.dif).toBeDefined();
      expect(macd.dea).toBeDefined();
      expect(macd.upBar).toBeDefined();
      expect(macd.downBar).toBeDefined();
    });

    it('应包含 KDJ 三色配色', () => {
      const { kdj } = LIGHT_THEME.indicators;
      expect(kdj.k).toBeDefined();
      expect(kdj.d).toBeDefined();
      expect(kdj.j).toBeDefined();
    });

    it('应包含 RSI 三线颜色', () => {
      expect(LIGHT_THEME.indicators.rsi.length).toBeGreaterThanOrEqual(3);
    });

    it('应包含 BOLL 四色配色', () => {
      const { boll } = LIGHT_THEME.indicators;
      expect(boll.upper).toBeDefined();
      expect(boll.mid).toBeDefined();
      expect(boll.lower).toBeDefined();
      expect(boll.fill).toBeDefined();
    });
  });

  describe('DARK_THEME', () => {
    it('应为暗色命名', () => {
      expect(DARK_THEME.name).toBe('dark');
    });

    it('涨跌颜色应与浅色一致（A股标准）', () => {
      expect(DARK_THEME.colors.rise).toBe(LIGHT_THEME.colors.rise);
      expect(DARK_THEME.colors.fall).toBe(LIGHT_THEME.colors.fall);
    });

    it('背景色应不同于浅色', () => {
      expect(DARK_THEME.colors.bg).not.toBe(LIGHT_THEME.colors.bg);
    });
  });

  describe('getMAColor', () => {
    it('应返回正确的均线颜色', () => {
      const colors = LIGHT_THEME.indicators.ma;
      expect(getMAColor(0)).toBe(colors[0]);
      expect(getMAColor(1)).toBe(colors[1]);
    });

    it('应循环取色', () => {
      const colors = LIGHT_THEME.indicators.ma;
      const len = colors.length;
      expect(getMAColor(len)).toBe(colors[0]);
    });
  });

  describe('getKLineChartTheme', () => {
    it('涨应返回红涨配色', () => {
      chartThemeManager.set(LIGHT_THEME);
      const theme = getKLineChartTheme(true);
      expect(theme.color).toBe(LIGHT_THEME.candlestick.upColor);
    });

    it('跌应返回绿跌配色', () => {
      chartThemeManager.set(LIGHT_THEME);
      const theme = getKLineChartTheme(false);
      expect(theme.color).toBe(LIGHT_THEME.candlestick.downColor);
    });

    it('应包含 itemStyle', () => {
      const theme = getKLineChartTheme(true);
      expect(theme.itemStyle).toBeDefined();
      expect(theme.itemStyle.borderWidth).toBe(1);
    });
  });

  describe('getEChartsThemeOption', () => {
    it('应返回 ECharts 配置', () => {
      chartThemeManager.set(LIGHT_THEME);
      const config = getEChartsThemeOption();
      expect(config).toBeDefined();
      expect(config.backgroundColor).toBe('transparent');
      expect(config.textStyle).toBeDefined();
    });

    it('暗色主题配置应不同', () => {
      chartThemeManager.set(LIGHT_THEME);
      const light = getEChartsThemeOption();
      chartThemeManager.set(DARK_THEME);
      const dark = getEChartsThemeOption();
      expect(light.textStyle.color).not.toBe(dark.textStyle.color);
      chartThemeManager.set(LIGHT_THEME);
    });
  });
});
