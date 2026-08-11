/**
 * AI 智能分析 API 路由测试（诚实数据版）
 *
 * 约定（同 marketBreadth.test.ts 风格）：
 * - mock global.fetch 拦截东财 push2/push2his 真实源；
 * - mock financialsDataService 拦截财务指标真实源；
 * - 真实路径：所有源可用 → 返回 dataSource:'real' + 真实结构；
 * - 诚实空路径：源不可达 → 返回 dataSource:'unavailable' + 空 data；
 * - 严禁任何路径出现 Math.random 伪造（路由文件已去除此类逻辑）。
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';
import express from 'express';

// Mock financialsDataService（提供 ROE/营收增长/利润增长）
vi.mock('../services/financialsDataService', () => ({
  getFinancialIndicators: vi.fn(),
  FinancialsUnavailableError: class FinancialsUnavailableError extends Error {
    constructor(msg = '财报真实源暂不可用') {
      super(msg);
      this.name = 'FinancialsUnavailableError';
    }
  },
}));

import { getFinancialIndicators } from '../services/financialsDataService';
import router from '../api/ai-analysis';

// 东财个股实时行情返回（push2 stock/get）
function makeQuoteJson(symbol: string, name: string, overrides: Record<string, number> = {}) {
  return {
    data: {
      f12: symbol,
      f14: name,
      f2: (overrides.price ?? 100) * 1000,
      f3: (overrides.changePercent ?? 2) * 100,
      f5: overrides.volume ?? 100000,
      f6: overrides.turnover ?? 10000000,
      f9: (overrides.pe ?? 20) * 100,
      f23: (overrides.pb ?? 3) * 100,
      f20: overrides.marketCap ?? 500000000000,
    },
  };
}

// 东财个股日 K 线返回（push2his stock/kline/get）
function makeKlineJson(count = 60): { data: { klines: string[] } } {
  const klines: string[] = [];
  let price = 100;
  for (let i = 0; i < count; i++) {
    price += 1; // 稳定上行，便于触发 MA 多头排列
    const dd = String((i % 28) + 1).padStart(2, '0');
    const mm = String(Math.floor(i / 28) + 1).padStart(2, '0');
    klines.push(`2024-${mm}-${dd},${price - 0.5},${price},${price + 0.5},${price - 1},${100000 + i * 1000},${10000000 + i * 100000}`);
  }
  return { data: { klines } };
}

// 财务指标返回（financialsDataService.getFinancialIndicators）
function makeIndicators() {
  return [
    {
      reportDate: '2023-12-31',
      reportType: '年报',
      dataType: '2023年 年报',
      dataYear: '2023',
      eps: 5.0,
      deductedEps: 4.8,
      revenue: 100000000000,
      parentNetProfit: 20000000000,
      roe: 25,
      bps: 20,
      ocfPerShare: 4,
      grossMargin: 60,
      revenueGrowth: 18,
      profitGrowth: 15,
      dividendYield: 2,
      netMargin: 20,
    },
  ];
}

function createApp() {
  const app = express();
  app.use(express.json());
  app.use('/', router);
  // 测试环境下错误中间件：把抛出的非业务错误也转成 JSON（便于断言）
  app.use(((err: any, _req: any, res: any, _next: any) => {
    res.status(500).json({ success: false, error: err?.message ?? 'internal' });
  }) as express.ErrorRequestHandler);
  return app;
}

/** 安装 fetch mock，返回恢复函数 */
function installFetchMock(handler: (url: string) => Promise<any>): () => void {
  const origFetch = global.fetch;
  (global as any).fetch = vi.fn(async (url: string) => {
    const data = await handler(url);
    return {
      ok: true,
      status: 200,
      json: async () => data,
      text: async () => JSON.stringify(data),
    } as any;
  });
  return () => { (global as any).fetch = origFetch; };
}

