/**
 * symbolNormalize.test.ts — P0-SYMBOL「符号规范化缺口」回归
 *
 * 运行：`cd backend && env -u NODE_OPTIONS ./node_modules/.bin/vitest run src/__tests__/symbolNormalize.test.ts`
 *
 * ── 缺陷（已实测坐实，非推断）──────────────────────────────────────────
 * `stocks.symbol` 在 PostgreSQL 里 **5544/5544 全是带后缀格式**（`600519.SH`），
 * **0 条裸码**；而前端几乎所有调用传的是**裸代码**（`600519`）。
 * 后端部分路径用**精确匹配**查库（`where('symbol', x)`），于是必然查不到：
 *
 *   | 端点                        | 裸码 600519 | 带后缀 600519.SH |
 *   |-----------------------------|-------------|------------------|
 *   | GET  /api/stocks/600519     | ✅ real      | ✅ real          |
 *   | GET  /api/indicators/600519 | ❌ 404 股票未找到 | ❌ 500 Invalid time value |
 *   | POST /api/stocks/batch/quotes | ❌ unavailable 空 | ⚠️ real 但 latestQuote:null |
 *   | POST /api/tech/batch        | ❌ unavailable | ❌ unavailable   |
 *
 * ── 三个独立缺陷，同一批症状 ───────────────────────────────────────────
 * ① **符号规范化缺口（主因）**：规范化只写在 `/stocks*` 路由里，
 *    `/indicators`、`/tech/batch`、`/batch/quotes` 全未覆盖。
 * ② **getDailyQuotes 返回形态与声明类型不符**：声明 `Promise<DailyQuote[]>`
 *    （camelCase），实际直接返回 knex 原始行（snake_case）。
 *    于是 `new Date(q.tradeDate).toISOString()` → Invalid time value → **500**；
 *    `Number(q.closePrice)` → NaN 被 filter 掉 → tech/batch **静默 unavailable**。
 * ③ **键名错配**：getStocksWithLatestQuotes 里 knex `.raw()` 返回 snake_case 行，
 *    代码却读 camelCase 的 `quote.stockId`（恒 undefined），
 *    导致 `latestQuote` 永远取不到。
 *
 * ── 本文件的断言策略 ────────────────────────────────────────────────────
 * 核心不变式：**同一只股票，裸码 / 带后缀 / `sh.600519` 三种写法必须解析到同一 id**，
 * 且拿到**同一份**行情（不是「都非空」，而是「完全一致」——否则说明各自命中了不同来源）。
 * 断言相等而非断言非空，才能同时挡住「规范化被写歪」和「两套数据源各命中一只」两种退化。
 */

import { describe, it, expect } from 'vitest';
import knex from 'knex';
import { Database } from '../db/Database';
import { InMemoryDatabase } from '../db/InMemoryDatabase';
import { symbolCandidates, normalizeSymbol, toBareCode } from '../utils/symbolUtils';

/** 三种等价写法 → 必须解析到同一只股票 */
const EQUIVALENT_FORMS = ['600519', '600519.SH', 'sh.600519'] as const;

/** 深市一只（验证前缀推断分支不是只对 6 开头生效） */
const SZ_EQUIVALENT_FORMS = ['000001', '000001.SZ', 'sz.000001'] as const;

// ======================================================================
// 一、symbolCandidates：候选展开本身（纯函数，无需 DB）
// ======================================================================

