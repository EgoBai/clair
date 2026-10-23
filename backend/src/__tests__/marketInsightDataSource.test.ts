/**
 * /api/ai/market-insight：dataSource 必须按三类数据源各自的可用性**分级**标注
 *
 * 缺陷（半诚实，已 curl 实测坐实）：三类数据源是三条互相独立的查询——
 *   - breadth : db.getMarketSummary(new Date())          → 当日无行情返回 null
 *   - sectors : db.getSectorMomentumScore()              → 无数据返回 []
 *   - limitUp : db.getSectorPerformanceEnhanced()        → 无数据返回 []
 * 但路由层原先只按 breadth 一个判据给**整个响应**定性：
 *   `sendHonest(res, hasMarketData ? 'real' : 'unavailable', insight)`
 * 于是实测出现「顶层 dataSource='unavailable'，而 data.topSectors / data.hotSectors
 * 是真实取到的板块与涨停分布数据」——真实数据被空态判据连坐掩盖。
 * 把真实数据标成不可用，与把假数据标成真实，同样违反诚实红线。
 *
 * 本测试锁定的契约（新增三态）：
 *   1. 三类齐全    → dataSource:'real'，degradedNote 为 null；
 *   2. 三类全缺    → dataSource:'unavailable'，degradedNote 说明全缺；
 *   3. 部分可用    → dataSource:'partial'，且**真实数据不得被连坐**：
 *      可用项字段照常有值，缺失项字段必须是 null（不是 0 / 空串）；
 *   4. dataAvailability 逐项如实反映三类可用性；
 *   5. 既有前端契约字段（summary / points / metrics / sections / topSectors 等）不得消失。
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import express from 'express';
import request from 'supertest';

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

/** 让 /ai/market-insight-llm 恒定走「LLM 不可用 → 规则引擎降级」分支 */
async function forceLlmFallback() {
  const ai = (await import('../services/aiService')).default;
  vi.mocked(ai.chat).mockRejectedValue(new Error('LLM 不可用（测试强制）'));
}

vi.mock('../services/realMarketData', () => ({
  getRealMarketData: vi.fn(),
}));

const dbMock = {
  getMarketSummary: vi.fn(),
  getSectorMomentumScore: vi.fn(),
  getSectorPerformanceEnhanced: vi.fn(),
  getStockWithLatestQuote: vi.fn(async () => null as unknown),
};
vi.mock('../db/dbFactory', () => ({ getDb: vi.fn(() => dbMock) }));

import aiChatRouter from '../api/ai-chat';

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/api', aiChatRouter);
  return app;
}

/** 三类数据源的真实样本 */
const REAL_BREADTH = {
  date: new Date('2026-10-09'),
  totalStocks: 5000,
  totalTurnover: 8.2e11,
  risingStocks: 3000,
  fallingStocks: 1800,
  unchangedStocks: 200,
};
const REAL_SECTORS = [
  { industry: '电子', score: 47, avg_change_percent: -3.1, limit_up_count: 2, stock_count: 300 },
  { industry: '计算机', score: 47, avg_change_percent: -3.2, limit_up_count: 7, stock_count: 260 },
  { industry: '机械设备', score: 41, avg_change_percent: -2.2, limit_up_count: 0, stock_count: 210 },
];
const REAL_LIMITUP = [
  { industry: '电子', limit_up_count: 2 },
  { industry: '计算机', limit_up_count: 7 },
  { industry: '机械设备', limit_up_count: 0 },
];

