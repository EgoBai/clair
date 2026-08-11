/**
 * ETF API 测试（诚实数据版）
 *
 * 约定（与 marketBreadth.test.ts 对齐）：
 * - mock etfDataService，验证路由层在真实源可用 / 不可用两种情况下的响应结构。
 * - 真实源可用 → dataSource:'real'，返回真实结构数据。
 * - 真实源不可用 → dataSource:'unavailable'，返回诚实空（[] / null），绝不回填模拟。
 * - 全程不调用 Math.random（避免回归到旧版净值模拟）。
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

// 必须在 import 路由/service 之前 mock，vi.mock 会被 hoist
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

import request from 'supertest';
import express from 'express';
import etfRouter from '../api/etf';
import { getEtfList, getEtfDetail, getEtfNavHistory, EtfUnavailableError } from '../services/etfDataService';

// 构造一个最小的真实结构 ETF item（字段与生产保持一致）
const realEtfItem = {
  symbol: '510300',
  name: '沪深300ETF',
  type: 'index',
  benchmark: '沪深300',
  nav: 4.7258,
  preNav: 4.7633,
  changePercent: -0.65,
  premiumRate: 0.05,
  totalAssets: 117543694897,
  trackingError: 0.03,
  dividendYield: 2.1,
  expenseRatio: 0.15,
  volume: 2541400132,
  turnover: 12015739824.096,
  holdings: 300,
};

const realNavHistory = {
  symbol: '510300',
  name: '沪深300ETF',
  history: [
    { date: '2026-08-11', nav: 4.7258, accNav: 4.7258, changePercent: -0.79 },
    { date: '2026-08-08', nav: 4.7633, accNav: 4.7633, changePercent: 0.12 },
  ],
};

function buildApp(): express.Express {
  const app = express();
  app.use(express.json());
  app.use('/api/etf', etfRouter);
  return app;
}

describe('ETF API (honest-data)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('GET /api/etf/list', () => {
    it('真实源可用时返回 dataSource:"real" 与真实结构数据', async () => {
      (getEtfList as any).mockResolvedValue([realEtfItem]);

      const res = await request(buildApp()).get('/api/etf/list');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.dataSource).toBe('real');
      expect(res.body.data.count).toBe(1);
      expect(Array.isArray(res.body.data.data)).toBe(true);
      expect(res.body.data.data[0]).toMatchObject({
        symbol: '510300',
        name: '沪深300ETF',
        nav: 4.7258,
        changePercent: -0.65,
      });
      // 不含 Math.random 伪造字段
      expect(res.body.data.data[0]).not.toHaveProperty('mockRandom');
    });

    it('真实源缺失时返回 dataSource:"unavailable" 与诚实空数组', async () => {
      (getEtfList as any).mockRejectedValue(new EtfUnavailableError('网络受限'));

      const res = await request(buildApp()).get('/api/etf/list');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.dataSource).toBe('unavailable');
      expect(res.body.data.data).toEqual([]);
      expect(res.body.data.count).toBe(0);
      expect(res.body.data.message).toBe('网络受限');
    });

    it('支持 type 筛选与 sortBy 排序', async () => {
      (getEtfList as any).mockResolvedValue([
        realEtfItem,
        { ...realEtfItem, symbol: '518880', name: '黄金ETF', type: 'commodity', totalAssets: 5e10 },
      ]);

      const res = await request(buildApp()).get('/api/etf/list?type=index&sortBy=totalAssets&sortOrder=desc');

      expect(res.status).toBe(200);
      expect(res.body.data.dataSource).toBe('real');
      // 只保留 type=index 的项
      expect(res.body.data.data.every((e: any) => e.type === 'index')).toBe(true);
      expect(getEtfList).toHaveBeenCalledTimes(1);
    });
  });

  describe('GET /api/etf/premium/rank', () => {
    it('真实源可用时返回 premium/discount 两组', async () => {
      (getEtfList as any).mockResolvedValue([
        { ...realEtfItem, premiumRate: 2.5 },
        { ...realEtfItem, premiumRate: -1.5 },
      ]);

      const res = await request(buildApp()).get('/api/etf/premium/rank');

      expect(res.status).toBe(200);
      expect(res.body.data.dataSource).toBe('real');
      expect(res.body.data.data).toHaveProperty('premium');
      expect(res.body.data.data).toHaveProperty('discount');
      expect(Array.isArray(res.body.data.data.premium)).toBe(true);
    });

    it('真实源缺失时返回空 premium/discount + unavailable', async () => {
      (getEtfList as any).mockRejectedValue(new EtfUnavailableError());

      const res = await request(buildApp()).get('/api/etf/premium/rank');

      expect(res.status).toBe(200);
      expect(res.body.data.dataSource).toBe('unavailable');
      expect(res.body.data.data.premium).toEqual([]);
      expect(res.body.data.data.discount).toEqual([]);
    });
  });

  describe('GET /api/etf/:symbol', () => {
    it('真实源可用时返回详情 + topHoldings 诚实空数组', async () => {
      (getEtfDetail as any).mockResolvedValue(realEtfItem);

      const res = await request(buildApp()).get('/api/etf/510300');

      expect(res.status).toBe(200);
      expect(res.body.data.dataSource).toBe('real');
      expect(res.body.data.data.symbol).toBe('510300');
      expect(res.body.data.data.nav).toBe(4.7258);
      // topHoldings 无真实源 → 诚实空，不编造持仓
      expect(res.body.data.data.topHoldings).toEqual([]);
    });

    it('symbol 不在目录时返回 404', async () => {
      (getEtfDetail as any).mockResolvedValue(null);

      const res = await request(buildApp()).get('/api/etf/000000');

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
    });

    it('真实源缺失时返回 unavailable + data:null', async () => {
      (getEtfDetail as any).mockRejectedValue(new EtfUnavailableError('行情源不可用'));

      const res = await request(buildApp()).get('/api/etf/510300');

      expect(res.status).toBe(200);
      expect(res.body.data.dataSource).toBe('unavailable');
      expect(res.body.data.data).toBeNull();
      expect(res.body.data.message).toBe('行情源不可用');
    });
  });

  describe('GET /api/etf/:symbol/nav-history', () => {
    it('真实源可用时返回真实净值历史（非 Math.random 模拟）', async () => {
      (getEtfNavHistory as any).mockResolvedValue(realNavHistory);

      const res = await request(buildApp()).get('/api/etf/510300/nav-history?days=30');

      expect(res.status).toBe(200);
      expect(res.body.data.dataSource).toBe('real');
      expect(res.body.data.data.symbol).toBe('510300');
      expect(Array.isArray(res.body.data.data.history)).toBe(true);
      expect(res.body.data.data.history[0]).toMatchObject({
        date: '2026-08-11',
        nav: 4.7258,
      });
      // 净值应为固定真实值，不应每次调用都变化（即非 Math.random）
      const res2 = await request(buildApp()).get('/api/etf/510300/nav-history?days=30');
      expect(res2.body.data.data.history[0].nav).toBe(res.body.data.data.history[0].nav);
    });

    it('真实源缺失时返回 unavailable + 空 history', async () => {
      (getEtfNavHistory as any).mockRejectedValue(new EtfUnavailableError('净值源不可用'));

      const res = await request(buildApp()).get('/api/etf/510300/nav-history');

      expect(res.status).toBe(200);
      expect(res.body.data.dataSource).toBe('unavailable');
      expect(res.body.data.data.history).toEqual([]);
      expect(res.body.data.message).toBe('净值源不可用');
    });

    it('symbol 不在目录时返回 404', async () => {
      (getEtfNavHistory as any).mockResolvedValue(null);

      const res = await request(buildApp()).get('/api/etf/000000/nav-history');

      expect(res.status).toBe(404);
    });
  });

  describe('Math.random 回归守卫', () => {
    it('整个 ETF 路由响应中不应出现 Math.random 伪造的随机净值', async () => {
      // 监视 Math.random，确保路由处理过程中未被调用
      const spy = vi.spyOn(Math, 'random');
      (getEtfList as any).mockResolvedValue([realEtfItem]);
      (getEtfDetail as any).mockResolvedValue(realEtfItem);
      (getEtfNavHistory as any).mockResolvedValue(realNavHistory);

      const app = buildApp();
      await request(app).get('/api/etf/list');
      await request(app).get('/api/etf/510300');
      await request(app).get('/api/etf/510300/nav-history');

      expect(spy).not.toHaveBeenCalled();
      spy.mockRestore();
    });
  });
});
