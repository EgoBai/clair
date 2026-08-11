/**
 * 新闻与研报数据服务（真实源版）
 *
 * 数据来源（东方财富，免 key）：
 * - 全市场快讯（7×24）：np-listapi.eastmoney.com getFastNewsList（biz=web_724）
 * - 个股公告：np-anotice-stock.eastmoney.com api/security/ann（按 stock_list 过滤）
 * - 研报列表：reportapi.eastmoney.com report/list（可按 code 过滤个股）
 *
 * 遵守「诚实数据」红线：真实源不可达 → 抛出 NewsUnavailableError，
 * 由路由层降级为 dataSource:'unavailable'，绝不回填伪造/随机数据。
 */

/** 真实新闻/研报源不可用时抛出，供路由层降级为「诚实空」。 */
export class NewsUnavailableError extends Error {
  constructor(msg = '新闻/研报真实源暂不可用（后端未接入或网络受限）') {
    super(msg);
    this.name = 'NewsUnavailableError';
  }
}

export type NewsCategory = 'market' | 'company' | 'policy' | 'global' | 'analysis';

export interface NewsItem {
  id: string;
  title: string;
  summary: string;
  source: string;
  url: string;
  publishTime: string; // ISO 时间
  category: NewsCategory;
  sentiment: 'positive' | 'negative' | 'neutral';
  sentimentScore: number;
  relatedSymbols: string[];
  tags: string[];
  viewCount: number;
}

export interface ResearchReport {
  id: string;
  title: string;
  stockName: string;
  stockCode: string;
  orgName: string; // 研究机构
  publishDate: string;
  rating: string; // 评级（买入/增持/中性 等）
  predictThisYearEps: number;
  predictThisYearPe: number;
  predictNextYearEps: number;
  predictNextYearPe: number;
  industryName: string;
  url: string;
}

const FETCH_TIMEOUT_MS = 8000;
const NEWS_CACHE_TTL_MS = 60_000; // 60s
const REPORT_CACHE_TTL_MS = 120_000; // 2min

/** 带超时的 JSON 抓取（复用 etfDataService / financialsDataService 风格） */
async function fetchJson(url: string, headers?: Record<string, string>): Promise<any> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    const resp = await fetch(url, { signal: ctrl.signal, headers });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    return await resp.json();
  } finally {
    clearTimeout(timer);
  }
}

/** 将多种符号格式归一化为东财所需的 digits（600519）和 secucode（600519.SH） */
function normalizeSymbol(symbol: string): { digits: string; secucode: string } | null {
  const trimmed = (symbol || '').trim().toUpperCase();
  if (!trimmed) return null;
  const digits = trimmed.replace(/^(SH|SZ|BJ)/, '').replace(/\.(SH|SZ|BJ)$/, '');
  if (!/^\d{6}$/.test(digits)) return null;
  let market: 'SH' | 'SZ' | 'BJ';
  if (trimmed.startsWith('SH') || trimmed.endsWith('.SH') || digits.startsWith('6')) market = 'SH';
  else if (trimmed.startsWith('SZ') || trimmed.endsWith('.SZ') || digits.startsWith('0') || digits.startsWith('3') || digits.startsWith('2')) market = 'SZ';
  else market = 'BJ';
  return { digits, secucode: `${digits}.${market}` };
}

/** 简单情绪打分：基于关键词的诚实启发式（非 AI 模型，结果用作排序加权，不冒充真实情绪引擎） */
function sentimentHeuristic(title: string, summary: string): { sentiment: 'positive' | 'negative' | 'neutral'; sentimentScore: number } {
  const text = `${title} ${summary}`;
  const positiveKeywords = ['大涨', '暴涨', '涨停', '增长', '超预期', '突破', '新高', '利好', '回升', '回暖', '放量', '加仓', '增持', '买入', '强推'];
  const negativeKeywords = ['大跌', '暴跌', '跌停', '下滑', '亏损', '下降', '不及预期', '破位', '新低', '利空', '承压', '下行', '减持', '下调', '警示', '风险'];
  let score = 0;
  for (const kw of positiveKeywords) if (text.includes(kw)) score += 1;
  for (const kw of negativeKeywords) if (text.includes(kw)) score -= 1;
  let sentiment: 'positive' | 'negative' | 'neutral';
  if (score > 0) sentiment = 'positive';
  else if (score < 0) sentiment = 'negative';
  else sentiment = 'neutral';
  // 归一化到 [-1, 1]（最大 ±3 关键词饱和）
  const sentimentScore = Math.max(-1, Math.min(1, score / 3));
  return { sentiment, sentimentScore };
}

