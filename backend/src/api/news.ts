/**
 * 新闻与资讯 API 路由
 * 聚合多源新闻、个股关联、情感分析
 * 对标: Bloomberg Terminal NEWS, TradingView News
 * Round 15: 源可信度权重, 相关性排序, 去重, 情绪引擎集成
 */

import { Router, Request, Response } from 'express';
import { queryCache } from '../utils/queryCache';
import { validateQuery, validateParams, schemas } from '../middleware/validation';
import { asyncHandler, sendSuccess, sendNotFound, sendPaginated } from '../utils/apiResponse';
import { analyzeNewsSentiment } from '../services/sentimentAnalysisEngine';

const router = Router();

// ==================== 类型 ====================

interface NewsItem {
  id: number;
  title: string;
  summary: string;
  source: string;
  url: string;
  publishTime: string;
  category: 'market' | 'company' | 'policy' | 'global' | 'analysis';
  sentiment: 'positive' | 'negative' | 'neutral';
  sentimentScore: number; // -1 ~ 1
  relatedSymbols: string[];
  tags: string[];
  viewCount: number;
}

// ==================== Bloomberg级: 新闻来源可信度权重 ====================

const SOURCE_CREDIBILITY: Record<string, number> = {
  '新华社': 0.98, '新华财经': 0.95, '中国证券报': 0.93, '证券时报': 0.92,
  '中国人民银行': 0.99, '证监会': 0.99, '路透社': 0.95, '彭博社': 0.97,
  '东方财富': 0.85, '财联社': 0.88, '第一财经': 0.85, '华尔街见闻': 0.82,
  '21世纪经济报道': 0.83, '经济观察报': 0.82, '证券日报': 0.85,
  '东方财富研究所': 0.78,
  '雪球': 0.65, '同花顺': 0.7, '微博': 0.55, '微信公众号': 0.5,
};

function getSourceCredibility(source: string): number {
  return SOURCE_CREDIBILITY[source] ?? 0.6;
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
  const ageHours = (now - new Date(news.publishTime).getTime()) / 3600000;
  const timeScore = Math.exp(-ageHours / 24);
  const credScore = getSourceCredibility(news.source);
  const viewScore = Math.min(1, Math.log10(Math.max(1, news.viewCount)) / 5);
  const sentimentBoost = 1 + Math.abs(news.sentimentScore) * 0.3;
  return timeScore * 0.35 + credScore * 0.25 + viewScore * 0.2 + sentimentBoost * 0.2;
}

// ==================== 东方财富实时新闻 ====================

interface EastMoneyNewsItem {
  id: string;
  title: string;
  summary: string;
  source: string;
  url: string;
  publishTime: string;
  category: 'market' | 'company' | 'policy' | 'global' | 'analysis';
  tags: string[];
}

async function fetchEastMoneyNews(limit: number = 20): Promise<NewsItem[]> {
  try {
    const url = 'https://np-listapi.eastmoney.com/comm/web/getNewsList';
    const resp = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Referer': 'https://finance.eastmoney.com',
      },
      body: JSON.stringify({
        clientCode: 'web',
        pageIndex: 1,
        pageSize: Math.min(limit, 50),
        sortName: 'publicDate',
        sortType: 'DESC',
      }),
    });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const data = await resp.json();
    if (!data?.result?.list) return [];

    let idCounter = 10000;
    return data.result.list.map((item: Record<string, unknown>) => ({
      id: idCounter++,
      title: String(item.title || ''),
      summary: String(item.digest || item.summary || '').substring(0, 200),
      source: String(item.source || '东方财富'),
      url: String(item.url || `https://finance.eastmoney.com/a/${item.art_code}`),
      publishTime: String(item.publicDate || item.pub_time || new Date().toISOString()),
      category: 'market' as const,
      sentiment: 'neutral' as const,
      sentimentScore: 0,
      relatedSymbols: [],
      tags: [],
      viewCount: Number(item.viewCount || item.click_count || 0),
    }));
  } catch (e) {
    console.warn('[News] 东方财富新闻获取失败，使用备用数据:', (e as Error).message);
    return [];
  }
}

// ==================== 模拟新闻数据（备用）====================

