/**
 * 影子测试迁移（批次 17）
 *
 * 旧文件在测试内联了 sortData/paginateData/filterData/groupBy/aggregateColumn/
 * getColumnWidths/exportToCSV 的副本，断言的是副本而非生产实现。现已按语义等价
 * 分别 import exportEngine 与 bloombergExportEngine。
 *
 * 已绑定生产实现：
 * - sortData      → src/utils/exportEngine.ts:337    (data, key, order)；字符串直接用 localeCompare，与旧内联同口径
 * - exportToCSV   → src/utils/exportEngine.ts:148    返回 ExportResult，CSV 文本在 .content
 * - filterData    → src/utils/bloombergExportEngine.ts:584  声明式操作符数组（exportEngine 版仅 eq/gt/lt/contains）
 * - groupData     → src/utils/bloombergExportEngine.ts:628  (data, groupBy) => Map<string, rows>
 * - aggregateData → src/utils/bloombergExportEngine.ts:645  (data, aggregations) => { score_sum: ... }
 *
 * 未迁移（生产无对应导出，未迁移）：
 * - paginateData：生产无 totalPages/hasNext/hasPrev 导出。src/utils/dataTable.ts:38
 *   DataTableProcessor.paginate / execute 只返回 { page, pageSize, total }（:109-118）。
 * - getColumnWidths：列宽分配属表格 UI 布局，生产无导出纯函数；
 *   VirtualStockTable.tsx:85-91 直接写固定 px 宽，bloombergExportEngine.ts:336
 *   exportToExcel 的 wch 估算与容器宽度无关。
 *
 * 旧断言错在哪（旧内联副本 → 生产行为）：
 *
 * | 旧断言 | 生产输出 | 依据 |
 * | --- | --- | --- |
 * | contains 'ali' 命中 Alice（旧内联 toLowerCase 忽略大小写） | 0 行（生产 contains 区分大小写）；'Ali' 才命中 1 行 | bloombergExportEngine.ts:598 |
 * | filterData(data, { age: { min, max } }) 对象式区间，仅断言 every | 生产接收操作符数组：gte 28 + lte 32 → 3 行，补齐长度断言 | bloombergExportEngine.ts:595-596 |
 * | filterData(data, { name: '', dept: null }) 跳过空值 → 5 行 | 生产不做空值归一化；空操作符数组 [] → 5 行 | bloombergExportEngine.ts:584-588 |
 * | groupBy 返回普通对象（Object.keys / groups['Engineering']） | groupData 返回 Map（size / get / keys） | bloombergExportEngine.ts:628-643 |
 * | aggregateColumn(data, 'score', 'sum') 返回数字 | aggregateData(data, [{ key: 'score', type: 'sum' }]).score_sum | bloombergExportEngine.ts:645-656 |
 * | exportToCSV(data, cols) 返回字符串 | 返回 ExportResult，CSV 文本在 .content（includeTimestamp:false 才无尾注） | exportEngine.ts:148-180 |
 * | Column.render 列渲染 | ExportColumn.format（(value: unknown) => string） | exportEngine.ts:10 |
 */
import { describe, it, expect } from 'vitest';
import type { ExportColumn } from '../utils/exportEngine';
import { exportToCSV, sortData } from '../utils/exportEngine';
import { aggregateData, filterData, groupData } from '../utils/bloombergExportEngine';

// 未迁移（生产无对应导出，未迁移）：分页语义（totalPages/hasNext/hasPrev）。
// 生产 dataTable.ts:38 DataTableProcessor.paginate / execute 只返回 { page, pageSize, total }（:109-118）。
function paginateData<T>(
  data: T[],
  page: number,
  pageSize: number,
): { items: T[]; total: number; totalPages: number; hasNext: boolean; hasPrev: boolean } {
  const total = data.length;
  const totalPages = Math.ceil(total / pageSize) || 1;
  const safePage = Math.max(1, Math.min(page, totalPages));
  const start = (safePage - 1) * pageSize;
  return {
    items: data.slice(start, start + pageSize),
    total,
    totalPages,
    hasNext: safePage < totalPages,
    hasPrev: safePage > 1,
  };
}

// 未迁移（生产无对应导出，未迁移）：列宽分配属表格 UI 布局，生产无导出纯函数。
interface LayoutColumn {
  key: string;
  label: string;
  width?: number;
}