describe('P0-SYMBOL：symbolCandidates 展开等价写法', () => {
  it('裸码 / 带后缀 / sh. 前缀 三种写法展开出**同一组**候选（顺序无关）', () => {
    const asSet = (s: string) => new Set(symbolCandidates(s));
    const fromBare = asSet('600519');
    // 裸码必须同时覆盖「带后缀」与「裸码」两种库内写法
    expect(fromBare.has('600519.SH')).toBe(true);
    expect(fromBare.has('600519')).toBe(true);

    // 三种写法互相等价：谁都不必是对方的超集以外的特例
    for (const form of ['600519.SH', 'sh.600519']) {
      const set = asSet(form);
      for (const expected of fromBare) {
        expect(set.has(expected), `${form} 应能命中 ${expected}`).toBe(true);
      }
    }
  });

  it('候选列表已去重且不含空串', () => {
    for (const form of [...EQUIVALENT_FORMS, ...SZ_EQUIVALENT_FORMS]) {
      const c = symbolCandidates(form);
      expect(new Set(c).size, `${form} 候选有重复`).toBe(c.length);
      expect(c.filter(s => s === '' || s == null).length, `${form} 候选含空串`).toBe(0);
    }
  });

  it('规范化形式排在候选首位（多候选同时命中时优先取它，保证解析稳定）', () => {
    expect(symbolCandidates('600519')[0]).toBe('600519.SH');
    expect(symbolCandidates('sh.600519')[0]).toBe('600519.SH');
    expect(symbolCandidates('000001')[0]).toBe('000001.SZ');
  });

  it('空/空白输入返回空数组（不得把 undefined 塞进 whereIn）', () => {
    expect(symbolCandidates('')).toEqual([]);
    expect(symbolCandidates('   ')).toEqual([]);
    expect(symbolCandidates(undefined as unknown as string)).toEqual([]);
  });

  it('复用既有实现而非另立规则：候选必含 normalizeSymbol 与 toBareCode 的结果', () => {
    // 防止有人在本函数里手写新的后缀推断规则，悄悄与 symbolUtils 分叉
    for (const form of [...EQUIVALENT_FORMS, ...SZ_EQUIVALENT_FORMS]) {
      const c = symbolCandidates(form);
      expect(c).toContain(normalizeSymbol(form));
      expect(c).toContain(toBareCode(form));
    }
  });

  it('非 A 股格式（如指数/ETF 代码）不被强行改写，原样保留可查', () => {
    // 不能因为「不是 6 位数字」就丢弃输入，否则指数/ETF 一律查不到
    expect(symbolCandidates('000001.SH')).toContain('000001.SH');
    expect(symbolCandidates('sh000001')).toContain('sh000001');
  });
});

// ======================================================================
// 二、InMemoryDatabase：数据层真的按候选命中（无需真实 PG）
// ======================================================================

describe('P0-SYMBOL：InMemoryDatabase.getStockBySymbol 接受全部等价写法', () => {
  const db = new InMemoryDatabase();

  it('三种写法解析到**同一只**股票（断言相等，非仅非空）', async () => {
    const rows = [];
    for (const form of EQUIVALENT_FORMS) {
      const s = await db.getStockBySymbol(form);
      expect(s, `${form} 应能查到`).not.toBeNull();
      rows.push(s!);
    }
    const ids = new Set(rows.map(r => r.id));
    expect(ids.size, '三种写法必须指向同一只股票（否则说明命中了不同标的）').toBe(1);
    expect(rows[0].symbol).toBe(rows[1].symbol);
    expect(rows[1].symbol).toBe(rows[2].symbol);
  });

  it('深市标的同样成立（0 开头 → .SZ 分支）', async () => {
    const rows = [];
    for (const form of SZ_EQUIVALENT_FORMS) {
      const s = await db.getStockBySymbol(form);
      expect(s, `${form} 应能查到`).not.toBeNull();
      rows.push(s!);
    }
    expect(new Set(rows.map(r => r.id)).size).toBe(1);
  });

  it('getStockWithLatestQuote / getStocksWithLatestQuotes 同样兼容两种写法', async () => {
    const a = await db.getStockWithLatestQuote('600519');
    const b = await db.getStockWithLatestQuote('600519.SH');
    expect(a).not.toBeNull();
    expect(b).not.toBeNull();
    expect(a!.id).toBe(b!.id);

    const many = await db.getStocksWithLatestQuotes(['600519', '600519.SH']);
    // 同一只股票传两种写法不得产生重复行
    expect(many.length).toBe(1);
    expect(many[0].symbol).toBe(a!.symbol);
  });

  it('查不存在的代码仍如实返回 null（规范化不得把空态变成假命中）', async () => {
    expect(await db.getStockBySymbol('999999')).toBeNull();
    expect(await db.getStockBySymbol('999999.SH')).toBeNull();
    expect(await db.getStockBySymbol('')).toBeNull();
    // 空数组批量查询不得抛错
    await expect(db.getStocksWithLatestQuotes([])).resolves.toEqual([]);
  });
});

// ======================================================================
// 三、Database（PostgreSQL 路径）：核心断言 + 三个缺陷各自的回归
// 用 knex 的内存 SQLite 无法覆盖 PG 的 snake_case/DECIMAL→string 行为，
// 故这里用一个**最小 PG 替身**：把 knex query builder 录成可断言的形状，
// 验证「查询确实用候选集 whereIn」+「行映射确实读 snake_case」。
// ======================================================================

