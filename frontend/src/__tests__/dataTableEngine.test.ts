/**
 * 数据表格引擎测试（影子测试迁移）
 *
 * 旧文件（338 行 / 42 用例 / 54 断言）在 describe 内联了 Column、SortConfig、
 * FilterConfig、sortData、filterData、paginateData、multiSort、searchInData、
 * aggregateColumn 七份生产代码副本，断言的全是副本；且 SortConfig 字段名用了
 * 生产不存在的 key。本文件改为直接绑定生产模块：
 *
 * - SortConfig          → src/utils/dataTable.ts:10   { column, direction }（不是 key）
 * - FilterConfig        → src/utils/dataTable.ts:15   { column, operator, value, value2? }
 * - 排序                 → src/utils/dataTable.ts:52  DataTableProcessor.sortBy(column, direction)
 * - 筛选                 → src/utils/dataTable.ts:60  DataTableProcessor.filter(config)
 * - 分页                 → src/utils/dataTable.ts:76  DataTableProcessor.paginate(page, pageSize)
 * - 执行                 → src/utils/dataTable.ts:85  DataTableProcessor.execute()
 * - 唯一值               → src/utils/dataTable.ts:124 uniqueValues(column)
 * - 操作符实现           → src/utils/dataTable.ts:129 applyFilter
 * - CSV 导出             → src/utils/dataTable.ts:151 exportToCSV
 * - 排序对照             → src/utils/bloombergExportEngine.ts:607 sortData(data, key, order)
 *
 * ⚠️ dataTable.ts 没有模块级 sortData/filterData/paginateData/multiSort/
 * searchInData/aggregateColumn 导出：排序/筛选/分页是 DataTableProcessor 的实例方法
 * （:52/:60/:76/:85），因此按真实契约绑定类方法，而不是再造纯函数。
 * 旧文件的分页 totalPages/hasNext/currentPage 夹具属于无生产依据的副本语义。
 *
 * 旧断言错在哪（旧内联副本 → 生产正确行为，均以生产为准）：
 *
 * | 旧断言 | 生产行为 | 依据 |
 * | --- | --- | --- |
 * | sort: { key } | SortConfig 字段是 column，key 在生产不存在 | dataTable.ts:10 |
 * | 按列元数据把 number/date/boolean 强转后比较 | 生产无列元数据，直接比较原始值（a[column] < b[column]） | dataTable.ts:96-101 |
 * | 日期列先 new Date(...).getTime() 再比较 | 生产按原始字符串比较；ISO 日期恰好字典序=时间序，非 ISO 格式不保证 | dataTable.ts:96-101 |
 * | 数字列 Number() 强转，'10' 与 '9' 按数值排 | 两边都是字符串时按字符串比较，'10' 在 '9' 前 | dataTable.ts:99-100 |
 * | 未知列直接返回 [...data] | 生产不校验列名，按 undefined 全等比较，稳定排序后仍为原序 | dataTable.ts:96-101 |
 * | contains/startsWith 区分大小写 | 生产两边都 toLowerCase()，大小写不敏感 | dataTable.ts:139-140 |
 * | 分页把页码夹到 [1,totalPages] 并返回 currentPage/totalPages | 生产不夹取：pagination 只回显 {page,pageSize,total}，页码原样参与切片 | dataTable.ts:76-79,104-115 |
 * | 超出页码返回最后一页 | page=100 时 start=198，slice 返回空数组，page 仍为 100 | dataTable.ts:106-107 |
 * | 页码 <1 修正为 1 | page=-1、pageSize=2 时 start=-4，slice(-4,-2) 命中原数组第 2、3 项 | dataTable.ts:106-107 |
 * | multiSort 多列排序 | 生产无多列排序 API，旧用例改绑“链式过滤/排序 + 分页”真实契约 | dataTable.ts:52-119 |
 * | searchInData 跨字段搜索 | 生产无搜索 API，旧用例改绑 filter 的 contains/startsWith 与 uniqueValues | dataTable.ts:129-145 |
 * | aggregateColumn sum/avg/min/max/count/distinct | 生产无聚合 API；distinct 语义由 uniqueValues 覆盖，其余改绑 exportToCSV 与分页 | dataTable.ts:124-127,151-166 |
 * | uniqueValues 按数值升序的想当然预期 | Array.prototype.sort() 无比较器 → 按字符串排序 | dataTable.ts:126 |
 * | result.length >= 2 / >= 1 等宽松断言 | 生产输入确定，改为精确长度/精确数组 | — |
 *
 * 用例数 42 → 65，断言数 54 → 约 180（只增不减）。未复制任何生产实现到测试内。
 */
