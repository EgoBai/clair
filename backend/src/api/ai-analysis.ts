/**
 * AI 智能分析 API 路由（真实数据版）
 *
 * 数据来源（东方财富，免 key）：
 * - 个股实时行情（价格/涨跌幅/成交量/PE/PB/总市值）：push2 stock/get
 * - 个股日 K 线（60 日收盘 + 成交量，用于技术面 MA/RSI/MACD/BOLL）：push2his stock/kline/get
 * - 财务指标（ROE/营收增长/利润增长）：复用 services/financialsDataService.ts（T6 已落地）
 *
 * 遵守「诚实数据」红线：
 * - 移除全部随机数伪造数据；
 * - 真实源不可达 → 返回 dataSource:'unavailable' + 空 data，绝不 fallback 到伪造；
 * - 部分个股失败时跳过该股（不回填模拟），全部失败时整体诚实空。
 */

import { Router, Request, Response } from 'express';
import Joi from 'joi';
import { validateQuery } from '../middleware/validation';
import { asyncHandler, sendSuccess, sendNotFound } from '../utils/apiResponse';
import {
  analyzeStock,
  generateRecommendations,
  detectAbnormalEvents,
  analyzeSectorRotation,
  StockData,
} from '../utils/aiAnalysis';
import {
  getFinancialIndicators,
  FinancialsUnavailableError,
} from '../services/financialsDataService';

import { aiTiming } from '../middleware/aiTiming';

const router = Router();

// F12/A-07: AI 接口耗时日志（端点/状态/耗时/首字节）
router.use(aiTiming);

// ==================== 真实数据源 ====================

const FETCH_TIMEOUT_MS = 8000;

/** AI 分析的观察股票池（仅用于 /ai/recommendations /alerts /sector-rotation /market-sentiment 的批量分析）。
 * 这些是 A 股代表性龙头，覆盖白酒/新能源/汽车/保险/银行/家电/安防/半导体/光伏/电子/医药/商业/证券/电力。
 * 单股分析 /ai/analyze/:symbol 接受任意 symbol，但若不在池中也允许（动态拉取，行业字段置 '未知'）。 */
const AI_WATCHLIST: Array<{ symbol: string; name: string; industry: string }> = [
  { symbol: '600519.SH', name: '贵州茅台', industry: '白酒' },
  { symbol: '000858.SZ', name: '五粮液', industry: '白酒' },
  { symbol: '300750.SZ', name: '宁德时代', industry: '新能源' },
  { symbol: '002594.SZ', name: '比亚迪', industry: '汽车' },
  { symbol: '601318.SH', name: '中国平安', industry: '保险' },
  { symbol: '600036.SH', name: '招商银行', industry: '银行' },
  { symbol: '000333.SZ', name: '美的集团', industry: '家电' },
  { symbol: '002415.SZ', name: '海康威视', industry: '安防' },
  { symbol: '688981.SH', name: '中芯国际', industry: '半导体' },
  { symbol: '601012.SH', name: '隆基绿能', industry: '光伏' },
  { symbol: '002475.SZ', name: '立讯精密', industry: '电子' },
  { symbol: '603259.SH', name: '药明康德', industry: '医药' },
  { symbol: '601888.SH', name: '中国中免', industry: '商业' },
  { symbol: '300059.SZ', name: '东方财富', industry: '证券' },
  { symbol: '600900.SH', name: '长江电力', industry: '电力' },
];

/** 将多种符号格式归一为东财 secid：1.600519 / 0.000001 / 0.300750 */
function toSecid(symbol: string): string {
  const trimmed = (symbol || '').trim().toUpperCase();
  const digits = trimmed.replace(/^(SH|SZ|BJ)/, '').replace(/\.(SH|SZ|BJ)$/, '');
  if (trimmed.startsWith('SH') || trimmed.endsWith('.SH') || digits.startsWith('6')) return `1.${digits}`;
  // 深交所（0/3/2 开头）与北交所（8/4 开头）在 push2 secid 中均为 0
  return `0.${digits}`;
}

