/**
 * P0（2026-11-03）：两处契约/口径回归测试
 *
 * ## 缺陷 1：`/api/stocks` 前后端契约断裂
 * 后端只吐 `stocks` + `pagination.totalCount`，而前端 store（useStockStore）与
 * Cloudflare Worker 只认 `items` + `total` ⟹ `/stocks` 整页报
 * 「行情接口响应缺少 data.items 数组（契约不符）」，数据是真的却整页不可用。
 * 修法：后端**双写**（items/total 与 stocks/pagination 并存，谁也不删）。
 * 本测试守住三件事：数量一致、总量一致、旧字段没被顺手删掉。
 *
 * ## 缺陷 2：市值单位差 10000 倍
 * `daily_quotes.market_cap` 落库是**万元**，此前被当**元**返回，
 * 浦发银行 3360.56 亿被前端渲染成「3360.56万」。
 * 本测试用**固定假数据**（不连真库）守住换算方向与 ×10000 系数：
 * 固定 33605600 万元 → 必须恰好 3.36056e11 元。系数写错（如 ×1000/×100）立刻红。
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';
import express from 'express';

// ==================== 固定假数据（不连真库） ====================

const FAKE_STOCKS = [
  {
    id: 1, symbol: '600000.SH', name: '浦发银行', market: 'SH', industry: '银行', is_active: true,
    // stocks 表原样 snake_case 行情列（knex 返回 numeric 为字符串）
    current_price: '10.09', change_percent: '-0.4900', turnover_rate: '0.4100',
    pe_ratio: 5.2, volume: '648865', turnover: '647740000.00',
  },
  {
    id: 2, symbol: '601398.SH', name: '工商银行', market: 'SH', industry: '银行', is_active: true,
    current_price: '8.59', change_percent: '0.1200', turnover_rate: '0.2000',
    pe_ratio: 6.1, volume: '1200000', turnover: '1030800000.00',
  },
  { id: 3, symbol: '600519.SH', name: '贵州茅台', market: 'SH', industry: '白酒', is_active: true },
];
const FAKE_TOTAL = 5546;

/** 浦发银行真实市值 3360.56 亿元；库内以万元存 ⟹ 33,605,600 */
const PUFA_MARKET_CAP_WAN = 33_605_600;
/** 工商银行 306,153,000 万元 = 3.06153 万亿元 */
const ICBC_MARKET_CAP_WAN = 306_153_000;

const dbMock = vi.hoisted(() => ({
  getStocks: vi.fn(),
  getStockCount: vi.fn(),
  getStockBySymbol: vi.fn(),
  getLatestDailyQuote: vi.fn(),
}));

vi.mock('../db/dbFactory', () => ({
  db: dbMock,
  getDb: vi.fn(() => dbMock),
  initDatabase: vi.fn(async () => dbMock),
}));

// mock 声明后再 import 被测模块（vi.mock 会被提升，这里保持顺序语义清晰）
import stockRouter from '../api/stock';
import { Database } from '../db/Database';
import { queryCache } from '../utils/queryCache';

function buildApp(): express.Express {
  const app = express();
  app.use(express.json());
  app.use('/api', stockRouter);
  return app;
}

const app = buildApp();

/** 基准行情行：marketCap 刻意给**库内万元**口径 */
function baseQuote(stockId: number) {
  return {
    id: 100 + stockId,
    stockId,
    tradeDate: '2026-11-03',
    openPrice: 10.0,
    closePrice: 10.09,
    highPrice: 10.2,
    lowPrice: 9.9,
    volume: 1_000_000,
    turnover: 1.0e9,
    change: -0.05,
    changePercent: -0.49,
    marketCap: stockId === 1 ? PUFA_MARKET_CAP_WAN : ICBC_MARKET_CAP_WAN,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  queryCache.invalidate();
  dbMock.getStocks.mockResolvedValue(FAKE_STOCKS as never);
  dbMock.getStockCount.mockResolvedValue(FAKE_TOTAL as never);
  dbMock.getStockBySymbol.mockImplementation((async (symbol: string) =>
    FAKE_STOCKS.find((s) => s.symbol === symbol || s.symbol === `${symbol}.SH`) ?? null) as never);
  dbMock.getLatestDailyQuote.mockImplementation((async (stockId: number) =>
    baseQuote(stockId)) as never);
});

// ==================== 缺陷 1：items / total 双写 ====================