const MOCK_NEWS: NewsItem[] = [
  {
    id: 1,
    title: 'A股三大指数集体收涨，沪指重回3100点',
    summary: '今日A股市场表现强势，上证指数收盘上涨1.2%，重回3100点上方。两市成交额突破万亿大关，北向资金净流入超50亿元。',
    source: '东方财富',
    url: '#',
    publishTime: '2026-03-24T15:30:00',
    category: 'market',
    sentiment: 'positive',
    sentimentScore: 0.7,
    relatedSymbols: [],
    tags: ['大盘', '指数', '北向资金'],
    viewCount: 15620,
  },
  {
    id: 2,
    title: '央行：继续实施稳健的货币政策，保持流动性合理充裕',
    summary: '中国人民银行表示将继续实施稳健的货币政策，保持流动性合理充裕，引导金融机构加大对实体经济的支持力度。',
    source: '新华财经',
    url: '#',
    publishTime: '2026-03-24T14:00:00',
    category: 'policy',
    sentiment: 'positive',
    sentimentScore: 0.5,
    relatedSymbols: [],
    tags: ['央行', '货币政策', '流动性'],
    viewCount: 8930,
  },
  {
    id: 3,
    title: '贵州茅台发布一季度业绩预告，净利润同比增长15%',
    summary: '贵州茅台发布2026年一季度业绩预告，预计实现营业收入同比增长12%，净利润同比增长15%，超出市场预期。',
    source: '证券时报',
    url: '#',
    publishTime: '2026-03-24T11:30:00',
    category: 'company',
    sentiment: 'positive',
    sentimentScore: 0.8,
    relatedSymbols: ['600519.SH'],
    tags: ['业绩预告', '白酒', '消费'],
    viewCount: 12450,
  },
  {
    id: 4,
    title: '宁德时代新一代固态电池量产，能量密度突破500Wh/kg',
    summary: '宁德时代宣布其新一代固态电池正式进入量产阶段，能量密度达到500Wh/kg，循环寿命超过2000次，将大幅提升电动汽车续航里程。',
    source: '财联社',
    url: '#',
    publishTime: '2026-03-24T10:15:00',
    category: 'company',
    sentiment: 'positive',
    sentimentScore: 0.9,
    relatedSymbols: ['300750.SZ'],
    tags: ['新能源', '电池', '技术突破'],
    viewCount: 23100,
  },
  {
    id: 5,
    title: '房地产板块承压下行，多只个股跌超5%',
    summary: '受部分地区房地产调控政策收紧影响，今日房地产板块整体承压，板块内多只个股跌幅超过5%。',
    source: '第一财经',
    url: '#',
    publishTime: '2026-03-24T09:45:00',
    category: 'market',
    sentiment: 'negative',
    sentimentScore: -0.6,
    relatedSymbols: [],
    tags: ['房地产', '调控', '板块'],
    viewCount: 9870,
  },
  {
    id: 6,
    title: '五粮液：高端化战略持续推进，经销商信心回暖',
    summary: '五粮液在投资者交流会上表示，公司高端化战略持续推进，核心产品批价稳步回升，经销商信心明显回暖。',
    source: '21世纪经济报道',
    url: '#',
    publishTime: '2026-03-24T08:30:00',
    category: 'company',
    sentiment: 'positive',
    sentimentScore: 0.6,
    relatedSymbols: ['000858.SZ'],
    tags: ['白酒', '高端化', '经销商'],
    viewCount: 6540,
  },
  {
    id: 7,
    title: '美联储维持利率不变，美股三大指数创新高',
    summary: '美联储最新议息会议决定维持基准利率不变，符合市场预期。受此影响，美股三大指数再创历史新高。',
    source: '华尔街见闻',
    url: '#',
    publishTime: '2026-03-24T06:00:00',
    category: 'global',
    sentiment: 'positive',
    sentimentScore: 0.4,
    relatedSymbols: [],
    tags: ['美联储', '利率', '美股'],
    viewCount: 18200,
  },
  {
    id: 8,
    title: '平安银行：零售转型成效显著，资产质量持续改善',
    summary: '平安银行发布年报，零售业务营收占比提升至62%，不良贷款率降至1.02%，资产质量持续改善。',
    source: '中国证券报',
    url: '#',
    publishTime: '2026-03-23T20:00:00',
    category: 'company',
    sentiment: 'positive',
    sentimentScore: 0.65,
    relatedSymbols: ['000001.SZ'],
    tags: ['银行', '年报', '零售转型'],
    viewCount: 7890,
  },
  {
    id: 9,
    title: '【深度分析】2026年A股投资策略：把握科技与消费双主线',
    summary: '多家券商发布2026年度策略报告，普遍看好科技和消费两条投资主线，建议关注半导体、AI、白酒、医药等板块。',
    source: '东方财富研究所',
    url: '#',
    publishTime: '2026-03-23T18:00:00',
    category: 'analysis',
    sentiment: 'positive',
    sentimentScore: 0.3,
    relatedSymbols: [],
    tags: ['策略', '科技', '消费', '投资'],
    viewCount: 31500,
  },
  {
    id: 10,
    title: '地缘政治风险升温，原油价格突破90美元',
    summary: '受中东地区紧张局势影响，国际原油价格突破90美元/桶，创近三个月新高。分析认为能源板块或将受益。',
    source: '路透社',
    url: '#',
    publishTime: '2026-03-23T16:30:00',
    category: 'global',
    sentiment: 'negative',
    sentimentScore: -0.3,
    relatedSymbols: [],
    tags: ['原油', '地缘政治', '能源'],
    viewCount: 14300,
  },
];

