/**
 * R3 交易日收口：/api/ai/market-insight、/api/ai/market-insight-llm、
 * /api/ai/market-pulse、/api/macro/overview 不得再按自然日裸查「今天」。
 *
 * 缺陷（只读审计已实测坐实）：同一天，/api/breadth/current 与 /api/market/summary
 * 有真实数据（如 2076涨/2969跌），但以下 5 个端点用 `getMarketSummary(new Date())`
 * 按自然日查库——当天是交易日但库中数据尚未同步（或节假日）时查到 null，
 * 返回 partial/unavailable，与 breadth/current 形成同一时刻的数据分叉。
 *
 * 本测试锁定的契约（修复后）：
 *   1. 四个端点都先经交易日解析（tradingCalendar.resolveMarketQueryDate /
 *      resolveQueryDate：交易日历 + 库内数据双重判定），再以解析出的交易日的
 *      **本地零点**查库（`tradingCalendar.localDayKey`：knex 按本地分量渲染
 *      `trade_date` 查询键，故必须用该日的本地零点而非 UTC 零点）——绝不再传
 *      `new Date()`（带时刻的自然日）；
 *   2. 响应如实透出数据所属交易日（asOf / asOfIsFallback / asOfNote），
 *      回退时用户能看到「你看的其实是哪一天」；
 *   3. 数值仍来自 db 真实返回（防过度修复）；
 *   4. 源码级回归：三个 api 文件中不得再出现 `getMarketSummary(new Date())`
 *      裸自然日查库。
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import express from 'express';
import request from 'supertest';

// ---- mock 上游服务（与既有测试同风格）----
vi.mock('../services/aiService', () => ({
  default: {
    chat: vi.fn(async () => ({ content: '（LLM 测试桩）' })),
    chatStream: vi.fn(),
    analyzeMarket: vi.fn(),
    diagnoseStock: vi.fn(),
    generateStrategy: vi.fn(),
    healthCheck: vi.fn(),
    chatWithAI: vi.fn(),
  },
}));
vi.mock('../services/realMarketData', () => ({ getRealMarketData: vi.fn() }));
vi.mock('../middleware/aiTiming', () => ({ aiTiming: (_q: any, _s: any, n: any) => n() }));
vi.mock('../services/macroDataService', () => ({
  getMacroCpiPpi: vi.fn(async () => { throw new Error('macro source disabled in test'); }),
  MacroUnavailableError: class MacroUnavailableError extends Error {},
}));

// fund-flow /market 会尝试东财 push2 真实源（沙箱不可达且超时 10s），隔离掉
vi.mock('axios', () => ({
  default: {
    get: vi.fn(async () => { throw new Error('network disabled in test'); }),
    post: vi.fn(async () => { throw new Error('network disabled in test'); }),
  },
}));

const dbMock = {
  getMarketSummary: vi.fn(),
  getSectorMomentumScore: vi.fn(),
  getSectorPerformanceEnhanced: vi.fn(),
  getStockWithLatestQuote: vi.fn(async () => null as unknown),
  connection: vi.fn(),
};
vi.mock('../db/dbFactory', () => ({ getDb: vi.fn(() => dbMock) }));

/**
 * 覆盖交易日解析入口（保留其余真实导出）：把「最近真实交易日」钉在
 * 2026-10-28（周三·交易日，模拟「今天数据未同步、回退昨日」的场景），
 * 以便断言 db 层收到的是该日的**本地零点**（trade_date 查询键），
 * 而不是 new Date() 的自然时刻。
 */
const RESOLVED_AS_OF = '2026-10-28';
const RESOLVED_NOTE = '2026-10-29 虽是交易日，但本地行情库无该日数据，已继续回退至最近有数据的交易日 2026-10-28';
vi.mock('../utils/tradingCalendar', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    resolveMarketQueryDate: vi.fn(async () => ({
      asOf: RESOLVED_AS_OF,
      date: new Date(`${RESOLVED_AS_OF}T00:00:00Z`),
      isFallback: true,
      dateRequested: null,
      note: RESOLVED_NOTE,
    })),
    resolveQueryDate: vi.fn(async () => ({
      date: RESOLVED_AS_OF,
      isFallback: true,
      note: RESOLVED_NOTE,
      requestedDate: null,
      reason: '库内无该日数据',
      dataAvailable: true,
      calendarSource: 'pg-cross-checked',
    })),
  };
});

import aiChatRouter from '../api/ai-chat';
import marketPulseRouter from '../api/ai-market-pulse';
import macroRouter from '../api/macro';
import fundFlowRouter from '../api/fund-flow';