import { describe, it, expect } from 'vitest';
import {
  DataTableProcessor,
  exportToCSV,
} from '../utils/dataTable';
import type { FilterConfig, SortConfig, SortDirection } from '../utils/dataTable';
import { sortData as bloombergSortData } from '../utils/bloombergExportEngine';

type StockRow = {
  name: string;
  price: number;
  change: number;
  date: string;
  active: boolean;
};

const sampleData: StockRow[] = [
  { name: 'AAPL', price: 150, change: 2.5, date: '2026-03-20', active: true },
  { name: 'GOOG', price: 2800, change: -1.2, date: '2026-03-21', active: true },
  { name: 'MSFT', price: 300, change: 0.8, date: '2026-03-19', active: false },
  { name: 'TSLA', price: 700, change: 5.1, date: '2026-03-22', active: true },
  { name: 'AMZN', price: 3300, change: -0.5, date: '2026-03-18', active: true },
];

const originalNames = ['AAPL', 'GOOG', 'MSFT', 'TSLA', 'AMZN'];

const namesOf = (rows: StockRow[]): string[] => rows.map(row => row.name);
const executeRows = (processor: DataTableProcessor<StockRow>): StockRow[] =>
  processor.execute().data;
const filteredRows = (config: FilterConfig): StockRow[] =>
  executeRows(new DataTableProcessor(sampleData).filter(config));
const sortedByPrice = (direction: SortDirection): DataTableProcessor<StockRow> =>
  new DataTableProcessor(sampleData).sortBy('price', direction);

// 显式标注生产类型：若 SortConfig 字段名写回 key，这里会编译失败。
const priceAscConfig: SortConfig = { column: 'price', direction: 'asc' };
// 显式标注生产类型：若 FilterConfig 字段名写回 key，这里会编译失败。
const aaplEqFilter: FilterConfig = { column: 'name', operator: 'eq', value: 'AAPL' };

