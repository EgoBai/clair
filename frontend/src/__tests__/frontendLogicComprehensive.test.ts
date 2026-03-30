import { describe, it, expect } from 'vitest';

// ===== 前端状态管理 =====
describe('Frontend State Management', () => {
  interface AppState {
    theme: 'light' | 'dark';
    locale: 'zh-CN' | 'en-US';
    watchlist: string[];
    sidebarCollapsed: boolean;
    klinePeriod: '5m' | '15m' | '60m' | 'day' | 'week' | 'month';
    showVolume: boolean;
  }

  const initialState: AppState = {
    theme: 'light',
    locale: 'zh-CN',
    watchlist: [],
    sidebarCollapsed: false,
    klinePeriod: 'day',
    showVolume: true,
  };

  type Action =
    | { type: 'SET_THEME'; payload: 'light' | 'dark' }
    | { type: 'SET_LOCALE'; payload: 'zh-CN' | 'en-US' }
    | { type: 'ADD_TO_WATCHLIST'; payload: string }
    | { type: 'REMOVE_FROM_WATCHLIST'; payload: string }
    | { type: 'TOGGLE_SIDEBAR' }
    | { type: 'SET_KLINE_PERIOD'; payload: AppState['klinePeriod'] }
    | { type: 'TOGGLE_VOLUME' }
    | { type: 'RESET' };

  const reducer = (state: AppState, action: Action): AppState => {
    switch (action.type) {
      case 'SET_THEME': return { ...state, theme: action.payload };
      case 'SET_LOCALE': return { ...state, locale: action.payload };
      case 'ADD_TO_WATCHLIST':
        if (state.watchlist.includes(action.payload)) return state;
        return { ...state, watchlist: [...state.watchlist, action.payload] };
      case 'REMOVE_FROM_WATCHLIST':
        return { ...state, watchlist: state.watchlist.filter(s => s !== action.payload) };
      case 'TOGGLE_SIDEBAR': return { ...state, sidebarCollapsed: !state.sidebarCollapsed };
      case 'SET_KLINE_PERIOD': return { ...state, klinePeriod: action.payload };
      case 'TOGGLE_VOLUME': return { ...state, showVolume: !state.showVolume };
      case 'RESET': return initialState;
      default: return state;
    }
  };

  it('应该设置主题', () => {
    const state = reducer(initialState, { type: 'SET_THEME', payload: 'dark' });
    expect(state.theme).toBe('dark');
  });

  it('应该设置语言', () => {
    const state = reducer(initialState, { type: 'SET_LOCALE', payload: 'en-US' });
    expect(state.locale).toBe('en-US');
  });

  it('应该添加自选股', () => {
    const state = reducer(initialState, { type: 'ADD_TO_WATCHLIST', payload: '600519' });
    expect(state.watchlist).toContain('600519');
    expect(state.watchlist).toHaveLength(1);
  });

  it('不应该重复添加自选股', () => {
    let state = reducer(initialState, { type: 'ADD_TO_WATCHLIST', payload: '600519' });
    state = reducer(state, { type: 'ADD_TO_WATCHLIST', payload: '600519' });
    expect(state.watchlist).toHaveLength(1);
  });

  it('应该删除自选股', () => {
    let state = reducer(initialState, { type: 'ADD_TO_WATCHLIST', payload: '600519' });
    state = reducer(state, { type: 'ADD_TO_WATCHLIST', payload: '000858' });
    state = reducer(state, { type: 'REMOVE_FROM_WATCHLIST', payload: '600519' });
    expect(state.watchlist).not.toContain('600519');
    expect(state.watchlist).toContain('000858');
  });

  it('应该切换侧边栏', () => {
    const state1 = reducer(initialState, { type: 'TOGGLE_SIDEBAR' });
    expect(state1.sidebarCollapsed).toBe(true);
    const state2 = reducer(state1, { type: 'TOGGLE_SIDEBAR' });
    expect(state2.sidebarCollapsed).toBe(false);
  });

  it('应该设置K线周期', () => {
    const state = reducer(initialState, { type: 'SET_KLINE_PERIOD', payload: '60m' });
    expect(state.klinePeriod).toBe('60m');
  });

  it('应该切换成交量显示', () => {
    const state = reducer(initialState, { type: 'TOGGLE_VOLUME' });
    expect(state.showVolume).toBe(false);
  });

  it('应该重置状态', () => {
    let state = reducer(initialState, { type: 'SET_THEME', payload: 'dark' });
    state = reducer(state, { type: 'ADD_TO_WATCHLIST', payload: '600519' });
    state = reducer(state, { type: 'RESET' });
    expect(state).toEqual(initialState);
  });

  it('应该保持不可变性', () => {
    const state = reducer(initialState, { type: 'ADD_TO_WATCHLIST', payload: '600519' });
    expect(state).not.toBe(initialState);
    expect(initialState.watchlist).toHaveLength(0);
  });
});

