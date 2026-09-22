import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import express from 'express';
import request from 'supertest';

import topTradersRouter from '../api/topTraders';

/**
 * 龙虎榜 API 测试（真实源诚实契约）
 *
 * 说明：本文件替换了原先基于 Math.random 的「伪数据生成器」测试。
 *   原测试只是对本地假函数做自证（与真实实现无任何关系），已随 IP-18 死链清偿一并移除。
 *
 * 本测试**直接挂载 topTraders router**（不 import app.ts），mock `global.fetch`
 * 后校验四条端点与诚实降级契约。
 */

const app = express();
app.use('/api', topTradersRouter);

const ORIGINAL_FETCH = global.fetch;

function jsonResponse(body: unknown) {
  return { ok: true, json: async () => body } as unknown as Response;
}

/** 单只股票因「不同上榜原因」出现多行（东财真实行为），用于校验 totalStocks 去重 */
const DETAIL_ROWS = [
  {
    SECURITY_CODE: '000560',
    SECURITY_NAME_ABBR: '我爱我家',
    SECUCODE: '000560.SZ',
    CLOSE_PRICE: 3.0,
    CHANGE_RATE: 5.1,
    TURNOVERRATE: 20.3,
    BILLBOARD_BUY_AMT: 1.0e8,
    BILLBOARD_SELL_AMT: 4.0e7,
    BILLBOARD_NET_AMT: 6.0e7,
    EXPLANATION: '日涨幅偏离值达7%的前5只证券',
    TRADE_DATE: '2026-09-22 00:00:00',
    TRADE_MARKET: '深交所主板',
  },
  {
    SECURITY_CODE: '000560',
    SECURITY_NAME_ABBR: '我爱我家',
    SECUCODE: '000560.SZ',
    CLOSE_PRICE: 3.0,
    CHANGE_RATE: 5.1,
    TURNOVERRATE: 20.3,
    BILLBOARD_BUY_AMT: 5.0e7,
    BILLBOARD_SELL_AMT: 2.0e7,
    BILLBOARD_NET_AMT: 3.0e7,
    EXPLANATION: '日换手率达20%的前5只证券',
    TRADE_DATE: '2026-09-22 00:00:00',
    TRADE_MARKET: '深交所主板',
  },
  {
    SECURITY_CODE: '600664',
    SECURITY_NAME_ABBR: '哈药股份',
    SECUCODE: '600664.SH',
    CLOSE_PRICE: 5.2,
    CHANGE_RATE: -3.4,
    TURNOVERRATE: 11.2,
    BILLBOARD_BUY_AMT: 2.0e7,
    BILLBOARD_SELL_AMT: 9.0e7,
    BILLBOARD_NET_AMT: -7.0e7,
    EXPLANATION: '日跌幅偏离值达7%的前5只证券',
    TRADE_DATE: '2026-09-22 00:00:00',
    TRADE_MARKET: '上交所主板',
  },
];

const BUY_SEAT_ROWS = [
  {
    SECURITY_CODE: '000560',
    TRADE_DATE: '2026-09-22 00:00:00',
    TRADE_ID: '100416565',
    OPERATEDEPT_CODE: '0',
    OPERATEDEPT_NAME: '机构专用',
    BUY: 9.0e7,
    SELL: 1.0e7,
    NET: 8.0e7,
  },
  {
    SECURITY_CODE: '000560',
    TRADE_DATE: '2026-09-22 00:00:00',
    TRADE_ID: '100416565',
    OPERATEDEPT_CODE: '80032599',
    OPERATEDEPT_NAME: '华泰证券股份有限公司深圳益田路荣超商务中心证券营业部',
    BUY: 2.0e7,
    SELL: 0,
    NET: 2.0e7,
  },
];

const SELL_SEAT_ROWS = [
  {
    SECURITY_CODE: '000560',
    TRADE_DATE: '2026-09-22 00:00:00',
    TRADE_ID: '100416565',
    OPERATEDEPT_CODE: '0',
    OPERATEDEPT_NAME: '机构专用',
    BUY: 0,
    SELL: 3.0e7,
    NET: -3.0e7,
  },
];

