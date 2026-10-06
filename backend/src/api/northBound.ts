/**
 * 北向资金 API（真实源 + 诚实缺口标注版）
 *
 * 数据源探索与实测（2026-10-06，沙箱/本机均可直连 datacenter-web.eastmoney.com）：
 *
 *   1. RPT_MUTUAL_STOCK_NORTHSTA（原实现所用）→ `{"success":false,"code":9701,"message":"服务器繁忙"}`
 *      该报表已不可用，故本文件不再使用。
 *
 *   2. RPT_MUTUAL_DEAL_HISTORY（**当前唯一真实可用源**）
 *      URL: https://datacenter-web.eastmoney.com/api/data/v1/get
 *           ?reportName=RPT_MUTUAL_DEAL_HISTORY&columns=ALL
 *           &filter=(MUTUAL_TYPE in ("001","003"))&sortColumns=TRADE_DATE&sortTypes=-1
 *           &source=WEB&client=WEB
 *      MUTUAL_TYPE：001 = 沪股通，003 = 深股通。
 *      实测 2026-09-30 原始行（节选）：
 *        {"MUTUAL_TYPE":"001","TRADE_DATE":"2026-09-30 00:00:00","FUND_INFLOW":null,
 *         "NET_DEAL_AMT":null,"QUOTA_BALANCE":null,"ACCUM_DEAL_AMT":null,
 *         "BUY_AMT":null,"SELL_AMT":null,"LEAD_STOCKS_CODE":"600825.SH",
 *         "LEAD_STOCKS_NAME":"新华传媒","LS_CHANGE_RATE":9.99,
 *         "INDEX_CLOSE_PRICE":3842.19,"INDEX_CHANGE_RATE":0.31,
 *         "HOLD_MARKET_CAP":null,"DEAL_AMT":101257.88,"DEAL_NUM":5269396}
 *
 *   ★ 关键事实：**交易所已停止披露北向资金流口径**（净买额/资金流入/买入额/卖出额/
 *     额度余额/累计成交），对应字段 `NET_DEAL_AMT` / `FUND_INFLOW` / `BUY_AMT` /
 *     `SELL_AMT` / `QUOTA_BALANCE` / `ACCUM_DEAL_AMT` / `HOLD_MARKET_CAP`
 *     在当前数据中**恒为 null**（`QUOTA_BALANCE_TEXT` 文本字段仍有值，如「额度充足」）。
 *     ⟹ 本文件所有「净买额 / 净流入 / 买入额 / 卖出额」语义字段一律返回 **null**，
 *       **严禁**用成交额(DEAL_AMT)倒算、**严禁**用 BUY_AMT/SELL_AMT 相减构造、
 *       **严禁**用其它口径冒充（那是造假，不是降级 —— 诚实红线）。
 *     附本机实测定位（非官方公告）：以 (MUTUAL_TYPE=001) 逐日探测，2024-08-16 仍有值
 *     （NET_DEAL_AMT=-2568.22），2024-08-19 起即为 null，即披露口径自该日起停用。
 *
 *   3. 北向持股明细 RPT_MUTUAL_HOLD_DET（MARKET_CODE=001/003 为沪/深股通）
 *      实测最新 HOLD_DATE 停留在 **2024-09-30**（季度披露口径，此后停更），
 *      已滞后一年以上。返回一年前的持仓快照会被误读为「当前重仓股」，
 *      故 `holdings` 诚实置空数组，仅在 notes 中披露该事实与最后披露日。
 *
 *   4. 北向板块净流入：**无任何真实源**（东财无北向板块级报表，腾讯/新浪亦无）。
 *      `sectors` 恒为 `[]` + notes 说明。
 *
 * 诚实契约（红线）：
 *   - 严格照抄 `backend/src/api/topTraders.ts` 的 `emGet()`：AbortController + 超时 +
 *     try/catch，任何失败一律返回 null，**绝不抛错、绝不编造数值**。
 *   - 本文件内 **严禁出现 Math.random**。
 *   - `dataSource` 顶层与行级保持一致（避免本项目曾出现的两级漂移）。
 *   - **不使用前端 NorthboundFlow 的 `shConnect` / `szConnect` / `total` 字段承载真实成交额**：
 *     那三个字段在前端语义是「净流入」，且 `northboundFlow.ts` 会对它们做 `reduce(sum)`
 *     与 `sorted[0].total ?? 0`。若把成交额塞进去/或置 0，前端「今日北向净流入」卡片会
 *     显示 0.00 亿 —— 那正是「0 值顶替空态」红线。真实成交额因此另置于 `dealFlows`，
 *     并把该前端契约缺口上报（前端不在本文件改动范围内）。
 */

