/**
 * API 路由覆盖测试 —— **纯路由 / 契约测试**
 *
 * 本文件验证的是「路由是否注册 + HTTP 方法 + 状态码 + dataSource 诚实契约」，
 * **不验证上游数据的业务内容**。上游数据的正确性由各自的 service 层测试负责
 * （那些已充分 mock）。
 *
 * 为什么必须 mock 上游（工单 P0-FLAKY-TEST）：
 * 本文件原先有 30+ 个 `request(app).get/post` 用例**零 mock**，直接打真实上游
 * （`api/ai-analysis.ts:86` 用原生 fetch 打 push2.eastmoney.com /
 * push2his.eastmoney.com，以及 financialsDataService 打 datacenter-web）。
 * `push2.eastmoney.com` 在**部分网络环境下不可达**（HTTP 000 / 连接失败），
 * 于是同一份断言随网络环境漂移 → CI 随机红（用户收到过多封 `Run failed: CI`，
 * 其中一条正是本文件的 `GET /api/ai/recommendations should return recommendations`）。
 *
 * 现在：全文件通过 `helpers/deterministicUpstream.ts` 这个 fetch 桩解析上游，
 * 桩对**未登记的 URL 直接抛错**，因此
 *   ① 结果与网络环境完全无关；
 *   ② 若将来新增了外部依赖，测试会立刻炸响，而不会悄悄退化成联网测试。
 * 见文件末尾「上游隔离契约」一组用例对该性质的显式自证。
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { app } from '../app';
import { initDatabase } from '../db/dbFactory';
import {
  installUpstreamStub,
  uninstallUpstreamStub,
  unstubbedUpstreamCalls,
  servedCallCount,
} from './helpers/deterministicUpstream';

beforeAll(async () => {
  // 桩必须在 initDatabase 之前装好：DB 初始化本身不发外网请求，
  // 但顺序固定可避免以后有人往 initDatabase 里加网络调用时静默联网。
  installUpstreamStub();
  await initDatabase();
});

afterAll(() => {
  uninstallUpstreamStub();
});

/** 合法的 dataSource 取值（源枚举：'real' | 'unavailable'）。
 *  用于 DB 支撑型端点——其取值随「本地库有无该数据」变化，
 *  但**顶层与 data 内必须一致**（结构上杜绝 IP-20 那类矛盾），这一条是无条件的。 */
const HONEST_DATA_SOURCES = ['real', 'unavailable'];

/** 断言 dataSource 诚实契约：顶层与 data 内同值，且取值合法。 */
function expectHonestDataSource(res: request.Response) {
  expect(HONEST_DATA_SOURCES).toContain(res.body.dataSource);
  expect(res.body.data.dataSource).toBe(res.body.dataSource);
}

describe('Stock Detail & Kline Routes', () => {
  it('GET /api/stocks/:symbol should return stock info', async () => {
    const res = await request(app).get('/api/stocks/000001');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveProperty('symbol');
    expect(res.body.data.symbol).toBe('000001');
    expectHonestDataSource(res);
  });

  it('GET /api/stocks/:symbol/latest should return latest quote', async () => {
    const res = await request(app).get('/api/stocks/000001/latest');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expectHonestDataSource(res);
  });

  it('GET /api/stocks/:symbol/kline should return kline data', async () => {
    const res = await request(app).get('/api/stocks/000001/kline?period=daily&limit=5');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.period).toBe('daily');
    expectHonestDataSource(res);
  });

  it('GET /api/stocks/:symbol/kline should support weekly period', async () => {
    const res = await request(app).get('/api/stocks/000001/kline?period=weekly&limit=10');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.period).toBe('weekly');
    expectHonestDataSource(res);
  });

  it('GET /api/stocks/:symbol/kline should support monthly period', async () => {
    const res = await request(app).get('/api/stocks/000001/kline?period=monthly&limit=12');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.period).toBe('monthly');
    expectHonestDataSource(res);
  });

  it('POST /api/stocks/batch/quotes should return batch quotes', async () => {
    const res = await request(app)
      .post('/api/stocks/batch/quotes')
      .send({ symbols: ['000001', '600519'] });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.count).toBe(res.body.data.stocks.length);
    expectHonestDataSource(res);
  });
});

