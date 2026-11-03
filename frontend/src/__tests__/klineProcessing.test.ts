import { describe, it, expect } from 'vitest';
import {
  formatChangePercent,
  formatLargeNumber,
  formatMarketCap,
  formatVolume,
  getColorByChange,
} from '../utils/formatters';
import { sortByField } from '../utils/dataTransformUtils';

/**
 * K 线数据处理测试
 *
 * 生产实现（唯一真源）：
 * - getColorByChange      → src/utils/formatters.ts:228（入参是涨跌值，不是现价/昨收）
 * - formatChangePercent   → src/utils/formatters.ts:148（入参是百分比数值）
 * - formatLargeNumber     → src/utils/formatters.ts:219（千分位，非万亿/亿/万缩写）
 * - formatVolume          → src/utils/formatters.ts:37（亿手/万手/手）
 * - formatMarketCap       → src/utils/formatters.ts:24（万亿/亿/万/原值）
 * - sortByField           → src/utils/dataTransformUtils.ts:120（单列排序，返回副本）
 *
 * 未迁移（生产无对应导出，保留本文件内联实现）：
 * - validateKLine / getKLineType / calculateUpperShadow / calculateLowerShadow / calculateBody /
 *   isHammer / isDoji：src/utils/chartPatternEngine.ts:34 detectDoji、:51 detectHammer 是模块私有
 *   函数，未导出；src/utils/workerManager.ts:90 computeKLine 在 Worker 内计算影线，也未导出。
 * - filterStocksByKeyword：生产 useStockStore.ts:398 searchStocks 是 zustand action，
 *   在 action 内联 code/name 的 toLowerCase().includes()，不是可 import 的纯函数。
 * - calculatePagination：生产 dataTable.ts:38 DataTableProcessor 只提供
 *   page/pageSize/total 与 getPageData() 切片，没有 totalPages/pageRange/isValidPage 导出。
 */

// ---- 未迁移：K 线校验/形态（生产无对应导出，见文件头） ----

interface KLineData {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

function validateKLine(data: KLineData): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (data.high < data.low) errors.push('最高价低于最低价');
  if (data.high < data.open && data.high < data.close) errors.push('最高价低于开盘/收盘价');
  if (data.low > data.open && data.low > data.close) errors.push('最低价高于开盘/收盘价');
  if (data.open < 0 || data.close < 0) errors.push('价格为负');
  if (data.volume < 0) errors.push('成交量为负');
  if (data.high < 0 || data.low < 0) errors.push('最高/最低价为负');

  return { valid: errors.length === 0, errors };
}

function getKLineType(data: KLineData): 'bullish' | 'bearish' | 'doji' {
  if (data.close > data.open) return 'bullish';
  if (data.close < data.open) return 'bearish';
  return 'doji';
}

function calculateUpperShadow(data: KLineData): number {
  return data.high - Math.max(data.open, data.close);
}

function calculateLowerShadow(data: KLineData): number {
  return Math.min(data.open, data.close) - data.low;
}

function calculateBody(data: KLineData): number {
  return Math.abs(data.close - data.open);
}

function isHammer(data: KLineData): boolean {
  const body = calculateBody(data);
  const lowerShadow = calculateLowerShadow(data);
  const upperShadow = calculateUpperShadow(data);
  return lowerShadow >= body * 2 && upperShadow <= body * 0.5 && body > 0;
}

function isDoji(data: KLineData, threshold: number = 0.001): boolean {
  const range = data.high - data.low;
  if (range === 0) return true;
  return calculateBody(data) / range < threshold;
}

