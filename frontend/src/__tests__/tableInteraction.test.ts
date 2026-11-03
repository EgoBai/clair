import { describe, it, expect } from 'vitest';
import { filterData, sortData } from '../utils/bloombergExportEngine';
import type { ReportTemplate } from '../utils/bloombergExportEngine';

// ===== 表格交互逻辑测试（影子测试迁移） =====
// filterData / sortData 直接 import 生产实现：
// frontend/src/utils/bloombergExportEngine.ts:584 / frontend/src/utils/bloombergExportEngine.ts:607

type SortDirection = 'asc' | 'desc' | null;

interface SortState { field: string; direction: SortDirection; }

// 未迁移：生产仓没有 sort 状态切换纯函数（表格组件内联处理），保留内联实现。
function toggleSort(current: SortState, field: string): SortState {
  if (current.field !== field) return { field, direction: 'asc' };
  if (current.direction === 'asc') return { field, direction: 'desc' };
  if (current.direction === 'desc') return { field: '', direction: null };
  return { field, direction: 'asc' };
}

// 未迁移：生产 frontend/src/utils/dataTable.ts 只有 DataTableProcessor
// （sortBy/filter/paginate/execute），没有 paginateData 纯函数，也不产出
// totalPages/hasNext/hasPrev，契约不兼容，保留内联实现。
function paginateData<T>(data: T[], page: number, pageSize: number): { items: T[]; total: number; totalPages: number; hasNext: boolean; hasPrev: boolean } {
  const total = data.length;
  const totalPages = Math.ceil(total / pageSize);
  const start = (page - 1) * pageSize;
  return { items: data.slice(start, start + pageSize), total, totalPages, hasNext: page < totalPages, hasPrev: page > 1 };
}

// 未迁移：生产 bloombergExportEngine 只用静态列宽 col.width 生成 xlsx，
// 没有按 header/data 字符长度计算的 getColumnWidths，保留内联实现。
function getColumnWidths(headers: string[], data: Record<string, unknown>[], minWidth: number = 80, maxWidth: number = 300): number[] {
  return headers.map(h => {
    const headerLen = h.length * 14;
    const maxDataLen = data.reduce((m, row) => Math.max(m, String(row[h] ?? '').length * 12), 0);
    return Math.min(maxWidth, Math.max(minWidth, Math.max(headerLen, maxDataLen)));
  });
}

describe('表格交互', () => {
  const sampleData: Array<Record<string, unknown>> = [
    { name: '茅台', price: 1900, change: 1.5 },
    { name: '五粮液', price: 160, change: -0.8 },
    { name: '比亚迪', price: 260, change: 2.3 },
    { name: '招商银行', price: 35, change: -1.2 },
  ];

  describe("排序逻辑（生产 sortData(data, key, order='asc')）", () => {
    it('升序排序数字', () => {
      const sorted = sortData(sampleData, 'price', 'asc');
      expect(sorted[0].price).toBe(35);
      expect(sorted[3].price).toBe(1900);
    });

    it('降序排序数字', () => {
      const sorted = sortData(sampleData, 'price', 'desc');
      expect(sorted[0].price).toBe(1900);
    });

    it('省略方向时按升序（生产默认 asc，无 null 分支）', () => {
      const sorted = sortData(sampleData, 'price');
      expect(sorted[0].price).toBe(35);
    });

    it('字符串按 zh-CN 排序', () => {
      const sorted = sortData(sampleData, 'name', 'asc');
      expect(sorted.map(row => row.name)).toEqual(['比亚迪', '茅台', '五粮液', '招商银行']);
    });

    it('原数组不被修改', () => {
      const original = [...sampleData];
      sortData(sampleData, 'price', 'asc');
      expect(sampleData).toEqual(original);
    });

    it('空数组排序返回空', () => {
      expect(sortData([], 'x', 'asc')).toEqual([]);
    });
  });

  describe('排序切换（未迁移）', () => {
    it('首次点击升序', () => {
      const s = toggleSort({ field: '', direction: null }, 'price');
      expect(s).toEqual({ field: 'price', direction: 'asc' });
    });

    it('升序点击变降序', () => {
      const s = toggleSort({ field: 'price', direction: 'asc' }, 'price');
      expect(s).toEqual({ field: 'price', direction: 'desc' });
    });

    it('降序点击取消', () => {
      const s = toggleSort({ field: 'price', direction: 'desc' }, 'price');
      expect(s.direction).toBeNull();
    });

    it('切换字段重置为升序', () => {
      const s = toggleSort({ field: 'price', direction: 'desc' }, 'name');
      expect(s).toEqual({ field: 'name', direction: 'asc' });
    });
  });

  describe("筛选逻辑（生产 filterData(data, filters: ReportTemplate['filters'])）", () => {
    it('单一条件筛选', () => {
      const filters: ReportTemplate['filters'] = [{ key: 'price', operator: 'gt', value: 100 }];
      const f = filterData(sampleData, filters);
      expect(f).toHaveLength(3);
    });

    it('多条件AND筛选', () => {
      const filters: ReportTemplate['filters'] = [
        { key: 'price', operator: 'gt', value: 100 },
        { key: 'change', operator: 'gt', value: 0 },
      ];
      const f = filterData(sampleData, filters);
      expect(f).toHaveLength(2);
    });

    it('无匹配返回空', () => {
      const filters: ReportTemplate['filters'] = [{ key: 'price', operator: 'gt', value: 99999 }];
      const f = filterData(sampleData, filters);
      expect(f).toHaveLength(0);
    });

    it('空筛选器返回全部', () => {
      expect(filterData(sampleData, [])).toHaveLength(4);
    });
  });

  describe('分页逻辑（未迁移）', () => {
    it('第一页正确', () => {
      const p = paginateData(sampleData, 1, 2);
      expect(p.items).toHaveLength(2);
      expect(p.total).toBe(4);
      expect(p.totalPages).toBe(2);
      expect(p.hasNext).toBe(true);
      expect(p.hasPrev).toBe(false);
    });

    it('最后一页', () => {
      const p = paginateData(sampleData, 2, 2);
      expect(p.items).toHaveLength(2);
      expect(p.hasNext).toBe(false);
      expect(p.hasPrev).toBe(true);
    });

    it('超出页数返回空', () => {
      const p = paginateData(sampleData, 10, 2);
      expect(p.items).toHaveLength(0);
    });

    it('pageSize大于总数', () => {
      const p = paginateData(sampleData, 1, 100);
      expect(p.items).toHaveLength(4);
      expect(p.totalPages).toBe(1);
    });

    it('空数据分页', () => {
      const p = paginateData([], 1, 10);
      expect(p.total).toBe(0);
      expect(p.totalPages).toBe(0);
    });
  });

  describe('列宽计算（未迁移）', () => {
    it('返回与headers同长度', () => {
      const widths = getColumnWidths(['A', 'B'], [{ A: 'test', B: 123 }]);
      expect(widths).toHaveLength(2);
    });

    it('不小于最小宽度', () => {
      const widths = getColumnWidths(['A'], [{ A: '' }], 80);
      expect(widths[0]).toBeGreaterThanOrEqual(80);
    });

    it('不超过最大宽度', () => {
      const widths = getColumnWidths(['A'], [{ A: 'x'.repeat(1000) }], 80, 300);
      expect(widths[0]).toBeLessThanOrEqual(300);
    });
  });
});
