/**
 * 限售股解禁 API（东财真实源）
 *
 * 红线：本文件内 **严禁出现 Math.random**（backend/src/api/ 属诚实门禁 RED 域）。
 * 任何拉取失败一律返回 `dataSource: 'unavailable'` + notes 显性说明，绝不编造数值。
 *
 * 真实数据源：东方财富数据中心限售股解禁报表
 *   - 解禁日历/排行/个股：RPT_LIFT_STAGE（解禁批次，按 FREE_DATE / SECURITY_CODE 过滤）
 *   - 解禁股东明细：RPT_LIFT_GD（取 LIMITED_HOLDER_NAME 补 shareholder，失败不致命）
 *
 * 【根因修复 P0-5B】原实现用 `RPT_LCX_XFXJMX`，该报表名在东财不存在，
 * 稳定返回 `{"success":false,"code":9501,"message":"报表配置不存在"}`，
 * 于是 fetch 恒返回 null → 端点恒 unavailable。正确报表名为 `RPT_LIFT_STAGE`。
 *
 * 【单位口径 · 全部经真实响应逐字段核对】
 *   CURRENT_FREE_SHARES 本次解禁股数，单位「万股」
 *   FREE_SHARES         解禁后无限售流通股（万股）；NON_FREE_SHARES 仍限售（万股）
 *   LIFT_MARKET_CAP     解禁市值，单位「万元」（实测 CURRENT_FREE_SHARES × NEW ≡ LIFT_MARKET_CAP）
 *   NEW                 现价，单位「元/股」
 *   FREE_RATIO          占流通股比例，小数口径（实测 ≡ CURRENT_FREE_SHARES/(FREE_SHARES-CURRENT_FREE_SHARES)）
 *
 *   前端契约（LockupCalendarPage.formatShares/formatAmount + shared/types.ts LockupExpiry）
 *   要求股数为「股」、市值为「元」、unlockRatio 为「百分数」，
 *   故下面统一乘 10000（万股→股、万元→元）、乘 100（小数→百分数）。
 *
 * 【月末日期陷阱】东财 filter 的日期必须是**真实存在的日历日**，否则整窗报
 * `code:9501 日期格式有误`。4/6/9 月只有 30 天，若硬编码 '31' 会整月取不到数据
 * （实测 2026-06 用 06-31 → 9501，改 06-30 → count=156）。故月末用 Date 精确计算。
 *
 * 【9501 的两种成因·勿混淆】东财用同一个 code 9501 表达两类完全不同的问题：
 *   1) `报表配置不存在,<报表名>`  → **报表名写错/端点废弃**（本文件原用 RPT_LCX_XFXJMX 即此）；
 *      换报表名即可修复，与网络、参数无关。
 *   2) `日期格式有误`             → **参数预处理错误**，报表名是对的，但日期非法
 *      （如用 06-31 这种不存在的日历日）。
 *   另：代码类 `SECURITY_CODE` 过滤必须用**双引号** `(SECURITY_CODE="601088")`，
 *   日期必须用**单引号** `(FREE_DATE>='2026-10-01')`；引号用错会得到空结果或 9501，
 *   但根因是引号而非报表名。排查时先看 message 后半段区分两类成因。
 */

import { Request, Response, Router } from 'express';
import { validateQuery, validateParams, schemas } from '../middleware/validation';
import { asyncHandler, sendSuccess } from '../utils/apiResponse';

const router = Router();

const EM_DATA = 'https://datacenter-web.eastmoney.com/api/data/v1/get';

/** 解禁批次报表（解禁日历/排行/个股历史的唯一真实源） */
const LIFT_STAGE_REPORT = 'RPT_LIFT_STAGE';
/** 解禁股东明细报表（补 shareholder 字段，失败不致命） */
const LIFT_HOLDER_REPORT = 'RPT_LIFT_GD';

/** 万股 → 股、万元 → 元 */
const WAN = 10000;