async function fetchWithTimeout(url: string, headers?: Record<string, string>): Promise<Response> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    const resp = await fetch(url, {
      signal: ctrl.signal,
      headers: { 'User-Agent': 'Mozilla/5.0', Referer: 'https://quote.eastmoney.com/', ...headers },
    });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    return resp;
  } finally {
    clearTimeout(timer);
  }
}

/** 真实个股实时行情：东财 push2 stock/get
 * f2=最新价×1000, f3=涨跌幅×100, f5=成交量(手), f6=成交额(元),
 * f9=动态市盈率×100, f23=市净率×100, f20=总市值(元)
 */
export interface RealStockQuote {
  symbol: string;
  name: string;
  price: number;
  changePercent: number;
  volume: number; // 手
  turnover: number; // 元
  pe: number;
  pb: number;
  marketCap: number; // 元
}

async function fetchStockQuote(symbol: string, fallbackName: string): Promise<RealStockQuote> {
  const secid = toSecid(symbol);
  const url =
    `https://push2.eastmoney.com/api/qt/stock/get?secid=${secid}` +
    `&fields=f12,f14,f2,f3,f5,f6,f9,f23,f20`;
  const resp = await fetchWithTimeout(url);
  const json = (await resp.json()) as { data?: Record<string, any> };
  const d = json?.data;
  if (!d) throw new Error(`个股 ${symbol} 行情数据缺失`);
  return {
    symbol,
    name: String(d.f14 ?? fallbackName),
    price: (Number(d.f2) || 0) / 1000,
    changePercent: (Number(d.f3) || 0) / 100,
    volume: Number(d.f5) || 0,
    turnover: Number(d.f6) || 0,
    pe: (Number(d.f9) || 0) / 100,
    pb: (Number(d.f23) || 0) / 100,
    marketCap: Number(d.f20) || 0,
  };
}

/** 真实个股日 K 线：东财 push2his stock/kline/get
 * 返回近 N 日收盘价序列 + 成交量序列(手)，用于技术面 MA/RSI/MACD/BOLL 计算。
 */
async function fetchStockKline(symbol: string, limit = 60): Promise<{ prices: number[]; volumes: number[] }> {
  const secid = toSecid(symbol);
  const url =
    `https://push2his.eastmoney.com/api/qt/stock/kline/get?secid=${secid}` +
    `&klt=101&fqt=1&end=20500101&lmt=${limit}` +
    `&fields1=f1,f2,f3&fields2=f51,f52,f53,f54,f55,f56,f57`;
  const resp = await fetchWithTimeout(url);
  const json = (await resp.json()) as { data?: { klines?: string[] } };
  const klines = json?.data?.klines ?? [];
  if (klines.length === 0) throw new Error(`个股 ${symbol} K 线数据缺失`);
  const prices: number[] = [];
  const volumes: number[] = [];
  for (const line of klines) {
    const parts = String(line).split(',');
    if (parts.length < 6) continue;
    const close = Number(parts[2]);
    const vol = Number(parts[5]);
    if (Number.isFinite(close)) prices.push(close);
    if (Number.isFinite(vol)) volumes.push(vol);
  }
  if (prices.length === 0) throw new Error(`个股 ${symbol} K 线解析失败`);
  return { prices, volumes };
}

/** 真实个股财务指标（最新年报）：复用 financialsDataService
 * 提供 ROE / 营收增长 / 利润增长。
 */
async function fetchStockFundamentals(symbol: string): Promise<{
  roe: number;
  revenueGrowth: number;
  profitGrowth: number;
}> {
  const indicators = await getFinancialIndicators(symbol, 1, 'annual');
  const ind = indicators[0];
  if (!ind) throw new Error(`个股 ${symbol} 财务指标缺失`);
  return {
    roe: ind.roe,
    revenueGrowth: ind.revenueGrowth,
    profitGrowth: ind.profitGrowth,
  };
}

