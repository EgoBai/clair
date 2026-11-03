/**
 * #107-C7 · /api/market/realtime 不得在 breadth 缺失时仍标 dataSource:'real'
 *
 * 缺陷（2026-11-04 本地 :3001 与线上 clair-api-ryng 双端实测复现）：
 *   getRealMarketData() 的契约是「三大指数必返回（失败直接抛）+ 涨跌分布可选（失败为 null）」，
 *   但路由层无条件 sendHonest(res, 'real', ...)，于是 breadth:null 的响应仍带 dataSource:'real'。
 *   下游看到 'real' 会把「涨跌家数/成交额/涨跌停都不可用」的整包当真实数据消费。
 *
 * 本测试锁定三态语义（与项目既有枚举一致，不新造取值）：
 *   - 指数 + 广度都拿到        → 'real'
 *   - 指数拿到、广度缺失(null) → 'partial' + unavailableReason（说明缺的是哪一段）
 *   - 指数源失败（抛错）       → 'unavailable'
 *
 * 必须 import 真路由模块（../api/market），只 mock 上游服务，不自抄响应常量。
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../services/realMarketData', () => ({
  getRealMarketData: vi.fn(),
}));

import request from 'supertest';
import express from 'express';
import marketRouter from '../api/market';
import { getRealMarketData } from '../services/realMarketData';

/** 真实结构：三大指数 + 完整涨跌分布（字段形状对齐 services/realMarketData.ts） */
const realIndices = {
  shanghai: { name: '上证指数', price: 3608.1, changePct: -0.82 },
  shenzhen: { name: '深证成指', price: 10876.99, changePct: -1.21 },
  chinext: { name: '创业板指', price: 2391.65, changePct: -2.73 },
};

const realBreadth = {
  up: 2008,
  down: 3026,
  flat: 120,
  limitUp: 51,
  limitDown: 22,
  turnoverYi: 12345.6,
  upVolume: 1e12,
  downVolume: 1.2e12,
  volumeRatio: 0.833,
};

function buildApp(): express.Express {
  const app = express();
  app.use(express.json());
  // 与 app.ts:209 的真实挂载点一致
  app.use('/api/market', marketRouter);
  return app;
}

describe('#107-C7 · /api/market/realtime：breadth 缺失不得标 real', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('指数真实、广度缺失（breadth=null）→ dataSource 必须是 partial，且如实给出 unavailableReason', async () => {
    (getRealMarketData as any).mockResolvedValue({ ...realIndices, breadth: null });

    const res = await request(buildApp()).get('/api/market/realtime');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    // 核心断言：不得把「部分数据缺失」标成 real
    expect(res.body.dataSource).not.toBe('real');
    expect(res.body.dataSource).toBe('partial');
    // 顶层与 data 内同源，不得两级矛盾
    expect(res.body.data.dataSource).toBe('partial');
    // breadth 如实为 null（不得被填 0 冒充）
    expect(res.body.data.breadth).toBeNull();
    // 指数仍是真实值（不得因为广度缺失把整包降成 unavailable）
    expect(res.body.data.shanghai.price).toBe(3608.1);
    // 必须能说明缺的是哪一段，而不是只给一个笼统的 partial
    const reason = String(res.body.unavailableReason ?? '');
    expect(reason).toContain('涨跌分布');
  });

  it('指数与广度都拿到 → dataSource:real，且不出现 unavailableReason', async () => {
    (getRealMarketData as any).mockResolvedValue({ ...realIndices, breadth: realBreadth });

    const res = await request(buildApp()).get('/api/market/realtime');

    expect(res.status).toBe(200);
    expect(res.body.dataSource).toBe('real');
    expect(res.body.data.dataSource).toBe('real');
    expect(res.body.data.breadth.up).toBe(2008);
    expect(res.body.unavailableReason).toBeUndefined();
  });

  it('指数源失败（getRealMarketData 抛错）→ dataSource:unavailable，不返回任何指数数值', async () => {
    (getRealMarketData as any).mockRejectedValue(new Error('指数行情解析失败或缺失三大指数'));

    const res = await request(buildApp()).get('/api/market/realtime');

    expect(res.status).toBe(200);
    expect(res.body.dataSource).toBe('unavailable');
    expect(res.body.data.dataSource).toBe('unavailable');
    expect(res.body.data.shanghai).toBeUndefined();
    expect(res.body.data.breadth).toBeUndefined();
  });
});
