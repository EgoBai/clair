/**
 * inMemoryLatestQuoteOrder.test.ts — P0-LATESTQUOTE「取最新行情」的顺序缺陷回归
 *
 * 运行：`cd backend && env -u NODE_OPTIONS ./node_modules/.bin/vitest run src/__tests__/inMemoryLatestQuoteOrder.test.ts`
 *
 * ── 缺陷 ────────────────────────────────────────────────────────────────
 * 「取最新行情」的正确判据是**按 tradeDate 取最大**，而不是「数组最后一条」。
 * 原实现统一写 `quotes[quotes.length - 1]`，等价于假设
 * 「this.quotes 里每个 symbol 的数组，其插入顺序 == 日期升序」——
 * 而这个前提**没有任何地方保证**（createDailyQuote 只做 push，从不排序）。
 *
 * ── 两条已被实测坐实的乱序来源（非理论构造）──────────────────────────────
 * 向量①「写入顺序无保证」：
 *   createDailyQuote(:646) 是裸 `existing.push(newQuote)`，没有任何按日期插入的逻辑。
 *   DataSyncService 有两个写入者，日期跨度完全不同：
 *     - syncRealtimeQuotes(:257) 只写「今天」这一条；
 *     - syncKLineData(:348) 一次写 120 天的历史（fetchTencentKLine(days=120)），
 *       且回补入口 POST /api/history/backfill 与 POST /api/sync/kline/:symbol
 *       可**随时**被调用。
 *   于是「先跑一次实时同步（写入今天），之后再跑一次 K 线回补（写入过去 120 天）」
 *   就会得到 [今天, ...120天历史] 这种**首元素最新、末元素最旧**的数组。
 *   此时 `quotes[quotes.length - 1]` 返回的是**回补区间里最早那一天**的行情，
 *   拿它当「最新价」展示给用户，即P0-SMEARED 之后又一次「拿旧数据冒充最新」的诚实红线。
 *
 * 向量②「读操作自己就会把存储顺序打乱」（更严重，且完全由本文件内部造成）：
 *   getDailyQuotes(:454) 取的是 this.quotes 里**同一个数组引用**（未拷贝），
 *   随后 :463 直接 `quotes.sort(...)` —— 这是 **in-place 排序**，
 *   会把 Map 里的 backing array 真的重排成降序。
 *   于是：即使数据是按「日期升序」正常写入的（所有人都默认的顺序），
 *   只要有**任何一个调用方**读过一次 K 线（个股详情页、走势图，历史接口……），
 *   存储顺序就被反转成降序，此后所有 `quotes[quotes.length - 1]`
 *   都会返回**最早**那条 —— 一个纯读取动作把「最新价」变成了「最旧价」。
 *
 * ── 本文件的断言策略 ────────────────────────────────────────────────────
 * 不去断言「某天是几号」（会随真实数据漂移），而是断言**不变式**：
 *   对任意注入顺序，返回的那条必须是 tradeDate 最大的那条。
 * 同时用 closePrice 当作「这条是哪一天」的指纹，让失败信息自带可读性。
 */

import { describe, it, expect, beforeEach, beforeAll } from 'vitest';
import { InMemoryDatabase } from '../db/InMemoryDatabase';

// 测试环境必须绕开 refuseFabricatedQuotes：它只在 NODE_ENV==='production' 时抛错，
// vitest 默认 NODE_ENV==='test'，故行情读方法正常返回（而不是抛
// FabricatedDataRefusedError）。这里显式钉死该前提，避免将来有人给拒供逻辑
// 扩大到测试环境时，本文件变成「假绿」。
beforeAll(() => {
  expect(
    process.env.NODE_ENV,
    '本文件依赖 NODE_ENV !== "production"（否则行情读方法会抛 FABRICATED_DATA_REFUSED）',
  ).not.toBe('production');
});

const SYMBOL = '600519';
const NEWER = '2026-10-04';
const OLDER = '2026-09-30';
/** 用收盘价当日期指纹：NEWER 故意给一个与 OLDER 明显不同的值 */
const PRICE_OF: Record<string, number> = { [NEWER]: 1404, [OLDER]: 930 };

const ymd = (d: Date): string => d.toISOString().slice(0, 10);

/** 按给定日期顺序注入行情（**故意不保证日期序**，这正是缺陷前提） */
async function seed(db: InMemoryDatabase, stockId: number, dates: string[]): Promise<void> {
  for (const d of dates) {
    await db.createDailyQuote({
      stockId,
      tradeDate: new Date(d),
      openPrice: 1,
      closePrice: PRICE_OF[d],
      highPrice: 1,
      lowPrice: 1,
      volume: 1,
      turnover: 1,
      change: 0,
      changePercent: 0,
      amplitude: 0,
      turnoverRate: 0,
    });
  }
}

/** 取「返回的那条」的无歧义指纹 */
const fp = (q: { tradeDate: Date } | null | undefined): string | null =>
  q == null ? null : `${ymd(q.tradeDate)}@${(q as unknown as { closePrice: number }).closePrice}`;

const NEWER_FP = `${NEWER}@${PRICE_OF[NEWER]}`;
const OLDER_FP = `${OLDER}@${PRICE_OF[OLDER]}`;

/** 三个「取最新」方法统一按此形状断言 */
const LATEST_METHODS = [
  { name: 'getLatestDailyQuote', pick: async (db: InMemoryDatabase, id: number) => db.getLatestDailyQuote(id) },
  { name: 'getStockWithLatestQuote', pick: async (db: InMemoryDatabase) => (await db.getStockWithLatestQuote(SYMBOL))?.latestQuote },
  {
    name: 'getStocksWithLatestQuotes',
    pick: async (db: InMemoryDatabase) => (await db.getStocksWithLatestQuotes([SYMBOL]))[0]?.latestQuote,
  },
] as const;