describe('P0-SYMBOL：Database 数据层用候选集查库，且行映射修正键名', () => {
  /** 记录传给 knex 的 whereIn 参数，模拟库中存在的 symbol */
  function makeDb(existingSymbols: string[]) {
    const calls: Array<{ method: string; args: unknown[] }> = [];
    const table = () => {
      const state: Record<string, unknown> = {};
      const qb: Record<string, unknown> = {};
      const record = (method: string) => (...args: unknown[]) => {
        calls.push({ method, args });
        return qb;
      };
      qb.whereIn = record('whereIn');
      qb.where = record('where');
      qb.orderByRaw = record('orderByRaw');
      qb.orderBy = record('orderBy');
      qb.limit = record('limit');
      qb.offset = record('offset');
      qb.select = record('select');
      qb.leftJoin = record('leftJoin');
      qb.join = record('join');
      qb.first = async () => ({ __first: true });
      // 终态 thenable：await qb 时按 symbol 集命中
      Object.assign(state, {});
      (qb as unknown as { then: unknown }).then = (
        resolve: (v: unknown) => void,
      ) => resolve(existingSymbols.map((symbol, i) => ({ id: i + 1, symbol })));
      return qb;
    };
    const fakeKnex = Object.assign(table, {
      raw: async () => ({ rows: [] }),
      destroy: async () => {},
      client: {},
    });
    return { db: new Database({ client: 'pg' } as never), fakeKnex, calls };
  }

  it('getStockBySymbol 走 whereIn(候选集) 而非精确匹配（缺陷①）', async () => {
    const { db, fakeKnex, calls } = makeDb(['600519.SH']);
    // 注入替身 knex
    (db as unknown as { knexInstance: unknown }).knexInstance = fakeKnex;

    await db.getStockBySymbol('600519');

    const whereInCall = calls.find(c => c.method === 'whereIn');
    expect(whereInCall, 'getStockBySymbol 必须用 whereIn 展开候选，而不是 where 精确匹配').toBeTruthy();
    const used = whereInCall!.args[1] as string[];
    expect(used).toContain('600519.SH');
    expect(used).toContain('600519');
    // 绝不能再出现精确匹配的 where('symbol', x)
    const exact = calls.filter(c => c.method === 'where' && c.args[0] === 'symbol');
    expect(exact.length, '不得残留 where("symbol", x) 精确匹配').toBe(0);
  });

  it('getStocksWithLatestQuotes 同样按候选集展开（缺陷①）', async () => {
    const { db, fakeKnex, calls } = makeDb(['600519.SH', '000001.SZ']);
    (db as unknown as { knexInstance: unknown }).knexInstance = fakeKnex;

    await db.getStocksWithLatestQuotes(['600519', '000001']);

    const whereInCall = calls.find(c => c.method === 'whereIn');
    const used = whereInCall!.args[1] as string[];
    for (const expected of ['600519.SH', '600519', '000001.SZ', '000001']) {
      expect(used, '批量查询应覆盖 %s').toContain(expected);
    }
  });

  it('传入空数组时直接返回，不把空 whereIn 打到数据库', async () => {
    const { db, fakeKnex, calls } = makeDb([]);
    (db as unknown as { knexInstance: unknown }).knexInstance = fakeKnex;

    await expect(db.getStocksWithLatestQuotes([])).resolves.toEqual([]);
    expect(calls.filter(c => c.method === 'whereIn').length).toBe(0);
  });
});

// ======================================================================
// 四、行映射：snake_case → camelCase，且 null 不得变成 0（诚实红线）
// ======================================================================