/** 带超时与异常兜底的东方财富数据中心请求；任何失败返回 null（诚实降级，禁止抛错/编造） */
async function emGet(
  reportName: string,
  params: Record<string, string>,
  timeoutMs = 8000,
): Promise<any[] | null> {
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    const qs = new URLSearchParams({
      reportName,
      columns: 'ALL',
      source: 'WEB',
      client: 'WEB',
      ...params,
    }).toString();
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

/** 数值安全转换：非有限值归 0（缺失即缺失，不倒填） */
function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

/** 该年月的真实首末日（非法日期会让东财整窗返回 9501「日期格式有误」） */
function monthRange(year: number, month: number): { start: string; end: string } {
  const lastDay = new Date(year, month, 0).getDate();
  const mm = String(month).padStart(2, '0');
  return { start: `${year}-${mm}-01`, end: `${year}-${mm}-${String(lastDay).padStart(2, '0')}` };
}

/**
 * 归一化年份/月份：月份越界时回退到当前月（绝不把非法月份透传给东财）。
 *
 * 【根因修复 P0-5B·第二层】year/month 必须从**原始 query串**取，不能读 req.query：
 * `validateQuery` 用 `schema.validate(req.query, { stripUnknown: true })`，
 * 而 `schemas.lockupCalendar` / `schemas.lockupRank` 并未声明 year/month，
 * 故这两个键会被**静默剥离**——前端 LockupCalendarPage 传来的
 * `?year=2026&month=10` 会被丢成当前月，日历翻月永远失效。
 * validation.ts 不在本工单可改范围内，故在此自行解析 req.originalUrl 兜底。
 */
function normYearMonth(req: Request): { year: number; month: number } {
  const now = new Date();
  const raw = new URLSearchParams((req.originalUrl ?? '').split('?')[1] ?? '');
  const y = parseInt(raw.get('year') ?? '', 10);
  const m = parseInt(raw.get('month') ?? '', 10);
  const year = Number.isFinite(y) ? y : now.getFullYear();
  const month = Number.isFinite(m) && m >= 1 && m <= 12 ? m : now.getMonth() + 1;
  return { year, month };
}

interface LockupExpiry {
  id: number;
  symbol: string;
  name: string;
  expiryDate: string;
  lockupType: string;
  shareholder: string;
  /** 解禁股数，单位「股」 */
  totalShares: number;
  /** 解禁前无限售流通股，单位「股」 */
  circulatingBefore: number;
  /** 占流通股比例，单位「%」 */
  unlockRatio: number;
  /** 解禁市值，单位「元」 */
  marketValue: number;
  /** 现价，单位「元/股」 */
  price: number;
  /** 解禁后无限售流通股，单位「股」 */
  actualCirculating: number;
}

/** RPT_LIFT_STAGE 单行 → 端点契约（字段映射与单位换算见文件头口径说明） */
function mapStageRow(r: any, id: number): LockupExpiry {
  const currentFree = num(r?.CURRENT_FREE_SHARES);
  const freeAfter = num(r?.FREE_SHARES);
  return {
    id,
    symbol: String(r?.SECURITY_CODE ?? '').trim(),
    name: String(r?.SECURITY_NAME_ABBR ?? ''),
    expiryDate: String(r?.FREE_DATE ?? '').slice(0, 10),
    lockupType: String(r?.FREE_SHARES_TYPE ?? ''),
    shareholder: '',
    totalShares: currentFree * WAN,
    // FREE_SHARES 是解禁「后」的无限售流通股，倒推解禁前
    circulatingBefore: (freeAfter - currentFree) * WAN,
    unlockRatio: num(r?.FREE_RATIO) * 100,
    marketValue: num(r?.LIFT_MARKET_CAP) * WAN,
    price: num(r?.NEW),
    actualCirculating: freeAfter * WAN,
  };
}

/**
 * 拉取某月解禁批次（RPT_LIFT_STAGE）。拉取失败/该月无数据返回 null。
 */
async function fetchMonthBatch(year: number, month: number): Promise<LockupExpiry[] | null> {
  const { start, end } = monthRange(year, month);
  const rows = await emGet(LIFT_STAGE_REPORT, {
    filter: `(FREE_DATE>='${start}')(FREE_DATE<='${end}')`,
    sortColumns: 'FREE_DATE',
    sortTypes: '1',
    pageSize: '500',
    pageNumber: '1',
  });
  if (!rows || !rows.length) return null;
  const list = rows
    .map((r, i) => mapStageRow(r, i + 1))
    .filter((d) => d.expiryDate && d.symbol);
  return list.length ? list : null;
}

/**
 * 拉取某月解禁股东明细，产出 `${代码}|${解禁日}` → 股东名 的映射。
 * 仅用于填充 shareholder 字段，故失败返回空 Map（不牵连主数据）。
 */
async function fetchMonthHolders(year: number, month: number): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  const { start, end } = monthRange(year, month);
  for (let page = 1; page <= 4; page++) {
    const rows = await emGet(
      LIFT_HOLDER_REPORT,
      {
        filter: `(FREE_DATE>='${start}')(FREE_DATE<='${end}')`,
        pageSize: '500',
        pageNumber: String(page),
      },
      6000,
    );
    if (!rows || !rows.length) break;
    for (const r of rows) {
      const code = String(r.SECURITY_CODE ?? '').trim();
      const day = String(r.FREE_DATE ?? '').slice(0, 10);
      const holder = String(r.LIMITED_HOLDER_NAME ?? '').trim();
      if (!code || !day || !holder) continue;
      const key = `${code}|${day}`;
      const exist = map.get(key);
      // 同日同代码多股东 → 前 3 名 + 「等 N 户」，避免单元格被撑爆
      if (!exist) {
        map.set(key, holder);
      } else {
        const names = exist.replace(/ 等\d+ 户$/, '').split('、');
        if (names.length < 3) map.set(key, `${exist}、${holder}`);
        else map.set(key, `${names.slice(0, 3).join('、')} 等${names.length + 1} 户`);
      }
    }
    if (rows.length < 500) break;
  }
  return map;
}

