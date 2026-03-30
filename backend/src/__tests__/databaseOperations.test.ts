import { describe, it, expect } from 'vitest';

// 数据库操作深度测试
describe('数据库操作引擎', () => {
  describe('SQL查询构建器', () => {
    const buildQuery = (config: {
      select?: string[];
      table: string;
      where?: Record<string, unknown>;
      orderBy?: { field: string; dir: 'ASC' | 'DESC' }[];
      limit?: number;
      offset?: number;
      joins?: { type: string; table: string; on: string }[];
    }) => {
      let sql = `SELECT ${(config.select || ['*']).join(', ')} FROM ${config.table}`;
      const params: unknown[] = [];

      if (config.joins) {
        for (const j of config.joins) {
          sql += ` ${j.type} JOIN ${j.table} ON ${j.on}`;
        }
      }

      if (config.where) {
        const conditions = Object.entries(config.where).map(([key, value]) => {
          params.push(value);
          return `${key} = $${params.length}`;
        });
        if (conditions.length > 0) sql += ` WHERE ${conditions.join(' AND ')}`;
      }

      if (config.orderBy) {
        const orders = config.orderBy.map(o => `${o.field} ${o.dir}`);
        sql += ` ORDER BY ${orders.join(', ')}`;
      }

      if (config.limit) {
        params.push(config.limit);
        sql += ` LIMIT $${params.length}`;
      }

      if (config.offset) {
        params.push(config.offset);
        sql += ` OFFSET $${params.length}`;
      }

      return { sql, params };
    };

    it('简单SELECT', () => {
      const q = buildQuery({ table: 'stocks' });
      expect(q.sql).toBe('SELECT * FROM stocks');
      expect(q.params).toHaveLength(0);
    });

    it('指定字段', () => {
      const q = buildQuery({ select: ['code', 'name', 'price'], table: 'stocks' });
      expect(q.sql).toContain('code, name, price');
    });

    it('WHERE条件', () => {
      const q = buildQuery({ table: 'stocks', where: { code: '600000' } });
      expect(q.sql).toContain('WHERE code = $1');
      expect(q.params).toContain('600000');
    });

    it('多WHERE条件', () => {
      const q = buildQuery({
        table: 'stocks',
        where: { market: 'sh', sector: 'bank' },
      });
      expect(q.sql).toContain('AND');
      expect(q.params).toHaveLength(2);
    });

    it('ORDER BY', () => {
      const q = buildQuery({
        table: 'stocks',
        orderBy: [{ field: 'price', dir: 'DESC' }],
      });
      expect(q.sql).toContain('ORDER BY price DESC');
    });

    it('多字段排序', () => {
      const q = buildQuery({
        table: 'stocks',
        orderBy: [
          { field: 'market_cap', dir: 'DESC' },
          { field: 'code', dir: 'ASC' },
        ],
      });
      expect(q.sql).toContain('ORDER BY market_cap DESC, code ASC');
    });

    it('LIMIT和OFFSET', () => {
      const q = buildQuery({ table: 'stocks', limit: 10, offset: 20 });
      expect(q.sql).toContain('LIMIT $1');
      expect(q.sql).toContain('OFFSET $2');
      expect(q.params).toEqual([10, 20]);
    });

    it('JOIN', () => {
      const q = buildQuery({
        table: 'stocks s',
        joins: [{ type: 'LEFT', table: 'prices p', on: 's.code = p.code' }],
      });
      expect(q.sql).toContain('LEFT JOIN prices p ON s.code = p.code');
    });

    it('多JOIN', () => {
      const q = buildQuery({
        table: 'stocks s',
        joins: [
          { type: 'INNER', table: 'prices p', on: 's.code = p.code' },
          { type: 'LEFT', table: 'sectors sec', on: 's.sector_id = sec.id' },
        ],
      });
      expect(q.sql).toContain('INNER JOIN prices p');
      expect(q.sql).toContain('LEFT JOIN sectors sec');
    });
  });

  describe('分页查询', () => {
    const paginate = <T>(data: T[], page: number, pageSize: number) => {
      const totalItems = data.length;
      const totalPages = Math.ceil(totalItems / pageSize);
      const start = (page - 1) * pageSize;
      const items = data.slice(start, start + pageSize);
      return {
        items,
        pagination: {
          page,
          pageSize,
          totalItems,
          totalPages,
          hasNext: page < totalPages,
          hasPrev: page > 1,
        },
      };
    };

    it('第一页', () => {
      const data = Array.from({ length: 100 }, (_, i) => i);
      const result = paginate(data, 1, 10);
      expect(result.items).toHaveLength(10);
      expect(result.items[0]).toBe(0);
      expect(result.pagination.hasNext).toBe(true);
      expect(result.pagination.hasPrev).toBe(false);
    });

    it('最后一页', () => {
      const data = Array.from({ length: 25 }, (_, i) => i);
      const result = paginate(data, 3, 10);
      expect(result.items).toHaveLength(5);
      expect(result.pagination.hasNext).toBe(false);
      expect(result.pagination.hasPrev).toBe(true);
    });

    it('超出页数返回空', () => {
      const data = [1, 2, 3];
      const result = paginate(data, 10, 10);
      expect(result.items).toHaveLength(0);
    });

    it('总页数计算', () => {
      const data = Array(95).fill(0);
      expect(paginate(data, 1, 10).pagination.totalPages).toBe(10);
    });

    it('单页全部返回', () => {
      const data = [1, 2, 3];
      const result = paginate(data, 1, 10);
      expect(result.items).toHaveLength(3);
      expect(result.pagination.totalPages).toBe(1);
    });

    it('每页1条', () => {
      const data = [1, 2, 3, 4, 5];
      const result = paginate(data, 3, 1);
      expect(result.items).toEqual([3]);
    });
  });

  describe('批量操作', () => {
    const batchInsert = <T extends Record<string, unknown>>(
      records: T[],
      batchSize: number
    ): T[][] => {
      const batches: T[][] = [];
      for (let i = 0; i < records.length; i += batchSize) {
        batches.push(records.slice(i, i + batchSize));
      }
      return batches;
    };

    it('按批次拆分', () => {
      const records = Array.from({ length: 25 }, (_, i) => ({ id: i }));
      const batches = batchInsert(records, 10);
      expect(batches).toHaveLength(3);
      expect(batches[0]).toHaveLength(10);
      expect(batches[1]).toHaveLength(10);
      expect(batches[2]).toHaveLength(5);
    });

    it('精确整除', () => {
      const records = Array.from({ length: 20 }, (_, i) => ({ id: i }));
      const batches = batchInsert(records, 10);
      expect(batches).toHaveLength(2);
      expect(batches[1]).toHaveLength(10);
    });

    it('单条批次', () => {
      const records = [{ id: 1 }];
      const batches = batchInsert(records, 10);
      expect(batches).toHaveLength(1);
    });

    it('空记录返回空', () => {
      expect(batchInsert([], 10)).toEqual([]);
    });

    it('批次大小为1', () => {
      const records = [{ id: 1 }, { id: 2 }, { id: 3 }];
      const batches = batchInsert(records, 1);
      expect(batches).toHaveLength(3);
    });
  });

  describe('数据去重', () => {
    const dedupBy = <T>(records: T[], keyFn: (item: T) => string): T[] => {
      const seen = new Map<string, T>();
      for (const record of records) {
        const key = keyFn(record);
        if (!seen.has(key)) seen.set(key, record);
      }
      return [...seen.values()];
    };

    it('按主键去重', () => {
      const records = [
        { id: 1, name: 'A' },
        { id: 2, name: 'B' },
        { id: 1, name: 'A2' },
      ];
      const result = dedupBy(records, r => String(r.id));
      expect(result).toHaveLength(2);
      // 保留第一个
      expect(result.find(r => r.id === 1)!.name).toBe('A');
    });

    it('复合键去重', () => {
      const records = [
        { code: '600000', date: '2024-01-01' },
        { code: '600000', date: '2024-01-02' },
        { code: '600000', date: '2024-01-01' },
      ];
      const result = dedupBy(records, r => `${r.code}-${r.date}`);
      expect(result).toHaveLength(2);
    });

    it('无重复不变', () => {
      const records = [{ id: 1 }, { id: 2 }];
      expect(dedupBy(records, r => String(r.id))).toHaveLength(2);
    });

    it('全部重复保留一个', () => {
      const records = [{ id: 1 }, { id: 1 }, { id: 1 }];
      expect(dedupBy(records, r => String(r.id))).toHaveLength(1);
    });
  });

  describe('数据迁移', () => {
    const migrate = (
      data: Record<string, unknown>[],
      mapping: Record<string, string>,
      defaults: Record<string, unknown> = {}
    ) => {
      return data.map(row => {
        const newRow: Record<string, unknown> = { ...defaults };
        for (const [oldKey, newKey] of Object.entries(mapping)) {
          if (oldKey in row) newRow[newKey] = row[oldKey];
        }
        return newRow;
      });
    };

    it('字段重命名', () => {
      const data = [{ stock_code: '600000', close_price: 10.5 }];
      const result = migrate(data, { stock_code: 'code', close_price: 'price' });
      expect(result[0]).toEqual({ code: '600000', price: 10.5 });
    });

    it('填充默认值', () => {
      const data = [{ code: '600000' }];
      const result = migrate(data, {}, { status: 'active', version: 1 });
      expect(result[0].status).toBe('active');
      expect(result[0].version).toBe(1);
    });

    it('映射优先于默认值', () => {
      const data = [{ status: 'inactive' }];
      const result = migrate(data, { status: 'status' }, { status: 'active' });
      expect(result[0].status).toBe('inactive');
    });

    it('空数据返回空', () => {
      expect(migrate([], { a: 'b' })).toEqual([]);
    });
  });

  describe('连接池管理', () => {
    const createPool = (maxSize: number) => {
      const active = new Set<string>();
      const idle: string[] = [];
      let counter = 0;

      return {
        acquire(): string | null {
          if (idle.length > 0) {
            const conn = idle.pop()!;
            active.add(conn);
            return conn;
          }
          if (active.size < maxSize) {
            const conn = `conn-${++counter}`;
            active.add(conn);
            return conn;
          }
          return null;
        },
        release(conn: string) {
          if (active.delete(conn)) idle.push(conn);
        },
        stats() {
          return { active: active.size, idle: idle.length, total: active.size + idle.length };
        },
      };
    };

    it('获取连接', () => {
      const pool = createPool(5);
      const conn = pool.acquire();
      expect(conn).not.toBeNull();
      expect(pool.stats().active).toBe(1);
    });

    it('释放后复用', () => {
      const pool = createPool(5);
      const c1 = pool.acquire();
      pool.release(c1!);
      const c2 = pool.acquire();
      expect(c2).toBe(c1);
    });

    it('超上限返回null', () => {
      const pool = createPool(1);
      pool.acquire();
      expect(pool.acquire()).toBeNull();
    });

    it('统计正确', () => {
      const pool = createPool(5);
      pool.acquire();
      pool.acquire();
      const c3 = pool.acquire();
      pool.release(c3!);
      expect(pool.stats()).toEqual({ active: 2, idle: 1, total: 3 });
    });
  });
});
