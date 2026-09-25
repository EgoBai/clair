/**
 * memoryDbHonestEmpty.test.ts — R0′-9 目标契约（内存库「诚实空态」）
 *
 * R0′-9 已实现落地，本文件即其**回归防线**（恒运行，无 skip 开关）。
 * 运行：`npx vitest run src/__tests__/memoryDbHonestEmpty.test.ts`
 *
 * ── 被测契约（R0′-9：删除内存库伪行情生成，行情一律走「无数据」）──────────────
 * 内存库中只有**股票清单**是真实数据（symbol/name/market/industry/subIndustry，
 * 来自 clair-worker/all_stocks_compact.json）。OHLCV / 估值全部是 Math.random 伪造，
 * 删除生成器后**任何环境**下都不允许再出现伪造数值——尤其不允许用 `0` 顶替
 * （`0` 会被读成「今日涨跌 0%」「今日无涨停」，是比空数组更隐蔽的谎报）。
 *
 * 判定规则（三条，按端点语义分）：
 *   R1「实体清单」语义（成分股 / 股票身份）→ **保留真实字段**，行情字段**省略键**
 *      （team-lead 裁决：`StockWithQuotes.latestQuote?` 本就可选，缺席即「无行情」，
 *       零类型改动、零消费者风险；不设 `null`，更不改 `models/Stock.ts`）。
 *      理由：这类端点我们**确实知道**集合成员，返回 `[]` 等于谎称「该行业/板块无成分股」。
 *   R2「行情表现/排行/聚合」语义 → 真值就是「不可得」，返回 `[]`（集合）或 `null`（对象/标量）。
 *   R3 机器判据：递归遍历任何非空返回体，**凡是行情派生字段名**，其值不得是数字
 *      （必须是 `null` 或不存在）。真实计数（stockCount / quoteCount / stock_count）
 *      允许为 0——那是真话（集合真的为空），不在反伪零范围内。
 *
 * ── 方法清单（rg -n 实测行号，对应 R0′-3 commit f722beadf 的 InMemoryDatabase.ts）──
 *  :408  connection('daily_quotes')   R2  → 生产 throw（R0′-3）；非生产 `[]`
 *  :436  getQuotes                    R2  → `[]`
 *  :447  getMarketSummary             R2  → `null`（api/stock.ts:194 已能接住 null → 404）
 *  :452  getTopGainers                R2  → `[]`
 *  :464  getTopLosers                 R2  → `[]`
 *  :520  getDailyQuotes               R2  → `[]`
 *  :538  getLatestDailyQuote          R2  → `null`
 *  :546  getStockWithLatestQuote      R1  → 保留 stock，**省略** latestQuote 键
 *  :555  getStocksWithLatestQuotes    R1  → 每个 symbol 保留 stock，**省略** latestQuote 键
 *  :608  getIndustryPerformance       R2  → `[]`
 *  :631  getTopTurnover               R2  → `[]`
 *  :729  getDatabaseStats             —   → `{ stockCount: 5541, quoteCount: 0 }`
 *                                            （R0′-3 唯一漏守卫的 this.quotes 读，:732；
 *                                             quoteCount=0 是真实计数，属 R3 例外）
 *  :737  getMarketSummaryInternal     R2  → `null`
 *  :764  getSectorStocks              R1  → 保留成分股，**省略** latestQuote 键，
 *                                             **必须删掉 `.filter(s => s.latestQuote !== undefined)`**
 *                                             （:771，否则删生成器后它会退化成 `[]`，
 *                                              谎称「该板块无成分股」）
 *  :785  getSectorPerformanceEnhanced R2  → `[]`
 *  :827  getSectorMomentumScore       R2  → `[]`
 *  :873  getSubIndustryPerformance    R2  → `[]`
 *  :907  getStocksBySubIndustry       R1  → 保留 symbol/name/l1/l2，5 个行情字段 `null`，
 *                                             排序改为按 symbol（原按 marketCap，全 null 时排序未定义）
 *
 * 另注：R1 的「行情缺席」走**省略 `latestQuote` 键**路线（`StockWithQuotes.latestQuote?`
 * 本就可选），**不改 `models/Stock.ts`**（team-lead 裁决，理由是宽化公共类型在沙箱内不可验证）。
 *      getStocksBySubIndustry 的 5 个行情字段类型是 db 层内联类型，可安全 `| null`。
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { InMemoryDatabase } from '../db/InMemoryDatabase';
import { isFabricatedQuoteRefusalActive, FabricatedDataRefusedError, FABRICATED_DATA_REFUSED_CODE } from '../db/FabricatedDataRefusedError';

// R0′-9 已落地：临时 skip 开关已删除，两半用例恒运行（生产段靠运行时改 NODE_ENV 生效）。
const d = describe;

// ── 前提探针（不构造内存库，恒运行；验证本文件「生产段」所依赖的运行时机制）──
// 本文件生产段靠运行时改 process.env.NODE_ENV 生效。esbuild 会对该赋值报
// assign-to-define 警告，若 Vite/Vitest 真把它静态替换成常量，生产段会变成假绿。
// 故用一条零成本断言把机制本身钉死：失败即说明须改用 vitest 的 env 配置。
describe('R0′-9 前提探针：运行时 NODE_ENV 切换必须真正生效', () => {
  it('process.env.NODE_ENV 不是被静态替换的常量（双向证明）', () => {
    const prev = process.env.NODE_ENV;
    try {
      process.env.NODE_ENV = 'production';
      expect(
        isFabricatedQuoteRefusalActive(),
        '设为 production 后开关未生效 → 该表达式被静态替换成常量，本文件生产段不可信',
      ).toBe(true);
      process.env.NODE_ENV = 'test';
      expect(
        isFabricatedQuoteRefusalActive(),
        '改回 test 后开关仍为 true → 该表达式被静态替换成常量，本文件生产段不可信',
      ).toBe(false);
    } finally {
      if (prev === undefined) delete process.env.NODE_ENV;
      else process.env.NODE_ENV = prev;
    }
  });
});

type NumLeaf = { path: string; key: string; value: number };
/** 递归收集所有数值叶子（数组按下标展开） */
function collectNumericLeaves(node: unknown, path = '$', out: NumLeaf[] = []): NumLeaf[] {
  if (typeof node === 'number') {
    const key = path.split(/[.[]/).filter(Boolean).pop() ?? '?';
    out.push({ path, key, value: node });
    return out;
  }
  if (node === null || typeof node !== 'object') return out;
  if (Array.isArray(node)) {
    node.forEach((v, i) => collectNumericLeaves(v, `${path}[${i}]`, out));
    return out;
  }
  for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
    collectNumericLeaves(v, `${path}.${k}`, out);
  }
  return out;
}

