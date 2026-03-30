import { describe, it, expect } from 'vitest';

// Pagination utility
describe('Pagination Utility', () => {
  const paginate = <T>(items: T[], page: number, pageSize: number) => {
    const total = items.length;
    const totalPages = Math.ceil(total / pageSize);
    const start = (page - 1) * pageSize;
    const end = Math.min(start + pageSize, total);
    return {
      data: items.slice(start, end),
      pagination: {
        page, pageSize, total, totalPages,
        hasNext: page < totalPages,
        hasPrev: page > 1,
        startIndex: start + 1,
        endIndex: end
      }
    };
  };

  it('should paginate first page', () => {
    const result = paginate([1, 2, 3, 4, 5], 1, 2);
    expect(result.data).toEqual([1, 2]);
    expect(result.pagination.page).toBe(1);
    expect(result.pagination.hasNext).toBe(true);
    expect(result.pagination.hasPrev).toBe(false);
  });

  it('should paginate middle page', () => {
    const result = paginate([1, 2, 3, 4, 5], 2, 2);
    expect(result.data).toEqual([3, 4]);
    expect(result.pagination.hasNext).toBe(true);
    expect(result.pagination.hasPrev).toBe(true);
  });

  it('should paginate last page', () => {
    const result = paginate([1, 2, 3, 4, 5], 3, 2);
    expect(result.data).toEqual([5]);
    expect(result.pagination.hasNext).toBe(false);
    expect(result.pagination.hasPrev).toBe(true);
    expect(result.pagination.totalPages).toBe(3);
  });

  it('should handle empty array', () => {
    const result = paginate([], 1, 10);
    expect(result.data).toEqual([]);
    expect(result.pagination.total).toBe(0);
    expect(result.pagination.totalPages).toBe(0);
  });

  it('should handle page beyond total', () => {
    const result = paginate([1, 2, 3], 10, 2);
    expect(result.data).toEqual([]);
    expect(result.pagination.hasNext).toBe(false);
  });

  it('should handle pageSize larger than total', () => {
    const result = paginate([1, 2], 1, 100);
    expect(result.data).toEqual([1, 2]);
    expect(result.pagination.totalPages).toBe(1);
  });

  it('should calculate startIndex and endIndex', () => {
    const result = paginate([1, 2, 3, 4, 5], 2, 2);
    expect(result.pagination.startIndex).toBe(3);
    expect(result.pagination.endIndex).toBe(4);
  });

  it('should handle pageSize=1', () => {
    const result = paginate([1, 2, 3], 2, 1);
    expect(result.data).toEqual([2]);
    expect(result.pagination.totalPages).toBe(3);
  });

  it('should handle exact page fit', () => {
    const result = paginate([1, 2, 3, 4], 2, 2);
    expect(result.data).toEqual([3, 4]);
    expect(result.pagination.totalPages).toBe(2);
  });

  it('should handle page 0 gracefully', () => {
    const result = paginate([1, 2, 3], 0, 2);
    expect(result.data).toEqual([]);
    expect(result.pagination.hasPrev).toBe(false);
  });

  it('should handle negative page', () => {
    const result = paginate([1, 2, 3], -1, 2);
    expect(result.data.length).toBeLessThanOrEqual(2);
  });

  it('should calculate correct total for large dataset', () => {
    const items = Array.from({ length: 1000 }, (_, i) => i);
    const result = paginate(items, 50, 20);
    expect(result.pagination.total).toBe(1000);
    expect(result.pagination.totalPages).toBe(50);
    expect(result.data).toHaveLength(20);
    expect(result.data[0]).toBe(980);
  });
});

