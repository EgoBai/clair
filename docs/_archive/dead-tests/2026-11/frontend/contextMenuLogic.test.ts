import { describe, it, expect } from 'vitest';

/**
 * 右键菜单组件逻辑测试
 * ContextMenu 菜单/定位/分组逻辑
 */

type MenuItemType = 'action' | 'divider' | 'submenu' | 'checkbox' | 'radio';

interface MenuItem {
  id: string;
  type: MenuItemType;
  label?: string;
  icon?: string;
  shortcut?: string;
  disabled?: boolean;
  checked?: boolean;
  children?: MenuItem[];
  group?: string;
  action?: () => void;
}

interface MenuPosition {
  x: number;
  y: number;
}

interface MenuBounds {
  width: number;
  height: number;
  viewportWidth: number;
  viewportHeight: number;
}

function filterVisibleItems(items: MenuItem[]): MenuItem[] {
  return items.filter(item => item.type !== 'divider' || items.indexOf(item) !== items.length - 1);
}

function buildMenuGroups(items: MenuItem[]): Map<string, MenuItem[]> {
  const groups = new Map<string, MenuItem[]>();
  let currentGroup = 'default';

  for (const item of items) {
    if (item.type === 'divider') {
      currentGroup = `group-${groups.size}`;
      continue;
    }
    if (!groups.has(currentGroup)) {
      groups.set(currentGroup, []);
    }
    groups.get(currentGroup)!.push(item);
  }
  return groups;
}

function calcMenuPosition(
  clickPos: MenuPosition,
  menuSize: { width: number; height: number },
  viewport: { width: number; height: number }
): MenuPosition {
  let x = clickPos.x;
  let y = clickPos.y;

  // Flip horizontally if menu would overflow
  if (x + menuSize.width > viewport.width) {
    x = Math.max(0, clickPos.x - menuSize.width);
  }

  // Flip vertically if menu would overflow
  if (y + menuSize.height > viewport.height) {
    y = Math.max(0, clickPos.y - menuSize.height);
  }

  return { x, y };
}

function findItemById(items: MenuItem[], id: string): MenuItem | null {
  for (const item of items) {
    if (item.id === id) return item;
    if (item.children) {
      const found = findItemById(item.children, id);
      if (found) return found;
    }
  }
  return null;
}

function flattenMenuItems(items: MenuItem[]): MenuItem[] {
  const result: MenuItem[] = [];
  for (const item of items) {
    result.push(item);
    if (item.children) {
      result.push(...flattenMenuItems(item.children));
    }
  }
  return result;
}

function getEnabledItems(items: MenuItem[]): MenuItem[] {
  return flattenMenuItems(items).filter(item => !item.disabled && item.type !== 'divider');
}

function formatShortcut(shortcut: string, platform: 'mac' | 'win'): string {
  if (platform === 'mac') {
    return shortcut
      .replace(/Ctrl/g, '⌘')
      .replace(/Alt/g, '⌥')
      .replace(/Shift/g, '⇧');
  }
  return shortcut;
}

function calculateSubMenuPosition(
  parentPos: MenuPosition,
  parentWidth: number,
  subMenuSize: { width: number; height: number },
  viewport: { width: number; height: number }
): MenuPosition {
  // Try right first
  let x = parentPos.x + parentWidth;
  let y = parentPos.y;

  // Flip left if overflow
  if (x + subMenuSize.width > viewport.width) {
    x = parentPos.x - subMenuSize.width;
  }

  // Clamp vertically
  if (y + subMenuSize.height > viewport.height) {
    y = viewport.height - subMenuSize.height;
  }

  return { x: Math.max(0, x), y: Math.max(0, y) };
}

function toggleCheckboxItem(items: MenuItem[], id: string): MenuItem[] {
  return items.map(item => {
    if (item.id === id && item.type === 'checkbox') {
      return { ...item, checked: !item.checked };
    }
    if (item.children) {
      return { ...item, children: toggleCheckboxItem(item.children, id) };
    }
    return item;
  });
}

