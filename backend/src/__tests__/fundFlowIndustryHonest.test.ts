/**
 * /api/fund-flow/industry —— 行业资金流的空值语义与数据源契约（诚实数据红线）。
 *
 * 修复前的三个缺陷（线上实测 2026-11-01）：
 *   ① `mainNet: item.f184 || 0` / `netInflow: item.f62 || 0` / `stockCount: item.f22 || 0`
 *      → 「上游没给该行业资金流」被改写成「净流入 0 元」；
 *   ② `mainNet` 取的是 f184（主力净**占比** %），而 f184 与 f62（主力净**额** 元）口径不同，
 *      前端把百分比当金额渲染 → 数字凭空缩小 1 亿倍；
 *   ③ 响应只有 `data.source`，没有顶层 `dataSource`；空列表没有任何 dataSource/note。
 *
 * 本文件钉住：
 *   · 缺失 → null，真实 0 → 0（两个方向都钉，只钉一面是另一种谎报）；
 *   · `netInflow`（全单净额）两个真实源都不可得 → 恒 null，绝不拿主力净额冒充；
 *   · 顶层与 data 内 dataSource 同源；空列表必带中文 note。
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import express from 'express';
import request from 'supertest';

// 东财 push2 在测试里必须隔离（真实请求会 10s 超时）；本文件专门验证"东财不可达"后的行为
vi.mock('axios', () => ({
  default: {
    get: vi.fn(async () => { throw new Error('network disabled in test'); }),
    post: vi.fn(async () => { throw new Error('network disabled in test'); }),
  },
}));

const dbMock = {
  getMarketSummary: vi.fn(),
  getStockBySymbol: vi.fn(),
};
// 注意：工厂函数体内只能**延迟**引用 dbMock（vi.mock 会被提升到文件顶部），
// 直接在工厂里读 dbMock 会触发 "Cannot access before initialization"。
vi.mock('../db/dbFactory', () => ({ db: {}, getDb: vi.fn(() => dbMock) }));

vi.mock('../utils/tradingCalendar', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    resolveMarketQueryDate: vi.fn(async () => ({
      asOf: '2026-10-28',
      date: new Date('2026-10-28T00:00:00Z'),
      isFallback: true,
      dateRequested: null,
      note: null,
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

async function getIndustry(query = '') {
  return request(buildApp()).get(`/api/fund-flow/industry${query}`);
}

/** 腾讯板块排行的受控回包（单位万元；第三条缺 zljlr 表示上游没给） */
const TENCENT_RANK_BODY = JSON.stringify({
  code: 0,
  msg: 'ok',
  data: {
    rank_list: [
      { name: '电子', code: 'pt01801080', stock_type: 'BK-HY-1', zljlr: '-1115657.21', zgb: '35/497' },
      { name: '食品饮料', code: 'pt01801120', stock_type: 'BK-HY-1', zljlr: '289753.05', zgb: '71/122' },
      { name: '上游缺失行业', code: 'pt01801999', stock_type: 'BK-HY-1', zgb: '0/8' },
      { name: '真零行业', code: 'pt01801888', stock_type: 'BK-HY-1', zljlr: '0', zgb: '0/5' },
    ],
  },
});

const realFetch = globalThis.fetch;
/** 腾讯板块行情快照（GBK 原文形态；字段含 14 位快照时间戳 → 2026-10-30） */
const TENCENT_BOARD_QUOTE = 'v_pt01801080="2~X~01801080~14341.39~13945.21~~20261030150004~396.18~2.84";';
let fetchStub: ((url: string) => Response) | null = null;
let requestedUrls: string[] = [];

/** 默认桩：腾讯排行 + 腾讯板块快照都可用；`boardQuote` 传 null 表示快照不可得 */
function stubTencent({ boardQuote = TENCENT_BOARD_QUOTE as string | null } = {}) {
  fetchStub = (url) => {
    if (url.includes('proxy.finance.qq.com')) return new Response(TENCENT_RANK_BODY, { status: 200 });
    if (url.includes('qt.gtimg.cn')) {
      if (boardQuote === null) throw new Error('qt board quote unreachable (stubbed)');
      return new Response(boardQuote, { status: 200 });
    }
    throw new Error(`unexpected url: ${url}`);
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  fetchStub = null;
  requestedUrls = [];
  globalThis.fetch = (async (input: unknown) => {
    const url = typeof input === 'string' ? input : String((input as { url?: string })?.url ?? '');
    requestedUrls.push(url);
    if (!fetchStub) throw new Error(`测试未准备该请求的桩：${url}`);
    return fetchStub(url);
  }) as typeof fetch;
});

afterEach(() => {
  globalThis.fetch = realFetch;
});