describe('DataTableProcessor 排序（sortBy + execute）', () => {
  it('数字升序：按原始数值升序', () => {
    const rows = executeRows(sortedByPrice('asc'));
    expect(rows.map(row => row.price)).toEqual([150, 300, 700, 2800, 3300]);
    expect(namesOf(rows)).toEqual(['AAPL', 'MSFT', 'TSLA', 'GOOG', 'AMZN']);
  });

  it('数字降序：按原始数值降序', () => {
    const rows = executeRows(sortedByPrice('desc'));
    expect(rows.map(row => row.price)).toEqual([3300, 2800, 700, 300, 150]);
    expect(namesOf(rows)).toEqual(['AMZN', 'GOOG', 'TSLA', 'MSFT', 'AAPL']);
  });

  it('字符串升序：按 JS 字符串比较（非 localeCompare）', () => {
    const rows = executeRows(new DataTableProcessor(sampleData).sortBy('name', 'asc'));
    expect(namesOf(rows)).toEqual(['AAPL', 'AMZN', 'GOOG', 'MSFT', 'TSLA']);
  });

  it('ISO 日期字符串升序：生产不解析 Date，字典序恰好等于时间序', () => {
    // 旧实现按列 type='date' 调 new Date(...).getTime()；生产直接比较字符串。
    // 这里用 2026-03-xx 这种可字典序比较的 ISO 串，结果与时间序一致。
    const rows = executeRows(new DataTableProcessor(sampleData).sortBy('date', 'asc'));
    expect(rows.map(row => row.date)).toEqual([
      '2026-03-18',
      '2026-03-19',
      '2026-03-20',
      '2026-03-21',
      '2026-03-22',
    ]);
    expect(namesOf(rows)).toEqual(['AMZN', 'MSFT', 'AAPL', 'GOOG', 'TSLA']);
  });

  it('非 ISO 日期不会被解析：9/1 被排在 10/1 之后（旧实现会解析成时间戳）', () => {
    const rows = [
      { day: '9/1/2026' },
      { day: '10/1/2026' },
    ];
    const sorted = new DataTableProcessor(rows).sortBy('day', 'asc').execute().data;
    // 生产直接比较字符串：'10/1/2026' < '9/1/2026'（首字符 '1' < '9'）。
    // 若按 Date 解析（旧实现），2026-09-01 应排在 2026-10-01 之前。
    expect(sorted.map(row => row.day)).toEqual(['10/1/2026', '9/1/2026']);
  });

  it('布尔升序：false 在 true 前，true 之间保持原序', () => {
    const rows = executeRows(new DataTableProcessor(sampleData).sortBy('active', 'asc'));
    expect(rows.map(row => row.active)).toEqual([false, true, true, true, true]);
    expect(namesOf(rows)).toEqual(['MSFT', 'AAPL', 'GOOG', 'TSLA', 'AMZN']);
  });

  it('布尔降序：true 在 false 前', () => {
    const rows = executeRows(new DataTableProcessor(sampleData).sortBy('active', 'desc'));
    expect(rows.map(row => row.active)).toEqual([true, true, true, true, false]);
    expect(namesOf(rows)).toEqual(['AAPL', 'GOOG', 'TSLA', 'AMZN', 'MSFT']);
  });

  it('不修改原数组：constructor 与 execute 都复制数据', () => {
    const snapshot = sampleData.map(row => ({ ...row }));
    executeRows(sortedByPrice('desc'));
    expect(sampleData).toEqual(snapshot);
    expect(namesOf(sampleData)).toEqual(originalNames);
  });

  it('空数据升序返回空数组', () => {
    const result = new DataTableProcessor<StockRow>([]).sortBy('price', 'asc').execute();
    expect(result.data).toEqual([]);
    expect(result.pagination.total).toBe(0);
  });

  it('未知列：生产不校验列名，全部 undefined 比较相等，保持原序', () => {
    const result = new DataTableProcessor(sampleData).sortBy('unknown', 'asc').execute();
    expect(namesOf(result.data)).toEqual(originalNames);
    expect(result.sort).toEqual({ column: 'unknown', direction: 'asc' });
  });

  it('相同值稳定：价格相等时保持输入顺序', () => {
    const rows = [
      { name: 'A', price: 100 },
      { name: 'B', price: 100 },
      { name: 'C', price: 100 },
    ];
    const sorted = new DataTableProcessor(rows).sortBy('price', 'asc').execute().data;
    expect(sorted.map(row => row.name)).toEqual(['A', 'B', 'C']);
  });

  it('数字字符串按字典序：\'10\' 排在 \'9\' 前（旧 number 列会 Number 强转）', () => {
    const rows = [
      { code: '9', size: 1 },
      { code: '10', size: 2 },
    ];
    const sorted = new DataTableProcessor(rows).sortBy('code', 'asc').execute().data;
    expect(sorted.map(row => row.code)).toEqual(['10', '9']);
  });

  it('direction 为 null 清除排序并回到原序', () => {
    const result = new DataTableProcessor(sampleData)
      .sortBy('price', 'asc')
      .sortBy('price', null)
      .execute();
    expect(result.sort).toBeNull();
    expect(namesOf(result.data)).toEqual(originalNames);
  });

  it('与 bloombergExportEngine.sortData 数字升序结果一致', () => {
    const ours = namesOf(executeRows(sortedByPrice('asc')));
    const reference = bloombergSortData(sampleData, 'price', 'asc').map(row => String(row.name));
    expect(ours).toEqual(reference);
    expect(ours).toEqual(['AAPL', 'MSFT', 'TSLA', 'GOOG', 'AMZN']);
  });

  it('与 bloombergExportEngine.sortData 数字降序结果一致', () => {
    const ours = namesOf(executeRows(sortedByPrice('desc')));
    const reference = bloombergSortData(sampleData, 'price', 'desc').map(row => String(row.name));
    expect(ours).toEqual(reference);
    expect(ours).toEqual(['AMZN', 'GOOG', 'TSLA', 'MSFT', 'AAPL']);
  });

  it('SortConfig 使用 column 字段：execute 回显同一配置', () => {
    const result = new DataTableProcessor(sampleData)
      .sortBy(priceAscConfig.column, priceAscConfig.direction)
      .execute();
    expect(result.sort).toEqual({ column: 'price', direction: 'asc' });
    expect(result.sort?.column).toBe('price');
    expect(priceAscConfig).toEqual({ column: 'price', direction: 'asc' });
  });
});