describe('GET /api/stocks · 契约双写（items/total 与 stocks/pagination 并存）', () => {
  it('items 与 stocks 条数一致，且都不为空', async () => {
    const res = await request(app).get('/api/stocks?pageSize=3');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data.items)).toBe(true);
    expect(res.body.data.items).toHaveLength(FAKE_STOCKS.length);
    expect(res.body.data.stocks).toHaveLength(FAKE_STOCKS.length);
  });

  it('total 与 pagination.totalCount 是同一个真实总数', async () => {
    const res = await request(app).get('/api/stocks?pageSize=3');

    expect(res.body.data.total).toBe(FAKE_TOTAL);
    expect(res.body.data.pagination.totalCount).toBe(FAKE_TOTAL);
    expect(res.body.data.total).toBe(res.body.data.pagination.totalCount);
  });

  it('items 与 stocks 覆盖同一批标的（同一真源，不同形态）', async () => {
    const res = await request(app).get('/api/stocks?pageSize=3');

    expect(res.body.data.items.map((s: { symbol: string }) => s.symbol))
      .toEqual(res.body.data.stocks.map((s: { symbol: string }) => s.symbol));
    expect(res.body.data.items.map((s: { symbol: string }) => s.symbol))
      .toEqual(['600000.SH', '601398.SH', '600519.SH']);
  });

  it('items[] 按 Worker 契约给出 latestQuote（否则整表价格渲染成「—」）', async () => {
    const res = await request(app).get('/api/stocks?pageSize=3');
    const pufa = res.body.data.items.find((s: { symbol: string }) => s.symbol === '600000.SH');

    // 数值必须是 number（前端 numOrNull 只认 number），且来自真实列
    expect(pufa.latestQuote).toEqual({
      closePrice: 10.09,
      changePercent: -0.49,
      turnoverRate: 0.41,
      peRatio: 5.2,
      volume: 648865,
      turnover: 647740000,
    });
    // 六个行情字段全缺失 → latestQuote 整体 null（与 Worker 同语义，不回填 0）
    const maotai = res.body.data.items.find((s: { symbol: string }) => s.symbol === '600519.SH');
    expect(maotai.latestQuote).toBeNull();
  });

  it('旧字段未被删除（前端/其他调用方的兼容底线）', async () => {
    const res = await request(app).get('/api/stocks?pageSize=3');

    expect(res.body.data).toHaveProperty('stocks');
    expect(res.body.data).toHaveProperty('pagination');
    expect(res.body.data.pagination).toHaveProperty('totalCount');
    expect(res.body.data.pagination).toHaveProperty('totalPages');
  });
});

// ==================== 缺陷 2：市值 万元 → 元 ====================

describe('GET /api/stocks/:symbol · marketCap 必须换算到「元」', () => {
  it('浦发银行 33,605,600 万元 → 3.36056e11 元（3360.56 亿）', async () => {
    const res = await request(app).get('/api/stocks/600000');

    expect(res.status).toBe(200);
    const cap = res.body.data.latestQuote.marketCap;
    expect(cap).toBe(PUFA_MARKET_CAP_WAN * 10000);
    expect(cap).toBe(336_056_000_000);
    // 反向验证：绝不能再是万元原值（否则前端会渲染成「3360.56万」）
    expect(cap).not.toBe(PUFA_MARKET_CAP_WAN);
  });

  it('响应显式声明 marketCapUnit=yuan', async () => {
    const res = await request(app).get('/api/stocks/600000');

    expect(res.body.data.marketCapUnit).toBe('yuan');
    // 顶层与 data 内必须一致（历史 IP-20 教训：两级字段互相矛盾）
    expect(res.body.dataSource).toBe(res.body.data.dataSource);
  });

  it('档案层 market_cap 与 latestQuote.marketCap 同口径（不出现一级万元一级元）', async () => {
    // getStockBySymbol 返回的档案行在假数据里没有 market_cap 字段，
    // 此处单独注入一份万元值验证换算分支不会漏掉 snake_case 键。
    dbMock.getStockBySymbol.mockResolvedValueOnce({
      ...FAKE_STOCKS[0],
      id: 1,
      market_cap: PUFA_MARKET_CAP_WAN,
    } as never);

    const res = await request(app).get('/api/stocks/600000');

    expect(res.body.data.market_cap).toBe(PUFA_MARKET_CAP_WAN * 10000);
    expect(res.body.data.latestQuote.marketCap).toBe(PUFA_MARKET_CAP_WAN * 10000);
  });

  it('市值缺失时保持 null，不用 0 顶替（诚实红线）', async () => {
    dbMock.getLatestDailyQuote.mockResolvedValueOnce({
      id: 999, stockId: 1, tradeDate: '2026-11-03', closePrice: 10.09, marketCap: null,
    } as never);

    const res = await request(app).get('/api/stocks/600000');

    expect(res.status).toBe(200);
    expect(res.body.data.latestQuote.marketCap).toBeNull();
    expect(res.body.data.latestQuote.marketCap).not.toBe(0);
  });
});

