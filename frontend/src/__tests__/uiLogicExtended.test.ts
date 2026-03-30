import { describe, it, expect } from 'vitest';

// React组件状态管理逻辑测试
describe('Component State Management Logic', () => {
  interface TabState { activeKey: string; history: string[]; }

  const tabReducer = (state: TabState, action: { type: string; payload?: string }): TabState => {
    switch (action.type) {
      case 'SWITCH_TAB':
        return { activeKey: action.payload!, history: [...state.history, action.payload!] };
      case 'GO_BACK': {
        const prev = state.history[state.history.length - 2];
        return prev ? { activeKey: prev, history: state.history.slice(0, -1) } : state;
      }
      default: return state;
    }
  };

  it('switches tab correctly', () => {
    const state = tabReducer({ activeKey: 'overview', history: ['overview'] }, { type: 'SWITCH_TAB', payload: 'details' });
    expect(state.activeKey).toBe('details');
    expect(state.history).toContain('details');
  });

  it('goes back to previous tab', () => {
    const state = tabReducer(
      { activeKey: 'details', history: ['overview', 'details'] },
      { type: 'GO_BACK' }
    );
    expect(state.activeKey).toBe('overview');
  });

  it('stays on current if no history', () => {
    const state = tabReducer({ activeKey: 'overview', history: ['overview'] }, { type: 'GO_BACK' });
    expect(state.activeKey).toBe('overview');
  });
});

// 表格排序逻辑测试
describe('Table Sort Logic', () => {
  interface Row { symbol: string; price: number; changePercent: number; volume: number; marketCap: number; }
  type SortField = keyof Row;
  type SortOrder = 'asc' | 'desc';

  const sortRows = (rows: Row[], field: SortField, order: SortOrder): Row[] => {
    return [...rows].sort((a, b) => {
      const aVal = a[field];
      const bVal = b[field];
      const cmp = typeof aVal === 'string' ? String(aVal).localeCompare(String(bVal)) : (aVal as number) - (bVal as number);
      return order === 'asc' ? cmp : -cmp;
    });
  };

  const rows: Row[] = [
    { symbol: '600519', price: 1800, changePercent: 2.5, volume: 1000000, marketCap: 2.26e12 },
    { symbol: '000858', price: 150, changePercent: -1.2, volume: 500000, marketCap: 5.8e11 },
    { symbol: '601318', price: 50, changePercent: 0.8, volume: 2000000, marketCap: 9.1e11 },
  ];

  it('sorts by price ascending', () => {
    const sorted = sortRows(rows, 'price', 'asc');
    expect(sorted[0].price).toBeLessThanOrEqual(sorted[1].price);
  });

  it('sorts by price descending', () => {
    const sorted = sortRows(rows, 'price', 'desc');
    expect(sorted[0].price).toBeGreaterThanOrEqual(sorted[1].price);
  });

  it('sorts by string field (symbol)', () => {
    const sorted = sortRows(rows, 'symbol', 'asc');
    expect(sorted[0].symbol.localeCompare(sorted[1].symbol)).toBeLessThanOrEqual(0);
  });

  it('toggling sort direction reverses order', () => {
    const asc = sortRows(rows, 'changePercent', 'asc');
    const desc = sortRows(rows, 'changePercent', 'desc');
    expect(asc[0].symbol).toBe(desc[desc.length - 1].symbol);
  });

  it('does not mutate original array', () => {
    const original = [...rows];
    sortRows(rows, 'price', 'desc');
    expect(rows).toEqual(original);
  });
});

