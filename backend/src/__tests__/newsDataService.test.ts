/**
 * newsDataService 新闻与研报数据服务测试（诚实数据版）
 *
 * 既有 news.test.ts mock 了服务模块本身（路由层测试），本文件直接测服务实现：
 * stub 全局 fetch 模拟东财源响应。
 *
 * 数据源（东方财富，免 key）：
 * - 全市场快讯：np-listapi getFastNewsList（data.fastNewsList）
 * - 个股公告：np-anotice-stock api/security/ann（data.list）
 * - 研报列表：reportapi report/list（data 数组）
 *
 * 约定：
 * - 源失败 → 抛 NewsUnavailableError（由路由层降级诚实空）；
 * - 无效 symbol → 抛 NewsUnavailableError（不发请求）；
 * - 快讯 60s 缓存 / 研报 120s 缓存，clearNewsCache 生效。
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  getNews,
  getResearchReports,
  clearNewsCache,
  NewsUnavailableError,
} from '../services/newsDataService';

function jsonResponse(body: unknown, init?: { ok?: boolean; status?: number }) {
  return {
    ok: init?.ok ?? true,
    status: init?.status ?? 200,
    json: () => Promise.resolve(body),
  } as Response;
}

const FAST_NEWS_PAYLOAD = {
  data: {
    fastNewsList: [
      {
        code: 'FN001',
        title: '沪指大涨突破新高',
        summary: '两市放量回升，市场情绪回暖',
        source: '东方财富快讯',
        showTime: '2026-08-12 10:30:00',
        art_code: '202608123456789',
        viewCount: 1234,
      },
      {
        code: 'FN002',
        title: '某公司亏损不及预期',
        content: '业绩下滑承压',
        showTime: '10:25',
        // 无 art_code → url 为 '#'
      },
    ],
  },
};

const ANNOUNCEMENT_PAYLOAD = {
  data: {
    list: [
      {
        art_code: 'AN20260812001',
        title: '贵州茅台：2026年半年度报告',
        notice_date: '2026-08-12 00:00:00',
        codes: [{ stock_code: '600519', short_name: '贵州茅台' }],
        columns: [{ column_name: '定期报告' }],
      },
    ],
  },
};

const REPORT_PAYLOAD = {
  data: [
    {
      infoCode: 'RPT001',
      title: '贵州茅台：业绩超预期，维持买入',
      stockName: '贵州茅台',
      stockCode: '600519',
      orgSName: '中信证券',
      publishDate: '2026-08-10 00:00:00',
      emRatingName: '买入',
      predictThisYearEps: 60.5,
      predictThisYearPe: 28.3,
      predictNextYearEps: 66.0,
      predictNextYearPe: 25.9,
      indvInduName: '白酒',
    },
  ],
};

describe('newsDataService (honest-data)', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
    clearNewsCache();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe('(a) 真实样例响应 → 字段映射正确', () => {
    it('全市场快讯映射正确（含情绪启发式与 URL 构造）', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(FAST_NEWS_PAYLOAD)));
      const items = await getNews(undefined, undefined, 20);

      expect(items).toHaveLength(2);
      const first = items[0];
      expect(first.id).toBe('FN001');
      expect(first.title).toBe('沪指大涨突破新高');
      expect(first.category).toBe('market');
      expect(first.url).toBe('https://finance.eastmoney.com/a/202608123456789.html');
      expect(first.publishTime).toBe(new Date('2026-08-12T10:30:00').toISOString());
      expect(first.viewCount).toBe(1234);
      // 「大涨/突破/新高/放量/回升/回暖」→ positive，饱和封顶 score/3
      expect(first.sentiment).toBe('positive');
      expect(first.sentimentScore).toBeGreaterThan(0);
      expect(first.sentimentScore).toBeLessThanOrEqual(1);

      const second = items[1];
      // 无 art_code → 诚实 '#'
      expect(second.url).toBe('#');
      // content 兜底为 summary
      expect(second.summary).toBe('业绩下滑承压');
      // 「亏损/下滑/承压/不及预期」→ negative
      expect(second.sentiment).toBe('negative');
      // showTime 无日期 → publishTime 为合法 ISO 当前时间
      expect(() => new Date(second.publishTime)).not.toThrow();
      expect(second.publishTime).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    });

    it('个股公告映射正确（source/relatedSymbols/tags）', async () => {
      const fetchMock = vi.fn().mockResolvedValue(jsonResponse(ANNOUNCEMENT_PAYLOAD));
      vi.stubGlobal('fetch', fetchMock);
      const items = await getNews('600519', undefined, 20);

      expect(items).toHaveLength(1);
      const item = items[0];
      expect(item.id).toBe('AN20260812001');
      expect(item.category).toBe('company');
      expect(item.source).toBe('贵州茅台公告');
      expect(item.relatedSymbols).toEqual(['600519']);
      expect(item.tags).toEqual(['定期报告']);
      expect(item.url).toBe(
        'https://data.eastmoney.com/notices/detail/600519/AN20260812001.html',
      );
      // 公告 URL 用 digits（stock_list=600519）
      expect(String(fetchMock.mock.calls[0][0])).toContain('stock_list=600519');
    });

    it('研报列表映射正确（评级/预测 EPS/PE/行业/URL）', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(REPORT_PAYLOAD)));
      const reports = await getResearchReports('600519', 20);

      expect(reports).toHaveLength(1);
      const r = reports[0];
      expect(r.id).toBe('RPT001');
      expect(r.stockCode).toBe('600519');
      expect(r.orgName).toBe('中信证券');
      expect(r.publishDate).toBe('2026-08-10');
      expect(r.rating).toBe('买入');
      expect(r.predictThisYearEps).toBe(60.5);
      expect(r.predictNextYearPe).toBe(25.9);
      expect(r.industryName).toBe('白酒');
      expect(r.url).toBe(
        'https://data.eastmoney.com/report/zw_stock.jshtml?infoCode=RPT001',
      );
    });

    it('limit 超界被钳制到 [1, 50]', async () => {
      const fetchMock = vi.fn().mockResolvedValue(jsonResponse(FAST_NEWS_PAYLOAD));
      vi.stubGlobal('fetch', fetchMock);
      await getNews(undefined, undefined, 999);
      expect(String(fetchMock.mock.calls[0][0])).toContain('pageSize=50');
    });
  });

  describe('(b) 源不可达 → 抛 NewsUnavailableError', () => {
    it('快讯源 HTTP 非 2xx → 抛 NewsUnavailableError', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({}, { ok: false, status: 500 })));
      await expect(getNews()).rejects.toBeInstanceOf(NewsUnavailableError);
    });

    it('快讯 fetch reject（网络不可达）→ 抛 NewsUnavailableError', async () => {
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network down')));
      await expect(getNews()).rejects.toBeInstanceOf(NewsUnavailableError);
    });

    it('公告源失败 → 抛 NewsUnavailableError', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({}, { ok: false, status: 503 })));
      await expect(getNews('600519')).rejects.toBeInstanceOf(NewsUnavailableError);
    });

    it('研报源返回空数组 → 抛 NewsUnavailableError', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ data: [] })));
      await expect(getResearchReports()).rejects.toBeInstanceOf(NewsUnavailableError);
    });

    it('研报 fetch reject → 抛 NewsUnavailableError', async () => {
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network down')));
      await expect(getResearchReports('600519')).rejects.toBeInstanceOf(NewsUnavailableError);
    });
  });

  describe('(c) symbol 归一化', () => {
    it('无效 symbol → 抛 NewsUnavailableError 且不发请求', async () => {
      const fetchMock = vi.fn();
      vi.stubGlobal('fetch', fetchMock);
      await expect(getNews('abc')).rejects.toBeInstanceOf(NewsUnavailableError);
      await expect(getNews('12345')).rejects.toBeInstanceOf(NewsUnavailableError);
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('SH600519 / 600519.SH 归一化为 digits=600519', async () => {
      const fetchMock = vi.fn().mockResolvedValue(jsonResponse(ANNOUNCEMENT_PAYLOAD));
      vi.stubGlobal('fetch', fetchMock);
      await getNews('SH600519');
      await getNews('600519.SH');
      const urls = fetchMock.mock.calls.map((c) => String(c[0]));
      expect(urls[0]).toContain('stock_list=600519');
      expect(urls[1]).toContain('stock_list=600519');
    });

    it('研报请求带 code 参数（归一化 digits）', async () => {
      const fetchMock = vi.fn().mockResolvedValue(jsonResponse(REPORT_PAYLOAD));
      vi.stubGlobal('fetch', fetchMock);
      await getResearchReports('000001.SZ', 10);
      const url = String(fetchMock.mock.calls[0][0]);
      expect(url).toContain('code=000001');
    });
  });

  describe('(d) 缓存行为', () => {
    it('快讯 60s 内第二次调用命中缓存（不再发请求）', async () => {
      const fetchMock = vi.fn().mockResolvedValue(jsonResponse(FAST_NEWS_PAYLOAD));
      vi.stubGlobal('fetch', fetchMock);
      await getNews();
      await getNews();
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('clearNewsCache 后快讯重新抓取', async () => {
      const fetchMock = vi.fn().mockResolvedValue(jsonResponse(FAST_NEWS_PAYLOAD));
      vi.stubGlobal('fetch', fetchMock);
      await getNews();
      clearNewsCache();
      await getNews();
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it('研报缓存按 symbol 维度隔离', async () => {
      const fetchMock = vi.fn().mockResolvedValue(jsonResponse(REPORT_PAYLOAD));
      vi.stubGlobal('fetch', fetchMock);
      await getResearchReports('600519');
      await getResearchReports('600519'); // 命中缓存
      await getResearchReports('000001'); // 不同 symbol → 重新抓
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it('clearNewsCache 后研报重新抓取', async () => {
      const fetchMock = vi.fn().mockResolvedValue(jsonResponse(REPORT_PAYLOAD));
      vi.stubGlobal('fetch', fetchMock);
      await getResearchReports('600519');
      clearNewsCache();
      await getResearchReports('600519');
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });
  });
});