// ===== URL参数同步 =====
describe('URL Parameter Sync', () => {
  const stateToParams = (state: Record<string, any>): URLSearchParams => {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(state)) {
      if (value !== undefined && value !== null && value !== '') {
        params.set(key, String(value));
      }
    }
    return params;
  };

  const paramsToState = (params: URLSearchParams, defaults: Record<string, any>): Record<string, any> => {
    const state: Record<string, any> = { ...defaults };
    for (const [key, value] of params.entries()) {
      if (key in defaults) {
        if (typeof defaults[key] === 'number') state[key] = Number(value);
        else if (typeof defaults[key] === 'boolean') state[key] = value === 'true';
        else state[key] = value;
      }
    }
    return state;
  };

  it('应该将状态转为URL参数', () => {
    const params = stateToParams({ page: 1, q: '茅台', sort: 'price' });
    expect(params.get('page')).toBe('1');
    expect(params.get('q')).toBe('茅台');
    expect(params.get('sort')).toBe('price');
  });

  it('应该忽略空值', () => {
    const params = stateToParams({ page: 1, q: '', sort: null, extra: undefined });
    expect(params.has('q')).toBe(false);
    expect(params.has('sort')).toBe(false);
    expect(params.has('extra')).toBe(false);
  });

  it('应该从URL参数恢复状态', () => {
    const params = new URLSearchParams('page=2&q=茅台&sort=volume');
    const defaults = { page: 1, q: '', sort: 'price', market: 'all' };
    const state = paramsToState(params, defaults);
    expect(state.page).toBe(2);
    expect(state.q).toBe('茅台');
    expect(state.sort).toBe('volume');
    expect(state.market).toBe('all'); // 使用默认值
  });

  it('应该处理类型转换', () => {
    const params = new URLSearchParams('count=100&enabled=true&ratio=3.14');
    const defaults = { count: 0, enabled: false, ratio: 0 };
    const state = paramsToState(params, defaults);
    expect(state.count).toBe(100);
    expect(state.enabled).toBe(true);
    expect(state.ratio).toBeCloseTo(3.14);
  });

  it('应该处理往返转换', () => {
    const original = { page: 3, q: 'test', sort: 'change', market: 'SH' };
    const params = stateToParams(original);
    const defaults = { page: 1, q: '', sort: 'price', market: 'all' };
    const restored = paramsToState(params, defaults);
    expect(restored.page).toBe(original.page);
    expect(restored.q).toBe(original.q);
    expect(restored.sort).toBe(original.sort);
    expect(restored.market).toBe(original.market);
  });
});

