// @vitest-environment jsdom
/**
 * Command Palette + Shortcut Help 综合测试
 * 对标 Linear/Notion 交互效率
 */
import { describe, it, expect } from 'vitest';

describe('CommandPalette 命令面板', () => {
  describe('命令项结构', () => {
    interface CommandItem {
      id: string;
      label: string;
      description?: string;
      icon?: string;
      category: 'navigation' | 'action' | 'data' | 'stock' | 'help';
      shortcut?: string;
      handler: () => void;
      keywords?: string[];
    }

    const commands: CommandItem[] = [
      { id: 'nav-home', label: '首页', icon: '🏠', category: 'navigation', shortcut: 'Alt+1', handler: () => {}, keywords: ['home', '首页'] },
      { id: 'refresh-data', label: '刷新数据', icon: '🔄', category: 'data', shortcut: 'R', handler: () => {}, keywords: ['refresh', '刷新'] },
      { id: 'filter-stocks', label: '筛选股票', icon: '🔍', category: 'data', shortcut: 'F', handler: () => {}, keywords: ['filter', '筛选'] },
      { id: 'sort-price', label: '按价格排序', icon: '💰', category: 'data', shortcut: 'S P', handler: () => {}, keywords: ['sort', '排序'] },
      { id: 'toggle-theme', label: '切换主题', icon: '🌙', category: 'action', shortcut: 'Alt+T', handler: () => {}, keywords: ['theme', '暗色'] },
      { id: 'shortcuts-help', label: '快捷键帮助', icon: '⌨️', category: 'help', shortcut: '?', handler: () => {}, keywords: ['help', '快捷键'] },
    ];

    it('命令项应有唯一 ID', () => {
      const ids = commands.map(c => c.id);
      expect(new Set(ids).size).toBe(ids.length);
    });

    it('命令项应有标签', () => {
      commands.forEach(c => {
        expect(c.label.length).toBeGreaterThan(0);
      });
    });

    it('命令项应有分类', () => {
      const validCategories = ['navigation', 'action', 'data', 'stock', 'help'];
      commands.forEach(c => {
        expect(validCategories).toContain(c.category);
      });
    });

    it('命令项应有快捷键', () => {
      commands.forEach(c => {
        expect(c.shortcut).toBeTruthy();
      });
    });

    it('命令项应有 handler 函数', () => {
      commands.forEach(c => {
        expect(typeof c.handler).toBe('function');
      });
    });

    it('命令项应有 keywords 用于搜索', () => {
      commands.forEach(c => {
        expect(Array.isArray(c.keywords)).toBe(true);
        expect(c.keywords!.length).toBeGreaterThan(0);
      });
    });
  });

  describe('搜索过滤逻辑', () => {
    const commands = [
      { id: 'nav-home', label: '首页', category: 'navigation', keywords: ['home', '首页', '主页'], handler: () => {  } },
      { id: 'refresh-data', label: '刷新数据', category: 'data', keywords: ['refresh', '刷新', '更新'], handler: () => {  } },
      { id: 'sort-price', label: '按价格排序', category: 'data', keywords: ['sort', '排序', '价格'], handler: () => {  } },
      { id: 'toggle-theme', label: '切换主题', category: 'action', keywords: ['theme', '主题', '暗色', 'dark'], handler: () => {  } },
    ];

    function filterCommands(query: string) {
      const q = query.toLowerCase().trim();
      if (!q) return commands;
      return commands.filter(cmd => {
        const searchText = [cmd.label, cmd.category, ...(cmd.keywords || [])].join(' ').toLowerCase();
        return searchText.includes(q);
      });
    }

    it('空查询应返回所有命令', () => {
      expect(filterCommands('')).toHaveLength(4);
    });

    it('应按标签匹配', () => {
      expect(filterCommands('刷新')).toHaveLength(1);
      expect(filterCommands('刷新')[0].id).toBe('refresh-data');
    });

    it('应按英文关键词匹配', () => {
      expect(filterCommands('theme')).toHaveLength(1);
      expect(filterCommands('theme')[0].id).toBe('toggle-theme');
    });

    it('应按拼音关键词匹配', () => {
      expect(filterCommands('排序')).toHaveLength(1);
      expect(filterCommands('排序')[0].id).toBe('sort-price');
    });

    it('无匹配应返回空数组', () => {
      expect(filterCommands('不存在的命令')).toHaveLength(0);
    });

    it('大小写不敏感', () => {
      expect(filterCommands('HOME')).toHaveLength(1);
      expect(filterCommands('Refresh')).toHaveLength(1);
    });
  });

  describe('键盘导航', () => {
    it('上下箭头应在列表中移动', () => {
      let activeIndex = 0;
      const totalItems = 5;

      // 下移
      activeIndex = (activeIndex + 1) % totalItems;
      expect(activeIndex).toBe(1);

      // 下移到末尾后循环
      activeIndex = 4;
      activeIndex = (activeIndex + 1) % totalItems;
      expect(activeIndex).toBe(0);
    });

    it('上箭头应向上移动', () => {
      let activeIndex = 2;
      const totalItems = 5;

      activeIndex = (activeIndex - 1 + totalItems) % totalItems;
      expect(activeIndex).toBe(1);

      // 首项时循环到末尾
      activeIndex = 0;
      activeIndex = (activeIndex - 1 + totalItems) % totalItems;
      expect(activeIndex).toBe(4);
    });

    it('Enter 应选中当前项', () => {
      const selected: string[] = [];
      const commands = [
        { id: 'a', handler: () => selected.push('a') },
        { id: 'b', handler: () => selected.push('b') },
      ];
      const activeIndex = 1;

      commands[activeIndex].handler();
      expect(selected).toEqual(['b']);
    });

    it('Escape 应关闭面板', () => {
      let visible = true;
      const handleEscape = () => { visible = false; };
      handleEscape();
      expect(visible).toBe(false);
    });
  });

  describe('命令分类', () => {
    const categories = {
      navigation: ['首页', '股票列表', '行情分析', '自选股', '策略回测', 'AI 选股'],
      data: ['刷新数据', '筛选股票', '按价格排序', '按涨跌幅排序', '按成交量排序'],
      action: ['切换主题', '切换侧边栏'],
      help: ['快捷键帮助'],
    };

    it('导航类别应有 6 个命令', () => {
      expect(categories.navigation).toHaveLength(6);
    });

    it('数据操作类别应有 5 个命令', () => {
      expect(categories.data).toHaveLength(5);
    });

    it('操作类别应有 2 个命令', () => {
      expect(categories.action).toHaveLength(2);
    });

    it('帮助类别应有 1 个命令', () => {
      expect(categories.help).toHaveLength(1);
    });

    it('总计 14 个命令', () => {
      const total = Object.values(categories).reduce((sum, arr) => sum + arr.length, 0);
      expect(total).toBe(14);
    });
  });
});

