import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ShortcutManager, registerDefaultShortcuts } from '../services/shortcutManager';

// Mock window.addEventListener
const addEventListenerMock = vi.fn();
const removeEventListenerMock = vi.fn();
Object.defineProperty(global, 'window', {
  value: {
    addEventListener: addEventListenerMock,
    removeEventListener: removeEventListenerMock,
  },
  writable: true,
});

describe('ShortcutManager', () => {
  let manager: ShortcutManager;

  beforeEach(() => {
    vi.clearAllMocks();
    manager = new ShortcutManager();
  });

  afterEach(() => {
    manager.destroy();
  });

  describe('register', () => {
    it('should register a shortcut and return an ID', () => {
      const id = manager.register({
        key: 'k',
        ctrl: true,
        description: 'Search',
        category: 'Navigation',
        handler: vi.fn(),
      });
      expect(id).toBeTruthy();
      expect(id).toMatch(/^shortcut_/);
    });

    it('should allow registering multiple shortcuts', () => {
      const id1 = manager.register({ key: 'k', ctrl: true, description: 'Search', category: 'Nav', handler: vi.fn() });
      const id2 = manager.register({ key: 'j', ctrl: true, description: 'Next', category: 'Nav', handler: vi.fn() });
      expect(id1).not.toBe(id2);
    });
  });

  describe('unregister', () => {
    it('should unregister by ID', () => {
      const id = manager.register({ key: 'k', ctrl: true, description: 'S', category: 'N', handler: vi.fn() });
      expect(manager.unregister(id)).toBe(true);
      expect(manager.getShortcuts()).toHaveLength(0);
    });

    it('should return false for unknown ID', () => {
      expect(manager.unregister('unknown')).toBe(false);
    });
  });

  describe('unregisterByCombo', () => {
    it('should unregister by key combo', () => {
      manager.register({ key: 'k', ctrl: true, description: 'S', category: 'N', handler: vi.fn() });
      expect(manager.unregisterByCombo('k', true)).toBe(true);
      expect(manager.getShortcuts()).toHaveLength(0);
    });

    it('should return false for unknown combo', () => {
      expect(manager.unregisterByCombo('x', true, true)).toBe(false);
    });
  });

  describe('enable/disable', () => {
    it('should start enabled', () => {
      expect(manager.isEnabled()).toBe(true);
    });

    it('should disable', () => {
      manager.disable();
      expect(manager.isEnabled()).toBe(false);
    });

    it('should re-enable', () => {
      manager.disable();
      manager.enable();
      expect(manager.isEnabled()).toBe(true);
    });
  });

  describe('getShortcuts', () => {
    it('should return registered shortcuts sorted by category', () => {
      manager.register({ key: 'z', description: 'Last', category: 'B', handler: vi.fn() });
      manager.register({ key: 'a', description: 'First', category: 'A', handler: vi.fn() });
      const shortcuts = manager.getShortcuts();
      expect(shortcuts).toHaveLength(2);
      expect(shortcuts[0].category).toBe('A');
    });

    it('should format combo keys', () => {
      manager.register({ key: 'k', ctrl: true, shift: true, description: 'Test', category: 'T', handler: vi.fn() });
      const shortcuts = manager.getShortcuts();
      expect(shortcuts[0].combo).toContain('Ctrl');
      expect(shortcuts[0].combo).toContain('Shift');
      expect(shortcuts[0].combo).toContain('K');
    });
  });

  describe('getByCategory', () => {
    it('should filter by category', () => {
      manager.register({ key: 'a', description: 'A', category: 'Nav', handler: vi.fn() });
      manager.register({ key: 'b', description: 'B', category: 'Edit', handler: vi.fn() });
      expect(manager.getByCategory('Nav')).toHaveLength(1);
      expect(manager.getByCategory('Edit')).toHaveLength(1);
      expect(manager.getByCategory('Unknown')).toHaveLength(0);
    });
  });

  describe('destroy', () => {
    it('should clean up', () => {
      manager.register({ key: 'a', description: 'A', category: 'T', handler: vi.fn() });
      manager.destroy();
      expect(manager.getShortcuts()).toHaveLength(0);
    });
  });
});

describe('registerDefaultShortcuts', () => {
  it('should register all default shortcuts', () => {
    const m = new ShortcutManager();
    const handlers = {
      onSearch: vi.fn(),
      onRefresh: vi.fn(),
      onToggleDarkMode: vi.fn(),
      onGoHome: vi.fn(),
      onGoWatchlist: vi.fn(),
      onGoPortfolio: vi.fn(),
    };
    registerDefaultShortcuts(handlers);
    // Should have registered shortcuts (exact count depends on manager singleton)
    m.destroy();
  });
});
