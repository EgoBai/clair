/**
 * 台账 #33 · ai-chat 个股诊断/策略：有股票行、无最新行情时不得标 dataSource:'real'
 *
 * 缺陷（2026-11-04 复核）：
 *   resolveStockData() 只要 getStockWithLatestQuote() 返回了股票行就无条件
 *   return dataSource:'real'，但该方法的契约是「股票行 + latestQuote 可选」
 *   （Database.getStockWithLatestQuote: latestQuote = 查不到 ? undefined）；
 *   于是 latestQuote 缺失时 price/change/pe/pb/marketCap 全是 null，
 *   诊断/策略却仍以 'real' 背书——用空值冒充真实个股行情。
 *
 * 本测试锁定：
 *   - 股票行存在 + 行情缺失 → 'partial'（个股身份真实、行情不可用），且 AI 入参里
 *     price/change 确为 null（证明 partial 不是随便标的）
 *   - 股票行 + 行情都在 → 'real'
 *   - 股票行不存在 → 既有 'demo' 语义不变（确定性演示数据，明示 demo）
 *
 * 只 mock 上游（DB / LLM），路由模块 import 真身（../api/ai-chat）。
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../services/aiService', () => ({
  default: {
    chat: vi.fn(),
    chatStream: vi.fn(),
    analyzeMarket: vi.fn(),
    diagnoseStock: vi.fn(),
    generateStrategy: vi.fn(),
    healthCheck: vi.fn(),
    chatWithAI: vi.fn(),
  },
}));

vi.mock('../services/realMarketData', () => ({
  getRealMarketData: vi.fn(),
}));

vi.mock('../db/dbFactory', () => {
  const db = {
    getStockWithLatestQuote: vi.fn(async () => null as unknown),
  };
  return { getDb: vi.fn(() => db) };
});

import express from 'express';
import request from 'supertest';
import aiService from '../services/aiService';
import { getDb } from '../db/dbFactory';
import aiChatRouter from '../api/ai-chat';

const db = (getDb as unknown as () => { getStockWithLatestQuote: ReturnType<typeof vi.fn> })();

function buildApp() {
  const app = express();
  app.use(express.json());
  // 与 app.ts:245 一致：ai-chat 挂在 /api
  app.use('/api', aiChatRouter);
  return app;
}

/** 数据库返回的股票行（真实结构；latestQuote 缺失即「有行无行情」） */
const stockRowWithoutQuote = {
  id: 1,
  symbol: '600519.SH',
  name: '贵州茅台',
  industry: '白酒',
  latestQuote: undefined,
  technicalIndicators: [],
  financialIndicators: [],
};

const latestQuote = {
  closePrice: 1688.5,
  changePercent: 1.23,
  peRatio: 28.5,
  pbRatio: 8.2,
  marketCap: 2120000000000,
};

describe('#33 · ai-chat 个股诊断/策略：无行情不得标 real', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (aiService.diagnoseStock as any).mockResolvedValue('（真实 LLM 诊断文本）');
    (aiService.generateStrategy as any).mockResolvedValue('（真实 LLM 策略文本）');
  });

  it('股票行存在但 latestQuote 缺失 → diagnose dataSource 必须是 partial（不是 real）', async () => {
    (db.getStockWithLatestQuote as any).mockResolvedValue(stockRowWithoutQuote);

    const res = await request(buildApp()).get('/api/ai/diagnose/600519');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    // 核心断言：无行情不得以 real 背书
    expect(res.body.dataSource).not.toBe('real');
    expect(res.body.dataSource).toBe('partial');
    expect(res.body.data.dataSource).toBe('partial');
    // 证明「partial」不是随手标的：AI 实际拿到的 price/change 是 null
    const passed = (aiService.diagnoseStock as any).mock.calls[0][0];
    expect(passed.price).toBeNull();
    expect(passed.change).toBeNull();
  });

  it('股票行存在但 latestQuote 缺失 → POST /ai/strategy 同样必须是 partial', async () => {
    (db.getStockWithLatestQuote as any).mockResolvedValue(stockRowWithoutQuote);

    const res = await request(buildApp())
      .post('/api/ai/strategy')
      .send({ symbol: '600519', riskLevel: '中等', horizon: '1-2周', position: '轻仓' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.dataSource).toBe('partial');
    expect(res.body.data.dataSource).toBe('partial');
    const passed = (aiService.generateStrategy as any).mock.calls[0][0];
    expect(passed.price).toBeNull();
  });

  it('股票行 + 最新行情都在 → dataSource:real（防过度修复）', async () => {
    (db.getStockWithLatestQuote as any).mockResolvedValue({
      ...stockRowWithoutQuote,
      latestQuote,
      technicalIndicators: [{ ma5: 1700, ma20: 1650, ma60: 1600, macd: 12.5, rsi: 58 }],
      financialIndicators: [{ roe: 31.2 }],
    });

    const res = await request(buildApp()).get('/api/ai/diagnose/600519');

    expect(res.status).toBe(200);
    expect(res.body.dataSource).toBe('real');
    expect(res.body.data.dataSource).toBe('real');
    const passed = (aiService.diagnoseStock as any).mock.calls[0][0];
    expect(passed.price).toBe('1688.50');
    expect(passed.change).toBe('1.23');
  });

  it('股票行不存在 → 既有 demo 语义不变（确定性演示数据，明示 demo）', async () => {
    (db.getStockWithLatestQuote as any).mockResolvedValue(null);

    const res = await request(buildApp()).get('/api/ai/diagnose/000001');

    expect(res.status).toBe(200);
    expect(res.body.dataSource).toBe('demo');
    expect(res.body.data.dataSource).toBe('demo');
  });
});