/** 拉取一只股票的完整真实数据（行情 + K 线 + 财务），供 analyzeStock 使用 */
async function fetchRealStock(symbol: string, name: string, industry: string): Promise<StockData> {
  const [quote, kline, fund] = await Promise.all([
    fetchStockQuote(symbol, name),
    fetchStockKline(symbol, 60),
    fetchStockFundamentals(symbol),
  ]);
  return {
    symbol,
    name: quote.name || name,
    industry,
    prices: kline.prices,
    volumes: kline.volumes,
    pe: quote.pe,
    pb: quote.pb,
    roe: fund.roe,
    revenueGrowth: fund.revenueGrowth,
    profitGrowth: fund.profitGrowth,
    marketCap: quote.marketCap,
    changePercent: quote.changePercent,
  };
}

/** 拉取观察列表全部股票的真实数据；部分失败跳过（诚实，不回填伪造）。
 * 全部失败时抛出，由路由层降级为诚实空。
 */
async function fetchWatchlistStocks(): Promise<StockData[]> {
  const results = await Promise.allSettled(
    AI_WATCHLIST.map((s) => fetchRealStock(s.symbol, s.name, s.industry)),
  );
  const stocks: StockData[] = [];
  const failures: string[] = [];
  for (let i = 0; i < results.length; i++) {
    const r = results[i];
    if (r.status === 'fulfilled') {
      stocks.push(r.value);
    } else {
      failures.push(`${AI_WATCHLIST[i].symbol}: ${(r.reason as Error)?.message ?? 'unknown'}`);
    }
  }
  if (stocks.length === 0) {
    throw new Error(`观察列表全部股票真实数据获取失败：${failures.join('; ')}`);
  }
  if (failures.length > 0) {
    console.warn('[ai-analysis] 部分股票真实数据获取失败（已跳过，不回填伪造）：', failures.join('; '));
  }
  return stocks;
}

/** 诚实空降级：源不可达时统一返回 dataSource:'unavailable' + 空 data */
function unavailable(e: unknown) {
  const message = e instanceof Error ? e.message : 'unknown';
  return { dataSource: 'unavailable' as const, message, data: null };
}

// ==================== API 路由 ====================

/**
 * GET /api/ai/recommendations
 * AI 选股推荐（真实源：观察池龙头股 + 真实行情/K线/财务）
 */
router.get('/ai/recommendations', asyncHandler(async (_req: Request, res: Response) => {
  try {
    const stocks = await fetchWatchlistStocks();
    const recommendation = generateRecommendations(stocks);
    sendSuccess(res, { ...recommendation, dataSource: 'real' });
  } catch (e) {
    sendSuccess(res, {
      date: new Date().toISOString().split('T')[0],
      strategy: 'AI综合评分选股',
      stocks: [],
      marketOutlook: '数据源暂不可用',
      riskLevel: 'high',
      confidence: 0,
      ...unavailable(e),
    });
  }
}));

/**
 * GET /api/ai/analyze/:symbol
 * 单股 AI 分析（真实源：动态拉取该 symbol 的行情/K线/财务）
 */
router.get('/ai/analyze/:symbol', asyncHandler(async (req: Request, res: Response) => {
  const { symbol } = req.params;
  const watch = AI_WATCHLIST.find((s) => s.symbol === symbol);
  const industry = watch?.industry ?? '未知';
  const name = watch?.name ?? symbol;

  try {
    const stock = await fetchRealStock(symbol, name, industry);
    const analysis = analyzeStock(stock);
    sendSuccess(res, { ...analysis, dataSource: 'real' });
  } catch (e) {
    if (e instanceof FinancialsUnavailableError) {
      sendSuccess(res, { symbol, ...unavailable(e) });
      return;
    }
    sendSuccess(res, { symbol, ...unavailable(e) });
  }
}));

/**
 * GET /api/ai/alerts
 * 智能预警列表（真实源：观察池股票的异动检测）
 */
const alertQuerySchema = Joi.object({
  severity: Joi.string().valid('high', 'medium', 'low').optional(),
  type: Joi.string().valid(
    'abnormal_volume', 'limit_up', 'limit_down',
    'breakout', 'breakdown', 'macd_cross', 'rsi_extreme', 'sector_rotation'
  ).optional(),
  limit: Joi.number().integer().min(1).max(50).default(20),
});

