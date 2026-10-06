/**
 * ai-chat 端点 HTTP 状态码语义回归测试（P0-A）
 *
 * 背景（工单 P0-A：业务性数据不可用被当成服务端崩溃）：
 *   `api/ai-chat.ts` 的三个端点在「上游真实数据源 / LLM 不可用」时返回
 *   HTTP 500，响应体虽已诚实标注 dataSource:'unavailable' + 中文 message，
 *   但**前端所有调用点都是 `if (!res.ok) throw` / `if (!response.ok) throw`**
 *   （services/aiClient.ts、各 Page 的裸 fetch、utils/api.ts 的 apiFetch），
 *   500 会让它们在**解析响应体之前**就进 catch 分支——
 *   于是诚实标注的 dataSource / message 永远读不到，
 *   用户看到的只有页面报错 / 空白，而不是可解释的空态。
 *
 * 本测试锁定修复后的契约：
 *   1. 三个端点在「不可用」时必须是 200（**断言状态码，不只断响应体字段**）；
 *   2. 响应体必须仍带 dataSource:'unavailable' + 中文 message + 机器可判别的 code；
 *   3. 绝不允许用 0 值 / 空数组 / 假文本冒充真实数据（诚实红线）；
 *   4. POST /ai/strategy 缺 symbol 是**客户端错误**（400），
 *      不得再滑进 catch 被误报成「未获得任何真实个股数据」。
 *
 * 注意 4 的背景是一个真实代码 bug：symbol 缺失时 undefined 会流进
 * buildDemoStockData → hashSeed(undefined) 读 undefined.length 抛 TypeError，
 * 此前被 catch 接住后谎报成数据源不可用。
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import express from 'express';
import request from 'supertest';

// ---- mock 上游依赖，隔离网络/LLM，只测路由层语义 ----
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
  // 稳定单例：测试需替换其方法，故不能每次调用都新建对象
  const db = {
    getStockWithLatestQuote: vi.fn(async () => null as unknown),
  };
  return { getDb: vi.fn(() => db) };
});

import aiService from '../services/aiService';
import { getRealMarketData } from '../services/realMarketData';
import aiChatRouter from '../api/ai-chat';

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/api', aiChatRouter);
  return app;
}

/** 断言「诚实降级」三要素：200 + unavailable + 中文 message + 可判别 code */
function assertHonestDegraded(res: { status: number; body: any }, label: string) {
  // 【核心断言】状态码：绝不能是 5xx
  expect(res.status, `${label} 不得返回 5xx（业务性不可用不是崩溃）`).toBe(200);
  expect(res.body.dataSource).toBe('unavailable');
  expect(res.body.success).toBe(false);
  // 机器可判别：前端不必去匹配中文 message
  expect(res.body.code).toBe('UPSTREAM_UNAVAILABLE');
  // 人可读：中文 message 必须存在且非空
  expect(typeof res.body.message).toBe('string');
  expect(res.body.message.length).toBeGreaterThan(0);
  expect(res.body.message).toMatch(/[一-龥]/);
}