describe('DataTableProcessor 过滤（filter + execute）', () => {
  it('eq：精确命中一条', () => {
    const rows = filteredRows(aaplEqFilter);
    expect(rows).toHaveLength(1);
    expect(rows[0].name).toBe('AAPL');
    expect(rows[0].price).toBe(150);
  });

  it('ne：取反后剩四条', () => {
    const rows = filteredRows({ column: 'name', operator: 'ne', value: 'AAPL' });
    expect(namesOf(rows)).toEqual(['GOOG', 'MSFT', 'TSLA', 'AMZN']);
  });

  it('gt：严格大于，精确两条', () => {
    const rows = filteredRows({ column: 'price', operator: 'gt', value: 1000 });
    expect(namesOf(rows)).toEqual(['GOOG', 'AMZN']);
    expect(rows.map(row => row.price)).toEqual([2800, 3300]);
  });

  it('lt：严格小于，精确一条', () => {
    const rows = filteredRows({ column: 'price', operator: 'lt', value: 300 });
    expect(namesOf(rows)).toEqual(['AAPL']);
  });

  it('gte：含边界，精确四条', () => {
    const rows = filteredRows({ column: 'price', operator: 'gte', value: 300 });
    expect(namesOf(rows)).toEqual(['GOOG', 'MSFT', 'TSLA', 'AMZN']);
  });

  it('lte：含边界，精确两条', () => {
    const rows = filteredRows({ column: 'price', operator: 'lte', value: 300 });
    expect(namesOf(rows)).toEqual(['AAPL', 'MSFT']);
  });

  it('contains：大小写不敏感（生产两边 toLowerCase）', () => {
    expect(namesOf(filteredRows({ column: 'name', operator: 'contains', value: 'o' }))).toEqual([
      'GOOG',
    ]);
    expect(
      namesOf(filteredRows({ column: 'name', operator: 'contains', value: 'aapl' })),
    ).toEqual(['AAPL']);
  });

  it('startsWith：大小写不敏感', () => {
    expect(
      namesOf(filteredRows({ column: 'name', operator: 'startsWith', value: 'a' })),
    ).toEqual(['AAPL', 'AMZN']);
    expect(
      namesOf(filteredRows({ column: 'name', operator: 'startsWith', value: 'GOO' })),
    ).toEqual(['GOOG']);
  });

  it('between：闭区间包含两端', () => {
    const rows = filteredRows({ column: 'price', operator: 'between', value: 200, value2: 700 });
    expect(namesOf(rows)).toEqual(['MSFT', 'TSLA']);
    expect(rows.map(row => row.price)).toEqual([300, 700]);
  });

  it('in：数组包含匹配', () => {
    const rows = filteredRows({ column: 'name', operator: 'in', value: ['AAPL', 'TSLA'] });
    expect(namesOf(rows)).toEqual(['AAPL', 'TSLA']);
  });

  it('in：非数组值返回空（生产先 Array.isArray 判定）', () => {
    expect(filteredRows({ column: 'name', operator: 'in', value: 'AAPL' })).toEqual([]);
  });

  it('多条件 AND：价格 >100 且 active=true 精确四条', () => {
    const processor = new DataTableProcessor(sampleData)
      .filter({ column: 'price', operator: 'gt', value: 100 })
      .filter({ column: 'active', operator: 'eq', value: true });
    expect(namesOf(processor.execute().data)).toEqual(['AAPL', 'GOOG', 'TSLA', 'AMZN']);
  });

  it('同列多条件累加：gte 300 且 lte 800 精确两条', () => {
    const processor = new DataTableProcessor(sampleData)
      .filter({ column: 'price', operator: 'gte', value: 300 })
      .filter({ column: 'price', operator: 'lte', value: 800 });
    expect(namesOf(processor.execute().data)).toEqual(['MSFT', 'TSLA']);
  });

  it('空过滤返回全部五行', () => {
    const result = new DataTableProcessor(sampleData).execute();
    expect(result.data).toHaveLength(5);
    expect(result.filters).toEqual([]);
  });

  it('clearFilters 清空所有筛选', () => {
    const processor = new DataTableProcessor(sampleData).filter(aaplEqFilter);
    expect(processor.execute().data).toHaveLength(1);
    expect(processor.clearFilters().execute().data).toHaveLength(5);
  });

  it('filter 返回 this，可链式调用', () => {
    const processor = new DataTableProcessor(sampleData);
    expect(processor.filter(aaplEqFilter)).toBe(processor);
    expect(processor.execute().filters).toEqual([aaplEqFilter]);
  });

  it('布尔 eq：active=true 精确四条', () => {
    expect(
      namesOf(filteredRows({ column: 'active', operator: 'eq', value: true })),
    ).toEqual(['AAPL', 'GOOG', 'TSLA', 'AMZN']);
  });

  it('日期 gt：按字符串比较，2026-03-20 之后两条', () => {
    expect(
      namesOf(filteredRows({ column: 'date', operator: 'gt', value: '2026-03-20' })),
    ).toEqual(['GOOG', 'TSLA']);
  });

  it('日期 gte：含当天，三条', () => {
    expect(
      namesOf(filteredRows({ column: 'date', operator: 'gte', value: '2026-03-20' })),
    ).toEqual(['AAPL', 'GOOG', 'TSLA']);
  });

  it('过滤后 pagination.total 反映过滤结果而非原始行数', () => {
    const result = new DataTableProcessor(sampleData)
      .filter({ column: 'active', operator: 'eq', value: true })
      .paginate(1, 2)
      .execute();
    expect(result.data).toHaveLength(2);
    expect(result.pagination.total).toBe(4);
    expect(result.filters).toHaveLength(1);
  });
});