const REAL_BREADTH = {
  date: new Date('2026-10-28'),
  totalStocks: 5183,
  totalTurnover: 3.2e12,
  risingStocks: 755,
  fallingStocks: 4368,
  unchangedStocks: 60,
  limitUpCount: 39,
};
const REAL_SECTORS = [
  { industry: '半导体', score: 78, avg_change_percent: 2.3, limit_up_count: 3, stock_count: 120 },
  { industry: '白酒', score: 61, avg_change_percent: -0.4, limit_up_count: 0, stock_count: 40 },
];

function buildApp(router: express.Router, mountPath: string) {
  const app = express();
  app.use(express.json());
  app.use(mountPath, router);
  return app;
}

/**
 * 断言 db.getMarketSummary 的首次调用收到的是解析出的交易日的**本地零点**。
 *
 * 为什么不是 UTC 零点（P0-MACROTZ）：knex 传 Date 时按**本地分量**渲染
 * `'YYYY-MM-DD HH:mm:ss'` 字面量、PG 再按 `trade_date`（date 列）解析，
 * 所以 UTC 零点 Date 在负偏移时区会落到前一天。查询键必须是该日期的本地零点，
 * 这条断言在任何时区都应成立——若断言 toISOString()===...Z，反而只有 UTC 进程能过。
 */
function expectCalledWithResolvedDate(mock: ReturnType<typeof vi.fn>, strictLocalKey = true) {
  expect(mock.mock.calls.length).toBeGreaterThan(0);
  const d = mock.mock.calls[0][0] as Date;
  expect(d).toBeInstanceOf(Date);
  // 不是「今天的自然时刻」
  expect(Math.abs(d.getTime() - Date.now())).toBeGreaterThan(0);
  if (strictLocalKey) {
    // 本地日历日必须是解析出的交易日，且本地时刻归零（= 可直接命中 date 列）
    const pad = (n: number) => String(n).padStart(2, '0');
    expect(`${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`).toBe(RESOLVED_AS_OF);
    expect([d.getHours(), d.getMinutes(), d.getSeconds(), d.getMilliseconds()]).toEqual([0, 0, 0, 0]);
    return;
  }
  // 宽口径（仅用于尚未迁移到 localDayKey 的端点）：只要「交易所时区口径」仍是该交易日即可，
  // 该判据对 UTC 零点键与本地零点键都成立，故不随时区漂移。
  const R = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit',
  });
  expect(R.format(d)).toBe(RESOLVED_AS_OF);
}

beforeEach(() => {
  vi.clearAllMocks();
  dbMock.getMarketSummary.mockResolvedValue(REAL_BREADTH);
  dbMock.getSectorMomentumScore.mockResolvedValue(REAL_SECTORS);
  dbMock.getSectorPerformanceEnhanced.mockResolvedValue([
    { industry: '半导体', limit_up_count: 3 },
    { industry: '白酒', limit_up_count: 0 },
  ]);
});

describe('R3 · /api/ai/market-insight：先解析交易日再查库 + asOf 透出', () => {
  it('getMarketSummary 收到解析日的本地零点；响应带 asOf/asOfIsFallback/asOfNote', async () => {
    const res = await request(buildApp(aiChatRouter, '/api')).get('/api/ai/market-insight');

    expect(res.status).toBe(200);
    expectCalledWithResolvedDate(dbMock.getMarketSummary);
    // market-insight 只做一次广度查询
    expect(dbMock.getMarketSummary).toHaveBeenCalledTimes(1);

    expect(res.body.dataSource).toBe('real');
    expect(res.body.data.asOf).toBe(RESOLVED_AS_OF);
    expect(res.body.data.asOfIsFallback).toBe(true);
    expect(res.body.data.asOfNote).toBe(RESOLVED_NOTE);
    // 数值仍来自 db 真实返回（防过度修复）
    expect(res.body.data.risingStocks).toBe(755);
    expect(res.body.data.fallingStocks).toBe(4368);
  });
});

describe('R3 · /api/ai/market-pulse：先解析交易日再查库 + asOf 透出', () => {
  it('getMarketSummary 收到解析日的本地零点；data 带 asOf 且广度为真实值', async () => {
    const res = await request(buildApp(marketPulseRouter, '/api/ai')).get('/api/ai/market-pulse');

    expect(res.status).toBe(200);
    expectCalledWithResolvedDate(dbMock.getMarketSummary);
    expect(dbMock.getMarketSummary).toHaveBeenCalledTimes(1);

    const d = res.body.data.data;
    expect(d.dataSource).toBe('real');
    expect(d.asOf).toBe(RESOLVED_AS_OF);
    expect(d.asOfIsFallback).toBe(true);
    expect(d.asOfNote).toBe(RESOLVED_NOTE);
    expect(d.breadth.rising).toBe(755);
    expect(d.breadth.falling).toBe(4368);
  });
});

