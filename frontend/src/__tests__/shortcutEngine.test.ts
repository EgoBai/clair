import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PRESET_SHORTCUTS } from '../utils/shortcutEngine';

describe('shortcutEngine', () => {
  describe('PRESET_SHORTCUTS', () => {
    it('应包含导航快捷键', () => {
      expect(PRESET_SHORTCUTS.GO_HOME).toBeDefined();
      expect(PRESET_SHORTCUTS.GO_HOME.keys).toBe('alt+1');
      expect(PRESET_SHORTCUTS.GO_STOCKS.keys).toBe('alt+2');
      expect(PRESET_SHORTCUTS.GO_MARKET.keys).toBe('alt+3');
      expect(PRESET_SHORTCUTS.GO_WATCHLIST.keys).toBe('alt+4');
      expect(PRESET_SHORTCUTS.GO_BACKTEST.keys).toBe('alt+5');
      expect(PRESET_SHORTCUTS.GO_AI.keys).toBe('alt+6');
    });

    it('应包含搜索快捷键', () => {
      expect(PRESET_SHORTCUTS.SEARCH.keys).toBe('ctrl+k');
      expect(PRESET_SHORTCUTS.SEARCH_ALT.keys).toBe('/');
    });

    it('应包含操作快捷键', () => {
      expect(PRESET_SHORTCUTS.ESCAPE.keys).toBe('escape');
      expect(PRESET_SHORTCUTS.GO_BACK.keys).toBe('backspace');
      expect(PRESET_SHORTCUTS.TOGGLE_THEME.keys).toBe('alt+t');
      expect(PRESET_SHORTCUTS.TOGGLE_SIDEBAR.keys).toBe('alt+s');
    });

    it('应包含序列键快捷键', () => {
      expect(PRESET_SHORTCUTS.GOTO_HOME.keys).toBe('g h');
      expect(PRESET_SHORTCUTS.GOTO_STOCKS.keys).toBe('g s');
      expect(PRESET_SHORTCUTS.GOTO_MARKET.keys).toBe('g m');
      expect(PRESET_SHORTCUTS.GOTO_WATCHLIST.keys).toBe('g w');
      expect(PRESET_SHORTCUTS.GOTO_SETTINGS.keys).toBe('g p');
    });

    it('应包含列表导航快捷键', () => {
      expect(PRESET_SHORTCUTS.LIST_UP.keys).toBe('k');
      expect(PRESET_SHORTCUTS.LIST_DOWN.keys).toBe('j');
      expect(PRESET_SHORTCUTS.LIST_SELECT.keys).toBe('enter');
      expect(PRESET_SHORTCUTS.LIST_FIRST.keys).toBe('home');
      expect(PRESET_SHORTCUTS.LIST_LAST.keys).toBe('end');
    });

    it('应包含分页快捷键', () => {
      expect(PRESET_SHORTCUTS.PAGE_UP.keys).toBe('pageup');
      expect(PRESET_SHORTCUTS.PAGE_DOWN.keys).toBe('pagedown');
    });

    it('每个快捷键都有description', () => {
      for (const [key, value] of Object.entries(PRESET_SHORTCUTS)) {
        expect(value.description).toBeTruthy();
        expect(typeof value.description).toBe('string');
      }
    });

    it('每个快捷键都有keys', () => {
      for (const [key, value] of Object.entries(PRESET_SHORTCUTS)) {
        expect(value.keys).toBeTruthy();
        expect(typeof value.keys).toBe('string');
      }
    });

    it('所有快捷键都有唯一标识', () => {
      const keys = Object.keys(PRESET_SHORTCUTS);
      const uniqueKeys = new Set(keys);
      expect(uniqueKeys.size).toBe(keys.length);
    });

    it('快捷键数量应大于20', () => {
      expect(Object.keys(PRESET_SHORTCUTS).length).toBeGreaterThanOrEqual(20);
    });
  });
});
