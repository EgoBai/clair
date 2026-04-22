/**
 * 增强快捷键引擎
 * 支持组合键、序列键、上下文感知、自定义配置
 * 参考 VS Code / TradingView 快捷键系统
 */

export interface ShortcutDefinition {
  id: string;
  keys: string; // e.g. 'ctrl+k', 'g h', 'shift+alt+d'
  action: () => void;
  description: string;
  context?: string; // 上下文名称，如 'stock-list', 'chart', 'global'
  when?: () => boolean; // 条件执行
  preventDefault?: boolean;
  allowInInput?: boolean;
}

interface KeySequence {
  keys: string[];
  timestamp: number;
}

// ==================== 按键解析 ====================

function parseKeyCombo(combo: string): {
  ctrl: boolean;
  meta: boolean;
  shift: boolean;
  alt: boolean;
  key: string;
} {
  const parts = combo.toLowerCase().split('+').map(s => s.trim());
  return {
    ctrl: parts.includes('ctrl'),
    meta: parts.includes('cmd') || parts.includes('meta'),
    shift: parts.includes('shift'),
    alt: parts.includes('alt'),
    key: parts.filter(p => !['ctrl', 'cmd', 'meta', 'shift', 'alt'].includes(p))[0] || '',
  };
}

function matchCombo(
  event: KeyboardEvent,
  combo: ReturnType<typeof parseKeyCombo>
): boolean {
  if (event.ctrlKey !== combo.ctrl) return false;
  if (event.metaKey !== combo.meta) return false;
  if (event.shiftKey !== combo.shift) return false;
  if (event.altKey !== combo.alt) return false;
  if (event.key.toLowerCase() !== combo.key && event.code.toLowerCase() !== combo.key) return false;
  return true;
}

// ==================== 快捷键引擎 ====================

class ShortcutEngine {
  private shortcuts: Map<string, ShortcutDefinition> = new Map();
  private enabled = true;
  private activeContext = 'global';
  private sequenceBuffer: KeySequence = { keys: [], timestamp: 0 };
  private sequenceTimeout: ReturnType<typeof setTimeout> | null = null;
  private readonly SEQUENCE_DELAY = 800; // 序列键超时(ms)

  constructor() {
    this.handleKeyDown = this.handleKeyDown.bind(this);
    if (typeof document !== 'undefined') {
      document.addEventListener('keydown', this.handleKeyDown);
    }
  }

  /**
   * 注册快捷键
   */
  register(shortcut: ShortcutDefinition): () => void {
    this.shortcuts.set(shortcut.id, shortcut);
    return () => this.unregister(shortcut.id);
  }

  /**
   * 批量注册
   */
  registerAll(shortcuts: ShortcutDefinition[]): () => void {
    const unregisters = shortcuts.map(s => this.register(s));
    return () => unregisters.forEach(fn => fn());
  }

  /**
   * 注销快捷键
   */
  unregister(id: string): void {
    this.shortcuts.delete(id);
  }

  /**
   * 设置当前上下文
   */
  setContext(context: string): void {
    this.activeContext = context;
  }

