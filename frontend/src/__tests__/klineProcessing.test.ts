import { describe, it, expect } from 'vitest';

// K线数据处理
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

// 涨跌幅着色
function getChangeColor(current: number, previous: number): string {
  if (current > previous) return '#e74c3c'; // 红涨
  if (current < previous) return '#27ae60'; // 绿跌
  return '#95a5a6'; // 平盘
}

function formatChangePercent(current: number, previous: number): string {
  if (previous === 0) return '0.00%';
  const change = ((current - previous) / previous) * 100;
  const sign = change > 0 ? '+' : '';
  return `${sign}${change.toFixed(2)}%`;
}

describe('涨跌幅显示', () => {
  it('上涨红色', () => {
    expect(getChangeColor(11, 10)).toBe('#e74c3c');
  });

  it('下跌绿色', () => {
    expect(getChangeColor(9, 10)).toBe('#27ae60');
  });

  it('平盘灰色', () => {
    expect(getChangeColor(10, 10)).toBe('#95a5a6');
  });

  it('涨幅格式化带+号', () => {
    expect(formatChangePercent(11, 10)).toBe('+10.00%');
  });

  it('跌幅格式化带-号', () => {
    expect(formatChangePercent(9, 10)).toBe('-10.00%');
  });

  it('零基期返回0%', () => {
    expect(formatChangePercent(10, 0)).toBe('0.00%');
  });

  it('小数涨跌幅', () => {
    expect(formatChangePercent(10.15, 10)).toBe('+1.50%');
  });

  it('大幅涨跌', () => {
    expect(formatChangePercent(110, 100)).toBe('+10.00%');
    expect(formatChangePercent(90, 100)).toBe('-10.00%');
  });
});

// 数值格式化
function formatLargeNumber(num: number): string {
  if (num >= 1e12) return (num / 1e12).toFixed(2) + '万亿';
  if (num >= 1e8) return (num / 1e8).toFixed(2) + '亿';
  if (num >= 1e4) return (num / 1e4).toFixed(2) + '万';
  return num.toFixed(2);
}

function formatVolume(volume: number): string {
  return formatLargeNumber(volume);
}

function formatMarketCap(cap: number): string {
  return formatLargeNumber(cap);
}

describe('大数值格式化', () => {
  it('万亿级别', () => {
    expect(formatLargeNumber(2.5e12)).toBe('2.50万亿');
  });

  it('亿级别', () => {
    expect(formatLargeNumber(5e8)).toBe('5.00亿');
  });

  it('万级别', () => {
    expect(formatLargeNumber(1.5e4)).toBe('1.50万');
  });

  it('小于万的原样返回', () => {
    expect(formatLargeNumber(5000)).toBe('5000.00');
  });

  it('成交量格式化', () => {
    expect(formatVolume(1e9)).toBe('10.00亿');
  });

  it('市值格式化', () => {
    expect(formatMarketCap(500e8)).toBe('500.00亿');
  });

  it('零值', () => {
    expect(formatLargeNumber(0)).toBe('0.00');
  });

  it('负值处理', () => {
    expect(formatLargeNumber(-5e8)).toBe('-500000000.00'); // negative falls through to default
  });
});

// 表格排序
function sortStockData<T extends Record<string, any>>(
  data: T[],
  key: string,
  order: 'asc' | 'desc'
): T[] {
  return [...data].sort((a, b) => {
    const aVal = a[key];
    const bVal = b[key];
    
    if (typeof aVal === 'number' && typeof bVal === 'number') {
      return order === 'asc' ? aVal - bVal : bVal - aVal;
    }
    
    const aStr = String(aVal);
    const bStr = String(bVal);
    return order === 'asc' ? aStr.localeCompare(bStr) : bStr.localeCompare(aStr);
  });
}

describe('表格排序', () => {
  it('数字升序', () => {
    const data = [{ price: 10 }, { price: 5 }, { price: 15 }];
    const sorted = sortStockData(data, 'price', 'asc');
    expect(sorted.map(d => d.price)).toEqual([5, 10, 15]);
  });

  it('数字降序', () => {
    const data = [{ price: 10 }, { price: 5 }, { price: 15 }];
    const sorted = sortStockData(data, 'price', 'desc');
    expect(sorted.map(d => d.price)).toEqual([15, 10, 5]);
  });

  it('字符串排序', () => {
    const data = [{ name: 'C' }, { name: 'A' }, { name: 'B' }];
    const sorted = sortStockData(data, 'name', 'asc');
    expect(sorted.map(d => d.name)).toEqual(['A', 'B', 'C']);
  });

  it('不修改原数组', () => {
    const data = [{ price: 10 }, { price: 5 }];
    sortStockData(data, 'price', 'asc');
    expect(data[0].price).toBe(10);
  });

  it('空数组排序', () => {
    expect(sortStockData([], 'price', 'asc')).toEqual([]);
  });

  it('单元素排序', () => {
    const data = [{ price: 10 }];
    expect(sortStockData(data, 'price', 'asc')).toEqual([{ price: 10 }]);
  });

  it('混合数据按涨跌幅排序', () => {
    const data = [
      { name: 'A', change: -3.5 },
      { name: 'B', change: 2.1 },
      { name: 'C', change: 0 }
    ];
    const sorted = sortStockData(data, 'change', 'desc');
    expect(sorted[0].name).toBe('B');
    expect(sorted[2].name).toBe('A');
  });
});

// 搜索过滤
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

// 分页计算
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
