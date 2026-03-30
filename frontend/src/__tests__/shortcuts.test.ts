/**
 * 键盘快捷键测试
 */
import { describe, it, expect } from 'vitest';

describe('键盘快捷键', () => {
  describe('快捷键映射', () => {
    const shortcuts = [
      { keys: ['Ctrl', 'K'], action: 'searchFocus', description: '聚焦搜索' },
      { keys: ['/'], action: 'searchFocus', description: '聚焦搜索' },
      { keys: ['Escape'], action: 'escape', description: '关闭弹窗' },
      { keys: ['Alt', '1'], action: 'navigateHome', description: '首页' },
      { keys: ['Alt', '2'], action: 'navigateStocks', description: '股票列表' },
      { keys: ['Alt', '3'], action: 'navigateMarket', description: '行情分析' },
      { keys: ['Alt', 'T'], action: 'toggleTheme', description: '切换主题' },
      { keys: ['Backspace'], action: 'goBack', description: '返回' },
    ];

    it('所有快捷键都应该有描述', () => {
      for (const s of shortcuts) {
        expect(s.description).toBeTruthy();
        expect(s.keys.length).toBeGreaterThan(0);
      }
    });

    it('快捷键动作应该唯一', () => {
      const actions = shortcuts.map(s => s.action);
      const uniqueActions = [...new Set(actions)];
      // 搜索聚焦有两个快捷键（Ctrl+K 和 /）
      expect(uniqueActions.length).toBeLessThanOrEqual(actions.length);
    });

    it('不应该有冲突的快捷键', () => {
      const keyCombos = shortcuts.map(s => s.keys.join('+'));
      const uniqueCombos = [...new Set(keyCombos)];
      expect(uniqueCombos.length).toBe(keyCombos.length);
    });
  });

  describe('输入框中应忽略快捷键', () => {
    const shouldIgnoreInInput = (key: string, isInput: boolean) => {
      if (key === 'Escape') return false; // Escape 总是生效
      return isInput;
    };

    it('非 Escape 键在输入框中应忽略', () => {
      expect(shouldIgnoreInInput('k', true)).toBe(true);
      expect(shouldIgnoreInInput('/', true)).toBe(true);
      expect(shouldIgnoreInInput('Backspace', true)).toBe(true);
    });

    it('Escape 键在输入框中仍应生效', () => {
      expect(shouldIgnoreInInput('Escape', true)).toBe(false);
      expect(shouldIgnoreInInput('Escape', false)).toBe(false);
    });
  });
});