describe('/api/ai/market-insight · dataSource 三态分级', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ==================== 组合 1：三类齐全 → real ====================
  it('三类齐全 → dataSource:real，且 degradedNote 为 null', async () => {
    dbMock.getMarketSummary.mockResolvedValue(REAL_BREADTH);
    dbMock.getSectorMomentumScore.mockResolvedValue(REAL_SECTORS);
    dbMock.getSectorPerformanceEnhanced.mockResolvedValue(REAL_LIMITUP);

    const res = await request(buildApp()).get('/api/ai/market-insight');
    expect(res.status).toBe(200);

    // 顶层与 data 内一致（sendHonest 保证），杜绝两级矛盾
    expect(res.body.dataSource).toBe('real');
    expect(res.body.data.dataSource).toBe('real');

    expect(res.body.data.dataAvailability).toEqual({ breadth: true, sectors: true, limitUp: true });
    expect(res.body.data.degradedNote).toBeNull();

    // 既有前端契约字段不得因新增字段而消失
    expect(typeof res.body.data.summary).toBe('string');
    expect(res.body.data.summary.length).toBeGreaterThan(0);
    expect(res.body.data.points.length).toBeGreaterThan(0);
    expect(res.body.data.sections.length).toBe(3);
    expect(res.body.data.topSectors).toContain('电子');
    expect(res.body.data.risingStocks).toBe(3000);
  });

  // ==================== 组合 2：三类全缺 → unavailable ====================
  it('三类全缺 → dataSource:unavailable，且逐项标注全缺说明', async () => {
    dbMock.getMarketSummary.mockResolvedValue(null);
    dbMock.getSectorMomentumScore.mockResolvedValue([]);
    dbMock.getSectorPerformanceEnhanced.mockResolvedValue([]);

    const res = await request(buildApp()).get('/api/ai/market-insight');
    expect(res.status).toBe(200);

    expect(res.body.dataSource).toBe('unavailable');
    expect(res.body.data.dataSource).toBe('unavailable');

    expect(res.body.data.dataAvailability).toEqual({ breadth: false, sectors: false, limitUp: false });
    // 全缺时必须有人类可读说明，且不得拿 0 / 空串冒充
    expect(typeof res.body.data.degradedNote).toBe('string');
    expect(res.body.data.degradedNote).toContain('不可用');

    expect(res.body.data.topSectors).toBeNull();
    expect(res.body.data.hotSectors).toBeNull();
    expect(res.body.data.limitUpCount).toBeNull();
  });

  // ==================== 组合 3：仅 sectors 可用 → partial，真实板块数据不得被掩盖 ====================
  it('仅板块数据可用 → dataSource:partial，topSectors 保留真实值，breadth 字段为 null', async () => {
    dbMock.getMarketSummary.mockResolvedValue(null);
    dbMock.getSectorMomentumScore.mockResolvedValue(REAL_SECTORS);
    dbMock.getSectorPerformanceEnhanced.mockResolvedValue([]);

    const res = await request(buildApp()).get('/api/ai/market-insight');
    expect(res.status).toBe(200);

    expect(res.body.dataSource).toBe('partial');
    expect(res.body.data.dataSource).toBe('partial');

    expect(res.body.data.dataAvailability).toEqual({ breadth: false, sectors: true, limitUp: false });
    expect(res.body.data.degradedNote).toContain('当日涨跌家数（breadth）');

    // 可用项：真实板块数据必须仍在（这正是原缺陷被掩盖掉的部分）
    expect(res.body.data.topSectors).toContain('电子');
    expect(res.body.data.hotSectors).toContain('计算机7只涨停');
    // 缺失项：必须是 null（查不到），绝不能是 0
    for (const f of ['risingStocks', 'fallingStocks', 'unchangedStocks', 'upPct']) {
      expect(res.body.data[f], `${f} 必须是 null`).toBeNull();
    }
    expect(res.body.data.mood).toBeNull();
    expect(res.body.data.overview).toBeNull();
    // 不得因 breadth 缺失而凭空生成市场解读
    expect(JSON.stringify(res.body)).not.toContain('弱势调整');
  });

  // ==================== 组合 4：breadth 可用但 sectors 缺失 → partial ====================
  it(' breadth 可用、板块/涨停缺失 → dataSource:partial，breadth 数值照常真实', async () => {
    dbMock.getMarketSummary.mockResolvedValue(REAL_BREADTH);
    dbMock.getSectorMomentumScore.mockResolvedValue([]);
    dbMock.getSectorPerformanceEnhanced.mockResolvedValue([]);

    const res = await request(buildApp()).get('/api/ai/market-insight');
    expect(res.status).toBe(200);

    expect(res.body.dataSource).toBe('partial');
    expect(res.body.data.dataSource).toBe('partial');

    expect(res.body.data.dataAvailability).toEqual({ breadth: true, sectors: false, limitUp: false });
    expect(res.body.data.degradedNote).toContain('板块动量（sectors）');
    expect(res.body.data.degradedNote).toContain('涨停分布（limitUp）');
    expect(res.body.data.degradedNote).toContain('涨跌家数');

    // breadth 真的拿到了，数值必须如实落地（不得被 sectors 缺失带崩）
    expect(res.body.data.risingStocks).toBe(3000);
    expect(res.body.data.fallingStocks).toBe(1800);
    expect(res.body.data.upPct).toBe(60);
    // 缺失的板块侧必须 null，不得 '' 或 0
    expect(res.body.data.topSectors).toBeNull();
    expect(res.body.data.hotSectors).toBeNull();
    expect(res.body.data.limitUpCount).toBeNull();
  });
});

