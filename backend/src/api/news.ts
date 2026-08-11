/**
 * 新闻与资讯 API 路由
 * 聚合多源新闻、个股关联、情感分析
 * 对标: Bloomberg Terminal NEWS, TradingView News
 *
 * 数据源（真实）：东方财富快讯 / 公告 / 研报（见 services/newsDataService）。
 * 遵守「诚实数据」红线：真实源不可达 → 降级为 dataSource:'unavailable' + items:[]，
 * 绝不 fallback 到伪造 demo 数据（原硬编码示例已移除）。
 */

import { Router, Request, Response } from 'express';
import { validateQuery, validateParams, schemas } from '../middleware/validation';
import { asyncHandler, sendSuccess, sendNotFound, sendPaginated } from '../utils/apiResponse';
import {
  getNews,
  getResearchReports,
  NewsUnavailableError,
  type NewsItem,
  type NewsCategory,
} from '../services/newsDataService';

const router = Router();

// ==================== 类型 ====================

interface NewsItemWithCred extends NewsItem {
  sourceCredibility: number;
}

// ==================== Bloomberg级: 新闻来源可信度权重 ====================
// 静态参考目录（媒体公开可信度评估，非时间序列数据）
const SOURCE_CREDIBILITY: Record<string, number> = {
  '新华社': 0.98, '新华财经': 0.95, '中国证券报': 0.93, '证券时报': 0.92,
  '中国人民银行': 0.99, '证监会': 0.99, '路透社': 0.95, '彭博社': 0.97,
  '东方财富': 0.85, '财联社': 0.88, '第一财经': 0.85, '华尔街见闻': 0.82,
  '21世纪经济报道': 0.83, '经济观察报': 0.82, '证券日报': 0.85,
  '东方财富研究所': 0.78, '东方财富快讯': 0.8,
  '雪球': 0.65, '同花顺': 0.7, '微博': 0.55, '微信公众号': 0.5,
};

function getSourceCredibility(source: string): number {
  // 模糊匹配：source 可能是「贵州茅台公告」这种带后缀的
  for (const [key, val] of Object.entries(SOURCE_CREDIBILITY)) {
    if (source.includes(key)) return val;
  }
  return 0.6;
}

// ==================== Bloomberg级: 去重逻辑 ====================

function titleSimilarity(a: string, b: string): number {
  const wordsA = new Set(a.split(/[\s,，。！？、]+/).filter(Boolean));
  const wordsB = new Set(b.split(/[\s,，。！？、]+/).filter(Boolean));
  const intersection = new Set([...wordsA].filter(x => wordsB.has(x)));
  const union = new Set([...wordsA, ...wordsB]);
  return union.size > 0 ? intersection.size / union.size : 0;
}

function deduplicateNews(news: NewsItem[]): NewsItem[] {
  const seen: NewsItem[] = [];
  return news.filter(item => {
    const isDuplicate = seen.some(existing =>
      titleSimilarity(item.title, existing.title) > 0.7 &&
      Math.abs(new Date(item.publishTime).getTime() - new Date(existing.publishTime).getTime()) < 86400000
    );
    if (!isDuplicate) seen.push(item);
    return !isDuplicate;
  });
}

// ==================== Bloomberg级: 相关性评分 ====================

function relevanceScore(news: NewsItem): number {
  const now = Date.now();
  const ageHours = Math.max(0, (now - new Date(news.publishTime).getTime()) / 3600000);
  const timeScore = Math.exp(-ageHours / 24);
  const credScore = getSourceCredibility(news.source);
  const viewScore = Math.min(1, Math.log10(Math.max(1, news.viewCount)) / 5);
  const sentimentBoost = 1 + Math.abs(news.sentimentScore) * 0.3;
  return timeScore * 0.35 + credScore * 0.25 + viewScore * 0.2 + sentimentBoost * 0.2;
}

// ==================== 获取新闻列表 ====================

