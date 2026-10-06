/**
 * 大宗交易「前后端契约 + 上游契约」回归测试（P0-C）
 *
 * 背景（实测结论，勿再重新论证）：
 *   1. `返回字段参数不能为空` 并**不是**本仓库任何校验产生的文案，
 *      `rg "返回字段参数不能为空" backend/src` 零命中。它是**上游东财**的
 *      错误码 `code:9501` 的 message，被 service 原样透传到路由层。
 *   2. 真正病因：`blockTradesDataService.ts` 仍在调用**已废弃**的东财端点
 *      `/api/data/get?type=RPTA_WEB_DZH_MUTRADE`。该端点对任何
 *      `columns` 形态（列举字段 / ALL / 完全不带）都返回 9501，
 *      因此表现为「大宗交易永远没数据」。
 *      现网可用端点是 `/api/data/v1/get?reportName=RPT_DATA_BLOCKTRADE`。
 *   3. v1 端点的字段名与旧端点不同：
 *      DEAL_PRICE / DEAL_VOLUME / DEAL_AMT / PREMIUM_RATIO
 *      （旧名 TRADE_PRICE / TRADE_VOLUME / TRADE_AMOUNT / DISCOUNT 已无效）
 *   4. PREMIUM_RATIO 是**无量纲比值**（(成交价-收盘价)/收盘价），
 *      而 BlockTrade.discount 契约是**百分数**，故需 ×100。
 *   5. `overview` 硬编码「今天」；国庆等长假期间今天必然无数据 →
 *      必须回退到真实源中「最近一个有数据的交易日」，并如实上报该日期。
 *
 * 诚实红线（核心断言）：
 *   - 上游 9201「返回数据为空」=源可达但当日无成交 → dataSource:'realtime' + 空数组；
 *   - 上游 9501 / 网络失败 = 源不可用 → dataSource:'unavailable' + 准确 message；
 *   - 两者**绝不可互相冒充**，也绝不允许用0 值/空数组冒充真实成交。
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import request from 'supertest';
import express from 'express';
import blockTradesRouter from '../api/block-trades';
import { queryCache } from '../utils/queryCache';

function setFetch(fn: unknown): void {
  (global as any).fetch = fn;
}

/** 记录调用参数并返回指定响应体，便于断言「打到了哪个端点」 */
function mockFetch(body: unknown, init?: { ok?: boolean; status?: number }) {
  const resp = {
    ok: init?.ok ?? true,
    status: init?.status ?? 200,
    json: () => Promise.resolve(body),
  } as Response;
  return vi.fn().mockResolvedValue(resp);
}

/** v1 端点成功响应（字段名= 现网真实命名） */
function okV1(rows: unknown[]) {
  return { success: true, result: { pages: 1, data: rows, count: rows.length }, code: 0, message: 'ok' };
}

const V1_ROWS = [
  {
    SECURITY_CODE: '600519',
    SECURITY_NAME_ABBR: '贵州茅台',
    TRADE_DATE: '2026-09-30 00:00:00',
    DEAL_PRICE: 1680.5,
    CLOSE_PRICE: 1700.0,
    DEAL_VOLUME: 35000,
    DEAL_AMT: 58817500,
    BUYER_NAME: '中信证券上海分公司',
    SELLER_NAME: '机构专用',
    PREMIUM_RATIO: -0.011470588235,
  },
  {
    SECURITY_CODE: '000858',
    SECURITY_NAME_ABBR: '五粮液',
    TRADE_DATE: '2026-09-30 00:00:00',
    DEAL_PRICE: 145.0,
    CLOSE_PRICE: 142.3,
    DEAL_VOLUME: 120000,
    DEAL_AMT: 17076000,
    BUYER_NAME: '机构专用',
    SELLER_NAME: '华泰证券深圳益田路',
    PREMIUM_RATIO: 0.01897540408,
  },
];

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/api', blockTradesRouter);
  return app;
}

