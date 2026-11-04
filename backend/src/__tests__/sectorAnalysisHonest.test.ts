/**
 * 规则 C 永久回归：/api/sectors/analysis 与 /api/sectors/analysis/:code 的诚实三态。
 *
 * 锁定的契约（可空列缺数 → null + dataSource 三态，绝不写 0）：
 *   1. 可空列全部有真实值 → dataSource 'real'、missing 为空、字段为真实数值；
 *   2. 可空列为 NULL → dataSource 'partial'、missing 点名、字段为 null 且 **!== 0**
 *      （0 会被前端读成「真实为零」）；
 *   3. total_market_cap 为 NULL → 详情 topStocks[].weight 为 null（不拿 0 当分母），
 *      并在 missing 中列出 'topStocks[].weight'；
 *   4. 无任何行业聚合行 → 'unavailable'（不返回空数组冒充 real）。
 *
 * 挂载点与生产一致：app.use('/api', router)（backend/src/app.ts:238）。
 * 路由定义见 backend/src/api/sector-analysis.ts:272（列表）/:349（详情）。
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import express from 'express';
import request from 'supertest';

// 行业资金流走东财 push2 真实源（测试环境不可达）：stub 成直接失败，
// 让它走「源不可达 → fundFlow null」的诚实降级，而不是真发网络请求挂 8s。
vi.stubGlobal('fetch', vi.fn(async () => {
  throw new Error('network disabled in test');
}));

const dbMock = {
  getSectorPerformanceEnhanced: vi.fn(),
  getSectorStocks: vi.fn(),
  connection: vi.fn(),
};
vi.mock('../db/dbFactory', () => ({ getDb: vi.fn(() => dbMock) }));

import sectorAnalysisRouter from '../api/sector-analysis';

/**
 * knex 桩：生产代码里 db.connection 本身就是 **knex 实例**（可调用，且带 .raw），
 * 所以这里返回一个「可调用 + .raw」的函数；每次调用取走队列里的下一组行，
 * builder 被 await 时直接 resolve。
 * 一次列表请求查 1 次库（loadIndustryValuation）；详情请求查 2 次
 * （loadIndustryValuation → loadMemberValuation），故队列顺序即调用顺序。
 */
function makeKnexStub(rowQueue: any[][]) {
  const knex: any = () => {
    const rows = rowQueue.length > 0 ? rowQueue.shift() : [];
    const builder: any = {
      join: () => builder,
      where: () => builder,
      whereNotNull: () => builder,
      whereRaw: () => builder,
      select: () => builder,
      groupBy: () => builder,
      then: (resolve: (v: any) => any) => resolve(rows),
    };
    return builder;
  };
  knex.raw = () => ({ __raw: true });
  return knex;
}

function installKnex(rowQueue: any[][]) {
  const stub = makeKnexStub(rowQueue);
  (dbMock as any).connection = stub;
  return stub;
}

/** 真实口径的成分股：成员顶层无 changePercent/turnoverRate/marketCap，全靠 latestQuote */
function member(symbol: string, changePercent: number | null, turnoverRate: number | null, marketCap: number | null) {
  return {
    symbol,
    name: symbol + '股份',
    industry: '半导体',
    latestQuote: { changePercent, turnoverRate, marketCap, closePrice: 10.5 },
  };
}

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/api', sectorAnalysisRouter);
  return app;
}

beforeEach(() => {
  vi.clearAllMocks();
  dbMock.getSectorStocks.mockImplementation(async () => []);
});

