/**
 * AI 智能分析 API 路由测试（诚实数据版）
 *
 * 约定（同 marketBreadth.test.ts 风格）：
 * - mock global.fetch 拦截**腾讯**真实源（qt.gtimg.cn 报价 + web.ifzq.gtimg.cn 日线 bfq）；
 *   2026-11-03 起本端点已不再打 push2/push2his（该域名实测不可达）；
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
import { queryCache } from '../utils/queryCache';

/** 测试进程未初始化 DB → 候选池降级为内置名单（15 只），报价需覆盖这 15 个腾讯代码 */
const FALLBACK_TENCENT_CODES = [
  'sh600519', 'sz000858', 'sz300750', 'sz002594', 'sh601318',
  'sh600036', 'sz000333', 'sz002415', 'sh688981', 'sh601012',
  'sz002475', 'sh603259', 'sh601888', 'sz300059', 'sh600900',
];

/**
 * 构造 A 股腾讯报价行（字段位与 services/tencentQuoteService.ts 标定一致）。
 * 3=最新价 4=昨收 30=时间 32=涨跌幅 39=PE 45=总市值(亿) 46=PB 82=币种
 */
function tencentQuoteLine(
  code: string,
  name: string,
  overrides: { price?: number; pe?: number; pb?: number; changePercent?: number } = {},
): string {
  const f = new Array(88).fill('');
  f[0] = '1';
  f[1] = name;
  f[2] = code.replace(/^(sh|sz)/, '');
  f[3] = String(overrides.price ?? 100);
  f[4] = String(overrides.price ?? 100);
  f[6] = '100000';
  f[30] = '20261103150000';
  f[32] = String(overrides.changePercent ?? 2);
  f[37] = '100000';
  f[39] = String(overrides.pe ?? 12);
  f[45] = '5000.00';
  f[46] = String(overrides.pb ?? 3);
  f[82] = 'CNY';
  return `v_${code}="${f.join('~')}";`;
}

/** 腾讯报价响应：按 URL 里的代码列表拼行（含真实汇率行，本端点不消费但保持一致） */
function makeQuoteText(codes: string[], overrides: { pe?: number } = {}): string {
  return codes
    // 名称用 ASCII：本桩经 latin1 伪编码后再由 TextDecoder('gbk') 解码，
    // 中文字符的字节对可能吞掉后随的 '~' 分隔符，导致字段错位（真实 GBK 响应无此问题）。
    .map((c) => tencentQuoteLine(c, 'TEST', { pe: overrides.pe }))
    .join('\n');
}

/** 腾讯 fqkline 响应（bfq 不复权，键名 day，行序 O-C-H-L），60 根稳定上行便于触发 MA 多头 */
function makeTencentKlineJson(tencentCode: string, count = 60): { code: number; data: Record<string, any> } {
  const rows: string[][] = [];
  let price = 100;
  for (let i = 0; i < count; i++) {
    price += 1;
    const dd = String((i % 28) + 1).padStart(2, '0');
    const mm = String(Math.floor(i / 28) + 1).padStart(2, '0');
    rows.push([`2024-${mm}-${dd}`, String(price - 0.5), String(price), String(price + 0.5), String(price - 1), String(100000 + i * 1000)]);
  }
  return { code: 0, data: { [tencentCode]: { day: rows } } };
}

/** 从 fqkline URL 的 param 里取出腾讯代码：param=sh600519,day,,,60,bfq */
function tencentCodeOfKlineUrl(url: string): string {
  const m = url.match(/param=([a-z]{2}\d{6})/);
  return m ? m[1] : 'sh600519';
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

/** 安装 fetch mock，返回恢复函数。
 * handler 返回**响应体字符串**：腾讯报价是 GBK 文本、fqkline 是 JSON 文本，
 * 两种形态都能被同一个 mock 同时提供 json() / text() / arrayBuffer()。 */
function installFetchMock(handler: (url: string) => Promise<string>): () => void {
  const origFetch = global.fetch;
  (global as any).fetch = vi.fn(async (url: string) => {
    const body = await handler(url);
    return {
      ok: true,
      status: 200,
      json: async () => JSON.parse(body),
      text: async () => body,
      arrayBuffer: async () => {
        const buf = Buffer.from(body, 'latin1');
        return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
      },
    } as any;
  });
  return () => { (global as any).fetch = origFetch; };
}

/** 标准上游响应：腾讯报价 + 腾讯日线（bfq） */
async function defaultUpstream(url: string): Promise<string> {
  if (url.includes('qt.gtimg.cn/q=')) {
    const codes = (url.match(/\/q=([^&]+)/)?.[1] ?? '').split(',').filter(Boolean);
    return `${makeQuoteText(codes)}\n`;
  }
  if (url.includes('fqkline/get')) {
    return JSON.stringify(makeTencentKlineJson(tencentCodeOfKlineUrl(url)));
  }
  throw new Error(`unexpected url: ${url}`);
}

describe('AI Analysis API (honest-data)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // 候选池装配结果有 2 分钟进程内缓存，用例之间必须清掉，否则失败用例会读到上一个用例的缓存
    queryCache.invalidate('ai-universe');
  });

  describe('GET /ai/recommendations', () => {
    it('真实源可用时返回 dataSource:real + 推荐列表', async () => {
      (getFinancialIndicators as any).mockResolvedValue(makeIndicators());
      const restore = installFetchMock(defaultUpstream);

      try {
        const res = await request(createApp()).get('/ai/recommendations');
        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body.data.dataSource).toBe('real');
        expect(res.body.data.stocks).toBeInstanceOf(Array);
        expect(res.body.data.stocks.length).toBeGreaterThan(0);
        // 候选池扩到 60 只后榜单输出前 20（原为 5）
        expect(res.body.data.stocks.length).toBeLessThanOrEqual(20);
        for (let i = 1; i < res.body.data.stocks.length; i++) {
          expect(res.body.data.stocks[i - 1].totalScore).toBeGreaterThanOrEqual(res.body.data.stocks[i].totalScore);
        }
        // 候选池来源必须显式声明（测试进程无 DB → 内置兜底名单，不得谎报全市场）
        const u = res.body.data.universe;
        expect(u).toBeTruthy();
        expect(['daily_quotes.topByTurnover', 'builtinWatchlistFallback']).toContain(u.source);
        expect(typeof u.scored).toBe('number');
        expect(u.dropped).toBeTruthy();
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
        expect(res.body.data.confidence).toBeNull();
        // 失败态不得声明候选池来源（否则前端会读成「全市场 0 机会」）
        expect(res.body.data.universe).toBeNull();
        expect(res.body.data.message).toContain('不可用');
      } finally {
        restore();
      }
    });
  });

  describe('GET /ai/analyze/:symbol', () => {
    it('真实源可用时返回单股 AI 分析 + dataSource:real', async () => {
      (getFinancialIndicators as any).mockResolvedValue(makeIndicators());
      // PE 取 12（<15）以稳定命中「估值偏低」加分分支，断言只看结构与分值域
      const restore = installFetchMock(defaultUpstream);

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
      const restore = installFetchMock(defaultUpstream);

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
        expect(res.body.data.total).toBeNull();
      } finally {
        restore();
      }
    });
  });

  describe('GET /ai/sector-rotation', () => {
    it('真实源可用时返回 sector rotation + dataSource:real', async () => {
      (getFinancialIndicators as any).mockResolvedValue(makeIndicators());
      const restore = installFetchMock(defaultUpstream);

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
      const restore = installFetchMock(defaultUpstream);

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
        expect(res.body.data.bullishCount).toBeNull();
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