describe('AI Analysis API (honest-data)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('GET /ai/recommendations', () => {
    it('真实源可用时返回 dataSource:real + 推荐列表', async () => {
      (getFinancialIndicators as any).mockResolvedValue(makeIndicators());
      const restore = installFetchMock(async (url) => {
        if (url.includes('/qt/stock/get')) return makeQuoteJson('600519.SH', '贵州茅台');
        if (url.includes('/stock/kline/get')) return makeKlineJson();
        throw new Error(`unexpected url: ${url}`);
      });

      try {
        const res = await request(createApp()).get('/ai/recommendations');
        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body.data.dataSource).toBe('real');
        expect(res.body.data.stocks).toBeInstanceOf(Array);
        expect(res.body.data.stocks.length).toBeGreaterThan(0);
        expect(res.body.data.stocks.length).toBeLessThanOrEqual(5);
        for (let i = 1; i < res.body.data.stocks.length; i++) {
          expect(res.body.data.stocks[i - 1].totalScore).toBeGreaterThanOrEqual(res.body.data.stocks[i].totalScore);
        }
      } finally {
        restore();
      }
    });

    it('真实源全部失败时返回 dataSource:unavailable + 空列表（诚实空）', async () => {
      (getFinancialIndicators as any).mockRejectedValue(new Error('source down'));
      const restore = installFetchMock(async () => { throw new Error('network down'); });

      try {
        const res = await request(createApp()).get('/ai/recommendations');
        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body.data.dataSource).toBe('unavailable');
        expect(res.body.data.stocks).toEqual([]);
        expect(res.body.data.confidence).toBe(0);
        expect(res.body.data.message).toContain('失败');
      } finally {
        restore();
      }
    });
  });

  describe('GET /ai/analyze/:symbol', () => {
    it('真实源可用时返回单股 AI 分析 + dataSource:real', async () => {
      (getFinancialIndicators as any).mockResolvedValue(makeIndicators());
      const restore = installFetchMock(async (url) => {
        if (url.includes('/qt/stock/get')) return makeQuoteJson('600519.SH', '贵州茅台', { pe: 12 });
        if (url.includes('/stock/kline/get')) return makeKlineJson();
        throw new Error(`unexpected url: ${url}`);
      });

      try {
        const res = await request(createApp()).get('/ai/analyze/600519.SH');
        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body.data.dataSource).toBe('real');
        expect(res.body.data.symbol).toBe('600519.SH');
        expect(res.body.data).toHaveProperty('totalScore');
        expect(res.body.data).toHaveProperty('recommendation');
        expect(res.body.data).toHaveProperty('signals');
        expect(res.body.data.totalScore).toBeGreaterThanOrEqual(0);
        expect(res.body.data.totalScore).toBeLessThanOrEqual(100);
      } finally {
        restore();
      }
    });

    it('行情源失败时返回 dataSource:unavailable（诚实空，不伪造）', async () => {
      (getFinancialIndicators as any).mockResolvedValue(makeIndicators());
      const restore = installFetchMock(async () => { throw new Error('network down'); });

      try {
        const res = await request(createApp()).get('/ai/analyze/600519.SH');
        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body.data.dataSource).toBe('unavailable');
        expect(res.body.data.symbol).toBe('600519.SH');
        expect(res.body.data.message).toBeTruthy();
      } finally {
        restore();
      }
    });
  });

  describe('GET /ai/alerts', () => {
    it('真实源可用时返回 alerts + dataSource:real', async () => {
      (getFinancialIndicators as any).mockResolvedValue(makeIndicators());
      const restore = installFetchMock(async (url) => {
        if (url.includes('/qt/stock/get')) return makeQuoteJson('600519.SH', '贵州茅台');
        if (url.includes('/stock/kline/get')) return makeKlineJson();
        throw new Error(`unexpected url: ${url}`);
      });

      try {
        const res = await request(createApp()).get('/ai/alerts?limit=10');
        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body.data.dataSource).toBe('real');
        expect(res.body.data.alerts).toBeInstanceOf(Array);
        expect(res.body.data.total).toBe(res.body.data.alerts.length);
        expect(res.body.data.alerts.length).toBeLessThanOrEqual(10);
      } finally {
        restore();
      }
    });

    it('源失败时返回 alerts:[] + dataSource:unavailable', async () => {
      (getFinancialIndicators as any).mockRejectedValue(new Error('down'));
      const restore = installFetchMock(async () => { throw new Error('network down'); });

      try {
        const res = await request(createApp()).get('/ai/alerts');
        expect(res.status).toBe(200);
        expect(res.body.data.dataSource).toBe('unavailable');
        expect(res.body.data.alerts).toEqual([]);
        expect(res.body.data.total).toBe(0);
      } finally {
        restore();
      }
    });
  });

  describe('GET /ai/sector-rotation', () => {
    it('真实源可用时返回 sector rotation + dataSource:real', async () => {
      (getFinancialIndicators as any).mockResolvedValue(makeIndicators());
      const restore = installFetchMock(async (url) => {
        if (url.includes('/qt/stock/get')) return makeQuoteJson('600519.SH', '贵州茅台');
        if (url.includes('/stock/kline/get')) return makeKlineJson();
        throw new Error(`unexpected url: ${url}`);
      });

      try {
        const res = await request(createApp()).get('/ai/sector-rotation');
        expect(res.status).toBe(200);
        expect(res.body.data.dataSource).toBe('real');
        expect(res.body.data.sectors).toBeInstanceOf(Array);
        expect(res.body.data.leading).toBeInstanceOf(Array);
        expect(res.body.data.lagging).toBeInstanceOf(Array);
      } finally {
        restore();
      }
    });

    it('源失败时返回 sectors:[] + dataSource:unavailable', async () => {
      (getFinancialIndicators as any).mockRejectedValue(new Error('down'));
      const restore = installFetchMock(async () => { throw new Error('network down'); });

      try {
        const res = await request(createApp()).get('/ai/sector-rotation');
        expect(res.status).toBe(200);
        expect(res.body.data.dataSource).toBe('unavailable');
        expect(res.body.data.sectors).toEqual([]);
      } finally {
        restore();
      }
    });
  });

  describe('GET /ai/market-sentiment', () => {
    it('真实源可用时返回 sentiment + dataSource:real', async () => {
      (getFinancialIndicators as any).mockResolvedValue(makeIndicators());
      const restore = installFetchMock(async (url) => {
        if (url.includes('/qt/stock/get')) return makeQuoteJson('600519.SH', '贵州茅台');
        if (url.includes('/stock/kline/get')) return makeKlineJson();
        throw new Error(`unexpected url: ${url}`);
      });

      try {
        const res = await request(createApp()).get('/ai/market-sentiment');
        expect(res.status).toBe(200);
        expect(res.body.data.dataSource).toBe('real');
        expect(res.body.data).toHaveProperty('sentiment');
        expect(res.body.data).toHaveProperty('sentimentScore');
        expect(res.body.data).toHaveProperty('avgScore');
        expect(res.body.data).toHaveProperty('bullishCount');
        expect(res.body.data).toHaveProperty('bearishCount');
      } finally {
        restore();
      }
    });

    it('源失败时返回 sentiment:数据源暂不可用 + dataSource:unavailable', async () => {
      (getFinancialIndicators as any).mockRejectedValue(new Error('down'));
      const restore = installFetchMock(async () => { throw new Error('network down'); });

      try {
        const res = await request(createApp()).get('/ai/market-sentiment');
        expect(res.status).toBe(200);
        expect(res.body.data.dataSource).toBe('unavailable');
        expect(res.body.data.sentiment).toBe('数据源暂不可用');
        expect(res.body.data.bullishCount).toBe(0);
      } finally {
        restore();
      }
    });
  });

  describe('诚实红线', () => {
    it('api/ai-analysis.ts 文件零 Math.random 残留', async () => {
      const fs = await import('fs');
      const path = await import('path');
      const file = fs.readFileSync(
        path.resolve(__dirname, '../api/ai-analysis.ts'),
        'utf-8',
      );
      expect(file).not.toContain('Math.random');
    });

    it('utils/aiAnalysis.ts 文件零 Math.random 残留', async () => {
      const fs = await import('fs');
      const path = await import('path');
      const file = fs.readFileSync(
        path.resolve(__dirname, '../utils/aiAnalysis.ts'),
        'utf-8',
      );
      expect(file).not.toContain('Math.random');
    });
  });
});
