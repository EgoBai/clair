/**
 * 融资融券 API（诚实重写版）
 *
 * 红线：原实现全量 Math.random 伪数据，违反「诚实数据」要求，已彻底移除。
 *
 * 真实数据源：东方财富数据中心（datacenter-web.eastmoney.com）融资融券报表
 *   - 市场概览/趋势：RPT_MARGIN_TREND（全市场融资融券余额时间序列）
 *   - 个股明细：RPT_MARGIN_DETAIL（按交易日 + 代码）
 *   - 排行：RPT_MARGIN_DETAIL 排序 或 专用排行报表
 *
 * 沙箱实测：上述报表均返回 9501「报表配置不存在」，故真实拉取统一降级为 null，
 * 端点返回 dataSource: 'unavailable' + notes 显性标注，绝不编造数值。
 * 数据源恢复（生产环境可达）时，fetch*Real 返回真实数据，端点自动切换为 live。
 */

import { Request, Response, Router } from 'express';
import { validateParams, schemas } from '../middleware/validation';
import { asyncHandler, sendSuccess } from '../utils/apiResponse';
import type { MarginTradingData, MarginOverview, MarginRankEntry } from '@shared/types';

const router = Router();

const EM_DATA = 'https://datacenter-web.eastmoney.com/api/data/v1/get';

/** 带超时与异常兜底的东方财富数据中心请求；任何失败返回 null（诚实降级，禁止抛错/编造） */
async function emGet(reportName: string, params: Record<string, string>, timeoutMs = 8000): Promise<any[] | null> {
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    const qs = new URLSearchParams({ reportName, columns: 'ALL', ...params }).toString();
    const resp = await fetch(`${EM_DATA}?${qs}`, {
      signal: ctrl.signal,
      headers: { 'User-Agent': 'Mozilla/5.0', Referer: 'https://data.eastmoney.com/rzrq/' },
    });
    clearTimeout(timer);
    if (!resp.ok) return null;
    const json = await resp.json();
    if (!json?.success || !json?.result) return null;
    return json.result.data ?? null;
  } catch {
    return null;
  }
}

/**
 * 全市场融资融券概览（真实源：RPT_MARGIN_TREND 最新一行）。
 * 字段名随东方财富报表版本可能变动，这里做宽松兜底；拉取失败返回 null。
 */
async function fetchMarginOverviewReal(): Promise<(MarginOverview & { dataSource: string; updatedAt: string | null }) | null> {
  const rows = await emGet('RPT_MARGIN_TREND', {
    pageSize: '1', sortColumns: 'DATE', sortTypes: '-1',
  });
  if (!rows || !rows.length) return null;
  const r = rows[0];
  const fin = Number(r.RZYE ?? r.RZYE ?? r.financingBalance ?? 0);
  const sec = Number(r.RQYE ?? r.RQYEL ?? r.securitiesBalance ?? 0);
  const finCount = Number(r.RZJCOUNT ?? r.financingStockCount ?? 0);
  const secCount = Number(r.RQJCOUNT ?? r.securitiesStockCount ?? 0);
  if (!fin && !sec) return null;
  return {
    totalFinancingBalance: fin,
    totalSecuritiesBalance: sec,
    financingStockCount: finCount,
    securitiesStockCount: secCount,
    topFinancingIncrease: [],
    topSecuritiesIncrease: [],
    dataSource: 'eastmoney',
    updatedAt: new Date().toISOString(),
  };
}

/** 全市场融资融券余额趋势（真实源：RPT_MARGIN_TREND 时间序列） */
async function fetchMarginTrendReal(days = 30): Promise<MarginTradingData[] | null> {
  const rows = await emGet('RPT_MARGIN_TREND', {
    pageSize: String(Math.min(days, 120)), sortColumns: 'DATE', sortTypes: '-1',
  });
  if (!rows || !rows.length) return null;
  const series = rows
    .map((r) => ({
      symbol: '',
      name: '全市场',
      tradeDate: String(r.DATE ?? r.tradeDate ?? '').slice(0, 10),
      financingBalance: Number(r.RZYE ?? r.RZYE ?? 0),
      financingBuyAmount: Number(r.RZMAE ?? r.financingBuyAmount ?? 0),
      financingRepayAmount: Number(r.RZMAE ?? r.financingRepayAmount ?? 0),
      financingNetBuy: Number(r.RZJME ?? r.financingNetBuy ?? 0),
      securitiesBalance: Number(r.RQYE ?? r.RQYEL ?? 0),
      securitiesSellAmount: Number(r.RQMCL ?? r.securitiesSellAmount ?? 0),
      securitiesRepayAmount: Number(r.RQMCL ?? r.securitiesRepayAmount ?? 0),
      securitiesNetSell: Number(r.RQJME ?? r.securitiesNetSell ?? 0),
      totalBalance: Number(r.RZRQYE ?? r.totalBalance ?? 0),
      financingRatio: Number(r.RZBL_PROPORTION ?? r.financingRatio ?? 0),
    }))
    .filter((d) => d.tradeDate)
    .sort((a, b) => a.tradeDate.localeCompare(b.tradeDate));
  return series.length ? series : null;
}

