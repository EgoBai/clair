import { describe, it, expect } from 'vitest';

// GraphQL-like Query Engine for stock data
interface QueryField {
  name: string;
  alias?: string;
  args?: Record<string, unknown>;
  fields?: QueryField[];
}

interface QueryResult {
  data: Record<string, unknown>;
  errors: string[];
}

function executeQuery(schema: Record<string, (args: Record<string, unknown>) => unknown>, query: QueryField): QueryResult {
  const data: Record<string, unknown> = {};
  const errors: string[] = [];

  const resolver = schema[query.name];
  if (!resolver) {
    errors.push(`Field "${query.name}" not found in schema`);
    return { data, errors };
  }

  try {
    const result = resolver(query.args || {});
    const key = query.alias || query.name;
    if (query.fields && typeof result === 'object' && result !== null) {
      const nested: Record<string, unknown> = {};
      const obj = result as Record<string, unknown>;
      for (const subField of query.fields) {
        if (subField.name in obj) {
          nested[subField.alias || subField.name] = obj[subField.name];
        } else {
          errors.push(`Field "${subField.name}" not found on "${query.name}"`);
        }
      }
      data[key] = nested;
    } else {
      data[key] = result;
    }
  } catch (e) {
    errors.push(`Error resolving "${query.name}": ${(e as Error).message}`);
  }

  return { data, errors };
}

function validateQuery(query: QueryField, maxDepth: number, currentDepth = 0): string[] {
  const errors: string[] = [];
  if (currentDepth > maxDepth) {
    errors.push(`Query depth ${currentDepth} exceeds maximum ${maxDepth}`);
    return errors;
  }
  if (!query.name || query.name.trim() === '') {
    errors.push('Query field name cannot be empty');
  }
  if (query.fields) {
    for (const field of query.fields) {
      errors.push(...validateQuery(field, maxDepth, currentDepth + 1));
    }
  }
  return errors;
}

function buildPaginationArgs(page: number, pageSize: number, maxPageSize: number): Record<string, unknown> {
  const safePage = Math.max(1, Math.floor(page));
  const safePageSize = Math.min(maxPageSize, Math.max(1, Math.floor(pageSize)));
  return {
    offset: (safePage - 1) * safePageSize,
    limit: safePageSize,
    page: safePage,
    pageSize: safePageSize,
  };
}

function mergeQueryResults(...results: QueryResult[]): QueryResult {
  const merged: QueryResult = { data: {}, errors: [] };
  for (const r of results) {
    Object.assign(merged.data, r.data);
    merged.errors.push(...r.errors);
  }
  return merged;
}