const UNAVAILABLE_NOTE =
  '限售股解禁：东方财富解禁报表（RPT_LIFT_STAGE）本次不可达或该月无解禁记录；后端未接入任何兜底/随机数据';

/** 空日历骨架（保持与前端 LockupCalendarPage 契约一致：expiries / byDate / summary） */
function emptyCalendar(year: number, month: number, notes = UNAVAILABLE_NOTE) {
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
    notes,
  };
}

// 月度解禁日历
router.get(
  '/lockup/calendar',
  validateQuery(schemas.lockupCalendar),
  asyncHandler(async (req: Request, res: Response) => {
    const { year, month } = normYearMonth(req);

    // 股东明细仅用于补字段，失败不影响解禁主数据
    const [holders, batch] = await Promise.all([
      fetchMonthHolders(year, month),
      fetchMonthBatch(year, month),
    ]);

    if (!batch) {
      sendSuccess(res, emptyCalendar(year, month));
      return;
    }
    const real = batch.map((b) => ({
      ...b,
      shareholder: holders.get(`${b.symbol}|${b.expiryDate}`) ?? '',
    }));

    const byDate: Record<string, LockupExpiry[]> = {};
    let totalMarketValue = 0;
    let totalShares = 0;
    for (const item of real) {
      if (!byDate[item.expiryDate]) byDate[item.expiryDate] = [];
      byDate[item.expiryDate].push(item);
      totalMarketValue += item.marketValue;
      totalShares += item.totalShares;
    }

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
        // unlockRatio 已是百分数，故直接取均值（不再乘 100）
        avgUnlockRatio: real.length
          ? Math.round((real.reduce((s, d) => s + d.unlockRatio, 0) / real.length) * 100) / 100
          : 0,
      },
      dataSource: 'real',
    });
  }),
);