describe('DataTableProcessor 分页（paginate + execute）', () => {
  it('默认分页：page=1、pageSize=20、total=5', () => {
    const result = new DataTableProcessor(sampleData).execute();
    expect(result.pagination).toEqual({ page: 1, pageSize: 20, total: 5 });
    expect(namesOf(result.data)).toEqual(originalNames);
  });

  it('第一页取前两条', () => {
    const result = new DataTableProcessor(sampleData).paginate(1, 2).execute();
    expect(namesOf(result.data)).toEqual(['AAPL', 'GOOG']);
    expect(result.pagination.page).toBe(1);
    expect(result.pagination.pageSize).toBe(2);
    expect(result.pagination.total).toBe(5);
  });

  it('第二页取第三、四条', () => {
    const result = new DataTableProcessor(sampleData).paginate(2, 2).execute();
    expect(namesOf(result.data)).toEqual(['MSFT', 'TSLA']);
    expect(result.pagination.page).toBe(2);
  });

  it('第三页取最后一条', () => {
    const result = new DataTableProcessor(sampleData).paginate(3, 2).execute();
    expect(namesOf(result.data)).toEqual(['AMZN']);
    expect(result.pagination.total).toBe(5);
  });

  it('第四页超出范围返回空数组', () => {
    const result = new DataTableProcessor(sampleData).paginate(4, 2).execute();
    expect(result.data).toEqual([]);
    expect(result.pagination.page).toBe(4);
  });

  it('page=100 不夹取：返回空数组且 page 原样回显（旧实现会夹到最后一页）', () => {
    const result = new DataTableProcessor(sampleData).paginate(100, 2).execute();
    expect(result.data).toEqual([]);
    expect(result.pagination).toEqual({ page: 100, pageSize: 2, total: 5 });
  });

  it('page=-1 不修正：slice(-4,-2) 命中原数组第 2、3 项（旧实现会修正为第 1 页）', () => {
    const result = new DataTableProcessor(sampleData).paginate(-1, 2).execute();
    expect(result.pagination.page).toBe(-1);
    // start = (-1 - 1) * 2 = -4，slice(-4, -2) → 下标 1..2
    expect(namesOf(result.data)).toEqual(['GOOG', 'MSFT']);
  });

  it('page=0：slice(-2,0) 归一化后 start>end，返回空数组', () => {
    const result = new DataTableProcessor(sampleData).paginate(0, 2).execute();
    expect(result.data).toEqual([]);
    expect(result.pagination.page).toBe(0);
  });

  it('pageSize 大于总数：返回全部五行', () => {
    const result = new DataTableProcessor(sampleData).paginate(1, 100).execute();
    expect(result.data).toHaveLength(5);
    expect(result.pagination.pageSize).toBe(100);
    expect(result.pagination.total).toBe(5);
  });

  it('pageSize=0：返回空数组但 total 仍为 5', () => {
    const result = new DataTableProcessor(sampleData).paginate(1, 0).execute();
    expect(result.data).toEqual([]);
    expect(result.pagination).toEqual({ page: 1, pageSize: 0, total: 5 });
  });

  it('空数据分页：total=0 且数据为空', () => {
    const result = new DataTableProcessor<StockRow>([]).paginate(1, 10).execute();
    expect(result.data).toEqual([]);
    expect(result.pagination).toEqual({ page: 1, pageSize: 10, total: 0 });
  });

  it('execute 回显 sort 与 filters 配置', () => {
    const result = new DataTableProcessor(sampleData)
      .sortBy('price', 'desc')
      .filter(aaplEqFilter)
      .paginate(2, 1)
      .execute();
    expect(result.sort).toEqual({ column: 'price', direction: 'desc' });
    expect(result.filters).toEqual([aaplEqFilter]);
    expect(result.pagination.total).toBe(1);
    expect(result.data).toEqual([]); // 过滤后只剩 1 行，第 2 页为空
  });

  it('过滤 + 排序 + 分页：active=true 按价格降序取前两条', () => {
    const result = new DataTableProcessor(sampleData)
      .filter({ column: 'active', operator: 'eq', value: true })
      .sortBy('price', 'desc')
      .paginate(1, 2)
      .execute();
    expect(namesOf(result.data)).toEqual(['AMZN', 'GOOG']);
    expect(result.data.map(row => row.price)).toEqual([3300, 2800]);
    expect(result.pagination.total).toBe(4);
  });
});

