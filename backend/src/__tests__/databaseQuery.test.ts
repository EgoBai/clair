import { describe, it, expect } from 'vitest';

// 数据库查询构建器测试 - SQL拼装、条件过滤、排序、聚合

interface WhereClause {
  field: string;
  operator: 'eq' | 'ne' | 'gt' | 'lt' | 'gte' | 'lte' | 'in' | 'like' | 'between' | 'is_null' | 'is_not_null';
  value?: any;
}

interface OrderClause {
  field: string;
  direction: 'ASC' | 'DESC';
}

interface JoinClause {
  type: 'INNER' | 'LEFT' | 'RIGHT';
  table: string;
  on: string;
}

interface QueryBuilder {
  table: string;
  select: string[];
  where: WhereClause[];
  orderBy: OrderClause[];
  limit?: number;
  offset?: number;
  joins: JoinClause[];
  groupBy: string[];
  having: WhereClause[];
}

function buildSelect(qb: QueryBuilder): string {
  let sql = `SELECT ${qb.select.length ? qb.select.join(', ') : '*'} FROM ${qb.table}`;

  for (const join of qb.joins) {
    sql += ` ${join.type} JOIN ${join.table} ON ${join.on}`;
  }

  if (qb.where.length > 0) {
    const conditions = qb.where.map(w => whereToSql(w));
    sql += ` WHERE ${conditions.join(' AND ')}`;
  }

  if (qb.groupBy.length > 0) {
    sql += ` GROUP BY ${qb.groupBy.join(', ')}`;
  }

  if (qb.having.length > 0) {
    const conditions = qb.having.map(w => whereToSql(w));
    sql += ` HAVING ${conditions.join(' AND ')}`;
  }

  if (qb.orderBy.length > 0) {
    const orders = qb.orderBy.map(o => `${o.field} ${o.direction}`);
    sql += ` ORDER BY ${orders.join(', ')}`;
  }

  if (qb.limit !== undefined) {
    sql += ` LIMIT ${qb.limit}`;
  }

  if (qb.offset !== undefined) {
    sql += ` OFFSET ${qb.offset}`;
  }

  return sql;
}

function whereToSql(w: WhereClause): string {
  switch (w.operator) {
    case 'eq': return `${w.field} = '${w.value}'`;
    case 'ne': return `${w.field} != '${w.value}'`;
    case 'gt': return `${w.field} > ${w.value}`;
    case 'lt': return `${w.field} < ${w.value}`;
    case 'gte': return `${w.field} >= ${w.value}`;
    case 'lte': return `${w.field} <= ${w.value}`;
    case 'in': return `${w.field} IN (${(w.value as any[]).map(v => `'${v}'`).join(', ')})`;
    case 'like': return `${w.field} LIKE '${w.value}'`;
    case 'between': return `${w.field} BETWEEN ${w.value[0]} AND ${w.value[1]}`;
    case 'is_null': return `${w.field} IS NULL`;
    case 'is_not_null': return `${w.field} IS NOT NULL`;
    default: return '';
  }
}

function createQueryBuilder(table: string): QueryBuilder {
  return { table, select: [], where: [], orderBy: [], joins: [], groupBy: [], having: [] };
}

interface AggregateResult {
  count: number;
  sum?: number;
  avg?: number;
  min?: number;
  max?: number;
}

function aggregate(data: number[]): AggregateResult {
  if (data.length === 0) return { count: 0 };
  return {
    count: data.length,
    sum: data.reduce((a, b) => a + b, 0),
    avg: data.reduce((a, b) => a + b, 0) / data.length,
    min: Math.min(...data),
    max: Math.max(...data),
  };
}

function paginate<T>(data: T[], page: number, pageSize: number): { items: T[]; total: number; totalPages: number; page: number } {
  const total = data.length;
  const totalPages = Math.ceil(total / pageSize);
  const start = (page - 1) * pageSize;
  return {
    items: data.slice(start, start + pageSize),
    total,
    totalPages,
    page,
  };
}