/** 个股融资融券明细（真实源：RPT_MARGIN_DETAIL） */
async function fetchMarginDetailReal(symbol: string, days: number): Promise<MarginTradingData[] | null> {
  const code = symbol.replace(/\.(SZ|SH|BJ)$/i, '');
  const rows = await emGet('RPT_MARGIN_DETAIL', {
    pageSize: String(Math.min(days, 120)),
    sortColumns: 'DATE', sortTypes: '-1',
    filter: `(SCODE="${code}")`,
  });
  if (!rows || !rows.length) return null;
  return rows
    .map((r) => ({
      symbol,
      name: String(r.SNAME ?? r.name ?? ''),
      tradeDate: String(r.DATE ?? r.tradeDate ?? '').slice(0, 10),
      financingBalance: Number(r.RZYE ?? 0),
      financingBuyAmount: Number(r.RZMAE ?? 0),
      financingRepayAmount: Number(r.RZMAE ?? 0),
      financingNetBuy: Number(r.RZJME ?? 0),
      securitiesBalance: Number(r.RQYE ?? 0),
      securitiesSellAmount: Number(r.RQMCL ?? 0),
      securitiesRepayAmount: Number(r.RQMCL ?? 0),
      securitiesNetSell: Number(r.RQJME ?? 0),
      totalBalance: Number(r.RZRQYE ?? 0),
      financingRatio: Number(r.RZBL_PROPORTION ?? 0),
    }))
    .filter((d) => d.tradeDate)
    .sort((a, b) => a.tradeDate.localeCompare(b.tradeDate));
}

/** 融资融券排行（真实源：RPT_MARGIN_DETAIL 最新一日排序） */
async function fetchMarginRankReal(type: 'financing' | 'securities', count: number): Promise<MarginRankEntry[] | null> {
  const sortCol = type === 'financing' ? 'RZYE' : 'RQYE';
  const rows = await emGet('RPT_MARGIN_DETAIL', {
    pageSize: String(count),
    sortColumns: sortCol, sortTypes: '-1',
  });
  if (!rows || !rows.length) return null;
  return rows.slice(0, count).map((r, i) => ({
    rank: i + 1,
    symbol: String(r.SCODE ?? r.symbol ?? ''),
    name: String(r.SNAME ?? r.name ?? ''),
    financingBalance: Number(r.RZYE ?? 0),
    financingChange: Number(r.RZJME ?? 0),
    securitiesBalance: Number(r.RQYE ?? 0),
    securitiesChange: Number(r.RQJME ?? 0),
  }));
}

const UNAVAILABLE_NOTE = '融资融券：东方财富数据中心报表在沙箱下返回 9501（报表配置不存在），后端未接入兜底数据';

// 获取融资融券概览
router.get('/margin/overview', asyncHandler(async (_req: Request, res: Response) => {
  const real = await fetchMarginOverviewReal();
  if (real) {
    sendSuccess(res, real);
  } else {
    sendSuccess(res, {
      totalFinancingBalance: null,
      totalSecuritiesBalance: null,
      financingStockCount: null,
      securitiesStockCount: null,
      topFinancingIncrease: [],
      topSecuritiesIncrease: [],
      dataSource: 'unavailable',
      notes: UNAVAILABLE_NOTE,
    });
  }
}));

// 全市场融资融券余额趋势（新增端点）
router.get('/margin/trend', asyncHandler(async (req: Request, res: Response) => {
  const days = Math.min(parseInt(req.query.days as string) || 30, 120);
  const real = await fetchMarginTrendReal(days);
  if (real) {
    sendSuccess(res, { records: real, dataSource: 'eastmoney', notes: undefined });
  } else {
    sendSuccess(res, { records: [], dataSource: 'unavailable', notes: UNAVAILABLE_NOTE });
  }
}));

// 获取个股融资融券数据
router.get('/margin/:symbol', validateParams(schemas.marginSymbol), asyncHandler(async (req: Request, res: Response) => {
  const { symbol } = req.params;
  const days = Math.min(parseInt(req.query.days as string) || 30, 120);
  const name = (req.query.name as string) || '未知';
  const real = await fetchMarginDetailReal(symbol, days);
  if (real) {
    sendSuccess(res, { symbol, records: real, dataSource: 'eastmoney' });
  } else {
    sendSuccess(res, {
      symbol,
      records: [],
      dataSource: 'unavailable',
      notes: UNAVAILABLE_NOTE,
    });
  }
}));

// 融资融券排行
router.get('/margin/rank/:type', validateParams(schemas.marginRank), asyncHandler(async (req: Request, res: Response) => {
  const type = req.params.type === 'securities' ? 'securities' : 'financing';
  const count = parseInt(req.query.count as string) || 20;
  const real = await fetchMarginRankReal(type, count);
  if (real) {
    sendSuccess(res, { type, rank: real, dataSource: 'eastmoney' });
  } else {
    sendSuccess(res, { type, rank: [], dataSource: 'unavailable', notes: UNAVAILABLE_NOTE });
  }
}));

export default router;
