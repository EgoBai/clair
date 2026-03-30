import { describe, it, expect } from 'vitest';

// 键盘快捷键引擎
interface Shortcut {
  key: string; ctrl?: boolean; shift?: boolean; alt?: boolean; meta?: boolean;
  action: string; description: string; scope?: string;
}

function parseKeyCombo(combo: string): Omit<Shortcut, 'action' | 'description'> {
  const parts = combo.toLowerCase().split('+');
  return {
    key: parts[parts.length - 1],
    ctrl: parts.includes('ctrl'),
    shift: parts.includes('shift'),
    alt: parts.includes('alt'),
    meta: parts.includes('meta'),
  };
}

function matchShortcut(event: { key: string; ctrlKey: boolean; shiftKey: boolean; altKey: boolean; metaKey: boolean }, shortcut: Shortcut): boolean {
  return event.key.toLowerCase() === shortcut.key.toLowerCase() &&
    !!event.ctrlKey === !!shortcut.ctrl &&
    !!event.shiftKey === !!shortcut.shift &&
    !!event.altKey === !!shortcut.alt &&
    !!event.metaKey === !!shortcut.meta;
}

function detectConflicts(shortcuts: Shortcut[]): string[][] {
  const conflicts: string[][] = [];
  for (let i = 0; i < shortcuts.length; i++) {
    for (let j = i + 1; j < shortcuts.length; j++) {
      if (shortcuts[i].key === shortcuts[j].key &&
          shortcuts[i].ctrl === shortcuts[j].ctrl &&
          shortcuts[i].shift === shortcuts[j].shift &&
          shortcuts[i].alt === shortcuts[j].alt &&
          (!shortcuts[i].scope || !shortcuts[j].scope || shortcuts[i].scope === shortcuts[j].scope)) {
        conflicts.push([shortcuts[i].action, shortcuts[j].action]);
      }
    }
  }
  return conflicts;
}

function formatShortcutDisplay(shortcut: Shortcut): string {
  const parts: string[] = [];
  if (shortcut.ctrl) parts.push('Ctrl');
  if (shortcut.alt) parts.push('Alt');
  if (shortcut.shift) parts.push('Shift');
  if (shortcut.meta) parts.push('⌘');
  parts.push(shortcut.key.toUpperCase());
  return parts.join(' + ');
}

const DEFAULT_SHORTCUTS: Shortcut[] = [
  { key: '/', action: 'search', description: '搜索股票' },
  { key: 'b', ctrl: true, action: 'buy', description: '买入' },
  { key: 's', ctrl: true, action: 'sell', description: '卖出' },
  { key: 'w', ctrl: true, action: 'watchlist', description: '加入自选' },
  { key: 'd', ctrl: true, action: 'dashboard', description: '回到主页' },
  { key: 'Escape', action: 'close', description: '关闭弹窗' },
  { key: '?', shift: true, action: 'help', description: '快捷键帮助' },
  { key: '1', alt: true, action: 'tab1', description: '切换到第1个标签' },
  { key: 'ArrowUp', action: 'prevStock', description: '上一只股票' },
  { key: 'ArrowDown', action: 'nextStock', description: '下一只股票' },
];

function getShortcutsByScope(shortcuts: Shortcut[], scope: string): Shortcut[] {
  return shortcuts.filter(s => !s.scope || s.scope === scope);
}

function isModifierOnly(key: string): boolean {
  return ['ctrl', 'alt', 'shift', 'meta', 'control'].includes(key.toLowerCase());
}