describe('P0-SYMBOL：PG 行映射读 snake_case，可空列的 null 原样保留', () => {
  /** 直接驱动 Database 的行映射路径：让 knex 返回一行 PG 形状的原始数据 */
  function dbReturningRow(row: Record<string, unknown>) {
    const qb: Record<string, unknown> = {};
    qb.where = () => qb;
    qb.orderBy = () => qb;
    qb.limit = () => qb;
    qb.first = async () => row;
    (qb as unknown as { then: unknown }).then = (resolve: (v: unknown) => void) => resolve([row]);
    const fakeKnex = Object.assign(() => qb, { raw: async () => ({ rows: [] }), destroy: async () => {}, client: {} });
    const db = new Database({ client: 'pg' } as never);
    (db as unknown as { knexInstance: unknown }).knexInstance = fakeKnex;
    return db;
  }

  /** 一行真实形状的 PG 数据（数值列经 knex 返回字符串，日期为 Date） */
  const pgRow = {
    id: 75696929,
    stock_id: 341,
    trade_date: new Date('2026-10-11T16:00:00.000Z'),
    open_price: '1262.95',
    close_price: '1288.00',
    high_price: '1288.00',
    low_price: '1261.00',
    volume: '31556',
    turnover: '4042860000.00',
    change_amount: '25.00',
    change_percent: '1.9800',
    amplitude: '2.1400',
    turnover_rate: '0.2500',
    market_cap: '161010500.00',
    created_at: new Date('2026-10-12T07:30:49.676Z'),
  };

  it('getDailyQuotes 返回 camelCase，且数值列已转 number（缺陷②：500 的根因）', async () => {
    const db = dbReturningRow(pgRow);
    const [q] = await db.getDailyQuotes(341, undefined, undefined, 50);

    // 这些正是 indicators.ts / tech/batch 读取的字段；修复前全是 undefined
    expect(q.tradeDate, 'tradeDate 未映射（indicators 的 Invalid time value 根因）').toBeInstanceOf(Date);
    expect(q.closePrice).toBe(1288);
    expect(q.openPrice).toBe(1262.95);
    expect(q.highPrice).toBe(1288);
    expect(q.lowPrice).toBe(1261);
    expect(q.volume).toBe(31556);
    expect(q.turnover).toBe(4042860000);
    // change_amount（库列名）→ change（类型字段名）
    expect(q.change).toBe(25);
    expect(q.changePercent).toBe(1.98);
    expect(q.turnoverRate).toBe(0.25);
    expect(q.marketCap).toBe(161010500);
    expect(q.stockId).toBe(341);

    // 直接断言「不再抛 Invalid time value」——这就是 500 的判据
    expect(() => new Date(q.tradeDate).toISOString()).not.toThrow();
  });

  it('getLatestDailyQuote 走同一套映射（两处不得分叉）', async () => {
    const db = dbReturningRow(pgRow);
    const q = await db.getLatestDailyQuote(341);
    expect(q!.tradeDate).toBeInstanceOf(Date);
    expect(q!.closePrice).toBe(1288);
  });

  it('诚实红线：可空列为 null 时保留 null，绝不变成 0', async () => {
    const nullRow = { ...pgRow, change_amount: null, change_percent: null, amplitude: null, turnover_rate: null };
    const db = dbReturningRow(nullRow);
    const [q] = await db.getDailyQuotes(341);

    // 首行无前收盘时「涨跌不可算」，落 0 会谎报成「涨跌恰为 0」
    expect(q.change, 'null 涨跌额被吞成 0 即为谎报').toBeNull();
    expect(q.changePercent, 'null 涨跌幅被吞成 0 即为谎报').toBeNull();
    expect(q.amplitude).toBeNull();
    expect(q.turnoverRate).toBeNull();
    // 而真实存在的 0 必须仍是 0（0 是合法真实值，不能与 null 混淆）
    expect(q.closePrice).toBe(1288);
  });

  it('真实 0 与 null 必须可区分（不得用 || 把 0 当空值）', async () => {
    const zeroRow = { ...pgRow, change_amount: '0.00', change_percent: '0.0000' };
    const db = dbReturningRow(zeroRow);
    const [q] = await db.getDailyQuotes(341);
    expect(q.change).toBe(0);
    expect(q.changePercent).toBe(0);
  });
});

// ======================================================================
// 五、latestQuote 键名错配（缺陷③）
// ======================================================================