// 解禁排行（按解禁市值降序）
router.get(
  '/lockup/rank',
  validateQuery(schemas.lockupRank),
  asyncHandler(async (req: Request, res: Response) => {
    const { year, month } = normYearMonth(req);

    const real = await fetchMonthBatch(year, month);
    if (!real) {
      sendSuccess(res, { rank: [], dataSource: 'unavailable', notes: UNAVAILABLE_NOTE });
      return;
    }
    const rank = [...real].sort((a, b) => b.marketValue - a.marketValue).slice(0, 20);
    sendSuccess(res, { rank, dataSource: 'real' });
  }),
);

// 个股解禁历史（按代码直查 RPT_LIFT_STAGE，无需逐月扫描）
router.get(
  '/lockup/:symbol',
  validateParams(schemas.stockSymbol),
  asyncHandler(async (req: Request, res: Response) => {
    const symbol = String(req.params.symbol).trim().replace(/\.(SZ|SH|BJ)$/i, '');
    // months 同year/month：validateParams 只校验 params，query 里的 months 需自行取
    const monthsQ = new URLSearchParams((req.originalUrl ?? '').split('?')[1] ?? '').get('months');
    const months = Math.min(parseInt(String(monthsQ ?? ''), 10) || 12, 36);

    const rows = await emGet(LIFT_STAGE_REPORT, {
      filter: `(SECURITY_CODE="${symbol}")`,
      sortColumns: 'FREE_DATE',
      sortTypes: '-1',
      pageSize: '500',
      pageNumber: '1',
    });

    if (!rows || !rows.length) {
      sendSuccess(res, {
        symbol,
        expiries: [],
        total: 0,
        dataSource: 'unavailable',
        notes: `限售股解禁：东方财富解禁报表（RPT_LIFT_STAGE）本次不可达，或 ${symbol} 无解禁记录；后端未接入任何兜底/随机数据`,
      });
      return;
    }

    // 只保留最近 months 个月内的解禁批次
    const cutoff = new Date();
    cutoff.setMonth(cutoff.getMonth() - months);
    const cutoffStr = `${cutoff.getFullYear()}-${String(cutoff.getMonth() + 1).padStart(2, '0')}-01`;

    const list = rows
      .map((r, i) => mapStageRow(r, i + 1))
      .filter((d) => d.expiryDate && d.symbol && d.expiryDate >= cutoffStr);

    if (!list.length) {
      sendSuccess(res, {
        symbol,
        expiries: [],
        total: 0,
        dataSource: 'unavailable',
        notes: `限售股解禁：${symbol} 在最近 ${months} 个月内无解禁记录（东财解禁报表查询成功但结果为空）`,
      });
      return;
    }

    // 顺带取真实股东名（失败即留空，不倒填）
    const holders = await emGet(
      LIFT_HOLDER_REPORT,
      {
        filter: `(SECURITY_CODE="${symbol}")`,
        sortColumns: 'FREE_DATE',
        sortTypes: '-1',
        pageSize: '500',
        pageNumber: '1',
      },
      6000,
    );
    const withHolders = holders?.length
      ? list.map((d) => {
          const names = holders
            .filter(
              (h) =>
                String(h?.SECURITY_CODE ?? '').trim() === d.symbol &&
                String(h?.FREE_DATE ?? '').slice(0, 10) === d.expiryDate,
            )
            .map((h) => String(h?.LIMITED_HOLDER_NAME ?? '').trim())
            .filter(Boolean);
          return { ...d, shareholder: names.slice(0, 3).join('、') };
        })
      : list;

    sendSuccess(res, {
      symbol,
      expiries: withHolders.sort((a, b) => a.expiryDate.localeCompare(b.expiryDate)),
      total: withHolders.length,
      dataSource: 'real',
    });
  }),
);

export default router;