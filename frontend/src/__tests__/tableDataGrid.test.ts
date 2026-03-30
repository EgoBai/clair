import { describe, it, expect } from 'vitest';

// Table & Data Grid Logic
interface Column<T> {
  key: keyof T;
  label: string;
  sortable?: boolean;
  width?: number;
  align?: 'left' | 'center' | 'right';
  render?: (value: any, row: T) => string;
}

function sortData<T>(data: T[], key: keyof T, direction: 'asc' | 'desc'): T[] {
  return [...data].sort((a, b) => {
    const va = a[key], vb = b[key];
    let cmp = 0;
    if (typeof va === 'number' && typeof vb === 'number') cmp = va - vb;
    else if (typeof va === 'string' && typeof vb === 'string') cmp = va.localeCompare(vb);
    else cmp = String(va).localeCompare(String(vb));
    return direction === 'asc' ? cmp : -cmp;
  });
}

function paginateData<T>(data: T[], page: number, pageSize: number): { items: T[]; total: number; totalPages: number; hasNext: boolean; hasPrev: boolean } {
  const total = data.length;
  const totalPages = Math.ceil(total / pageSize) || 1;
  const safePage = Math.max(1, Math.min(page, totalPages));
  const start = (safePage - 1) * pageSize;
  return {
    items: data.slice(start, start + pageSize),
    total,
    totalPages,
    hasNext: safePage < totalPages,
    hasPrev: safePage > 1
  };
}

function filterData<T extends Record<string, any>>(data: T[], filters: Record<string, any>): T[] {
  return data.filter(row => {
    for (const [key, filter] of Object.entries(filters)) {
      if (filter === undefined || filter === null || filter === '') continue;
      if (typeof filter === 'string') {
        if (!String(row[key]).toLowerCase().includes(filter.toLowerCase())) return false;
      } else if (typeof filter === 'object' && filter !== null) {
        if (filter.min !== undefined && row[key] < filter.min) return false;
        if (filter.max !== undefined && row[key] > filter.max) return false;
        if (filter.eq !== undefined && row[key] !== filter.eq) return false;
      }
    }
    return true;
  });
}

function groupBy<T extends Record<string, any>>(data: T[], key: keyof T): Record<string, T[]> {
  const groups: Record<string, T[]> = {};
  for (const item of data) {
    const groupKey = String(item[key]);
    if (!groups[groupKey]) groups[groupKey] = [];
    groups[groupKey].push(item);
  }
  return groups;
}

function aggregateColumn<T extends Record<string, any>>(data: T[], key: keyof T, operation: 'sum' | 'avg' | 'min' | 'max' | 'count'): number {
  const values = data.map(d => Number(d[key])).filter(v => !isNaN(v));
  if (values.length === 0) return 0;
  switch (operation) {
    case 'sum': return values.reduce((a, b) => a + b, 0);
    case 'avg': return values.reduce((a, b) => a + b, 0) / values.length;
    case 'min': return Math.min(...values);
    case 'max': return Math.max(...values);
    case 'count': return values.length;
  }
}

function getColumnWidths<T>(columns: Column<T>[], containerWidth: number): number[] {
  const fixedWidths = columns.filter(c => c.width).reduce((sum, c) => sum + (c.width || 0), 0);
  const flexColumns = columns.filter(c => !c.width).length;
  const remaining = containerWidth - fixedWidths;
  const flexWidth = flexColumns > 0 ? remaining / flexColumns : 0;
  return columns.map(c => c.width || flexWidth);
}

function exportToCSV<T extends Record<string, any>>(data: T[], columns: Column<T>[]): string {
  const header = columns.map(c => c.label).join(',');
  const rows = data.map(row => 
    columns.map(c => {
      const val = row[c.key];
      const str = c.render ? c.render(val, row) : String(val ?? '');
      return str.includes(',') || str.includes('"') ? `"${str.replace(/"/g, '""')}"` : str;
    }).join(',')
  );
  return [header, ...rows].join('\n');
}

