/**
 * 限售股解禁 API（诚实重写版）
 *
 * 红线：原实现全量 Math.random 伪数据（解禁日期/股数/市值/比例/股东/个股历史），
 * 违反「诚实数据」要求，已彻底移除。详见 IP-12（P0 诚实数据红线）。
 *
 * 真实数据源：东方财富数据中心限售股解禁报表。
 *   - 解禁明细/日历：RPT_LCX_XFXJMX（按月限售股解禁明细；报表名以生产环境实测为准）
 *   - 解禁排行：同上按解禁市值排序
 *
 * 沙箱实测：东方财富事件/解禁类报表多返回 9501「报表配置不存在」或网络不可达，
 * 故真实拉取统一降级为 null，端点返回 dataSource: 'unavailable' + notes 显性标注，
 * 绝不编造数值。数据源恢复（生产环境可达）时，fetch*Real 返回真实数据，端点自动切换为 live。
 */

import { Request, Response, Router } from 'express';
import { validateQuery, validateParams, schemas } from '../middleware/validation';
import { asyncHandler, sendSuccess } from '../utils/apiResponse';

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
      headers: { 'User-Agent': 'Mozilla/5.0', Referer: 'https://data.eastmoney.com/dxfj/' },
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

interface LockupExpiry {
  id: number;
  symbol: string;
  name: string;
  expiryDate: string;
  lockupType: string;
  shareholder: string;
  totalShares: number;
  circulatingBefore: number;
  unlockRatio: number;
  marketValue: number;
  price: number;
  actualCirculating: number;
}

/**
 * 真实解禁明细拉取（东方财富 RPT_LCX_XFXJMX）。
 * 字段名随报表版本可能变动，这里做宽松兜底；拉取失败/报表不可用返回 null。
 * 注意：报表名 RPT_LCX_XFXJMX 为东方财富限售股解禁明细常用报表，
 * 生产环境需以实测字段为准；沙箱下统一降级为 null（诚实不可用）。
 */
async function fetchLockupExpiriesReal(year: number, month: number): Promise<LockupExpiry[] | null> {
  const rows = await emGet('RPT_LCX_XFXJMX', {
    pageSize: '100',
    sortColumns: 'FHD_DATE',
    sortTypes: '-1',
    filter: `(TODAY_DATE='${year}-${String(month).padStart(2, '0')}')`,
  });
  if (!rows || !rows.length) return null;
  const list = rows
    .map((r, i): LockupExpiry => ({
      id: i + 1,
      symbol: String(r.SECURITY_CODE ?? r.CODE ?? ''),
      name: String(r.SECURITY_NAME_ABBR ?? r.NAME ?? ''),
      expiryDate: String(r.FHD_DATE ?? r.UNLOCK_DATE ?? '').slice(0, 10),
      lockupType: String(r.LB_TYPE_NAME ?? r.TYPE ?? ''),
      shareholder: String(r.SHAREHOLDER ?? r.HOLDER ?? '未知'),
      totalShares: Number(r.UNLOCK_SHARES ?? r.SHARES ?? 0),
      circulatingBefore: Number(r.CIRCULATION_BEFORE ?? 0),
      unlockRatio: Number(r.UNLOCK_RATIO ?? 0),
      marketValue: Number(r.UNLOCK_MARKET_CAP ?? r.MARKET_VALUE ?? 0),
      price: Number(r.CLOSE_PRICE ?? r.PRICE ?? 0),
      actualCirculating: Number(r.CIRCULATION_AFTER ?? 0),
    }))
    .filter((d) => d.expiryDate && d.symbol);
  return list.length ? list : null;
}

const UNAVAILABLE_NOTE =
  '限售股解禁：东方财富数据中心解禁报表在沙箱下返回 9501（报表配置不存在）或网络不可达，后端未接入兜底/随机数据';

/** 空日历骨架（保持与前端 LockupCalendarPage 契约一致：expiries / byDate / summary） */
function emptyCalendar(year: number, month: number) {
  return {
    year,
    month,
    expiries: [] as LockupExpiry[],
    byDate: {} as Record<string, LockupExpiry[]>,
    summary: {
      totalStocks: 0,
      totalEvents: 0,
      totalMarketValue: 0,
      totalShares: 0,
      avgUnlockRatio: 0,
    },
    dataSource: 'unavailable' as const,
    notes: UNAVAILABLE_NOTE,
  };
}

// 月度解禁日历
router.get('/lockup/calendar', validateQuery(schemas.lockupCalendar), asyncHandler(async (req: Request, res: Response) => {
  const year = parseInt(req.query.year as string) || new Date().getFullYear();
  const month = parseInt(req.query.month as string) || new Date().getMonth() + 1;

  const real = await fetchLockupExpiriesReal(year, month);
  if (real) {
    const byDate: Record<string, LockupExpiry[]> = {};
    let totalMarketValue = 0;
    let totalShares = 0;
    real.forEach((item) => {
      if (!byDate[item.expiryDate]) byDate[item.expiryDate] = [];
      byDate[item.expiryDate].push(item);
      totalMarketValue += item.marketValue;
      totalShares += item.totalShares;
    });
    sendSuccess(res, {
      year,
      month,
      expiries: real,
      byDate,
      summary: {
        totalStocks: new Set(real.map((d) => d.symbol)).size,
        totalEvents: real.length,
        totalMarketValue,
        totalShares,
        avgUnlockRatio: real.length
          ? Math.round((real.reduce((s, d) => s + d.unlockRatio, 0) / real.length) * 100) / 100
          : 0,
      },
      dataSource: 'eastmoney',
      notes: undefined,
    });
  } else {
    sendSuccess(res, emptyCalendar(year, month));
  }
}));

// 解禁排行（按解禁市值）
router.get('/lockup/rank', validateQuery(schemas.lockupRank), asyncHandler(async (req: Request, res: Response) => {
  const month = parseInt(req.query.month as string) || new Date().getMonth() + 1;
  const year = parseInt(req.query.year as string) || new Date().getFullYear();

  const real = await fetchLockupExpiriesReal(year, month);
  if (real) {
    const rank = real.sort((a, b) => b.marketValue - a.marketValue).slice(0, 20);
    sendSuccess(res, { rank, dataSource: 'eastmoney', notes: undefined });
  } else {
    sendSuccess(res, { rank: [], dataSource: 'unavailable', notes: UNAVAILABLE_NOTE });
  }
}));

// 个股解禁历史
router.get('/lockup/:symbol', validateParams(schemas.stockSymbol), asyncHandler(async (req: Request, res: Response) => {
  const { symbol } = req.params;
  const months = Math.min(parseInt(req.query.months as string) || 12, 36);

  // 真实源：逐月拉取并筛选该标的（沙箱下统一降级为 unavailable）
  const real: LockupExpiry[] = [];
  const now = new Date();
  for (let m = 0; m < months; m++) {
    const d = new Date(now);
    d.setMonth(d.getMonth() + m);
    const batch = await fetchLockupExpiriesReal(d.getFullYear(), d.getMonth() + 1);
    if (batch) real.push(...batch.filter((e) => e.symbol === symbol));
  }

  if (real.length) {
    sendSuccess(res, {
      symbol,
      expiries: real.sort((a, b) => a.expiryDate.localeCompare(b.expiryDate)),
      total: real.length,
      dataSource: 'eastmoney',
    });
  } else {
    sendSuccess(res, {
      symbol,
      expiries: [],
      total: 0,
      dataSource: 'unavailable',
      notes: UNAVAILABLE_NOTE,
    });
  }
}));

export default router;
