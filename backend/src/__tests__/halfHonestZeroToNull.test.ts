/**
 * P0-HONESTY2：半诚实降级回归测试
 *
 * 背景（本项目最高优先级红线）：
 *   **0 是一个合法真实值**（某天确实可能零成交 / 零置信度）。
 *   把「上游没给数」填成 0，会让用户和下游**无法区分「真的是 0」与「拿不到」**，
 *   这比返回空数组更隐蔽——因为响应已正确标了 dataSource:'unavailable'，
 *   但内部业务数值仍是 0，前端读到照样会显示成真实结论。
 *
 * 本文件的核心断言范式：
 *   断言「不可用时该字段**不是 0**」，而不是只断字段存在。
 *
 * 判定边界（刻意不动的语义正确项，见各describe 的反向对照）：
 *   - 数组长度：源**可达**且上游明确返回空集 → `count: 0` / `tradeCount: 0`
 *     是真实业务事实，改成 null 反而是失真。
 *   - 布尔量：`knowledgeBaseAvailable: false` 语义正确。
 */

import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import request from 'supertest';
import express from 'express';
import blockTradesRouter from '../api/block-trades';
import aiAnalysisRouter from '../api/ai-analysis';
import aiMarketPulseRouter from '../api/ai-market-pulse';
import { checkAlerts, getAlertRules } from '../api/alerts';
import { getDb, initDatabase } from '../db/dbFactory';
import { queryCache } from '../utils/queryCache';

// ==================== helpers ====================

beforeAll(async () => {
  // alerts / market-pulse 走 db 单例，必须先初始化
  await initDatabase();
});

function buildApp(...routers: express.Router[]): express.Express {
  const app = express();
  app.use(express.json());
  for (const r of routers) app.use('/api', r);
  return app;
}

/** 按真实挂载点建app：market-pulse 在 app.ts 里挂的是 /api/ai */
function buildAppAt(prefix: string, ...routers: express.Router[]): express.Express {
  const app = express();
  app.use(express.json());
  for (const r of routers) app.use(prefix, r);
  return app;
}

function setFetch(fn: unknown): void {
  (global as any).fetch = fn;
}

/** 模拟上游网络不可达 */
function fetchDown(): void {
  setFetch(vi.fn().mockRejectedValue(new Error('network down')));
}

// ==================== block-trades ====================