describe('/api/fund-flow/industry · 钉子①：缺失 → null，真实 0 → 0', () => {
  beforeEach(() => {
    stubTencent();
  });

  it('上游没给 zljlr 的行业 → mainNet 为 null（不是 0 元）', async () => {
    const res = await getIndustry('?limit=10');
    expect(res.status).toBe(200);

    const rows = res.body.data.industries as Array<Record<string, unknown>>;
    const missing = rows.find((r) => r.industry === '上游缺失行业');
    expect(missing).toBeDefined();
    expect(missing!.mainNet).toBeNull();
    expect(missing!.mainNet).not.toBe(0);
  });

  it('真实 0 → 保留 0（不得被判成缺失）', async () => {
    const res = await getIndustry('?limit=10');
    const rows = res.body.data.industries as Array<Record<string, unknown>>;
    const zero = rows.find((r) => r.industry === '真零行业');
    expect(zero).toBeDefined();
    expect(zero!.mainNet).toBe(0);
  });

  it('万元 → 元：289753.05 万元 = 2,897,530,500 元，并按主力净额降序', async () => {
    const res = await getIndustry('?limit=10');
    const rows = res.body.data.industries as Array<Record<string, unknown>>;
    expect(rows[0].industry).toBe('食品饮料');
    expect(rows[0].mainNet).toBe(2897530500);
    // 降序：正 → 0 → 负 → null（缺失排最后，不参与"大小"比较）
    expect(rows[1].industry).toBe('真零行业');
    expect(rows[2].industry).toBe('电子');
    expect(rows[2].mainNet).toBe(-11156572100);
    expect(rows[3].industry).toBe('上游缺失行业');
    expect(rows[3].mainNet).toBeNull();
  });

  it('成分股数取 zgb 分母；netInflow（全单净额）两源皆不可得 → 恒 null', async () => {
    const res = await getIndustry('?limit=10');
    const rows = res.body.data.industries as Array<Record<string, unknown>>;
    const food = rows.find((r) => r.industry === '食品饮料');
    expect(food!.stockCount).toBe(122);
    // 全单净额拿不到就 null —— 绝不把主力净额复制到 netInflow 冒充
    for (const r of rows) expect(r.netInflow).toBeNull();
    expect(food!.mainNet).not.toBe(food!.netInflow);
  });
});

describe('/api/fund-flow/industry · 钉子②：数据源两级一致 + 空态必带原因', () => {
  it('降级到腾讯源：顶层与 data 内 dataSource 同源，且给出中文口径说明', async () => {
    stubTencent();
    const res = await getIndustry('?limit=10');

    expect(res.body.dataSource).toBe('tencent');
    expect(res.body.data.dataSource).toBe('tencent');
    expect(res.body.data.source).toBe('tencent');
    expect(typeof res.body.data.note).toBe('string');
    expect(res.body.data.note).toContain('腾讯');
  });

  it('asOf 取腾讯板块快照时间戳（一次请求），写进响应而不是留 null', async () => {
    stubTencent();
    const res = await getIndustry('?limit=10');

    expect(res.body.data.asOf).toBe('2026-10-30');
    // 只请求一次快照（不是每个行业各一次）
    expect(requestedUrls.filter((u) => u.includes('qt.gtimg.cn')).length).toBe(1);
    // 有真实日期时 note 不得再出现"日期不可得"的说法
    expect(res.body.data.note).not.toContain('asOf 不可得');
  });

  it('快照日期取不到 → asOf 为 null 且在 note 说明（不拿自然日冒充）', async () => {
    stubTencent({ boardQuote: null });
    const res = await getIndustry('?limit=10');

    expect(res.body.data.asOf).toBeNull();
    expect(res.body.data.note).toContain('asOf 不可得');
    const today = new Date().toISOString().slice(0, 10);
    expect(res.body.data.note).not.toContain(today);
  });

  it('limit 截断时 count=返回条数、total=上游可取总数，note 写明「前 N 条」且排除误读', async () => {
    stubTencent();
    const res = await getIndustry('?limit=2');

    expect(res.body.data.industries.length).toBe(2);
    expect(res.body.data.count).toBe(2);
    expect(res.body.data.total).toBe(4);
    expect(res.body.data.note).toContain('前 2 条');
    expect(res.body.data.note).toContain('不是全市场行业总数');
  });

  it('两源皆不可达 → 200 + dataSource:unavailable + 中文 note（不留无声空列表）', async () => {
    fetchStub = () => { throw new Error('blocked'); };
    const res = await getIndustry('?limit=10');

    expect(res.status).toBe(200);
    expect(res.body.data.industries).toEqual([]);
    expect(res.body.data.count).toBe(0);
    expect(res.body.data.total).toBe(0);
    expect(res.body.dataSource).toBe('unavailable');
    expect(res.body.data.dataSource).toBe('unavailable');
    // 旧实现只有 data.source + note，顶层没有 dataSource；空列表读 dataSource 拿到 undefined
    expect(typeof res.body.data.note).toBe('string');
    expect(res.body.data.note.length).toBeGreaterThan(10);
    expect(res.body.data.note).toMatch(/[\u4e00-\u9fa5]/);
    expect(res.body.notes.industry).toBe(res.body.data.note);
  });
});

describe('/api/fund-flow/industry · 源码级回归：兜 0 与字段错配不得复发', () => {
  it('industry 段不得出现 `|| 0` / `?? 0`，且主力净额必须走 honestNumber', async () => {
    const { readFileSync } = await import('fs');
    const { fileURLToPath } = await import('url');
    const { dirname, join } = await import('path');
    const here = dirname(fileURLToPath(import.meta.url));
    const raw = readFileSync(join(here, '../api/fund-flow.ts'), 'utf-8');
    // 去掉注释再扫：注释里会引用被禁写法本身作为反例说明
    const src = raw.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

    const start = src.indexOf("router.get('/fund-flow/industry'");
    expect(start).toBeGreaterThan(-1);
    const body = src.slice(start, src.indexOf("router.get('/fund-flow/batch'"));
    expect(body.length).toBeGreaterThan(300);
    expect(body).not.toMatch(/\|\|\s*0\b/);
    expect(body).not.toMatch(/\?\?\s*0\b/);
    expect(body).toContain('fetchIndustryFlow');

    // 取数函数体：f62 必须经 honestNumber 转换（不能直接 `item.f62 || 0`）
    const fnStart = src.indexOf('async function fetchIndustryFlowEastmoney');
    expect(fnStart).toBeGreaterThan(-1);
    const fn = src.slice(fnStart, src.indexOf('async function fetchIndustryFlowTencent'));
    expect(fn).toContain('honestNumber(raw?.f62)');
    expect(fn).toContain("fs: 'm:90+t:2'"); // 全部行业板块；旧值 b:BK0475 只能返回单只板块
  });
});
