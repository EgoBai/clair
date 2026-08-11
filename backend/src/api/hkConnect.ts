/**
 * 港股通 + A-H 溢价数据 API（真实源版）
 * - A-H 溢价：东方财富 push2 实时行情（免 key），分别取 A 股与 H 股实时价，
 *   按 published 参考汇率 HKD→CNY 计算溢价率。A/H 价格为真实行情，溢价率由真实价派生。
 * - 今日沪深港通：东方财富 push2 kamt 实时额度/净买数据（免 key）。
 * - A+H 标的目录（代码/名称/行业）为公开事实参考目录，非模拟数据。
 * - 遵守「诚实数据」红线：行情/额度源不可达 → 返回 dataSource:'unavailable'，绝不回填演示/伪造。
 *
 * 价格缩放经验值（已对 6 只样本交叉校验涨跌幅一致）：
 *   A 股 f2 / 100（沪深价格量级），H 股 f2 / 1000（港股价格量级）。
 * 汇率采用 published 参考值 0.92（港币兑人民币），作为透明标注的参考常数。
 */

import { Router, Request, Response } from 'express';
import { asyncHandler, sendSuccess } from '../utils/apiResponse';

const router = Router();

/** HKD → CNY 参考汇率（公开事实参考常数，透明标注） */
const HKD_TO_CNY = 0.92;

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
  exchangeRate: number; // HKD→CNY
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

/** 批量抓取实时报价（东方财富 push2 ulist）。返回 code(f12) → diff 映射 */
async function fetchQuotes(secids: string): Promise<Record<string, any>> {
  const url = `https://push2.eastmoney.com/api/qt/ulist.np/get?fields=f12,f14,f2,f3,f4&secids=${secids}&pz=${Math.max(secids.split(',').length, 1)}`;
  const json = await fetchJson(url);
  const diff: any[] = json?.data?.diff ?? [];
  const map: Record<string, any> = {};
  for (const d of diff) map[String(d.f12)] = d;
  return map;
}

/** 取 A 股实时价（f2 / 100） */
function aSharePrice(d: any): number {
  return d ? (Number(d.f2) || 0) / 100 : 0;
}

/** 取 H 股实时价（f2 / 1000） */
function hSharePrice(d: any): number {
  return d ? (Number(d.f2) || 0) / 1000 : 0;
}

async function buildAhPremium(): Promise<AhPremiumRow[]> {
  const aSecids = AH_CATALOG.map((c) => `${c.marketA}.${c.codeA}`).join(',');
  const hSecids = AH_CATALOG.map((c) => `128.${c.codeH}`).join(',');
  const [aMap, hMap] = await Promise.all([
    fetchQuotes(aSecids),
    fetchQuotes(hSecids),
  ]);
  const rows: AhPremiumRow[] = [];
  for (const c of AH_CATALOG) {
    const pa = aSharePrice(aMap[c.codeA]);
    const ph = hSharePrice(hMap[c.codeH]);
    if (pa <= 0 || ph <= 0) continue; // 任一侧价格缺失则跳过该行（不编造）
    const phCny = ph * HKD_TO_CNY;
    const premium = +(((pa - phCny) / phCny) * 100).toFixed(2);
    rows.push({
      codeA: c.codeA,
      codeH: c.codeH,
      name: c.name,
      priceA: +pa.toFixed(2),
      priceH: +ph.toFixed(2),
      exchangeRate: HKD_TO_CNY,
      industry: c.industry,
      premium,
    });
  }
  return rows.sort((a, b) => b.premium - a.premium);
}

/**
 * A-H 溢价排行（真实源）
 * GET /api/hk-connect/ah-premium
 */
router.get(
  '/ah-premium',
  asyncHandler(async (_req: Request, res: Response) => {
    try {
      const rows = await buildAhPremium();
      if (rows.length === 0) {
        // 真实源完全不可达 → 诚实空态，不回填演示
        return sendSuccess(res, {
          data: [],
          count: 0,
          dataSource: 'unavailable',
          exchangeRate: HKD_TO_CNY,
          updatedAt: new Date().toISOString(),
        });
      }
      sendSuccess(res, {
        data: rows,
        count: rows.length,
        dataSource: 'real',
        exchangeRate: HKD_TO_CNY,
        updatedAt: new Date().toISOString(),
      });
    } catch (e) {
      sendSuccess(res, {
        data: [],
        count: 0,
        dataSource: 'unavailable',
        exchangeRate: HKD_TO_CNY,
        error: e instanceof Error ? e.message : 'unknown',
      });
    }
  }),
);

/**
 * 今日沪深港通实时额度/净买（真实源）
 * GET /api/hk-connect/summary
 */
interface ConnectLeg {
  dayNetIn: number; // 当日净买(亿元)
  remain: number; // 当日额度余额(亿元)
  threshold: number; // 当日总额度(亿元)
  date: string;
}
interface ConnectSummary {
  date: string;
  northbound: ConnectLeg; // 北向（沪股通+深股通）
  southbound: ConnectLeg; // 南向（港股通沪+港股通深）
}

function legFromKamt(node: any): ConnectLeg {
  const wanToYi = (v: number) => +(Number(v) / 10000).toFixed(2); // 东方财富单位：万元 → 亿元
  return {
    dayNetIn: wanToYi(node?.dayNetAmtIn ?? 0),
    remain: wanToYi(node?.dayAmtRemain ?? 0),
    threshold: wanToYi(node?.dayAmtThreshold ?? 0),
    date: node?.date2 ?? '',
  };
}

router.get(
  '/summary',
  asyncHandler(async (_req: Request, res: Response) => {
    try {
      const url =
        'https://push2.eastmoney.com/api/qt/kamt/get?fields1=f1,f2,f3,f4&fields2=f51,f52,f53,f54,f55,f56,f57,f58&klt=101&lmt=1';
      const json = await fetchJson(url);
      const d = json?.data;
      if (!d || (!d.hk2sh && !d.sh2hk)) {
        return sendSuccess(res, {
          data: null,
          dataSource: 'unavailable',
          updatedAt: new Date().toISOString(),
        });
      }
      const summary: ConnectSummary = {
        date: d.hk2sh?.date2 || d.sh2hk?.date2 || '',
        northbound: {
          dayNetIn: +(legFromKamt(d.hk2sh).dayNetIn + legFromKamt(d.hk2sz).dayNetIn).toFixed(2),
          remain: +(legFromKamt(d.hk2sh).remain + legFromKamt(d.hk2sz).remain).toFixed(2),
          threshold: +(legFromKamt(d.hk2sh).threshold + legFromKamt(d.hk2sz).threshold).toFixed(2),
          date: d.hk2sh?.date2 || '',
        },
        southbound: {
          dayNetIn: +(legFromKamt(d.sh2hk).dayNetIn + legFromKamt(d.sz2hk).dayNetIn).toFixed(2),
          remain: +(legFromKamt(d.sh2hk).remain + legFromKamt(d.sz2hk).remain).toFixed(2),
          threshold: +(legFromKamt(d.sh2hk).threshold + legFromKamt(d.sz2hk).threshold).toFixed(2),
          date: d.sh2hk?.date2 || '',
        },
      };
      sendSuccess(res, {
        data: summary,
        dataSource: 'real',
        updatedAt: new Date().toISOString(),
      });
    } catch (e) {
      sendSuccess(res, {
        data: null,
        dataSource: 'unavailable',
        error: e instanceof Error ? e.message : 'unknown',
      });
    }
  }),
);

export default router;