describe('P0-LATESTQUOTE：取最新行情必须按 tradeDate 取最大，而非「数组最后一条」', () => {
  let db: InMemoryDatabase;
  let stockId: number;

  beforeEach(async () => {
    delete process.env.DATABASE_URL;
    db = new InMemoryDatabase();
    const s = await db.getStockBySymbol(SYMBOL);
    expect(s, `内存库应能从真实清单载入 ${SYMBOL}`).toBeTruthy();
    stockId = s!.id;
  });

  // ── 乱序向量①：新数据先写、历史数据后补 ──────────────────────────────
  // 对应现实：先跑 syncRealtimeQuotes（写今天），再跑 syncKLineData/backfill（写过去 120 天）
  for (const m of LATEST_METHODS) {
    it(`${m.name}：写入顺序为 [新, 旧] 时仍须返回较新的那条`, async () => {
      await seed(db, stockId, [NEWER, OLDER]);
      // 前置：确认注入确实是乱序的（否则本用例是假绿）
      expect(
        db.getQuotes(SYMBOL).map(q => ymd(q.tradeDate)),
        '前置：本用例要求注入顺序为降序（末元素是较旧那条）',
      ).toEqual([NEWER, OLDER]);

      expect(fp(await m.pick(db, stockId)), `${m.name} 返回了错误的那条：末元素是 ${OLDER}，不是最新`).toBe(NEWER_FP);
    });
  }

  it('getStocksWithLatestQuotes：批量多 symbol 各自都取本 symbol 的最新（不得跨 symbol/不得取末位）', async () => {
    const other = await db.getStockBySymbol('000001');
    await seed(db, stockId, [NEWER, OLDER]);
    await seed(db, other!.id, [OLDER, NEWER]); // 故意与上一只相反的顺序
    const rows = await db.getStocksWithLatestQuotes([SYMBOL, '000001']);
    expect(rows.map(r => r.symbol)).toEqual([SYMBOL, '000001']);
    expect(fp(rows[0].latestQuote), '600519 应取到较新的那条').toBe(NEWER_FP);
    expect(fp(rows[1].latestQuote), '000001 应取到较新的那条').toBe(NEWER_FP);
  });

  // ── 乱序向量②：读操作自己把存储顺序打乱 ──────────────────────────────
  // 对应现实：数据本来按日期升序正常写入，只因有人读了一次 K 线就变坏
  it('getDailyQuotes 的 in-place 排序不得污染存储顺序（否则一次读取会让「最新价」变「最旧价」）', async () => {
    await seed(db, stockId, [OLDER, NEWER]); // 正常升序写入
    expect(fp(await db.getLatestDailyQuote(stockId))).toBe(NEWER_FP); //修前此刻是对的

    await db.getDailyQuotes(stockId); // 一个完全普通的读取

    expect(
      db.getQuotes(SYMBOL).map(q => ymd(q.tradeDate)),
      'getDailyQuotes 把 backing array 重排了（in-place sort 污染了存储顺序）',
    ).toEqual([OLDER, NEWER]);
    expect(
      fp(await db.getLatestDailyQuote(stockId)),
      '一次 getDailyQuotes 读取后，「最新行情」退化成最早那条',
    ).toBe(NEWER_FP);
  });

  // ── 不变式：任意注入顺序都取最大（穷举 6 种排列）──────────────────────
  // 只测 [新,旧] 会漏掉「碰巧对了」的情形，故对 2 条数据穷举全排列。
  const perms = [
    [OLDER, NEWER],
    [NEWER, OLDER],
  ];
  for (const [a, b] of perms) {
    it(`不变式：注入顺序 [${a}, ${b}] 下三个方法都返回 ${NEWER}`, async () => {
      await seed(db, stockId, [a, b]);
      for (const m of LATEST_METHODS) {
        expect(fp(await m.pick(db, stockId)), `${m.name} 在注入顺序 [${a}, ${b}] 下取错`).toBe(NEWER_FP);
      }
    });
  }

  it('单条行情：无论何时都返回那唯一一条（回归护栏：别把唯一一条判成无行情）', async () => {
    await seed(db, stockId, [OLDER]);
    expect(fp(await db.getLatestDailyQuote(stockId))).toBe(OLDER_FP);
  });

  // ── 诚实空态不得被本次修复破坏 ────────────────────────────────────────
  it('无行情时仍返回诚实空态（null / 省略 latestQuote 键），不得因排序改动而回退成 0 值对象', async () => {
    expect(await db.getLatestDailyQuote(stockId)).toBeNull();
    const one = await db.getStockWithLatestQuote(SYMBOL);
    expect(one).toBeTruthy();
    expect(
      Object.prototype.hasOwnProperty.call(one!, 'latestQuote'),
      '无行情时必须省略 latestQuote 键（R1 诚实空态）',
    ).toBe(false);
    const many = await db.getStocksWithLatestQuotes([SYMBOL]);
    expect(many).toHaveLength(1);
    expect(Object.prototype.hasOwnProperty.call(many[0], 'latestQuote')).toBe(false);
  });

  it('不存在的 stockId 仍返回 null（排序改动不得把「查无此股」变成 0 值行情）', async () => {
    expect(await db.getLatestDailyQuote(999999)).toBeNull();
  });
});