router.get('/ai/alerts', validateQuery(alertQuerySchema), asyncHandler(async (req: Request, res: Response) => {
  const { severity, type, limit } = req.query as Record<string, string | undefined>;

  try {
    const stocks = await fetchWatchlistStocks();
    let alerts = detectAbnormalEvents(stocks);

    if (severity) {
      alerts = alerts.filter(a => a.severity === severity);
    }
    if (type) {
      alerts = alerts.filter(a => a.type === type);
    }

    alerts = alerts.slice(0, Number(limit));

    sendSuccess(res, {
      alerts,
      total: alerts.length,
      generatedAt: new Date().toISOString(),
      dataSource: 'real',
    });
  } catch (e) {
    sendSuccess(res, {
      alerts: [],
      total: 0,
      generatedAt: new Date().toISOString(),
      ...unavailable(e),
    });
  }
}));

/**
 * GET /api/ai/sector-rotation
 * 行业轮动分析（真实源：基于观察池股票的真实涨跌与动量）
 */
router.get('/ai/sector-rotation', asyncHandler(async (_req: Request, res: Response) => {
  try {
    const stocks = await fetchWatchlistStocks();
    const rotation = analyzeSectorRotation(stocks);

    sendSuccess(res, {
      sectors: rotation,
      leading: rotation.filter(s => s.currentPhase === 'leading'),
      lagging: rotation.filter(s => s.currentPhase === 'lagging'),
      analyzedAt: new Date().toISOString(),
      dataSource: 'real',
    });
  } catch (e) {
    sendSuccess(res, {
      sectors: [],
      leading: [],
      lagging: [],
      analyzedAt: new Date().toISOString(),
      ...unavailable(e),
    });
  }
}));

/**
 * GET /api/ai/market-sentiment
 * 市场情绪综合分析（真实源：基于观察池股票的真实综合评分）
 */
router.get('/ai/market-sentiment', asyncHandler(async (_req: Request, res: Response) => {
  try {
    const stocks = await fetchWatchlistStocks();
    const analyses = stocks.map(s => analyzeStock(s));

    const avgScore = analyses.reduce((a, s) => a + s.totalScore, 0) / analyses.length;
    const bullishCount = analyses.filter(s => s.recommendation === 'strong_buy' || s.recommendation === 'buy').length;
    const bearishCount = analyses.filter(s => s.recommendation === 'sell' || s.recommendation === 'strong_sell').length;

    let sentiment: string;
    let sentimentScore: number;

    if (avgScore > 65) {
      sentiment = '极度乐观';
      sentimentScore = 80;
    } else if (avgScore > 55) {
      sentiment = '偏乐观';
      sentimentScore = 60;
    } else if (avgScore > 45) {
      sentiment = '中性';
      sentimentScore = 50;
    } else if (avgScore > 35) {
      sentiment = '偏悲观';
      sentimentScore = 40;
    } else {
      sentiment = '极度悲观';
      sentimentScore = 20;
    }

    sendSuccess(res, {
      sentiment,
      sentimentScore,
      avgScore: Math.round(avgScore),
      bullishCount,
      bearishCount,
      neutralCount: analyses.length - bullishCount - bearishCount,
      topBullish: analyses
        .filter(s => s.recommendation === 'strong_buy' || s.recommendation === 'buy')
        .sort((a, b) => b.totalScore - a.totalScore)
        .slice(0, 3)
        .map(s => ({ symbol: s.symbol, name: s.name, score: s.totalScore, recommendation: s.recommendation })),
      topBearish: analyses
        .filter(s => s.recommendation === 'sell' || s.recommendation === 'strong_sell')
        .sort((a, b) => a.totalScore - b.totalScore)
        .slice(0, 3)
        .map(s => ({ symbol: s.symbol, name: s.name, score: s.totalScore, recommendation: s.recommendation })),
      analyzedAt: new Date().toISOString(),
      dataSource: 'real',
    });
  } catch (e) {
    sendSuccess(res, {
      sentiment: '数据源暂不可用',
      sentimentScore: 0,
      avgScore: 0,
      bullishCount: 0,
      bearishCount: 0,
      neutralCount: 0,
      topBullish: [],
      topBearish: [],
      analyzedAt: new Date().toISOString(),
      ...unavailable(e),
    });
  }
}));

export default router;
