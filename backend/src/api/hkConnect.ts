/**
 * 港股通 + A-H 溢价数据 API（真实源版）
 * - A-H 溢价：腾讯行情 qt.gtimg.cn 同时取 A 股与 H 股实时价（免 key），
 *   按**实时**港币兑人民币汇率（腾讯外汇 whHKDCNY）计算溢价率。
 *   A/H 价格与汇率均为真实行情，溢价率由真实值派生。
 * - 今日沪深港通：东方财富 push2 kamt 实时额度/净买数据（免 key）。
 * - A+H 标的目录（代码/名称/行业）为公开事实参考目录，非模拟数据。
 * - 遵守「诚实数据」红线：行情/汇率源不可达 → exchangeRate 一律 null + unavailableReason，
 *   绝不回填演示/伪造数据，也绝不用常数冒充汇率。
 *
 * ★ 为什么换掉 push2（2026-11-03 实测）：`push2.eastmoney.com` 在本机与生产均不可达
 *   （curl exit 52 / fetch failed），原 AH 腿走 push2 ulist 因而长期 100% 失败。
 *   `qt.gtimg.cn` 稳定 200 且一次请求即可同时带 A 股与 H 股代码。
 *
 * ★★ 已修正的诚实红线违规：原实现硬编码 `HKD_TO_CNY = 0.92` 并**在失败态也返回 0.92**。
 *   2026-11-03 三源交叉实测真实汇率为 0.8499（腾讯 whHKDCNY 0.8499 /
 *   新浪 hq.sinajs.cn 0.8499 / open.er-api.com 0.849562），
 *   0.92 会让每只标的溢价率系统性偏低约 8 个百分点 —— 属于「用常量冒充真实汇率」。
 *   现改为：汇率取不到 → exchangeRate:null + unavailableReason，不再有任何常数兜底。
 */

import { Router, Request, Response } from 'express';
import { asyncHandler, sendSuccess } from '../utils/apiResponse';
import {
  fetchTencentQuotes,
  fetchHkdCnyRate,
  toTencentCode,
  toTencentHkCode,
} from '../services/tencentQuoteService';

const router = Router();

const FETCH_TIMEOUT_MS = 8000;

/** A+H 两地上市标的基础目录（代码/名称/行业为公开事实，非模拟时间序列） */
interface AhPair {
  codeA: string; // 6 位 A 股代码
  codeH: string; // 5 位 H 股代码（含前导 0）
  name: string;
  industry: string;
  marketA: '1' | '0'; // 1=上交所 0=深交所
}

const AH_CATALOG: AhPair[] = [
  { codeA: '601398', codeH: '01398', name: '工商银行', industry: '银行', marketA: '1' },
  { codeA: '601318', codeH: '02318', name: '中国平安', industry: '非银金融', marketA: '1' },
  { codeA: '002594', codeH: '01211', name: '比亚迪', industry: '汽车', marketA: '0' },
  { codeA: '600036', codeH: '03968', name: '招商银行', industry: '银行', marketA: '1' },
  { codeA: '601939', codeH: '00939', name: '建设银行', industry: '银行', marketA: '1' },
  { codeA: '601288', codeH: '01288', name: '农业银行', industry: '银行', marketA: '1' },
  { codeA: '601988', codeH: '03988', name: '中国银行', industry: '银行', marketA: '1' },
  { codeA: '601628', codeH: '02628', name: '中国人寿', industry: '非银金融', marketA: '1' },
  { codeA: '601998', codeH: '00998', name: '中信银行', industry: '银行', marketA: '1' },
  { codeA: '601328', codeH: '03328', name: '交通银行', industry: '银行', marketA: '1' },
  { codeA: '601088', codeH: '01088', name: '中国神华', industry: '煤炭', marketA: '1' },
  { codeA: '600028', codeH: '00386', name: '中国石化', industry: '石油石化', marketA: '1' },
  { codeA: '600585', codeH: '00914', name: '海螺水泥', industry: '建筑材料', marketA: '1' },
  { codeA: '000338', codeH: '02338', name: '潍柴动力', industry: '汽车', marketA: '0' },
  { codeA: '603259', codeH: '02359', name: '药明康德', industry: '医药生物', marketA: '1' },
];