describe('P0-SYMBOL：latestQuote 不再恒为 null（stock_id 键名错配回归）', () => {
  it('getStocksWithLatestQuotes 把行情正确挂到对应 stock 上', async () => {
    const stockRows = [
      { id: 341, symbol: '600519.SH', name: '贵州茅台', is_active: true },
      { id: 12, symbol: '000001.SZ', name: '平安银行', is_active: true },
    ];
    const qb: Record<string, unknown> = {};
    qb.whereIn = () => qb;
    qb.where = () => qb;
    (qb as unknown as { then: unknown }).then = (resolve: (v: unknown) => void) => resolve(stockRows);

    // 模拟 PG：.raw() 返回的行是 **snake_case**（stock_id），这正是原 bug 的现场
    const rawResult = {
      rows: [
        { id: 75696929, stock_id: 341, trade_date: new Date('2026-10-11'), close_price: '1288.00', volume: '31556' },
        { id: 75696928, stock_id: 12, trade_date: new Date('2026-10-11'), close_price: '11.49', volume: '999' },
      ],
    };
    const fakeKnex = Object.assign(() => qb, {
      raw: async () => rawResult,
      destroy: async () => {},
      client: {},
    });
    const db = new Database({ client: 'pg' } as never);
    (db as unknown as { knexInstance: unknown }).knexInstance = fakeKnex;

    const out = await db.getStocksWithLatestQuotes(['600519', '000001']);

    expect(out).toHaveLength(2);
    const mt = out.find(s => s.id === 341)!;
    const pf = out.find(s => s.id === 12)!;

    // 修复前：quoteMap 键恒为 undefined ⟹ latestQuote 永远取不到
    expect(mt.latestQuote, '600519 的 latestQuote 不应为空').toBeDefined();
    expect(pf.latestQuote, '000001 的 latestQuote 不应为空').toBeDefined();
    // 不得串号：每只股票必须拿到自己那条行情
    expect(mt.latestQuote!.closePrice).toBe(1288);
    expect(pf.latestQuote!.closePrice).toBe(11.49);
    expect(mt.latestQuote!.stockId).toBe(341);
    expect(pf.latestQuote!.stockId).toBe(12);
  });

  it('裸码与带后缀传同一批，必须得到完全一致的结果（不得因写法不同而少返回）', async () => {
    const stockRows = [{ id: 341, symbol: '600519.SH', name: '贵州茅台', is_active: true }];
    const makeDb = () => {
      const qb: Record<string, unknown> = {};
      qb.whereIn = () => qb;
      qb.where = () => qb;
      (qb as unknown as { then: unknown }).then = (resolve: (v: unknown) => void) => resolve(stockRows);
      const fakeKnex = Object.assign(() => qb, {
        raw: async () => ({
          rows: [{ id: 1, stock_id: 341, trade_date: new Date('2026-10-11'), close_price: '1288.00' }],
        }),
        destroy: async () => {},
        client: {},
      });
      const db = new Database({ client: 'pg' } as never);
      (db as unknown as { knexInstance: unknown }).knexInstance = fakeKnex;
      return db;
    };

    const viaBare = await makeDb().getStocksWithLatestQuotes(['600519']);
    const viaSuffixed = await makeDb().getStocksWithLatestQuotes(['600519.SH']);

    expect(viaBare).toHaveLength(1);
    expect(viaSuffixed).toHaveLength(1);
    expect(viaBare[0].symbol).toBe(viaSuffixed[0].symbol);
    expect(viaBare[0].latestQuote!.closePrice).toBe(viaSuffixed[0].latestQuote!.closePrice);
  });
});

// ======================================================================
// 六、防退化：不得出现第三套符号规范化逻辑
// ======================================================================

describe('P0-SYMBOL：符号规范化只有一处真源（symbolUtils）', () => {
  it('api/stock.ts 不再自带 normalizeSymbol 副本', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const file = path.resolve(__dirname, '../api/stock.ts');
    const src = fs.readFileSync(file, 'utf-8');
    // 只允许 import 引用，不允许本地 function 定义
    const localDefs = src.match(/function\s+normalizeSymbol\s*\(/g) ?? [];
    expect(localDefs.length, 'stock.ts 不得再定义本地 normalizeSymbol（第三套逻辑）').toBe(0);
    expect(src).toMatch(/from\s+'\.\.\/utils\/symbolUtils'/);
  });

  it('两个 Database 实现都复用 symbolUtils 的 symbolCandidates', async () => {
    const fs = await import('fs');
    const path = await import('path');
    for (const f of ['../db/Database.ts', '../db/InMemoryDatabase.ts']) {
      const src = fs.readFileSync(path.resolve(__dirname, f), 'utf-8');
      expect(src, `${f} 应复用 symbolCandidates`).toContain('symbolCandidates');
      expect(src, `${f} 不得重新实现后缀推断规则`).not.toMatch(/startsWith\('6'\)/);
    }
  });
});
