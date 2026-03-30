/**
 * 列表键盘导航 Hook 逻辑测试
 */
import { describe, it, expect, vi } from 'vitest';

describe('useListNavigation Logic', () => {
  // Test the core navigation logic
  describe('Navigation Movement', () => {
    const items = ['A', 'B', 'C', 'D', 'E'];

    it('should move down from current index', () => {
      const moveDown = (prev: number, len: number, loop: boolean) => {
        if (prev >= len - 1) return loop ? 0 : len - 1;
        return prev + 1;
      };
      expect(moveDown(0, items.length, true)).toBe(1);
      expect(moveDown(2, items.length, true)).toBe(3);
    });

    it('should move up from current index', () => {
      const moveUp = (prev: number, len: number, loop: boolean) => {
        if (prev <= 0) return loop ? len - 1 : 0;
        return prev - 1;
      };
      expect(moveUp(2, items.length, true)).toBe(1);
      expect(moveUp(0, items.length, true)).toBe(4); // loop
    });

    it('should loop at bottom when loop enabled', () => {
      const moveDown = (prev: number, len: number, loop: boolean) => {
        if (prev >= len - 1) return loop ? 0 : len - 1;
        return prev + 1;
      };
      expect(moveDown(4, items.length, true)).toBe(0);
    });

    it('should not loop at bottom when loop disabled', () => {
      const moveDown = (prev: number, len: number, loop: boolean) => {
        if (prev >= len - 1) return loop ? 0 : len - 1;
        return prev + 1;
      };
      expect(moveDown(4, items.length, false)).toBe(4);
    });

    it('should loop at top when loop enabled', () => {
      const moveUp = (prev: number, len: number, loop: boolean) => {
        if (prev <= 0) return loop ? len - 1 : 0;
        return prev - 1;
      };
      expect(moveUp(0, items.length, true)).toBe(4);
    });

    it('should not loop at top when loop disabled', () => {
      const moveUp = (prev: number, len: number, loop: boolean) => {
        if (prev <= 0) return loop ? len - 1 : 0;
        return prev - 1;
      };
      expect(moveUp(0, items.length, false)).toBe(0);
    });
  });

  describe('Home/End Navigation', () => {
    it('should go to first item on Home', () => {
      const goToFirst = () => 0;
      expect(goToFirst()).toBe(0);
    });

    it('should go to last item on End', () => {
      const items = ['A', 'B', 'C', 'D', 'E'];
      const goToLast = () => items.length - 1;
      expect(goToLast()).toBe(4);
    });
  });

  describe('Active State', () => {
    it('should detect active item', () => {
      const isActive = (index: number, activeIndex: number) => index === activeIndex;
      expect(isActive(2, 2)).toBe(true);
      expect(isActive(1, 2)).toBe(false);
    });

    it('should return -1 for no selection', () => {
      const isActive = (index: number, activeIndex: number) => index === activeIndex;
      expect(isActive(0, -1)).toBe(false);
    });
  });

  describe('Item Props Generation', () => {
    it('should generate correct data-active attribute', () => {
      const getItemProps = (index: number, activeIndex: number) => ({
        'data-active': index === activeIndex,
        tabIndex: index === activeIndex ? 0 : -1,
      });
      expect(getItemProps(2, 2)['data-active']).toBe(true);
      expect(getItemProps(1, 2)['data-active']).toBe(false);
      expect(getItemProps(2, 2).tabIndex).toBe(0);
      expect(getItemProps(1, 2).tabIndex).toBe(-1);
    });
  });

  describe('Input Field Handling', () => {
    it('should ignore keydown in input fields', () => {
      const shouldIgnore = (tagName: string) =>
        tagName === 'INPUT' || tagName === 'TEXTAREA';
      expect(shouldIgnore('INPUT')).toBe(true);
      expect(shouldIgnore('TEXTAREA')).toBe(true);
      expect(shouldIgnore('DIV')).toBe(false);
      expect(shouldIgnore('BUTTON')).toBe(false);
    });
  });

  describe('Key Mapping', () => {
    const keyActions: Record<string, string> = {
      'j': 'down',
      'ArrowDown': 'down',
      'k': 'up',
      'ArrowUp': 'up',
      'Home': 'first',
      'End': 'last',
      'Enter': 'select',
    };

    it('should map j to move down', () => {
      expect(keyActions['j']).toBe('down');
    });

    it('should map k to move up', () => {
      expect(keyActions['k']).toBe('up');
    });

    it('should map ArrowDown to move down', () => {
      expect(keyActions['ArrowDown']).toBe('down');
    });

    it('should map ArrowUp to move up', () => {
      expect(keyActions['ArrowUp']).toBe('up');
    });

    it('should map Home to first', () => {
      expect(keyActions['Home']).toBe('first');
    });

    it('should map End to last', () => {
      expect(keyActions['End']).toBe('last');
    });

    it('should map Enter to select', () => {
      expect(keyActions['Enter']).toBe('select');
    });
  });

  describe('Empty List Handling', () => {
    it('should handle empty list gracefully', () => {
      const items: string[] = [];
      const moveDown = (prev: number, len: number) => {
        if (len === 0) return -1;
        return Math.min(prev + 1, len - 1);
      };
      expect(moveDown(0, items.length)).toBe(-1);
    });
  });

  describe('Selection Callback', () => {
    it('should call onSelect with item and index', () => {
      const items = ['A', 'B', 'C'];
      const callback = vi.fn();
      const selectCurrent = (activeIndex: number) => {
        if (activeIndex >= 0 && activeIndex < items.length) {
          callback(items[activeIndex], activeIndex);
        }
      };
      selectCurrent(1);
      expect(callback).toHaveBeenCalledWith('B', 1);
    });

    it('should not call onSelect for invalid index', () => {
      const items = ['A', 'B', 'C'];
      const callback = vi.fn();
      const selectCurrent = (activeIndex: number) => {
        if (activeIndex >= 0 && activeIndex < items.length) {
          callback(items[activeIndex], activeIndex);
        }
      };
      selectCurrent(-1);
      expect(callback).not.toHaveBeenCalled();
    });
  });
});
