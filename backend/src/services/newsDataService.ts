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

/** 单篇研报正文（真实源：东方财富研报正文页 zwinfo.notice_content）。 */
export interface ResearchReportDetail {
  id: string;
  title: string;
  stockCode: string;
  stockName: string;
  orgName: string;
  authors: string[];
  publishDate: string;
  industryName: string;
  paragraphs: string[];
  paragraphCount: number;
  pages: number | null;
  pdfUrl: string;
  sourceUrl: string;
  fetchedAt: string;
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

/** 带超时的文本抓取（东财搜索接口返回 JSONP，不是 JSON） */
async function fetchText(url: string, headers?: Record<string, string>): Promise<string> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    const resp = await fetch(url, { signal: ctrl.signal, headers });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    return await resp.text();
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

// ==================== 个股新闻（东财资讯搜索） ====================

/**
 * 个股新闻：东方财富资讯搜索（与 Worker fetchStockNewsBySearch 同源同口径）。
 *
 * 为什么不复用 getNews(symbol)：getNews 的个股分支真实源是「公告库」，
 * 与公告 tab 完全重复。新闻 tab 必须走资讯搜索，取不到就诚实空。
 */
export async function getStockNews(symbol: string, limit: number = 20): Promise<NewsItem[]> {
  const norm = normalizeSymbol(symbol);
  if (!norm) throw new NewsUnavailableError(`无效的股票代码: ${symbol}`);
  const pageSize = Math.max(1, Math.min(limit, 20));
  const param = {
    uid: '',
    keyword: norm.digits,
    type: ['cmsArticleWebOld'],
    client: 'web',
    clientType: 'web',
    clientVersion: 'curr',
    param: {
      cmsArticleWebOld: {
        searchScope: 'default',
        sort: 'default',
        pageIndex: 1,
        pageSize,
        preTag: '<em>',
        postTag: '</em>',
      },
    },
  };
  const url = `https://search-api-web.eastmoney.com/search/jsonp?cb=jQuery&param=${encodeURIComponent(JSON.stringify(param))}`;
  const text = (await fetchText(url, {
    'User-Agent': 'Mozilla/5.0',
    Referer: 'https://so.eastmoney.com',
  })).trim();
  if (text.startsWith('<')) throw new NewsUnavailableError('东财资讯搜索被拦截（返回 HTML）');
  const matched = text.match(/jQuery\(([\s\S]*)\)\s*$/);
  const data = JSON.parse(matched ? matched[1] : text);
  const list: any[] = data?.result?.cmsArticleWebOld ?? [];
  if (!Array.isArray(list) || list.length === 0) {
    throw new NewsUnavailableError('东财资讯搜索未返回该标的的新闻');
  }
  const strip = (s: unknown) => String(s || '').replace(/<\/?em>/g, '').replace(/\s+/g, ' ').trim();
  const items = list.slice(0, pageSize).map((it) => {
    const title = strip(it.title);
    const content = strip(it.content);
    const { sentiment, sentimentScore } = sentimentHeuristic(title, content);
    const rawTime = String(it.date || '');
    const parsed = rawTime ? new Date(rawTime.replace(' ', 'T')) : null;
    return {
      id: String(it.code || ''),
      title,
      summary: content.length > 120 ? content.slice(0, 120) + '…' : content,
      source: String(it.mediaName || '东方财富'),
      url: String(it.url || ''),
      publishTime: parsed && Number.isFinite(parsed.getTime()) ? parsed.toISOString() : rawTime,
      category: 'company' as NewsCategory,
      sentiment,
      sentimentScore,
      relatedSymbols: [norm.digits],
      tags: [],
      viewCount: 0,
    };
  }).filter((i) => i.title);
  if (items.length === 0) throw new NewsUnavailableError('东财资讯搜索结果为空');
  return items;
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

/**
 * 解析东方财富研报正文页里的 `var zwinfo={...}`。
 * 页面参数必须是小写 `infocode`；大写 `infoCode` 会得到 404 页。
 */
function parseResearchReportDetailHtml(html: string, infoCode: string): ResearchReportDetail | null {
  const marker = html.indexOf('var zwinfo=');
  if (marker < 0) return null;
  const start = html.indexOf('{', marker);
  const end = html.indexOf('};', start);
  if (start < 0 || end < 0 || end <= start) return null;
  let info: any;
  try {
    info = JSON.parse(html.slice(start, end + 1));
  } catch {
    return null;
  }
  if (!info || typeof info !== 'object') return null;

  const paragraphs = String(info.notice_content || '')
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((line) => line.replace(/\u3000/g, ' ').replace(/\s+$/g, '').trim())
    .filter(Boolean);
  if (!paragraphs.length) return null;

  const security = Array.isArray(info.security) && info.security.length ? info.security[0] : null;
  const relation = security && Array.isArray(security.publish_relation) && security.publish_relation.length
    ? security.publish_relation[0]
    : null;
  const authors = String(info.researcher || '')
    .split(/[,，;；]/)
    .map((s) => s.trim())
    .filter(Boolean);
  const pagesRaw = info.attach_pages;
  const pages = pagesRaw !== null && pagesRaw !== undefined && String(pagesRaw).trim() !== ''
    ? Number(pagesRaw)
    : null;

  return {
    id: String(info.info_code || infoCode),
    title: String(info.notice_title || '').trim(),
    stockCode: String((security && security.stock) || ''),
    stockName: String((security && security.short_name) || info.short_name || '').trim(),
    orgName: String(info.source_sample_name || '').trim(),
    authors,
    publishDate: String(info.notice_date || info.eitime || '').slice(0, 10),
    industryName: String((relation && relation.publishName) || '').trim(),
    paragraphs,
    paragraphCount: paragraphs.length,
    pages: Number.isFinite(pages) ? pages : null,
    pdfUrl: String(info.attach_url || '').trim(),
    sourceUrl: 'https://data.eastmoney.com/report/zw_stock.jshtml?infocode=' + encodeURIComponent(infoCode),
    fetchedAt: new Date().toISOString(),
  };
}

async function fetchReportDetailHtml(url: string): Promise<string | null> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    const resp = await fetch(url, {
      signal: ctrl.signal,
      headers: { 'User-Agent': 'Mozilla/5.0', Referer: 'https://data.eastmoney.com/report/' },
    });
    if (resp.status === 404) return null;
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    return await resp.text();
  } finally {
    clearTimeout(timer);
  }
}

/**
 * 单篇研报正文（真实源）。
 * 未知编号 / 页面无正文 → null（路由层 404）；网络或上游 5xx → NewsUnavailableError。
 */
export async function getResearchReportDetail(infoCode: string): Promise<ResearchReportDetail | null> {
  const code = String(infoCode || '').trim();
  if (!/^[A-Za-z0-9]{6,64}$/.test(code)) return null;
  const url = 'https://data.eastmoney.com/report/zw_stock.jshtml?infocode=' + encodeURIComponent(code);
  try {
    const html = await fetchReportDetailHtml(url);
    if (!html) return null;
    return parseResearchReportDetailHtml(html, code);
  } catch (e) {
    throw new NewsUnavailableError(e instanceof Error ? e.message : '研报正文源不可用');
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