function selectRadioItem(items: MenuItem[], groupId: string, id: string): MenuItem[] {
  return items.map(item => {
    if (item.group === groupId && item.type === 'radio') {
      return { ...item, checked: item.id === id };
    }
    if (item.children) {
      return { ...item, children: selectRadioItem(item.children, groupId, id) };
    }
    return item;
  });
}

function buildAccessibilityAttributes(item: MenuItem): Record<string, string> {
  const attrs: Record<string, string> = {
    role: item.type === 'divider' ? 'separator' : 'menuitem',
  };

  if (item.disabled) attrs['aria-disabled'] = 'true';
  if (item.type === 'checkbox') attrs['role'] = 'menuitemcheckbox';
  if (item.type === 'radio') attrs['role'] = 'menuitemradio';
  if (item.checked) attrs['aria-checked'] = 'true';
  if (item.children) attrs['aria-haspopup'] = 'true';

  return attrs;
}

function isItemClickable(item: MenuItem): boolean {
  return item.type !== 'divider' && !item.disabled;
}

function countMenuItems(items: MenuItem[]): number {
  return flattenMenuItems(items).filter(i => i.type !== 'divider').length;
}

describe('右键菜单逻辑', () => {
  const mockItems: MenuItem[] = [
    { id: 'copy', type: 'action', label: '复制', shortcut: 'Ctrl+C' },
    { id: 'paste', type: 'action', label: '粘贴', shortcut: 'Ctrl+V' },
    { id: 'd1', type: 'divider' },
    { id: 'select-all', type: 'action', label: '全选', shortcut: 'Ctrl+A' },
    { id: 'cb1', type: 'checkbox', label: '显示网格', checked: true },
    { id: 'r1', type: 'radio', label: '选项A', group: 'opts', checked: true },
    { id: 'r2', type: 'radio', label: '选项B', group: 'opts', checked: false },
    { id: 'sub1', type: 'submenu', label: '更多', children: [
      { id: 'sub-a', type: 'action', label: '子选项A' },
      { id: 'sub-b', type: 'action', label: '子选项B', disabled: true },
    ]},
  ];

  describe('buildMenuGroups', () => {
    it('should group items by dividers', () => {
      const groups = buildMenuGroups(mockItems);
      expect(groups.size).toBeGreaterThan(1);
    });

    it('should put items before first divider in default group', () => {
      const groups = buildMenuGroups(mockItems);
      const defaultGroup = groups.get('default');
      expect(defaultGroup?.some(i => i.id === 'copy')).toBe(true);
    });
  });

  describe('calcMenuPosition', () => {
    it('should position at click point', () => {
      const pos = calcMenuPosition({ x: 100, y: 100 }, { width: 200, height: 300 }, { width: 1920, height: 1080 });
      expect(pos).toEqual({ x: 100, y: 100 });
    });

    it('should flip horizontally on overflow', () => {
      const pos = calcMenuPosition({ x: 1800, y: 100 }, { width: 200, height: 300 }, { width: 1920, height: 1080 });
      expect(pos.x).toBeLessThan(1800);
    });

    it('should flip vertically on overflow', () => {
      const pos = calcMenuPosition({ x: 100, y: 900 }, { width: 200, height: 300 }, { width: 1920, height: 1080 });
      expect(pos.y).toBeLessThan(900);
    });
  });

  describe('findItemById', () => {
    it('should find top-level items', () => {
      expect(findItemById(mockItems, 'copy')?.label).toBe('复制');
    });

    it('should find nested items', () => {
      expect(findItemById(mockItems, 'sub-a')?.label).toBe('子选项A');
    });

    it('should return null for missing', () => {
      expect(findItemById(mockItems, 'unknown')).toBeNull();
    });
  });

  describe('flattenMenuItems', () => {
    it('should flatten nested items', () => {
      const flat = flattenMenuItems(mockItems);
      expect(flat.some(i => i.id === 'sub-a')).toBe(true);
      expect(flat.length).toBeGreaterThan(mockItems.length);
    });
  });

  describe('getEnabledItems', () => {
    it('should exclude disabled and dividers', () => {
      const enabled = getEnabledItems(mockItems);
      expect(enabled.every(i => !i.disabled)).toBe(true);
      expect(enabled.every(i => i.type !== 'divider')).toBe(true);
    });
  });

  describe('formatShortcut', () => {
    it('should format for mac', () => {
      expect(formatShortcut('Ctrl+C', 'mac')).toBe('⌘+C');
    });

    it('should pass through for win', () => {
      expect(formatShortcut('Ctrl+C', 'win')).toBe('Ctrl+C');
    });
  });

  describe('calculateSubMenuPosition', () => {
    it('should position to the right by default', () => {
      const pos = calculateSubMenuPosition({ x: 100, y: 100 }, 200, { width: 180, height: 200 }, { width: 1920, height: 1080 });
      expect(pos.x).toBe(300);
    });

    it('should flip left on overflow', () => {
      const pos = calculateSubMenuPosition({ x: 1800, y: 100 }, 200, { width: 180, height: 200 }, { width: 1920, height: 1080 });
      expect(pos.x).toBeLessThan(1800);
    });
  });

  describe('toggleCheckboxItem', () => {
    it('should toggle checked state', () => {
      const result = toggleCheckboxItem(mockItems, 'cb1');
      const item = result.find(i => i.id === 'cb1');
      expect(item?.checked).toBe(false);
    });

    it('should not affect other items', () => {
      const result = toggleCheckboxItem(mockItems, 'cb1');
      const copy = result.find(i => i.id === 'copy');
      expect(copy?.type).toBe('action');
    });
  });

  describe('selectRadioItem', () => {
    it('should select radio and deselect others in group', () => {
      const result = selectRadioItem(mockItems, 'opts', 'r2');
      const r1 = result.find(i => i.id === 'r1');
      const r2 = result.find(i => i.id === 'r2');
      expect(r1?.checked).toBe(false);
      expect(r2?.checked).toBe(true);
    });
  });

  describe('buildAccessibilityAttributes', () => {
    it('should set correct roles', () => {
      const copyAttrs = buildAccessibilityAttributes(mockItems[0]);
      expect(copyAttrs.role).toBe('menuitem');

      const dividerAttrs = buildAccessibilityAttributes(mockItems[2]);
      expect(dividerAttrs.role).toBe('separator');

      const checkboxAttrs = buildAccessibilityAttributes(mockItems[4]);
      expect(checkboxAttrs.role).toBe('menuitemcheckbox');
    });

    it('should set disabled attribute', () => {
      const item: MenuItem = { id: 'x', type: 'action', label: 'x', disabled: true };
      expect(buildAccessibilityAttributes(item)['aria-disabled']).toBe('true');
    });

    it('should set haspopup for submenu', () => {
      const sub = mockItems.find(i => i.type === 'submenu')!;
      expect(buildAccessibilityAttributes(sub)['aria-haspopup']).toBe('true');
    });
  });

  describe('isItemClickable', () => {
    it('should return true for enabled actions', () => {
      expect(isItemClickable(mockItems[0])).toBe(true);
    });

    it('should return false for dividers', () => {
      expect(isItemClickable(mockItems[2])).toBe(false);
    });

    it('should return false for disabled', () => {
      expect(isItemClickable({ id: 'x', type: 'action', label: 'x', disabled: true })).toBe(false);
    });
  });

  describe('countMenuItems', () => {
    it('should count non-divider items', () => {
      const count = countMenuItems(mockItems);
      expect(count).toBeGreaterThan(0);
      // Should include nested items
      expect(count).toBeGreaterThanOrEqual(mockItems.filter(i => i.type !== 'divider').length);
    });
  });
});
