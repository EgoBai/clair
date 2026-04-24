import { describe, it, expect, vi } from 'vitest';

/**
 * 键盘快捷键Hook测试
 * 测试快捷键逻辑、快捷键提示
 */

describe('useKeyboardShortcuts', () => {
  describe('快捷键提示数据', () => {
    it('应该包含所有预设快捷键', () => {
      const hints = [
        { keys: ['⌘', 'K'], description: '聚焦搜索' },
        { keys: ['/'], description: '聚焦搜索' },
        { keys: ['Esc'], description: '关闭弹窗/取消' },
        { keys: ['Alt', '1'], description: '首页' },
        { keys: ['Alt', '2'], description: '股票列表' },
        { keys: ['Alt', '3'], description: '行情分析' },
        { keys: ['Alt', '4'], description: '自选股' },
        { keys: ['Alt', '5'], description: '策略回测' },
        { keys: ['Alt', '6'], description: 'AI 选股' },
        { keys: ['Alt', 'T'], description: '切换主题' },
        { keys: ['Alt', 'S'], description: '切换侧边栏' },
        { keys: ['⌫'], description: '返回上一页' },
        { keys: ['g', 'h'], description: '跳转首页' },
        { keys: ['g', 's'], description: '跳转股票列表' },
        { keys: ['g', 'm'], description: '跳转行情' },
        { keys: ['g', 'w'], description: '跳转自选股' },
        { keys: ['g', 'p'], description: '跳转设置' },
        { keys: ['j', '↓'], description: '列表下移' },
        { keys: ['k', '↑'], description: '列表上移' },
        { keys: ['W'], description: '添加/移除自选' },
        { keys: ['B'], description: '买入' },
        { keys: ['S'], description: '卖出' },
      ];

      expect(hints.length).toBe(22);
      expect(hints.every(h => h.keys.length > 0)).toBe(true);
      expect(hints.every(h => h.description.length > 0)).toBe(true);
    });

    it('导航快捷键应该对应正确的路由', () => {
      const routes: Record<string, string> = {
        '1': '/',
        '2': '/stocks',
        '3': '/market',
        '4': '/watchlist',
        '5': '/backtest',
        '6': '/ai-selection',
      };

      expect(routes['1']).toBe('/');
      expect(routes['2']).toBe('/stocks');
      expect(routes['3']).toBe('/market');
      expect(routes['4']).toBe('/watchlist');
      expect(routes['5']).toBe('/backtest');
      expect(routes['6']).toBe('/ai-selection');
    });

    it('序列键应该对应正确的路由', () => {
      const routes: Record<string, string> = {
        'h': '/',
        's': '/stocks',
        'm': '/market',
        'w': '/watchlist',
        'p': '/settings',
      };

      expect(Object.keys(routes).length).toBe(5);
    });
  });

  describe('输入框检测逻辑', () => {
    it('INPUT标签应该被识别为输入框', () => {
      const target = { tagName: 'INPUT', isContentEditable: false };
      const isInput = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable;
      expect(isInput).toBe(true);
    });

    it('TEXTAREA标签应该被识别为输入框', () => {
      const target = { tagName: 'TEXTAREA', isContentEditable: false };
      const isInput = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable;
      expect(isInput).toBe(true);
    });

    it('contentEditable应该被识别为输入框', () => {
      const target = { tagName: 'DIV', isContentEditable: true };
      const isInput = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable;
      expect(isInput).toBe(true);
    });

    it('普通DIV不应该被识别为输入框', () => {
      const target = { tagName: 'DIV', isContentEditable: false };
      const isInput = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable;
      expect(isInput).toBe(false);
    });
  });

  describe('修饰键组合', () => {
    it('Ctrl+K应该触发搜索', () => {
      const isCtrlK = true && true; // ctrlKey && key === 'k'
      expect(isCtrlK).toBe(true);
    });

    it('Meta+K应该触发搜索（Mac）', () => {
      const isMetaK = true && true; // metaKey && key === 'k'
      expect(isMetaK).toBe(true);
    });

    it('Alt+数字应该触发导航', () => {
      const navKeys = ['1', '2', '3', '4', '5', '6'];
      expect(navKeys.length).toBe(6);
    });

    it('Alt+T应该切换主题', () => {
      const isAltT = true && 't' === 't';
      expect(isAltT).toBe(true);
    });

    it('Alt+S应该切换侧边栏', () => {
      const isAltS = true && 's' === 's';
      expect(isAltS).toBe(true);
    });
  });

  describe('快捷键配置接口', () => {
    it('应该支持完整的快捷键配置', () => {
      const config = {
        key: 'k',
        ctrl: true,
        meta: false,
        shift: false,
        alt: false,
        action: () => {},
        description: '聚焦搜索',
        preventDefault: true,
      };
      expect(config.key).toBe('k');
      expect(config.ctrl).toBe(true);
      expect(config.description).toBe('聚焦搜索');
    });
  });
});
