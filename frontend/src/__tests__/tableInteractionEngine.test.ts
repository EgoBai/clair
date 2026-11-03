import { describe, it, expect } from 'vitest';
import { filterData, sortData } from '../utils/bloombergExportEngine';
import type { ReportTemplate } from '../utils/bloombergExportEngine';
import { DataTableProcessor } from '../utils/dataTable';

// ===== 表格交互引擎（影子测试迁移） =====
// 已绑定生产实现：
// - filterData → frontend/src/utils/bloombergExportEngine.ts:584
//   （filters 数组 every；eq 严格 ===；gt/gte/lt/lte 走 Number() 转换；contains 区分大小写）
// - sortData   → frontend/src/utils/bloombergExportEngine.ts:607
//   （复制后排序；数值相减；字符串 localeCompare('zh-CN')）
// - uniqueValues → frontend/src/utils/dataTable.ts:124（生产实现会对唯一值排序）
// - 分页执行    → frontend/src/utils/dataTable.ts:85 DataTableProcessor.execute
//
// 未迁移（生产仓没有对应导出，保留内联 helper 仅作本地契约测试）：
// - paginateData：frontend/src/utils/dataTable.ts 只有 DataTableProcessor builder 方法，
//   不产出 totalPages，契约不兼容。
// - toggleSort：无排序状态切换纯函数（UI 状态内联）。
// - getColumnWidth：frontend/src/utils/bloombergExportEngine.ts 仅使用静态 col.width。
// - generateColumnDefs：无自动列定义生成导出。

interface Column { key: string; label: string; sortable?: boolean; filterable?: boolean; type?: 'string' | 'number' | 'date'; width?: number; }
interface SortConfig { key: string; direction: 'asc' | 'desc'; }

// 未迁移：生产无 paginateData 纯函数，DataTableProcessor 的分页结果不产出 totalPages。
function paginateData<T>(data: T[], page: number, pageSize: number): { items: T[]; total: number; totalPages: number } {
  const total = data.length;
  const totalPages = Math.ceil(total / pageSize) || 1;
  const start = (page - 1) * pageSize;
  return { items: data.slice(start, start + pageSize), total, totalPages };
}

// 未迁移：生产无排序状态切换纯函数（表格组件内联 UI 状态）。
function toggleSort(current: SortConfig | null, key: string): SortConfig {
  if (current?.key === key) {
    return { key, direction: current.direction === 'asc' ? 'desc' : 'asc' };
  }
  return { key, direction: 'asc' };
}

// 未迁移：生产 bloombergExportEngine 只用静态列宽 col.width，无按剩余空间均分的函数。
function getColumnWidth(column: Column, totalWidth: number, allColumns: Column[]): number {
  if (column.width) return column.width;
  const defined = allColumns.reduce((s, c) => s + (c.width || 0), 0);
  const remaining = totalWidth - defined;
  const autoCols = allColumns.filter(c => !c.width).length;
  return autoCols > 0 ? remaining / autoCols : 0;
}

// 未迁移：生产无自动列定义生成导出（既有页面各自声明列定义）。
function generateColumnDefs(sampleRow: Record<string, any>): Column[] {
  return Object.keys(sampleRow).map(key => ({
    key, label: key.charAt(0).toUpperCase() + key.slice(1),
    sortable: true, filterable: true,
    type: typeof sampleRow[key] === 'number' ? 'number' as const : 'string' as const,
  }));
}