// ===== 表格排序和筛选 =====
describe('Table Sort and Filter', () => {
  interface Row {
    code: string;
    name: string;
    price: number;
    change: number;
    volume: number;
    pe: number;
    industry: string;
  }

  const data: Row[] = [
    { code: '600519', name: '贵州茅台', price: 1800, change: 2.5, volume: 5e6, pe: 35, industry: '白酒' },
    { code: '000858', name: '五粮液', price: 150, change: -1.2, volume: 8e6, pe: 25, industry: '白酒' },
    { code: '002415', name: '海康威视', price: 35, change: 3.8, volume: 1.2e7, pe: 20, industry: '安防' },
    { code: '300750', name: '宁德时代', price: 200, change: -0.5, volume: 6e6, pe: 50, industry: '新能源' },
    { code: '601398', name: '工商银行', price: 5.5, change: 0.3, volume: 2e7, pe: 5, industry: '银行' },
  ];

  const sortData = <T>(arr: T[], key: keyof T, order: 'asc' | 'desc'): T[] => {
    return [...arr].sort((a, b) => {
      const va = a[key], vb = b[key];
      const cmp = typeof va === 'string' ? (va as string).localeCompare(vb as string) : (va as number) - (vb as number);
      return order === 'asc' ? cmp : -cmp;
    });
  };

  const filterData = (arr: Row[], filters: Partial<Record<keyof Row, (v: any) => boolean>>): Row[] => {
    return arr.filter(row => {
      for (const [key, fn] of Object.entries(filters)) {
        if (fn && !fn(row[key as keyof Row])) return false;
      }
      return true;
    });
  };

  const searchData = (arr: Row[], query: string): Row[] => {
    const q = query.toLowerCase();
    return arr.filter(row => row.name.toLowerCase().includes(q) || row.code.includes(q));
  };

  it('应该按价格降序排列', () => {
    const sorted = sortData(data, 'price', 'desc');
    expect(sorted[0].price).toBe(1800);
    expect(sorted[sorted.length - 1].price).toBe(5.5);
  });

  it('应该按涨跌幅升序排列', () => {
    const sorted = sortData(data, 'change', 'asc');
    expect(sorted[0].change).toBe(-1.2);
  });

  it('应该按名称排序', () => {
    const sorted = sortData(data, 'name', 'asc');
    expect(sorted[0].name).toBe('五粮液');
  });

  it('应该按行业筛选', () => {
    const filtered = filterData(data, { industry: (v: string) => v === '白酒' });
    expect(filtered).toHaveLength(2);
    expect(filtered.every(r => r.industry === '白酒')).toBe(true);
  });

  it('应该按PE范围筛选', () => {
    const filtered = filterData(data, { pe: (v: number) => v < 30 });
    expect(filtered.every(r => r.pe < 30)).toBe(true);
  });

  it('应该按代码搜索', () => {
    const results = searchData(data, '600519');
    expect(results).toHaveLength(1);
    expect(results[0].name).toBe('贵州茅台');
  });

  it('应该按名称搜索', () => {
    const results = searchData(data, '茅台');
    expect(results).toHaveLength(1);
  });

  it('应该支持模糊搜索', () => {
    const results = searchData(data, '宁');
    expect(results.length).toBeGreaterThanOrEqual(1);
  });

  it('应该处理空搜索', () => {
    const results = searchData(data, '');
    expect(results).toHaveLength(data.length);
  });

  it('应该处理无结果搜索', () => {
    const results = searchData(data, '不存在的股票');
    expect(results).toHaveLength(0);
  });

  it('应该组合排序和筛选', () => {
    const filtered = filterData(data, { industry: (v: string) => v === '白酒' });
    const sorted = sortData(filtered, 'price', 'desc');
    expect(sorted).toHaveLength(2);
    expect(sorted[0].price).toBeGreaterThan(sorted[1].price);
  });
});

// ===== 搜索高亮 =====
describe('Search Highlight Logic', () => {
  const highlight = (text: string, query: string): string => {
    if (!query) return text;
    const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return text.replace(new RegExp(escaped, 'gi'), match => `<mark>${match}</mark>`);
  };

  const truncateHighlight = (text: string, query: string, maxLength: number): string => {
    if (!query || text.length <= maxLength) return text;
    const idx = text.toLowerCase().indexOf(query.toLowerCase());
    if (idx === -1) return text.substring(0, maxLength) + '...';
    const start = Math.max(0, idx - Math.floor((maxLength - query.length) / 2));
    const end = Math.min(text.length, start + maxLength);
    const truncated = (start > 0 ? '...' : '') + text.substring(start, end) + (end < text.length ? '...' : '');
    return highlight(truncated, query);
  };

  it('应该高亮匹配文本', () => {
    expect(highlight('贵州茅台酒', '茅台')).toBe('贵州<mark>茅台</mark>酒');
  });

  it('应该高亮多个匹配', () => {
    expect(highlight('银行银行银行', '银行')).toBe('<mark>银行</mark><mark>银行</mark><mark>银行</mark>');
  });

  it('应该不区分大小写', () => {
    expect(highlight('ABC abc', 'abc')).toBe('<mark>ABC</mark> <mark>abc</mark>');
  });

  it('应该处理空查询', () => {
    expect(highlight('test', '')).toBe('test');
  });

  it('应该处理无匹配', () => {
    expect(highlight('hello world', 'xyz')).toBe('hello world');
  });

  it('应该转义正则特殊字符', () => {
    expect(highlight('a+*b', '+*')).toBe('a<mark>+*</mark>b');
  });

  it('应该截断并高亮长文本', () => {
    const longText = '这是一个非常长的股票名称描述文本包含茅台关键词在中间';
    const result = truncateHighlight(longText, '茅台', 15);
    expect(result).toContain('<mark>茅台</mark>');
    expect(result.length).toBeLessThanOrEqual(40); // 截断+标记+省略号
  });

  it('应该截断无匹配的长文本', () => {
    const longText = 'a'.repeat(100);
    expect(truncateHighlight(longText, 'xyz', 20)).toContain('...');
  });
});