describe('GET /api/sectors/analysis（列表）· 规则 C 三态', () => {
  it('可空列全部有真实值 → dataSource real、missing 为空、数值即真实值', async () => {
    dbMock.getSectorPerformanceEnhanced.mockResolvedValue([
      { industry: '半导体', avg_change_percent: 1.5, total_market_cap: 999999, limit_up_count: 3 },
      { industry: '银行', avg_change_percent: -0.2, total_market_cap: 888888, limit_up_count: 0 },
    ]);
    dbMock.getSectorStocks.mockImplementation(async (industry: string) =>
      industry === '半导体'
        ? [member('600001', 2.0, 3.5, 3.0e11), member('600002', 1.0, 2.5, 2.0e11)]
        : [member('600003', -0.2, 1.2, 1.0e11)],
    );
    installKnex([[
      { industry: '半导体', stock_count: 120, avg_pe: 35.5, avg_pb: 4.25, valid_pe_count: 110, loss_or_no_pe_count: 10 },
      { industry: '银行', stock_count: 40, avg_pe: 5.1, avg_pb: 0.62, valid_pe_count: 40, loss_or_no_pe_count: 0 },
    ]]);

    const res = await request(buildApp()).get('/api/sectors/analysis');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.dataSource).toBe('real');
    expect(res.body.data.dataSource).toBe('real');
    expect(res.body.data.missing).toEqual([]);
    expect(res.body.data.count).toBe(2);

    const semi = res.body.data.sectors[0];
    expect(semi.name).toBe('半导体');
    expect(semi.avgPE).toBe(35.5);
    expect(semi.validPeCount).toBe(110);
    expect(semi.lossOrNoPeCount).toBe(10);
    expect(semi.limitUpCount).toBe(3);
    // 涨跌幅/换手/市值来自成分股最新行情（不是行级兜底值 1.5）
    expect(semi.changePercent).toBe(1.5);
    expect(semi.turnover).toBe(3);
    // 总市值 = 成分股真实市值之和（3e11 + 2e11），而不是 enhanced 行里的 999999
    expect(semi.totalMarketCap).toBe(5.0e11);
    expect(semi.stockCount).toBe(120);
  });

  it('可空列为 NULL → dataSource partial、missing 点名、字段为 null 且 !== 0', async () => {
    dbMock.getSectorPerformanceEnhanced.mockResolvedValue([
      { industry: '半导体', avg_change_percent: null, total_market_cap: null, limit_up_count: null },
    ]);
    // 成员行情里的可空列也全缺（changePercent/turnoverRate/marketCap）
    dbMock.getSectorStocks.mockImplementation(async () => [member('600001', null, null, null)]);
    installKnex([[
      { industry: '半导体', stock_count: null, avg_pe: null, avg_pb: null, valid_pe_count: null, loss_or_no_pe_count: null },
    ]]);

    const res = await request(buildApp()).get('/api/sectors/analysis');
    expect(res.status).toBe(200);
    expect(res.body.dataSource).toBe('partial');
    expect(res.body.data.dataSource).toBe('partial');
    expect(res.body.data.missing).toEqual(expect.arrayContaining([
      'sectors[0].validPeCount',
      'sectors[0].lossOrNoPeCount',
      'sectors[0].limitUpCount',
    ]));

    const semi = res.body.data.sectors[0];
    expect(semi.validPeCount).toBeNull();
    expect(semi.validPeCount).not.toBe(0);
    expect(semi.lossOrNoPeCount).toBeNull();
    expect(semi.limitUpCount).toBeNull();
    expect(semi.limitUpCount).not.toBe(0);
    expect(semi.avgPE).toBeNull();
    expect(semi.avgPE).not.toBe(0);
    // 涨跌幅/换手/总市值全缺 → null（绝不 0 顶替）
    expect(semi.changePercent).toBeNull();
    expect(semi.changePercent).not.toBe(0);
    expect(semi.turnover).toBeNull();
    expect(semi.turnover).not.toBe(0);
    expect(semi.totalMarketCap).toBeNull();
    expect(semi.totalMarketCap).not.toBe(0);
    // 全缺时板块均值也不得伪造成 0
    expect(res.body.data.summary.avgChange).toBeNull();
  });

  it('库内无行业聚合行 → dataSource unavailable（不返回假数据）', async () => {
    dbMock.getSectorPerformanceEnhanced.mockResolvedValue([]);
    installKnex([[]]);

    const res = await request(buildApp()).get('/api/sectors/analysis');
    expect(res.status).toBe(200);
    expect(res.body.dataSource).toBe('unavailable');
    expect(res.body.data.sectors).toEqual([]);
    expect(res.body.data.count).toBe(0);
  });
});