export interface AhPremiumRow {
  codeA: string;
  codeH: string;
  name: string;
  priceA: number; // A 股实时价(RMB)
  priceH: number; // H 股实时价(HKD)
  exchangeRate: number; // HKD→CNY（真实行情值，非常数）
  industry: string;
  premium: number; // AH 溢价率 % = (A价 - H价*汇率)/(H价*汇率)*100
}

/** 带超时的 JSON 抓取（复用 etf.ts 风格） */
async function fetchJson(url: string): Promise<any> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    const resp = await fetch(url, {
      signal: ctrl.signal,
      headers: { 'User-Agent': 'Mozilla/5.0' },
    });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    return await resp.json();
  } finally {
    clearTimeout(timer);
  }
}

/** AH 溢价构建结果：行情与汇率都取到才算成功；任一缺失则 rows 为空并给出原因 */
interface AhPremiumBuild {
  rows: AhPremiumRow[];
  exchangeRate: number | null;
  exchangeRateAsOf: string | null;
  exchangeRateSource: string | null;
  /** 非空表示该腿不可用（rows 必为空） */
  unavailableReason: string | null;
}

/**
 * 构建 A-H 溢价排行（腾讯报价 + 腾讯实时汇率）。
 *
 * 诚实约束：
 *  - 汇率取不到 → 直接整腿置空（不返回任何溢价率），因为溢价率对汇率高度敏感，
 *    用任何"参考值"顶替都会产出与真实值系统性偏离的数字；
 *  - 单只标的任一腿缺价 → 跳过该行，不用 0 或昨收顶替。
 */
async function buildAhPremium(): Promise<AhPremiumBuild> {
  const aSymbols = AH_CATALOG.map((c) => toTencentCode(`${c.codeA}.${c.marketA === '1' ? 'SH' : 'SZ'}`));
  const hkSymbols = AH_CATALOG.map((c) => toTencentHkCode(c.codeH));
  const codes = [...aSymbols, ...hkSymbols].filter((c): c is string => Boolean(c));

  const [rate, quotes] = await Promise.all([
    fetchHkdCnyRate(),
    fetchTencentQuotes(codes),
  ]);

  if (!rate) {
    return {
      rows: [],
      exchangeRate: null,
      exchangeRateAsOf: null,
      exchangeRateSource: null,
      unavailableReason:
        '港币兑人民币实时汇率源（腾讯 qt.gtimg.cn whHKDCNY）不可用；' +
        '溢价率对汇率高度敏感，故不提供任何溢价数值，也不用常数顶替',
    };
  }
  if (quotes.size === 0) {
    return {
      rows: [],
      exchangeRate: rate.rate,
      exchangeRateAsOf: rate.asOf,
      exchangeRateSource: rate.source,
      unavailableReason: '腾讯 A/H 实时报价源不可用，未取到任何标的报价',
    };
  }

  const rows: AhPremiumRow[] = [];
  for (const c of AH_CATALOG) {
    const aCode = toTencentCode(`${c.codeA}.${c.marketA === '1' ? 'SH' : 'SZ'}`);
    const hCode = toTencentHkCode(c.codeH);
    if (!aCode || !hCode) continue;
    const pa = quotes.get(aCode)?.price ?? null;
    const ph = quotes.get(hCode)?.price ?? null;
    // 任一侧价格缺失或非正 → 跳过该行，不编造、不用 0 / 昨收顶替
    if (pa === null || ph === null || pa <= 0 || ph <= 0) continue;
    const phCny = ph * rate.rate;
    if (!(phCny > 0)) continue;
    const premium = +(((pa - phCny) / phCny) * 100).toFixed(2);
    rows.push({
      codeA: c.codeA,
      codeH: c.codeH,
      name: c.name,
      priceA: +pa.toFixed(2),
      priceH: +ph.toFixed(2),
      exchangeRate: rate.rate,
      industry: c.industry,
      premium,
    });
  }

  if (rows.length === 0) {
    return {
      rows: [],
      exchangeRate: rate.rate,
      exchangeRateAsOf: rate.asOf,
      exchangeRateSource: rate.source,
      unavailableReason: '腾讯报价源已连通但目标标的均无有效 A/H 双报价，未生成任何溢价行',
    };
  }

  return {
    rows: rows.sort((a, b) => b.premium - a.premium),
    exchangeRate: rate.rate,
    exchangeRateAsOf: rate.asOf,
    exchangeRateSource: rate.source,
    unavailableReason: null,
  };
}