// ==================== 全市场快讯（7×24）====================

const fastNewsCache = { ts: 0, items: [] as NewsItem[] };

async function fetchFastNews(limit: number): Promise<NewsItem[]> {
  const url =
    `https://np-listapi.eastmoney.com/comm/web/getFastNewsList` +
    `?client=web&biz=web_724&fastColumn=102&sortEnd=&pageSize=${Math.min(limit, 50)}&req_trace=1`;
  const json = await fetchJson(url, {
    'User-Agent': 'Mozilla/5.0',
    Referer: 'https://finance.eastmoney.com',
  });
  const list: any[] = json?.data?.fastNewsList ?? [];
  return list.map((item) => {
    const title = String(item.title || '');
    const summary = String(item.summary || item.content || '').substring(0, 200);
    const { sentiment, sentimentScore } = sentimentHeuristic(title, summary);
    const showTime = String(item.showTime || '');
    // showTime 形如 "2026-08-12 02:30:00" 或 "10:30"
    const publishTime = /^\d{4}-\d{2}-\d{2}/.test(showTime)
      ? new Date(showTime.replace(' ', 'T')).toISOString()
      : new Date().toISOString();
    return {
      id: String(item.code || item.realSort || ''),
      title,
      summary,
      source: String(item.source || '东方财富快讯'),
      url: item.art_code ? `https://finance.eastmoney.com/a/${item.art_code}.html` : '#',
      publishTime,
      category: 'market' as NewsCategory,
      sentiment,
      sentimentScore,
      relatedSymbols: [] as string[],
      tags: [] as string[],
      viewCount: Number(item.viewCount || 0),
    };
  });
}

// ==================== 个股公告 ====================

async function fetchStockAnnouncements(digits: string, limit: number): Promise<NewsItem[]> {
  const url =
    `https://np-anotice-stock.eastmoney.com/api/security/ann` +
    `?sr=-1&page_size=${Math.min(limit, 50)}&page_index=1&ann_type=A&client_source=web&stock_list=${digits}`;
  const json = await fetchJson(url, {
    'User-Agent': 'Mozilla/5.0',
    Referer: 'https://data.eastmoney.com',
  });
  const list: any[] = json?.data?.list ?? [];
  return list.map((item) => {
    const title = String(item.title || item.title_ch || '');
    const summary = String(item.title_ch || item.title || '').substring(0, 200);
    const { sentiment, sentimentScore } = sentimentHeuristic(title, summary);
    const noticeDate = String(item.notice_date || item.display_time || '');
    const publishTime = /^\d{4}-\d{2}-\d{2}/.test(noticeDate)
      ? new Date(noticeDate.replace(' ', 'T').split('.')[0]).toISOString()
      : new Date().toISOString();
    const artCode = String(item.art_code || '');
    const codes: any[] = item.codes ?? [];
    const stockCode = codes[0]?.stock_code || digits;
    const shortName = codes[0]?.short_name || '';
    return {
      id: artCode,
      title,
      summary,
      source: shortName ? `${shortName}公告` : '东方财富公告',
      url: artCode ? `https://data.eastmoney.com/notices/detail/${stockCode}/${artCode}.html` : '#',
      publishTime,
      category: 'company' as NewsCategory,
      sentiment,
      sentimentScore,
      relatedSymbols: stockCode ? [stockCode] : [],
      tags: (item.columns ?? []).map((c: any) => String(c.column_name || '')).filter(Boolean),
      viewCount: 0,
    };
  });
}

// ==================== 主入口：获取新闻列表 ====================

/**
 * 获取新闻列表（真实源）。
 * - 指定 symbol：返回该个股公告；
 * - 未指定 symbol：返回全市场 7×24 快讯。
 * 源失败时抛出 NewsUnavailableError，由调用方降级为诚实空。
 */