describe('GET /api/sectors/analysis/:code（详情）· 规则 C 三态', () => {
  it('可空列全部有真实值 → dataSource real、missing 为空、weight 按真实总市值占比', async () => {
    dbMock.getSectorPerformanceEnhanced.mockResolvedValue([
      { industry: '半导体', avg_change_percent: 1.5, total_market_cap: 999999, limit_up_count: 3 },
    ]);
    dbMock.getSectorStocks.mockImplementation(async () => [
      member('600001', 2.0, 3.5, 3.0e11),
      member('600002', 1.0, 2.5, 2.0e11),
    ]);
    installKnex([
      // 1) loadIndustryValuation
      [{ industry: '半导体', stock_count: 120, avg_pe: 35.5, avg_pb: 4.25, valid_pe_count: 110, loss_or_no_pe_count: 10 }],
      // 2) loadMemberValuation
      [
        { symbol: '600001', pe_ratio: 12.5, pb_ratio: 1.1 },
        { symbol: '600002', pe_ratio: 22.5, pb_ratio: 2.2 },
      ],
    ]);

    const res = await request(buildApp()).get('/api/sectors/analysis/半导体');
    expect(res.status).toBe(200);
    expect(res.body.dataSource).toBe('real');
    expect(res.body.data.dataSource).toBe('real');
    expect(res.body.data.missing).toEqual([]);
    expect(res.body.data.name).toBe('半导体');
    expect(res.body.data.totalMarketCap).toBe(5.0e11);

    const top = res.body.data.topStocks;
    expect(top.length).toBe(2);
    // 权重 = 市值 / 真实总市值 * 100（round 4 位）
    expect(top[0].weight).toBe(60);
    expect(top[1].weight).toBe(40);
    expect(top[0].pe).toBe(12.5);
    expect(top[1].pb).toBe(2.2);
    expect(top[0].changePercent).toBe(2);
  });

  it('total_market_cap 为 NULL → topStocks[].weight 为 null、missing 点名、dataSource partial', async () => {
    dbMock.getSectorPerformanceEnhanced.mockResolvedValue([
      { industry: '半导体', avg_change_percent: 1.5, total_market_cap: null, limit_up_count: 3 },
    ]);
    // 成员也无 marketCap → 无法求和，totalMarketCap 保持 null
    dbMock.getSectorStocks.mockImplementation(async () => [member('600001', 2.0, 3.5, null)]);
    installKnex([
      [{ industry: '半导体', stock_count: 120, avg_pe: 35.5, avg_pb: 4.25, valid_pe_count: 110, loss_or_no_pe_count: 10 }],
      [{ symbol: '600001', pe_ratio: 12.5, pb_ratio: 1.1 }],
    ]);

    const res = await request(buildApp()).get('/api/sectors/analysis/半导体');
    expect(res.status).toBe(200);
    expect(res.body.dataSource).toBe('partial');
    expect(res.body.data.dataSource).toBe('partial');
    expect(res.body.data.missing).toContain('topStocks[].weight');
    expect(res.body.data.totalMarketCap).toBeNull();
    expect(res.body.data.totalMarketCap).not.toBe(0);

    // 有真实成分股 → 不是 unavailable；但权重必须 null，不能拿 0 当分母算出 0%
    expect(res.body.data.topStocks.length).toBe(1);
    expect(res.body.data.topStocks[0].weight).toBeNull();
    expect(res.body.data.topStocks[0].weight).not.toBe(0);
    // 其余真实字段不受影响
    expect(res.body.data.topStocks[0].pe).toBe(12.5);
    expect(res.body.data.topStocks[0].changePercent).toBe(2);
  });

  it('行业不存在 → 404 且列出可用行业名（不返回编造详情）', async () => {
    dbMock.getSectorPerformanceEnhanced.mockResolvedValue([
      { industry: '半导体', avg_change_percent: 1.5, total_market_cap: 5e11, limit_up_count: 3 },
    ]);
    dbMock.getSectorStocks.mockImplementation(async () => [member('600001', 2.0, 3.5, 3e11)]);
    installKnex([
      [{ industry: '半导体', stock_count: 120, avg_pe: 35.5, avg_pb: 4.25, valid_pe_count: 110, loss_or_no_pe_count: 10 }],
    ]);

    const res = await request(buildApp()).get('/api/sectors/analysis/不存在的行业');
    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
    expect(res.body.available).toContain('半导体');
  });
});