describe('P0-HONESTY2 · block-trades：源不可达时业务量必须是 null', () => {
  const app = buildApp(blockTradesRouter);

  beforeEach(() => {
    queryCache.invalidate('block-trades');
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('GET /api/block-trades 不可用 → summary 各业务量均不是 0', async () => {
    fetchDown();
    const res = await request(app).get('/api/block-trades?date=2026-09-30');

    expect(res.status).toBe(200);
    expect(res.body.data.dataSource).toBe('unavailable');
    const s = res.body.data.summary;
    expect(s.totalAmount).toBeNull();
    expect(s.totalVolume).toBeNull();
    expect(s.avgDiscount).toBeNull();
    expect(s.tradeCount).toBeNull();
    expect(s.premiumCount).toBeNull();
    expect(s.discountCount).toBeNull();
    // 「不是 0」的显式断言（本工单的核心验收口径）
    for (const k of ['totalAmount', 'totalVolume', 'avgDiscount', 'tradeCount', 'premiumCount', 'discountCount']) {
      expect(s[k], `${k} 绝不能是 0`).not.toBe(0);
    }
    expect(res.body.data.pagination.total).toBeNull();
    // trades 是「已明确标注 unavailable 的容器」，空数组语义正确，保持 []
    expect(res.body.data.trades).toEqual([]);
  });

  it('GET /api/block-trades/overview 不可用 → 统计量均不是 0', async () => {
    fetchDown();
    const res = await request(app).get('/api/block-trades/overview');

    expect(res.body.data.dataSource).toBe('unavailable');
    for (const k of ['totalTrades', 'totalAmount', 'avgAmount', 'premiumTrades', 'discountTrades', 'flatTrades']) {
      expect(res.body.data[k], `${k} 应为 null`).toBeNull();
      expect(res.body.data[k], `${k} 绝不能是 0`).not.toBe(0);
    }
    // 数组类字段保持空数组（语义正确）
    expect(res.body.data.topBuyers).toEqual([]);
    expect(res.body.data.industryDistribution).toEqual([]);
  });

  it('GET /api/block-trades/:symbol 不可用 → total 不是 0', async () => {
    fetchDown();
    const res = await request(app).get('/api/block-trades/600519?days=30');

    expect(res.body.data.dataSource).toBe('unavailable');
    expect(res.body.data.total).toBeNull();
    expect(res.body.data.total).not.toBe(0);
  });
});

// ==================== ai-analysis ====================

describe('P0-HONESTY2 · ai-analysis：unavailable 响应里不得夹带业务量0', () => {
  const app = buildApp(aiAnalysisRouter);

  beforeEach(() => {
    // 强制上游不可达：fetchWatchlistStocks 内部对全部股票 Promise.allSettled
    // 全failed 时抛错 → 路由进入 catch 的 unavailable 降级分支（确定性触发，
    // 不依赖「恰好真实源不可用」的偶发条件）。
    setFetch(vi.fn().mockRejectedValue(new Error('network down')));
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('GET /api/ai/market-sentiment 降级 → 评分与家数均不是 0', async () => {
    const res = await request(app).get('/api/ai/market-sentiment');

    expect(res.status).toBe(200);
    expect(res.body.data.dataSource).toBe('unavailable');
    // 核心：0 会被前端渲染成「情绪极度悲观(0/100)、看涨 0 家」的真实结论
    expect(res.body.data.sentimentScore).toBeNull();
    expect(res.body.data.avgScore).toBeNull();
    expect(res.body.data.bullishCount).toBeNull();
    expect(res.body.data.bearishCount).toBeNull();
    expect(res.body.data.neutralCount).toBeNull();
    for (const k of ['sentimentScore', 'avgScore', 'bullishCount', 'bearishCount', 'neutralCount']) {
      expect(res.body.data[k], `${k} 绝不能是 0`).not.toBe(0);
    }
    // 数组类保持 []
    expect(res.body.data.topBullish).toEqual([]);
    expect(res.body.data.topBearish).toEqual([]);
    // 字符串情绪标签保留可读文案（不是数值0，无法用 0 表达不可用）
    expect(res.body.data.sentiment).toBe('数据源暂不可用');
  });

  it('GET /api/ai/alerts 降级 → total 不是 0（[] 是降级产物，非真实空集）', async () => {
    const res = await request(app).get('/api/ai/alerts');

    expect(res.body.data.dataSource).toBe('unavailable');
    expect(res.body.data.alerts).toEqual([]);
    expect(res.body.data.total).toBeNull();
    expect(res.body.data.total).not.toBe(0);
  });

  it('GET /api/ai/recommendations 降级 → confidence 不是 0', async () => {
    const res = await request(app).get('/api/ai/recommendations');

    expect(res.body.data.dataSource).toBe('unavailable');
    expect(res.body.data.stocks).toEqual([]);
    expect(res.body.data.confidence).toBeNull();
    expect(res.body.data.confidence).not.toBe(0);
  });

  it('GET /api/ai/sector-rotation 降级 → 无数值业务量，数组保持空', async () => {
    const res = await request(app).get('/api/ai/sector-rotation');

    expect(res.body.data.dataSource).toBe('unavailable');
    expect(res.body.data.sectors).toEqual([]);
    expect(res.body.data.leading).toEqual([]);
    expect(res.body.data.lagging).toEqual([]);
  });

  it('GET /api/ai/knowledge-search → confidence 不得被硬编码为 0', async () => {
    const res = await request(app).get('/api/ai/knowledge-search?q=%E8%8B%B1%E9%9B%84%E9%93%81');

    // 端点契约：顶层与 data 内 dataSource 必须一致（sendHonest 保证）
    expect(res.body.dataSource).toBe(res.body.data.dataSource);
    // knowledgeBaseAvailable 是**布尔量**，false 语义正确，不属「0 冒充不可用」范畴
    expect(typeof res.body.data.knowledgeBaseAvailable).toBe('boolean');
    // 关键：只要是降级态，confidence 就不许是 0（real 态由语料真实算出，另论）
    if (res.body.data.dataSource === 'unavailable') {
      expect(res.body.data.confidence).not.toBe(0);
    }
  });

  it('sendHonest 契约：降级时 data 内的 dataSource 与顶层一致（不得顶层 real/行级 unavailable）', async () => {
    const res = await request(app).get('/api/ai/market-sentiment');

    expect(res.body.dataSource).toBe(res.body.data.dataSource);
  });
});

// ==================== ai-market-pulse ====================

describe('P0-HONESTY2 · ai-market-pulse：市场温度不可用时 score 不是 0', () => {
  // 真实挂载点为 /api/ai（见 app.ts:254）
  const app = buildAppAt('/api/ai', aiMarketPulseRouter);

  beforeEach(() => {
    // 让 getMarketSummary / getSectorMomentumScore 抛错 → 进入外层 catch 降级
    const db = getDb();
    db.getMarketSummary = vi.fn().mockRejectedValue(new Error('db down'));
    db.getSectorMomentumScore = vi.fn().mockRejectedValue(new Error('db down'));
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('GET /api/ai/market-pulse 降级 → temperature.score 不是 0', async () => {
    const res = await request(app).get('/api/ai/market-pulse');

    expect(res.status).toBe(200);
    expect(res.body.data.dataSource).toBe('unavailable');
    // 核心：0 分在computeTemperature 的语义里对应 label '弱势'，
    // 会被下游当成「市场极度弱势」这个真实评分
    expect(res.body.data.temperature.score).not.toBe(0);
    expect(res.body.data.temperature.score).toBeNull();
    // label 保留可读文案
    expect(res.body.data.temperature.label).toBe('未知');
    // 数组类保持 []
    expect(res.body.data.themes).toEqual([]);
    expect(res.body.data.candidates).toEqual([]);
  });

  it('GET /api/ai/market-pulse 降级 → breadth/limitUp 显式为 null，不是不存在的字段', async () => {
    const res = await request(app).get('/api/ai/market-pulse');

    // 关键区别：旧实现**省略**这两个字段，前端拿到 undefined 后 React 渲染成空串，
    // 显示「上涨　/　下跌　（占比　%）」「涨停　只」这种残缺文案。
    // 显式 null 才能让前端区分「不可用」与「字段不存在」。
    expect(res.body.data).toHaveProperty('breadth');
    expect(res.body.data).toHaveProperty('limitUp');
    expect(res.body.data.breadth).toBeNull();
    expect(res.body.data.limitUp).toBeNull();
    // 同样不得退化成 0（那会是「零上涨 / 零涨停」的假业务结论）
    expect(res.body.data.limitUp).not.toBe(0);
  });
});

// ==================== alerts：均量不可得不得误触发volume_surge ====================

describe('P0-HONESTY2 · alerts：均量取不到时不得用 0冒充（否则误触发成交量告警）', () => {
  afterEach(() => {
    getAlertRules().clear();
    vi.restoreAllMocks();
  });

  /** 装一条volume_surge 规则：阈值 2倍均量 */
  function seedVolumeSurgeRule(stockId: number): void {
    getAlertRules().set(1, {
      id: 1,
      userId: 1,
      symbol: '600519',
      stockId,
      alertType: 'volume_surge',
      threshold: 2,
      isActive: true,
      isTriggered: false,
      triggerMode: 'always',
      message: '',
      createdAt: new Date().toISOString(),
      triggerCount: 0,
    });
  }

  it('均量查询抛错（上游失败）→ 不得触发 volume_surge，绝不把成交量绝对值当倍数', async () => {
    const db = getDb();
    db.getStockBySymbol = vi.fn().mockResolvedValue({ id: 1, symbol: '600519' });
    db.getLatestDailyQuote = vi.fn().mockResolvedValue({
      stockId: 1, closePrice: 100, changePercent: 1, volume: 5_000_000,
    });
    // 均量取不到 → 必须返回 null（旧实现返回 0）
    db.getDailyQuotes = vi.fn().mockRejectedValue(new Error('db down'));

    seedVolumeSurgeRule(1);
    const triggered = await checkAlerts();

    // 旧实现：avgVolume=0 → actualValue=volume(5000000) >= 2 → 必然误触发
    expect(triggered).toHaveLength(0);
    expect(getAlertRules().get(1)!.isTriggered).toBe(false);
  });

  it('均量查询返回空数组（窗口内无行情）→ 同样不得触发', async () => {
    const db = getDb();
    db.getStockBySymbol = vi.fn().mockResolvedValue({ id: 1, symbol: '600519' });
    db.getLatestDailyQuote = vi.fn().mockResolvedValue({
      stockId: 1, closePrice: 100, changePercent: 1, volume: 5_000_000,
    });
    db.getDailyQuotes = vi.fn().mockResolvedValue([]);

    seedVolumeSurgeRule(1);
    const triggered = await checkAlerts();

    expect(triggered).toHaveLength(0);
    expect(getAlertRules().get(1)!.isTriggered).toBe(false);
  });

  it('均量真实可得且确实超过阈值 → 正常触发（证明不是把告警整体阉掉）', async () => {
    const db = getDb();
    db.getStockBySymbol = vi.fn().mockResolvedValue({ id: 1, symbol: '600519' });
    db.getLatestDailyQuote = vi.fn().mockResolvedValue({
      stockId: 1, closePrice: 100, changePercent: 1, volume: 5_000_000,
    });
    // 均量 100 万 → 5,000,000 / 1,000,000 = 5倍 ≥ 2倍 → 应触发
    db.getDailyQuotes = vi.fn().mockResolvedValue([
      { stockId: 1, volume: 1_000_000, closePrice: 99 },
      { stockId: 1, volume: 1_000_000, closePrice: 100 },
    ]);

    seedVolumeSurgeRule(1);
    const triggered = await checkAlerts();

    expect(triggered).toHaveLength(1);
    expect(triggered[0].triggeredValue).toBeCloseTo(5, 5);
  });

  it('均量真实为 0（真的零成交）→ 属合法真实值，但倍数无法计算，同样不触发', async () => {
    const db = getDb();
    db.getStockBySymbol = vi.fn().mockResolvedValue({ id: 1, symbol: '600519' });
    db.getLatestDailyQuote = vi.fn().mockResolvedValue({
      stockId: 1, closePrice: 100, changePercent: 1, volume: 0,
    });
    db.getDailyQuotes = vi.fn().mockResolvedValue([
      { stockId: 1, volume: 0, closePrice: 99 },
      { stockId: 1, volume: 0, closePrice: 100 },
    ]);

    seedVolumeSurgeRule(1);
    const triggered = await checkAlerts();

    // 均量=0 是真实值，但 x/0 无法计算 → 不触发（而非 Infinity 触发）
    expect(triggered).toHaveLength(0);
  });
});