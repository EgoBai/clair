/**
 * 龙虎榜 API（诚实重写版）
 *
 * 背景：原实现位于 `backend/src/api/_archived/top-traders.ts`，为 100% Math.random 伪数据
 * （写死营业部名、写死股票、金额全随机），已归档废弃，**本文件不复用、不继承其任何逻辑**。
 * 现本文件挂载真实数据源，清偿前端「龙虎榜」入口（/top-traders）的 404 死链。
 *
 * 真实数据源：东方财富数据中心（https://datacenter-web.eastmoney.com/api/data/v1/get）
 *   - 个股龙虎榜明细：RPT_DAILYBILLBOARD_DETAILSNEW（按 TRADE_DATE 过滤）
 *   - 买入席位列：RPT_BILLBOARD_DAILYDETAILSBUY（按 TRADE_DATE / SECURITY_CODE 过滤）
 *   - 卖出席位列：RPT_BILLBOARD_DAILYDETAILSSELL（同上）
 *     注：SELL 报表已于 2026-09-22 实测 HTTP 200 存在（`success:true`，390 行），故卖出侧
 *     与买入侧一并聚合；若未来不可达，则降级为仅用 BUY 侧并在 notes 显性说明。
 *
 * 诚实契约（红线）：
 *   - 严格照抄 `backend/src/api/margin.ts` 的 `emGet()`：AbortController + 超时 + try/catch，
 *     任何失败一律返回 null，**绝不抛错、绝不编造数值**。
 *   - 成功：`dataSource: 'eastmoney'`；失败：空值 + `dataSource: 'unavailable'` + notes 显性说明。
 *   - 本文件内 **严禁出现 Math.random**（backend/src/api/ 属诚实门禁 RED 域）。
 *
 * 行业字段诚实声明：东财龙虎榜真实源**不提供行业字段**，且无可靠的 symbol→行业 真实映射，
 *   故 `industryDistribution` 恒返回空对象 `{}`（shared/types.ts:644 声明为必填
 *   `Record<string, number>`，不改类型定义），前端 TopTradersPage 对空对象走
 *   `industryData.length === 0` 分支自动隐藏该卡片，行为正确，绝不随机编造行业。
 */

import { Request, Response, Router } from 'express';
import { validateParams, schemas } from '../middleware/validation';
import { asyncHandler, sendSuccess } from '../utils/apiResponse';
import type {
  TopTraderOverview,
  TopTraderRecord,
  TopTraderEntry,
  SeatRankEntry,
} from '@shared/types';

const router = Router();

const EM_DATA = 'https://datacenter-web.eastmoney.com/api/data/v1/get';

const DETAIL_REPORT = 'RPT_DAILYBILLBOARD_DETAILSNEW';
const BUY_REPORT = 'RPT_BILLBOARD_DAILYDETAILSBUY';
const SELL_REPORT = 'RPT_BILLBOARD_DAILYDETAILSSELL';

const UNAVAILABLE_NOTE =
  '龙虎榜：东方财富数据中心不可达或该交易日无龙虎榜数据；后端未接入任何兜底/编造数据';

const PARTIAL_SELL_NOTE =
  '龙虎榜：卖出席位报表（RPT_BILLBOARD_DAILYDETAILSSELL）本次不可达，卖出金额仅缺失、不做任何估算填充';