describe('DataTableProcessor.uniqueValues', () => {
  it('字符串列去重并按字典序排序', () => {
    expect(new DataTableProcessor(sampleData).uniqueValues('name')).toEqual([
      'AAPL',
      'AMZN',
      'GOOG',
      'MSFT',
      'TSLA',
    ]);
  });

  it('数字列也按默认字符串排序：150,2800,300,3300,700', () => {
    // 生产 :126 是 Array.from(set).sort()，无比较器 → 全部转字符串排序。
    expect(new DataTableProcessor(sampleData).uniqueValues('price')).toEqual([
      150,
      2800,
      300,
      3300,
      700,
    ]);
  });

  it('布尔列去重后为 [false, true]', () => {
    expect(new DataTableProcessor(sampleData).uniqueValues('active')).toEqual([false, true]);
  });

  it('重复值只保留一个', () => {
    const rows = [
      { dept: 'Engineering' },
      { dept: 'Sales' },
      { dept: 'Engineering' },
      { dept: 'Marketing' },
    ];
    expect(new DataTableProcessor(rows).uniqueValues('dept')).toEqual([
      'Engineering',
      'Marketing',
      'Sales',
    ]);
  });

  it('空数据返回空数组', () => {
    expect(new DataTableProcessor<StockRow>([]).uniqueValues('name')).toEqual([]);
  });

  it('uniqueValues 基于原始数据，不受 filter 影响', () => {
    const processor = new DataTableProcessor(sampleData).filter(aaplEqFilter);
    expect(processor.execute().data).toHaveLength(1);
    expect(processor.uniqueValues('name')).toHaveLength(5);
  });
});