// 分页逻辑测试
describe('Pagination Logic', () => {
  const paginate = <T>(items: T[], page: number, pageSize: number) => {
    const total = items.length;
    const totalPages = Math.ceil(total / pageSize);
    const safe = Math.max(1, Math.min(page, totalPages || 1));
    return {
      items: items.slice((safe - 1) * pageSize, safe * pageSize),
      page: safe,
      pageSize,
      total,
      totalPages,
      hasNext: safe < totalPages,
      hasPrev: safe > 1,
    };
  };

  const items = Array.from({ length: 55 }, (_, i) => i);

  it('first page returns correct items', () => {
    const result = paginate(items, 1, 10);
    expect(result.items.length).toBe(10);
    expect(result.items[0]).toBe(0);
  });

  it('last page may have fewer items', () => {
    const result = paginate(items, 6, 10);
    expect(result.items.length).toBe(5);
  });

  it('page beyond max returns last page', () => {
    const result = paginate(items, 100, 10);
    expect(result.page).toBe(6);
  });

  it('page 0 returns page 1', () => {
    const result = paginate(items, 0, 10);
    expect(result.page).toBe(1);
  });

  it('hasNext and hasPrev are correct', () => {
    const first = paginate(items, 1, 10);
    expect(first.hasNext).toBe(true);
    expect(first.hasPrev).toBe(false);

    const middle = paginate(items, 3, 10);
    expect(middle.hasNext).toBe(true);
    expect(middle.hasPrev).toBe(true);

    const last = paginate(items, 6, 10);
    expect(last.hasNext).toBe(false);
    expect(last.hasPrev).toBe(true);
  });

  it('calculates total pages correctly', () => {
    expect(paginate(items, 1, 10).totalPages).toBe(6);
    expect(paginate(items, 1, 20).totalPages).toBe(3);
    expect(paginate(items, 1, 55).totalPages).toBe(1);
    expect(paginate(items, 1, 100).totalPages).toBe(1);
  });

  it('empty array returns empty page', () => {
    const result = paginate([], 1, 10);
    expect(result.items).toHaveLength(0);
    expect(result.totalPages).toBe(0);
  });
});

// 筛选器逻辑测试
describe('Filter Logic', () => {
  interface Stock {
    symbol: string; name: string; market: string; industry: string;
    price: number; changePercent: number; pe: number; pb: number;
    volume: number; marketCap: number;
  }

  const stocks: Stock[] = [
    { symbol: '600519', name: '贵州茅台', market: 'sh', industry: '白酒', price: 1800, changePercent: 2.5, pe: 35, pb: 12, volume: 1000000, marketCap: 2.26e12 },
    { symbol: '000858', name: '五粮液', market: 'sz', industry: '白酒', price: 150, changePercent: -1.2, pe: 25, pb: 5, volume: 500000, marketCap: 5.8e11 },
    { symbol: '601318', name: '中国平安', market: 'sh', industry: '保险', price: 50, changePercent: 0.8, pe: 10, pb: 1.5, volume: 2000000, marketCap: 9.1e11 },
    { symbol: '300750', name: '宁德时代', market: 'sz', industry: '新能源', price: 200, changePercent: -2.8, pe: 60, pb: 8, volume: 800000, marketCap: 1e12 },
    { symbol: '000001', name: '平安银行', market: 'sz', industry: '银行', price: 12, changePercent: 3.1, pe: 5, pb: 0.8, volume: 3000000, marketCap: 2.3e11 },
  ];

  type FilterOp = 'gt' | 'lt' | 'eq' | 'gte' | 'lte' | 'between';
  interface FilterCondition { field: keyof Stock; op: FilterOp; value: number | [number, number]; }

  const applyFilter = (data: Stock[], condition: FilterCondition): Stock[] => {
    return data.filter(s => {
      const val = s[condition.field] as number;
      switch (condition.op) {
        case 'gt': return val > (condition.value as number);
        case 'lt': return val < (condition.value as number);
        case 'gte': return val >= (condition.value as number);
        case 'lte': return val <= (condition.value as number);
        case 'eq': return val === (condition.value as number);
        case 'between': { const [min, max] = condition.value as [number, number]; return val >= min && val <= max; }
        default: return true;
      }
    });
  };

  it('filters PE > 20', () => {
    const result = applyFilter(stocks, { field: 'pe', op: 'gt', value: 20 });
    expect(result.every(s => s.pe > 20)).toBe(true);
  });

  it('filters price between 50-200', () => {
    const result = applyFilter(stocks, { field: 'price', op: 'between', value: [50, 200] });
    expect(result.every(s => s.price >= 50 && s.price <= 200)).toBe(true);
  });

  it('filters PB < 2', () => {
    const result = applyFilter(stocks, { field: 'pb', op: 'lt', value: 2 });
    expect(result.every(s => s.pb < 2)).toBe(true);
  });

  it('combines multiple filter conditions (AND)', () => {
    let result = stocks;
    result = applyFilter(result, { field: 'pe', op: 'lt', value: 30 });
    result = applyFilter(result, { field: 'changePercent', op: 'gt', value: 0 });
    expect(result.every(s => s.pe < 30 && s.changePercent > 0)).toBe(true);
  });

  it('empty result when no match', () => {
    const result = applyFilter(stocks, { field: 'pe', op: 'lt', value: 0 });
    expect(result).toHaveLength(0);
  });
});