// ==================== 聚合口径：全市场总市值 ×10000 ====================

describe('Database.getMarketSummary · 总市值聚合后乘 10000', () => {
  /** 用 Object.create 绕开构造函数（避免真建 PG 连接池），只塞假 knex */
  function makeDb(quoteRows: Array<Record<string, unknown>>, industryRows: Array<Record<string, unknown>> = []) {
    const dbInstance = Object.create(Database.prototype);

    const builder: Record<string, unknown> = {};
    builder.where = () => builder;
    builder.join = () => builder;
    builder.select = async () => quoteRows;

    const knexLike: Record<string, unknown> = (table: string) => {
      if (table !== 'daily_quotes') throw new Error(`unexpected table: ${table}`);
      return builder;
    };
    knexLike.raw = async () => ({ rows: industryRows });

    (dbInstance as unknown as { knexInstance: unknown }).knexInstance = knexLike;
    return dbInstance as InstanceType<typeof Database>;
  }

  const quote = (over: Record<string, unknown>) => ({
    symbol: '600000.SH',
    close_price: '10.09',
    change_amount: '-0.05',
    change_percent: '-0.49',
    volume: '1000000',
    turnover: '1000000000',
    market_cap: '0',
    ...over,
  });

  it('两只股票合计 (33605600 + 306153000) 万元 → ×10000 后为元', async () => {
    const dbInstance = makeDb([
      quote({ symbol: '600000.SH', market_cap: String(PUFA_MARKET_CAP_WAN) }),
      quote({ symbol: '601398.SH', market_cap: String(ICBC_MARKET_CAP_WAN) }),
    ]);

    const summary = await dbInstance.getMarketSummary(new Date('2026-11-03'));

    expect(summary.totalMarketCap).toBe((PUFA_MARKET_CAP_WAN + ICBC_MARKET_CAP_WAN) * 10000);
    expect(summary.marketCapUnit).toBe('yuan');
  });

  it('方向断言：不是原值、也不是 ÷10000（防止换算方向抄反）', async () => {
    const dbInstance = makeDb([quote({ market_cap: String(PUFA_MARKET_CAP_WAN) })]);

    const summary = await dbInstance.getMarketSummary(new Date('2026-11-03'));

    expect(summary.totalMarketCap).not.toBe(PUFA_MARKET_CAP_WAN);
    expect(summary.totalMarketCap).not.toBe(PUFA_MARKET_CAP_WAN / 10000);
    expect(summary.totalMarketCap).toBeGreaterThan(PUFA_MARKET_CAP_WAN * 9999);
  });

  it('指数行被剔除，不参与总市值聚合（否则同一市场算两遍）', async () => {
    const dbInstance = makeDb([
      quote({ symbol: '600000.SH', market_cap: String(PUFA_MARKET_CAP_WAN) }),
      // 上证指数的「市值」实为成份股合计，混入即重复计入
      quote({ symbol: '000001.SH', market_cap: '6306011700' }),
    ]);

    const summary = await dbInstance.getMarketSummary(new Date('2026-11-03'));

    expect(summary.totalStocks).toBe(1);
    expect(summary.excludedIndexRows).toBe(1);
    expect(summary.totalMarketCap).toBe(PUFA_MARKET_CAP_WAN * 10000);
  });

  it('行业聚合的 total_market_cap 同口径（SQL 内 SUM×10000）', async () => {
    // 行业行由假 knex.raw 直接给出，这里只校验返回值被原样透传，
    // SQL 文案的 ×10000 由下一个断言保证（防止有人把 * 10000 从 SQL 里删掉）。
    const dbInstance = makeDb(
      [quote({ symbol: '600000.SH', market_cap: String(PUFA_MARKET_CAP_WAN) })],
      [{ industry: '银行', stock_count: 1, avg_change_percent: '-0.49', total_market_cap: String(PUFA_MARKET_CAP_WAN * 10000) }],
    );

    const summary = await dbInstance.getMarketSummary(new Date('2026-11-03'));

    expect(summary.industryPerformance).toHaveLength(1);
    expect(Number(summary.industryPerformance[0].total_market_cap))
      .toBe(PUFA_MARKET_CAP_WAN * 10000);
  });

  it('行业 SQL 里确实带 SUM(...)*10000（源码级守卫，防回退）', async () => {
    const fs = await import('node:fs/promises');
    const src = await fs.readFile(new URL('../db/Database.ts', import.meta.url), 'utf8');
    const sqlBlock = src.slice(src.indexOf('SUM(daily_quotes.market_cap)'));
    expect(sqlBlock.slice(0, 80)).toMatch(/SUM\(daily_quotes\.market_cap\)\s*\*\s*\$\{WAN_TO_YUAN\}/);
  });
});