// ==================================================================
// /ai/market-insight-llm 降级分支：必须与 /ai/market-insight 同一套三态契约
// （两个端点共用同一个 buildRuleInsight，不允许再出现单判据定性）
// ==================================================================
describe('/api/ai/market-insight-llm · 降级后同样三态分级', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    await forceLlmFallback();
  });

  it('LLM 失败且三类齐全 → 降级结果仍是 real', async () => {
    dbMock.getMarketSummary.mockResolvedValue(REAL_BREADTH);
    dbMock.getSectorMomentumScore.mockResolvedValue(REAL_SECTORS);
    dbMock.getSectorPerformanceEnhanced.mockResolvedValue(REAL_LIMITUP);

    const res = await request(buildApp()).get('/api/ai/market-insight-llm');
    expect(res.status).toBe(200);

    expect(res.body.dataSource).toBe('real');
    expect(res.body.data.dataSource).toBe('real');
    expect(res.body.data.source).toBe('rule');
    expect(res.body.data.dataAvailability).toEqual({ breadth: true, sectors: true, limitUp: true });
    expect(res.body.data.degradedNote).toBeNull();
  });

  it('LLM 失败 + breadth 缺失、板块真实 → partial，且真实板块数据不被掩盖', async () => {
    dbMock.getMarketSummary.mockResolvedValue(null);
    dbMock.getSectorMomentumScore.mockResolvedValue(REAL_SECTORS);
    dbMock.getSectorPerformanceEnhanced.mockResolvedValue(REAL_LIMITUP);

    const res = await request(buildApp()).get('/api/ai/market-insight-llm');
    expect(res.status).toBe(200);

    // 这是本次修的同一处病：降级前整响标 unavailable，真实板块数据被连坐
    expect(res.body.dataSource).toBe('partial');
    expect(res.body.data.dataSource).toBe('partial');
    expect(res.body.data.dataAvailability).toEqual({ breadth: false, sectors: true, limitUp: true });
    expect(res.body.data.topSectors).toContain('电子');
    expect(res.body.data.degradedNote).toContain('当日涨跌家数（breadth）');
    expect(res.body.data.degradedNote).toContain('真实数据');
  });

  it('LLM 失败且三类全缺 → unavailable', async () => {
    dbMock.getMarketSummary.mockResolvedValue(null);
    dbMock.getSectorMomentumScore.mockResolvedValue([]);
    dbMock.getSectorPerformanceEnhanced.mockResolvedValue([]);

    const res = await request(buildApp()).get('/api/ai/market-insight-llm');
    expect(res.status).toBe(200);

    expect(res.body.dataSource).toBe('unavailable');
    expect(res.body.data.dataSource).toBe('unavailable');
    expect(res.body.data.dataAvailability).toEqual({ breadth: false, sectors: false, limitUp: false });
    expect(typeof res.body.data.degradedNote).toBe('string');
    expect(res.body.data.topSectors).toBeNull();
  });
});
