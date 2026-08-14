/**
 * 历史 K 线数据服务 / 路由 测试（诚实数据版）
 *
 * 约定：K 线数据只来自真实源（东方财富 push2his kline 接口），
 * 绝不包含任何 Math.random / 硬编码假 K 线。
 * - 真实源可用时返回真实 OHLCV 数组；
 * - 真实源失败 / 参数非法时降级为 dataSource:'unavailable' + 诚实空。
 *
 * 策略：mock global.fetch，无需真实外网即可跑绿。
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import request from 'supertest';
import express from 'express';
import marketRouter from '../api/market';
import { queryCache } from '../utils/queryCache';
import {
  getKline,
  KlineUnavailableError,
  normalizeSecid,
  MAX_KLINE_DAYS,
} from '../services/klineDataService';

function setFetch(fn: unknown): void {
  (global as any).fetch = fn;
}

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/market', marketRouter);
  return app;
}

// 样例：东财 push2his kline 真实返回结构（date,open,close,high,low,volume(手),amount）
const sampleKlines = {
  data: {
    code: '600519',
    market: 1,
    name: '贵州茅台',
    klines: [
      '2026-08-10,1680.00,1700.00,1705.00,1675.00,35000,588175000',
      '2026-08-11,1701.00,1690.00,1710.00,1688.00,20000,338000000',
      '2026-08-12,1692.00,1712.50,1715.00,1690.00,28000,479500000',
    ],
  },
};

// 乱序样例（验证排序为日期升序）
const unsortedKlines = {
  data: {
    klines: [
      '2026-08-12,1692.00,1712.50,1715.00,1690.00,28000,479500000',
      '2026-08-10,1680.00,1700.00,1705.00,1675.00,35000,588175000',
      '2026-08-11,1701.00,1690.00,1710.00,1688.00,20000,338000000',
    ],
  },
};

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

describe('klineDataService (honest-data)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('(a) 样例 klines 解析映射正确', () => {
    it('将东财 klines 字符串行映射为等长 OHLCV 数组', async () => {
      setFetch(mockFetchOnce(sampleKlines));
      const data = await getKline('600519', 250);

      expect(data.symbol).toBe('600519');
      expect(data.dates).toEqual(['2026-08-10', '2026-08-11', '2026-08-12']);
      expect(data.opens).toEqual([1680.0, 1701.0, 1692.0]);
      expect(data.prices).toEqual([1700.0, 1690.0, 1712.5]); // 收盘价 = f53
      expect(data.highs).toEqual([1705.0, 1710.0, 1715.0]);
      expect(data.lows).toEqual([1675.0, 1688.0, 1690.0]);
      // 成交量：东财单位为手，×100 换算为股
      expect(data.volumes).toEqual([3500000, 2000000, 2800000]);
      expect(data.amounts).toEqual([588175000, 338000000, 479500000]);

      // 数组等长
      const len = data.dates.length;
      for (const arr of [data.opens, data.highs, data.lows, data.prices, data.volumes, data.amounts]) {
        expect(arr).toHaveLength(len);
      }
    });

    it('乱序返回时排序为日期升序', async () => {
      setFetch(mockFetchOnce(unsortedKlines));
      const data = await getKline('600519', 250);
      expect(data.dates).toEqual(['2026-08-10', '2026-08-11', '2026-08-12']);
      expect(data.prices).toEqual([1700.0, 1690.0, 1712.5]);
    });
  });

  describe('(b) 源不可达 → 抛 KlineUnavailableError → 路由诚实空', () => {
    it('HTTP 非 2xx 时抛出 UnavailableError', async () => {
      setFetch(mockFetchOnce({}, { ok: false, status: 503 }));
      await expect(getKline('600519')).rejects.toBeInstanceOf(KlineUnavailableError);
    });

    it('fetch 抛异常（网络不可达）时抛出 UnavailableError', async () => {
      setFetch(vi.fn().mockRejectedValue(new Error('network down')));
      await expect(getKline('600519')).rejects.toBeInstanceOf(KlineUnavailableError);
    });

    it('返回结构异常（data.klines 缺失）时抛出 UnavailableError', async () => {
      setFetch(mockFetchOnce({ data: null }));
      await expect(getKline('600519')).rejects.toBeInstanceOf(KlineUnavailableError);
    });

    it('klines 为空数组时抛出 UnavailableError', async () => {
      setFetch(mockFetchOnce({ data: { klines: [] } }));
      await expect(getKline('600519')).rejects.toBeInstanceOf(KlineUnavailableError);
    });

    it('路由层：源失败时降级为诚实空（dataSource:unavailable，HTTP 200）', async () => {
      setFetch(vi.fn().mockRejectedValue(new Error('network down')));
      const app = buildApp();
      const res = await request(app).get('/api/market/kline?symbol=600519&days=250');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.dataSource).toBe('unavailable');
      expect(res.body.data.symbol).toBe('600519');
      expect(res.body.data.dates).toEqual([]);
      expect(res.body.data.prices).toEqual([]);
      expect(res.body.data.volumes).toEqual([]);
      expect(typeof res.body.data.message).toBe('string');
    });

    it('路由层：非法 symbol 时降级为诚实空（不抛 500）', async () => {
      const app = buildApp();
      const res = await request(app).get('/api/market/kline?symbol=abc');

      expect(res.status).toBe(200);
      expect(res.body.data.dataSource).toBe('unavailable');
      expect(res.body.data.dates).toEqual([]);
    });
  });

  describe('(c) symbol 归一化为东财 secid', () => {
    it('600519.SH / SH600519 / 600519 → secid 1.600519（上交所）', () => {
      expect(normalizeSecid('600519.SH')).toEqual({ digits: '600519', secid: '1.600519' });
      expect(normalizeSecid('SH600519')).toEqual({ digits: '600519', secid: '1.600519' });
      expect(normalizeSecid('600519')).toEqual({ digits: '600519', secid: '1.600519' });
    });

    it('000001 / 000001.SZ / SZ000001 → secid 0.000001（深交所）', () => {
      expect(normalizeSecid('000001')).toEqual({ digits: '000001', secid: '0.000001' });
      expect(normalizeSecid('000001.SZ')).toEqual({ digits: '000001', secid: '0.000001' });
      expect(normalizeSecid('sz000001')).toEqual({ digits: '000001', secid: '0.000001' });
    });

    it('300xxx / 200xxx 创业板与深 B 也归深交所', () => {
      expect(normalizeSecid('300750')!.secid).toBe('0.300750');
      expect(normalizeSecid('200002')!.secid).toBe('0.200002');
    });

    it('非法代码返回 null', () => {
      expect(normalizeSecid('abc')).toBeNull();
      expect(normalizeSecid('')).toBeNull();
      expect(normalizeSecid('12345')).toBeNull();
    });

    it('getKline 请求 URL 使用正确的 secid 与 klt/fqt 参数', async () => {
      const fetchMock = mockFetchOnce(sampleKlines);
      setFetch(fetchMock);
      await getKline('600519.SH', 250);
      const url = (fetchMock.mock.calls[0] as any[])[0] as string;
      expect(url).toContain('secid=1.600519');
      expect(url).toContain('klt=101');
      expect(url).toContain('fqt=1');
      expect(url).toContain('push2his.eastmoney.com');
    });
  });

  describe('(d) days 上限截断', () => {
    it('days 超过上限 800 时截断为 800', async () => {
      const fetchMock = mockFetchOnce(sampleKlines);
      setFetch(fetchMock);
      await getKline('600519', 99999);
      const url = (fetchMock.mock.calls[0] as any[])[0] as string;
      expect(url).toContain(`lmt=${MAX_KLINE_DAYS}`);
      expect(MAX_KLINE_DAYS).toBe(800);
    });

    it('days 缺省 / 非法时回退默认 250', async () => {
      const fetchMock = mockFetchOnce(sampleKlines);
      setFetch(fetchMock);
      await getKline('600519', NaN);
      const url = (fetchMock.mock.calls[0] as any[])[0] as string;
      expect(url).toContain('lmt=250');
    });
  });

  describe('路由层：真实源可用路径', () => {
    beforeEach(() => {
      queryCache.invalidate('market:kline');
    });

    it('GET /api/market/kline 返回 dataSource:real + 完整 OHLCV', async () => {
      setFetch(mockFetchOnce(sampleKlines));
      const app = buildApp();
      const res = await request(app).get('/api/market/kline?symbol=600519&days=250');

      expect(res.status).toBe(200);
      expect(res.body.data.dataSource).toBe('real');
      expect(res.body.data.symbol).toBe('600519');
      expect(res.body.data.dates).toHaveLength(3);
      expect(res.body.data.prices).toEqual([1700.0, 1690.0, 1712.5]);
    });

    it('诚实红线回归：无任何随机 / 硬编码假 K 线字段', async () => {
      setFetch(mockFetchOnce(sampleKlines));
      const app = buildApp();
      const res = await request(app).get('/api/market/kline?symbol=600519');
      const json = JSON.stringify(res.body);
      expect(json.includes('mock')).toBe(false);
      expect(json.includes('demo')).toBe(false);
      expect(json.includes('random')).toBe(false);
    });
  });
});
