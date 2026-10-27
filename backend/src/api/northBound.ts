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
 *      实测最新 HOLD_DATE 停留在 **2024-09-30**，已停更一年以上，返回该快照会被误读为
 *      「当前重仓股」，故本文件不再用它供 `holdings`（2026-10-28 起改由第 5 条供数）。
 *
 *   4. 北向板块净流入：**无任何真实源**（官方口径只有日频成交额与季频个股持股，
 *      无板块级净流入；东财/腾讯/新浪亦无）。`sectors` 恒为 `[]` + notes 说明。
 *
 *   5. ★ 沪深股通**个股持股统计** RPT_MUTUAL_HOLDSTOCKNORTH_STA（**持仓真实源**，
 *      2026-10-28 本机实测）
 *      URL: https://datacenter-web.eastmoney.com/api/data/v1/get
 *           ?reportName=RPT_MUTUAL_HOLDSTOCKNORTH_STA&columns=ALL
 *           &filter=(MUTUAL_TYPE in ("001","003"))&sortColumns=TRADE_DATE,HOLD_MARKET_CAP
 *           &sortTypes=-1,-1&pageSize=20&source=WEB&client=WEB
 *      实测 HTTP 200 / 0.09s / count=3953，最新一期 **TRADE_DATE = 2026-09-30**；
 *      该报表**只保留最新一期季度快照**（分别探测 TRADE_DATE=2024-08-16 与 2024-08-19，
 *      均返回 `{"success":false,"message":"返回数据为空","code":9201}`）。
 *      原始行（Top1，节选原文）：
 *        {"SECUCODE":"300750.SZ","TRADE_DATE":"2026-09-30 00:00:00","SECURITY_CODE":"300750",
 *         "SECURITY_NAME":"宁德时代","MUTUAL_TYPE":"003","CHANGE_RATE":1.502789400279,
 *         "CLOSE_PRICE":291.11,"HOLD_SHARES":800682980,"HOLD_MARKET_CAP":233086822307.8,
 *         "A_SHARES_RATIO":18.16,"HOLD_SHARES_RATIO":18.16,"FREE_SHARES_RATIO":18.7927,
 *         "TOTAL_SHARES_RATIO":17.3036,"HOLD_MARKETCAP_CHG1":null,...}
 *      -> `holdings` 取该报表按 HOLD_MARKET_CAP 倒序的 Top N（真实持股数量/市值/占比）。
 *      ⚠ `HOLD_MARKETCAP_CHG1/5/10`（日变动）恒为 null，与净买额同源停披露，
 *        故 `dayChange` 一律 null，**绝不**用 CHANGE_RATE 倒算「上一期持股」再相减。
 *
 * ── 官方口径依据（2026-10-28 实测抓取，非推断）──────────────────────────────
 *   · HKEX「Stock Connect Northbound Shareholding Search By Date」页面原文
 *     （https://www.hkex.com.hk/Mutual-Market/Stock-Connect/Top-Stock-Connect-Shareholdings/Northbound-SH?sc_lang=en）：
 *       "Starting from 19 August 2024, Stock Connect Northbound Shareholding information will
 *        only be available on a quarterly basis. Information ... on the 5th Northbound trading
 *        day following the quarter end."
 *     该页 Shareholding Date 默认值即为 **2026/09/30**，与东财报表日期互相印证。
 *   · 沪深交易所自 2024-08-19 起调整沪/深股通交易信息披露机制：每交易日收市后仅公布
 *     **成交总额、总成交笔数、ETF 成交总额、成交金额前十证券名单及其成交总额**（按月/年汇总）；
 *     **每季第五个交易日**公布上季末单只证券的北向投资者**合计持有数量**。
 *   ⟹ 「日频净买入 = 买入额 − 卖出额」在官方口径下已不存在，任何第三方（东财 / 腾讯 /
 *     新浪 / PandaData）都不可能比交易所披露得更多，故本接口不以任何方式构造净买入。
 *   附旁证：南向（港股通）不受此限制 —— RPT_MUTUAL_HOLD_DET 中 MARKET_CODE="S" 的行
 *   实测仍有 2026-10-26 的日频持股数据，说明「北向停披露」是口径变化而非我方抓取故障。
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

/** 沪深股通个股持股统计（真实源：RPT_MUTUAL_HOLDSTOCKNORTH_STA，季度披露口径） */
const HOLD_STOCK_STA_REPORT = 'RPT_MUTUAL_HOLDSTOCKNORTH_STA';

