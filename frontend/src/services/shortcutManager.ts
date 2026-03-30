/**
 * Keyboard Shortcut Manager
 * 键盘快捷键管理器 - 全局快捷键注册和处理
 */

export interface ShortcutConfig {
  key: string;
  ctrl?: boolean;
  shift?: boolean;
  alt?: boolean;
  meta?: boolean;
  description: string;
  category: string;
  handler: (event: KeyboardEvent) => void;
  enabled?: boolean;
  preventDefault?: boolean;
}

interface RegisteredShortcut {
  config: ShortcutConfig;
  id: string;
}

export class ShortcutManager {
  private shortcuts: Map<string, RegisteredShortcut> = new Map();
  private enabled: boolean = true;
  private listener: ((e: KeyboardEvent) => void) | null = null;

  constructor() {
    this.setupListener();
  }

  private setupListener(): void {
    if (typeof window === 'undefined') return;

    this.listener = (e: KeyboardEvent) => {
      if (!this.enabled) return;

      // Skip input elements
      const target = e.target as HTMLElement;
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName) || target.isContentEditable) {
        return;
      }

      const key = this.normalizeKey(e.key);
      const match = this.findMatch(key, e.ctrlKey, e.shiftKey, e.altKey, e.metaKey);

      if (match && match.config.enabled !== false) {
        if (match.config.preventDefault !== false) {
          e.preventDefault();
        }
        match.config.handler(e);
      }
    };

    window.addEventListener('keydown', this.listener);
  }

  private normalizeKey(key: string): string {
    return key.toLowerCase();
  }

  private makeKey(key: string, ctrl: boolean, shift: boolean, alt: boolean, meta: boolean): string {
    const parts: string[] = [];
    if (ctrl) parts.push('ctrl');
    if (shift) parts.push('shift');
    if (alt) parts.push('alt');
    if (meta) parts.push('meta');
    parts.push(key.toLowerCase());
    return parts.join('+');
  }

  private findMatch(key: string, ctrl: boolean, shift: boolean, alt: boolean, meta: boolean): RegisteredShortcut | undefined {
    const comboKey = this.makeKey(key, ctrl, shift, alt, meta);
    return this.shortcuts.get(comboKey);
  }

  register(config: ShortcutConfig): string {
    const id = `shortcut_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const comboKey = this.makeKey(
      config.key,
      config.ctrl ?? false,
      config.shift ?? false,
      config.alt ?? false,
      config.meta ?? false
    );

    this.shortcuts.set(comboKey, { config, id });
    return id;
  }

  unregister(id: string): boolean {
    for (const [key, shortcut] of this.shortcuts) {
      if (shortcut.id === id) {
        this.shortcuts.delete(key);
        return true;
      }
    }
    return false;
  }

  unregisterByCombo(key: string, ctrl?: boolean, shift?: boolean, alt?: boolean, meta?: boolean): boolean {
    const comboKey = this.makeKey(key, ctrl ?? false, shift ?? false, alt ?? false, meta ?? false);
    return this.shortcuts.delete(comboKey);
  }

  enable(): void {
    this.enabled = true;
  }

  disable(): void {
    this.enabled = false;
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  getShortcuts(): Array<{ id: string; combo: string; description: string; category: string }> {
    const result: Array<{ id: string; combo: string; description: string; category: string }> = [];
    for (const [combo, { config, id }] of this.shortcuts) {
      result.push({
        id,
        combo: this.formatCombo(combo),
        description: config.description,
        category: config.category,
      });
    }
    return result.sort((a, b) => a.category.localeCompare(b.category) || a.combo.localeCompare(b.combo));
  }

  getByCategory(category: string): Array<{ id: string; combo: string; description: string }> {
    return this.getShortcuts().filter(s => s.category === category);
  }

  private formatCombo(combo: string): string {
    return combo
      .split('+')
      .map(part => part.charAt(0).toUpperCase() + part.slice(1))
      .join(' + ');
  }

  destroy(): void {
    if (this.listener && typeof window !== 'undefined') {
      window.removeEventListener('keydown', this.listener);
    }
    this.shortcuts.clear();
  }
}

export const shortcutManager = new ShortcutManager();

// Predefined stock app shortcuts
export function registerDefaultShortcuts(handlers: {
  onSearch: () => void;
  onRefresh: () => void;
  onToggleDarkMode: () => void;
  onGoHome: () => void;
  onGoWatchlist: () => void;
  onGoPortfolio: () => void;
}): void {
  shortcutManager.register({
    key: 'k', ctrl: true, description: '搜索股票', category: '导航',
    handler: handlers.onSearch,
  });
  shortcutManager.register({
    key: 'r', ctrl: true, description: '刷新数据', category: '操作',
    handler: handlers.onRefresh,
  });
  shortcutManager.register({
    key: 'd', ctrl: true, shift: true, description: '切换暗色模式', category: '设置',
    handler: handlers.onToggleDarkMode,
  });
  shortcutManager.register({
    key: '1', alt: true, description: '首页', category: '导航',
    handler: handlers.onGoHome,
  });
  shortcutManager.register({
    key: '2', alt: true, description: '自选股', category: '导航',
    handler: handlers.onGoWatchlist,
  });
  shortcutManager.register({
    key: '3', alt: true, description: '持仓', category: '导航',
    handler: handlers.onGoPortfolio,
  });
}
