/**
 * 影子测试迁移（批次 17）
 *
 * 旧文件在测试内联了 sortData/filterData/paginateData/groupBy/aggregateData 的副本，
 * 断言的是副本而非生产实现。现已改为 import ../utils/bloombergExportEngine。
 *
 * 已绑定生产实现（frontend/src/utils/bloombergExportEngine.ts）：
 * - filterData    → :584
 * - sortData      → :607
 * - groupData     → :628
 * - aggregateData → :645
 *
 * 未迁移（生产无对应导出，未迁移）：
 * - paginateData：生产无 totalPages/hasNext/hasPrev 导出。src/utils/dataTable.ts:38
 *   DataTableProcessor.paginate / execute 只返回 { page, pageSize, total }（:109-118），
 *   无法断言 totalPages/hasNext/hasPrev，故保留原内联分页函数。
 *
 * 旧断言错在哪（旧内联副本 → 生产行为）：
 *
 * | 旧断言 | 生产输出 | 依据 |
 * | --- | --- | --- |
 * | sortData(data, { field, direction: null }) 原样返回（首行 茅台 1900） | 生产无 null 方向；省略 order 时默认 'asc'，首行 price 35 | bloombergExportEngine.ts:610 |
 * | operator 'in' 过滤出 3 行 | 生产 switch 无 'in' 分支，default 返回 true → 5 行 | bloombergExportEngine.ts:601 |
 * | operator 'between' [30, 200] 过滤出 3 行 | 生产无 'between' 分支；改用 gte 30 + lte 200 等价表达 → 3 行 | bloombergExportEngine.ts:594-597 |
 * | 缺失分组字段的键为 'undefined' | 归入 '未分组' | bloombergExportEngine.ts:635 |
 * | operator starts_with / ends_with / ne | startsWith / endsWith / neq | bloombergExportEngine.ts:599-600, :593 |
 * | aggregateData(data, 组字段, 值字段, op) 返回按组名索引的对象 | 生产 (data, aggregations) 返回扁平 Record，键为「值字段_操作符」；分组需先 groupData | bloombergExportEngine.ts:645-656 |
 * | 分组返回普通对象（Object.keys / g['白酒']） | 返回 Map（size / get） | bloombergExportEngine.ts:628-643 |
 */
import { describe, it, expect } from 'vitest';
import {
  aggregateData,
  filterData,
  groupData,
  sortData,
} from '../utils/bloombergExportEngine';

// 未迁移（生产无对应导出，未迁移）：分页语义（totalPages/hasNext/hasPrev）。
// 生产 dataTable.ts:38 DataTableProcessor.paginate / execute 只返回 { page, pageSize, total }（:109-118）。
function paginateData<T>(
  data: T[],
  page: number,
  pageSize: number,
): { items: T[]; total: number; totalPages: number; hasNext: boolean; hasPrev: boolean } {
  const total = data.length;
  const totalPages = Math.ceil(total / pageSize);
  const start = (page - 1) * pageSize;
  return {
    items: data.slice(start, start + pageSize),
    total,
    totalPages,
    hasNext: page < totalPages,
    hasPrev: page > 1,
  };
}