describe('R3 · /api/macro/overview：先解析交易日再查库 + asOf 透出', () => {
  it('getMarketSummary 收到解析日的本地零点；data 带 asOf，卡片值真实', async () => {
    const res = await request(buildApp(macroRouter, '/api/macro')).get('/api/macro/overview');

    expect(res.status).toBe(200);
    expectCalledWithResolvedDate(dbMock.getMarketSummary);

    expect(res.body.data.asOf).toBe(RESOLVED_AS_OF);
    expect(res.body.data.asOfIsFallback).toBe(true);
    expect(res.body.data.asOfNote).toBe(RESOLVED_NOTE);
    const rising = res.body.data.core.find((c: any) => c.label === '上涨家数');
    expect(rising.available).toBe(true);
    expect(rising.valueText).toBe('755');
  });
});

describe('R3 · /api/fund-flow/market：先解析交易日再查库 + asOf 透出', () => {
  it('getMarketSummary 收到解析日的本地零点；data 带 asOf，广度为真实值', async () => {
    const res = await request(buildApp(fundFlowRouter, '/api')).get('/api/fund-flow/market');

    expect(res.status).toBe(200);
    // TODO(P0-MACROTZ)：fund-flow.ts 尚未迁移到 tradingCalendar.localDayKey（该文件正由
    // 另一工单修改，本单不碰），故此处用「交易所时区口径仍是该交易日」的宽断言；
    // 迁移完成后应去掉第二个参数，与其余三个端点同口径严判。
    expectCalledWithResolvedDate(dbMock.getMarketSummary, false);

    const d = res.body.data;
    // 东财 5 档在测试中被隔离 → partial（广度真实 + tiers 不可用），不因 tiers 缺失降级
    expect(res.body.dataSource).toBe('partial');
    expect(d.asOf).toBe(RESOLVED_AS_OF);
    expect(d.asOfIsFallback).toBe(true);
    expect(d.asOfNote).toBe(RESOLVED_NOTE);
    expect(d.market.risingStocks).toBe(755);
    expect(d.market.fallingStocks).toBe(4368);
  });
});

describe('R3 · /api/ai/market-insight-llm：LLM 路径同样透出 asOf', () => {
  it('LLM 可用时响应带 asOf 与回退标注', async () => {
    const res = await request(buildApp(aiChatRouter, '/api')).get('/api/ai/market-insight-llm');

    expect(res.status).toBe(200);
    expect(res.body.dataSource).toBe('real');
    expect(res.body.data.source).toBe('llm');
    expect(res.body.data.asOf).toBe(RESOLVED_AS_OF);
    expect(res.body.data.asOfIsFallback).toBe(true);
    expect(res.body.data.asOfNote).toBe(RESOLVED_NOTE);
  });
});

describe('R3 · 源码级回归：三个 api 文件不得再按自然日裸查', () => {
  async function readSrc(rel: string): Promise<string> {
    const { readFileSync } = await import('fs');
    const { fileURLToPath } = await import('url');
    const { dirname, join } = await import('path');
    const here = dirname(fileURLToPath(import.meta.url));
    return readFileSync(join(here, rel), 'utf-8');
  }

  it('ai-chat.ts / ai-market-pulse.ts / fund-flow.ts 不得出现 getMarketSummary(new Date())', async () => {
    for (const rel of ['../api/ai-chat.ts', '../api/ai-market-pulse.ts', '../api/fund-flow.ts']) {
      const src = (await readSrc(rel)).replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
      expect(src, `${rel} 仍在按自然日裸查`).not.toMatch(/getMarketSummary\(\s*new Date\(\)\s*\)/);
      expect(src, `${rel} 未接入交易日解析`).toContain('resolveMarketQueryDate');
    }
  });

  it('macro.ts 不得再用自然日 today 裸查，且接入 resolveQueryDate', async () => {
    const src = (await readSrc('../api/macro.ts')).replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    expect(src).not.toMatch(/getMarketSummary\(\s*new Date\(\)\s*\)/);
    expect(src).not.toMatch(/getMarketSummary\(\s*today\s*\)/);
    expect(src).toContain('resolveQueryDate');
  });
});
