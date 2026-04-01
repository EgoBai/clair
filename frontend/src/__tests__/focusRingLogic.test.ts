import { describe, it, expect } from 'vitest';

/**
 * FocusRing 焦点环组件逻辑测试
 * 焦点管理/键盘导航逻辑
 */

type FocusDirection = 'next' | 'prev' | 'first' | 'last';
type FocusTrapMode = 'loop' | 'stop' | 'none';

interface FocusableElement {
  id: string;
  tabIndex: number;
  disabled: boolean;
  group?: string;
}

interface FocusRingConfig {
  trapMode: FocusTrapMode;
  autoFocus: boolean;
  restoreFocus: boolean;
  wrapAround: boolean;
}

function getFocusableElements(elements: FocusableElement[]): FocusableElement[] {
  return elements
    .filter(el => !el.disabled && el.tabIndex >= 0)
    .sort((a, b) => a.tabIndex - b.tabIndex);
}

function findNextFocusable(
  elements: FocusableElement[],
  currentId: string,
  direction: FocusDirection = 'next'
): FocusableElement | null {
  const focusable = getFocusableElements(elements);
  if (focusable.length === 0) return null;

  const currentIdx = focusable.findIndex(el => el.id === currentId);
  if (currentIdx === -1) {
    return direction === 'last' ? focusable[focusable.length - 1] : focusable[0];
  }

  switch (direction) {
    case 'next':
      return focusable[currentIdx + 1] ?? null;
    case 'prev':
      return focusable[currentIdx - 1] ?? null;
    case 'first':
      return focusable[0];
    case 'last':
      return focusable[focusable.length - 1];
  }
}

function findNextFocusableWrapped(
  elements: FocusableElement[],
  currentId: string,
  direction: 'next' | 'prev' = 'next'
): FocusableElement | null {
  const focusable = getFocusableElements(elements);
  if (focusable.length === 0) return null;

  const currentIdx = focusable.findIndex(el => el.id === currentId);
  if (currentIdx === -1) return focusable[0];

  if (direction === 'next') {
    return focusable[(currentIdx + 1) % focusable.length];
  } else {
    return focusable[(currentIdx - 1 + focusable.length) % focusable.length];
  }
}

function handleKeyDown(
  key: string,
  config: FocusRingConfig
): FocusDirection | null {
  switch (key) {
    case 'Tab':
      return null; // Browser default
    case 'ArrowDown':
    case 'ArrowRight':
      return 'next';
    case 'ArrowUp':
    case 'ArrowLeft':
      return 'prev';
    case 'Home':
      return 'first';
    case 'End':
      return 'last';
    default:
      return null;
  }
}

function shouldPreventDefault(key: string, config: FocusRingConfig): boolean {
  const handled = ['ArrowDown', 'ArrowUp', 'ArrowLeft', 'ArrowRight', 'Home', 'End'];
  return handled.includes(key);
}

function calcFocusRingStyle(
  elementRect: { width: number; height: number; x: number; y: number },
  offset = 2,
  borderWidth = 2
): {
  top: number;
  left: number;
  width: number;
  height: number;
  borderWidth: number;
} {
  return {
    top: elementRect.y - offset,
    left: elementRect.x - offset,
    width: elementRect.width + offset * 2,
    height: elementRect.height + offset * 2,
    borderWidth,
  };
}

function getElementsInGroup(
  elements: FocusableElement[],
  group: string
): FocusableElement[] {
  return getFocusableElements(elements).filter(el => el.group === group);
}

function getNextGroup(
  groups: string[],
  currentGroup: string
): string | null {
  const idx = groups.indexOf(currentGroup);
  if (idx === -1) return groups[0] ?? null;
  return groups[(idx + 1) % groups.length] ?? null;
}

function createFocusTrap(elements: FocusableElement[]): {
  firstElement: FocusableElement | null;
  lastElement: FocusableElement | null;
  canTrap: boolean;
} {
  const focusable = getFocusableElements(elements);
  return {
    firstElement: focusable[0] ?? null,
    lastElement: focusable[focusable.length - 1] ?? null,
    canTrap: focusable.length > 0,
  };
}

function isValidTabIndex(tabIndex: number): boolean {
  return Number.isInteger(tabIndex) && tabIndex >= -1 && tabIndex <= 32767;
}

