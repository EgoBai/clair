/**
 * 新闻 API 测试（诚实数据版）
 *
 * 约定：news 不再返回任何硬编码种子/模拟数据。
 * - 真实源（东方财富快讯 / 公告 / 研报）可用时返回真实新闻；
 * - 真实源失败时降级为 dataSource:'unavailable' + items:[]（诚实空）；
 * - 绝不 fallback 到「宁德时代固态电池」等硬编码种子 demo。
 *
 * 测试策略：mock newsDataService，验证路由层真实/不可用两路径。
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../services/newsDataService', () => ({
  getNews: vi.fn(),
  getResearchReports: vi.fn(),
  NewsUnavailableError: class NewsUnavailableError extends Error {
    constructor(msg = '新闻/研报真实源暂不可用') {
      super(msg);
      this.name = 'NewsUnavailableError';
    }
  },
}));

import { getNews, getResearchReports, NewsUnavailableError } from '../services/newsDataService';
import request from 'supertest';
import express from 'express';
import newsRouter from '../api/news';

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/api', newsRouter);
  return app;
}

const realNewsItem = {
  id: 'AN202607171827064564',
  title: '贵州茅台:贵州茅台重大事项公告',
  summary: '贵州茅台:贵州茅台重大事项公告',
  source: '贵州茅台公告',
  url: 'https://data.eastmoney.com/notices/detail/600519/AN202607171827064564.html',
  publishTime: '2026-07-18T00:00:00.000Z',
  category: 'company' as const,
  sentiment: 'neutral' as const,
  sentimentScore: 0,
  relatedSymbols: ['600519'],
  tags: ['其他'],
  viewCount: 0,
};

const realFastNews = {
  id: '202608123838284444',
  title: '【美国银行：美元对CPI低于预期会更为敏感】',
  summary: '美国银行分析师认为，如果美国通货膨胀报告意外低于预期...',
  source: '东方财富快讯',
  url: 'https://finance.eastmoney.com/a/202608123838284444.html',
  publishTime: '2026-08-12T02:30:00.000Z',
  category: 'market' as const,
  sentiment: 'neutral' as const,
  sentimentScore: 0,
  relatedSymbols: [],
  tags: [],
  viewCount: 0,
};

const realReport = {
  id: 'AP202607231827290069',
  title: '需求根基稳固，市场化定价持续兑现',
  stockName: '贵州茅台',
  stockCode: '600519',
  orgName: '中邮证券',
  publishDate: '2026-07-23',
  rating: '买入',
  predictThisYearEps: 67.19,
  predictThisYearPe: 19.42,
  predictNextYearEps: 69.76,
  predictNextYearPe: 18.71,
  industryName: '白酒Ⅱ',
  url: 'https://data.eastmoney.com/report/zw_stock.jshtml?infoCode=AP202607231827290069',
};

describe('News API (honest-data)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('GET /api/news (全市场快讯)', () => {
    it('真实源可用时返回真实快讯（非硬编码种子）', async () => {
      (getNews as any).mockResolvedValue([realFastNews]);
      const app = buildApp();
      const res = await request(app).get('/api/news?page=1&pageSize=20');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.items).toHaveLength(1);
      expect(res.body.data.items[0].title).toContain('美国银行');
      // 关键断言：不再返回硬编码种子 demo
      expect(res.body.data.items.find((n: any) => n.title.includes('宁德时代固态电池'))).toBeUndefined();
      expect(res.body.data.items.find((n: any) => n.url === '#')).toBeUndefined();
      expect(res.body.data.pagination.totalCount).toBe(1);
      expect(getNews).toHaveBeenCalledWith(undefined, undefined, 40);
    });

    it('真实源失败时返回诚实空（dataSource:unavailable + items:[]）', async () => {
      (getNews as any).mockRejectedValue(new NewsUnavailableError('快讯源不可用'));
      const app = buildApp();
      const res = await request(app).get('/api/news');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.dataSource).toBe('unavailable');
      expect(res.body.data.items).toEqual([]);
      expect(res.body.data.message).toContain('快讯源不可用');
      // 关键：绝不 fallback 到硬编码种子
      expect(res.body.data.items.find((n: any) => n.title.includes('宁德时代'))).toBeUndefined();
    });

    it('支持分类/搜索筛选（仅过滤真实数据，不引入伪造）', async () => {
      (getNews as any).mockResolvedValue([
        { ...realFastNews, category: 'market', title: 'A股大涨' },
        { ...realFastNews, id: '2', category: 'global', title: '美股收高' },
      ]);
      const app = buildApp();
      const res = await request(app).get('/api/news?category=global&q=' + encodeURIComponent('美股'));

      expect(res.status).toBe(200);
      expect(res.body.data.items).toHaveLength(1);
      expect(res.body.data.items[0].title).toContain('美股');
    });
  });

  describe('GET /api/news/stock/:symbol (个股公告)', () => {
    it('真实源可用时返回个股公告', async () => {
      (getNews as any).mockResolvedValue([realNewsItem]);
      const app = buildApp();
      const res = await request(app).get('/api/news/stock/600519.SH?limit=10');

      expect(res.status).toBe(200);
      expect(res.body.data.items).toHaveLength(1);
      expect(res.body.data.items[0].title).toContain('贵州茅台');
      expect(res.body.data.dataSource).toBe('real');
      expect(getNews).toHaveBeenCalledWith('600519.SH', undefined, 10);
    });

    it('源失败时诚实空（不回填硬编码宁德时代等种子）', async () => {
      (getNews as any).mockRejectedValue(new NewsUnavailableError('个股公告源不可用'));
      const app = buildApp();
      const res = await request(app).get('/api/news/stock/600519.SH');

      expect(res.status).toBe(200);
      expect(res.body.data.dataSource).toBe('unavailable');
      expect(res.body.data.items).toEqual([]);
    });
  });

  describe('GET /api/news/research/reports (研报)', () => {
    it('真实源可用时返回研报列表', async () => {
      (getResearchReports as any).mockResolvedValue([realReport]);
      const app = buildApp();
      const res = await request(app).get('/api/news/research/reports?symbol=600519&limit=5');

      expect(res.status).toBe(200);
      expect(res.body.data.items).toHaveLength(1);
      expect(res.body.data.items[0].title).toContain('需求根基稳固');
      expect(res.body.data.items[0].orgName).toBe('中邮证券');
      expect(res.body.data.dataSource).toBe('real');
    });

    it('研报源失败时诚实空', async () => {
      (getResearchReports as any).mockRejectedValue(new NewsUnavailableError('研报源不可用'));
      const app = buildApp();
      const res = await request(app).get('/api/news/research/reports');

      expect(res.status).toBe(200);
      expect(res.body.data.dataSource).toBe('unavailable');
      expect(res.body.data.items).toEqual([]);
    });
  });

  describe('GET /api/news/stats/overview (统计)', () => {
    it('真实源可用时聚合统计真实数据', async () => {
      (getNews as any).mockResolvedValue([
        { ...realFastNews, category: 'market', sentiment: 'positive', tags: ['大盘'] },
        { ...realFastNews, id: '2', category: 'global', sentiment: 'negative', tags: ['美股'] },
      ]);
      (getResearchReports as any).mockResolvedValue([realReport]);
      const app = buildApp();
      const res = await request(app).get('/api/news/stats/overview');

      expect(res.status).toBe(200);
      expect(res.body.data.total).toBe(2);
      expect(res.body.data.categories.market).toBe(1);
      expect(res.body.data.categories.global).toBe(1);
      expect(res.body.data.sentiments.positive).toBe(1);
      expect(res.body.data.sentiments.negative).toBe(1);
      expect(res.body.data.researchReportCount).toBe(1);
      expect(res.body.data.dataSource).toBe('real');
    });

    it('源失败时诚实空（total:0）', async () => {
      (getNews as any).mockRejectedValue(new NewsUnavailableError());
      const app = buildApp();
      const res = await request(app).get('/api/news/stats/overview');

      expect(res.status).toBe(200);
      expect(res.body.data.total).toBe(0);
      expect(res.body.data.dataSource).toBe('unavailable');
      expect(res.body.data.items).toBeUndefined();
    });
  });

  describe('诚实红线回归', () => {
    it('任何路径下都不返回「宁德时代固态电池」硬编码种子', async () => {
      (getNews as any).mockResolvedValue([]);
      const app = buildApp();
      const res = await request(app).get('/api/news');
      const json = JSON.stringify(res.body);
      expect(json.includes('宁德时代')).toBe(false);
      expect(json.includes('固态电池')).toBe(false);
      expect(json.includes('种子')).toBe(false);
    });

    it('不返回 url="#" 的伪造条目', async () => {
      (getNews as any).mockResolvedValue([realFastNews]);
      const app = buildApp();
      const res = await request(app).get('/api/news');
      const items = res.body.data.items || [];
      const hashUrlItems = items.filter((n: any) => n.url === '#');
      expect(hashUrlItems).toHaveLength(0);
    });
  });
});