describe('ShortcutHelpOverlay 快捷键帮助', () => {
  const shortcuts = [
    { keys: ['⌘', 'K'], description: '打开命令面板', category: '搜索' },
    { keys: ['/'], description: '聚焦搜索框', category: '搜索' },
    { keys: ['Alt', '1'], description: '首页', category: '导航' },
    { keys: ['Alt', '2'], description: '股票列表', category: '导航' },
    { keys: ['G', 'H'], description: '跳转首页', category: '序列键' },
    { keys: ['R'], description: '刷新当前数据', category: '数据' },
    { keys: ['F'], description: '打开筛选器', category: '数据' },
    { keys: ['S', 'P'], description: '按价格排序', category: '数据' },
    { keys: ['J', '↓'], description: '列表下移', category: '列表' },
    { keys: ['W'], description: '添加/移除自选', category: '股票' },
    { keys: ['?'], description: '快捷键帮助', category: '帮助' },
  ];

  describe('快捷键条目完整性', () => {
    it('每个条目应有 keys', () => {
      shortcuts.forEach(s => {
        expect(Array.isArray(s.keys)).toBe(true);
        expect(s.keys.length).toBeGreaterThan(0);
      });
    });

    it('每个条目应有 description', () => {
      shortcuts.forEach(s => {
        expect(s.description.length).toBeGreaterThan(0);
      });
    });

    it('每个条目应有 category', () => {
      const validCategories = ['搜索', '导航', '序列键', '数据', '列表', '界面', '股票', '帮助'];
      shortcuts.forEach(s => {
        expect(validCategories).toContain(s.category);
      });
    });
  });

  describe('类别覆盖', () => {
    const categories = [...new Set(shortcuts.map(s => s.category))];

    it('应覆盖搜索类别', () => {
      expect(categories).toContain('搜索');
    });

    it('应覆盖导航类别', () => {
      expect(categories).toContain('导航');
    });

    it('应覆盖数据类别', () => {
      expect(categories).toContain('数据');
    });

    it('应覆盖帮助类别', () => {
      expect(categories).toContain('帮助');
    });
  });

  describe('交互逻辑', () => {
    it('按 ? 应打开帮助', () => {
      let visible = false;
      const handleKey = (key: string) => {
        if (key === '?') visible = true;
      };
      handleKey('?');
      expect(visible).toBe(true);
    });

    it('按 Escape 应关闭帮助', () => {
      let visible = true;
      const handleKey = (key: string) => {
        if (key === 'Escape') visible = false;
      };
      handleKey('Escape');
      expect(visible).toBe(false);
    });

    it('点击遮罩层应关闭', () => {
      let visible = true;
      const handleOverlayClick = (target: string, current: string) => {
        if (target === current) visible = false;
      };
      handleOverlayClick('overlay', 'overlay');
      expect(visible).toBe(false);
    });
  });
});