// 搜索高亮逻辑测试
describe('Search Highlight Logic', () => {
  const highlight = (text: string, query: string): string => {
    if (!query) return text;
    const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return text.replace(new RegExp(`(${escaped})`, 'gi'), '<mark>$1</mark>');
  };

  it('highlights matching text', () => {
    expect(highlight('贵州茅台', '茅台')).toBe('贵州<mark>茅台</mark>');
  });

  it('highlights case-insensitively', () => {
    expect(highlight('ABC Company', 'abc')).toBe('<mark>ABC</mark> Company');
  });

  it('returns original for no match', () => {
    expect(highlight('贵州茅台', '五粮液')).toBe('贵州茅台');
  });

  it('returns original for empty query', () => {
    expect(highlight('贵州茅台', '')).toBe('贵州茅台');
  });

  it('escapes regex special characters', () => {
    expect(highlight('price: $100', '$100')).toBe('price: <mark>$100</mark>');
  });

  it('highlights multiple occurrences', () => {
    const result = highlight('平安银行 平安保险', '平安');
    expect(result.match(/<mark>/g)?.length).toBe(2);
  });
});

// 相对时间格式化测试
describe('Relative Time Formatting', () => {
  const relativeTime = (timestamp: number, now: number = Date.now()): string => {
    const diff = now - timestamp;
    const seconds = Math.floor(diff / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (seconds < 60) return '刚刚';
    if (minutes < 60) return `${minutes}分钟前`;
    if (hours < 24) return `${hours}小时前`;
    if (days < 30) return `${days}天前`;
    if (days < 365) return `${Math.floor(days / 30)}个月前`;
    return `${Math.floor(days / 365)}年前`;
  };

  const now = 1711305600000;

  it('formats seconds as 刚刚', () => {
    expect(relativeTime(now - 30000, now)).toBe('刚刚');
  });

  it('formats minutes', () => {
    expect(relativeTime(now - 5 * 60000, now)).toBe('5分钟前');
  });

  it('formats hours', () => {
    expect(relativeTime(now - 3 * 3600000, now)).toBe('3小时前');
  });

  it('formats days', () => {
    expect(relativeTime(now - 5 * 86400000, now)).toBe('5天前');
  });

  it('formats months', () => {
    expect(relativeTime(now - 60 * 86400000, now)).toBe('2个月前');
  });

  it('formats years', () => {
    expect(relativeTime(now - 400 * 86400000, now)).toBe('1年前');
  });

  it('exact 60 seconds is 1分钟前', () => {
    expect(relativeTime(now - 60000, now)).toBe('1分钟前');
  });

  it('exact 60 minutes is 1小时前', () => {
    expect(relativeTime(now - 3600000, now)).toBe('1小时前');
  });

  it('exact 24 hours is 1天前', () => {
    expect(relativeTime(now - 86400000, now)).toBe('1天前');
  });

  it('handles future timestamp gracefully', () => {
    expect(relativeTime(now + 60000, now)).toBe('刚刚');
  });

  it('30 days is still days not months', () => {
    expect(relativeTime(now - 29 * 86400000, now)).toBe('29天前');
  });
});