router.get('/news', validateQuery(schemas.newsQuery), asyncHandler(async (req: Request, res: Response) => {
  const page = parseInt(req.query.page as string) || 1;
  const pageSize = parseInt(req.query.pageSize as string) || 20;
  const category = req.query.category as string;
  const symbol = req.query.symbol as string;
  const sentiment = req.query.sentiment as string;
  const search = (req.query.q as string || '').trim();
  const sortBy = (req.query.sortBy as string) || 'relevance';

  // 真实源路径：失败时降级为诚实空，绝不 fallback 伪造 demo
  let realNews: NewsItem[] = [];
  let dataSource: 'real' | 'unavailable' = 'real';
  let unavailableMessage = '';

  try {
    realNews = await getNews(symbol || undefined, category as NewsCategory | undefined, pageSize * 2);
  } catch (e) {
    if (e instanceof NewsUnavailableError) {
      dataSource = 'unavailable';
      unavailableMessage = e.message;
    } else {
      throw e;
    }
  }

  if (dataSource === 'unavailable') {
    // 诚实空：返回空 items + dataSource:'unavailable'，绝不 fallback 伪造 demo
    sendSuccess(res, {
      items: [],
      pagination: { page, pageSize, totalCount: 0, totalPages: 0 },
      dataSource: 'unavailable',
      message: unavailableMessage,
    });
    return;
  }

  let filtered = deduplicateNews([...realNews]);

  // 分类筛选
  if (category && category !== 'all') {
    filtered = filtered.filter((n) => n.category === category);
  }

  // 个股筛选（symbol 路径已在 service 层过滤，但保留前端通用筛选能力）
  if (symbol) {
    const symbolClean = symbol.replace(/\.(SZ|SH|BJ)$/, '');
    filtered = filtered.filter((n) =>
      n.relatedSymbols.includes(symbol) ||
      n.title.includes(symbolClean) ||
      n.summary.includes(symbolClean)
    );
  }

  // 情感筛选
  if (sentiment && sentiment !== 'all') {
    filtered = filtered.filter((n) => n.sentiment === sentiment);
  }

  // 搜索
  if (search) {
    const searchLower = search.toLowerCase();
    filtered = filtered.filter((n) =>
      n.title.toLowerCase().includes(searchLower) ||
      n.summary.toLowerCase().includes(searchLower) ||
      n.tags.some((t) => t.toLowerCase().includes(searchLower))
    );
  }

  // 排序: relevance (综合评分) 或 time (纯时间)
  if (sortBy === 'relevance') {
    filtered.sort((a, b) => relevanceScore(b) - relevanceScore(a));
  } else {
    filtered.sort((a, b) => new Date(b.publishTime).getTime() - new Date(a.publishTime).getTime());
  }

  // 注入源可信度字段
  const total = filtered.length;
  const start = (page - 1) * pageSize;
  const itemsWithCred: NewsItemWithCred[] = filtered.slice(start, start + pageSize).map(n => ({
    ...n,
    sourceCredibility: getSourceCredibility(n.source),
  }));

  sendPaginated(res, itemsWithCred, page, pageSize, total);
}));

// ==================== 获取个股相关新闻 ====================

router.get('/news/stock/:symbol', validateParams(schemas.stockSymbol), asyncHandler(async (req: Request, res: Response) => {
  const symbol = req.params.symbol;
  const limit = parseInt(req.query.limit as string) || 10;

  try {
    const items = await getNews(symbol, undefined, limit);
    sendSuccess(res, { items, symbol, dataSource: 'real' as const });
  } catch (e) {
    if (e instanceof NewsUnavailableError) {
      sendSuccess(res, {
        items: [],
        symbol,
        dataSource: 'unavailable' as const,
        message: e.message,
      });
      return;
    }
    throw e;
  }
}));

// ==================== 获取新闻详情 ====================
// 注：原 MOCK_NEWS 详情接口已废弃。真实新闻通过 url 字段跳转源站阅读，
// 后端不再伪造「详情正文」。如需正文，应通过 url 抓取（暂未实现）。

router.get('/news/:id', asyncHandler(async (req: Request, res: Response) => {
  // 诚实空：无独立详情源，避免返回伪造正文
  sendNotFound(res, '新闻详情（请通过列表项 url 字段访问源站）');
}));

// ==================== 获取研报列表 ====================

router.get('/news/research/reports', asyncHandler(async (req: Request, res: Response) => {
  const symbol = req.query.symbol as string | undefined;
  const limit = parseInt(req.query.limit as string) || 20;

  try {
    const items = await getResearchReports(symbol, limit);
    sendSuccess(res, { items, dataSource: 'real' as const });
  } catch (e) {
    if (e instanceof NewsUnavailableError) {
      sendSuccess(res, {
        items: [],
        dataSource: 'unavailable' as const,
        message: e.message,
      });
      return;
    }
    throw e;
  }
}));

// ==================== 获取新闻分类统计 ====================

router.get('/news/stats/overview', asyncHandler(async (_req: Request, res: Response) => {
  // 真实源：基于快讯 + 研报实时聚合统计；失败诚实空
  try {
    const [news, reports] = await Promise.all([
      getNews(undefined, undefined, 50),
      getResearchReports(undefined, 50).catch(() => []),
    ]);

    const categories: Record<string, number> = {};
    const sentiments = { positive: 0, negative: 0, neutral: 0 };

    for (const n of news) {
      categories[n.category] = (categories[n.category] || 0) + 1;
      sentiments[n.sentiment]++;
    }

    const tagCount = new Map<string, number>();
    for (const n of news) {
      for (const tag of n.tags) {
        tagCount.set(tag, (tagCount.get(tag) || 0) + 1);
      }
    }
    const hotTags = Array.from(tagCount.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([tag, count]) => ({ tag, count }));

    sendSuccess(res, {
      total: news.length,
      categories,
      sentiments,
      hotTags,
      researchReportCount: reports.length,
      dataSource: 'real' as const,
    });
  } catch (e) {
    if (e instanceof NewsUnavailableError) {
      sendSuccess(res, {
        total: 0,
        categories: {},
        sentiments: { positive: 0, negative: 0, neutral: 0 },
        hotTags: [],
        researchReportCount: 0,
        dataSource: 'unavailable' as const,
        message: e.message,
      });
      return;
    }
    throw e;
  }
}));

export default router;