describe('GraphQL Query Engine', () => {
  const schema: Record<string, (args: Record<string, unknown>) => unknown> = {
    stock: (args) => ({
      code: args.code,
      name: '贵州茅台',
      price: 1800.50,
      change: 2.5,
      volume: 125000,
    }),
    market: () => ({
      index: 3200,
      changePercent: 0.85,
      turnover: 950000000000,
    }),
    error_field: () => {
      throw new Error('Resolver error');
    },
  };

  it('should execute simple query', () => {
    const query: QueryField = { name: 'stock', args: { code: '600519' } };
    const result = executeQuery(schema, query);
    expect(result.errors).toHaveLength(0);
    expect(result.data.stock).toBeDefined();
    expect((result.data.stock as any).code).toBe('600519');
  });

  it('should execute nested field selection', () => {
    const query: QueryField = {
      name: 'stock',
      args: { code: '600519' },
      fields: [
        { name: 'code' },
        { name: 'price' },
      ],
    };
    const result = executeQuery(schema, query);
    expect(result.errors).toHaveLength(0);
    const stock = result.data.stock as any;
    expect(stock.code).toBe('600519');
    expect(stock.price).toBe(1800.50);
  });

  it('should handle missing fields in nested selection', () => {
    const query: QueryField = {
      name: 'stock',
      args: { code: '600519' },
      fields: [
        { name: 'nonexistent' },
      ],
    };
    const result = executeQuery(schema, query);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors[0]).toContain('nonexistent');
  });

  it('should handle unknown root field', () => {
    const query: QueryField = { name: 'unknown' };
    const result = executeQuery(schema, query);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it('should handle resolver errors', () => {
    const query: QueryField = { name: 'error_field' };
    const result = executeQuery(schema, query);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it('should support field aliases', () => {
    const query: QueryField = {
      name: 'stock',
      alias: 'maotai',
      args: { code: '600519' },
    };
    const result = executeQuery(schema, query);
    expect(result.data.maotai).toBeDefined();
  });

  it('should validate query depth', () => {
    const deepQuery: QueryField = {
      name: 'a',
      fields: [{
        name: 'b',
        fields: [{
          name: 'c',
          fields: [{ name: 'd' }],
        }],
      }],
    };
    const errors = validateQuery(deepQuery, 2);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0]).toContain('depth');
  });

  it('should validate empty field name', () => {
    const query: QueryField = { name: '' };
    const errors = validateQuery(query, 5);
    expect(errors.length).toBeGreaterThan(0);
  });

  it('should build pagination args correctly', () => {
    const args = buildPaginationArgs(3, 20, 100);
    expect(args.offset).toBe(40);
    expect(args.limit).toBe(20);
    expect(args.page).toBe(3);
  });

  it('should enforce max page size', () => {
    const args = buildPaginationArgs(1, 500, 100);
    expect(args.limit).toBe(100);
  });

  it('should handle negative page numbers', () => {
    const args = buildPaginationArgs(-1, 10, 100);
    expect(args.page).toBe(1);
    expect(args.offset).toBe(0);
  });

  it('should handle zero page size', () => {
    const args = buildPaginationArgs(1, 0, 100);
    expect(args.pageSize).toBe(1);
  });

  it('should merge query results', () => {
    const r1: QueryResult = { data: { a: 1 }, errors: [] };
    const r2: QueryResult = { data: { b: 2 }, errors: ['err'] };
    const merged = mergeQueryResults(r1, r2);
    expect(merged.data.a).toBe(1);
    expect(merged.data.b).toBe(2);
    expect(merged.errors).toHaveLength(1);
  });

  it('should merge empty results', () => {
    const merged = mergeQueryResults();
    expect(Object.keys(merged.data)).toHaveLength(0);
    expect(merged.errors).toHaveLength(0);
  });
});

// Query Builder
interface QueryFilter {
  field: string;
  operator: 'eq' | 'gt' | 'lt' | 'gte' | 'lte' | 'in' | 'between';
  value: unknown;
}

function buildWhereClause(filters: QueryFilter[]): string {
  return filters.map(f => {
    switch (f.operator) {
      case 'eq': return `${f.field} = '${f.value}'`;
      case 'gt': return `${f.field} > ${f.value}`;
      case 'lt': return `${f.field} < ${f.value}`;
      case 'gte': return `${f.field} >= ${f.value}`;
      case 'lte': return `${f.field} <= ${f.value}`;
      case 'in': return `${f.field} IN (${(f.value as unknown[]).map(v => `'${v}'`).join(', ')})`;
      case 'between': {
        const [min, max] = f.value as [unknown, unknown];
        return `${f.field} BETWEEN ${min} AND ${max}`;
      }
      default: return '';
    }
  }).join(' AND ');
}

describe('Query Builder', () => {
  it('should build eq filter', () => {
    const clause = buildWhereClause([{ field: 'market', operator: 'eq', value: 'SH' }]);
    expect(clause).toBe("market = 'SH'");
  });

  it('should build gt filter', () => {
    const clause = buildWhereClause([{ field: 'pe', operator: 'gt', value: 20 }]);
    expect(clause).toBe('pe > 20');
  });

  it('should build lt filter', () => {
    const clause = buildWhereClause([{ field: 'price', operator: 'lt', value: 100 }]);
    expect(clause).toBe('price < 100');
  });

  it('should build gte filter', () => {
    const clause = buildWhereClause([{ field: 'volume', operator: 'gte', value: 1000000 }]);
    expect(clause).toBe('volume >= 1000000');
  });

  it('should build lte filter', () => {
    const clause = buildWhereClause([{ field: 'roe', operator: 'lte', value: 30 }]);
    expect(clause).toBe('roe <= 30');
  });

  it('should build in filter', () => {
    const clause = buildWhereClause([{ field: 'sector', operator: 'in', value: ['tech', 'finance'] }]);
    expect(clause).toBe("sector IN ('tech', 'finance')");
  });

  it('should build between filter', () => {
    const clause = buildWhereClause([{ field: 'pe', operator: 'between', value: [10, 30] }]);
    expect(clause).toBe('pe BETWEEN 10 AND 30');
  });

  it('should combine multiple filters with AND', () => {
    const clause = buildWhereClause([
      { field: 'market', operator: 'eq', value: 'SH' },
      { field: 'pe', operator: 'gt', value: 10 },
    ]);
    expect(clause).toContain(' AND ');
  });

  it('should handle empty filters', () => {
    const clause = buildWhereClause([]);
    expect(clause).toBe('');
  });

  it('should handle single in value', () => {
    const clause = buildWhereClause([{ field: 'code', operator: 'in', value: ['600519'] }]);
    expect(clause).toBe("code IN ('600519')");
  });

  it('should handle empty in array', () => {
    const clause = buildWhereClause([{ field: 'code', operator: 'in', value: [] }]);
    expect(clause).toBe('code IN ()');
  });

  it('should handle between with equal values', () => {
    const clause = buildWhereClause([{ field: 'price', operator: 'between', value: [100, 100] }]);
    expect(clause).toBe('price BETWEEN 100 AND 100');
  });
});