export async function getNews(
  symbol?: string,
  _category?: NewsCategory,
  limit: number = 20,
): Promise<NewsItem[]> {
  const safeLimit = Math.max(1, Math.min(limit, 50));

  // 个股路径
  if (symbol) {
    const norm = normalizeSymbol(symbol);
    if (!norm) {
      throw new NewsUnavailableError(`无效的股票代码: ${symbol}`);
    }
    try {
      return await fetchStockAnnouncements(norm.digits, safeLimit);
    } catch (e) {
      throw new NewsUnavailableError(e instanceof Error ? e.message : '个股公告源不可用');
    }
  }

  // 全市场快讯路径（带 60s 缓存）
  if (Date.now() - fastNewsCache.ts < NEWS_CACHE_TTL_MS && fastNewsCache.items.length > 0) {
    return fastNewsCache.items.slice(0, safeLimit);
  }
  try {
    const items = await fetchFastNews(safeLimit);
    fastNewsCache.ts = Date.now();
    fastNewsCache.items = items;
    return items;
  } catch (e) {
    throw new NewsUnavailableError(e instanceof Error ? e.message : '快讯源不可用');
  }
}

// ==================== 研报列表 ====================

const reportCache = { ts: 0, symbol: '', items: [] as ResearchReport[] };

function buildReportUrl(symbol: string | undefined, limit: number, pageNo: number = 1): string {
  const today = new Date();
  const endTime = today.toISOString().slice(0, 10).replace(/-/g, '');
  const begin = new Date(today.getTime() - 180 * 86400000);
  const beginTime = begin.toISOString().slice(0, 10).replace(/-/g, '');
  const params = new URLSearchParams({
    industryCode: '*',
    pageSize: String(Math.min(limit, 50)),
    industry: '*',
    rating: '*',
    ratingChange: '*',
    beginTime,
    endTime,
    pageNo: String(pageNo),
    fields: '',
    qType: '0',
    orgCode: '',
    rptCode: '',
    _: String(Date.now()),
  });
  if (symbol) {
    const norm = normalizeSymbol(symbol);
    if (norm) params.set('code', norm.digits);
  }
  return `https://reportapi.eastmoney.com/report/list?${params.toString()}`;
}

function mapReport(r: any): ResearchReport {
  return {
    id: String(r.infoCode || ''),
    title: String(r.title || ''),
    stockName: String(r.stockName || ''),
    stockCode: String(r.stockCode || ''),
    orgName: String(r.orgSName || r.orgName || ''),
    publishDate: String(r.publishDate || '').slice(0, 10),
    rating: String(r.emRatingName || ''),
    predictThisYearEps: Number(r.predictThisYearEps) || 0,
    predictThisYearPe: Number(r.predictThisYearPe) || 0,
    predictNextYearEps: Number(r.predictNextYearEps) || 0,
    predictNextYearPe: Number(r.predictNextYearPe) || 0,
    industryName: String(r.indvInduName || r.industryName || ''),
    url: r.infoCode ? `https://data.eastmoney.com/report/zw_stock.jshtml?infoCode=${r.infoCode}` : '#',
  };
}

/**
 * 获取研报列表（真实源）。
 * - 指定 symbol：返回该个股相关研报；
 * - 未指定 symbol：返回全市场最新研报。
 * 源失败时抛出 NewsUnavailableError。
 */
export async function getResearchReports(
  symbol?: string,
  limit: number = 20,
): Promise<ResearchReport[]> {
  const safeLimit = Math.max(1, Math.min(limit, 50));
  const normSymbol = symbol ? normalizeSymbol(symbol)?.digits : '';

  // 缓存命中
  if (
    Date.now() - reportCache.ts < REPORT_CACHE_TTL_MS &&
    reportCache.symbol === (normSymbol || '') &&
    reportCache.items.length > 0
  ) {
    return reportCache.items.slice(0, safeLimit);
  }

  try {
    const url = buildReportUrl(normSymbol, safeLimit);
    const json = await fetchJson(url, {
      'User-Agent': 'Mozilla/5.0',
      Referer: 'https://data.eastmoney.com',
    });
    const rows: any[] = json?.data ?? [];
    if (!Array.isArray(rows) || rows.length === 0) {
      throw new NewsUnavailableError(symbol ? `未获取到 ${symbol} 的研报数据` : '研报源返回空');
    }
    const items = rows.map(mapReport);
    reportCache.ts = Date.now();
    reportCache.symbol = normSymbol || '';
    reportCache.items = items;
    return items;
  } catch (e) {
    if (e instanceof NewsUnavailableError) throw e;
    throw new NewsUnavailableError(e instanceof Error ? e.message : '研报源不可用');
  }
}

/** 清除缓存（测试用） */
export function clearNewsCache(): void {
  fastNewsCache.ts = 0;
  fastNewsCache.items = [];
  reportCache.ts = 0;
  reportCache.symbol = '';
  reportCache.items = [];
}
