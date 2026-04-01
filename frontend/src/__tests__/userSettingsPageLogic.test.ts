/**
 * 用户设置页面逻辑测试
 * 覆盖偏好配置、主题切换、通知设置
 */

import { describe, it, expect } from 'vitest';

describe('用户设置页面逻辑', () => {
  describe('主题配置', () => {
    type Theme = 'light' | 'dark' | 'auto';

    function getEffectiveTheme(theme: Theme, systemPrefersDark: boolean): 'light' | 'dark' {
      if (theme === 'auto') return systemPrefersDark ? 'dark' : 'light';
      return theme;
    }

    it('light主题应返回light', () => {
      expect(getEffectiveTheme('light', true)).toBe('light');
      expect(getEffectiveTheme('light', false)).toBe('light');
    });

    it('dark主题应返回dark', () => {
      expect(getEffectiveTheme('dark', false)).toBe('dark');
    });

    it('auto主题跟随系统', () => {
      expect(getEffectiveTheme('auto', true)).toBe('dark');
      expect(getEffectiveTheme('auto', false)).toBe('light');
    });
  });

  describe('语言配置', () => {
    const supportedLocales = ['zh-CN', 'en-US', 'zh-TW', 'ja-JP'];

    function isValidLocale(locale: string): boolean {
      return supportedLocales.includes(locale);
    }

    function getDefaultLocale(): string {
      return 'zh-CN';
    }

    it('应支持指定语言', () => {
      expect(isValidLocale('zh-CN')).toBe(true);
      expect(isValidLocale('en-US')).toBe(true);
    });

    it('不支持的语言应拒绝', () => {
      expect(isValidLocale('fr-FR')).toBe(false);
    });

    it('默认语言应为中文', () => {
      expect(getDefaultLocale()).toBe('zh-CN');
    });
  });

  describe('通知偏好设置', () => {
    interface NotificationPrefs {
      priceAlert: boolean;
      newsAlert: boolean;
      earningsAlert: boolean;
      volumeAlert: boolean;
      quietHoursStart?: string;
      quietHoursEnd?: string;
    }

    function isInQuietHours(prefs: NotificationPrefs, now: Date): boolean {
      if (!prefs.quietHoursStart || !prefs.quietHoursEnd) return false;
      const currentMinutes = now.getHours() * 60 + now.getMinutes();
      const [startH, startM] = prefs.quietHoursStart.split(':').map(Number);
      const [endH, endM] = prefs.quietHoursEnd.split(':').map(Number);
      const start = startH * 60 + startM;
      const end = endH * 60 + endM;
      if (start <= end) return currentMinutes >= start && currentMinutes < end;
      return currentMinutes >= start || currentMinutes < end; // 跨午夜
    }

    it('免打扰时段内应返回true', () => {
      const prefs: NotificationPrefs = {
        priceAlert: true, newsAlert: true, earningsAlert: true, volumeAlert: true,
        quietHoursStart: '23:00', quietHoursEnd: '07:00',
      };
      const midnight = new Date(2024, 0, 1, 0, 0);
      expect(isInQuietHours(prefs, midnight)).toBe(true);
    });

    it('免打扰时段外应返回false', () => {
      const prefs: NotificationPrefs = {
        priceAlert: true, newsAlert: true, earningsAlert: true, volumeAlert: true,
        quietHoursStart: '23:00', quietHoursEnd: '07:00',
      };
      const noon = new Date(2024, 0, 1, 12, 0);
      expect(isInQuietHours(prefs, noon)).toBe(false);
    });

    it('未设置免打扰应返回false', () => {
      const prefs: NotificationPrefs = { priceAlert: true, newsAlert: true, earningsAlert: true, volumeAlert: true };
      expect(isInQuietHours(prefs, new Date())).toBe(false);
    });
  });

  describe('默认页配置', () => {
    const validPages = ['dashboard', 'watchlist', 'screener', 'market', 'portfolio'];

    function isValidDefaultPage(page: string): boolean {
      return validPages.includes(page);
    }

    function sanitizeDefaultPage(page: string): string {
      return isValidDefaultPage(page) ? page : 'dashboard';
    }

    it('有效页面应通过', () => {
      for (const p of validPages) {
        expect(isValidDefaultPage(p)).toBe(true);
      }
    });

    it('无效页面应降级到dashboard', () => {
      expect(sanitizeDefaultPage('invalid')).toBe('dashboard');
    });
  });

  describe('自选股分组', () => {
    interface WatchlistGroup {
      id: string;
      name: string;
      symbols: string[];
    }

    function addSymbolToGroup(groups: WatchlistGroup[], groupId: string, symbol: string): WatchlistGroup[] {
      return groups.map(g => {
        if (g.id === groupId && !g.symbols.includes(symbol)) {
          return { ...g, symbols: [...g.symbols, symbol] };
        }
        return g;
      });
    }

    function removeSymbolFromGroup(groups: WatchlistGroup[], groupId: string, symbol: string): WatchlistGroup[] {
      return groups.map(g => {
        if (g.id === groupId) {
          return { ...g, symbols: g.symbols.filter(s => s !== symbol) };
        }
        return g;
      });
    }

    it('应能添加股票到分组', () => {
      const groups: WatchlistGroup[] = [
        { id: 'g1', name: '默认', symbols: ['600519'] },
      ];
      const result = addSymbolToGroup(groups, 'g1', '000858');
      expect(result[0].symbols).toContain('000858');
      expect(result[0].symbols).toHaveLength(2);
    });

    it('重复添加应忽略', () => {
      const groups: WatchlistGroup[] = [
        { id: 'g1', name: '默认', symbols: ['600519'] },
      ];
      const result = addSymbolToGroup(groups, 'g1', '600519');
      expect(result[0].symbols).toHaveLength(1);
    });

    it('应能移除股票', () => {
      const groups: WatchlistGroup[] = [
        { id: 'g1', name: '默认', symbols: ['600519', '000858'] },
      ];
      const result = removeSymbolFromGroup(groups, 'g1', '600519');
      expect(result[0].symbols).not.toContain('600519');
      expect(result[0].symbols).toHaveLength(1);
    });
  });
});