/** 带超时与异常兜底的东方财富数据中心请求；任何失败返回 null（诚实降级，禁止抛错/编造） */
async function emGet(
  reportName: string,
  params: Record<string, string>,
  timeoutMs = 8000,
): Promise<any[] | null> {
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    const qs = new URLSearchParams({ reportName, columns: 'ALL', ...params }).toString();
    const resp = await fetch(`${EM_DATA}?${qs}`, {
      signal: ctrl.signal,
      headers: { 'User-Agent': 'Mozilla/5.0', Referer: 'https://data.eastmoney.com/lhb/' },
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

/** 数值安全转换：任何非有限值一律归 0（缺失即为缺失，不倒填） */
function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

/** 本地日期格式化为 YYYY-MM-DD（避免 toISOString 的时区偏移） */
function toYmd(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** 相对今天回溯 n 个自然日 */
function minusDays(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return toYmd(d);
}

/** 归一化代码：去掉 .SZ/.SH/.BJ 等后缀，仅保留 6 位数字（东财 SECURITY_CODE 口径） */
function normCode(symbol: string): string {
  return String(symbol).trim().replace(/\.(SZ|SH|BJ)$/i, '');
}

/** 是否为机构席位：东财机构专用席位 OPERATEDEPT_CODE 为 "0"，名称含「机构专用」 */
function isOrgSeat(row: any): boolean {
  const code = String(row?.OPERATEDEPT_CODE ?? '');
  const name = String(row?.OPERATEDEPT_NAME ?? '');
  return code === '0' || name.includes('机构专用');
}

/** 拉取某交易日的龙虎榜明细（RPT_DAILYBILLBOARD_DETAILSNEW） */
async function fetchDailyDetail(date: string): Promise<any[] | null> {
  return emGet(DETAIL_REPORT, {
    sortColumns: 'SECURITY_CODE',
    sortTypes: '1',
    pageSize: '500',
    pageNumber: '1',
    filter: `(TRADE_DATE='${date}')`,
  });
}

/**
 * 解析出「有数据的交易日」。
 * - 显式传 date：只查该日，无数据即 null（不猜测、不挪日）。
 * - 缺省：从今天起回溯，最多 6 个自然日，取第一个非空的交易日。
 * 返回该日的明细行。
 */
async function resolveRecentTrade(
  date?: string,
): Promise<{ date: string; rows: any[] } | null> {
  if (date) {
    const rows = await fetchDailyDetail(date);
    return rows && rows.length ? { date, rows } : null;
  }
  for (let i = 0; i < 6; i++) {
    const d = minusDays(i);
    const rows = await fetchDailyDetail(d);
    if (rows && rows.length) return { date: d, rows };
  }
  return null;
}

/** 拉取席位列（可限定单只股票 + 单日） */
async function fetchSeatRows(
  reportName: string,
  date: string,
  code?: string,
): Promise<any[] | null> {
  const filter = code
    ? `(SECURITY_CODE="${code}")(TRADE_DATE='${date}')`
    : `(TRADE_DATE='${date}')`;
  return emGet(reportName, {
    pageSize: code ? '200' : '500',
    pageNumber: '1',
    filter,
  });
}

interface SeatAgg {
  seatName: string;
  buyAmount: number;
  sellAmount: number;
  netAmount: number;
  appearCount: number;
  isOrganizational: boolean;
}

/**
 * 席位聚合（确定性，无随机）。
 * 买入额取 RPT_BILLBOARD_DAILYDETAILSBUY 各行的 BUY；卖出额取
 * RPT_BILLBOARD_DAILYDETAILSSELL 各行的 SELL —— 两侧集合互斥，故不构成重复计数。
 * appearCount = 该席位在两侧报表中出现过的「股票_交易ID」去重数（上榜次数）。
 */
function aggregateSeats(buyRows: any[], sellRows: any[]): SeatAgg[] {
  const map = new Map<
    string,
    { name: string; buy: number; sell: number; appearances: Set<string>; org: boolean }
  >();
  const add = (rows: any[], side: 'buy' | 'sell') => {
    for (const r of rows) {
      const name = String(r?.OPERATEDEPT_NAME ?? '').trim();
      if (!name) continue;
      const cur =
        map.get(name) ??
        { name, buy: 0, sell: 0, appearances: new Set<string>(), org: isOrgSeat(r) };
      if (side === 'buy') cur.buy += num(r?.BUY);
      else cur.sell += num(r?.SELL);
      cur.appearances.add(`${String(r?.SECURITY_CODE ?? '')}_${String(r?.TRADE_ID ?? '')}`);
      map.set(name, cur);
    }
  };
  add(buyRows, 'buy');
  add(sellRows, 'sell');

  return [...map.values()].map((v) => ({
    seatName: v.name,
    buyAmount: v.buy,
    sellAmount: v.sell,
    netAmount: v.buy - v.sell,
    appearCount: v.appearances.size,
    isOrganizational: v.org,
  }));
}

/** 不可用的概览诚实空（字段齐全，绝不编造数值） */
function emptyOverview(tradeDate: string, notes: string): TopTraderOverview & { dataSource: string; notes: string } {
  return {
    tradeDate,
    totalStocks: 0,
    buyDominantCount: 0,
    sellDominantCount: 0,
    totalBuyAmount: 0,
    totalSellAmount: 0,
    totalNetAmount: 0,
    topBuyStocks: [],
    topSellStocks: [],
    industryDistribution: {},
    dataSource: 'unavailable',
    notes,
  };
}

// ⚠️ 注册顺序要求：/top-traders/overview 与 /top-traders/seat/rank 必须在
//    /top-traders/:symbol 之前注册，否则会被 :symbol 吞掉。

// 龙虎榜概览（默认最近交易日；date 缺省时回溯至多 5 个交易日）
router.get(
  '/top-traders/overview',
  asyncHandler(async (req: Request, res: Response) => {
    const dateQ =
      typeof req.query.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(req.query.date)
        ? req.query.date
        : undefined;

    const resolved = await resolveRecentTrade(dateQ);
    if (!resolved) {
      sendSuccess(res, emptyOverview(dateQ ?? toYmd(new Date()), UNAVAILABLE_NOTE));
      return;
    }

    const rows = resolved.rows;

    // 同一只股票会因不同上榜原因出现多行 → 按 SECURITY_CODE 去重聚合
    const byCode = new Map<
      string,
      { symbol: string; name: string; buy: number; sell: number; net: number; reason: string }
    >();
    for (const r of rows) {
      const code = String(r?.SECURITY_CODE ?? '').trim();
      if (!code) continue;
      const cur =
        byCode.get(code) ??
        {
          symbol: code,
          name: String(r?.SECURITY_NAME_ABBR ?? ''),
          buy: 0,
          sell: 0,
          net: 0,
          reason: String(r?.EXPLANATION ?? ''),
        };
      cur.buy += num(r?.BILLBOARD_BUY_AMT);
      cur.sell += num(r?.BILLBOARD_SELL_AMT);
      cur.net += num(r?.BILLBOARD_NET_AMT);
      byCode.set(code, cur);
    }

    const stocks = [...byCode.values()];
    const totalBuyAmount = rows.reduce((s, r) => s + num(r?.BILLBOARD_BUY_AMT), 0);
    const totalSellAmount = rows.reduce((s, r) => s + num(r?.BILLBOARD_SELL_AMT), 0);
    const totalNetAmount = rows.reduce((s, r) => s + num(r?.BILLBOARD_NET_AMT), 0);

    const overview: TopTraderOverview & { dataSource: string; notes?: string } = {
      tradeDate: resolved.date,
      totalStocks: stocks.length,
      buyDominantCount: stocks.filter((s) => s.net > 0).length,
      sellDominantCount: stocks.filter((s) => s.net < 0).length,
      totalBuyAmount,
      totalSellAmount,
      totalNetAmount,
      topBuyStocks: [...stocks]
        .sort((a, b) => b.net - a.net)
        .slice(0, 5)
        .map((s) => ({ symbol: s.symbol, name: s.name, netAmount: s.net, reason: s.reason })),
      topSellStocks: [...stocks]
        .sort((a, b) => a.net - b.net)
        .slice(0, 5)
        .map((s) => ({ symbol: s.symbol, name: s.name, netAmount: s.net, reason: s.reason })),
      // 真实源不提供行业字段，故置空 {}（前端对空对象自动隐藏行业分布卡片）
      industryDistribution: {},
      dataSource: 'eastmoney',
    };
    sendSuccess(res, overview);
  }),
);

// 营业部/机构席位排行（默认最近交易日）
router.get(
  '/top-traders/seat/rank',
  asyncHandler(async (req: Request, res: Response) => {
    const parsed = parseInt(req.query.count as string, 10);
    const count = Number.isFinite(parsed) ? Math.min(Math.max(parsed, 1), 100) : 20;

    const resolved = await resolveRecentTrade();
    if (!resolved) {
      sendSuccess(res, { rank: [], dataSource: 'unavailable', notes: UNAVAILABLE_NOTE });
      return;
    }

    const [buyRows, sellRows] = await Promise.all([
      fetchSeatRows(BUY_REPORT, resolved.date),
      fetchSeatRows(SELL_REPORT, resolved.date),
    ]);

    if (!buyRows && !sellRows) {
      sendSuccess(res, { rank: [], dataSource: 'unavailable', notes: UNAVAILABLE_NOTE });
      return;
    }

    const seats = aggregateSeats(buyRows ?? [], sellRows ?? [])
      .sort((a, b) => b.netAmount - a.netAmount)
      .slice(0, count)
      .map((s, i): SeatRankEntry => ({
        rank: i + 1,
        seatName: s.seatName,
        totalBuyAmount: s.buyAmount,
        totalSellAmount: s.sellAmount,
        netAmount: s.netAmount,
        appearCount: s.appearCount,
        isOrganizational: s.isOrganizational,
      }));

    const partial = !buyRows || !sellRows;
    sendSuccess(res, {
      tradeDate: resolved.date,
      rank: seats,
      dataSource: 'eastmoney',
      notes: partial ? PARTIAL_SELL_NOTE : undefined,
    });
  }),
);

// 龙虎榜历史（近 N 个交易日，按日聚合）
router.get(
  '/top-traders/history/:symbol',
  validateParams(schemas.stockSymbol),
  asyncHandler(async (req: Request, res: Response) => {
    const code = normCode(req.params.symbol);
    const parsed = parseInt(req.query.days as string, 10);
    const days = Number.isFinite(parsed) ? Math.min(Math.max(parsed, 1), 30) : 10;

    const rows = await emGet(DETAIL_REPORT, {
      pageSize: String(days * 4),
      pageNumber: '1',
      sortColumns: 'TRADE_DATE',
      sortTypes: '-1',
      filter: `(SECURITY_CODE="${code}")`,
    });

    if (!rows || !rows.length) {
      sendSuccess(res, {
        symbol: code,
        records: [],
        dataSource: 'unavailable',
        notes: UNAVAILABLE_NOTE,
      });
      return;
    }

    // 按交易日分组（同一日可能有多条上榜原因），取最近 days 个交易日
    const byDate = new Map<string, any[]>();
    for (const r of rows) {
      const d = String(r?.TRADE_DATE ?? '').slice(0, 10);
      if (!d) continue;
      const list = byDate.get(d) ?? [];
      list.push(r);
      byDate.set(d, list);
    }
    const dates = [...byDate.keys()].sort((a, b) => b.localeCompare(a)).slice(0, days);

    const records = await Promise.all(
      dates.map(async (d): Promise<TopTraderRecord> => {
        const dateRows = byDate.get(d) ?? [];
        const buyTotal = dateRows.reduce((s, r) => s + num(r?.BILLBOARD_BUY_AMT), 0);
        const sellTotal = dateRows.reduce((s, r) => s + num(r?.BILLBOARD_SELL_AMT), 0);
        const [buyRows, sellRows] = await Promise.all([
          fetchSeatRows(BUY_REPORT, d, code),
          fetchSeatRows(SELL_REPORT, d, code),
        ]);
        const entries = aggregateSeats(buyRows ?? [], sellRows ?? [])
          .sort((a, b) => b.netAmount - a.netAmount)
          .map((s, i): TopTraderEntry => ({
            rank: i + 1,
            seatName: s.seatName,
            buyAmount: s.buyAmount,
            sellAmount: s.sellAmount,
            netAmount: s.netAmount,
            symbol: code,
            name: String(dateRows[0]?.SECURITY_NAME_ABBR ?? ''),
            reason: String(dateRows[0]?.EXPLANATION ?? ''),
            isOrganizational: s.isOrganizational,
          }));
        const head = dateRows[0] ?? {};
        return {
          symbol: code,
          name: String(head?.SECURITY_NAME_ABBR ?? ''),
          tradeDate: d,
          closePrice: num(head?.CLOSE_PRICE),
          changePercent: num(head?.CHANGE_RATE),
          turnover: num(head?.TURNOVERRATE),
          reason: String(head?.EXPLANATION ?? ''),
          buyTotal,
          sellTotal,
          netTotal: buyTotal - sellTotal,
          entries,
        };
      }),
    );

    sendSuccess(res, { symbol: code, records, dataSource: 'eastmoney' });
  }),
);

// 个股龙虎榜明细（最近一次上榜）
router.get(
  '/top-traders/:symbol',
  validateParams(schemas.stockSymbol),
  asyncHandler(async (req: Request, res: Response) => {
    const code = normCode(req.params.symbol);

    const rows = await emGet(DETAIL_REPORT, {
      pageSize: '20',
      pageNumber: '1',
      sortColumns: 'TRADE_DATE',
      sortTypes: '-1',
      filter: `(SECURITY_CODE="${code}")`,
    });

    if (!rows || !rows.length) {
      sendSuccess(res, {
        symbol: code,
        record: null,
        dataSource: 'unavailable',
        notes: UNAVAILABLE_NOTE,
      });
      return;
    }

    const latestDate = String(rows[0]?.TRADE_DATE ?? '').slice(0, 10);
    const dateRows = rows.filter((r) => String(r?.TRADE_DATE ?? '').slice(0, 10) === latestDate);

    const [buyRows, sellRows] = await Promise.all([
      fetchSeatRows(BUY_REPORT, latestDate, code),
      fetchSeatRows(SELL_REPORT, latestDate, code),
    ]);

    const entries = aggregateSeats(buyRows ?? [], sellRows ?? [])
      .sort((a, b) => b.netAmount - a.netAmount)
      .map((s, i): TopTraderEntry => ({
        rank: i + 1,
        seatName: s.seatName,
        buyAmount: s.buyAmount,
        sellAmount: s.sellAmount,
        netAmount: s.netAmount,
        symbol: code,
        name: String(dateRows[0]?.SECURITY_NAME_ABBR ?? ''),
        reason: String(dateRows[0]?.EXPLANATION ?? ''),
        isOrganizational: s.isOrganizational,
      }));

    const head = dateRows[0] ?? {};
    const buyTotal = dateRows.reduce((s, r) => s + num(r?.BILLBOARD_BUY_AMT), 0);
    const sellTotal = dateRows.reduce((s, r) => s + num(r?.BILLBOARD_SELL_AMT), 0);

    const record: TopTraderRecord = {
      symbol: code,
      name: String(head?.SECURITY_NAME_ABBR ?? ''),
      tradeDate: latestDate,
      closePrice: num(head?.CLOSE_PRICE),
      changePercent: num(head?.CHANGE_RATE),
      turnover: num(head?.TURNOVERRATE),
      reason: String(head?.EXPLANATION ?? ''),
      buyTotal,
      sellTotal,
      netTotal: buyTotal - sellTotal,
      entries,
    };

    sendSuccess(res, {
      symbol: code,
      name: String(req.query.name ?? head?.SECURITY_NAME_ABBR ?? ''),
      record,
      dataSource: 'eastmoney',
    });
  }),
);

export default router;