describe('ai-chat 端点状态码语义：业务性不可用 ≠ 服务端崩溃', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('GET /api/ai/market-analysis', () => {
    it('真实行情源不可用 → 200 + dataSource:unavailable（此前是 500）', async () => {
      (getRealMarketData as any).mockRejectedValue(new Error('fetch failed'));

      const res = await request(buildApp()).get('/api/ai/market-analysis');

      assertHonestDegraded(res, 'market-analysis');
      expect(res.body.error).toContain('真实行情源不可用');
      expect(res.body.message).toContain('未获得任何真实指数数据');
      // 诚实红线：不可用时绝不能顺手编一条 analysis 出来
      expect(res.body.analysis).toBeUndefined();
    });

    it('真实源可用时仍是 200 且 dataSource:real', async () => {
      (getRealMarketData as any).mockResolvedValue({
        shanghai: { price: 3300.5, changePct: 0.5 },
        shenzhen: { price: 10500.2, changePct: 0.3 },
        chinext: { price: 2150.8, changePct: -0.2 },
        breadth: { up: 2000, down: 1000, limitUp: 30, limitDown: 5, turnoverYi: 8000 },
      });
      (aiService.analyzeMarket as any).mockResolvedValue('大盘震荡向上。');

      const res = await request(buildApp()).get('/api/ai/market-analysis');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.dataSource).toBe('real');
      expect(res.body.analysis).toBe('大盘震荡向上。');
    });

    it('LLM 不可用（真实源已拿到）也不得 5xx', async () => {
      (getRealMarketData as any).mockResolvedValue({
        shanghai: { price: 3300.5, changePct: 0.5 },
        shenzhen: { price: 10500.2, changePct: 0.3 },
        chinext: { price: 2150.8, changePct: -0.2 },
        breadth: null,
      });
      (aiService.analyzeMarket as any).mockRejectedValue(new Error('LLM 余额不足'));

      const res = await request(buildApp()).get('/api/ai/market-analysis');

      assertHonestDegraded(res, 'market-analysis (LLM 不可用)');
      expect(res.body.analysis).toBeUndefined();
    });
  });

  describe('POST /api/ai/strategy', () => {
    it('AI 服务不可用 → 200 + dataSource:unavailable（此前是 500）', async () => {
      (aiService.generateStrategy as any).mockRejectedValue(new Error('LLM 超时'));

      const res = await request(buildApp())
        .post('/api/ai/strategy')
        .send({ symbol: '600519' });

      assertHonestDegraded(res, 'strategy');
      // 诚实红线：不得用空策略文本冒充真实策略
      expect(res.body.strategy).toBeUndefined();
      expect(JSON.stringify(res.body)).not.toContain('"strategy"');
    });

    it('缺 symbol → 400 客户端错误（不再滑进 catch 谎报数据源不可用）', async () => {
      const res = await request(buildApp()).post('/api/ai/strategy').send({});

      expect(res.status).toBe(400);
      expect(res.body.code).toBe('VALIDATION_ERROR');
      expect(res.body.dataSource).toBe('unavailable');
      expect(res.body.message).toContain('symbol');
      // 关键：不得再声称是「数据源不可用」——真实原因是入参非法
      expect(res.body.message).not.toContain('未获得任何真实个股数据');
      // 且绝不能因为 symbol=undefined崩在 hashSeed 里
      expect(aiService.generateStrategy).not.toHaveBeenCalled();
    });

    it('symbol 为空白字符串同样按 400 处理', async () => {
      const res = await request(buildApp()).post('/api/ai/strategy').send({ symbol: '   ' });

      expect(res.status).toBe(400);
      expect(res.body.code).toBe('VALIDATION_ERROR');
    });

    it('有真实个股数据 + AI 可用 → 200 且 dataSource:real',async () => {
      (aiService.generateStrategy as any).mockResolvedValue('建议持有。');
      const { getDb } = await import('../db/dbFactory');
      (getDb() as any).getStockWithLatestQuote.mockResolvedValue({
        name: '贵州茅台',
        symbol: '600519',
        industry: '白酒',
        latestQuote: { closePrice: 1500, changePercent: 1.2, peRatio: 30, pbRatio: 8, marketCap: 1.9e12 },
        technicalIndicators: [{ ma5: 1490, ma20: 1480, ma60: 1450, macd: 1.1, rsi: 55 }],
        financialIndicators: [{ roe: 30 }],
      });

      const res = await request(buildApp())
        .post('/api/ai/strategy')
        .send({ symbol: '600519' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.dataSource).toBe('real');
      expect(res.body.data.strategy).toBe('建议持有。');
    });
  });

  describe('POST /api/ai/trade-analysis', () => {
    it('LLM 不可用 → 200 + dataSource:unavailable（此前是 500）', async () => {
      (aiService.chat as any).mockRejectedValue(new Error('LLM 网关不可用'));

      const res = await request(buildApp())
        .post('/api/ai/trade-analysis')
        .send({ trades: [], stats: {} });

      assertHonestDegraded(res, 'trade-analysis');
      expect(res.body.message).toContain('未生成任何交易分析');
      // 诚实红线：绝不用「暂无」之类的假分析冒充真实 LLM 产出
      expect(res.body.analysis).toBeUndefined();
    });

    it('LLM 可用 → 200 且 dataSource:real', async () => {
      (aiService.chat as any).mockResolvedValue({ content: '你的交易频率偏高。' });

      const res = await request(buildApp())
        .post('/api/ai/trade-analysis')
        .send({ trades: [], stats: {} });

      expect(res.status).toBe(200);
      expect(res.body.dataSource).toBe('real');
      expect(res.body.analysis).toBe('你的交易频率偏高。');
    });
  });

  describe('POST /api/ai/watchlist-summary', () => {
    it('LLM 不可用 → 200 + dataSource:unavailable（此前是 500）', async () => {
      (aiService.chat as any).mockRejectedValue(new Error('LLM gateway 502'));

      const res = await request(buildApp())
        .post('/api/ai/watchlist-summary')
        .send({ symbols: ['600519'], quotes: [{ price: 1500, changePercent: 1 }] });

      assertHonestDegraded(res, 'watchlist-summary');
      expect(res.body.message).toContain('未生成任何自选股总结');
      // 诚实红线：绝不用空串/「暂无总结」冒充真实 LLM 产出
      expect(res.body.summary).toBeUndefined();
    });

    it('LLM 可用 → 200 且 dataSource:real', async () => {
      (aiService.chat as any).mockResolvedValue({ content: '自选组合今日整体走强。' });

      const res = await request(buildApp())
        .post('/api/ai/watchlist-summary')
        .send({ symbols: ['600519'], quotes: [{ price: 1500, changePercent: 1 }] });

      expect(res.status).toBe(200);
      expect(res.body.dataSource).toBe('real');
      expect(res.body.summary).toBe('自选组合今日整体走强。');
    });

    it('symbols 缺失 → 400（客户端错误，不滑进 catch 谎报为上游不可用）', async () => {
      const res = await request(buildApp()).post('/api/ai/watchlist-summary').send({});

      expect(res.status).toBe(400);
    });
  });

  describe('回归：状态码语义在源文件中不得回退', () => {
    /**
     * 只扫本工单负责的端点。
     * 同文件内其它端点（diagnose / daily-briefing / market-insight /
     * market-insight-llm）仍存在同类 500 分支，
     * 已开清单交由主理人统一派发，不在本工单文件域断言范围内。
     */
    const OWNED_ROUTES = [
      "router.get('/ai/market-analysis'",
      "router.post('/ai/strategy'",
      "router.post('/ai/trade-analysis'",
      "router.post('/ai/watchlist-summary'",
    ];

    it('各端点的处理函数内不再有 res.status(500)', async () => {
      const { readFileSync } = await import('fs');
      const { fileURLToPath } = await import('url');
      const { dirname, join } = await import('path');
      const here = dirname(fileURLToPath(import.meta.url));
      const src = readFileSync(join(here, '../api/ai-chat.ts'), 'utf-8');

      const routeOffsets = OWNED_ROUTES.map((r) => src.indexOf(r));
      // 各端点都得找得到，否则说明路由被改名/删除，本测试失去意义
      routeOffsets.forEach((off, i) => {
        expect(off, `未找到路由 ${OWNED_ROUTES[i]}`).toBeGreaterThan(-1);
      });

      OWNED_ROUTES.forEach((route, i) => {
        // 该端点源码 = 从它的 router.x( 到下一个 router. 声明之前
        const start = routeOffsets[i];
        const next = src.indexOf('\nrouter.', start + route.length);
        const body = src.slice(start, next === -1 ? undefined : next);

        expect(body, `${route} 仍含 res.status(500)`).not.toContain('status(500)');
        // 降级路径必须走统一出口，避免各处手写状态码再次漂移
        expect(body, `${route} 的降级分支未走 sendUnavailable`).toContain('sendUnavailable');
      });
    });
  });
});