import { describe, it, expect } from 'vitest';

// 组件渲染逻辑测试 - 格式化、条件渲染、列表、数据转换

interface StockQuote {
  code: string;
  name: string;
  price: number;
  change: number;
  changePercent: number;
  volume: number;
  amount: number;
  high: number;
  low: number;
  open: number;
  preClose: number;
  turnover: number;
  pe: number;
  pb: number;
  marketCap: number;
  industry: string;
}

function formatPrice(price: number): string {
  return price.toFixed(2);
}

function formatChangePercent(pct: number): string {
  const sign = pct > 0 ? '+' : '';
  return `${sign}${pct.toFixed(2)}%`;
}

function getChangeClass(value: number): string {
  if (value > 0) return 'rise';
  if (value < 0) return 'fall';
  return 'flat';
}

function formatLargeNumber(num: number): string {
  if (num >= 1e12) return (num / 1e12).toFixed(2) + '万亿';
  if (num >= 1e8) return (num / 1e8).toFixed(2) + '亿';
  if (num >= 1e4) return (num / 1e4).toFixed(2) + '万';
  return num.toFixed(0);
}

function getRankBadge(rank: number): string | null {
  if (rank === 1) return '🥇';
  if (rank === 2) return '🥈';
  if (rank === 3) return '🥉';
  return null;
}

function calculateAmplitude(high: number, low: number, preClose: number): number {
  if (preClose <= 0) return 0;
  return ((high - low) / preClose) * 100;
}

function filterStocks(stocks: StockQuote[], filters: {
  minPrice?: number;
  maxPrice?: number;
  industry?: string;
  minChange?: number;
  maxChange?: number;
}): StockQuote[] {
  return stocks.filter(s => {
    if (filters.minPrice !== undefined && s.price < filters.minPrice) return false;
    if (filters.maxPrice !== undefined && s.price > filters.maxPrice) return false;
    if (filters.industry && s.industry !== filters.industry) return false;
    if (filters.minChange !== undefined && s.changePercent < filters.minChange) return false;
    if (filters.maxChange !== undefined && s.changePercent > filters.maxChange) return false;
    return true;
  });
}

function sortStocks(stocks: StockQuote[], field: keyof StockQuote, order: 'asc' | 'desc'): StockQuote[] {
  return [...stocks].sort((a, b) => {
    const aVal = a[field];
    const bVal = b[field];
    if (typeof aVal === 'number' && typeof bVal === 'number') {
      return order === 'asc' ? aVal - bVal : bVal - aVal;
    }
    return order === 'asc'
      ? String(aVal).localeCompare(String(bVal))
      : String(bVal).localeCompare(String(aVal));
  });
}

function highlightMatch(text: string, query: string): { before: string; match: string; after: string } {
  const idx = text.toLowerCase().indexOf(query.toLowerCase());
  if (idx === -1) return { before: text, match: '', after: '' };
  return {
    before: text.slice(0, idx),
    match: text.slice(idx, idx + query.length),
    after: text.slice(idx + query.length),
  };
}

function paginate<T>(items: T[], page: number, pageSize: number): {
  items: T[];
  currentPage: number;
  totalPages: number;
  totalItems: number;
  hasNext: boolean;
  hasPrev: boolean;
} {
  const totalItems = items.length;
  const totalPages = Math.ceil(totalItems / pageSize);
  const currentPage = Math.min(Math.max(1, page), Math.max(1, totalPages));
  const start = (currentPage - 1) * pageSize;
  return {
    items: items.slice(start, start + pageSize),
    currentPage,
    totalPages,
    totalItems,
    hasNext: currentPage < totalPages,
    hasPrev: currentPage > 1,
  };
}