describe('block-trades 上游契约（东财 v1 端点）', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    queryCache.invalidate('block-trades');
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('必须请求 v1 端点 + reportName=RPT_DATA_BLOCKTRADE，而非已废弃的 type= 端点', async () => {
    const fetchMock = mockFetch(okV1(V1_ROWS));
    setFetch(fetchMock);
    const res = await request(buildApp()).get('/api/block-trades?date=2026-09-30');

    expect(res.status).toBe(200);
    const url: string = fetchMock.mock.calls[0][0];
    expect(url).toContain('/api/data/v1/get');
    expect(url).toContain('reportName=RPT_DATA_BLOCKTRADE');
    // 旧端点是本bug 的病因，必须不再出现
    expect(url).not.toContain('/api/data/get?');
    expect(url).not.toContain('RPTA_WEB_DZH_MUTRADE');
  });

  it('映射 v1 字段名：DEAL_PRICE/DEAL_VOLUME/DEAL_AMT → price/volume/amount', async () => {
    setFetch(mockFetch(okV1(V1_ROWS)));
    const res = await request(buildApp()).get('/api/block-trades?date=2026-09-30');

    expect(res.body.data.dataSource).toBe('realtime');
    expect(res.body.data.trades).toHaveLength(2);
    const maotai = res.body.data.trades.find((t: any) => t.symbol === '600519');
    expect(maotai.price).toBe(1680.5);
    expect(maotai.closePrice).toBe(1700.0);
    expect(maotai.volume).toBe(35000);
    expect(maotai.amount).toBe(58817500);
  });

  it('PREMIUM_RATIO（无量纲）换算为百分数 discount，保持既有字段契约', async () => {
    setFetch(mockFetch(okV1(V1_ROWS)));
    const res = await request(buildApp()).get('/api/block-trades?date=2026-09-30');

    const maotai = res.body.data.trades.find((t: any) => t.symbol === '600519');
    const wuliangye = res.body.data.trades.find((t: any) => t.symbol === '000858');
    // -0.011470... → -1.15%
    expect(maotai.discount).toBeCloseTo(-1.15, 2);
    //折价 → 负；溢价 → 正（供premiumCount/discountCount 统计）
    expect(maotai.discount).toBeLessThan(0);
    expect(wuliangye.discount).toBeGreaterThan(0);
    expect(res.body.data.summary.discountCount).toBe(1);
    expect(res.body.data.summary.premiumCount).toBe(1);
  });

  it('discount 必须收敛到 2 位小数，不得把浮点尾数泄漏给前端', async () => {
    // 真实样本：159967 成交价0.72 / 收盘价0.719 → PREMIUM_RATIO=0.0013908205841
    setFetch(mockFetch(okV1([
      {
        SECURITY_CODE: '159967',
        SECURITY_NAME_ABBR: '华夏创成长ETF',
        TRADE_DATE: '2026-09-30 00:00:00',
        DEAL_PRICE: 0.72,
        CLOSE_PRICE: 0.719,
        DEAL_VOLUME: 190821300,
        DEAL_AMT: 137773000,
        BUYER_NAME: '机构专用',
        SELLER_NAME: '机构专用',
        PREMIUM_RATIO: 0.0013908205841446466,
      },
    ])));
    const res = await request(buildApp()).get('/api/block-trades?date=2026-09-30');

    const d = res.body.data.trades[0].discount;
    // ×100 后为 0.13908205...，应收敛到 0.14 而非 0.13908205839999999
    expect(d).toBe(0.14);
    expect(String(d).length).toBeLessThanOrEqual(4);
  });
});

describe('block-trades 参数契约：不带任何参数也必须可用', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    queryCache.invalidate('block-trades');
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('GET /api/block-trades 完全不带 query → 不再返回「返回字段参数不能为空」', async () => {
    setFetch(mockFetch(okV1(V1_ROWS)));
    const res = await request(buildApp()).get('/api/block-trades');

    expect(res.status).toBe(200);
    expect(JSON.stringify(res.body)).not.toContain('返回字段参数不能为空');
  });

  it('GET /api/block-trades 带前端实际 query 形态（page/pageSize/date）可通', async () => {
    setFetch(mockFetch(okV1(V1_ROWS)));
    const res = await request(buildApp()).get('/api/block-trades?page=1&pageSize=20&date=2026-09-30');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.dataSource).toBe('realtime');
    expect(res.body.data.trades).toHaveLength(2);
  });

  it('GET /api/block-trades/overview 可通', async () => {
    setFetch(mockFetch(okV1(V1_ROWS)));
    const res = await request(buildApp()).get('/api/block-trades/overview');

    expect(res.status).toBe(200);
    expect(JSON.stringify(res.body)).not.toContain('返回字段参数不能为空');
    expect(res.body.data.dataSource).toBe('realtime');
    expect(res.body.data.totalTrades).toBe(2);
  });

  it('GET /api/block-trades/:symbol?days=30 可通（同一上游契约问题一并修复）', async () => {
    setFetch(mockFetch(okV1(V1_ROWS)));
    const res = await request(buildApp()).get('/api/block-trades/600519?days=30');

    expect(res.status).toBe(200);
    expect(JSON.stringify(res.body)).not.toContain('返回字段参数不能为空');
    expect(res.body.data.dataSource).toBe('realtime');
    expect(res.body.data.symbol).toBe('600519');
    expect(res.body.data.trades.length).toBeGreaterThanOrEqual(1);
  });
});

