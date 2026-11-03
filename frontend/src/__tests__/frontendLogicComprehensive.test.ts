/**
 * 批次16 迁移：frontendLogicComprehensive.test.ts
 *
 * 迁移原则：删除测试内联的生产逻辑副本，改为 import 生产实现；旧断言与生产冲突时以生产为准。
 *
 * 已迁移符号 → 生产文件（行号）
 * - 主题 / K线周期 / 成交量 / 侧边栏 → src/store/useAppStore.ts:156-172
 *   （preferences / setTheme / setKlinePeriod / toggleVolume / toggleSidebar）
 * - 语言 → src/i18n/i18nManager.ts:29,42-51（I18nManager 默认 zh-CN / setLocale / getLocale）
 * - 自选股 string[] → src/store/useStockStore.ts:170,331-353
 *   （watchlist / addToWatchlist / removeFromWatchlist / toggleWatchlist / clearWatchlist）
 * - 重置 → src/store/useStockStore.ts:465-474（reset；useAppStore 未提供 reset）
 * - URL 参数 → src/store/useAppStore.ts:175-212（urlState / syncFromURL / toURLParams）
 * - 排序 / 过滤 → src/utils/exportEngine.ts:316-356（filterData / sortData）
 * - 搜索 → src/store/useStockStore.ts:398-405（searchStocks，按 symbol/name 不区分大小写）
 * - 相对时间 → src/utils/formatters.ts:266-275（formatRelativeTime；formatDate:70）
 * - 大数字 → src/utils/enhancedFormatters.ts:138-176（formatLargeNumber）
 * - 涨跌幅 → src/utils/formatters.ts:148-152（formatChangePercent）
 * - 货币 → src/utils/formatters.ts:99-108（formatCurrency）
 * - 路由 → src/routes/paths.ts:11-54（ROUTE_PATHS）+ react-router-dom matchPath
 *   （生产路由由 routes/index.tsx 的 <Route> 声明，没有自写 matchRoute）
 *
 * 旧断言错在哪（旧值 → 生产值）
 * | 旧断言 | 生产行为 | 证据 |
 * | --- | --- | --- |
 * | 初始主题 'light' | 'dark' | useAppStore.ts:157 |
 * | URL 中 page=1 写入 'page=1' | 默认值省略，不写 page | useAppStore.ts:204 |
 * | URL 键名 'sort' | 'sortBy' / 'sortOrder' | useAppStore.ts:206-207 |
 * | 布尔类型转换 | URLState 无布尔字段，只做 parseInt | useAppStore.ts:186-196 |
 * | 60 秒 → '1分钟前' | '刚刚'（小于 5 分钟阈值） | formatters.ts:271 |
 * | 1 天/29 天 → '1天前'/'29天前' | '2024-03-14'/'2024-02-15'（完整日期） | formatters.ts:274 |
 * | 1 个月/11 个月/1 年/3 年 → 'n个月前'/'n年前' | 完整日期 'yyyy-MM-dd' | formatters.ts:274 |
 * | 0% → '0.00%' | '+0.00%'（>=0 加正号） | formatters.ts:150 |
 * | 美元 '$1,234.50' | 'US$1,234.50'（zh-CN Intl） | formatters.ts:99-107 |
 * | /sectors 动态参数名 code | 生产路由参数名 symbol | routes/paths.ts:49 |
 *
 * 保留内联（生产无对应导出，未迁移）
 * - highlight / truncateHighlight：生产仅 src/components/Common/SearchHighlight.tsx:16-72
 *   在 React 组件内实现，未导出纯函数；truncateHighlight 生产无对应。
 * - generateBreadcrumbs：生产各页面内联 antd Breadcrumb items
 *   （如 src/pages/StockDetailPage.tsx:306-313），无导出生成函数。
 *
 * 注意：formatters.formatPercent 的入参是小数（0.025 → '2.50%'），与旧测试的“百分数入参”口径不同；
 * 旧测试语义对应生产 formatters.formatChangePercent（入参为百分数，带正负号）。
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { matchPath } from 'react-router-dom';
import { useAppStore } from '../store/useAppStore';
import { useStockStore, type Stock } from '../store/useStockStore';
import { I18nManager } from '../i18n/i18nManager';
import { filterData, sortData } from '../utils/exportEngine';
import { formatChangePercent, formatCurrency, formatRelativeTime } from '../utils/formatters';
import { formatLargeNumber } from '../utils/enhancedFormatters';
import { ROUTE_PATHS } from '../routes/paths';

// Node 25 自带的实验性 localStorage 是一个空对象（会先于 jsdom 的 Storage 暴露到 globalThis），
// 导致 zustand persist 的 storage.setItem 不存在。这里在 store 模块加载前装一个最小 Storage。
vi.hoisted(() => {
  const store = new Map<string, string>();
  const storageMock = {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => { store.set(key, String(value)); },
    removeItem: (key: string) => { store.delete(key); },
    clear: () => { store.clear(); },
    key: (index: number) => Array.from(store.keys())[index] ?? null,
    get length() { return store.size; },
  };
  Object.defineProperty(globalThis, 'localStorage', {
    value: storageMock, configurable: true, writable: true,
  });
  if (typeof window !== 'undefined') {
    Object.defineProperty(window, 'localStorage', {
      value: storageMock, configurable: true, writable: true,
    });
  }
});

// 生产默认值快照：在模块首次加载（jsdom localStorage 为空）时取得，用于每个测试前重置。
const DEFAULT_PREFERENCES = { ...useAppStore.getState().preferences };
const DEFAULT_URL_STATE = { ...useAppStore.getState().urlState };

beforeEach(() => {
  localStorage.clear();
  useAppStore.setState({
    preferences: { ...DEFAULT_PREFERENCES },
    urlState: { ...DEFAULT_URL_STATE },
  });
  useStockStore.getState().reset();
});

// ===== 前端状态管理 =====
describe('Frontend State Management', () => {
  it('默认主题应为 dark（旧断言是 light）', () => {
    expect(useAppStore.getState().preferences.theme).toBe('dark');
  });

  it('应该设置主题', () => {
    useAppStore.getState().setTheme('light');
    expect(useAppStore.getState().preferences.theme).toBe('light');
  });

  it('应该设置语言', () => {
    const i18n = new I18nManager();
    expect(i18n.getLocale()).toBe('zh-CN');
    i18n.setLocale('en-US');
    expect(i18n.getLocale()).toBe('en-US');
  });

  it('应该添加自选股', () => {
    useStockStore.getState().addToWatchlist('600519');
    expect(useStockStore.getState().watchlist).toContain('600519');
    expect(useStockStore.getState().watchlist).toHaveLength(1);
  });

  it('不应该重复添加自选股', () => {
    useStockStore.getState().addToWatchlist('600519');
    useStockStore.getState().addToWatchlist('600519');
    expect(useStockStore.getState().watchlist).toHaveLength(1);
  });

  it('应该删除自选股', () => {
    useStockStore.getState().addToWatchlist('600519');
    useStockStore.getState().addToWatchlist('000858');
    useStockStore.getState().removeFromWatchlist('600519');
    expect(useStockStore.getState().watchlist).not.toContain('600519');
    expect(useStockStore.getState().watchlist).toContain('000858');
  });

  it('应该切换侧边栏', () => {
    useAppStore.getState().toggleSidebar();
    expect(useAppStore.getState().preferences.sidebarCollapsed).toBe(true);
    useAppStore.getState().toggleSidebar();
    expect(useAppStore.getState().preferences.sidebarCollapsed).toBe(false);
  });

  it('应该设置K线周期', () => {
    useAppStore.getState().setKlinePeriod('60m');
    expect(useAppStore.getState().preferences.klinePeriod).toBe('60m');
  });

  it('应该切换成交量显示', () => {
    expect(useAppStore.getState().preferences.showVolume).toBe(true);
    useAppStore.getState().toggleVolume();
    expect(useAppStore.getState().preferences.showVolume).toBe(false);
  });

  it('应该重置自选股状态（useAppStore 无 reset，生产 reset 在 useStockStore）', () => {
    useStockStore.getState().addToWatchlist('600519');
    useStockStore.getState().reset();
    expect(useStockStore.getState().watchlist).toEqual([]);
  });

  it('应该保持不可变性', () => {
    const before = useAppStore.getState().preferences;
    useAppStore.getState().setTheme('light');
    const after = useAppStore.getState().preferences;
    expect(after).not.toBe(before);
    expect(before.theme).toBe('dark');
  });
});

// ===== URL参数同步 =====
describe('URL Parameter Sync', () => {
  it('默认状态不写入 URL（旧断言会写入 page=1）', () => {
    expect(useAppStore.getState().toURLParams().toString()).toBe('');
  });

  it('应该把非默认状态转为URL参数', () => {
    useAppStore.getState().setURLState({
      page: 2,
      searchKeyword: '茅台',
      sortBy: 'price',
      market: 'SH',
    });
    const params = useAppStore.getState().toURLParams();
    expect(params.get('page')).toBe('2');
    expect(params.get('q')).toBe('茅台');
    expect(params.get('sortBy')).toBe('price');
    expect(params.get('market')).toBe('SH');
    expect(params.has('pageSize')).toBe(false);
    expect(params.has('sortOrder')).toBe(false);
    expect(params.has('industry')).toBe(false);
  });

  it('应该从URL参数恢复状态', () => {
    useAppStore.getState().syncFromURL(
      new URLSearchParams('page=2&pageSize=50&q=茅台&sortBy=volume&sortOrder=desc&market=SH&industry=白酒'),
    );
    const state = useAppStore.getState().urlState;
    expect(state.page).toBe(2);
    expect(state.pageSize).toBe(50);
    expect(state.searchKeyword).toBe('茅台');
    expect(state.sortBy).toBe('volume');
    expect(state.sortOrder).toBe('desc');
    expect(state.market).toBe('SH');
    expect(state.industry).toBe('白酒');
  });

  it('应该忽略空值、非法数字和未知键', () => {
    useAppStore.getState().syncFromURL(
      new URLSearchParams('page=abc&q=&market=&sortOrder=&unknown=1'),
    );
    expect(useAppStore.getState().urlState).toEqual(DEFAULT_URL_STATE);
  });

  it('应该把 pageSize 从字符串转为数字', () => {
    useAppStore.getState().syncFromURL(new URLSearchParams('pageSize=100'));
    expect(useAppStore.getState().urlState.pageSize).toBe(100);
    expect(typeof useAppStore.getState().urlState.pageSize).toBe('number');
  });

  it('应该处理往返转换', () => {
    const original = { page: 3, searchKeyword: 'test', sortBy: 'change', market: 'SH' };
    useAppStore.getState().setURLState(original);
    const params = useAppStore.getState().toURLParams();

    // 测试内重置到生产默认值，模拟新会话后再从 URL 恢复。
    useAppStore.setState({ urlState: { ...DEFAULT_URL_STATE } });
    useAppStore.getState().syncFromURL(params);

    const restored = useAppStore.getState().urlState;
    expect(restored.page).toBe(original.page);
    expect(restored.searchKeyword).toBe(original.searchKeyword);
    expect(restored.sortBy).toBe(original.sortBy);
    expect(restored.market).toBe(original.market);
  });
});

// ===== 表格排序和筛选 =====
describe('Table Sort and Filter', () => {
  interface Row {
    [key: string]: unknown;
    symbol: string;
    name: string;
    price: number;
    change: number;
    volume: number;
    pe: number;
    industry: string;
  }

  const data: Row[] = [
    { symbol: '600519', name: '贵州茅台', price: 1800, change: 2.5, volume: 5e6, pe: 35, industry: '白酒' },
    { symbol: '000858', name: '五粮液', price: 150, change: -1.2, volume: 8e6, pe: 25, industry: '白酒' },
    { symbol: '002415', name: '海康威视', price: 35, change: 3.8, volume: 1.2e7, pe: 20, industry: '安防' },
    { symbol: '300750', name: '宁德时代', price: 200, change: -0.5, volume: 6e6, pe: 50, industry: '新能源' },
    { symbol: '601398', name: '工商银行', price: 5.5, change: 0.3, volume: 2e7, pe: 5, industry: '银行' },
  ];

  const asRows = (rows: Record<string, unknown>[]): Row[] => rows as unknown as Row[];

  const toStock = (row: Row): Stock => ({
    symbol: row.symbol,
    name: row.name,
    price: row.price,
    change: row.change,
    changePercent: row.change,
    volume: String(row.volume),
    marketCap: null,
    industry: row.industry,
    peRatio: row.pe,
  });

  const seedStocks = () => {
    useStockStore.setState({ stocks: data.map(toStock) });
  };

  it('应该按价格降序排列', () => {
    const sorted = asRows(sortData(data, 'price', 'desc'));
    expect(sorted[0].price).toBe(1800);
    expect(sorted[sorted.length - 1].price).toBe(5.5);
  });

  it('应该按涨跌幅升序排列', () => {
    const sorted = asRows(sortData(data, 'change', 'asc'));
    expect(sorted[0].change).toBe(-1.2);
  });

  it('应该按名称排序', () => {
    const sorted = asRows(sortData(data, 'name', 'asc'));
    const names = sorted.map(s => s.name);
    expect(names).toHaveLength(data.length);
    // 用与生产相同的 localeCompare 判定相邻元素有序，避免写死中文本地化顺序。
    for (let i = 1; i < names.length; i += 1) {
      expect(names[i - 1].localeCompare(names[i])).toBeLessThanOrEqual(0);
    }
  });

  it('应该按行业筛选', () => {
    const filtered = asRows(filterData(data, [{ key: 'industry', operator: 'eq', value: '白酒' }]));
    expect(filtered).toHaveLength(2);
    expect(filtered.every(r => r.industry === '白酒')).toBe(true);
  });

  it('应该按PE范围筛选', () => {
    const filtered = asRows(filterData(data, [{ key: 'pe', operator: 'lt', value: 30 }]));
    expect(filtered).toHaveLength(3);
    expect(filtered.every(r => r.pe < 30)).toBe(true);
  });

  it('应该按代码搜索', () => {
    seedStocks();
    const results = useStockStore.getState().searchStocks('600519');
    expect(results).toHaveLength(1);
    expect(results[0].name).toBe('贵州茅台');
  });

  it('应该按名称搜索', () => {
    seedStocks();
    const results = useStockStore.getState().searchStocks('茅台');
    expect(results).toHaveLength(1);
  });

  it('应该支持模糊搜索', () => {
    seedStocks();
    const results = useStockStore.getState().searchStocks('宁');
    expect(results).toHaveLength(1);
    expect(results[0].name).toBe('宁德时代');
  });

  it('应该处理空搜索', () => {
    seedStocks();
    const results = useStockStore.getState().searchStocks('');
    expect(results).toHaveLength(data.length);
  });

  it('应该处理无结果搜索', () => {
    seedStocks();
    const results = useStockStore.getState().searchStocks('不存在的股票');
    expect(results).toHaveLength(0);
  });

  it('应该组合排序和筛选', () => {
    const filtered = filterData(data, [{ key: 'industry', operator: 'eq', value: '白酒' }]);
    const sorted = asRows(sortData(filtered, 'price', 'desc'));
    expect(sorted).toHaveLength(2);
    expect(sorted[0].price).toBeGreaterThan(sorted[1].price);
  });
});

// ===== 搜索高亮 =====
// 生产无对应导出，未迁移：src/components/Common/SearchHighlight.tsx 只导出 React 组件，
// 高亮逻辑在组件内部且未导出纯函数；truncateHighlight 生产无对应。
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
  const base = new Date(2024, 2, 15, 12, 0, 0).getTime();

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(base);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('5 分钟内显示刚刚（旧断言 60s 为 1分钟前，生产为刚刚）', () => {
    expect(formatRelativeTime(base - 30_000)).toBe('刚刚');
    expect(formatRelativeTime(base - 59_000)).toBe('刚刚');
    expect(formatRelativeTime(base - 60_000)).toBe('刚刚');
    expect(formatRelativeTime(base - 4 * 60_000)).toBe('刚刚');
  });

  it('应该显示分钟', () => {
    expect(formatRelativeTime(base - 5 * 60_000)).toBe('5分钟前');
    expect(formatRelativeTime(base - 59 * 60_000)).toBe('59分钟前');
  });

  it('应该显示小时', () => {
    expect(formatRelativeTime(base - 3_600_000)).toBe('1小时前');
    expect(formatRelativeTime(base - 23 * 3_600_000)).toBe('23小时前');
  });

  it('超过 24 小时返回完整日期（旧断言的天/月生产不存在）', () => {
    expect(formatRelativeTime(base - 86_400_000)).toBe('2024-03-14');
    expect(formatRelativeTime(base - 29 * 86_400_000)).toBe('2024-02-15');
    expect(formatRelativeTime(base - 30 * 86_400_000)).toBe('2024-02-14');
  });

  it('超过一年同样返回完整日期（旧断言的“年前”生产不存在）', () => {
    expect(formatRelativeTime(base - 365 * 86_400_000)).toBe('2023-03-16');
    expect(formatRelativeTime(base - 3 * 365 * 86_400_000)).toBe('2021-03-16');
  });

  it('应该处理边界值', () => {
    expect(formatRelativeTime(base)).toBe('刚刚');
    expect(formatRelativeTime(base - 300_000)).toBe('5分钟前');
  });
});

// ===== 数字格式化 =====
describe('Number Formatting', () => {
  it('应该格式化万亿数字(中文)', () => {
    expect(formatLargeNumber(2.5e12, 'zh-CN')).toBe('2.50万亿');
  });

  it('应该格式化亿数字(中文)', () => {
    expect(formatLargeNumber(5e10, 'zh-CN')).toBe('500.00亿');
  });

  it('应该格式化万数字(中文)', () => {
    expect(formatLargeNumber(5e4, 'zh-CN')).toBe('5.00万');
  });

  it('应该格式化T数字(英文)', () => {
    expect(formatLargeNumber(2.5e12, 'en-US')).toBe('2.50T');
  });

  it('应该格式化B数字(英文)', () => {
    expect(formatLargeNumber(5e9, 'en-US')).toBe('5.00B');
  });

  it('应该格式化M数字(英文)', () => {
    expect(formatLargeNumber(5e6, 'en-US')).toBe('5.00M');
  });

  it('应该格式化正百分比', () => {
    expect(formatChangePercent(2.5)).toBe('+2.50%');
  });

  it('应该格式化负百分比', () => {
    expect(formatChangePercent(-1.2)).toBe('-1.20%');
  });

  it('0% 也带正号（旧断言 0.00%，生产 +0.00%）', () => {
    expect(formatChangePercent(0)).toBe('+0.00%');
    expect(formatChangePercent(null)).toBe('-');
  });

  it('应该格式化人民币', () => {
    expect(formatCurrency(1234.5)).toBe('¥1,234.50');
  });

  it('应该格式化美元（zh-CN Intl 输出 US$）', () => {
    expect(formatCurrency(1234.5, 'USD')).toBe('US$1,234.50');
  });
});

// ===== 路由匹配 =====
describe('Route Matching', () => {
  it('应该匹配根路径', () => {
    const match = matchPath(ROUTE_PATHS.HOME, '/');
    expect(match).not.toBeNull();
    expect(match!.pathname).toBe('/');
  });

  it('应该匹配静态路径', () => {
    expect(matchPath(ROUTE_PATHS.STOCKS, '/stocks')).not.toBeNull();
  });

  it('应该匹配动态路径并提取参数', () => {
    const match = matchPath(ROUTE_PATHS.STOCK_DETAIL, '/stocks/600519');
    expect(match).not.toBeNull();
    expect(match!.params.symbol).toBe('600519');
  });

  it('应该返回null当无匹配', () => {
    expect(matchPath(ROUTE_PATHS.STOCKS, '/unknown')).toBeNull();
  });

  it('不应该部分匹配', () => {
    expect(matchPath(ROUTE_PATHS.STOCKS, '/stocks/600519/details')).toBeNull();
  });

  it('应该从生产路由常量提取参数（旧断言参数名 code，生产为 symbol）', () => {
    const match = matchPath(ROUTE_PATHS.SECTOR_DETAIL, '/sectors/BK0437');
    expect(match).not.toBeNull();
    expect(match!.params.symbol).toBe('BK0437');
    expect(match!.params.code).toBeUndefined();
  });
});

// ===== 面包屑导航 =====
// 生产无对应导出，未迁移：生产各页面内联 antd Breadcrumb items
// （如 src/pages/StockDetailPage.tsx:306-313），无导出生成函数。
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
