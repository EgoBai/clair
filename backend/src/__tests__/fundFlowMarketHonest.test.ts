/**
 * /api/fund-flow/market —— 空值语义（诚实数据红线）回归测试。
 *
 * 缺陷（前端 worker 实测指出）：市场广度组装处用 `Number(x) || 0`，把
 * 「字段缺失」与「summary 整体为 null」都改写成 0 —— 前端只能渲染
 * 「0 家上涨」，用户读到的是「全市场平盘」这一条并不存在的业务事实。
 * 这是本项目点名的「半诚实」红线：源头已把缺失说成 0，前端再诚实也救不回来。
 *
 * 本文件钉住两条方向相反的钉子，缺一不可：
 *   ① 真实 0 仍是 0 —— 真的零涨停 / 零平盘，不能被"修"成 null（那是另一种谎报）；
 *   ② 缺失是 null  —— null / undefined / '' / NaN 一律 null，不能被兜成 0。
 *
 * 另钉 note 文案：market 为 null 时，note 不得再断言「市场广度/成交额来自本地
 * 真实行情」（同一句文案服务两种降级场景导致的措辞-事实冲突）。
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import express from 'express';
import request from 'supertest';

// 东财 push2 真实源在测试中必须隔离（否则 10s 超时）
vi.mock('axios', () => ({
  default: {
    get: vi.fn(async () => { throw new Error('network disabled in test'); }),
    post: vi.fn(async () => { throw new Error('network disabled in test'); }),
  },
}));

const dbMock = {
  getMarketSummary: vi.fn(),
};
vi.mock('../db/dbFactory', () => ({ getDb: vi.fn(() => dbMock) }));

/** 把「最近真实交易日」钉在 2026-10-28（周三·交易日），回退场景一并覆盖 */
const AS_OF = '2026-10-28';
const AS_OF_NOTE = '2026-10-29 虽是交易日，但本地行情库无该日数据，已继续回退至最近有数据的交易日 2026-10-28';
vi.mock('../utils/tradingCalendar', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    resolveMarketQueryDate: vi.fn(async () => ({
      asOf: AS_OF,
      date: new Date(`${AS_OF}T00:00:00Z`),
      isFallback: true,
      dateRequested: null,
      note: AS_OF_NOTE,
    })),
  };
});

import fundFlowRouter from '../api/fund-flow';

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/api', fundFlowRouter);
  return app;
}