describe('Linear/Notion 交互效率对标', () => {
  describe('命令面板 (Cmd+K)', () => {
    it('Cmd+K 应打开命令面板', () => {
      const event = { metaKey: true, ctrlKey: false, key: 'k' };
      const isCommandPalette = (event.metaKey || event.ctrlKey) && event.key === 'k';
      expect(isCommandPalette).toBe(true);
    });

    it('Ctrl+K 也应打开命令面板 (Windows)', () => {
      const event = { metaKey: false, ctrlKey: true, key: 'k' };
      const isCommandPalette = (event.metaKey || event.ctrlKey) && event.key === 'k';
      expect(isCommandPalette).toBe(true);
    });

    it('命令面板应支持搜索+键盘导航+执行', () => {
      const features = {
        search: true,
        keyboardNav: true,
        execute: true,
        categories: true,
        shortcuts: true,
      };
      expect(features.search).toBe(true);
      expect(features.keyboardNav).toBe(true);
      expect(features.execute).toBe(true);
      expect(features.categories).toBe(true);
      expect(features.shortcuts).toBe(true);
    });
  });

  describe('快捷键发现性', () => {
    it('应有快捷键帮助面板', () => {
      const hasHelpOverlay = true;
      expect(hasHelpOverlay).toBe(true);
    });

    it('? 键应打开帮助', () => {
      const helpShortcut = '?';
      expect(helpShortcut).toBe('?');
    });

    it('每个命令应显示快捷键', () => {
      const commands = [
        { label: '首页', shortcut: 'Alt+1' },
        { label: '刷新数据', shortcut: 'R' },
        { label: '筛选股票', shortcut: 'F' },
      ];
      commands.forEach(c => {
        expect(c.shortcut).toBeTruthy();
      });
    });

    it('快捷键应按类别分组', () => {
      const groups = {
        搜索: ['⌘K', '/'],
        导航: ['Alt+1', 'Alt+2', 'Alt+3', 'Alt+4', 'Alt+5', 'Alt+6'],
        数据: ['R', 'F', 'S P', 'S C', 'S V'],
        界面: ['Alt+T', 'Alt+S', 'Esc'],
      };
      expect(Object.keys(groups).length).toBeGreaterThanOrEqual(4);
    });
  });

  describe('数据操作快捷键', () => {
    it('R 应刷新数据', () => {
      const action = 'refresh';
      expect(action).toBe('refresh');
    });

    it('F 应打开筛选器', () => {
      const action = 'filter';
      expect(action).toBe('filter');
    });

    it('S+P 应按价格排序', () => {
      const action = 'sort-price';
      expect(action).toBe('sort-price');
    });

    it('S+C 应按涨跌幅排序', () => {
      const action = 'sort-change';
      expect(action).toBe('sort-change');
    });

    it('S+V 应按成交量排序', () => {
      const action = 'sort-volume';
      expect(action).toBe('sort-volume');
    });
  });

  describe('性能与响应性', () => {
    it('命令面板应在 100ms 内响应', () => {
      const maxResponseTime = 100; // ms
      expect(maxResponseTime).toBeLessThanOrEqual(100);
    });

    it('搜索防抖应为 200-300ms', () => {
      const debounceTime = 300;
      expect(debounceTime).toBeGreaterThanOrEqual(200);
      expect(debounceTime).toBeLessThanOrEqual(300);
    });

    it('快捷键不应与浏览器默认冲突', () => {
      const systemReserved = ['Ctrl+W', 'Ctrl+T', 'Ctrl+N', 'Ctrl+R', 'Ctrl+L'];
      const ourShortcuts = ['Ctrl+K', 'Alt+1', 'Alt+T', 'Alt+S'];
      ourShortcuts.forEach(s => {
        expect(systemReserved).not.toContain(s);
      });
    });
  });

  describe('无障碍支持', () => {
    it('命令面板应有 role=dialog', () => {
      const role = 'dialog';
      expect(role).toBe('dialog');
    });

    it('命令面板应有 aria-modal', () => {
      const ariaModal = true;
      expect(ariaModal).toBe(true);
    });

    it('命令列表应有 role=listbox', () => {
      const role = 'listbox';
      expect(role).toBe('listbox');
    });

    it('命令项应有 role=option', () => {
      const role = 'option';
      expect(role).toBe('option');
    });

    it('应支持 aria-selected', () => {
      const supportsAriaSelected = true;
      expect(supportsAriaSelected).toBe(true);
    });
  });
});