describe('组件渲染逻辑测试', () => {
  const stocks: StockQuote[] = [
    { code: '600519', name: '贵州茅台', price: 1900, change: 25, changePercent: 1.33, volume: 50000, amount: 95000000, high: 1910, low: 1890, open: 1895, preClose: 1875, turnover: 0.25, pe: 35, pb: 12, marketCap: 2.4e12, industry: '白酒' },
    { code: '000858', name: '五粮液', price: 160, change: -2, changePercent: -1.23, volume: 80000, amount: 12800000, high: 163, low: 158, open: 162, preClose: 162, turnover: 0.35, pe: 25, pb: 6, marketCap: 6.2e11, industry: '白酒' },
    { code: '300750', name: '宁德时代', price: 180, change: 5, changePercent: 2.86, volume: 120000, amount: 21600000, high: 182, low: 176, open: 177, preClose: 175, turnover: 0.55, pe: 45, pb: 8, marketCap: 8.5e11, industry: '新能源' },
    { code: '601318', name: '中国平安', price: 48, change: 0, changePercent: 0, volume: 200000, amount: 9600000, high: 48.5, low: 47.5, open: 48, preClose: 48, turnover: 0.18, pe: 10, pb: 1.2, marketCap: 8.7e11, industry: '保险' },
    { code: '600036', name: '招商银行', price: 35, change: 0.5, changePercent: 1.45, volume: 150000, amount: 5250000, high: 35.3, low: 34.5, open: 34.6, preClose: 34.5, turnover: 0.32, pe: 6, pb: 0.9, marketCap: 8.9e11, industry: '银行' },
  ];

  describe('价格格式化', () => {
    it('基本格式化', () => {
      expect(formatPrice(1900)).toBe('1900.00');
      expect(formatPrice(35.5)).toBe('35.50');
    });

    it('涨跌幅格式化', () => {
      expect(formatChangePercent(1.33)).toBe('+1.33%');
      expect(formatChangePercent(-2.5)).toBe('-2.50%');
      expect(formatChangePercent(0)).toBe('0.00%');
    });
  });

  describe('涨跌样式', () => {
    it('上涨', () => expect(getChangeClass(1.5)).toBe('rise'));
    it('下跌', () => expect(getChangeClass(-2.3)).toBe('fall'));
    it('平盘', () => expect(getChangeClass(0)).toBe('flat'));
  });

  describe('大数格式化', () => {
    it('万亿', () => expect(formatLargeNumber(2.4e12)).toContain('万亿'));
    it('亿', () => expect(formatLargeNumber(8.5e11)).toContain('亿'));
    it('万', () => expect(formatLargeNumber(50000)).toContain('万'));
    it('小于万', () => expect(formatLargeNumber(9999)).toBe('9999'));
  });

  describe('排名徽章', () => {
    it('前三名', () => {
      expect(getRankBadge(1)).toBe('🥇');
      expect(getRankBadge(2)).toBe('🥈');
      expect(getRankBadge(3)).toBe('🥉');
    });
    it('其他名次', () => {
      expect(getRankBadge(4)).toBeNull();
      expect(getRankBadge(10)).toBeNull();
    });
  });

  describe('振幅计算', () => {
    it('正常计算', () => {
      expect(calculateAmplitude(1910, 1890, 1875)).toBeCloseTo(1.07, 1);
    });
    it('零收盘价', () => {
      expect(calculateAmplitude(100, 90, 0)).toBe(0);
    });
  });

  describe('筛选', () => {
    it('按行业', () => {
      const result = filterStocks(stocks, { industry: '白酒' });
      expect(result).toHaveLength(2);
    });
    it('按价格区间', () => {
      const result = filterStocks(stocks, { minPrice: 100 });
      expect(result).toHaveLength(3);
    });
    it('按涨跌幅', () => {
      const result = filterStocks(stocks, { minChange: 0 });
      expect(result.every(s => s.changePercent >= 0)).toBe(true);
    });
    it('组合筛选', () => {
      const result = filterStocks(stocks, { minPrice: 100, industry: '白酒' });
      expect(result).toHaveLength(2);
    });
    it('无结果', () => {
      const result = filterStocks(stocks, { minPrice: 5000 });
      expect(result).toHaveLength(0);
    });
  });

  describe('排序', () => {
    it('价格升序', () => {
      const sorted = sortStocks(stocks, 'price', 'asc');
      expect(sorted[0].price).toBeLessThanOrEqual(sorted[1].price);
    });
    it('价格降序', () => {
      const sorted = sortStocks(stocks, 'price', 'desc');
      expect(sorted[0].price).toBeGreaterThanOrEqual(sorted[1].price);
    });
    it('按代码排序', () => {
      const sorted = sortStocks(stocks, 'code', 'asc');
      expect(sorted[0].code).toBe('000858');
    });
    it('不修改原数组', () => {
      const original = [...stocks];
      sortStocks(stocks, 'price', 'desc');
      expect(stocks.map(s => s.code)).toEqual(original.map(s => s.code));
    });
  });

  describe('搜索高亮', () => {
    it('匹配', () => {
      const result = highlightMatch('贵州茅台', '茅台');
      expect(result.before).toBe('贵州');
      expect(result.match).toBe('茅台');
      expect(result.after).toBe('');
    });
    it('无匹配', () => {
      const result = highlightMatch('贵州茅台', '五粮液');
      expect(result.match).toBe('');
    });
    it('大小写不敏感', () => {
      const result = highlightMatch('HelloWorld', 'world');
      expect(result.match).toBe('World');
    });
  });

  describe('分页', () => {
    it('第一页', () => {
      const result = paginate(stocks, 1, 2);
      expect(result.items).toHaveLength(2);
      expect(result.hasNext).toBe(true);
      expect(result.hasPrev).toBe(false);
      expect(result.totalPages).toBe(3);
    });
    it('最后一页', () => {
      const result = paginate(stocks, 3, 2);
      expect(result.items).toHaveLength(1);
      expect(result.hasNext).toBe(false);
      expect(result.hasPrev).toBe(true);
    });
    it('超出范围', () => {
      const result = paginate(stocks, 10, 2);
      expect(result.currentPage).toBe(3);
    });
    it('零页', () => {
      const result = paginate(stocks, 0, 2);
      expect(result.currentPage).toBe(1);
    });
  });
});