  /**
   * 启用/禁用
   */
  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }

  /**
   * 获取所有已注册快捷键
   */
  getShortcuts(): ShortcutDefinition[] {
    return Array.from(this.shortcuts.values());
  }

  /**
   * 获取指定上下文的快捷键
   */
  getShortcutsForContext(context: string): ShortcutDefinition[] {
    return this.getShortcuts().filter(s => 
      !s.context || s.context === context || s.context === 'global'
    );
  }

  private handleKeyDown(event: KeyboardEvent): void {
    if (!this.enabled) return;

    const target = event.target as HTMLElement;
    const isInput = target.tagName === 'INPUT' || 
                    target.tagName === 'TEXTAREA' || 
                    target.isContentEditable;

    // 处理序列键
    if (!event.ctrlKey && !event.metaKey && !event.altKey && !event.shiftKey) {
      this.processSequence(event, isInput);
    }

    // 匹配快捷键
    for (const shortcut of this.shortcuts.values()) {
      if (isInput && !shortcut.allowInInput) continue;
      if (shortcut.when && !shortcut.when()) continue;
      if (shortcut.context && 
          shortcut.context !== 'global' && 
          shortcut.context !== this.activeContext) continue;

      const combo = parseKeyCombo(shortcut.keys);

      // 序列键处理 (如 'g h')
      if (combo.key.includes(' ') && !combo.ctrl && !combo.meta && !combo.alt && !combo.shift) {
        continue; // 序列键在 processSequence 中处理
      }

      if (matchCombo(event, combo)) {
        if (shortcut.preventDefault !== false) {
          event.preventDefault();
        }
        shortcut.action();
        return;
      }
    }
  }

  private processSequence(event: KeyboardEvent, isInput: boolean): void {
    if (isInput) return;

    const now = Date.now();

    // 超时重置
    if (now - this.sequenceBuffer.timestamp > this.SEQUENCE_DELAY) {
      this.sequenceBuffer.keys = [];
    }

    this.sequenceBuffer.keys.push(event.key.toLowerCase());
    this.sequenceBuffer.timestamp = now;

    // 检查序列匹配
    const seqStr = this.sequenceBuffer.keys.join(' ');
    for (const shortcut of this.shortcuts.values()) {
      const combo = parseKeyCombo(shortcut.keys);
      if (combo.key.includes(' ')) {
        const seqKeys = combo.key.split(' ').join(' ');
        if (seqStr === seqKeys) {
          if (shortcut.preventDefault !== false) {
            event.preventDefault();
          }
          shortcut.action();
          this.sequenceBuffer.keys = [];
          return;
        }
        if (seqStr.startsWith(seqKeys.substring(0, seqStr.length))) {
          return; // 部分匹配，等待后续按键
        }
      }
    }

    // 无匹配，保留最后一个按键
    if (this.sequenceBuffer.keys.length > 3) {
      this.sequenceBuffer.keys = [this.sequenceBuffer.keys[this.sequenceBuffer.keys.length - 1]];
    }
  }

  destroy(): void {
    if (typeof document !== 'undefined') {
      document.removeEventListener('keydown', this.handleKeyDown);
    }
    if (this.sequenceTimeout) {
      clearTimeout(this.sequenceTimeout);
    }
    this.shortcuts.clear();
  }
}

// 全局单例
export const shortcutEngine = new ShortcutEngine();

// ==================== 预设快捷键 ====================

export const PRESET_SHORTCUTS = {
  // 导航
  GO_HOME: { keys: 'alt+1', description: '返回首页' },
  GO_STOCKS: { keys: 'alt+2', description: '股票列表' },
  GO_MARKET: { keys: 'alt+3', description: '行情分析' },
  GO_WATCHLIST: { keys: 'alt+4', description: '自选股' },
  GO_BACKTEST: { keys: 'alt+5', description: '策略回测' },
  GO_AI: { keys: 'alt+6', description: 'AI选股' },
  
  // 搜索与命令面板
  SEARCH: { keys: 'ctrl+k', description: '命令面板' },
  SEARCH_ALT: { keys: '/', description: '聚焦搜索' },
  COMMAND_PALETTE: { keys: 'ctrl+k', description: '打开命令面板' },
  SHORTCUT_HELP: { keys: 'shift+/', description: '快捷键帮助' },
  
  // 操作
  ESCAPE: { keys: 'escape', description: '关闭/取消' },
  GO_BACK: { keys: 'backspace', description: '返回上一页' },
  TOGGLE_THEME: { keys: 'alt+t', description: '切换主题' },
  TOGGLE_SIDEBAR: { keys: 'alt+s', description: '切换侧边栏' },
  
  // 数据操作
  REFRESH_DATA: { keys: 'r', description: '刷新数据' },
  FILTER_OPEN: { keys: 'f', description: '打开筛选器' },
  SORT_BY_PRICE: { keys: 's p', description: '按价格排序' },
  SORT_BY_CHANGE: { keys: 's c', description: '按涨跌幅排序' },
  SORT_BY_VOLUME: { keys: 's v', description: '按成交量排序' },
  
  // 序列键
  GOTO_HOME: { keys: 'g h', description: '跳转首页 (g→h)' },
  GOTO_STOCKS: { keys: 'g s', description: '跳转股票 (g→s)' },
  GOTO_MARKET: { keys: 'g m', description: '跳转行情 (g→m)' },
  GOTO_WATCHLIST: { keys: 'g w', description: '跳转自选 (g→w)' },
  GOTO_SETTINGS: { keys: 'g p', description: '跳转设置 (g→p)' },
  
  // 列表导航
  LIST_UP: { keys: 'k', description: '列表上移' },
  LIST_DOWN: { keys: 'j', description: '列表下移' },
  LIST_SELECT: { keys: 'enter', description: '选中当前项' },
  LIST_FIRST: { keys: 'home', description: '列表首项' },
  LIST_LAST: { keys: 'end', description: '列表末项' },
  
  // 表格
  PAGE_UP: { keys: 'pageup', description: '上一页' },
  PAGE_DOWN: { keys: 'pagedown', description: '下一页' },
} as const;