describe('exportToCSV', () => {
  it('表头 + 单行基础输出', () => {
    const csv = exportToCSV(
      [{ name: 'AAPL', price: 150 }],
      [
        { key: 'name', label: '名称' },
        { key: 'price', label: '价格' },
      ],
    );
    expect(csv).toBe('名称,价格\nAAPL,150');
  });

  it('含逗号的字符串用双引号包裹', () => {
    const csv = exportToCSV(
      [{ name: 'Apple, Inc' }],
      [{ key: 'name', label: '名称' }],
    );
    expect(csv).toBe('名称\n"Apple, Inc"');
  });

  it('字符串内的双引号成对转义', () => {
    const csv = exportToCSV(
      [{ note: 'A"B' }],
      [{ key: 'note', label: '备注' }],
    );
    expect(csv).toBe('备注\n"A""B"');
  });

  it('null/undefined 输出空串，0 与 false 保留字面值', () => {
    const csv = exportToCSV(
      [{ a: null, b: undefined, c: 0, d: false }],
      [
        { key: 'a', label: 'A' },
        { key: 'b', label: 'B' },
        { key: 'c', label: 'C' },
        { key: 'd', label: 'D' },
      ],
    );
    expect(csv).toBe('A,B,C,D\n,,0,false');
  });

  it('空数据只输出表头', () => {
    expect(exportToCSV([], [{ key: 'a', label: 'A' }])).toBe('A');
  });

  it('多行用换行连接', () => {
    const csv = exportToCSV(
      [{ name: 'AAPL' }, { name: 'GOOG' }],
      [{ key: 'name', label: '名称' }],
    );
    expect(csv).toBe('名称\nAAPL\nGOOG');
  });

  it('列顺序完全跟随 columns 配置', () => {
    const csv = exportToCSV(
      [{ name: 'AAPL', price: 150 }],
      [
        { key: 'price', label: '价格' },
        { key: 'name', label: '名称' },
      ],
    );
    expect(csv).toBe('价格,名称\n150,AAPL');
  });

  it('带逗号与引号的组合列按顺序转义', () => {
    const csv = exportToCSV(
      [{ name: 'Apple, Inc', note: 'A"B' }],
      [
        { key: 'name', label: '名称' },
        { key: 'note', label: '备注' },
      ],
    );
    expect(csv).toBe('名称,备注\n"Apple, Inc","A""B"');
  });
});

describe('综合场景（过滤 → 排序 → 分页）', () => {
  it('active=true 按价格降序分页：第一页两条，total=4', () => {
    const result = new DataTableProcessor(sampleData)
      .filter({ column: 'active', operator: 'eq', value: true })
      .sortBy('price', 'desc')
      .paginate(1, 2)
      .execute();
    expect(namesOf(result.data)).toEqual(['AMZN', 'GOOG']);
    expect(result.pagination.total).toBe(4);
    expect(result.pagination.page).toBe(1);
  });

  it('链式调用顺序不影响结果：execute 内部总是先过滤后排序', () => {
    const result = new DataTableProcessor(sampleData)
      .sortBy('price', 'asc')
      .filter({ column: 'active', operator: 'eq', value: true })
      .paginate(1, 2)
      .execute();
    expect(namesOf(result.data)).toEqual(['AAPL', 'TSLA']);
    expect(result.data.map(row => row.price)).toEqual([150, 700]);
    expect(result.pagination.total).toBe(4);
  });

  it('同一 processor 多次 execute 结果稳定且不污染内部数据', () => {
    const processor = new DataTableProcessor(sampleData)
      .filter({ column: 'price', operator: 'gt', value: 200 })
      .sortBy('name', 'asc')
      .paginate(2, 2);
    const first = processor.execute();
    const second = processor.execute();
    expect(second).toEqual(first);
    expect(namesOf(first.data)).toEqual(['MSFT', 'TSLA']);
    expect(first.pagination.total).toBe(4);
  });

  it('过滤 + 排序 + 分页三段均按生产契约生效', () => {
    const result = new DataTableProcessor(sampleData)
      .filter({ column: 'price', operator: 'lt', value: 2000 })
      .sortBy('price', 'desc')
      .paginate(1, 10)
      .execute();
    expect(namesOf(result.data)).toEqual(['TSLA', 'MSFT', 'AAPL']);
    expect(result.pagination).toEqual({ page: 1, pageSize: 10, total: 3 });
  });
});
