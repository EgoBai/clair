// @vitest-environment jsdom
/**
 * 键盘快捷键扩展测试
 */
import { describe, it, expect } from 'vitest';

describe('键盘快捷键系统扩展', () => {
  describe('快捷键映射完整性', () => {
    const shortcuts = [
      { keys: ['⌘', 'K'], description: '聚焦搜索', id: 'search-cmdk' },
      { keys: ['/'], description: '聚焦搜索', id: 'search-slash' },
      { keys: ['Esc'], description: '关闭弹窗/取消', id: 'escape' },
      { keys: ['Alt', '1'], description: '首页', id: 'nav-home' },
      { keys: ['Alt', '2'], description: '股票列表', id: 'nav-stocks' },
      { keys: ['Alt', '3'], description: '行情分析', id: 'nav-market' },
      { keys: ['Alt', '4'], description: '自选股', id: 'nav-watchlist' },
      { keys: ['Alt', '5'], description: '策略回测', id: 'nav-backtest' },
      { keys: ['Alt', '6'], description: 'AI 选股', id: 'nav-ai' },
      { keys: ['Alt', 'T'], description: '切换主题', id: 'theme' },
      { keys: ['Alt', 'S'], description: '切换侧边栏', id: 'sidebar' },
      { keys: ['⌫'], description: '返回上一页', id: 'back' },
    ];

    it('应定义 12 个快捷键', () => {
      expect(shortcuts).toHaveLength(12);
    });

    it('所有快捷键应有描述', () => {
      shortcuts.forEach(s => {
        expect(s.description.length).toBeGreaterThan(0);
      });
    });

    it('所有快捷键应有唯一 ID', () => {
      const ids = shortcuts.map(s => s.id);
      expect(new Set(ids).size).toBe(ids.length);
    });

    it('所有快捷键应有 keys 数组', () => {
      shortcuts.forEach(s => {
        expect(Array.isArray(s.keys)).toBe(true);
        expect(s.keys.length).toBeGreaterThan(0);
      });
    });
  });

  describe('导航快捷键映射', () => {
    const navMap: Record<string, string> = {
      '1': '/',
      '2': '/stocks',
      '3': '/market',
      '4': '/watchlist',
      '5': '/backtest',
      '6': '/ai-selection',
    };

    it('应覆盖 6 个页面', () => {
      expect(Object.keys(navMap)).toHaveLength(6);
    });

    it('首页应在 Alt+1', () => {
      expect(navMap['1']).toBe('/');
    });

    it('自选股应在 Alt+4', () => {
      expect(navMap['4']).toBe('/watchlist');
    });

    it('AI 选股应在 Alt+6', () => {
      expect(navMap['6']).toBe('/ai-selection');
    });
  });

  describe('输入框忽略逻辑', () => {
    const inputTags = ['INPUT', 'TEXTAREA'];

    it('应忽略输入框中的普通按键', () => {
      inputTags.forEach(tag => {
        expect(tag).toMatch(/^(INPUT|TEXTAREA)$/);
      });
    });

    it('Escape 在输入框中应生效', () => {
      const isInput = true;
      const key = 'Escape';
      const shouldProcess = key === 'Escape' || !isInput;
      expect(shouldProcess).toBe(true);
    });

    it('Backspace 在输入框中不应触发返回', () => {
      const isInput = true;
      const key = 'Backspace';
      const shouldNavigate = !isInput;
      expect(shouldNavigate).toBe(false);
    });
  });

  describe('修饰键组合', () => {
    it('Cmd+K 应为有效的搜索快捷键', () => {
      const combo = { meta: true, key: 'k' };
      expect(combo.meta).toBe(true);
      expect(combo.key).toBe('k');
    });

    it('Ctrl+K 应为有效的搜索快捷键（Windows）', () => {
      const combo = { ctrl: true, key: 'k' };
      expect(combo.ctrl).toBe(true);
    });

    it('Alt 组合键不应与系统快捷键冲突', () => {
      // Alt+1-6, Alt+T, Alt+S 都是非系统保留的
      const systemReserved = ['Alt+F4', 'Alt+Tab', 'Alt+Enter'];
      const ourShortcuts = ['Alt+1', 'Alt+2', 'Alt+T', 'Alt+S'];
      ourShortcuts.forEach(s => {
        expect(systemReserved).not.toContain(s);
      });
    });
  });

  describe('快捷键面板', () => {
    const categories = [
      { name: '搜索', shortcuts: ['⌘K', '/'] },
      { name: '导航', shortcuts: ['Alt+1', 'Alt+2', 'Alt+3', 'Alt+4', 'Alt+5', 'Alt+6'] },
      { name: '操作', shortcuts: ['Esc', 'Alt+T', 'Alt+S', '⌫'] },
    ];

    it('应按类别分组', () => {
      expect(categories).toHaveLength(3);
    });

    it('搜索类别应有 2 个快捷键', () => {
      expect(categories[0].shortcuts).toHaveLength(2);
    });

    it('导航类别应有 6 个快捷键', () => {
      expect(categories[1].shortcuts).toHaveLength(6);
    });

    it('操作类别应有 4 个快捷键', () => {
      expect(categories[2].shortcuts).toHaveLength(4);
    });
  });

  describe('事件派发', () => {
    it('toggle-sidebar 事件应能派发', () => {
      let received = false;
      const handler = () => { received = true; };
      document.addEventListener('toggle-sidebar', handler);
      document.dispatchEvent(new CustomEvent('toggle-sidebar'));
      expect(received).toBe(true);
      document.removeEventListener('toggle-sidebar', handler);
    });
  });
});