/**
 * A-H 溢价排行（真实源）
 * GET /api/hk-connect/ah-premium
 *
 * 失败态契约：exchangeRate **必须是 null**，并给出 unavailableReason。
 * 绝不再出现「count:0 + exchangeRate:0.92」这种「空数据配假汇率」的形态。
 */
router.get(
  '/ah-premium',
  asyncHandler(async (_req: Request, res: Response) => {
    let built: AhPremiumBuild;
    try {
      built = await buildAhPremium();
    } catch (e) {
      built = {
        rows: [],
        exchangeRate: null,
        exchangeRateAsOf: null,
        exchangeRateSource: null,
        unavailableReason: `A-H 溢价真实源不可用：${e instanceof Error ? e.message : 'unknown'}`,
      };
    }

    const ok = built.rows.length > 0 && built.exchangeRate !== null;
    sendSuccess(res, {
      data: built.rows,
      count: built.rows.length,
      dataSource: ok ? 'real' : 'unavailable',
      // 汇率：只有整条腿真的可用（有真实溢价行）时才给数值，其余一律 null。
      // 「拿不到」与「拿到了但没标的」都不该让调用方读到 0.92 或任何常数。
      exchangeRate: ok ? built.exchangeRate : null,
      exchangeRateAsOf: ok ? built.exchangeRateAsOf : null,
      exchangeRateSource: ok ? built.exchangeRateSource : null,
      ...(built.unavailableReason ? { unavailableReason: built.unavailableReason } : {}),
      updatedAt: new Date().toISOString(),
    });
  }),
);

/**
 * 今日沪深港通（真实源 + 诚实缺口标注）
 * GET /api/hk-connect/summary
 *
 * ★ 字段 ↔ 口径对应（2026-10-07 本机双源交叉验证，命名反直觉，勿按字面理解）：
 *     upstream `hk2sh` / `hk2sz` = **北向**（沪股通 / 深股通）
 *     upstream `sh2hk` / `sz2hk` = **南向**（港股通沪 / 港股通深）
 *   证据 ①（额度常量）：hk2sh/hk2sz 的 dayAmtThreshold=5200000 万元 = 520 亿，
 *           正是沪/深股通每日额度；sh2hk/sz2hk 为 4200000 万元 = 420 亿，正是港股通每日额度。
 *   证据 ②（成交额配对，权威源 RPT_MUTUAL_DEAL_HISTORY 2026-09-30，单位百万元）：
 *           hk2sh.buySellAmt/100 = 101257.87 ≈ 001(沪股通) DEAL_AMT=101257.88
 *           hk2sz.buySellAmt/100 = 106683.74 ≈ 003(深股通) DEAL_AMT=106683.74
 *           sh2hk.buySellAmt/100 =  46015.40 ≈ 002(港股通沪) DEAL_AMT=46015.39
 *           sz2hk.buySellAmt/100 =  23911.48 ≈ 004(港股通深) DEAL_AMT=23911.48
 *
 * ★★ 已修正的历史红线违规（原实现把不可得/错值当真实值返回）：
 *   1. **口径字段错用**：原实现取 `dayNetAmtIn` 当「当日净买」。该字段并非净买额 ——
 *      南向两腿的 dayNetAmtIn 恒等于其 dayAmtThreshold（420 亿），是**额度占位值**，
 *      导致原实现把南向净买报成 420+420=**840 亿**，而真实值约 **68.6 亿**（虚高约 12 倍）。
 *      真正的当日净买额是 `netBuyAmt`（已用权威源逐位核对：
 *      sh2hk 509433.04 万元 == 002 的 NET_DEAL_AMT 5094.33 百万元；
 *      且恒等式 netBuyAmt == buyAmt - sellAmt 成立）。
 *   2. **0 顶替缺失**：北向两腿的买入额/卖出额/净买额/额度余额恒为 0（成交额却非 0），
 *      这是「买入卖出拆分口径已停止披露」的指纹，绝不能用 0 冒充（0 是合法真实值）。
 *      故北向所有资金流字段一律 null。
 *   3. **额度余额 `dayAmtRemain` 四腿恒为 0**，权威源 QUOTA_BALANCE 亦为 null
 *      → 额度余额对南北向**均**不可得，一律 null。
 *
 * ★ 关于 `status: 4`：**不是**「已停止披露」标记，不可用于可得性判断。
 *   实测四腿 status 全为 4，而南向两腿在 status=4 下 buyAmt/sellAmt/netBuyAmt 均为真实值。
 *   故本实现**不**依赖 status，改为按字段级证据判定（有成交额却无买入卖出拆分 ⇒ 拆分口径停披露）。
 *   status 仅作原样留档。
 *
 * 真实可得 / 不可得清单：
 *   - 成交额 dealAmount（buySellAmt）：南北向**均真实可得**（权威源 DEAL_AMT 可配对）
 *   - 买入额 buyIn / 卖出额 sellOut / 净买额 dayNetIn（netBuyAmt）：**仅南向可得**，北向 null
 *   - 额度余额 remain：南北向**均不可得** → null
 *   - 每日额度 threshold：南北向均为真实常量（520 亿 / 420 亿）
 *   - monthNetAmtIn / yearNetAmtIn：**额度派生占位值，非真实累计净买**，故不对外暴露
 */