// ===== 相对时间格式化 =====
describe('Relative Time Formatting', () => {
  const formatRelativeTime = (timestamp: number, now: number = Date.now()): string => {
    const diff = now - timestamp;
    const seconds = Math.floor(diff / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);
    const months = Math.floor(days / 30);
    const years = Math.floor(days / 365);

    if (seconds < 60) return '刚刚';
    if (minutes < 60) return `${minutes}分钟前`;
    if (hours < 24) return `${hours}小时前`;
    if (days < 30) return `${days}天前`;
    if (months < 12) return `${months}个月前`;
    return `${years}年前`;
  };

  const now = 1711296000000; // 2024-03-24 12:00:00 UTC

  it('应该显示刚刚', () => {
    expect(formatRelativeTime(now - 30000, now)).toBe('刚刚');
    expect(formatRelativeTime(now - 59000, now)).toBe('刚刚');
  });

  it('应该显示分钟', () => {
    expect(formatRelativeTime(now - 60000, now)).toBe('1分钟前');
    expect(formatRelativeTime(now - 5 * 60000, now)).toBe('5分钟前');
    expect(formatRelativeTime(now - 59 * 60000, now)).toBe('59分钟前');
  });

  it('应该显示小时', () => {
    expect(formatRelativeTime(now - 3600000, now)).toBe('1小时前');
    expect(formatRelativeTime(now - 23 * 3600000, now)).toBe('23小时前');
  });

  it('应该显示天', () => {
    expect(formatRelativeTime(now - 86400000, now)).toBe('1天前');
    expect(formatRelativeTime(now - 29 * 86400000, now)).toBe('29天前');
  });

  it('应该显示月', () => {
    expect(formatRelativeTime(now - 30 * 86400000, now)).toBe('1个月前');
    expect(formatRelativeTime(now - 11 * 30 * 86400000, now)).toBe('11个月前');
  });

  it('应该显示年', () => {
    expect(formatRelativeTime(now - 365 * 86400000, now)).toBe('1年前');
    expect(formatRelativeTime(now - 3 * 365 * 86400000, now)).toBe('3年前');
  });

  it('应该处理边界值', () => {
    expect(formatRelativeTime(now - 0, now)).toBe('刚刚');
    expect(formatRelativeTime(now - 60000, now)).toBe('1分钟前');
  });
});