/** 由 Math.random 伪造的行情字段名 —— R3：这些字段的值绝不能是数字（含 0） */
const FABRICATED_FIELDS = [
  'openPrice', 'closePrice', 'highPrice', 'lowPrice', 'volume', 'turnover', 'change',
  'changePercent', 'amplitude', 'turnoverRate', 'peRatio', 'pbRatio',
  'marketCap', 'circulatingMarketCap',
  'avg_change_percent', 'avg_turnover_percent', 'avg_turnover', 'avg_change',
  'total_market_cap', 'total_turnover', 'total_cap', 'limit_up_count',
  'totalMarketCap', 'totalTurnover', 'totalVolume', 'avgPeRatio', 'avgPbRatio',
  'risingStocks', 'fallingStocks', 'unchangedStocks',
  'score', 'changeScore', 'volumeScore', 'breadthScore',
  'price', 'latestClose', 'total_cap_formatted',
];

/** R3 例外：真实计数允许为 0（集合真的为空时说 0 是真话） */
const REAL_COUNT_FIELDS = ['stockCount', 'quoteCount', 'stock_count', 'totalStocks', 'count'];

interface Case {
  method: string;
  run: (db: InMemoryDatabase) => unknown;
  shape: 'empty-array' | 'null' | 'identity-stocks' | 'identity-rows';
  /** identity 类必须保留的真实字段 */
  realFields?: string[];
}