// Sorting utility
describe('Sorting Utility', () => {
  const multiSort = <T>(items: T[], sorters: Array<{ key: keyof T; order: 'asc' | 'desc' }>) => {
    return [...items].sort((a, b) => {
      for (const { key, order } of sorters) {
        const va = a[key], vb = b[key];
        if (va === vb) continue;
        const cmp = va < vb ? -1 : 1;
        return order === 'asc' ? cmp : -cmp;
      }
      return 0;
    });
  };

  it('should sort ascending', () => {
    const result = multiSort([{ v: 3 }, { v: 1 }, { v: 2 }], [{ key: 'v', order: 'asc' }]);
    expect(result.map(r => r.v)).toEqual([1, 2, 3]);
  });

  it('should sort descending', () => {
    const result = multiSort([{ v: 1 }, { v: 3 }, { v: 2 }], [{ key: 'v', order: 'desc' }]);
    expect(result.map(r => r.v)).toEqual([3, 2, 1]);
  });

  it('should handle multi-key sort', () => {
    const data = [
      { a: 1, b: 2 }, { a: 1, b: 1 }, { a: 2, b: 1 }
    ];
    const result = multiSort(data, [
      { key: 'a', order: 'asc' },
      { key: 'b', order: 'asc' }
    ]);
    expect(result[0].b).toBe(1);
    expect(result[1].b).toBe(2);
    expect(result[2].a).toBe(2);
  });

  it('should handle string sort', () => {
    const result = multiSort(
      [{ name: 'banana' }, { name: 'apple' }, { name: 'cherry' }],
      [{ key: 'name', order: 'asc' }]
    );
    expect(result.map(r => r.name)).toEqual(['apple', 'banana', 'cherry']);
  });

  it('should not mutate original', () => {
    const original = [{ v: 3 }, { v: 1 }];
    multiSort(original, [{ key: 'v', order: 'asc' }]);
    expect(original[0].v).toBe(3);
  });

  it('should handle empty array', () => {
    expect(multiSort([], [{ key: 'v' as any, order: 'asc' }])).toEqual([]);
  });

  it('should handle single element', () => {
    const result = multiSort([{ v: 1 }], [{ key: 'v', order: 'asc' }]);
    expect(result).toHaveLength(1);
  });

  it('should handle equal values', () => {
    const result = multiSort([{ v: 1 }, { v: 1 }, { v: 1 }], [{ key: 'v', order: 'asc' }]);
    expect(result).toHaveLength(3);
  });

  it('should handle no sorters', () => {
    const data = [{ v: 3 }, { v: 1 }];
    const result = multiSort(data, []);
    expect(result[0].v).toBe(3);
  });

  it('should handle mixed types gracefully', () => {
    const data = [{ v: 'b' as any }, { v: 'a' as any }];
    const result = multiSort(data, [{ key: 'v', order: 'asc' }]);
    expect(result[0].v).toBe('a');
  });
});

// Group by utility
describe('Group By Utility', () => {
  const groupBy = <T>(items: T[], keyFn: (item: T) => string): Record<string, T[]> => {
    const result: Record<string, T[]> = {};
    for (const item of items) {
      const key = keyFn(item);
      if (!result[key]) result[key] = [];
      result[key].push(item);
    }
    return result;
  };

  it('should group by single key', () => {
    const result = groupBy(
      [{ type: 'A', v: 1 }, { type: 'B', v: 2 }, { type: 'A', v: 3 }],
      item => item.type
    );
    expect(result['A']).toHaveLength(2);
    expect(result['B']).toHaveLength(1);
  });

  it('should handle empty array', () => {
    const result = groupBy([], () => 'key');
    expect(Object.keys(result)).toHaveLength(0);
  });

  it('should handle single group', () => {
    const result = groupBy([{ v: 1 }, { v: 2 }], () => 'all');
    expect(result['all']).toHaveLength(2);
  });

  it('should preserve item order within groups', () => {
    const result = groupBy(
      [{ type: 'A', v: 1 }, { type: 'A', v: 3 }, { type: 'A', v: 2 }],
      item => item.type
    );
    expect(result['A'].map(i => i.v)).toEqual([1, 3, 2]);
  });

  it('should handle unique keys', () => {
    const result = groupBy(
      [{ id: 'a' }, { id: 'b' }, { id: 'c' }],
      item => item.id
    );
    expect(Object.keys(result)).toHaveLength(3);
  });

  it('should group by numeric computation', () => {
    const result = groupBy(
      [{ v: 1 }, { v: 10 }, { v: 15 }, { v: 25 }],
      item => item.v < 10 ? 'low' : item.v < 20 ? 'mid' : 'high'
    );
    expect(result['low']).toHaveLength(1);
    expect(result['mid']).toHaveLength(2);
    expect(result['high']).toHaveLength(1);
  });

  it('should handle all items in one group', () => {
    const result = groupBy([1, 2, 3, 4, 5].map(v => ({ v })), () => 'single');
    expect(result['single']).toHaveLength(5);
  });

  it('should handle each item in its own group', () => {
    const items = Array.from({ length: 10 }, (_, i) => ({ id: i }));
    const result = groupBy(items, item => String(item.id));
    expect(Object.keys(result)).toHaveLength(10);
  });
});

