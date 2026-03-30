import { describe, it, expect } from 'vitest';

describe('TableSortingFiltering', () => {
  interface TableColumn<T> {
    key: keyof T;
    title: string;
    sortable: boolean;
    filterable: boolean;
    type: 'number' | 'string' | 'date' | 'percent';
    render?: (value: T[keyof T]) => string;
  }

  type SortDirection = 'asc' | 'desc';

  function sortData<T>(data: T[], key: keyof T, direction: SortDirection): T[] {
    return [...data].sort((a, b) => {
      const aVal = a[key];
      const bVal = b[key];
      if (typeof aVal === 'number' && typeof bVal === 'number') {
        return direction === 'asc' ? aVal - bVal : bVal - aVal;
      }
      const aStr = String(aVal);
      const bStr = String(bVal);
      const cmp = aStr.localeCompare(bStr);
      return direction === 'asc' ? cmp : -cmp;
    });
  }

  function filterData<T>(data: T[], key: keyof T, value: string): T[] {
    return data.filter(item => String(item[key]).toLowerCase().includes(value.toLowerCase()));
  }

  function paginateData<T>(data: T[], page: number, pageSize: number): { data: T[]; total: number; totalPages: number; hasNext: boolean; hasPrev: boolean } {
    const total = data.length;
    const totalPages = Math.ceil(total / pageSize);
    const start = (page - 1) * pageSize;
    const end = start + pageSize;
    return {
      data: data.slice(start, end),
      total,
      totalPages,
      hasNext: page < totalPages,
      hasPrev: page > 1,
    };
  }

  interface StockRow {
    symbol: string;
    name: string;
    price: number;
    changePercent: number;
    volume: number;
    pe: number;
  }

  const rows: StockRow[] = [
    { symbol: '600519', name: '贵州茅台', price: 1800, changePercent: 2.86, volume: 30000, pe: 40 },
    { symbol: '000858', name: '五粮液', price: 168, changePercent: 3.38, volume: 250000, pe: 28 },
    { symbol: '300750', name: '宁德时代', price: 210, changePercent: -3.67, volume: 400000, pe: 35 },
    { symbol: '000001', name: '平安银行', price: 12.5, changePercent: -9.42, volume: 800000, pe: 5 },
    { symbol: '688981', name: '中芯国际', price: 55, changePercent: 0, volume: 150000, pe: 50 },
    { symbol: '002594', name: '比亚迪', price: 260, changePercent: 4.0, volume: 350000, pe: 45 },
    { symbol: '601318', name: '中国平安', price: 48, changePercent: 1.2, volume: 500000, pe: 8 },
    { symbol: '600036', name: '招商银行', price: 35, changePercent: -0.5, volume: 320000, pe: 6 },
  ];

  it('should sort by price ascending', () => {
    const result = sortData(rows, 'price', 'asc');
    for (let i = 1; i < result.length; i++) {
      expect(result[i].price).toBeGreaterThanOrEqual(result[i - 1].price);
    }
  });

  it('should sort by price descending', () => {
    const result = sortData(rows, 'price', 'desc');
    for (let i = 1; i < result.length; i++) {
      expect(result[i].price).toBeLessThanOrEqual(result[i - 1].price);
    }
  });

  it('should sort by name alphabetically', () => {
    const result = sortData(rows, 'name', 'asc');
    for (let i = 1; i < result.length; i++) {
      expect(result[i].name.localeCompare(result[i - 1].name)).toBeGreaterThanOrEqual(0);
    }
  });

  it('should sort by changePercent descending', () => {
    const result = sortData(rows, 'changePercent', 'desc');
    for (let i = 1; i < result.length; i++) {
      expect(result[i].changePercent).toBeLessThanOrEqual(result[i - 1].changePercent);
    }
  });

  it('should filter by name', () => {
    const result = filterData(rows, 'name', '茅台');
    expect(result).toHaveLength(1);
    expect(result[0].symbol).toBe('600519');
  });

  it('should filter case-insensitively', () => {
    const result = filterData(rows, 'name', '平安');
    expect(result.length).toBeGreaterThanOrEqual(1);
  });

  it('should paginate correctly page 1', () => {
    const result = paginateData(rows, 1, 3);
    expect(result.data).toHaveLength(3);
    expect(result.total).toBe(8);
    expect(result.totalPages).toBe(3);
    expect(result.hasNext).toBe(true);
    expect(result.hasPrev).toBe(false);
  });

  it('should paginate correctly last page', () => {
    const result = paginateData(rows, 3, 3);
    expect(result.data).toHaveLength(2);
    expect(result.hasNext).toBe(false);
    expect(result.hasPrev).toBe(true);
  });

  it('should paginate with single item per page', () => {
    const result = paginateData(rows, 1, 1);
    expect(result.data).toHaveLength(1);
    expect(result.totalPages).toBe(8);
  });

  it('should handle empty data sort', () => {
    const result = sortData([], 'price', 'asc');
    expect(result).toHaveLength(0);
  });

  it('should handle empty data filter', () => {
    const result = filterData([], 'name', 'test');
    expect(result).toHaveLength(0);
  });

  it('should handle empty data pagination', () => {
    const result = paginateData([], 1, 10);
    expect(result.data).toHaveLength(0);
    expect(result.totalPages).toBe(0);
    expect(result.hasNext).toBe(false);
  });

  it('should handle out-of-range page', () => {
    const result = paginateData(rows, 100, 3);
    expect(result.data).toHaveLength(0);
    expect(result.hasPrev).toBe(true);
  });

  it('should combine sort and filter', () => {
    const filtered = filterData(rows, 'name', '');
    const sorted = sortData(filtered, 'volume', 'desc');
    expect(sorted[0].volume).toBeGreaterThanOrEqual(sorted[sorted.length - 1].volume);
  });

  it('should not mutate original data', () => {
    const original = [...rows];
    sortData(rows, 'price', 'desc');
    filterData(rows, 'name', '茅台');
    paginateData(rows, 1, 3);
    expect(rows).toEqual(original);
  });

  it('should handle sort with duplicate values', () => {
    const data = [
      { symbol: 'A', name: 'A', price: 100, changePercent: 1, volume: 1000, pe: 10 },
      { symbol: 'B', name: 'B', price: 100, changePercent: 1, volume: 1000, pe: 10 },
      { symbol: 'C', name: 'C', price: 100, changePercent: 1, volume: 1000, pe: 10 },
    ];
    const result = sortData(data, 'price', 'asc');
    expect(result).toHaveLength(3);
  });
});