/** 重仓股取数条数（按 HOLD_MARKET_CAP 倒序） */
const DEFAULT_HOLDINGS_TOP_N = 20;

const UNAVAILABLE_NOTE =
  '北向资金：东方财富数据中心本次不可达或返回空数据；后端未接入任何兜底/编造数据';

/** 东财数据中心返回体；`count` 为**上游匹配到的总行数**（用于诚实披露「取了 Top N / 共 M 只」） */
interface EmResult {
  rows: any[] | null;
  count: number | null;
}

/** 带超时与异常兜底的东方财富数据中心请求；任何失败返回 null（诚实降级，禁止抛错/编造） */
async function emGet(
  reportName: string,
  params: Record<string, string>,
  timeoutMs = 10000,
): Promise<EmResult | null> {
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
    return { rows: json.result.data ?? null, count: typeof json.result.count === 'number' ? json.result.count : null };
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
  const res = await emGet(DEAL_HISTORY_REPORT, {
    filter: '(MUTUAL_TYPE in ("001","003"))',
    pageSize: String(Math.min(Math.max(days, 1) * 6, 500)),
    sortColumns: 'TRADE_DATE',
    sortTypes: '-1',
  });
  const rows = res?.rows;
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

/** 北向个股持仓（真实源：RPT_MUTUAL_HOLDSTOCKNORTH_STA，季度披露口径） */
interface HoldingRow {
  ticker: string;
  name: string;
  channel: '沪股通' | '深股通';
  /** 持股数量（股）—— 上游 HOLD_SHARES 原值 */
  holdShares: number | null;
  /** 持股市值（**元**）—— 上游 HOLD_MARKET_CAP 原值，展示侧自行换算为亿元 */
  holdMarketCap: number | null;
  /** 占流通股比例（%）—— FREE_SHARES_RATIO */
  freeFloatRatio: number | null;
  /** 占 A 股比例（%）—— A_SHARES_RATIO */
  aSharesRatio: number | null;
  /** 披露日收盘价（元） */
  closePrice: number | null;
  /** 披露日涨跌幅（%） */
  changeRate: number | null;
  /** 持股披露日（季度末，YYYY-MM-DD） */
  holdDate: string;
  /**
   * 较上一期增减：**恒为 null**。上游 HOLD_MARKETCAP_CHG1/5/10 与净买额同源停披露，
   * 且季度口径无「日变动」语义；绝不用 changeRate 倒算上期持股再相减。
   */
  dayChange: null;
  dataSource: 'real';
}

/** 拉取北向个股持仓 Top N（按持股市值倒序）；不可得返回 null */
async function fetchHoldings(topN: number): Promise<{ rows: HoldingRow[]; totalCount: number | null } | null> {
  const res = await emGet(HOLD_STOCK_STA_REPORT, {
    filter: '(MUTUAL_TYPE in ("001","003"))',
    pageSize: String(topN),
    sortColumns: 'TRADE_DATE,HOLD_MARKET_CAP',
    sortTypes: '-1,-1',
  });
  const rows = res?.rows;
  if (!rows || !rows.length) return null;

  // 防御：若上游某日同时存在多期，只取最新一期（避免把旧季度混进 Top N）
  const dates = rows.map((r) => String(r.TRADE_DATE ?? '').slice(0, 10)).filter(Boolean);
  const latestDate = dates.sort().reverse()[0];
  if (!latestDate) return null;

  const out: HoldingRow[] = [];
  for (const r of rows) {
    const holdDate = String(r.TRADE_DATE ?? '').slice(0, 10);
    if (holdDate !== latestDate) continue;
    const ticker = r.SECUCODE ? String(r.SECUCODE) : '';
    if (!ticker) continue;
    out.push({
      ticker,
      name: r.SECURITY_NAME ? String(r.SECURITY_NAME) : '',
      channel: String(r.MUTUAL_TYPE ?? '') === '001' ? '沪股通' : '深股通',
      holdShares: numOrNull(r.HOLD_SHARES),
      holdMarketCap: numOrNull(r.HOLD_MARKET_CAP),
      freeFloatRatio: numOrNull(r.FREE_SHARES_RATIO),
      aSharesRatio: numOrNull(r.A_SHARES_RATIO),
      closePrice: numOrNull(r.CLOSE_PRICE),
      changeRate: numOrNull(r.CHANGE_RATE),
      holdDate,
      dayChange: null,
      dataSource: 'real',
    });
  }
  if (!out.length) return null;
  out.sort((a, b) => (b.holdMarketCap ?? -1) - (a.holdMarketCap ?? -1));
  return { rows: out, totalCount: res?.count ?? null };
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
 *   - `holdings`：**真实可得**（RPT_MUTUAL_HOLDSTOCKNORTH_STA 季度披露口径，含持股数量 /
 *     持股市值 / 占流通股比例；`dayChange` 恒 null，因日变动与净买额同源停披露）
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
    const holdingsTopN = Math.min(Math.max(parseInt(String(req.query.holdingsLimit ?? ''), 10) || DEFAULT_HOLDINGS_TOP_N, 1), 100);
    const [rows, holdingsRes] = await Promise.all([fetchDealFlows(days), fetchHoldings(holdingsTopN)]);

    const OFFICIAL_BASIS = [
      'HKEX「Stock Connect Northbound Shareholding Search By Date」页面原文：Starting from 19 August 2024, Stock Connect Northbound Shareholding information will only be available on a quarterly basis.（该页默认 Shareholding Date = 2026/09/30）',
      '沪深交易所自 2024-08-19 起调整沪/深股通交易信息披露机制：每交易日收市后仅公布成交总额、总成交笔数、ETF 成交总额、成交金额前十证券名单及其成交总额（按月/年汇总）；每季第五个交易日公布上季末单只证券的北向投资者合计持有数量。',
      'PandaData get_hsgt_hold 实测佐证：600519.SH 在 2024-07-02~2024-08-17 为日频持股，2024-09-30 / 2024-12-31 / 2025-03-31 / 2026-03-31 / 2026-06-30 为季频持股，此后无日频。',
    ];
    const OFFICIAL_SOURCES = [
      'https://www.hkex.com.hk/Mutual-Market/Stock-Connect/Top-Stock-Connect-Shareholdings/Northbound-SH?sc_lang=en',
      'https://www.hkex.com.hk/Mutual-Market/Stock-Connect/Statistics/Historical-Daily?sc_lang=en',
    ];

    if (!rows || !rows.length) {
      res.json({
        success: true,
        data: {
          flows: [],
          sectors: [],
          dealFlows: [],
          byDate: [],
          holdings: holdingsRes?.rows ?? [],
        },
        dataSource: holdingsRes ? 'partial' : 'unavailable',
        message: UNAVAILABLE_NOTE,
        notes: {
          source: UNAVAILABLE_NOTE,
          report: `${DEAL_HISTORY_REPORT}（MUTUAL_TYPE 001=沪股通 / 003=深股通）`,
          triedFallback: 'RPT_MUTUAL_STOCK_NORTHSTA 已下线（code 9701 服务器繁忙），不再使用',
          netInflow: '净买额恒为 null：交易所已停止披露北向资金净买额',
          holdings: holdingsRes
            ? `持仓为真实季度快照（${HOLD_STOCK_STA_REPORT}，披露日 ${holdingsRes.rows[0].holdDate}）`
            : '持仓本次不可得（上游未返回数据），置空而非编造',
          sectors: '恒为空：北向板块级净流入无任何真实数据源',
          flows: '刻意置空，避免前端把「净流入」字段按 0 渲染（0 值顶替空态红线）',
        },
        holdingsDisclosure: holdingsRes
          ? {
              available: true,
              lastDisclosedDate: holdingsRes.rows[0].holdDate,
              caliber: '季度（每季第五个交易日披露上季末个股持股数量）',
              report: HOLD_STOCK_STA_REPORT,
              totalCount: holdingsRes.totalCount,
              note: '北向持仓自 2024-08-19 起转为季度披露，本接口取上游最新一期快照按持股市值倒序的 Top N。',
            }
          : {
              available: false,
              lastDisclosedDate: null,
              caliber: '季度',
              report: HOLD_STOCK_STA_REPORT,
              totalCount: null,
              note: '本次上游未返回北向个股持股数据，holdings 置空（不以任何估算值顶替）。',
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
        holdings: holdingsRes?.rows ?? [],
        sectors: [],
        dealFlows: rows,
        byDate: summarizeByDate(rows),
        latestTradeDate: latest.date,
      },
      dataSource: 'real',
      message:
        '北向资金「净买额 / 资金流入 / 买入额 / 卖出额 / 额度余额 / 累计成交」口径已被交易所停止披露' +
        '（上游对应字段现均为 null），故所有该类语义字段一律为 null，绝不以成交额倒算、' +
        '不以买卖额相减、不以其它口径冒充；本接口真实可得的是沪/深股通成交额、成交笔数、领涨股、' +
        '额度状态文本，以及季度披露口径的个股持股数量与持股市值。',
      netInflowDisclosure: {
        disclosed: false,
        lastDisclosedDateObserved: '2024-08-16',
        officialBasis: OFFICIAL_BASIS,
        sources: OFFICIAL_SOURCES,
        note:
          '上游 RPT_MUTUAL_DEAL_HISTORY 的 NET_DEAL_AMT / FUND_INFLOW / BUY_AMT / SELL_AMT / QUOTA_BALANCE / ACCUM_DEAL_AMT / HOLD_MARKET_CAP 现均为 null（资金流口径已停止披露）。' +
          '本机逐日实测（非官方公告）：2024-08-16 该字段仍有值（-2568.22 万元），2024-08-19 起为 null。' +
          '替代源实测结论：PandaData 仅有季频 get_hsgt_hold（无北向日频口径方法）；腾讯 getRank 的 hsgt/hgt/sgt 等 board_type 均返回空 rank_list；' +
          '新浪 hq.sinajs.cn 的 hsgt 相关 list 返回空串；东财无板块级北向报表。故判定「日频净买入无真实源」。',
      },
      holdingsDisclosure: holdingsRes
        ? {
            available: true,
            lastDisclosedDate: holdingsRes.rows[0].holdDate,
            caliber: '季度（交易所每季第五个交易日披露上季末单只证券的北向投资者合计持有数量）',
            report: `${HOLD_STOCK_STA_REPORT}（MUTUAL_TYPE 001=沪股通 / 003=深股通）`,
            totalCount: holdingsRes.totalCount,
            returnedCount: holdingsRes.rows.length,
            note:
              '北向持仓为季度披露口径，非日频；取上游最新一期快照按 HOLD_MARKET_CAP 倒序的 Top N。' +
              '日变动字段（HOLD_MARKETCAP_CHG1/5/10）与净买额同源停披露，故 dayChange 恒为 null，' +
              '绝不用涨跌幅倒算「上一期持股」再相减。合计持股市值需全量分页（上游单页上限 500 行），本次未取。',
          }
        : {
            available: false,
            lastDisclosedDate: null,
            caliber: '季度',
            report: HOLD_STOCK_STA_REPORT,
            totalCount: null,
            returnedCount: 0,
            note: '本次上游未返回北向个股持股数据，holdings 置空（不以任何估算值顶替）。',
          },
      sectorsDisclosure: {
        available: false,
        note:
          '北向板块级净流入无任何真实源：官方口径只公布日频成交额与季频个股持股数量，不公布板块级资金流；' +
          '东方财富 / 腾讯 / 新浪亦无对应报表（实测 RPT_MUTUAL_BOARD_NORTHSTA 等均「报表配置不存在」）。' +
          '按行业聚合个股持仓理论上可行，但需个股→行业映射，本仓库现有 deriveIndustryFromName 有误判先例，' +
          '在映射可靠性未验证前不以聚合值冒充官方口径，故 sectors 恒为空数组。',
      },
      notes: {
        source: `东方财富数据中心 ${DEAL_HISTORY_REPORT} + ${HOLD_STOCK_STA_REPORT}`,
        report: `${DEAL_HISTORY_REPORT}?filter=(MUTUAL_TYPE in ("001","003"))&sortColumns=TRADE_DATE&sortTypes=-1`,
        holdingsReport: `${HOLD_STOCK_STA_REPORT}?filter=(MUTUAL_TYPE in ("001","003"))&sortColumns=TRADE_DATE,HOLD_MARKET_CAP&sortTypes=-1,-1&pageSize=${holdingsTopN}`,
        rows: `本次返回 ${rows.length} 行，覆盖 ${rows[0].date} ~ ${latest.date}`,
        netInflow: '净买额/净流入一律 null —— 交易所已停止披露，绝不倒算、绝不以其它口径冒充',
        holdings: holdingsRes
          ? `真实季度快照 ${holdingsRes.rows.length} 行（披露日 ${holdingsRes.rows[0].holdDate}，上游共 ${holdingsRes.totalCount ?? '未知'} 只）`
          : '本次上游未返回，置空',
        sectors: '恒为空 + sectorsDisclosure 说明（无真实源）',
        flows: '刻意置空，避免前端把 netInflow 语义字段按 0 渲染（0 值顶替空态红线）',
        deprecated: 'RPT_MUTUAL_STOCK_NORTHSTA 已下线（code 9701「服务器繁忙」）；RPT_MUTUAL_HOLD_DET 停更至 2024-09-30，均不再使用',
      },
      timestamp: new Date().toISOString(),
    });
  }),
);

export default router;