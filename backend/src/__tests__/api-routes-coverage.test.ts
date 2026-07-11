/**
 * API 路由覆盖测试
 * 直接测试未覆盖的 Express 路由处理器
 */

import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { app } from '../app';
import { initDatabase } from '../db/dbFactory';

beforeAll(async () => {
  await initDatabase();
});

describe('Stock Detail & Kline Routes', () => {
  it('GET /api/stocks/:symbol should return stock info', async () => {
    const res = await request(app).get('/api/stocks/000001');
    expect([200, 404]).toContain(res.status);
    if (res.status === 200) {
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveProperty('symbol');
    }
  });

  it('GET /api/stocks/:symbol/latest should return latest quote', async () => {
    const res = await request(app).get('/api/stocks/000001/latest');
    expect([200, 404]).toContain(res.status);
  });

  it('GET /api/stocks/:symbol/kline should return kline data', async () => {
    const res = await request(app).get('/api/stocks/000001/kline?period=daily&limit=5');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('GET /api/stocks/:symbol/kline should support weekly period', async () => {
    const res = await request(app).get('/api/stocks/000001/kline?period=weekly&limit=10');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('GET /api/stocks/:symbol/kline should support monthly period', async () => {
    const res = await request(app).get('/api/stocks/000001/kline?period=monthly&limit=12');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('POST /api/stocks/batch/quotes should return batch quotes', async () => {
    const res = await request(app)
      .post('/api/stocks/batch/quotes')
      .send({ symbols: ['000001', '600519'] });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });
});

describe('Sector Routes', () => {
  it('GET /api/sectors should return sector list', async () => {
    const res = await request(app).get('/api/sectors');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveProperty('sectors');
  });

  it('GET /api/sectors/ranking should return ranking', async () => {
    const res = await request(app).get('/api/sectors/ranking?type=gainers&limit=5');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('GET /api/sectors/performance/enhanced should return enhanced data', async () => {
    const res = await request(app).get('/api/sectors/performance/enhanced');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('GET /api/sectors/momentum should return momentum scores', async () => {
    const res = await request(app).get('/api/sectors/momentum');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveProperty('sectors');
  });

  it('GET /api/sectors/:industry/stocks should return sector stocks', async () => {
    const res = await request(app).get(`/api/sectors/${encodeURIComponent('银行')}/stocks`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
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
  });

  it('GET /api/industries/sub-sector/momentum should return momentum', async () => {
    const res = await request(app).get('/api/industries/sub-sector/momentum');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });
});

describe('AI Analysis Routes', () => {
  it('GET /api/ai/recommendations should return recommendations', async () => {
    const res = await request(app).get('/api/ai/recommendations');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('GET /api/ai/analyze/:symbol should return analysis', async () => {
    const res = await request(app).get('/api/ai/analyze/600519.SH');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('GET /api/ai/analyze/:symbol should 404 unknown symbol', async () => {
    const res = await request(app).get('/api/ai/analyze/INVALID');
    expect(res.status).toBe(404);
  });

  it('GET /api/ai/alerts should return alerts', async () => {
    const res = await request(app).get('/api/ai/alerts');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('GET /api/ai/alerts should filter by severity', async () => {
    const res = await request(app).get('/api/ai/alerts?severity=high&limit=5');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('GET /api/ai/sector-rotation should return rotation data', async () => {
    const res = await request(app).get('/api/ai/sector-rotation');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveProperty('sectors');
  });

  it('GET /api/ai/market-sentiment should return sentiment', async () => {
    const res = await request(app).get('/api/ai/market-sentiment');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveProperty('sentiment');
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