import { Router, Request, Response } from 'express';
import { asyncHandler } from '../utils/apiResponse';

const router = Router();

const EM_DATA = 'https://datacenter-web.eastmoney.com/api/data/v1/get';

/** 沪/深股通日度成交与领涨股（真实源：RPT_MUTUAL_DEAL_HISTORY） */
const DEAL_HISTORY_REPORT = 'RPT_MUTUAL_DEAL_HISTORY';

/** 默认回溯的自然日数（60 个交易日 ≈ 3 个月，与前端「近60日」趋势图对齐） */
const DEFAULT_DAYS = 60;

const UNAVAILABLE_NOTE =
  '北向资金：东方财富数据中心本次不可达或返回空数据；后端未接入任何兜底/编造数据';

/** 带超时与异常兜底的东方财富数据中心请求；任何失败返回 null（诚实降级，禁止抛错/编造） */
async function emGet(
  reportName: string,
  params: Record<string, string>,
  timeoutMs = 10000,
): Promise<any[] | null> {
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    const qs = new URLSearchParams({ reportName, columns: 'ALL', source: 'WEB', client: 'WEB', ...params }).toString();
    const resp = await fetch(`${EM_DATA}?${qs}`, {
      signal: ctrl.signal,
      headers: { 'User-Agent': 'Mozilla/5.0', Referer: 'https://data.eastmoney.com/hsgt/index.html' },
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
 * 数值安全转换：**缺失/非有限一律返回 null，绝不返回 0**。
 * 0 是一个合法的真实数值（如成交笔数为 0 的极端日），用 0 顶替缺失即为造假。
 */
function numOrNull(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

interface DealFlowRow {
  /** 交易日 YYYY-MM-DD */
  date: string;
  channel: '沪股通' | '深股通';
  /** 成交额（万元）—— 真实值，来自 DEAL_AMT */
  dealAmount: number | null;
  /** 成交笔数 —— 真实值，来自 DEAL_NUM */
  dealCount: number | null;
  /** 净买额（万元）—— **恒为 null**：交易所已停止披露北向净买额 */
  netDealAmount: number | null;
  /** 领涨股（真实值） */
  leadStock: { code: string; name: string; changeRate: number | null } | null;
  /** 对应指数收盘价 / 涨跌幅（真实值） */
  indexClose: number | null;
  indexChangeRate: number | null;
  /** 额度状态文本（真实值，如「额度充足」） */
  quotaStatus: string | null;
  dataSource: 'real';
}

/** 拉取沪/深股通日度成交与领涨股；返回按日期升序的扁平行列表 */
async function fetchDealFlows(days: number): Promise<DealFlowRow[] | null> {
  // pageSize 取 days*2*3（每交易日 2 行，留冗余覆盖停牌/缺失日）
  const rows = await emGet(DEAL_HISTORY_REPORT, {
    filter: '(MUTUAL_TYPE in ("001","003"))',
    pageSize: String(Math.min(Math.max(days, 1) * 6, 500)),
    sortColumns: 'TRADE_DATE',
    sortTypes: '-1',
  });
  if (!rows || !rows.length) return null;

  const out: DealFlowRow[] = [];
  for (const r of rows) {
    const rawDate = String(r.TRADE_DATE ?? '');
    const date = rawDate.slice(0, 10);
    const type = String(r.MUTUAL_TYPE ?? '');
    if (!date || (type !== '001' && type !== '003')) continue;

    const leadCode = r.LEAD_STOCKS_CODE ? String(r.LEAD_STOCKS_CODE) : '';
    const leadName = r.LEAD_STOCKS_NAME ? String(r.LEAD_STOCKS_NAME) : '';

    out.push({
      date,
      channel: type === '001' ? '沪股通' : '深股通',
      dealAmount: numOrNull(r.DEAL_AMT),
      dealCount: numOrNull(r.DEAL_NUM),
      // 交易所自 2024-08-19 起停止披露；此处原样透传（上游给 null 就是 null）
      netDealAmount: numOrNull(r.NET_DEAL_AMT),
      leadStock: leadCode || leadName ? { code: leadCode, name: leadName, changeRate: numOrNull(r.LS_CHANGE_RATE) } : null,
      indexClose: numOrNull(r.INDEX_CLOSE_PRICE),
      indexChangeRate: numOrNull(r.INDEX_CHANGE_RATE),
      quotaStatus: r.QUOTA_BALANCE_TEXT ? String(r.QUOTA_BALANCE_TEXT) : null,
      dataSource: 'real',
    });
  }
  if (!out.length) return null;
  out.sort((a, b) => a.date.localeCompare(b.date) || a.channel.localeCompare(b.channel));
  return out;
}

/** 把沪/深两条扁平行合并为按日期的汇总，供宏观卡片与表格消费 */
function summarizeByDate(rows: DealFlowRow[]) {
  const byDate = new Map<string, { sh: DealFlowRow | null; sz: DealFlowRow | null }>();
  for (const r of rows) {
    const slot = byDate.get(r.date) ?? { sh: null, sz: null };
    if (r.channel === '沪股通') slot.sh = r;
    else slot.sz = r;
    byDate.set(r.date, slot);
  }
  const add = (a: number | null, b: number | null): number | null =>
    a === null || b === null ? null : a + b;

  return [...byDate.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([date, { sh, sz }]) => ({
      date,
      shDealAmount: sh?.dealAmount ?? null,
      szDealAmount: sz?.dealAmount ?? null,
      totalDealAmount: add(sh?.dealAmount ?? null, sz?.dealAmount ?? null),
      shDealCount: sh?.dealCount ?? null,
      szDealCount: sz?.dealCount ?? null,
      // 净买额：上游已停披露，两路皆 null；绝不用成交额倒算
      shNetInflow: null,
      szNetInflow: null,
      totalNetInflow: null,
      shIndexClose: sh?.indexClose ?? null,
      szIndexClose: sz?.indexClose ?? null,
      shQuotaStatus: sh?.quotaStatus ?? null,
      szQuotaStatus: sz?.quotaStatus ?? null,
      dataSource: 'real' as const,
    }));
}

/**
 * GET /api/north-bound/overview
 *
 * 返回结构：
 *   - `dealFlows` / `byDate`：真实可得（成交额、成交笔数、领涨股、指数收盘、额度状态）
 *   - `netInflow*` 系列：**恒为 null**，附 `netInflowDisclosure` 说明交易所已停止披露
 *   - `holdings`：恒为 `[]`（RPT_MUTUAL_HOLD_DET 最新仅到 2024-09-30，滞后一年以上，
 *     返回会被误读为当前重仓股）
 *   - `sectors`：恒为 `[]`（北向板块级净流入无任何真实源）
 *   - `flows`：恒为 `[]`。**刻意置空**——该数组在前端 `NorthboundPage` 里喂给
 *     `summarizeNorthboundFlow()`，其 `total` 字段语义为「净流入」。若填 0 会让页面
 *     「今日北向净流入」显示 0.00 亿（0 值顶替空态）；填成交额则是口径造假。
 *     故宁可置空让页面走诚实空态分支，真实成交额另置于 `dealFlows`。
 */
router.get(
  '/overview',
  asyncHandler(async (req: Request, res: Response) => {
    const days = Math.min(Math.max(parseInt(String(req.query.days ?? ''), 10) || DEFAULT_DAYS, 1), 250);
    const rows = await fetchDealFlows(days);

    if (!rows || !rows.length) {
      res.json({
        success: true,
        data: { flows: [], holdings: [], sectors: [], dealFlows: [], byDate: [] },
        dataSource: 'unavailable',
        message: UNAVAILABLE_NOTE,
        notes: {
          source: UNAVAILABLE_NOTE,
          report: `${DEAL_HISTORY_REPORT}（MUTUAL_TYPE 001=沪股通 / 003=深股通）`,
          triedFallback: 'RPT_MUTUAL_STOCK_NORTHSTA 已下线（code 9701 服务器繁忙），不再使用',
          netInflow: '净买额恒为 null：交易所已停止披露北向资金净买额',
          holdings: '恒为空：RPT_MUTUAL_HOLD_DET 的沪/深股通（MARKET_CODE 001/003）最新披露日仅到 2024-09-30，滞后一年以上',
          sectors: '恒为空：北向板块级净流入无任何真实数据源',
          flows: '刻意置空，避免前端把「净流入」字段按 0 渲染（0 值顶替空态红线）',
        },
        timestamp: new Date().toISOString(),
      });
      return;
    }

    const latest = rows[rows.length - 1];
    res.json({
      success: true,
      data: {
        // 净流入语义字段：恒定 null，绝不倒算、绝不用成交额冒充
        flows: [],
        holdings: [],
        sectors: [],
        dealFlows: rows,
        byDate: summarizeByDate(rows),
        latestTradeDate: latest.date,
      },
      dataSource: 'real',
      message:
        '北向资金「净买额 / 资金流入 / 买入额 / 卖出额 / 额度余额 / 累计成交」口径已被交易所停止披露' +
        '（上游对应字段现均为 null），故所有该类语义字段一律为 null，绝不以成交额倒算、' +
        '不以买卖额相减、不以其它口径冒充；本页真实可得的是沪/深股通成交额、成交笔数、领涨股与额度状态文本。',
      netInflowDisclosure: {
        disclosed: false,
        lastDisclosedDateObserved: '2024-08-16',
        note:
          '上游 RPT_MUTUAL_DEAL_HISTORY 的 NET_DEAL_AMT / FUND_INFLOW / BUY_AMT / SELL_AMT / QUOTA_BALANCE / ACCUM_DEAL_AMT / HOLD_MARKET_CAP 现均为 null（资金流口径已停止披露）。' +
          '本机逐日实测（非官方公告）：2024-08-16 该字段仍有值（-2568.22 万元），2024-08-19 起为 null。',
      },
      holdingsDisclosure: {
        available: false,
        lastDisclosedDate: '2024-09-30',
        note:
          '北向持股明细（RPT_MUTUAL_HOLD_DET，MARKET_CODE 001/003 为沪/深股通）最新披露日仅到 2024-09-30，' +
          '为季度披露口径且已停更一年以上；返回该快照会被误读为「当前重仓股」，故 holdings 诚实置空。',
      },
      sectorsDisclosure: {
        available: false,
        note: '北向板块级净流入在东方财富 / 腾讯 / 新浪均无真实数据源，故 sectors 恒为空数组。',
      },
      notes: {
        source: `东方财富数据中心 ${DEAL_HISTORY_REPORT}（真实可得部分：成交额/成交笔数/领涨股/指数/额度状态）`,
        report: `${DEAL_HISTORY_REPORT}?filter=(MUTUAL_TYPE in ("001","003"))&sortColumns=TRADE_DATE&sortTypes=-1`,
        rows: `本次返回 ${rows.length} 行，覆盖 ${rows[0].date} ~ ${latest.date}`,
        netInflow: '净买额/净流入一律 null —— 交易所已停止披露，绝不倒算、绝不以其它口径冒充',
        holdings: '恒为空 + holdingsDisclosure 说明（上游停更至 2024-09-30）',
        sectors: '恒为空 + sectorsDisclosure 说明（无真实源）',
        flows: '刻意置空，避免前端把 netInflow 语义字段按 0 渲染（0 值顶替空态红线）',
        deprecated: 'RPT_MUTUAL_STOCK_NORTHSTA 已下线（code 9701「服务器繁忙」），不再使用',
      },
      timestamp: new Date().toISOString(),
    });
  }),
);

export default router;