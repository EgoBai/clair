import React from 'react';
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import {
  formatChangePercent,
  formatCurrency,
  formatLargeNumber,
  formatPercent,
  getChangeColor,
} from '../utils/formatters';
import { filterByChangeRange, sortByField, transformStock } from '../utils/dataTransformUtils';
import { SearchHighlight } from '../components/Common/SearchHighlight';

// ===== 组件渲染逻辑测试 - 格式化、条件渲染、列表、数据转换（影子测试迁移） =====
// 已绑定生产实现：
// - formatChangePercent → frontend/src/utils/formatters.ts:148（>=0 带 '+'，null/undefined → '-'）
// - getChangeColor       → frontend/src/utils/formatters.ts:174（positive / negative / neutral）
// - formatLargeNumber    → frontend/src/utils/formatters.ts:219（en-US 千分位，不是 万亿/亿/万）
// - formatCurrency       → frontend/src/utils/formatters.ts:99
// - formatPercent        → frontend/src/utils/formatters.ts:60（入参是小数比例）
// - sortByField          → frontend/src/utils/dataTransformUtils.ts:120
// - transformStock       → frontend/src/utils/dataTransformUtils.ts:74
//   （priceFormatted: :83；amplitude: :75/:89；color: :77-79）
// - filterByChangeRange  → frontend/src/utils/dataTransformUtils.ts:136
// - SearchHighlight      → frontend/src/components/Common/SearchHighlight.tsx:20（渲染层真源，内部拆分逻辑未导出）
//
// 未迁移（生产仓无对应导出，保留内联 helper 仅作本地契约测试）：
// - formatPrice：无同名导出；价格格式化由 transformStock().priceFormatted 断言生产口径，
//   组件内联写法见 frontend/src/components/Market/MarketIndexPanel.tsx:149。
// - getRankBadge：仅归档页内联 JSX（frontend/src/pages/_archived/MarketStatsPage.tsx:190）。
// - filterStocks：无通用多条件筛选导出（filterByChangeRange 只覆盖涨跌幅区间）。
// - paginate：无 totalPages/hasNext/hasPrev 契约的导出（dataTable.ts 的 DataTableProcessor 契约不同）。

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

// 未迁移：生产无排名徽章导出，仅归档页内联 JSX。
function getRankBadge(rank: number): string | null {
  if (rank === 1) return '🥇';
  if (rank === 2) return '🥈';
  if (rank === 3) return '🥉';
  return null;
}

// 未迁移：生产无通用多条件选股筛选导出（stockScreener.ts 是评分模型，filterByChangeRange 只覆盖涨跌幅）。
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

// 未迁移：生产 paginate 契约不同（DataTableProcessor.execute 只返回 { page, pageSize, total }）。
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
    it('基本格式化（生产 transformStock().priceFormatted）', () => {
      expect(transformStock(stocks[0]).priceFormatted).toBe('1900.00');
      expect(transformStock({ ...stocks[4], price: 35.5 }).priceFormatted).toBe('35.50');
    });

    it('涨跌幅格式化（生产 formatters.formatChangePercent）', () => {
      expect(formatChangePercent(1.33)).toBe('+1.33%');
      expect(formatChangePercent(-2.5)).toBe('-2.50%');
      // 生产口径：percent >= 0 即带 '+'，0 得 '+0.00%'
      expect(formatChangePercent(0)).toBe('+0.00%');
      expect(formatChangePercent(null)).toBe('—');
      expect(formatChangePercent(undefined)).toBe('—');
    });
  });

  describe('涨跌颜色（生产 formatters.getChangeColor）', () => {
    it('上涨', () => expect(getChangeColor(1.5)).toBe('positive'));
    it('下跌', () => expect(getChangeColor(-2.3)).toBe('negative'));
    it('平盘', () => {
      expect(getChangeColor(0)).toBe('neutral');
      expect(getChangeColor(undefined)).toBe('neutral');
    });
  });

  describe('大数格式化（生产 formatters.formatLargeNumber 千分位）', () => {
    it('万亿级数值', () => expect(formatLargeNumber(2.4e12)).toBe('2,400,000,000,000'));
    it('亿级数值', () => expect(formatLargeNumber(8.5e11)).toBe('850,000,000,000'));
    it('万级数值', () => expect(formatLargeNumber(50000)).toBe('50,000'));
    it('小于万', () => {
      expect(formatLargeNumber(9999)).toBe('9,999');
      expect(formatLargeNumber(NaN)).toBe('—');
    });
  });

  describe('货币与百分比格式化（生产 formatters）', () => {
    it('货币保留两位小数，百分比按小数比例换算', () => {
      expect(formatCurrency(1234.5)).toBe('¥1,234.50');
      expect(formatPercent(0.1234)).toBe('12.34%');
      expect(formatPercent(0.5, 0)).toBe('50%');
    });
  });

  describe('排名徽章（未迁移：无生产导出）', () => {
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

  describe('振幅计算（生产 transformStock().amplitude）', () => {
    it('正常计算', () => {
      // (1910 - 1890) / 1875 * 100 = 1.0666…，生产四舍五入到 2 位
      expect(transformStock(stocks[0]).amplitude).toBe(1.07);
    });
    it('零收盘价', () => {
      expect(transformStock({ ...stocks[0], high: 100, low: 90, preClose: 0 }).amplitude).toBe(0);
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
    it('涨跌幅区间筛选（生产 filterByChangeRange，边界含等号）', () => {
      const result = filterByChangeRange(stocks, 0, 1.5);
      expect(result.map(s => s.code)).toEqual(['600519', '601318', '600036']);
    });
  });

  describe('排序（生产 dataTransformUtils.sortByField）', () => {
    it('价格升序', () => {
      const sorted = sortByField(stocks, 'price', 'asc');
      expect(sorted.map(s => s.price)).toEqual([35, 48, 160, 180, 1900]);
    });
    it('价格降序', () => {
      const sorted = sortByField(stocks, 'price', 'desc');
      expect(sorted.map(s => s.price)).toEqual([1900, 180, 160, 48, 35]);
    });
    it('按代码排序', () => {
      const sorted = sortByField(stocks, 'code', 'asc');
      expect(sorted[0].code).toBe('000858');
    });
    it('不修改原数组', () => {
      const original = [...stocks];
      sortByField(stocks, 'price', 'desc');
      expect(stocks.map(s => s.code)).toEqual(original.map(s => s.code));
    });
  });

  describe('搜索高亮（生产 SearchHighlight 组件渲染）', () => {
    it('匹配', () => {
      const { container } = render(
        React.createElement(SearchHighlight, { text: '贵州茅台', query: '茅台' })
      );
      expect(container.textContent).toBe('贵州茅台');
      const marks = container.querySelectorAll('mark');
      expect(marks).toHaveLength(1);
      expect(marks[0].textContent).toBe('茅台');
      expect(marks[0].previousSibling?.textContent).toBe('贵州');
      expect(marks[0].nextSibling).toBeNull();
    });
    it('无匹配', () => {
      const { container } = render(
        React.createElement(SearchHighlight, { text: '贵州茅台', query: '五粮液' })
      );
      expect(container.querySelectorAll('mark')).toHaveLength(0);
      expect(container.textContent).toBe('贵州茅台');
    });
    it('大小写不敏感', () => {
      const { container } = render(
        React.createElement(SearchHighlight, { text: 'HelloWorld', query: 'world' })
      );
      const marks = container.querySelectorAll('mark');
      expect(marks).toHaveLength(1);
      expect(marks[0].textContent).toBe('World');
    });
  });

  describe('分页（未迁移：无同契约生产导出）', () => {
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