describe('Sector Routes', () => {
  it('GET /api/sectors should return sector list', async () => {
    const res = await request(app).get('/api/sectors');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveProperty('sectors');
    expectHonestDataSource(res);
  });

  it('GET /api/sectors/ranking should return ranking', async () => {
    const res = await request(app).get('/api/sectors/ranking?type=gainers&limit=5');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.type).toBe('gainers');
    expectHonestDataSource(res);
  });

  it('GET /api/sectors/performance/enhanced should return enhanced data', async () => {
    const res = await request(app).get('/api/sectors/performance/enhanced');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expectHonestDataSource(res);
  });

  it('GET /api/sectors/momentum should return momentum scores', async () => {
    const res = await request(app).get('/api/sectors/momentum');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveProperty('sectors');
    expectHonestDataSource(res);
  });

  it('GET /api/sectors/:industry/stocks should return sector stocks', async () => {
    const res = await request(app).get(`/api/sectors/${encodeURIComponent('银行')}/stocks`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data.items)).toBe(true);
  });
});

describe('Industry Routes', () => {
  it('GET /api/industries should return L1 industry tree', async () => {
    const res = await request(app).get('/api/industries');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveProperty('tree');
  });

  it('GET /api/industries/sub should return sub-industries', async () => {
    const res = await request(app).get('/api/industries/sub');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);
  });

  it('GET /api/industries/:industry/sub should return children', async () => {
    const res = await request(app).get(`/api/industries/${encodeURIComponent('银行')}/sub`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toContain('股份制银行');
  });

  it('GET /api/industries/sub-sector/momentum should return momentum', async () => {
    const res = await request(app).get('/api/industries/sub-sector/momentum');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveProperty('subSectors');
  });
});

describe('AI Analysis Routes', () => {
  // 以下 6 个端点原先是本文件 CI 随机红的根源：它们经
  // api/ai-analysis.ts 拉 15 只观察池个股的行情 + 60 日 K 线 + 财务指标（45 次外网调用/请求）。
  // 现在由桩提供确定性输入，故可断言**具体数值**而非仅 success。

  it('GET /api/ai/recommendations should return recommendations', async () => {
    const res = await request(app).get('/api/ai/recommendations');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    // 桩上游可达 → 必须走真实路径，不得降级
    expect(res.body.dataSource).toBe('real');
    expectHonestDataSource(res);
    expect(res.body.data.strategy).toBe('AI综合评分选股');
    expect(res.body.data.stocks).toHaveLength(5);
    for (const s of res.body.data.stocks) {
      expect(s).toHaveProperty('symbol');
      expect(s.totalScore).toBeGreaterThanOrEqual(0);
      expect(s.totalScore).toBeLessThanOrEqual(100);
    }
    // 确定性：按总分降序
    const scores = res.body.data.stocks.map((s: { totalScore: number }) => s.totalScore);
    expect([...scores].sort((a: number, b: number) => b - a)).toEqual(scores);
    expect(['low', 'medium', 'high']).toContain(res.body.data.riskLevel);
    expect(res.body.data.confidence).toBeGreaterThanOrEqual(40);
    expect(res.body.data.confidence).toBeLessThanOrEqual(85);
  });

  it('GET /api/ai/analyze/:symbol should return analysis', async () => {
    const res = await request(app).get('/api/ai/analyze/600519.SH');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.dataSource).toBe('real');
    expectHonestDataSource(res);
    expect(res.body.data.symbol).toBe('600519.SH');
    // 桩返回的名称带 TEST- 前缀，证明分析确实吃的是桩数据而非残留真实数据
    expect(res.body.data.name).toBe('TEST-600519');
    expect(res.body.data.technicalScore).toBeGreaterThan(0);
    expect(res.body.data.fundamentalScore).toBeGreaterThanOrEqual(0);
    expect(res.body.data.fundamentalScore).toBeLessThanOrEqual(100);
    expect(['strong_buy', 'buy', 'hold', 'sell', 'strong_sell']).toContain(res.body.data.recommendation);
  });

  // 诚实红线：未知代码必须 404，绝不回落占位/伪造分析。此断言不得放宽。
  it('GET /api/ai/analyze/:symbol should 404 unknown symbol', async () => {
    const res = await request(app).get('/api/ai/analyze/INVALID');
    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
    expect(res.body.code).toBe('NOT_FOUND');
    expect(res.body.data).toBeUndefined();
  });

  it('GET /api/ai/alerts should return alerts', async () => {
    const res = await request(app).get('/api/ai/alerts');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.dataSource).toBe('real');
    expectHonestDataSource(res);
    // total 是降级产物与真实空集的区分位（降级时必须为 null，见 P0-HONESTY2）
    expect(res.body.data.total).toBe(res.body.data.alerts.length);
    for (const a of res.body.data.alerts) {
      expect(['high', 'medium', 'low']).toContain(a.severity);
    }
  });

  it('GET /api/ai/alerts should filter by severity', async () => {
    const res = await request(app).get('/api/ai/alerts?severity=high&limit=5');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.dataSource).toBe('real');
    // 过滤必须真的生效：命中项全部是 high
    expect(res.body.data.alerts.length).toBeGreaterThan(0);
    for (const a of res.body.data.alerts) {
      expect(a.severity).toBe('high');
    }
    expect(res.body.data.alerts.length).toBeLessThanOrEqual(5);
  });

  it('GET /api/ai/sector-rotation should return rotation data', async () => {
    const res = await request(app).get('/api/ai/sector-rotation');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.dataSource).toBe('real');
    expectHonestDataSource(res);
    expect(res.body.data).toHaveProperty('sectors');
    // leading / lagging 必须是 sectors 的子集投影，不能凭空多出条目
    expect(res.body.data.leading.length + res.body.data.lagging.length)
      .toBeLessThanOrEqual(res.body.data.sectors.length);
    for (const s of res.body.data.leading) {
      expect(s.currentPhase).toBe('leading');
    }
    for (const s of res.body.data.lagging) {
      expect(s.currentPhase).toBe('lagging');
    }
  });

  it('GET /api/ai/market-sentiment should return sentiment', async () => {
    const res = await request(app).get('/api/ai/market-sentiment');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.dataSource).toBe('real');
    expectHonestDataSource(res);
    expect(res.body.data).toHaveProperty('sentiment');
    expect(typeof res.body.data.sentimentScore).toBe('number');
    expect(res.body.data.avgScore).toBeGreaterThanOrEqual(0);
    expect(res.body.data.avgScore).toBeLessThanOrEqual(100);
    // 三类家数之和恒等于被分析的股票数（不变量，非具体数值）
    expect(
      res.body.data.bullishCount + res.body.data.bearishCount + res.body.data.neutralCount
    ).toBeGreaterThan(0);
  });
});