const CASES: Case[] = [
  { method: 'getQuotes', run: (db) => db.getQuotes('600519'), shape: 'empty-array' },
  { method: 'getDailyQuotes', run: (db) => db.getDailyQuotes(1, undefined, undefined, 5), shape: 'empty-array' },
  { method: 'getLatestDailyQuote', run: (db) => db.getLatestDailyQuote(1), shape: 'null' },
  { method: 'getMarketSummary', run: (db) => db.getMarketSummary(new Date()), shape: 'null' },
  { method: 'getMarketSummaryInternal', run: (db) => db.getMarketSummaryInternal(), shape: 'null' },
  { method: 'getTopGainers', run: (db) => db.getTopGainers(3), shape: 'empty-array' },
  { method: 'getTopLosers', run: (db) => db.getTopLosers(3), shape: 'empty-array' },
  { method: 'getTopTurnover', run: (db) => db.getTopTurnover(new Date(), 3), shape: 'empty-array' },
  { method: 'getIndustryPerformance', run: (db) => db.getIndustryPerformance(new Date()), shape: 'empty-array' },
  { method: 'getSectorPerformanceEnhanced', run: (db) => db.getSectorPerformanceEnhanced(), shape: 'empty-array' },
  { method: 'getSectorMomentumScore', run: (db) => db.getSectorMomentumScore(), shape: 'empty-array' },
  { method: 'getSubIndustryPerformance', run: (db) => db.getSubIndustryPerformance(), shape: 'empty-array' },
  {
    method: 'getStockWithLatestQuote',
    run: (db) => db.getStockWithLatestQuote('600519'),
    shape: 'identity-stocks',
    realFields: ['symbol', 'name', 'industry'],
  },
  {
    method: 'getStocksWithLatestQuotes',
    run: (db) => db.getStocksWithLatestQuotes(['600519', '000001']),
    shape: 'identity-stocks',
    realFields: ['symbol', 'name'],
  },
  {
    method: 'getSectorStocks',
    run: (db) => db.getSectorStocks('银行'),
    shape: 'identity-stocks',
    realFields: ['symbol', 'name', 'industry'],
  },
  {
    method: 'getStocksBySubIndustry',
    run: (db) => db.getStocksBySubIndustry('城商行'),
    shape: 'identity-rows',
    realFields: ['symbol', 'name', 'l1', 'l2'],
  },
];

