/**
 * 影子测试迁移（批次 22b）
 *
 * 旧文件在本文件内自带 sortData/filterData/paginateData 副本，断言的是副本。
 * 现已 import 生产实现；分页无对应生产函数，保留内联（见「未迁移」）。
 *
 * 已绑定生产实现：
 * - ../utils/bloombergExportEngine.ts: filterData（:584）/ sortData（:607）
 * - ../utils/exportEngine.ts: exportToCSV（:148，ExportResult.content 为 string）
 *
 * 旧断言错在哪：
 *
 * | 旧断言 | 生产行为 | 依据 |
 * | --- | --- | --- |
 * | filterData(data, key, value) 单键过滤 | filterData(data, filters[]) 接收过滤器数组，filters.every() | bloombergExportEngine.ts:584 |
 * | filter「case-insensitively」，平安命中 >=1 条 | contains 用 String.includes，区分大小写；中文「平安」实际命中 2 条（000001/601318） | :598 |
 * | 字符串排序用无 locale 的 localeCompare 断单调 | 生产显式 localeCompare(..., 'zh-CN')，中文按拼音排序 | :621 |
 * | 数值仅断单调 | 生产返回副本、数值相减；下面按生产实际顺序断言 | :619 |
 *
 * 未迁移——生产无对应实现：
 * - paginateData（返回 total/totalPages/hasNext/hasPrev）：utils/dataTable.ts:76 的 paginate 是
 *   builder 方法且返回 this，页面内分页均为组件内 slice；无同形状纯函数导出，故保留内联副本。
 *
 * 新增（3 个）：
 * - contains 大小写实证：ABC/abc 数据只命中精确大小写那一侧。
 * - 多过滤器 every + gte/gt 数值组合。
 * - exportToCSV 集成用例：过滤 + 排序后导出，核对 ExportResult.content/rowCount/columnCount。
 *   生产 exportEngine 无 BOM、mimeType 为 'text/csv'（与 bloombergExportEngine.ts:230 的 CSV 实现不同）。
 */
import { describe, it, expect } from 'vitest';
import { filterData, sortData } from '../utils/bloombergExportEngine';
import { exportToCSV } from '../utils/exportEngine';

describe('TableSortingFiltering', () => {
  type StockRow = {
    symbol: string;
    name: string;
    price: number;
    changePercent: number;
    volume: number;
    pe: number;
  } & Record<string, unknown>;

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

  const symbolsOf = (data: Record<string, unknown>[]): string[] => data.map(row => String(row.symbol));

  // 未迁移：生产无同形状分页 helper（见文件头说明），保留本地副本覆盖边界计算。
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

  it('should sort by price ascending', () => {
    const result = sortData(rows, 'price', 'asc');
    expect(symbolsOf(result)).toEqual(['000001', '600036', '601318', '688981', '000858', '300750', '002594', '600519']);
    for (let i = 1; i < result.length; i++) {
      expect(Number(result[i].price)).toBeGreaterThanOrEqual(Number(result[i - 1].price));
    }
  });

  it('should sort by price descending', () => {
    const result = sortData(rows, 'price', 'desc');
    expect(symbolsOf(result)).toEqual(['600519', '002594', '300750', '000858', '688981', '601318', '600036', '000001']);
    for (let i = 1; i < result.length; i++) {
      expect(Number(result[i].price)).toBeLessThanOrEqual(Number(result[i - 1].price));
    }
  });

  it('should sort by name with zh-CN collation', () => {
    const result = sortData(rows, 'name', 'asc');
    // 生产显式使用 localeCompare(..., 'zh-CN')，按拼音排序；中国平安(zhongguo) 在 中芯国际(zhongxin) 前。
    expect(result.map(row => String(row.name))).toEqual([
      '比亚迪', '贵州茅台', '宁德时代', '平安银行', '五粮液', '招商银行', '中国平安', '中芯国际',
    ]);
    for (let i = 1; i < result.length; i++) {
      expect(String(result[i].name).localeCompare(String(result[i - 1].name), 'zh-CN')).toBeGreaterThanOrEqual(0);
    }
  });

  it('should sort by changePercent descending', () => {
    const result = sortData(rows, 'changePercent', 'desc');
    expect(symbolsOf(result)).toEqual(['002594', '000858', '600519', '601318', '688981', '600036', '300750', '000001']);
    for (let i = 1; i < result.length; i++) {
      expect(Number(result[i].changePercent)).toBeLessThanOrEqual(Number(result[i - 1].changePercent));
    }
  });

  it('should filter by name contains', () => {
    const result = filterData(rows, [{ key: 'name', operator: 'contains', value: '茅台' }]);
    expect(result).toHaveLength(1);
    expect(result[0].symbol).toBe('600519');
  });

  it('should filter by contains without case folding', () => {
    const result = filterData(rows, [{ key: 'name', operator: 'contains', value: '平安' }]);
    // 生产 contains 不做 toLowerCase；中文命中 2 条，旧断言只要求 >=1。
    expect(result).toHaveLength(2);
    expect(symbolsOf(result)).toEqual(['000001', '601318']);
  });

  it('should treat contains as case-sensitive', () => {
    const data = [{ code: 'ABC' }, { code: 'abc' }];
    expect(filterData(data, [{ key: 'code', operator: 'contains', value: 'ab' }])).toEqual([{ code: 'abc' }]);
    expect(filterData(data, [{ key: 'code', operator: 'contains', value: 'AB' }])).toEqual([{ code: 'ABC' }]);
  });

  it('should apply every filter with numeric operators', () => {
    const result = filterData(rows, [
      { key: 'price', operator: 'gte', value: 100 },
      { key: 'changePercent', operator: 'gt', value: 0 },
    ]);
    expect(symbolsOf(result)).toEqual(['600519', '000858', '002594']);
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
    const result = filterData([], [{ key: 'name', operator: 'contains', value: 'test' }]);
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

  it('should combine filter and sort', () => {
    const filtered = filterData(rows, []);
    const sorted = sortData(filtered, 'volume', 'desc');
    expect(sorted.map(row => Number(row.volume))).toEqual([800000, 500000, 400000, 350000, 320000, 250000, 150000, 30000]);
  });

  it('should not mutate original data', () => {
    const snapshot = rows.map(row => ({ ...row }));
    sortData(rows, 'price', 'desc');
    filterData(rows, [{ key: 'name', operator: 'contains', value: '茅台' }]);
    paginateData(rows, 1, 3);
    expect(rows).toEqual(snapshot);
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

  it('should export filtered and sorted rows to CSV', () => {
    const banks = filterData(rows, [{ key: 'name', operator: 'endsWith', value: '银行' }]);
    const sorted = sortData(banks, 'volume', 'desc');
    const result = exportToCSV(sorted, {
      columns: [
        { key: 'symbol', label: '代码' },
        { key: 'name', label: '名称' },
        { key: 'volume', label: '成交量' },
      ],
      filename: 'banks',
      includeTimestamp: false,
    });

    expect(typeof result.content).toBe('string');
    expect(result.content).toBe('代码,名称,成交量\n000001,平安银行,800000\n600036,招商银行,320000');
    expect(result.content.charCodeAt(0)).not.toBe(0xfeff); // exportEngine 不带 BOM
    expect(result.filename).toBe('banks.csv');
    expect(result.mimeType).toBe('text/csv');
    expect(result.rowCount).toBe(2);
    expect(result.columnCount).toBe(3);
    expect(result.size).toBeGreaterThan(0);
  });
});