afterEach(() => {
  global.fetch = ORIGINAL_FETCH;
  vi.restoreAllMocks();
});

describe('龙虎榜 API（诚实契约）', () => {
  describe('a) 真实源可用 → dataSource=eastmoney，且 totalStocks 按代码去重', () => {
    beforeEach(() => {
      global.fetch = vi.fn(async () =>
        jsonResponse({ success: true, result: { pages: 1, data: DETAIL_ROWS } }),
      ) as unknown as typeof fetch;
    });

    it('GET /api/top-traders/overview?date= 返回 200 且为真实源数据', async () => {
      const res = await request(app).get('/api/top-traders/overview?date=2026-09-22');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      const data = res.body.data;
      expect(data.dataSource).toBe('eastmoney');
      // 3 行明细归属 2 只股票（000560 占 2 行）→ 去重后应为 2
      expect(data.totalStocks).toBe(2);
      expect(data.tradeDate).toBe('2026-09-22');

      // 合计金额 = 全部行求和（去重不影响总额）
      expect(data.totalBuyAmount).toBeCloseTo(1.7e8, 0);
      expect(data.totalSellAmount).toBeCloseTo(1.5e8, 0);
      expect(data.totalNetAmount).toBeCloseTo(2.0e7, 0);

      // 000560 净额 +9e7、600664 净额 -7e7
      expect(data.buyDominantCount).toBe(1);
      expect(data.sellDominantCount).toBe(1);

      expect(Array.isArray(data.topBuyStocks)).toBe(true);
      expect(data.topBuyStocks.length).toBeGreaterThan(0);
      expect(data.topBuyStocks[0].symbol).toBe('000560');
      expect(data.topBuyStocks[0].reason).toBe('日涨幅偏离值达7%的前5只证券');

      // 真实源不提供行业字段 → 恒空对象（前端据此隐藏行业卡片）
      expect(data.industryDistribution).toEqual({});
    });
  });

  describe('b) 网络失败（fetch reject）→ 诚实降级', () => {
    beforeEach(() => {
      global.fetch = vi.fn(async () => {
        throw new Error('network down');
      }) as unknown as typeof fetch;
    });

    it('GET overview 返回 200 + unavailable + 空数组 + 非空 notes', async () => {
      const res = await request(app).get('/api/top-traders/overview?date=2026-09-22');

      expect(res.status).toBe(200);
      const data = res.body.data;
      expect(data.dataSource).toBe('unavailable');
      expect(typeof data.notes).toBe('string');
      expect(data.notes.length).toBeGreaterThan(0);
      expect(data.totalStocks).toBe(0);
      expect(data.totalBuyAmount).toBe(0);
      expect(data.topBuyStocks).toEqual([]);
      expect(data.topSellStocks).toEqual([]);
      expect(data.industryDistribution).toEqual({});
    });

    it('GET seat/rank 返回 200 + unavailable + 空 rank', async () => {
      const res = await request(app).get('/api/top-traders/seat/rank?count=20');

      expect(res.status).toBe(200);
      const data = res.body.data;
      expect(data.dataSource).toBe('unavailable');
      expect(Array.isArray(data.rank)).toBe(true);
      expect(data.rank).toEqual([]);
      expect(typeof data.notes).toBe('string');
      expect(data.notes.length).toBeGreaterThan(0);
    });
  });

  describe('c) 东财错误态（success:false / result:null）→ 同样降级', () => {
    beforeEach(() => {
      global.fetch = vi.fn(async () =>
        jsonResponse({ success: false, result: null }),
      ) as unknown as typeof fetch;
    });

    it('GET overview 返回 unavailable', async () => {
      const res = await request(app).get('/api/top-traders/overview?date=2026-09-22');

      expect(res.status).toBe(200);
      const data = res.body.data;
      expect(data.dataSource).toBe('unavailable');
      expect(data.topBuyStocks).toEqual([]);
      expect(data.notes.length).toBeGreaterThan(0);
    });
  });

  describe('d) 路由注册顺序：seat/rank 命中 seat 端点，未被 :symbol 吞掉', () => {
    beforeEach(() => {
      global.fetch = vi.fn(async (url: string | URL) => {
        const s = String(url);
        if (s.includes('RPT_DAILYBILLBOARD_DETAILSNEW')) {
          return jsonResponse({ success: true, result: { pages: 1, data: DETAIL_ROWS } });
        }
        if (s.includes('RPT_BILLBOARD_DAILYDETAILSSELL')) {
          return jsonResponse({ success: true, result: { pages: 1, data: SELL_SEAT_ROWS } });
        }
        if (s.includes('RPT_BILLBOARD_DAILYDETAILSBUY')) {
          return jsonResponse({ success: true, result: { pages: 1, data: BUY_SEAT_ROWS } });
        }
        return jsonResponse({ success: false, result: null });
      }) as unknown as typeof fetch;
    });

    it('GET /api/top-traders/seat/rank 返回 rank 数组（非 record）', async () => {
      const res = await request(app).get('/api/top-traders/seat/rank?count=20');

      expect(res.status).toBe(200);
      const data = res.body.data;
      expect(Array.isArray(data.rank)).toBe(true);
      expect(data.rank.length).toBeGreaterThan(0);
      // 若被 :symbol 吞掉，返回体会是 { record: null, ... } 而没有 rank
      expect(data.record).toBeUndefined();

      const first = data.rank[0];
      expect(typeof first.seatName).toBe('string');
      expect(first.seatName.length).toBeGreaterThan(0);
      expect(typeof first.netAmount).toBe('number');
      // 机构专用席位聚合：buy 9e7 - sell 3e7 = 6e7，且被识别为机构席位
      expect(first.seatName).toBe('机构专用');
      expect(first.isOrganizational).toBe(true);
      expect(first.totalBuyAmount).toBeCloseTo(9.0e7, 0);
      expect(first.totalSellAmount).toBeCloseTo(3.0e7, 0);
      expect(first.netAmount).toBeCloseTo(6.0e7, 0);
      // 同一 (股票_交易ID) 在买卖两侧各现一次 → 去重后上榜次数为 1
      expect(first.appearCount).toBe(1);
      expect(data.dataSource).toBe('eastmoney');
    });

    it('GET /api/top-traders/:symbol 仍可达（顺序正确）', async () => {
      const res = await request(app).get(
        `/api/top-traders/000560?name=${encodeURIComponent('我爱我家')}`,
      );

      expect(res.status).toBe(200);
      const data = res.body.data;
      expect(data.dataSource).toBe('eastmoney');
      expect(data.record).toBeTruthy();
      expect(data.record.symbol).toBe('000560');
      expect(data.record.tradeDate).toBe('2026-09-22');
      expect(data.record.entries.length).toBeGreaterThan(0);
      expect(data.record.netTotal).toBeCloseTo(
        data.record.buyTotal - data.record.sellTotal,
        2,
      );
    });
  });

  describe('e) history 端点', () => {
    beforeEach(() => {
      global.fetch = vi.fn(async (url: string | URL) => {
        const s = String(url);
        if (s.includes('RPT_DAILYBILLBOARD_DETAILSNEW')) {
          return jsonResponse({ success: true, result: { pages: 1, data: DETAIL_ROWS } });
        }
        if (s.includes('RPT_BILLBOARD_DAILYDETAILSSELL') || s.includes('RPT_BILLBOARD_DAILYDETAILSBUY')) {
          return jsonResponse({ success: true, result: { pages: 1, data: BUY_SEAT_ROWS } });
        }
        return jsonResponse({ success: false, result: null });
      }) as unknown as typeof fetch;
    });

    it('GET /api/top-traders/history/:symbol?days= 返回 records 数组', async () => {
      const res = await request(app).get('/api/top-traders/history/000560?days=10');

      expect(res.status).toBe(200);
      const data = res.body.data;
      expect(data.dataSource).toBe('eastmoney');
      expect(Array.isArray(data.records)).toBe(true);
      // 明细 3 行同属 2026-09-22 → 归并为 1 个交易日
      expect(data.records.length).toBe(1);
      expect(data.records[0].tradeDate).toBe('2026-09-22');
      expect(data.records[0].entries.length).toBeGreaterThan(0);
    });
  });
});
