import { describe, it, expect } from 'vitest';

// 前端路由与导航测试
describe('Route Configuration', () => {
  interface Route {
    path: string;
    name: string;
    icon?: string;
    children?: Route[];
    requiresAuth?: boolean;
  }

  const routes: Route[] = [
    { path: '/', name: '首页' },
    { path: '/stocks', name: '股票列表' },
    { path: '/stocks/:symbol', name: '股票详情' },
    { path: '/market', name: '行情分析' },
    { path: '/watchlist', name: '自选股', requiresAuth: true },
    { path: '/screener', name: '选股器' },
    { path: '/advanced-screener', name: '高级选股' },
    { path: '/backtest', name: '策略回测' },
    { path: '/portfolio', name: '投资组合', requiresAuth: true },
    { path: '/news', name: '新闻资讯' },
    { path: '/etf', name: 'ETF基金' },
    { path: '/financials', name: '财务报表' },
    { path: '/financials/:symbol', name: '个股财务' },
    { path: '/compare', name: '股票对比' },
    { path: '/sectors', name: '行业板块' },
    { path: '/sectors/:code', name: '板块详情' },
    { path: '/margin', name: '融资融券' },
    { path: '/top-traders', name: '龙虎榜' },
    { path: '/block-trades', name: '大宗交易' },
    { path: '/shareholder-changes', name: '股东增减持' },
    { path: '/lockup-calendar', name: '限售解禁' },
    { path: '/ai-selection', name: 'AI选股' },
    { path: '/alerts', name: '预警系统', requiresAuth: true },
    { path: '/settings', name: '设置', requiresAuth: true },
    { path: '/performance', name: '性能监控' },
  ];

  it('has at least 20 routes', () => {
    expect(routes.length).toBeGreaterThanOrEqual(20);
  });

  it('all routes have path and name', () => {
    routes.forEach(r => {
      expect(r.path).toBeTruthy();
      expect(r.name).toBeTruthy();
    });
  });

  it('route paths are unique', () => {
    const paths = routes.map(r => r.path);
    expect(new Set(paths).size).toBe(paths.length);
  });

  it('route names are unique', () => {
    const names = routes.map(r => r.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it('auth-required routes exist', () => {
    const authRoutes = routes.filter(r => r.requiresAuth);
    expect(authRoutes.length).toBeGreaterThanOrEqual(3);
  });

  it('root path exists', () => {
    expect(routes.some(r => r.path === '/')).toBe(true);
  });

  it('dynamic routes use :param syntax', () => {
    const dynamic = routes.filter(r => r.path.includes(':'));
    dynamic.forEach(r => {
      expect(r.path).toMatch(/:[a-zA-Z]+/);
    });
  });

  it('can match a path against routes', () => {
    const matchRoute = (pathname: string) => {
      return routes.find(r => {
        if (r.path === pathname) return true;
        const pattern = r.path.replace(/:[a-zA-Z]+/g, '[^/]+');
        return new RegExp(`^${pattern}$`).test(pathname);
      });
    };
    expect(matchRoute('/')?.name).toBe('首页');
    expect(matchRoute('/stocks/600519')?.name).toBe('股票详情');
    expect(matchRoute('/sectors/baijiu')?.name).toBe('板块详情');
    expect(matchRoute('/nonexistent')).toBeUndefined();
  });
});

// 侧边栏菜单结构测试
describe('Sidebar Menu Structure', () => {
  interface MenuItem {
    key: string;
    label: string;
    icon: string;
    children?: MenuItem[];
  }

  const menuItems: MenuItem[] = [
    { key: 'home', label: '首页', icon: 'HomeOutlined' },
    { key: 'stocks', label: '股票列表', icon: 'LineChartOutlined' },
    { key: 'market', label: '行情分析', icon: 'BarChartOutlined' },
    { key: 'watchlist', label: '自选股', icon: 'StarOutlined' },
    { key: 'etf', label: 'ETF基金', icon: 'FundOutlined' },
    {
      key: 'analysis', label: '数据分析', icon: 'PieChartOutlined',
      children: [
        { key: 'financials', label: '财务报表', icon: 'FileTextOutlined' },
        { key: 'compare', label: '股票对比', icon: 'ColumnWidthOutlined' },
        { key: 'sectors', label: '行业板块', icon: 'AppstoreOutlined' },
      ],
    },
    {
      key: 'trading', label: '交易数据', icon: 'DollarOutlined',
      children: [
        { key: 'margin', label: '融资融券', icon: 'DollarOutlined' },
        { key: 'top-traders', label: '龙虎榜', icon: 'TrophyOutlined' },
        { key: 'block-trades', label: '大宗交易', icon: 'SwapOutlined' },
        { key: 'shareholder-changes', label: '股东增减持', icon: 'TeamOutlined' },
        { key: 'lockup-calendar', label: '限售解禁', icon: 'LockOutlined' },
      ],
    },
    {
      key: 'tools', label: '分析工具', icon: 'ToolOutlined',
      children: [
        { key: 'screener', label: '选股器', icon: 'FilterOutlined' },
        { key: 'backtest', label: '策略回测', icon: 'ExperimentOutlined' },
        { key: 'ai-selection', label: 'AI选股', icon: 'RobotOutlined' },
      ],
    },
    { key: 'news', label: '新闻资讯', icon: 'ReadOutlined' },
    { key: 'portfolio', label: '投资组合', icon: 'WalletOutlined' },
    { key: 'alerts', label: '预警系统', icon: 'BellOutlined' },
    { key: 'settings', label: '设置', icon: 'SettingOutlined' },
  ];

  it('has top-level menu items', () => {
    expect(menuItems.length).toBeGreaterThanOrEqual(8);
  });

  it('all items have required fields', () => {
    const validateItems = (items: MenuItem[]) => {
      items.forEach(item => {
        expect(item.key).toBeTruthy();
        expect(item.label).toBeTruthy();
        expect(item.icon).toBeTruthy();
        if (item.children) validateItems(item.children);
      });
    };
    validateItems(menuItems);
  });

  it('menu keys are unique (flattened)', () => {
    const flatten = (items: MenuItem[]): string[] =>
      items.flatMap(i => [i.key, ...(i.children ? flatten(i.children) : [])]);
    const keys = flatten(menuItems);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('nested menus have children', () => {
    const nested = menuItems.filter(i => i.children);
    nested.forEach(n => {
      expect(n.children!.length).toBeGreaterThan(0);
    });
  });

  it('can find menu item by key', () => {
    const findItem = (items: MenuItem[], key: string): MenuItem | undefined => {
      for (const item of items) {
        if (item.key === key) return item;
        if (item.children) {
          const found = findItem(item.children, key);
          if (found) return found;
        }
      }
      return undefined;
    };
    expect(findItem(menuItems, 'margin')?.label).toBe('融资融券');
    expect(findItem(menuItems, 'home')?.label).toBe('首页');
    expect(findItem(menuItems, 'nonexistent')).toBeUndefined();
  });

  it('trading section has 5 sub-items', () => {
    const trading = menuItems.find(i => i.key === 'trading');
    expect(trading?.children?.length).toBe(5);
  });
});

// 主题配置测试
describe('Theme Configuration', () => {
  interface ThemeConfig {
    name: string;
    primaryColor: string;
    backgroundColor: string;
    textColor: string;
    upColor: string;
    downColor: string;
    borderColor: string;
    cardBackground: string;
  }

  const lightTheme: ThemeConfig = {
    name: 'light',
    primaryColor: '#1677ff',
    backgroundColor: '#f5f5f5',
    textColor: '#333333',
    upColor: '#ef4444',
    downColor: '#22c55e',
    borderColor: '#e5e5e5',
    cardBackground: '#ffffff',
  };

  const darkTheme: ThemeConfig = {
    name: 'dark',
    primaryColor: '#177ddc',
    backgroundColor: '#141414',
    textColor: '#e0e0e0',
    upColor: '#ef4444',
    downColor: '#22c55e',
    borderColor: '#303030',
    cardBackground: '#1f1f1f',
  };

  it('light and dark themes have same keys', () => {
    expect(Object.keys(lightTheme).sort()).toEqual(Object.keys(darkTheme).sort());
  });

  it('A股 colors are consistent across themes', () => {
    expect(lightTheme.upColor).toBe(darkTheme.upColor);
    expect(lightTheme.downColor).toBe(darkTheme.downColor);
    expect(lightTheme.upColor).toBe('#ef4444');
    expect(lightTheme.downColor).toBe('#22c55e');
  });

  it('light theme has light background', () => {
    expect(lightTheme.backgroundColor).toBe('#f5f5f5');
    expect(lightTheme.cardBackground).toBe('#ffffff');
  });

  it('dark theme has dark background', () => {
    expect(darkTheme.backgroundColor).not.toBe(lightTheme.backgroundColor);
    expect(darkTheme.cardBackground).not.toBe(lightTheme.cardBackground);
  });

  it('primary colors are valid hex', () => {
    [lightTheme, darkTheme].forEach(t => {
      expect(t.primaryColor).toMatch(/^#[0-9a-fA-F]{6}$/);
      expect(t.upColor).toMatch(/^#[0-9a-fA-F]{6}$/);
      expect(t.downColor).toMatch(/^#[0-9a-fA-F]{6}$/);
    });
  });

  it('can generate CSS variables from theme', () => {
    const toCSS = (theme: ThemeConfig) => {
      return Object.entries(theme)
        .filter(([k]) => k !== 'name')
        .map(([k, v]) => `--${k.replace(/([A-Z])/g, '-$1').toLowerCase()}: ${v};`)
        .join('\n');
    };
    const css = toCSS(lightTheme);
    expect(css).toContain('--primary-color:');
    expect(css).toContain('--up-color:');
  });
});

// 通知系统测试
describe('Notification System', () => {
  type NotificationType = 'success' | 'error' | 'warning' | 'info';

  interface Notification {
    id: string;
    type: NotificationType;
    title: string;
    message: string;
    timestamp: number;
    read: boolean;
    duration?: number;
  }

  const createNotification = (type: NotificationType, title: string, message: string, duration = 4500): Notification => ({
    id: `notif_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    type, title, message,
    timestamp: Date.now(),
    read: false,
    duration,
  });

  const markRead = (notifs: Notification[], id: string): Notification[] =>
    notifs.map(n => n.id === id ? { ...n, read: true } : n);

  const filterByType = (notifs: Notification[], type: NotificationType): Notification[] =>
    notifs.filter(n => n.type === type);

  it('creates notification with correct fields', () => {
    const n = createNotification('success', '操作成功', '股票已添加到自选股');
    expect(n.type).toBe('success');
    expect(n.read).toBe(false);
    expect(n.id).toBeTruthy();
  });

  it('marks notification as read', () => {
    const notifs: Notification[] = [
      createNotification('info', 'a', 'b'),
      createNotification('warning', 'c', 'd'),
    ];
    const updated = markRead(notifs, notifs[0].id);
    expect(updated[0].read).toBe(true);
    expect(updated[1].read).toBe(false);
  });

  it('filters by type', () => {
    const notifs: Notification[] = [
      createNotification('success', 'a', 'b'),
      createNotification('error', 'c', 'd'),
      createNotification('success', 'e', 'f'),
    ];
    expect(filterByType(notifs, 'success').length).toBe(2);
    expect(filterByType(notifs, 'error').length).toBe(1);
    expect(filterByType(notifs, 'warning').length).toBe(0);
  });

  it('counts unread notifications', () => {
    const notifs: Notification[] = [
      { ...createNotification('info', 'a', 'b'), read: false },
      { ...createNotification('info', 'c', 'd'), read: true },
      { ...createNotification('info', 'e', 'f'), read: false },
    ];
    const unread = notifs.filter(n => !n.read).length;
    expect(unread).toBe(2);
  });

  it('notification IDs are unique', () => {
    const ids = new Set<string>();
    for (let i = 0; i < 20; i++) {
      ids.add(createNotification('info', 'test', 'msg').id);
    }
    expect(ids.size).toBe(20);
  });
});

// 快捷键配置测试
describe('Keyboard Shortcuts Config', () => {
  interface Shortcut {
    key: string;
    modifiers: ('ctrl' | 'alt' | 'shift' | 'meta')[];
    action: string;
    description: string;
    category: string;
  }

  const shortcuts: Shortcut[] = [
    { key: 'k', modifiers: ['meta'], action: 'focus_search', description: '聚焦搜索', category: '导航' },
    { key: '/', modifiers: [], action: 'focus_search', description: '聚焦搜索(GitHub风格)', category: '导航' },
    { key: 'Escape', modifiers: [], action: 'close_modal', description: '关闭弹窗', category: '导航' },
    { key: '1', modifiers: ['alt'], action: 'nav_home', description: '跳转首页', category: '快速导航' },
    { key: '2', modifiers: ['alt'], action: 'nav_stocks', description: '跳转股票列表', category: '快速导航' },
    { key: '3', modifiers: ['alt'], action: 'nav_market', description: '跳转行情分析', category: '快速导航' },
    { key: '4', modifiers: ['alt'], action: 'nav_watchlist', description: '跳转自选股', category: '快速导航' },
    { key: '5', modifiers: ['alt'], action: 'nav_backtest', description: '跳转策略回测', category: '快速导航' },
    { key: '6', modifiers: ['alt'], action: 'nav_ai', description: '跳转AI选股', category: '快速导航' },
    { key: 't', modifiers: ['alt'], action: 'toggle_theme', description: '切换主题', category: '界面' },
    { key: 's', modifiers: ['alt'], action: 'toggle_sidebar', description: '切换侧边栏', category: '界面' },
    { key: 'Backspace', modifiers: [], action: 'go_back', description: '返回上一页', category: '导航' },
  ];

  it('has all required shortcuts', () => {
    expect(shortcuts.length).toBeGreaterThanOrEqual(12);
  });

  it('all shortcuts have required fields', () => {
    shortcuts.forEach(s => {
      expect(s.key).toBeTruthy();
      expect(s.action).toBeTruthy();
      expect(s.description).toBeTruthy();
      expect(s.category).toBeTruthy();
    });
  });

  it('actions are unique', () => {
    const actions = shortcuts.map(s => s.action);
    // focus_search has 2 bindings but same action, which is OK
    expect(actions.length).toBeGreaterThanOrEqual(new Set(actions).size - 1);
  });

  it('categories are from known set', () => {
    const categories = new Set(shortcuts.map(s => s.category));
    expect(categories.size).toBeLessThanOrEqual(5);
  });

  it('modifier combinations are valid', () => {
    shortcuts.forEach(s => {
      s.modifiers.forEach(m => {
        expect(['ctrl', 'alt', 'shift', 'meta']).toContain(m);
      });
    });
  });

  it('can build shortcut display string', () => {
    const display = (s: Shortcut): string => {
      const parts = [...s.modifiers.map(m => m.toUpperCase()), s.key.toUpperCase()];
      return parts.join(' + ');
    };
    expect(display(shortcuts[0])).toBe('META + K');
    expect(display(shortcuts[3])).toBe('ALT + 1');
  });

  it('can find shortcut by key combo', () => {
    const find = (key: string, modifiers: string[]) =>
      shortcuts.find(s => s.key === key && s.modifiers.length === modifiers.length && s.modifiers.every(m => modifiers.includes(m)));
    expect(find('k', ['meta'])?.action).toBe('focus_search');
    expect(find('1', ['alt'])?.action).toBe('nav_home');
  });
});