// Deduplication utility
describe('Deduplication Utility', () => {
  const dedupBy = <T>(items: T[], keyFn: (item: T) => string): T[] => {
    const seen = new Set<string>();
    return items.filter(item => {
      const key = keyFn(item);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  };

  it('should remove duplicates', () => {
    const result = dedupBy([{ id: 1 }, { id: 1 }, { id: 2 }], item => String(item.id));
    expect(result).toHaveLength(2);
  });

  it('should keep first occurrence', () => {
    const result = dedupBy(
      [{ id: 1, v: 'a' }, { id: 1, v: 'b' }],
      item => String(item.id)
    );
    expect(result[0].v).toBe('a');
  });

  it('should handle no duplicates', () => {
    const result = dedupBy([{ id: 1 }, { id: 2 }], item => String(item.id));
    expect(result).toHaveLength(2);
  });

  it('should handle empty array', () => {
    expect(dedupBy([], () => 'key')).toEqual([]);
  });

  it('should handle all duplicates', () => {
    const result = dedupBy([{ id: 1 }, { id: 1 }, { id: 1 }], item => String(item.id));
    expect(result).toHaveLength(1);
  });

  it('should handle complex key function', () => {
    const items = [
      { a: 1, b: 2 }, { a: 1, b: 2 }, { a: 1, b: 3 }
    ];
    const result = dedupBy(items, item => `${item.a}-${item.b}`);
    expect(result).toHaveLength(2);
  });

  it('should handle 1000 items efficiently', () => {
    const items = Array.from({ length: 1000 }, (_, i) => ({ id: i % 100 }));
    const result = dedupBy(items, item => String(item.id));
    expect(result).toHaveLength(100);
  });

  it('should handle string dedup', () => {
    const result = dedupBy(['a', 'b', 'a', 'c', 'b'], s => s);
    expect(result).toEqual(['a', 'b', 'c']);
  });
});

// Range filter utility
describe('Range Filter Utility', () => {
  const rangeFilter = <T extends Record<string, number>>(
    items: T[],
    filters: Partial<Record<keyof T, { min?: number; max?: number }>>
  ) => {
    return items.filter(item => {
      for (const [key, range] of Object.entries(filters)) {
        const val = item[key];
        if (range === undefined) continue;
        if (range.min !== undefined && val < range.min) return false;
        if (range.max !== undefined && val > range.max) return false;
      }
      return true;
    });
  };

  it('should filter by min', () => {
    const result = rangeFilter([{ v: 1 }, { v: 5 }, { v: 10 }], { v: { min: 3 } });
    expect(result).toHaveLength(2);
    expect(result.every(i => i.v >= 3)).toBe(true);
  });

  it('should filter by max', () => {
    const result = rangeFilter([{ v: 1 }, { v: 5 }, { v: 10 }], { v: { max: 5 } });
    expect(result).toHaveLength(2);
  });

  it('should filter by range', () => {
    const result = rangeFilter([{ v: 1 }, { v: 5 }, { v: 10 }], { v: { min: 3, max: 8 } });
    expect(result).toHaveLength(1);
    expect(result[0].v).toBe(5);
  });

  it('should handle multiple fields', () => {
    const result = rangeFilter(
      [{ pe: 10, pb: 1 }, { pe: 20, pb: 3 }, { pe: 15, pb: 2 }],
      { pe: { max: 15 }, pb: { max: 2 } }
    );
    expect(result).toHaveLength(2);
  });

  it('should handle empty filters', () => {
    const result = rangeFilter([{ v: 1 }, { v: 5 }], {});
    expect(result).toHaveLength(2);
  });

  it('should handle empty items', () => {
    const result = rangeFilter([], { v: { min: 0 } });
    expect(result).toHaveLength(0);
  });

  it('should handle inclusive boundaries', () => {
    const result = rangeFilter([{ v: 5 }], { v: { min: 5, max: 5 } });
    expect(result).toHaveLength(1);
  });

  it('should handle negative values', () => {
    const result = rangeFilter([{ v: -5 }, { v: 0 }, { v: 5 }], { v: { min: 0 } });
    expect(result).toHaveLength(2);
  });

  it('should handle no matching items', () => {
    const result = rangeFilter([{ v: 1 }, { v: 2 }], { v: { min: 100 } });
    expect(result).toHaveLength(0);
  });

  it('should handle all matching items', () => {
    const result = rangeFilter([{ v: 1 }, { v: 2 }, { v: 3 }], { v: { min: 0, max: 100 } });
    expect(result).toHaveLength(3);
  });
});

// Percentile calculation
describe('Percentile Calculation', () => {
  const percentile = (values: number[], p: number): number => {
    if (values.length === 0) return 0;
    const sorted = [...values].sort((a, b) => a - b);
    const idx = (p / 100) * (sorted.length - 1);
    const lower = Math.floor(idx);
    const upper = Math.ceil(idx);
    if (lower === upper) return sorted[lower];
    return sorted[lower] + (sorted[upper] - sorted[lower]) * (idx - lower);
  };

  it('should calculate P50 (median)', () => {
    expect(percentile([1, 2, 3, 4, 5], 50)).toBe(3);
  });

  it('should calculate P0', () => {
    expect(percentile([10, 20, 30], 0)).toBe(10);
  });

  it('should calculate P100', () => {
    expect(percentile([10, 20, 30], 100)).toBe(30);
  });

  it('should handle interpolation', () => {
    const p25 = percentile([1, 2, 3, 4], 25);
    expect(p25).toBeGreaterThan(1);
    expect(p25).toBeLessThan(2);
  });

  it('should handle empty array', () => {
    expect(percentile([], 50)).toBe(0);
  });

  it('should handle single element', () => {
    expect(percentile([42], 50)).toBe(42);
  });

  it('should handle two elements P50', () => {
    expect(percentile([10, 20], 50)).toBe(15);
  });

  it('should handle uniform distribution', () => {
    const values = Array.from({ length: 101 }, (_, i) => i);
    expect(percentile(values, 0)).toBe(0);
    expect(percentile(values, 50)).toBe(50);
    expect(percentile(values, 100)).toBe(100);
  });

  it('should handle duplicate values', () => {
    expect(percentile([5, 5, 5, 5, 5], 50)).toBe(5);
    expect(percentile([5, 5, 5, 5, 5], 0)).toBe(5);
  });

  it('should handle negative values', () => {
    expect(percentile([-10, 0, 10], 50)).toBe(0);
  });

  it('should handle decimal values', () => {
    const result = percentile([1.1, 2.2, 3.3], 50);
    expect(result).toBeCloseTo(2.2, 1);
  });

  it('should calculate P95', () => {
    const values = Array.from({ length: 100 }, (_, i) => i + 1);
    const p95 = percentile(values, 95);
    expect(p95).toBeGreaterThan(90);
    expect(p95).toBeLessThanOrEqual(100);
  });
});