describe('block-trades 诚实红线：源可达但无数据 ≠ 源不可用', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    queryCache.invalidate('block-trades');
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('上游 9201「返回数据为空」→ realtime + 空数组（源是可达的）', async () => {
    setFetch(mockFetch({ success: false, result: null, code: 9201, message: '返回数据为空' }));
    const res = await request(buildApp()).get('/api/block-trades?date=2026-10-06');

    expect(res.status).toBe(200);
    expect(res.body.data.dataSource).toBe('realtime');
    expect(res.body.data.trades).toEqual([]);
    // message 必须如实表达「无数据」，不得是「源不可用」
    expect(String(res.body.data.message || '')).not.toMatch(/不可用|参数/);
  });

  it('上游 9501 参数类错误 → unavailable，message 不得是「返回字段参数不能为空」', async () => {
    setFetch(mockFetch({ success: false, result: null, code: 9501, message: '返回字段参数不能为空' }));
    const res = await request(buildApp()).get('/api/block-trades?date=2026-09-30');

    expect(res.body.data.dataSource).toBe('unavailable');
    // 上游原文对用户无意义，必须转成可理解的真实原因
    expect(res.body.data.message).not.toBe('返回字段参数不能为空');
    expect(String(res.body.data.message)).toMatch(/报表|接口|上游|不可用/);
  });

  it('网络不可达 → unavailable + 真实原因，绝不伪造 0 值成交', async () => {
    setFetch(vi.fn().mockRejectedValue(new Error('network down')));
    const res = await request(buildApp()).get('/api/block-trades');

    expect(res.body.data.dataSource).toBe('unavailable');
    expect(res.body.data.trades).toEqual([]);
    // 诚实红线：不得出现任何伪造的营业部 / 成交记录
    expect(JSON.stringify(res.body)).not.toContain('营业部1');
  });

  it('overview 源不可用时诚实降级，绝不返回伪造统计', async () => {
    setFetch(vi.fn().mockRejectedValue(new Error('network down')));
    const res = await request(buildApp()).get('/api/block-trades/overview');

    expect(res.body.data.dataSource).toBe('unavailable');
    expect(res.body.data.totalTrades).toBe(0);
    expect(res.body.data.topBuyers).toEqual([]);
    // 行业分布无法从真实源推导，必须诚实为空
    expect(res.body.data.industryDistribution).toEqual([]);
  });
});

describe('block-trades overview：长假期间必须回退到最近有数据的交易日', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    queryCache.invalidate('block-trades');
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('overview 上报的 date 必须是真实数据的交易日，而非硬编码的今天', async () => {
    setFetch(mockFetch(okV1(V1_ROWS)));
    const res = await request(buildApp()).get('/api/block-trades/overview');

    expect(res.body.data.date).toBe('2026-09-30');
    expect(res.body.data.date).not.toBe(new Date().toISOString().slice(0, 10));
    // 概览数字必须来自这批真实记录
    expect(res.body.data.totalTrades).toBe(2);
    expect(res.body.data.totalAmount).toBe(58817500 + 17076000);
  });

  it('overview 必须给出中文可展示的 dataDateNote，明确数据截至日', async () => {
    setFetch(mockFetch(okV1(V1_ROWS)));
    const res = await request(buildApp()).get('/api/block-trades/overview');

    expect(typeof res.body.data.dataDateNote).toBe('string');
    expect(res.body.data.dataDateNote).toContain('2026-09-30');
    expect(res.body.data.dataDateNote).toContain('数据截至');
  });

  it('列表端点也必须给出 dataDateNote（休市日不得静默显示空数据）', async () => {
    setFetch(mockFetch(okV1(V1_ROWS)));
    const res = await request(buildApp()).get('/api/block-trades');

    expect(res.body.data.date).toBe('2026-09-30');
    expect(res.body.data.dataDateNote).toContain('2026-09-30');
  });
});