async function getMarket() {
  const res = await request(buildApp()).get('/api/fund-flow/market');
  expect(res.status).toBe(200);
  return res.body;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('/api/fund-flow/market · 钉子①：真实 0 仍是 0（不得被改成 null）', () => {
  it('risingStocks=0 / limitUpCount=0 / totalTurnover=0 原样返回 0', async () => {
    dbMock.getMarketSummary.mockResolvedValue({
      date: new Date(`${AS_OF}T00:00:00Z`),
      totalStocks: 5183,
      totalTurnover: 0,          // 真实 0（如全市场休市前零成交的极端口径）
      risingStocks: 0,           // 真实 0：真的一只没涨
      fallingStocks: 4368,
      unchangedStocks: 0,
      limitUpCount: 0,           // 真实 0：真的零涨停
      limitDownCount: 12,
    });

    const body = await getMarket();
    const m = body.data.market;

    // 严格 === 0，不是 null、也不是 '0'
    expect(m.risingStocks).toBe(0);
    expect(m.unchangedStocks).toBe(0);
    expect(m.limitUpCount).toBe(0);
    expect(m.totalTurnover).toBe(0);
    expect(m.risingStocks).not.toBeNull();
    // 同时真实值不被篡改
    expect(m.fallingStocks).toBe(4368);
    expect(m.limitDownCount).toBe(12);
    expect(m.totalStocks).toBe(5183);
  });

  it('字符串形态的真实 0（pg numeric 反序列化）同样保留 0', async () => {
    dbMock.getMarketSummary.mockResolvedValue({
      date: new Date(`${AS_OF}T00:00:00Z`),
      totalStocks: '5183',
      totalTurnover: '0',
      risingStocks: '0',
      fallingStocks: '4368',
      unchangedStocks: '0',
      limitUpCount: '0',
      limitDownCount: '0',
    });

    const m = (await getMarket()).data.market;
    expect(m.risingStocks).toBe(0);
    expect(m.limitUpCount).toBe(0);
    expect(m.limitDownCount).toBe(0);
    expect(m.totalTurnover).toBe(0);
    expect(m.totalStocks).toBe(5183);
    expect(m.fallingStocks).toBe(4368);
  });
});

describe('/api/fund-flow/market · 钉子②：缺失是 null（不得被兜成 0）', () => {
  it('summary 行存在但字段为 null/undefined/空串/NaN → 整行空 → market: null', async () => {
    dbMock.getMarketSummary.mockResolvedValue({
      date: new Date(`${AS_OF}T00:00:00Z`),
      totalStocks: undefined,
      totalTurnover: null,
      risingStocks: null,
      fallingStocks: undefined,
      unchangedStocks: '',
      limitUpCount: Number.NaN,
      limitDownCount: '  ',
    });

    const body = await getMarket();

    // 契约：7 个业务量字段全空 → 整行等价于空，返回 market: null（前端走 unavailable 降级），
    // 既不填 0，也不吐一个 7 字段全 null 的"假数据行"
    expect(body.data.market).toBeNull();
    expect(body.dataSource).toBe('unavailable');
    // 文案不得断言「来自本地真实行情」，但要交代"行在、字段空"
    expect(body.data.note).not.toContain('来自本地真实行情');
    expect(body.data.note).not.toContain('本地真实行情');
    expect(body.data.note).toContain('字段为空');
    // 降级时仍如实透出本次解析到的交易日（前端 asOf 恒给契约）
    expect(body.data.asOf).toBe(AS_OF);
    expect(body.data.asOfIsFallback).toBe(true);
  });

  it('summary 整体为 null → market 为 null（不是全 0 对象）', async () => {
    dbMock.getMarketSummary.mockResolvedValue(null);

    const body = await getMarket();
    expect(body.data.market).toBeNull();
    expect(body.dataSource).toBe('unavailable');
    expect(body.data.source).toBe('unavailable');
    // tiers 不可用时如实为 null，不是 0
    expect(body.data.tiers).toEqual({
      main: null, superLarge: null, large: null, medium: null, small: null,
    });
  });

  it('部分字段缺失时，缺的为 null、有的仍为真实值（不整行降级）', async () => {
    dbMock.getMarketSummary.mockResolvedValue({
      date: new Date(`${AS_OF}T00:00:00Z`),
      totalStocks: 5183,
      totalTurnover: 3.2e12,
      risingStocks: 755,
      fallingStocks: 4368,
      unchangedStocks: null,      // 该列未同步
      limitUpCount: 39,
      limitDownCount: null,       // 该列未同步
    });

    const body = await getMarket();
    const m = body.data.market;
    expect(m.risingStocks).toBe(755);
    expect(m.fallingStocks).toBe(4368);
    expect(m.limitUpCount).toBe(39);
    expect(m.totalTurnover).toBe(3.2e12);
    expect(m.unchangedStocks).toBeNull();
    expect(m.limitDownCount).toBeNull();
    expect(body.dataSource).toBe('partial');
  });
});

describe('/api/fund-flow/market · R3 交易日字段与 note 文案', () => {
  it('asOf / asOfIsFallback / asOfNote 三字段都存在且如实', async () => {
    dbMock.getMarketSummary.mockResolvedValue({
      date: new Date(`${AS_OF}T00:00:00Z`),
      totalStocks: 5183,
      totalTurnover: 3.2e12,
      risingStocks: 755,
      fallingStocks: 4368,
      unchangedStocks: 60,
      limitUpCount: 39,
      limitDownCount: 8,
    });

    const body = await getMarket();
    expect(body.data.asOf).toBe(AS_OF);
    expect(body.data.asOfIsFallback).toBe(true);
    expect(body.data.asOfNote).toBe(AS_OF_NOTE);
    // 交易日解析结果透传给 db 查询（UTC 零点）
    const d = dbMock.getMarketSummary.mock.calls[0][0] as Date;
    expect(d.toISOString()).toBe(`${AS_OF}T00:00:00.000Z`);
  });

  it('asOfIsFallback 是真布尔（前端用 === true 严格判断，绝不接受 "true"）', async () => {
    dbMock.getMarketSummary.mockResolvedValue({
      date: new Date(`${AS_OF}T00:00:00Z`),
      totalStocks: 5183, totalTurnover: 3.2e12, risingStocks: 755, fallingStocks: 4368,
      unchangedStocks: 60, limitUpCount: 39, limitDownCount: 8,
    });
    const ok = await getMarket();
    expect(typeof ok.data.asOfIsFallback).toBe('boolean');
    expect(ok.data.asOfIsFallback).toBe(true);

    // 降级（market: null）时同样是真布尔，不被字符串化
    dbMock.getMarketSummary.mockResolvedValue(null);
    const degraded = await getMarket();
    expect(typeof degraded.data.asOfIsFallback).toBe('boolean');
    expect(degraded.data.asOfIsFallback).toBe(true);
    expect(degraded.data.asOf).toBe(AS_OF);
  });

  it('广度可用 + tiers 不可用：note 说明 tiers 缺失，并如实交代广度来源与口径', async () => {
    dbMock.getMarketSummary.mockResolvedValue({
      date: new Date(`${AS_OF}T00:00:00Z`),
      totalStocks: 5183,
      totalTurnover: 3.2e12,
      risingStocks: 755,
      fallingStocks: 4368,
      unchangedStocks: 60,
      limitUpCount: 39,
      limitDownCount: 8,
    });

    const body = await getMarket();
    const note: string = body.data.note;
    expect(note).toContain('5 档');
    // 广度确实真实 → 允许并应当说明来源与口径（含交易日）
    expect(note).toContain('本地真实行情库');
    expect(note).toContain(AS_OF);
    expect(note).not.toContain('未取到');
  });

  it('广度不可得：note 明说「未取到」，绝不出现「来自本地真实行情」的断言', async () => {
    dbMock.getMarketSummary.mockResolvedValue(null);

    const body = await getMarket();
    const note: string = body.data.note;
    expect(note).toContain('未取到');
    expect(note).toContain(AS_OF);
    expect(note).not.toContain('来自本地真实行情');
    expect(note).not.toContain('本地真实行情');
    // notes.market 同样不得撒谎
    expect(body.notes.market).not.toContain('本地真实行情');
  });
});

describe('/api/fund-flow/market · 源码级回归：不得再把缺失兜成 0', () => {
  it('fund-flow.ts 的市场广度/成交额组装处不得出现 `|| 0` / `?? 0`', async () => {
    const { readFileSync } = await import('fs');
    const { fileURLToPath } = await import('url');
    const { dirname, join } = await import('path');
    const here = dirname(fileURLToPath(import.meta.url));
    const raw = readFileSync(join(here, '../api/fund-flow.ts'), 'utf-8');
    // 去掉注释再扫：本文件注释里会引用被禁的写法本身（`|| 0`）作为反例说明
    const src = raw.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

    // 取 /fund-flow/market 处理器体 + 其后的 fetchMarketTiers（到 /fund-flow/industry 之前）
    const start = src.indexOf("router.get('/fund-flow/market'");
    expect(start).toBeGreaterThan(-1);
    const body = src.slice(start, src.indexOf("router.get('/fund-flow/industry'"));
    expect(body.length).toBeGreaterThan(500);
    expect(body).not.toMatch(/\|\|\s*0\b/);
    expect(body).not.toMatch(/\?\?\s*0\b/);
    // 必须走诚实转换
    expect(body).toContain('honestNumber(');
  });
});