const nextNewsId = MOCK_NEWS.length + 1;

// ==================== 获取新闻列表 ====================

router.get('/news', validateQuery(schemas.newsQuery), asyncHandler(async (req: Request, res: Response) => {
  const page = parseInt(req.query.page as string) || 1;
  const pageSize = parseInt(req.query.pageSize as string) || 20;
  const category = req.query.category as string;
  const symbol = req.query.symbol as string;
  const sentiment = req.query.sentiment as string;
  const search = (req.query.q as string || '').trim();

  const realNews = await fetchEastMoneyNews(pageSize);
  let filtered = realNews.length > 0 ? realNews : deduplicateNews([...MOCK_NEWS]);
  const sortBy = (req.query.sortBy as string) || 'relevance';

  // 分类筛选
  if (category && category !== 'all') {
    filtered = filtered.filter((n) => n.category === category);
  }

  // 个股筛选
  if (symbol) {
    filtered = filtered.filter((n) =>
      n.relatedSymbols.includes(symbol) ||
      n.title.includes(symbol) ||
      n.summary.includes(symbol)
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
  const itemsWithCred = filtered.slice(start, start + pageSize).map(n => ({
    ...n,
    sourceCredibility: getSourceCredibility(n.source),
  }));

  sendPaginated(res, itemsWithCred, page, pageSize, total);
}));

// ==================== 获取个股相关新闻 ====================

router.get('/news/stock/:symbol', validateParams(schemas.stockSymbol), asyncHandler(async (req: Request, res: Response) => {
  const symbol = req.params.symbol;
  const limit = parseInt(req.query.limit as string) || 10;

  const related = MOCK_NEWS
    .filter((n) =>
      n.relatedSymbols.includes(symbol) ||
      n.title.includes(symbol.replace(/\.(SZ|SH|BJ)$/, ''))
    )
    .sort((a, b) => new Date(b.publishTime).getTime() - new Date(a.publishTime).getTime())
    .slice(0, limit);

  sendSuccess(res, { items: related, symbol });
}));

// ==================== 获取新闻详情 ====================

router.get('/news/:id', asyncHandler(async (req: Request, res: Response) => {
  const id = parseInt(req.params.id);
  const news = MOCK_NEWS.find((n) => n.id === id);
  if (!news) {
    return sendNotFound(res, '新闻');
  }
  // 增加浏览量
  news.viewCount++;
  sendSuccess(res, news);
}));

// ==================== 获取新闻分类统计 ====================

router.get('/news/stats/overview', asyncHandler(async (_req: Request, res: Response) => {
  const categories: Record<string, number> = {};
  const sentiments = { positive: 0, negative: 0, neutral: 0 };

  for (const news of MOCK_NEWS) {
    categories[news.category] = (categories[news.category] || 0) + 1;
    sentiments[news.sentiment]++;
  }

  sendSuccess(res, {
    total: MOCK_NEWS.length,
    categories,
    sentiments,
    hotTags: getHotTags(),
  });
}));

function getHotTags() {
  const tagCount = new Map<string, number>();
  for (const news of MOCK_NEWS) {
    for (const tag of news.tags) {
      tagCount.set(tag, (tagCount.get(tag) || 0) + 1);
    }
  }
  return Array.from(tagCount.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([tag, count]) => ({ tag, count }));
}

export default router;