describe('数据库查询构建器测试', () => {
  describe('SELECT 构建', () => {
    it('基本 SELECT *', () => {
      const qb = createQueryBuilder('stocks');
      const sql = buildSelect(qb);
      expect(sql).toBe('SELECT * FROM stocks');
    });

    it('指定字段', () => {
      const qb = createQueryBuilder('stocks');
      qb.select = ['code', 'name', 'price'];
      const sql = buildSelect(qb);
      expect(sql).toContain('SELECT code, name, price');
    });

    it('DISTINCT', () => {
      const qb = createQueryBuilder('stocks');
      qb.select = ['DISTINCT industry'];
      const sql = buildSelect(qb);
      expect(sql).toContain('DISTINCT industry');
    });
  });

  describe('WHERE 条件', () => {
    it('等值条件', () => {
      const qb = createQueryBuilder('stocks');
      qb.where = [{ field: 'market', operator: 'eq', value: 'SH' }];
      const sql = buildSelect(qb);
      expect(sql).toContain("WHERE market = 'SH'");
    });

    it('大于条件', () => {
      const qb = createQueryBuilder('stocks');
      qb.where = [{ field: 'price', operator: 'gt', value: 100 }];
      const sql = buildSelect(qb);
      expect(sql).toContain('WHERE price > 100');
    });

    it('IN 条件', () => {
      const qb = createQueryBuilder('stocks');
      qb.where = [{ field: 'code', operator: 'in', value: ['600519', '000858'] }];
      const sql = buildSelect(qb);
      expect(sql).toContain("code IN ('600519', '000858')");
    });

    it('LIKE 条件', () => {
      const qb = createQueryBuilder('stocks');
      qb.where = [{ field: 'name', operator: 'like', value: '%茅台%' }];
      const sql = buildSelect(qb);
      expect(sql).toContain("name LIKE '%茅台%'");
    });

    it('BETWEEN 条件', () => {
      const qb = createQueryBuilder('stocks');
      qb.where = [{ field: 'pe', operator: 'between', value: [10, 30] }];
      const sql = buildSelect(qb);
      expect(sql).toContain('pe BETWEEN 10 AND 30');
    });

    it('IS NULL 条件', () => {
      const qb = createQueryBuilder('stocks');
      qb.where = [{ field: 'delisted_at', operator: 'is_null' }];
      const sql = buildSelect(qb);
      expect(sql).toContain('delisted_at IS NULL');
    });

    it('多个条件 AND 连接', () => {
      const qb = createQueryBuilder('stocks');
      qb.where = [
        { field: 'market', operator: 'eq', value: 'SH' },
        { field: 'price', operator: 'gte', value: 50 },
      ];
      const sql = buildSelect(qb);
      expect(sql).toContain(' AND ');
    });
  });

  describe('JOIN', () => {
    it('INNER JOIN', () => {
      const qb = createQueryBuilder('stocks');
      qb.joins = [{ type: 'INNER', table: 'industries', on: 'stocks.industry_id = industries.id' }];
      const sql = buildSelect(qb);
      expect(sql).toContain('INNER JOIN industries ON stocks.industry_id = industries.id');
    });

    it('LEFT JOIN', () => {
      const qb = createQueryBuilder('stocks');
      qb.joins = [{ type: 'LEFT', table: 'quotes', on: 'stocks.code = quotes.code' }];
      const sql = buildSelect(qb);
      expect(sql).toContain('LEFT JOIN quotes ON stocks.code = quotes.code');
    });

    it('多表JOIN', () => {
      const qb = createQueryBuilder('stocks');
      qb.joins = [
        { type: 'LEFT', table: 'quotes', on: 'stocks.code = quotes.code' },
        { type: 'INNER', table: 'industries', on: 'stocks.industry_id = industries.id' },
      ];
      const sql = buildSelect(qb);
      expect(sql).toContain('LEFT JOIN');
      expect(sql).toContain('INNER JOIN');
    });
  });

  describe('排序和分页', () => {
    it('ORDER BY ASC', () => {
      const qb = createQueryBuilder('stocks');
      qb.orderBy = [{ field: 'price', direction: 'ASC' }];
      const sql = buildSelect(qb);
      expect(sql).toContain('ORDER BY price ASC');
    });

    it('ORDER BY 多字段', () => {
      const qb = createQueryBuilder('stocks');
      qb.orderBy = [
        { field: 'industry', direction: 'ASC' },
        { field: 'price', direction: 'DESC' },
      ];
      const sql = buildSelect(qb);
      expect(sql).toContain('ORDER BY industry ASC, price DESC');
    });

    it('LIMIT', () => {
      const qb = createQueryBuilder('stocks');
      qb.limit = 10;
      const sql = buildSelect(qb);
      expect(sql).toContain('LIMIT 10');
    });

    it('LIMIT + OFFSET', () => {
      const qb = createQueryBuilder('stocks');
      qb.limit = 20;
      qb.offset = 40;
      const sql = buildSelect(qb);
      expect(sql).toContain('LIMIT 20');
      expect(sql).toContain('OFFSET 40');
    });
  });

  describe('GROUP BY 和 HAVING', () => {
    it('GROUP BY', () => {
      const qb = createQueryBuilder('stocks');
      qb.select = ['industry', 'COUNT(*) as cnt'];
      qb.groupBy = ['industry'];
      const sql = buildSelect(qb);
      expect(sql).toContain('GROUP BY industry');
    });

    it('HAVING', () => {
      const qb = createQueryBuilder('stocks');
      qb.select = ['industry', 'AVG(pe) as avg_pe'];
      qb.groupBy = ['industry'];
      qb.having = [{ field: 'AVG(pe)', operator: 'gt', value: 20 }];
      const sql = buildSelect(qb);
      expect(sql).toContain('HAVING AVG(pe) > 20');
    });
  });

  describe('聚合函数', () => {
    it('基本聚合', () => {
      const result = aggregate([10, 20, 30, 40, 50]);
      expect(result.count).toBe(5);
      expect(result.sum).toBe(150);
      expect(result.avg).toBe(30);
      expect(result.min).toBe(10);
      expect(result.max).toBe(50);
    });

    it('空数组', () => {
      const result = aggregate([]);
      expect(result.count).toBe(0);
      expect(result.sum).toBeUndefined();
    });

    it('单元素', () => {
      const result = aggregate([42]);
      expect(result.count).toBe(1);
      expect(result.sum).toBe(42);
      expect(result.avg).toBe(42);
      expect(result.min).toBe(42);
      expect(result.max).toBe(42);
    });

    it('负数聚合', () => {
      const result = aggregate([-10, -20, 5]);
      expect(result.sum).toBe(-25);
      expect(result.min).toBe(-20);
      expect(result.max).toBe(5);
    });

    it('浮点数精度', () => {
      const result = aggregate([0.1, 0.2, 0.3]);
      expect(result.sum).toBeCloseTo(0.6, 10);
    });
  });

  describe('分页', () => {
    const data = Array.from({ length: 25 }, (_, i) => i + 1);

    it('第一页', () => {
      const result = paginate(data, 1, 10);
      expect(result.items).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
      expect(result.total).toBe(25);
      expect(result.totalPages).toBe(3);
    });

    it('最后一页不满', () => {
      const result = paginate(data, 3, 10);
      expect(result.items).toEqual([21, 22, 23, 24, 25]);
      expect(result.items.length).toBe(5);
    });

    it('超出范围', () => {
      const result = paginate(data, 10, 10);
      expect(result.items).toEqual([]);
    });

    it('每页1个', () => {
      const result = paginate(data, 5, 1);
      expect(result.items).toEqual([5]);
      expect(result.totalPages).toBe(25);
    });

    it('空数据', () => {
      const result = paginate([], 1, 10);
      expect(result.items).toEqual([]);
      expect(result.totalPages).toBe(0);
    });
  });
});