describe('K线数据验证', () => {
  it('有效K线数据通过', () => {
    const result = validateKLine({
      date: '2024-01-01', open: 10, high: 11, low: 9, close: 10.5, volume: 1000
    });
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('最高价低于最低价报错', () => {
    const result = validateKLine({
      date: '2024-01-01', open: 10, high: 8, low: 9, close: 10, volume: 1000
    });
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('最高价低于最低价');
  });

  it('负价格报错', () => {
    const result = validateKLine({
      date: '2024-01-01', open: -10, high: 11, low: 9, close: 10, volume: 1000
    });
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('价格为负');
  });

  it('负成交量报错', () => {
    const result = validateKLine({
      date: '2024-01-01', open: 10, high: 11, low: 9, close: 10, volume: -100
    });
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('成交量为负');
  });

  it('最高价低于开盘和收盘报错', () => {
    const result = validateKLine({
      date: '2024-01-01', open: 10, high: 8, low: 9, close: 10.5, volume: 1000
    });
    expect(result.valid).toBe(false);
  });

  it('十字星也是有效K线', () => {
    const result = validateKLine({
      date: '2024-01-01', open: 10, high: 10.5, low: 9.5, close: 10, volume: 1000
    });
    expect(result.valid).toBe(true);
  });

  it('全相同价格有效', () => {
    const result = validateKLine({
      date: '2024-01-01', open: 10, high: 10, low: 10, close: 10, volume: 0
    });
    expect(result.valid).toBe(true);
  });
});

describe('K线形态', () => {
  it('阳线', () => {
    expect(getKLineType({ date: '', open: 10, high: 11, low: 9, close: 11, volume: 0 })).toBe('bullish');
  });

  it('阴线', () => {
    expect(getKLineType({ date: '', open: 11, high: 12, low: 9, close: 10, volume: 0 })).toBe('bearish');
  });

  it('十字星', () => {
    expect(getKLineType({ date: '', open: 10, high: 11, low: 9, close: 10, volume: 0 })).toBe('doji');
  });

  it('上影线计算', () => {
    const kline = { date: '', open: 10, high: 12, low: 9, close: 11, volume: 0 };
    expect(calculateUpperShadow(kline)).toBe(1); // 12 - 11
  });

  it('下影线计算', () => {
    const kline = { date: '', open: 10, high: 12, low: 9, close: 11, volume: 0 };
    expect(calculateLowerShadow(kline)).toBe(1); // 10 - 9
  });

  it('实体长度', () => {
    const kline = { date: '', open: 10, high: 12, low: 9, close: 11, volume: 0 };
    expect(calculateBody(kline)).toBe(1); // |11 - 10|
  });

  it('锤子线检测', () => {
    const hammer = { date: '', open: 10, high: 10.2, low: 8, close: 10.2, volume: 0 };
    expect(isHammer(hammer)).toBe(true);
  });

  it('非锤子线', () => {
    const normal = { date: '', open: 10, high: 12, low: 9, close: 11, volume: 0 };
    expect(isHammer(normal)).toBe(false);
  });

  it('十字星检测', () => {
    const doji = { date: '', open: 10, high: 10.5, low: 9.5, close: 10, volume: 0 };
    expect(isDoji(doji)).toBe(true);
  });

  it('非十字星', () => {
    const normal = { date: '', open: 10, high: 12, low: 9, close: 11, volume: 0 };
    expect(isDoji(normal)).toBe(false);
  });
});

// ---- 已迁移：涨跌颜色 / 涨跌幅格式化 ----
// 生产 getColorByChange 接收“涨跌值”本身（UI 由后端 changePercent 驱动），不是 (现价, 昨收)。
// 旧内联用 #e74c3c/#27ae60/#95a5a6，生产 hex 为 #ef4444/#22c55e/#6b7280。
describe('涨跌幅显示', () => {
  it('上涨红色', () => {
    expect(getColorByChange(1)).toBe('#ef4444');
  });

  it('下跌绿色', () => {
    expect(getColorByChange(-1)).toBe('#22c55e');
  });

  it('平盘灰色', () => {
    expect(getColorByChange(0)).toBe('#6b7280');
  });

  // 生产 formatChangePercent(percent) 只接收百分比数值；旧签名 (current, previous) 已删除。
  // 旧用例 formatChangePercent(11, 10) 等价于生产 formatChangePercent(10)。
  it('涨幅格式化带+号', () => {
    expect(formatChangePercent(10)).toBe('+10.00%');
  });

  it('跌幅格式化带-号', () => {
    expect(formatChangePercent(-10)).toBe('-10.00%');
  });

  // 旧断言 '0.00%'（previous === 0 守卫）→ 生产 percent >= 0 一律加 '+'，返回 '+0.00%'。
  it('零涨跌幅带+号（生产口径）', () => {
    expect(formatChangePercent(0)).toBe('+0.00%');
  });

  it('小数涨跌幅', () => {
    expect(formatChangePercent(1.5)).toBe('+1.50%');
  });

  it('大幅涨跌', () => {
    expect(formatChangePercent(10)).toBe('+10.00%');
    expect(formatChangePercent(-10)).toBe('-10.00%');
  });
});

// ---- 已迁移：大数值 / 成交量 / 市值 ----
// 生产 formatLargeNumber 是千分位（formatters.ts:219），不是万亿/亿/万缩写。
// 旧内联实现其实是 dataTransformUtils.ts:45 formatAmount 的副本（无负号分支），已删除。
describe('大数值格式化（千分位）', () => {
  it('2.5e12 千分位', () => {
    expect(formatLargeNumber(2.5e12)).toBe('2,500,000,000,000');
  });

  it('5e8 千分位', () => {
    expect(formatLargeNumber(5e8)).toBe('500,000,000');
  });

  it('1.5e4 千分位', () => {
    expect(formatLargeNumber(1.5e4)).toBe('15,000');
  });

  it('小于万仍千分位', () => {
    expect(formatLargeNumber(5000)).toBe('5,000');
  });

  // 生产 formatVolume 带“手”单位（亿手/万手/手）。
  it('成交量格式化', () => {
    expect(formatVolume(1e9)).toBe('10.00亿手');
  });

  it('市值格式化', () => {
    expect(formatMarketCap(500e8)).toBe('500.00亿');
  });

  it('零值', () => {
    expect(formatLargeNumber(0)).toBe('0');
  });

  it('负值处理', () => {
    expect(formatLargeNumber(-5e8)).toBe('-500,000,000');
  });

  // 生产缺口：formatMarketCap 无 abs/sign 分支，负值落到 toFixed(2) 原值分支。
  it('市值负值落入原值分支（生产缺口）', () => {
    expect(formatMarketCap(-5e8)).toBe('-500000000.00');
  });
});

// ---- 已迁移：单列排序（dataTransformUtils.sortByField） ----
describe('表格排序', () => {
  it('数字升序', () => {
    const data = [{ price: 10 }, { price: 5 }, { price: 15 }];
    const sorted = sortByField(data, 'price', 'asc');
    expect(sorted.map(d => d.price)).toEqual([5, 10, 15]);
  });

  it('数字降序', () => {
    const data = [{ price: 10 }, { price: 5 }, { price: 15 }];
    const sorted = sortByField(data, 'price', 'desc');
    expect(sorted.map(d => d.price)).toEqual([15, 10, 5]);
  });

  it('字符串排序', () => {
    const data = [{ name: 'C' }, { name: 'A' }, { name: 'B' }];
    const sorted = sortByField(data, 'name', 'asc');
    expect(sorted.map(d => d.name)).toEqual(['A', 'B', 'C']);
  });

  it('不修改原数组', () => {
    const data = [{ price: 10 }, { price: 5 }];
    sortByField(data, 'price', 'asc');
    expect(data[0].price).toBe(10);
  });

  it('空数组排序', () => {
    expect(sortByField([], 'price', 'asc')).toEqual([]);
  });

  it('单元素排序', () => {
    const data = [{ price: 10 }];
    expect(sortByField(data, 'price', 'asc')).toEqual([{ price: 10 }]);
  });

  it('混合数据按涨跌幅排序', () => {
    const data = [
      { name: 'A', change: -3.5 },
      { name: 'B', change: 2.1 },
      { name: 'C', change: 0 }
    ];
    const sorted = sortByField(data, 'change', 'desc');
    expect(sorted[0].name).toBe('B');
    expect(sorted[2].name).toBe('A');
  });
});

// ---- 未迁移：生产无导出纯函数（useStockStore.ts:398 searchStocks 为 zustand action） ----
function filterStocksByKeyword<T extends { code: string; name: string }>(
  stocks: T[], keyword: string
): T[] {
  if (!keyword) return stocks;
  const lower = keyword.toLowerCase();
  return stocks.filter(s =>
    s.code.toLowerCase().includes(lower) ||
    s.name.toLowerCase().includes(lower)
  );
}

describe('股票搜索过滤', () => {
  const stocks = [
    { code: '600519', name: '贵州茅台' },
    { code: '000001', name: '平安银行' },
    { code: '002415', name: '海康威视' }
  ];

  it('按代码搜索', () => {
    expect(filterStocksByKeyword(stocks, '600')).toHaveLength(1);
  });

  it('按名称搜索', () => {
    expect(filterStocksByKeyword(stocks, '茅台')).toHaveLength(1);
  });

  it('空关键词返回全部', () => {
    expect(filterStocksByKeyword(stocks, '')).toHaveLength(3);
  });

  it('无匹配返回空', () => {
    expect(filterStocksByKeyword(stocks, 'XYZ')).toHaveLength(0);
  });

  it('大小写不敏感代码', () => {
    expect(filterStocksByKeyword(stocks, '600519')).toHaveLength(1);
  });

  it('部分匹配', () => {
    expect(filterStocksByKeyword(stocks, '平安')).toHaveLength(1);
  });
});

// ---- 未迁移：dataTable.ts:38 DataTableProcessor 无 totalPages/pageRange/isValidPage 导出 ----
function calculatePagination(total: number, pageSize: number, currentPage: number) {
  const totalPages = Math.ceil(total / pageSize);
  const startIndex = (currentPage - 1) * pageSize;
  const endIndex = Math.min(startIndex + pageSize, total);

  return {
    totalPages,
    startIndex,
    endIndex,
    hasNext: currentPage < totalPages,
    hasPrev: currentPage > 1,
    isFirstPage: currentPage === 1,
    isLastPage: currentPage === totalPages
  };
}

describe('分页计算', () => {
  it('计算总页数', () => {
    expect(calculatePagination(100, 10, 1).totalPages).toBe(10);
  });

  it('计算起始索引', () => {
    expect(calculatePagination(100, 10, 3).startIndex).toBe(20);
  });

  it('计算结束索引', () => {
    expect(calculatePagination(100, 10, 3).endIndex).toBe(30);
  });

  it('最后一页不满页', () => {
    const p = calculatePagination(95, 10, 10);
    expect(p.endIndex).toBe(95);
  });

  it('hasNext', () => {
    expect(calculatePagination(100, 10, 5).hasNext).toBe(true);
    expect(calculatePagination(100, 10, 10).hasNext).toBe(false);
  });

  it('hasPrev', () => {
    expect(calculatePagination(100, 10, 1).hasPrev).toBe(false);
    expect(calculatePagination(100, 10, 5).hasPrev).toBe(true);
  });

  it('空数据分页', () => {
    const p = calculatePagination(0, 10, 1);
    expect(p.totalPages).toBe(0);
  });

  it('总页数向上取整', () => {
    expect(calculatePagination(101, 10, 1).totalPages).toBe(11);
  });
});