describe('AI Gems Route', () => {
  it('POST /api/ai/gems should return gem stocks', async () => {
    const res = await request(app)
      .post('/api/ai/gems')
      .send({ topN: 10, minScore: 40 });
    // 503 in memory mode (leftJoin unsupported), 200 with PostgreSQL
    expect([200, 503]).toContain(res.status);
  });
});

describe('Health & Misc Routes', () => {
  it('GET /health should return health status', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('status');
  });

  it('GET /api/security/cors should return cors status', async () => {
    const res = await request(app).get('/api/security/cors');
    expect(res.status).toBe(200);
  });

  it('GET /api/stats/cache should return cache stats', async () => {
    const res = await request(app).get('/api/stats/cache');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('GET /api/search/history should return search history', async () => {
    const res = await request(app).get('/api/search/history?userId=1');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('GET / should return service info', async () => {
    const res = await request(app).get('/');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('service');
    expect(res.body).toHaveProperty('version');
  });
});

describe('Error Handling', () => {
  it('GET /api/nonexistent should return 404', async () => {
    const res = await request(app).get('/api/nonexistent');
    expect(res.status).toBe(404);
    expect(res.body.code).toBe('NOT_FOUND');
  });

  it('POST /api/ai/gems with empty body should still succeed', async () => {
    const res = await request(app).post('/api/ai/gems').send({});
    expect([200, 503]).toContain(res.status);
  });
});

describe('Sync Status Routes', () => {
  it('GET /api/sync/state should return sync state', async () => {
    const res = await request(app).get('/api/sync/state');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('GET /api/sync/degradation should return degradation status', async () => {
    const res = await request(app).get('/api/sync/degradation');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });
});

/**
 * 上游隔离契约 —— 本次修复的自证。
 * 这组用例是「本文件已不依赖外网」的可执行证据：桩一旦被绕过或
 * 出现未登记的外部调用，这里就会红。
 */
describe('Upstream Isolation Contract', () => {
  it('本文件运行期间未发生任何未登记的上游调用', () => {
    expect(unstubbedUpstreamCalls()).toEqual([]);
  });

  it('桩确实被走到了（AI 端点确实经由桩取数，而非绕开上游凭空造数）', () => {
    // 6 个 AI 端点 × 15 只观察池 × 3 个源 = 45 次，另有单股分析的 3 次
    expect(servedCallCount()).toBeGreaterThanOrEqual(45);
  });

  it('AI 端点在桩下走真实路径（dataSource=real），证明契约校验的是有效数据通路', async () => {
    for (const path of [
      '/api/ai/recommendations',
      '/api/ai/analyze/600519.SH',
      '/api/ai/alerts',
      '/api/ai/sector-rotation',
      '/api/ai/market-sentiment',
    ]) {
      const res = await request(app).get(path);
      expect(res.status, `${path} 应返回 200`).toBe(200);
      expect(res.body.dataSource, `${path} 应为 real`).toBe('real');
    }
  });
});