describe('键盘快捷键引擎', () => {
  describe('按键组合解析', () => {
    it('应解析Ctrl+B', () => {
      const result = parseKeyCombo('ctrl+b');
      expect(result.key).toBe('b');
      expect(result.ctrl).toBe(true);
    });

    it('应解析Ctrl+Shift+S', () => {
      const result = parseKeyCombo('ctrl+shift+s');
      expect(result.key).toBe('s');
      expect(result.ctrl).toBe(true);
      expect(result.shift).toBe(true);
    });

    it('应解析单键', () => {
      const result = parseKeyCombo('escape');
      expect(result.key).toBe('escape');
      expect(result.ctrl).toBeFalsy();
    });

    it('应解析Alt+数字', () => {
      const result = parseKeyCombo('alt+1');
      expect(result.key).toBe('1');
      expect(result.alt).toBe(true);
    });
  });

  describe('快捷键匹配', () => {
    it('Ctrl+B事件应匹配buy快捷键', () => {
      const event = { key: 'b', ctrlKey: true, shiftKey: false, altKey: false, metaKey: false };
      expect(matchShortcut(event, DEFAULT_SHORTCUTS[1])).toBe(true);
    });

    it('普通B键不应匹配Ctrl+B', () => {
      const event = { key: 'b', ctrlKey: false, shiftKey: false, altKey: false, metaKey: false };
      expect(matchShortcut(event, DEFAULT_SHORTCUTS[1])).toBe(false);
    });

    it('Escape应匹配close', () => {
      const event = { key: 'Escape', ctrlKey: false, shiftKey: false, altKey: false, metaKey: false };
      expect(matchShortcut(event, DEFAULT_SHORTCUTS[5])).toBe(true);
    });
  });

  describe('冲突检测', () => {
    it('无冲突应返回空数组', () => {
      expect(detectConflicts(DEFAULT_SHORTCUTS).length).toBe(0);
    });

    it('相同按键组合应检测为冲突', () => {
      const dupes: Shortcut[] = [
        { key: 'x', ctrl: true, action: 'action1', description: 'A' },
        { key: 'x', ctrl: true, action: 'action2', description: 'B' },
      ];
      expect(detectConflicts(dupes).length).toBe(1);
    });

    it('不同scope不应冲突', () => {
      const scoped: Shortcut[] = [
        { key: 'x', ctrl: true, action: 'a', description: 'A', scope: 'page1' },
        { key: 'x', ctrl: true, action: 'b', description: 'B', scope: 'page2' },
      ];
      expect(detectConflicts(scoped).length).toBe(0);
    });
  });

  describe('显示格式化', () => {
    it('Ctrl+B应格式化为显示文本', () => {
      expect(formatShortcutDisplay(DEFAULT_SHORTCUTS[1])).toBe('Ctrl + B');
    });

    it('Shift+?应格式化', () => {
      expect(formatShortcutDisplay(DEFAULT_SHORTCUTS[6])).toBe('Shift + ?');
    });

    it('单键应格式化', () => {
      expect(formatShortcutDisplay(DEFAULT_SHORTCUTS[5])).toBe('ESCAPE');
    });
  });

  describe('按作用域过滤', () => {
    it('应返回无scope或匹配scope的快捷键', () => {
      const result = getShortcutsByScope(DEFAULT_SHORTCUTS, 'global');
      expect(result.length).toBe(DEFAULT_SHORTCUTS.length);
    });
  });

  describe('修饰键检测', () => {
    it('ctrl应为修饰键', () => { expect(isModifierOnly('ctrl')).toBe(true); });
    it('shift应为修饰键', () => { expect(isModifierOnly('shift')).toBe(true); });
    it('alt应为修饰键', () => { expect(isModifierOnly('alt')).toBe(true); });
    it('普通键不应为修饰键', () => { expect(isModifierOnly('a')).toBe(false); });
    it('Escape不应为修饰键', () => { expect(isModifierOnly('Escape')).toBe(false); });
  });

  describe('默认快捷键完整性', () => {
    it('应包含10个快捷键', () => { expect(DEFAULT_SHORTCUTS.length).toBe(10); });
    it('每个快捷键应有action', () => { DEFAULT_SHORTCUTS.forEach(s => expect(s.action).toBeTruthy()); });
    it('每个快捷键应有description', () => { DEFAULT_SHORTCUTS.forEach(s => expect(s.description).toBeTruthy()); });
  });
});