function getColumnWidths(columns: LayoutColumn[], containerWidth: number): number[] {
  const fixedWidths = columns.filter(c => c.width).reduce((sum, c) => sum + (c.width || 0), 0);
  const flexColumns = columns.filter(c => !c.width).length;
  const remaining = containerWidth - fixedWidths;
  const flexWidth = flexColumns > 0 ? remaining / flexColumns : 0;
  return columns.map(c => c.width || flexWidth);
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
      // 旧内联忽略大小写（'ali' → Alice）；生产 contains 区分大小写（bloombergExportEngine.ts:598）。
      const result = filterData(testData, [{ key: 'name', operator: 'contains', value: 'Ali' }]);
      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('Alice');
      expect(filterData(testData, [{ key: 'name', operator: 'contains', value: 'ali' }])).toHaveLength(0);
    });

    it('should filter by number range', () => {
      // 旧内联对象式 { min, max } 且只断言 every；生产用操作符数组 gte + lte（:595-596）。
      const result = filterData(testData, [
        { key: 'age', operator: 'gte', value: 28 },
        { key: 'age', operator: 'lte', value: 32 },
      ]);
      expect(result).toHaveLength(3);
      expect(result.every(d => Number(d.age) >= 28 && Number(d.age) <= 32)).toBe(true);
    });

    it('should filter by exact match', () => {
      const result = filterData(testData, [{ key: 'dept', operator: 'eq', value: 'Engineering' }]);
      expect(result).toHaveLength(2);
    });

    it('should combine filters (AND)', () => {
      const result = filterData(testData, [
        { key: 'dept', operator: 'eq', value: 'Engineering' },
        { key: 'age', operator: 'gte', value: 35 },
      ]);
      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('Charlie');
    });

    it('should return all rows for empty filter list', () => {
      // 旧内联把 name:''/dept:null 当空条件跳过；生产不做空值归一化，空操作符数组即不过滤。
      expect(filterData(testData, [])).toHaveLength(5);
    });

    it('should return empty for no matches', () => {
      expect(filterData(testData, [{ key: 'name', operator: 'contains', value: 'zzzzz' }])).toHaveLength(0);
    });
  });

  describe('Grouping', () => {
    it('should group by string key', () => {
      const groups = groupData(testData, 'dept');
      expect([...groups.keys()]).toContain('Engineering');
      expect(groups.get('Engineering')).toHaveLength(2);
    });

    it('should group by number key', () => {
      const data = [{ type: 1, v: 'a' }, { type: 1, v: 'b' }, { type: 2, v: 'c' }];
      const groups = groupData(data, 'type');
      expect(groups.get('1')).toHaveLength(2);
      expect(groups.get('2')).toHaveLength(1);
    });

    it('should handle empty data', () => {
      expect(groupData([], 'dept').size).toBe(0);
    });
  });

  describe('Aggregation', () => {
    it('should sum values', () => {
      expect(aggregateData(testData, [{ key: 'score', type: 'sum' }]).score_sum).toBe(438);
    });

    it('should calculate average', () => {
      expect(aggregateData(testData, [{ key: 'score', type: 'avg' }]).score_avg).toBeCloseTo(87.6, 1);
    });

    it('should find min', () => {
      expect(aggregateData(testData, [{ key: 'score', type: 'min' }]).score_min).toBe(78);
    });

    it('should find max', () => {
      expect(aggregateData(testData, [{ key: 'score', type: 'max' }]).score_max).toBe(95);
    });

    it('should count values', () => {
      expect(aggregateData(testData, [{ key: 'score', type: 'count' }]).score_count).toBe(5);
    });

    it('should handle empty data', () => {
      expect(aggregateData([], [{ key: 'score', type: 'sum' }]).score_sum).toBe(0);
    });
  });

  describe('Column Widths', () => {
    it('should distribute flex columns evenly', () => {
      const cols: LayoutColumn[] = [
        { key: 'a', label: 'A' },
        { key: 'b', label: 'B' },
      ];
      expect(getColumnWidths(cols, 200)).toEqual([100, 100]);
    });

    it('should respect fixed widths', () => {
      const cols: LayoutColumn[] = [
        { key: 'a', label: 'A', width: 50 },
        { key: 'b', label: 'B' },
      ];
      const widths = getColumnWidths(cols, 200);
      expect(widths[0]).toBe(50);
      expect(widths[1]).toBe(150);
    });

    it('should handle all fixed widths', () => {
      const cols: LayoutColumn[] = [
        { key: 'a', label: 'A', width: 100 },
        { key: 'b', label: 'B', width: 100 },
      ];
      expect(getColumnWidths(cols, 300)).toEqual([100, 100]);
    });
  });

  describe('CSV Export', () => {
    it('should export basic CSV', () => {
      const cols: ExportColumn[] = [
        { key: 'name', label: 'Name' },
        { key: 'age', label: 'Age' },
      ];
      const csv = exportToCSV(testData.slice(0, 2), { columns: cols, includeTimestamp: false }).content;
      expect(csv).toContain('Name,Age');
      expect(csv).toContain('Alice,30');
    });

    it('should escape commas', () => {
      const data = [{ name: 'Hello, World', value: 42 }];
      const cols: ExportColumn[] = [{ key: 'name', label: 'Name' }, { key: 'value', label: 'V' }];
      const csv = exportToCSV(data, { columns: cols, includeTimestamp: false }).content;
      expect(csv).toContain('"Hello, World"');
    });

    it('should escape quotes', () => {
      const data = [{ name: 'Say "Hi"', value: 1 }];
      const cols: ExportColumn[] = [{ key: 'name', label: 'Name' }, { key: 'value', label: 'V' }];
      const csv = exportToCSV(data, { columns: cols, includeTimestamp: false }).content;
      expect(csv).toContain('""Hi""');
    });

    it('should handle empty data', () => {
      const cols: ExportColumn[] = [{ key: 'a', label: 'A' }];
      const csv = exportToCSV([], { columns: cols, includeTimestamp: false }).content;
      expect(csv).toBe('A');
    });

    it('should use column format function', () => {
      const data = [{ val: 0.85 }];
      const cols: ExportColumn[] = [
        { key: 'val', label: 'V', format: (v) => `${(Number(v) * 100).toFixed(1)}%` },
      ];
      const csv = exportToCSV(data, { columns: cols, includeTimestamp: false }).content;
      expect(csv).toContain('85.0%');
    });
  });
});