describe('表格交互引擎', () => {
  const testData = [
    { name: 'AAPL', price: 150, volume: 1000000, sector: 'Tech' },
    { name: 'GOOGL', price: 2800, volume: 500000, sector: 'Tech' },
    { name: 'JPM', price: 150, volume: 800000, sector: 'Finance' },
    { name: 'TSLA', price: 700, volume: 2000000, sector: 'Auto' },
  ];

  describe('排序（生产 sortData(data, key, order)）', () => {
    it('数字升序应正确排序', () => {
      const sorted = sortData(testData, 'price', 'asc');
      expect(sorted[0].price).toBe(150);
      expect(sorted[sorted.length - 1].price).toBe(2800);
    });

    it('数字降序应正确排序', () => {
      const sorted = sortData(testData, 'price', 'desc');
      expect(sorted[0].price).toBe(2800);
      expect(sorted[sorted.length - 1].price).toBe(150);
    });

    it('字符串排序应正确（生产使用 localeCompare(..., "zh-CN")）', () => {
      const sorted = sortData(testData, 'name', 'asc');
      expect(sorted.map(row => row.name)).toEqual(['AAPL', 'GOOGL', 'JPM', 'TSLA']);
    });

    it('不应修改原数组', () => {
      const sorted = sortData(testData, 'price', 'asc');
      expect(sorted).not.toBe(testData);
      expect(testData.map(row => row.name)).toEqual(['AAPL', 'GOOGL', 'JPM', 'TSLA']);
    });
  });

  describe('过滤（生产 filterData(data, filters: ReportTemplate["filters"])）', () => {
    it('gt过滤应返回大于指定值的行', () => {
      const filters: ReportTemplate['filters'] = [{ key: 'price', operator: 'gt', value: 200 }];
      const result = filterData(testData, filters);
      expect(result.every(r => Number(r.price) > 200)).toBe(true);
      expect(result.map(r => r.name)).toEqual(['GOOGL', 'TSLA']);
    });

    it('contains过滤应返回包含指定字符串的行', () => {
      const filters: ReportTemplate['filters'] = [{ key: 'sector', operator: 'contains', value: 'Tech' }];
      const result = filterData(testData, filters);
      expect(result.length).toBe(2);
    });

    it('多条件应取交集', () => {
      const filters: ReportTemplate['filters'] = [
        { key: 'sector', operator: 'eq', value: 'Tech' },
        { key: 'price', operator: 'gt', value: 1000 },
      ];
      const result = filterData(testData, filters);
      expect(result.length).toBe(1);
      expect(result[0].name).toBe('GOOGL');
    });

    it('数值比较按 Number() 转换，contains 区分大小写', () => {
      const numeric: ReportTemplate['filters'] = [{ key: 'price', operator: 'gt', value: '1000' }];
      expect(filterData(testData, numeric).map(r => r.name)).toEqual(['GOOGL']);

      const caseSensitive: ReportTemplate['filters'] = [{ key: 'sector', operator: 'contains', value: 'tech' }];
      expect(filterData(testData, caseSensitive)).toHaveLength(0);
    });
  });

  describe('分页（未迁移：paginateData 无生产对应）', () => {
    it('应正确分页', () => {
      const result = paginateData(testData, 1, 2);
      expect(result.items.length).toBe(2);
      expect(result.total).toBe(4);
      expect(result.totalPages).toBe(2);
    });

    it('最后一页可能不满', () => {
      const result = paginateData(testData, 2, 3);
      expect(result.items.length).toBe(1);
    });

    it('空数据应返回正确结构', () => {
      const result = paginateData([], 1, 10);
      expect(result.items.length).toBe(0);
      expect(result.totalPages).toBe(1);
    });

    it('生产 DataTableProcessor 分页执行（真实实现）', () => {
      const result = new DataTableProcessor(testData).paginate(1, 2).execute();
      expect(result.data).toHaveLength(2);
      expect(result.pagination).toEqual({ page: 1, pageSize: 2, total: 4 });
    });
  });

  describe('排序切换（未迁移：无生产纯函数）', () => {
    it('首次点击应升序', () => {
      expect(toggleSort(null, 'price')).toEqual({ key: 'price', direction: 'asc' });
    });

    it('再次点击同一列应切换为降序', () => {
      const current: SortConfig = { key: 'price', direction: 'asc' };
      expect(toggleSort(current, 'price')).toEqual({ key: 'price', direction: 'desc' });
    });

    it('点击不同列应重置为升序', () => {
      const current: SortConfig = { key: 'price', direction: 'desc' };
      expect(toggleSort(current, 'volume')).toEqual({ key: 'volume', direction: 'asc' });
    });
  });

  describe('列宽计算（未迁移：生产只用静态 col.width）', () => {
    it('固定宽度应直接返回', () => {
      const col: Column = { key: 'a', label: 'A', width: 100 };
      expect(getColumnWidth(col, 500, [col])).toBe(100);
    });

    it('自动宽度应平均分配剩余空间', () => {
      const cols: Column[] = [
        { key: 'a', label: 'A', width: 100 },
        { key: 'b', label: 'B' },
        { key: 'c', label: 'C' },
      ];
      expect(getColumnWidth(cols[1], 500, cols)).toBe(200);
    });
  });

  describe('唯一值提取（生产 DataTableProcessor.uniqueValues）', () => {
    it('应返回去重且升序排列的值', () => {
      const values = new DataTableProcessor(testData).uniqueValues('sector');
      expect(values).toEqual(['Auto', 'Finance', 'Tech']);
      expect(values).toHaveLength(3);
    });
  });

  describe('自动生成列定义（未迁移：无生产导出）', () => {
    it('应为每个字段生成列', () => {
      const cols = generateColumnDefs(testData[0]);
      expect(cols.length).toBe(4);
      expect(cols[0].key).toBe('name');
    });

    it('数字类型应正确识别', () => {
      const cols = generateColumnDefs(testData[0]);
      const priceCol = cols.find(c => c.key === 'price');
      expect(priceCol?.type).toBe('number');
    });
  });
});