describe('FocusRing 焦点环逻辑', () => {
  const mockElements: FocusableElement[] = [
    { id: 'btn1', tabIndex: 0, disabled: false },
    { id: 'btn2', tabIndex: 1, disabled: false },
    { id: 'btn3', tabIndex: 2, disabled: true },
    { id: 'btn4', tabIndex: 3, disabled: false },
  ];

  describe('getFocusableElements', () => {
    it('should filter out disabled elements', () => {
      const result = getFocusableElements(mockElements);
      expect(result.every(el => !el.disabled)).toBe(true);
    });

    it('should sort by tabIndex', () => {
      const result = getFocusableElements(mockElements);
      for (let i = 1; i < result.length; i++) {
        expect(result[i].tabIndex).toBeGreaterThanOrEqual(result[i - 1].tabIndex);
      }
    });

    it('should filter out negative tabIndex', () => {
      const els = [...mockElements, { id: 'x', tabIndex: -1, disabled: false }];
      expect(getFocusableElements(els).find(e => e.id === 'x')).toBeUndefined();
    });
  });

  describe('findNextFocusable', () => {
    it('should find next element', () => {
      const next = findNextFocusable(mockElements, 'btn1', 'next');
      expect(next?.id).toBe('btn2');
    });

    it('should skip disabled elements', () => {
      const next = findNextFocusable(mockElements, 'btn2', 'next');
      expect(next?.id).toBe('btn4');
    });

    it('should return null at end', () => {
      expect(findNextFocusable(mockElements, 'btn4', 'next')).toBeNull();
    });

    it('should return null at start going prev', () => {
      expect(findNextFocusable(mockElements, 'btn1', 'prev')).toBeNull();
    });

    it('should find first from unknown element', () => {
      const next = findNextFocusable(mockElements, 'unknown', 'next');
      expect(next?.id).toBe('btn1');
    });

    it('should find last directly', () => {
      const last = findNextFocusable(mockElements, 'btn1', 'last');
      expect(last?.id).toBe('btn4');
    });
  });

  describe('findNextFocusableWrapped', () => {
    it('should wrap around forward', () => {
      const next = findNextFocusableWrapped(mockElements, 'btn4', 'next');
      expect(next?.id).toBe('btn1');
    });

    it('should wrap around backward', () => {
      const prev = findNextFocusableWrapped(mockElements, 'btn1', 'prev');
      expect(prev?.id).toBe('btn4');
    });
  });

  describe('handleKeyDown', () => {
    const config: FocusRingConfig = { trapMode: 'loop', autoFocus: true, restoreFocus: true, wrapAround: true };

    it('should map arrow keys to directions', () => {
      expect(handleKeyDown('ArrowDown', config)).toBe('next');
      expect(handleKeyDown('ArrowUp', config)).toBe('prev');
      expect(handleKeyDown('ArrowRight', config)).toBe('next');
      expect(handleKeyDown('ArrowLeft', config)).toBe('prev');
    });

    it('should map Home/End', () => {
      expect(handleKeyDown('Home', config)).toBe('first');
      expect(handleKeyDown('End', config)).toBe('last');
    });

    it('should not handle Tab', () => {
      expect(handleKeyDown('Tab', config)).toBeNull();
    });

    it('should not handle unknown keys', () => {
      expect(handleKeyDown('a', config)).toBeNull();
      expect(handleKeyDown('Enter', config)).toBeNull();
    });
  });

  describe('shouldPreventDefault', () => {
    const config: FocusRingConfig = { trapMode: 'loop', autoFocus: true, restoreFocus: true, wrapAround: true };

    it('should prevent arrow keys', () => {
      expect(shouldPreventDefault('ArrowDown', config)).toBe(true);
    });

    it('should prevent Home/End', () => {
      expect(shouldPreventDefault('Home', config)).toBe(true);
    });

    it('should not prevent Tab', () => {
      expect(shouldPreventDefault('Tab', config)).toBe(false);
    });
  });

  describe('calcFocusRingStyle', () => {
    it('should calculate ring dimensions', () => {
      const style = calcFocusRingStyle({ x: 100, y: 50, width: 200, height: 40 });
      expect(style.top).toBe(48);
      expect(style.left).toBe(98);
      expect(style.width).toBe(204);
      expect(style.height).toBe(44);
    });

    it('should respect custom offset', () => {
      const style = calcFocusRingStyle({ x: 100, y: 50, width: 200, height: 40 }, 5);
      expect(style.top).toBe(45);
      expect(style.width).toBe(210);
    });
  });

  describe('getElementsInGroup', () => {
    it('should filter by group', () => {
      const els: FocusableElement[] = [
        { id: 'a', tabIndex: 0, disabled: false, group: 'header' },
        { id: 'b', tabIndex: 1, disabled: false, group: 'body' },
        { id: 'c', tabIndex: 2, disabled: false, group: 'header' },
      ];
      expect(getElementsInGroup(els, 'header')).toHaveLength(2);
    });
  });

  describe('getNextGroup', () => {
    it('should cycle through groups', () => {
      const groups = ['header', 'body', 'footer'];
      expect(getNextGroup(groups, 'header')).toBe('body');
      expect(getNextGroup(groups, 'footer')).toBe('header');
    });

    it('should return first for unknown group', () => {
      expect(getNextGroup(['a', 'b'], 'unknown')).toBe('a');
    });
  });

  describe('createFocusTrap', () => {
    it('should identify first and last', () => {
      const trap = createFocusTrap(mockElements);
      expect(trap.firstElement?.id).toBe('btn1');
      expect(trap.lastElement?.id).toBe('btn4');
      expect(trap.canTrap).toBe(true);
    });

    it('should handle empty elements', () => {
      const trap = createFocusTrap([]);
      expect(trap.canTrap).toBe(false);
    });
  });

  describe('isValidTabIndex', () => {
    it('should accept valid values', () => {
      expect(isValidTabIndex(0)).toBe(true);
      expect(isValidTabIndex(-1)).toBe(true);
      expect(isValidTabIndex(32767)).toBe(true);
    });

    it('should reject invalid values', () => {
      expect(isValidTabIndex(-2)).toBe(false);
      expect(isValidTabIndex(32768)).toBe(false);
      expect(isValidTabIndex(1.5)).toBe(false);
    });
  });
});