// ===== 数字格式化 =====
describe('Number Formatting', () => {
  const formatLargeNumber = (num: number, lang: 'zh' | 'en' = 'zh'): string => {
    if (lang === 'zh') {
      if (Math.abs(num) >= 1e12) return (num / 1e12).toFixed(2) + '万亿';
      if (Math.abs(num) >= 1e8) return (num / 1e8).toFixed(2) + '亿';
      if (Math.abs(num) >= 1e4) return (num / 1e4).toFixed(2) + '万';
      return num.toFixed(2);
    } else {
      if (Math.abs(num) >= 1e12) return (num / 1e12).toFixed(2) + 'T';
      if (Math.abs(num) >= 1e9) return (num / 1e9).toFixed(2) + 'B';
      if (Math.abs(num) >= 1e6) return (num / 1e6).toFixed(2) + 'M';
      if (Math.abs(num) >= 1e3) return (num / 1e3).toFixed(2) + 'K';
      return num.toFixed(2);
    }
  };

  const formatPercent = (num: number, showSign: boolean = true): string => {
    const sign = num > 0 && showSign ? '+' : '';
    return sign + num.toFixed(2) + '%';
  };

  const formatCurrency = (num: number, currency: 'CNY' | 'USD' = 'CNY'): string => {
    if (currency === 'CNY') return '¥' + num.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    return '$' + num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  it('应该格式化万亿数字(中文)', () => {
    expect(formatLargeNumber(2.5e12, 'zh')).toBe('2.50万亿');
  });

  it('应该格式化亿数字(中文)', () => {
    expect(formatLargeNumber(5e10, 'zh')).toBe('500.00亿');
  });

  it('应该格式化万数字(中文)', () => {
    expect(formatLargeNumber(5e4, 'zh')).toBe('5.00万');
  });

  it('应该格式化T数字(英文)', () => {
    expect(formatLargeNumber(2.5e12, 'en')).toBe('2.50T');
  });

  it('应该格式化B数字(英文)', () => {
    expect(formatLargeNumber(5e9, 'en')).toBe('5.00B');
  });

  it('应该格式化M数字(英文)', () => {
    expect(formatLargeNumber(5e6, 'en')).toBe('5.00M');
  });

  it('应该格式化正百分比', () => {
    expect(formatPercent(2.5)).toBe('+2.50%');
  });

  it('应该格式化负百分比', () => {
    expect(formatPercent(-1.2)).toBe('-1.20%');
  });

  it('应该格式化人民币', () => {
    expect(formatCurrency(1234.5)).toContain('1,234.50');
    expect(formatCurrency(1234.5)).toContain('¥');
  });

  it('应该格式化美元', () => {
    expect(formatCurrency(1234.5, 'USD')).toContain('$');
  });
});

// ===== 路由匹配 =====
describe('Route Matching', () => {
  interface Route {
    path: string;
    exact?: boolean;
    params?: string[];
  }

  const matchRoute = (pathname: string, routes: Route[]): { route: Route; params: Record<string, string> } | null => {
    for (const route of routes) {
      const pattern = route.path.replace(/:(\w+)/g, '([^/]+)');
      const regex = new RegExp(`^${pattern}${route.exact ? '$' : ''}`);
      const match = pathname.match(regex);
      if (match) {
        const params: Record<string, string> = {};
        const paramNames = [...route.path.matchAll(/:(\w+)/g)].map(m => m[1]);
        paramNames.forEach((name, i) => { params[name] = match[i + 1]; });
        return { route, params };
      }
    }
    return null;
  };

  const routes: Route[] = [
    { path: '/', exact: true },
    { path: '/stocks', exact: true },
    { path: '/stocks/:symbol', exact: true },
    { path: '/sectors/:code', exact: true },
  ];

  it('应该匹配根路径', () => {
    const result = matchRoute('/', routes);
    expect(result).not.toBeNull();
    expect(result!.route.path).toBe('/');
  });

  it('应该匹配静态路径', () => {
    const result = matchRoute('/stocks', routes);
    expect(result).not.toBeNull();
  });

  it('应该匹配动态路径并提取参数', () => {
    const result = matchRoute('/stocks/600519', routes);
    expect(result).not.toBeNull();
    expect(result!.params.symbol).toBe('600519');
  });

  it('应该返回null当无匹配', () => {
    expect(matchRoute('/unknown', routes)).toBeNull();
  });

  it('不应该部分匹配', () => {
    expect(matchRoute('/stocks/600519/details', routes)).toBeNull();
  });

  it('应该处理多个动态参数', () => {
    const result = matchRoute('/sectors/BK0437', routes);
    expect(result).not.toBeNull();
    expect(result!.params.code).toBe('BK0437');
  });
});

// ===== 面包屑导航 =====
describe('Breadcrumb Navigation', () => {
  const generateBreadcrumbs = (pathname: string, labels: Record<string, string>): { path: string; label: string }[] => {
    const crumbs = [{ path: '/', label: '首页' }];
    const segments = pathname.split('/').filter(Boolean);
    let currentPath = '';
    
    for (const segment of segments) {
      currentPath += '/' + segment;
      crumbs.push({
        path: currentPath,
        label: labels[segment] || labels[currentPath] || segment,
      });
    }
    return crumbs;
  };

  const labels: Record<string, string> = {
    'stocks': '股票',
    'sectors': '行业',
    '600519': '贵州茅台',
    'BK0437': '白酒行业',
  };

  it('应该生成首页面包屑', () => {
    const crumbs = generateBreadcrumbs('/', labels);
    expect(crumbs).toHaveLength(1);
    expect(crumbs[0].label).toBe('首页');
  });

  it('应该生成嵌套面包屑', () => {
    const crumbs = generateBreadcrumbs('/stocks/600519', labels);
    expect(crumbs).toHaveLength(3);
    expect(crumbs[0].label).toBe('首页');
    expect(crumbs[1].label).toBe('股票');
    expect(crumbs[2].label).toBe('贵州茅台');
  });

  it('应该用路径段作为未知标签', () => {
    const crumbs = generateBreadcrumbs('/unknown/path', labels);
    expect(crumbs[1].label).toBe('unknown');
  });

  it('应该维护正确路径', () => {
    const crumbs = generateBreadcrumbs('/sectors/BK0437', labels);
    expect(crumbs[1].path).toBe('/sectors');
    expect(crumbs[2].path).toBe('/sectors/BK0437');
  });
});