d('内存库诚实空态（R0′-9 目标契约）', () => {
  let db: InMemoryDatabase;

  beforeAll(() => {
    // 非生产：验证「删生成器后，任何环境都不再供伪数据」
    delete process.env.DATABASE_URL;
    db = new InMemoryDatabase();
  });

  // ── 逐方法形状 ────────────────────────────────────────────────
  for (const c of CASES) {
    it(`${c.method} → ${c.shape}`, async () => {
      const v = await c.run(db);

      if (c.shape === 'empty-array') {
        expect(Array.isArray(v), `${c.method} 应返回数组`).toBe(true);
        expect(v, `${c.method} 应为空数组（R2：行情表现不可得）`).toEqual([]);
        return;
      }

      if (c.shape === 'null') {
        expect(v, `${c.method} 应为 null（R2：对象型行情不可得，不得返回零值对象）`).toBeNull();
        return;
      }

      // identity 类：必须保留真实字段
      const rows = Array.isArray(v) ? v : [v];
      expect(rows.length, `${c.method} 返回空集合等于谎称「无成分股/无该实体」`).toBeGreaterThan(0);
      for (const row of rows) {
        expect(row, `${c.method} 行不得为 null`).not.toBeNull();
        for (const f of c.realFields ?? []) {
          expect((row as Record<string, unknown>)[f], `${c.method} 必须保留真实字段 ${f}`).toBeTruthy();
        }
      }

      if (c.shape === 'identity-stocks') {
        for (const row of rows) {
          const r = row as Record<string, unknown>;
          // team-lead 裁决：走「省略键」而非「置 null」——`latestQuote?` 可选，
          // 缺席即「无行情」。故断言**键不存在**（`{...stock, latestQuote: undefined}`
          // 会留下键但值为 undefined，同样不算「省略」，必须一并挡下）。
          expect(
            Object.prototype.hasOwnProperty.call(r, 'latestQuote'),
            `${c.method} 不得携带 latestQuote 键（R1：省略该可选键，而非置 null/undefined）`,
          ).toBe(false);
        }
      }
    });
  }

  // ── R3 机器判据：任何返回体都不得含行情派生的数字 ────────────────
  it('R3 机器判据：所有返回体中，行情派生字段不得是数字（尤其不得是 0）', async () => {
    const violations: string[] = [];

    for (const c of CASES) {
      const v = await c.run(db);
      if (v === null || v === undefined) continue;
      for (const leaf of collectNumericLeaves(v)) {
        if (REAL_COUNT_FIELDS.includes(leaf.key)) continue; // 真实计数允许 0
        if (FABRICATED_FIELDS.includes(leaf.key)) {
          violations.push(`${c.method} ${leaf.path} = ${leaf.value}`);
        }
      }
    }

    expect(
      violations,
      `R3 违规（行情派生字段以数字形式出现，0 属于「假零值」谎报）：\n${violations.join('\n')}`,
    ).toEqual([]);
  });

  // ── getDatabaseStats：唯一漏守卫的 this.quotes 读（:732）────────
  it('getDatabaseStats 返回真实 stockCount，且 quoteCount 为真实计数的 0（R3 例外，需显式断言）', async () => {
    const stats = await db.getDatabaseStats();
    expect(stats.stockCount, '股票清单是真实数据，必须仍被统计').toBeGreaterThan(1000);
    expect(stats.quoteCount, '内存库不再生成任何行情，quoteCount 必须是真实的 0').toBe(0);
  });

  // ── 真实股票清单不受影响（反向验证）─────────────────────────────
  it('真实股票清单仍可用：getStockCount > 1000，且能按代码/名称命中', async () => {
    const total = await db.getStockCount({});
    expect(total).toBeGreaterThan(1000);
    const hit = await db.getStockBySymbol('600519');
    expect(hit?.name).toBe('贵州茅台');
    expect(db.searchStocks('茅台', 3).length).toBeGreaterThan(0);
  });

  // ── R0′-3 不回退：生产环境仍需显式拒供 ──────────────────────────
  it('生产环境仍抛 FABRICATED_DATA_REFUSED（R0′-3 契约不得回退）', async () => {
    const prev = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    try {
      // 注意：错误的人类可读 message 是中文文案，code 'FABRICATED_DATA_REFUSED' 在
      // `.code` 属性上（CI 曾因用 message 正则匹配而误判失败）。改为断言类型 + 机器可读字段。
      let thrown: unknown;
      try {
        db.getTopGainers(3);
      } catch (e) {
        thrown = e;
      }
      expect(thrown).toBeInstanceOf(FabricatedDataRefusedError);
      expect((thrown as FabricatedDataRefusedError).code).toBe(FABRICATED_DATA_REFUSED_CODE);
      await expect(db.getMarketSummary(new Date())).rejects.toMatchObject({
        code: 'FABRICATED_DATA_REFUSED',
        dataSource: 'unavailable',
      });
      // 拒供只针对行情：真实清单在生产下仍必须可用
      await expect(db.getStockCount({})).resolves.toBeGreaterThan(1000);
    } finally {
      if (prev === undefined) delete process.env.NODE_ENV;
      else process.env.NODE_ENV = prev;
    }
  });
});