interface ConnectLeg {
  /** 当日净买额（亿元）—— 北向已停止披露，恒为 null */
  dayNetIn: number | null;
  /** 当日买入额（亿元）—— 北向已停止披露，恒为 null */
  buyIn: number | null;
  /** 当日卖出额（亿元）—— 北向已停止披露，恒为 null */
  sellOut: number | null;
  /** 当日成交额（亿元）—— 南北向均真实可得 */
  dealAmount: number | null;
  /** 当日额度余额（亿元）—— 南北向均不可得，恒为 null */
  remain: number | null;
  /** 每日额度（亿元）—— 真实常量（沪/深股通 520 亿，港股通 420 亿） */
  threshold: number | null;
  /** 该腿资金流（买入/卖出/净买）口径是否仍在披露 */
  netFlowDisclosed: boolean;
  /** 上游 status 原样留档（非披露标记，见上方说明） */
  upstreamStatus: number | null;
  date: string;
}

interface ConnectSummary {
  date: string;
  northbound: ConnectLeg; // 北向（沪股通 + 深股通）= upstream hk2sh + hk2sz
  southbound: ConnectLeg; // 南向（港股通沪 + 港股通深）= upstream sh2hk + sz2hk
}

/** 数值安全转换：**缺失/非有限一律返回 null，绝不返回 0**。0 是合法真实值，用 0 顶替缺失即造假。 */
function numOrNull(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/** 万元 → 亿元（东方财富 kamt 单位为万元） */
function wanToYi(v: unknown): number | null {
  const n = numOrNull(v);
  return n === null ? null : +(n / 10000).toFixed(2);
}

/** 仅在两值均可得时求和，任一不可得则返回 null（绝不用 0 顶替） */
function addOrNull(a: number | null, b: number | null): number | null {
  return a === null || b === null ? null : +(a + b).toFixed(2);
}

/** 上游 kamt 单位为万元；两个独立腿相加 */
function sumWanToYi(a: unknown, b: unknown): number | null {
  const x = numOrNull(a);
  const y = numOrNull(b);
  if (x === null || y === null) return null;
  return +((x + y) / 10000).toFixed(2);
}

/** 合并同向的两条腿（北向: hk2sh+hk2sz；南向: sh2hk+sz2hk） */
function mergeLegs(legs: any[]): ConnectLeg {
  const [a, b] = legs;
  const dealAmount = sumWanToYi(a?.buySellAmt, b?.buySellAmt);
  const buyIn = sumWanToYi(a?.buyAmt, b?.buyAmt);
  const sellOut = sumWanToYi(a?.sellAmt, b?.sellAmt);
  const threshold = sumWanToYi(a?.dayAmtThreshold, b?.dayAmtThreshold);
  const netBuyRaw = sumWanToYi(a?.netBuyAmt, b?.netBuyAmt);

  // 披露判定（字段级证据，不依赖 status）：存在真实成交额、但买入/卖出拆分全为 0
  // ⇒ 该口径已被停止披露，0 是「拿不到」而非「真的是 0」。
  const hasTurnover = dealAmount !== null && dealAmount > 0;
  const hasSplit = buyIn !== null && buyIn > 0 && sellOut !== null && sellOut > 0;
  const netFlowDisclosed = hasTurnover && hasSplit;

  // 净买额自校验：上游满足 netBuyAmt == buyAmt - sellAmt。若偏差过大则不予采信（返回 null），
  // 避免上游脏值被当作真实净买额 —— 这正是原实现踩过的坑。
  let dayNetIn: number | null = null;
  if (netFlowDisclosed && netBuyRaw !== null && buyIn !== null && sellOut !== null) {
    const implied = +(buyIn - sellOut).toFixed(2);
    if (Math.abs(netBuyRaw - implied) <= Math.max(0.05, Math.abs(implied) * 0.01)) {
      dayNetIn = netBuyRaw;
    }
  }

  return {
    dayNetIn,
    buyIn: netFlowDisclosed ? buyIn : null,
    sellOut: netFlowDisclosed ? sellOut : null,
    dealAmount,
    // 额度余额：四腿 dayAmtRemain 恒为 0，权威源 QUOTA_BALANCE 亦为 null → 不可得
    remain: null,
    threshold,
    netFlowDisclosed,
    upstreamStatus: numOrNull(a?.status ?? b?.status),
    date: String(a?.date2 ?? b?.date2 ?? ''),
  };
}

router.get(
  '/summary',
  asyncHandler(async (_req: Request, res: Response) => {
    try {
      // f59..f63 为必需：f61 buyAmt / f62 sellAmt / f63 netBuyAmt（真实净买额）
      const url =
        'https://push2.eastmoney.com/api/qt/kamt/get?fields1=f1,f2,f3,f4&fields2=f51,f52,f53,f54,f55,f56,f57,f58,f59,f60,f61,f62,f63&klt=101&lmt=1';
      const json = await fetchJson(url);
      const d = json?.data;
      if (!d || (!d.hk2sh && !d.sh2hk)) {
        return sendSuccess(res, {
          data: null,
          dataSource: 'unavailable',
          message: '沪深港通额度源不可达：上游未返回任何数据，后端未接入任何兜底/编造数据',
          updatedAt: new Date().toISOString(),
        });
      }
      const summary: ConnectSummary = {
        date: String(d.hk2sh?.date2 ?? d.sh2hk?.date2 ?? ''),
        northbound: mergeLegs([d.hk2sh, d.hk2sz]),
        southbound: mergeLegs([d.sh2hk, d.sz2hk]),
      };
      sendSuccess(res, {
        data: summary,
        dataSource: 'real',
        message:
          '沪深港通「买入额 / 卖出额 / 净买额 / 额度余额」中：' +
          '北向（沪股通+深股通）的买入卖出拆分口径已被停止披露，故其净买额/买入额/卖出额一律为 null，' +
          '绝不用 0 冒充、绝不以成交额倒算；南向（港股通沪+港股通深）该口径仍在披露，为真实值。' +
          '额度余额对南北向均不可得，一律为 null。成交额与每日额度为真实可得值。',
        netFlowDisclosure: {
          northboundDisclosed: summary.northbound.netFlowDisclosed,
          southboundDisclosed: summary.southbound.netFlowDisclosed,
          note:
            '北向买入/卖出拆分口径自交易所停止披露后恒为 0（而成交额非 0），据此判定为「不可得」而非「真实为 0」。' +
            '上游 status=4 并非披露标记（四腿皆为 4，但南向仍有真实值），故本实现不依赖 status 判定。' +
            '另：上游 dayNetAmtIn 并非净买额（南向两腿恒等于其额度阈值 420 亿），真实净买额取自 netBuyAmt。',
        },
        quotaDisclosure: {
          remainAvailable: false,
          note:
            '额度余额（dayAmtRemain）四腿恒为 0，权威源 RPT_MUTUAL_DEAL_HISTORY 的 QUOTA_BALANCE 亦为 null，' +
            '判定为不可得，故 remain 一律为 null。',
        },
        legMapping: {
          northbound: 'upstream hk2sh(沪股通) + hk2sz(深股通)，每日额度各 520 亿',
          southbound: 'upstream sh2hk(港股通沪) + sz2hk(港股通深)，每日额度各 420 亿',
          note: 'upstream 键名与直觉相反，已用额度常量与权威源成交额双源交叉验证，勿按字面互换。',
        },
        updatedAt: new Date().toISOString(),
      });
    } catch (e) {
      sendSuccess(res, {
        data: null,
        dataSource: 'unavailable',
        message: '沪深港通额度源不可达：后端未接入任何兜底/编造数据',
        error: e instanceof Error ? e.message : 'unknown',
      });
    }
  }),
);

export default router;
