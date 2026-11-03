/**
 * #107-C8 · 响应信封「拍平一层」：/api/ai/market-pulse 与 /api/etf/list
 *
 * 缺陷（2026-11-04 本地 :3001 与线上 clair-api-ryng 双端实测复现）：
 *   - GET /api/ai/market-pulse 成功路径 → { success, data: { data: {...} } }（双层）；
 *     而它的 catch 降级路径与文件头注释的契约都是单层 —— 同一端点成功/降级两套形状。
 *   - GET /api/etf/list → { success, data: { data: [...], count, dataSource, quoteCoverage... } }（双层）。
 *   后果：所有消费方都得写 data.data，与后端统一信封 sendHonest（{success, dataSource, data}）
 *   不一致；两套形状并存时，改 A 路径必漏 B 路径。
 *
 * 本测试锁定的契约（与 backend/src/api/market.ts sendHonest 同风格）：
 *   { success, dataSource, data: <业务载荷>, ...元信息, timestamp }
 *   - data 直接是业务载荷（列表端点 = 数组本身），**不得**再套一层 data
 *   - dataSource 同时出现在顶层与 data 内（同一入参派生，不得两级矛盾）
 *   - 降级路径与成功路径**同形**
 *
 * 只 mock 上游（DB/LLM/ETF 源），路由模块 import 真身。
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import express from 'express';
import request from 'supertest';

// ---------- ai-market-pulse 上游 mock ----------
vi.mock('../services/aiService', () => ({
  default: {
    chat: vi.fn(async () => ({ content: '（LLM 测试桩观点）' })),
    chatStream: vi.fn(),
    analyzeMarket: vi.fn(),
    diagnoseStock: vi.fn(),
    generateStrategy: vi.fn(),
    healthCheck: vi.fn(),
    chatWithAI: vi.fn(),
  },
}));

vi.mock('../middleware/aiTiming', () => ({
  aiTiming: (_req: unknown, _res: unknown, next: () => void) => next(),
}));

const dbMock = {
  getMarketSummary: vi.fn(),
  getSectorMomentumScore: vi.fn(),
  connection: vi.fn(),
};
vi.mock('../db/dbFactory', () => ({ getDb: vi.fn(() => dbMock) }));

// 交易日解析固定，避免依赖真实日历/库
vi.mock('../utils/tradingCalendar', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    resolveMarketQueryDate: vi.fn(async () => ({
      asOf: '2026-11-03',
      date: new Date('2026-11-03T00:00:00Z'),
      isFallback: false,
      dateRequested: null,
      note: null,
    })),
  };
});

// ---------- etf/list 上游 mock ----------
vi.mock('../services/etfDataService', () => ({
  getEtfList: vi.fn(),
  getEtfDetail: vi.fn(),
  getEtfNavHistory: vi.fn(),
  EtfUnavailableError: class EtfUnavailableError extends Error {
    constructor(msg = 'ETF 真实源暂不可用') {
      super(msg);
      this.name = 'EtfUnavailableError';
    }
  },
}));

import marketPulseRouter from '../api/ai-market-pulse';
import etfRouter from '../api/etf';
import { getEtfList, EtfUnavailableError } from '../services/etfDataService';

function buildPulseApp(): express.Express {
  const app = express();
  app.use(express.json());
  // 与 app.ts:268 一致
  app.use('/api/ai', marketPulseRouter);
  return app;
}

function buildEtfApp(): express.Express {
  const app = express();
  app.use(express.json());
  // 与 app.ts:247 一致
  app.use('/api/etf', etfRouter);
  return app;
}

const realSummary = {
  date: new Date('2026-11-03'),
  totalStocks: 5187,
  risingStocks: 2008,
  fallingStocks: 3026,
  unchangedStocks: 153,
  limitUpCount: 51,
  limitDownCount: 22,
  totalTurnover: 1.2e12,
  totalMarketCap: 8.3e13,
  avgChangePercent: -0.4,
};

const realEtfItem = {
  symbol: '510300',
  name: '沪深300ETF华泰柏瑞',
  type: 'index',
  benchmark: '沪深300',
  price: 4.092,
  nav: 4.0844,
  preNav: 4.0928,
  changePercent: 0.17,
  premiumRate: 0.19,
  totalAssets: 182452000000,
  trackingError: null,
  dividendYield: null,
  expenseRatio: null,
  volume: 4653965400,
  turnover: 19007470000,
  holdings: null,
  fieldSources: { trackingError: 'unavailable', dividendYield: 'unavailable', expenseRatio: 'unavailable', holdings: 'unavailable' },
};

describe('#107-C8 · market-pulse 响应信封拍平（data 不得再套 data）', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    dbMock.getMarketSummary.mockResolvedValue(realSummary);
    dbMock.getSectorMomentumScore.mockResolvedValue([]);
  });

  it('成功路径：data 直接是业务载荷（temperature/breadth 单层可取），dataSource 顶层+data 同源', async () => {
    const res = await request(buildPulseApp()).get('/api/ai/market-pulse');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    // 核心：业务字段直接在 data 下（不再经 data.data 才能取到）
    expect(res.body.data.temperature).toHaveProperty('label');
    expect(res.body.data.breadth.rising).toBe(2008);
    expect(res.body.data.limitUp).toBe(51);
    // 核心：双层 data 已消除
    expect(res.body.data.data).toBeUndefined();
    // 诚实契约：顶层 dataSource 存在且与 data 内同源
    expect(res.body.dataSource).toBe('real');
    expect(res.body.data.dataSource).toBe('real');
  });

  it('降级路径：与成功路径同形（单层 + 顶层 dataSource:unavailable）', async () => {
    dbMock.getMarketSummary.mockRejectedValue(new Error('db down'));
    dbMock.getSectorMomentumScore.mockRejectedValue(new Error('db down'));

    const res = await request(buildPulseApp()).get('/api/ai/market-pulse');

    expect(res.status).toBe(200);
    expect(res.body.data.data).toBeUndefined();
    expect(res.body.data.temperature.score).toBeNull();
    expect(res.body.data.breadth).toBeNull();
    expect(res.body.dataSource).toBe('unavailable');
    expect(res.body.data.dataSource).toBe('unavailable');
  });
});

describe('#107-C8 · etf/list 响应信封拍平', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('成功路径：data 直接是 ETF 数组，元信息与 dataSource 在顶层', async () => {
    (getEtfList as any).mockResolvedValue([realEtfItem]);

    const res = await request(buildEtfApp()).get('/api/etf/list');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    // 核心：data 就是数组本身
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.data[0].symbol).toBe('510300');
    // 核心：双层 data 已消除
    expect((res.body.data as any).data).toBeUndefined();
    // 元信息在顶层
    expect(res.body.dataSource).toBe('real');
    expect(res.body.count).toBe(1);
    expect(res.body.quoteCoverage).toBe('1/1');
    expect(res.body.quoteSource).toBe('tencent');
    expect(res.body.navSource).toBe('eastmoney-fund');
  });

  it('行情源不可用：data 仍必须是数组（[]），dataSource:unavailable + message 在顶层', async () => {
    (getEtfList as any).mockRejectedValue(new EtfUnavailableError('网络受限'));

    const res = await request(buildEtfApp()).get('/api/etf/list');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.data).toEqual([]);
    expect(res.body.dataSource).toBe('unavailable');
    expect(res.body.count).toBe(0);
    expect(res.body.message).toBe('网络受限');
  });
});
