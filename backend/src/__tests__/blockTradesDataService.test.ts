/**
 * 大宗交易数据服务 / 路由 测试（诚实数据版）
 *
 * 约定：大宗交易不再包含任何硬编码种子 / Math.random 伪造数据。
 * - 真实源（东方财富大宗交易接口）可用时返回真实记录；
 * - 真实源失败时降级为 dataSource:'unavailable' + 诚实空；
 * - 绝不 fallback 到随机编造的营业部 / 价格 / 行业。
 *
 * 策略：mock global.fetch（返回样例真实 JSON / 抛错），无需真实外网即可跑绿。
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import request from 'supertest';
import express from 'express';
import blockTradesRouter from '../api/block-trades';
import { queryCache } from '../utils/queryCache';
import {
  getBlockTrades,
  BlockTradesUnavailableError,
  normalizeSymbol,
} from '../services/blockTradesDataService';

function setFetch(fn: unknown): void {
  (global as any).fetch = fn;
}

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/api', blockTradesRouter);
  return app;
}

// 样例：东方财富大宗交易真实接口返回结构（result.data 数组）
const sampleRawRows = [
  {
    SECURITY_CODE: '600519',
    SECURITY_NAME_ABBR: '贵州茅台',
    TRADE_DATE: '2026-08-12 00:00:00',
    TRADE_PRICE: 1680.5,
    CLOSE_PRICE: 1700.0,
    TRADE_VOLUME: 35000,
    TRADE_AMOUNT: 58817500,
    BUYER_NAME: '中信证券上海分公司',
    SELLER_NAME: '机构专用',
    DISCOUNT: -1.15,
  },
  {
    SECURITY_CODE: '000858',
    SECURITY_NAME_ABBR: '五粮液',
    TRADE_DATE: '2026-08-12 00:00:00',
    TRADE_PRICE: 142.3,
    CLOSE_PRICE: 145.0,
    TRADE_VOLUME: 120000,
    TRADE_AMOUNT: 17076000,
    BUYER_NAME: '机构专用',
    SELLER_NAME: '华泰证券深圳益田路',
    DISCOUNT: 1.8,
  },
  {
    SECURITY_CODE: '600519',
    SECURITY_NAME_ABBR: '贵州茅台',
    TRADE_DATE: '2026-08-12 00:00:00',
    TRADE_PRICE: 1690.0,
    CLOSE_PRICE: 1700.0,
    TRADE_VOLUME: 20000,
    TRADE_AMOUNT: 33800000,
    BUYER_NAME: '中金公司上海分公司',
    SELLER_NAME: '机构专用',
    DISCOUNT: -0.59,
  },
];

function mockFetchOnce(body: unknown, init?: { ok?: boolean; status?: number }) {
  const ok = init?.ok ?? true;
  const status = init?.status ?? 200;
  const resp = {
    ok,
    status,
    json: () => Promise.resolve(body),
  } as Response;
  return vi.fn().mockResolvedValue(resp);
}

describe('blockTradesDataService (honest-data)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('(a) 真实记录映射正确', () => {
    it('将东方财富返回行映射为标准 BlockTrade', async () => {
      setFetch(mockFetchOnce({ success: true, result: { data: sampleRawRows } }));
      const trades = await getBlockTrades('2026-08-12');

      expect(trades).toHaveLength(3);
      const maotai = trades.find((t) => t.symbol === '600519');
      expect(maotai).toBeDefined();
      expect(maotai!.name).toBe('贵州茅台');
      expect(maotai!.tradeDate).toBe('2026-08-12');
      expect(maotai!.price).toBe(1680.5);
      expect(maotai!.closePrice).toBe(1700.0);
      expect(maotai!.volume).toBe(35000);
      expect(maotai!.amount).toBe(58817500);
      expect(maotai!.discount).toBe(-1.15);
      expect(maotai!.buyer).toBe('中信证券上海分公司');
      expect(maotai!.seller).toBe('机构专用');
    });

    it('兼容 SECUCODE / SECUNAME 命名（兜底）', async () => {
      setFetch(mockFetchOnce({
        success: true,
        result: {
          data: [
            {
              SECUCODE: '000001.SZ',
              SECUNAME: '平安银行',
              TRADE_DATE: '2026-08-12 00:00:00',
              TRADE_PRICE: 11.2,
              CLOSE_PRICE: 11.5,
              TRADE_VOLUME: 50000,
              TRADE_AMOUNT: 560000,
              BUYER_NAME: '机构专用',
              SELLER_NAME: '机构专用',
              DISCOUNT: -2.6,
            },
          ],
        },
      }));
      const trades = await getBlockTrades('2026-08-12', '000001');
      expect(trades[0].symbol).toBe('000001');
      expect(trades[0].name).toBe('平安银行');
    });

    it('当日真实源确无记录时诚实返回空数组（非错误）', async () => {
      setFetch(mockFetchOnce({ success: true, result: { data: [] } }));
      const trades = await getBlockTrades('2026-08-12');
      expect(trades).toEqual([]);
    });
  });

  describe('(b) 源不可达 → 抛 BlockTradesUnavailableError', () => {
    it('HTTP 非 2xx 时抛出 UnavailableError', async () => {
      setFetch(mockFetchOnce({}, { ok: false, status: 503 }));
      await expect(getBlockTrades('2026-08-12')).rejects.toBeInstanceOf(BlockTradesUnavailableError);
    });

    it('source 显式返回 success:false 时抛出 UnavailableError', async () => {
      setFetch(mockFetchOnce({ success: false, result: null, message: '报表配置不存在' }));
      await expect(getBlockTrades('2026-08-12')).rejects.toBeInstanceOf(BlockTradesUnavailableError);
    });

    it('返回结构异常（result 缺失）时抛出 UnavailableError', async () => {
      setFetch(mockFetchOnce({ success: true }));
      await expect(getBlockTrades('2026-08-12')).rejects.toBeInstanceOf(BlockTradesUnavailableError);
    });

    it('fetch 抛异常（网络不可达）时抛出 UnavailableError', async () => {
      setFetch(vi.fn().mockRejectedValue(new Error('network down')));
      await expect(getBlockTrades('2026-08-12')).rejects.toBeInstanceOf(BlockTradesUnavailableError);
    });
  });

  describe('(c) symbol 过滤生效', () => {
    it('传入 symbol 时仅返回该股票记录', async () => {
      setFetch(mockFetchOnce({ success: true, result: { data: sampleRawRows } }));
      const trades = await getBlockTrades('2026-08-12', '600519');
      expect(trades.length).toBe(2);
      expect(trades.every((t) => t.symbol === '600519')).toBe(true);
    });

    it('传入带市场后缀的 symbol 也能正确归一化过滤', async () => {
      setFetch(mockFetchOnce({ success: true, result: { data: sampleRawRows } }));
      const trades = await getBlockTrades('2026-08-12', '600519.SH');
      expect(trades.length).toBe(2);
      expect(trades.every((t) => t.symbol === '600519')).toBe(true);
    });

    it('normalizeSymbol 正确归一化各市场代码', () => {
      expect(normalizeSymbol('600519')?.digits).toBe('600519');
      expect(normalizeSymbol('SH600519')?.digits).toBe('600519');
      expect(normalizeSymbol('000001.SZ')?.digits).toBe('000001');
      expect(normalizeSymbol('abc')).toBeNull();
    });
  });
});

describe('Block-trades API routes (honest-data)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // queryCache 为模块级单例，跨测试保留；路由级缓存键需清理以免干扰降级路径
    queryCache.invalidate('block-trades');
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('GET /api/block-trades 真实源可用时返回真实记录 + 汇总', async () => {
    setFetch(mockFetchOnce({ success: true, result: { data: sampleRawRows } }));
    const app = buildApp();
    const res = await request(app).get('/api/block-trades?date=2026-08-12');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.dataSource).toBe('realtime');
    expect(res.body.data.trades).toHaveLength(3);
    expect(res.body.data.summary.totalAmount).toBe(58817500 + 17076000 + 33800000);
    expect(res.body.data.summary.premiumCount).toBe(1); // 五粮液 +1.8
    expect(res.body.data.summary.discountCount).toBe(2); // 茅台两条均为负
  });

  it('GET /api/block-trades 源失败时降级为诚实空（dataSource:unavailable）', async () => {
    setFetch(vi.fn().mockRejectedValue(new Error('network down')));
    const app = buildApp();
    const res = await request(app).get('/api/block-trades?date=2026-08-12');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.dataSource).toBe('unavailable');
    expect(res.body.data.trades).toEqual([]);
    expect(res.body.data.summary.totalAmount).toBe(0);
    // 关键：绝不回填伪造 / 随机记录
    expect(JSON.stringify(res.body).includes('营业部')).toBe(false);
  });

  it('GET /api/block-trades/overview 真实源可用时聚合真实数据', async () => {
    setFetch(mockFetchOnce({ success: true, result: { data: sampleRawRows } }));
    const app = buildApp();
    const res = await request(app).get('/api/block-trades/overview');

    expect(res.status).toBe(200);
    expect(res.body.data.dataSource).toBe('realtime');
    expect(res.body.data.totalTrades).toBe(3);
    // topBuyers 基于真实记录按买方聚合：机构专用作为买方出现 1 次（其余为卖方，不计入）
    const org = res.body.data.topBuyers.find((b: any) => b.name === '机构专用');
    expect(org.count).toBe(1);
    // 三个不同买方，合计出现次数应等于 3
    const buyerSum = res.body.data.topBuyers.reduce((s: number, b: any) => s + b.count, 0);
    expect(buyerSum).toBe(3);
    // 行业分布诚实返回空（无法从真实源推导）
    expect(res.body.data.industryDistribution).toEqual([]);
  });

  it('GET /api/block-trades/overview 源失败时降级为诚实空', async () => {
    setFetch(vi.fn().mockRejectedValue(new Error('network down')));
    const app = buildApp();
    const res = await request(app).get('/api/block-trades/overview');

    expect(res.status).toBe(200);
    expect(res.body.data.dataSource).toBe('unavailable');
    expect(res.body.data.totalTrades).toBe(0);
    expect(res.body.data.industryDistribution).toEqual([]);
  });

  it('GET /api/block-trades/:symbol 真实源可用时返回个股历史', async () => {
    setFetch(mockFetchOnce({ success: true, result: { data: sampleRawRows } }));
    const app = buildApp();
    const res = await request(app).get('/api/block-trades/600519?days=30');

    expect(res.status).toBe(200);
    expect(res.body.data.dataSource).toBe('realtime');
    expect(res.body.data.symbol).toBe('600519');
    expect(res.body.data.trades.length).toBeGreaterThanOrEqual(2);
    expect(res.body.data.trades.every((t: any) => t.symbol === '600519')).toBe(true);
  });

  it('GET /api/block-trades/:symbol 源失败时降级为诚实空', async () => {
    setFetch(vi.fn().mockRejectedValue(new Error('network down')));
    const app = buildApp();
    const res = await request(app).get('/api/block-trades/600519?days=30');

    expect(res.status).toBe(200);
    expect(res.body.data.dataSource).toBe('unavailable');
    expect(res.body.data.trades).toEqual([]);
    expect(res.body.data.total).toBe(0);
  });

  it('诚实红线回归：任何路径都不返回随机编造的营业部编号', async () => {
    setFetch(mockFetchOnce({ success: true, result: { data: sampleRawRows } }));
    const app = buildApp();
    const res = await request(app).get('/api/block-trades?date=2026-08-12');
    const json = JSON.stringify(res.body);
    // 原伪造逻辑会生成 "营业部1" / "营业部2" 等随机编号
    expect(json.includes('营业部')).toBe(false);
  });
});