describe('Table & Data Grid', () => {
  const testData = [
    { name: 'Alice', age: 30, score: 85, dept: 'Engineering' },
    { name: 'Bob', age: 25, score: 92, dept: 'Sales' },
    { name: 'Charlie', age: 35, score: 78, dept: 'Engineering' },
    { name: 'Diana', age: 28, score: 95, dept: 'Sales' },
    { name: 'Eve', age: 32, score: 88, dept: 'Marketing' },
  ];

  describe('Sorting', () => {
    it('should sort ascending by number', () => {
      const sorted = sortData(testData, 'age', 'asc');
      expect(sorted[0].name).toBe('Bob');
      expect(sorted[sorted.length - 1].name).toBe('Charlie');
    });

    it('should sort descending by number', () => {
      const sorted = sortData(testData, 'score', 'desc');
      expect(sorted[0].name).toBe('Diana');
    });

    it('should sort ascending by string', () => {
      const sorted = sortData(testData, 'name', 'asc');
      expect(sorted[0].name).toBe('Alice');
      expect(sorted[sorted.length - 1].name).toBe('Eve');
    });

    it('should not mutate original data', () => {
      const original = [...testData];
      sortData(testData, 'age', 'asc');
      expect(testData).toEqual(original);
    });

    it('should handle empty array', () => {
      expect(sortData([], 'age', 'asc')).toEqual([]);
    });
  });

  describe('Pagination', () => {
    it('should paginate correctly', () => {
      const result = paginateData(testData, 1, 2);
      expect(result.items).toHaveLength(2);
      expect(result.total).toBe(5);
      expect(result.totalPages).toBe(3);
      expect(result.hasNext).toBe(true);
      expect(result.hasPrev).toBe(false);
    });

    it('should handle last page', () => {
      const result = paginateData(testData, 3, 2);
      expect(result.items).toHaveLength(1);
      expect(result.hasNext).toBe(false);
      expect(result.hasPrev).toBe(true);
    });

    it('should clamp page to valid range', () => {
      const result = paginateData(testData, 100, 2);
      expect(result.items).toHaveLength(1); // last page
      expect(result.totalPages).toBe(3);
    });

    it('should handle page 0', () => {
      const result = paginateData(testData, 0, 2);
      expect(result.items.length).toBeGreaterThan(0);
    });

    it('should handle empty data', () => {
      const result = paginateData([], 1, 10);
      expect(result.items).toHaveLength(0);
      expect(result.total).toBe(0);
      expect(result.totalPages).toBe(1);
    });

    it('should handle pageSize > data length', () => {
      const result = paginateData(testData, 1, 100);
      expect(result.items).toHaveLength(5);
      expect(result.hasNext).toBe(false);
    });
  });

  describe('Filtering', () => {
    it('should filter by string contains', () => {
      const result = filterData(testData, { name: 'ali' });
      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('Alice');
    });

    it('should filter by number range', () => {
      const result = filterData(testData, { age: { min: 28, max: 32 } });
      expect(result.every(d => d.age >= 28 && d.age <= 32)).toBe(true);
    });

    it('should filter by exact match', () => {
      const result = filterData(testData, { dept: { eq: 'Engineering' } });
      expect(result).toHaveLength(2);
    });

    it('should combine filters (AND)', () => {
      const result = filterData(testData, { dept: { eq: 'Engineering' }, age: { min: 35 } });
      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('Charlie');
    });

    it('should skip empty filters', () => {
      expect(filterData(testData, { name: '', dept: null })).toHaveLength(5);
    });

    it('should return empty for no matches', () => {
      expect(filterData(testData, { name: 'zzzzz' })).toHaveLength(0);
    });
  });

  describe('Grouping', () => {
    it('should group by string key', () => {
      const groups = groupBy(testData, 'dept');
      expect(Object.keys(groups)).toContain('Engineering');
      expect(groups['Engineering']).toHaveLength(2);
    });

    it('should group by number key', () => {
      const data = [{ type: 1, v: 'a' }, { type: 1, v: 'b' }, { type: 2, v: 'c' }];
      const groups = groupBy(data, 'type');
      expect(groups['1']).toHaveLength(2);
      expect(groups['2']).toHaveLength(1);
    });

    it('should handle empty data', () => {
      expect(groupBy([], 'dept')).toEqual({});
    });
  });

  describe('Aggregation', () => {
    it('should sum values', () => {
      expect(aggregateColumn(testData, 'score', 'sum')).toBe(438);
    });

    it('should calculate average', () => {
      expect(aggregateColumn(testData, 'score', 'avg')).toBeCloseTo(87.6, 1);
    });

    it('should find min', () => {
      expect(aggregateColumn(testData, 'score', 'min')).toBe(78);
    });

    it('should find max', () => {
      expect(aggregateColumn(testData, 'score', 'max')).toBe(95);
    });

    it('should count values', () => {
      expect(aggregateColumn(testData, 'score', 'count')).toBe(5);
    });

    it('should handle empty data', () => {
      expect(aggregateColumn([], 'score', 'sum')).toBe(0);
    });
  });

  describe('Column Widths', () => {
    it('should distribute flex columns evenly', () => {
      const cols: Column<any>[] = [
        { key: 'a', label: 'A' },
        { key: 'b', label: 'B' },
      ];
      expect(getColumnWidths(cols, 200)).toEqual([100, 100]);
    });

    it('should respect fixed widths', () => {
      const cols: Column<any>[] = [
        { key: 'a', label: 'A', width: 50 },
        { key: 'b', label: 'B' },
      ];
      const widths = getColumnWidths(cols, 200);
      expect(widths[0]).toBe(50);
      expect(widths[1]).toBe(150);
    });

    it('should handle all fixed widths', () => {
      const cols: Column<any>[] = [
        { key: 'a', label: 'A', width: 100 },
        { key: 'b', label: 'B', width: 100 },
      ];
      expect(getColumnWidths(cols, 300)).toEqual([100, 100]);
    });
  });

  describe('CSV Export', () => {
    it('should export basic CSV', () => {
      const cols: Column<typeof testData[0]>[] = [
        { key: 'name', label: 'Name' },
        { key: 'age', label: 'Age' },
      ];
      const csv = exportToCSV(testData.slice(0, 2), cols);
      expect(csv).toContain('Name,Age');
      expect(csv).toContain('Alice,30');
    });

    it('should escape commas', () => {
      const data = [{ name: 'Hello, World', value: 42 }];
      const cols: Column<any>[] = [{ key: 'name', label: 'Name' }, { key: 'value', label: 'V' }];
      const csv = exportToCSV(data, cols);
      expect(csv).toContain('"Hello, World"');
    });

    it('should escape quotes', () => {
      const data = [{ name: 'Say "Hi"', value: 1 }];
      const cols: Column<any>[] = [{ key: 'name', label: 'Name' }, { key: 'value', label: 'V' }];
      const csv = exportToCSV(data, cols);
      expect(csv).toContain('""Hi""');
    });

    it('should handle empty data', () => {
      const cols: Column<any>[] = [{ key: 'a', label: 'A' }];
      const csv = exportToCSV([], cols);
      expect(csv).toBe('A');
    });

    it('should use render function', () => {
      const data = [{ val: 0.85 }];
      const cols: Column<any>[] = [{ key: 'val', label: 'V', render: (v: number) => `${(v * 100).toFixed(1)}%` }];
      const csv = exportToCSV(data, cols);
      expect(csv).toContain('85.0%');
    });
  });
});