describe('表格交互引擎', () => {
  const sampleData = [
    { name: '茅台', price: 1900, change: 2.5, industry: '白酒' },
    { name: '比亚迪', price: 250, change: -1.3, industry: '汽车' },
    { name: '招商银行', price: 35, change: 0.8, industry: '银行' },
    { name: '五粮液', price: 150, change: -0.5, industry: '白酒' },
    { name: '宁德时代', price: 200, change: 3.2, industry: '新能源' },
  ];

  describe('排序', () => {
    it('数字升序', () => {
      const sorted = sortData(sampleData, 'price', 'asc');
      expect(sorted[0].price).toBe(35);
      expect(sorted[4].price).toBe(1900);
    });

    it('数字降序', () => {
      const sorted = sortData(sampleData, 'price', 'desc');
      expect(sorted[0].price).toBe(1900);
    });

    it('默认升序（生产无 direction:null 语义）', () => {
      // 旧内联 direction:null 原样返回（首行 茅台 1900）；生产 sortData 的 order 只有 'asc'|'desc'，
      // 省略时默认 'asc'（bloombergExportEngine.ts:610），不存在“不排序”分支。
      const sorted = sortData(sampleData, 'price');
      expect(sorted[0].price).toBe(35);
      expect(sorted[4].price).toBe(1900);
    });

    it('null值排最后', () => {
      const data = [{ name: 'A', price: 10 }, { name: 'B', price: null }, { name: 'C', price: 5 }];
      const sorted = sortData(data, 'price', 'asc');
      expect(sorted[2].name).toBe('B');
    });

    it('原数组不被修改', () => {
      const original = [...sampleData];
      sortData(sampleData, 'price', 'asc');
      expect(sampleData).toEqual(original);
    });

    it('空数组排序返回空', () => {
      expect(sortData([], 'price', 'asc')).toHaveLength(0);
    });

    it('涨跌幅排序', () => {
      const sorted = sortData(sampleData, 'change', 'desc');
      expect(sorted[0].change).toBe(3.2);
    });
  });

  describe('筛选', () => {
    it('gt条件', () => {
      const r = filterData(sampleData, [{ key: 'price', operator: 'gt', value: 100 }]);
      expect(r).toHaveLength(4); // 1900, 250, 150, 200
    });

    it('lt条件', () => {
      const r = filterData(sampleData, [{ key: 'price', operator: 'lt', value: 100 }]);
      expect(r).toHaveLength(1); // 35
    });

    it('eq条件', () => {
      const r = filterData(sampleData, [{ key: 'industry', operator: 'eq', value: '白酒' }]);
      expect(r).toHaveLength(2);
    });

    it('contains条件', () => {
      const r = filterData(sampleData, [{ key: 'name', operator: 'contains', value: '行' }]);
      expect(r).toHaveLength(1);
    });

    it('in条件（生产无 in 分支：不过滤）', () => {
      // 旧内联按数组包含过滤出 3 行；生产 switch 无 'in'，default 返回 true（:601），该条件不生效。
      const r = filterData(sampleData, [
        { key: 'industry', operator: 'in' as never, value: ['白酒', '银行'] },
      ]);
      expect(r).toHaveLength(5);
    });

    it('区间条件（生产无 between：gte + lte 等价表达）', () => {
      const r = filterData(sampleData, [
        { key: 'price', operator: 'gte', value: 30 },
        { key: 'price', operator: 'lte', value: 200 },
      ]);
      expect(r).toHaveLength(3); // 35, 150, 200
    });

    it('多条件AND', () => {
      const r = filterData(sampleData, [
        { key: 'industry', operator: 'eq', value: '白酒' },
        { key: 'price', operator: 'gt', value: 160 },
      ]);
      expect(r).toHaveLength(1);
      expect(r[0].name).toBe('茅台');
    });

    it('无匹配返回空', () => {
      const r = filterData(sampleData, [{ key: 'price', operator: 'gt', value: 10000 }]);
      expect(r).toHaveLength(0);
    });

    it('startsWith条件', () => {
      const r = filterData(sampleData, [{ key: 'name', operator: 'startsWith', value: '招' }]);
      expect(r).toHaveLength(1);
    });

    it('endsWith条件', () => {
      const r = filterData(sampleData, [{ key: 'name', operator: 'endsWith', value: '液' }]);
      expect(r).toHaveLength(1);
    });
  });

  describe('分页', () => {
    it('第一页正确', () => {
      const r = paginateData(sampleData, 1, 2);
      expect(r.items).toHaveLength(2);
      expect(r.total).toBe(5);
      expect(r.totalPages).toBe(3);
      expect(r.hasNext).toBe(true);
      expect(r.hasPrev).toBe(false);
    });

    it('最后一页', () => {
      const r = paginateData(sampleData, 3, 2);
      expect(r.items).toHaveLength(1);
      expect(r.hasNext).toBe(false);
      expect(r.hasPrev).toBe(true);
    });

    it('超出范围返回空', () => {
      const r = paginateData(sampleData, 100, 2);
      expect(r.items).toHaveLength(0);
    });

    it('pageSize大于总数', () => {
      const r = paginateData(sampleData, 1, 100);
      expect(r.items).toHaveLength(5);
      expect(r.totalPages).toBe(1);
    });
  });

  describe('分组', () => {
    it('按行业分组', () => {
      const g = groupData(sampleData, 'industry');
      expect(g.size).toBe(4);
      expect(g.get('白酒')).toHaveLength(2);
    });

    it('空数据返回空Map', () => {
      expect(groupData([], 'x').size).toBe(0);
    });

    it('缺失字段分到「未分组」组', () => {
      const data = [{ name: 'A' }, { name: 'B', type: 'x' }];
      const g = groupData(data, 'type');
      expect(g.has('undefined')).toBe(false);
      expect(g.get('未分组')).toHaveLength(1);
      expect(g.get('x')).toHaveLength(1);
    });
  });

  describe('聚合', () => {
    const groups = groupData(sampleData, 'industry');
    // 生产 aggregateData 无「按组聚合」签名：先 groupData 分组，再对单组调用 aggregateData。
    const groupAgg = (group: string, type: 'sum' | 'avg' | 'count' | 'min' | 'max') =>
      aggregateData(groups.get(group)!, [{ key: 'price', type }])[`price_${type}`];

    it('按行业求和价格', () => {
      expect(groupAgg('白酒', 'sum')).toBe(1900 + 150);
    });

    it('按行业平均价格', () => {
      expect(groupAgg('白酒', 'avg')).toBe((1900 + 150) / 2);
    });

    it('按行业计数', () => {
      expect(groupAgg('白酒', 'count')).toBe(2);
      expect(groupAgg('银行', 'count')).toBe(1);
    });

    it('按行业最大值', () => {
      expect(groupAgg('白酒', 'max')).toBe(1900);
    });

    it('按行业最小值', () => {
      expect(groupAgg('白酒', 'min')).toBe(150);
    });
  });
});
