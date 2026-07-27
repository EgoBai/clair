/**
 * 港股通 + A-H 溢价 — 确定性演示数据兜底
 *
 * 背景：项目后端 API 多缺失（技术债 T6），统一用「确定性 LCG 演示数据兜底」。
 * 固定基种子（20260726）+ LCG 线性同余，保证每次渲染数值稳定、可复现。
 *
 * 资金流 / 北向重仓股 数据结构严格匹配 stockConnectEngine.ts 的 interface，
 * 可直接喂给 analyzeFlowDirection / analyzeNorthboundHoldings / analyzeFlowStyle。
 * A-H 溢价按任务口径自算：(A价 - H价*汇率) / (H价*汇率) * 100，汇率≈0.92。
 */

import type {
  StockConnectFlow,
  NorthboundHoldings,
} from './stockConnectEngine';

const BASE_SEED = 20260726;
const HKD_TO_RMB = 0.92; // 1 HKD ≈ 0.92 RMB

/** 线性同余发生器（LCG）：给定种子返回 [0,1) 的确定性序列 */
function createLCG(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0xffffffff;
  };
}

/** 将 [0,1) 映射到 [min,max] */
function mapRange(r: number, min: number, max: number): number {
  return min + r * (max - min);
}
const round2 = (x: number): number => Number(x.toFixed(2));

/** 本地日期格式化为 YYYY-MM-DD（避免时区偏移） */
function fmtDate(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** 生成最近的 count 个交易日（跳过周末），由远及近 */
function buildTradingDates(count: number): string[] {
  const dates: string[] = [];
  const d = new Date();
  while (dates.length < count) {
    const day = d.getDay();
    if (day !== 0 && day !== 6) dates.push(fmtDate(d));
    d.setDate(d.getDate() - 1);
  }
  return dates.reverse();
}

const TOP_CODES = [
  '600519', '601318', '600036', '000858', '002594',
  '600276', '000333', '601888', '600900', '603259',
];
const SELL_CODES = [
  '300750', '000001', '601012', '002415', '600030',
  '601166', '600000', '000651', '601398', '600028',
];

/** ① 近 60 个交易日沪深港通资金流（南北向拆分，单位亿元） */
export const hkConnectFlows: StockConnectFlow[] = (() => {
  const rng = createLCG(BASE_SEED);
  return buildTradingDates(60).map((date) => {
    const nbNet = round2(mapRange(rng(), -72, 86));
    const nbBuy = round2(mapRange(rng(), 280, 720));
    const nbSell = round2(nbBuy - nbNet);
    const sbNet = round2(mapRange(rng(), -58, 74));
    const sbBuy = round2(mapRange(rng(), 220, 640));
    const sbSell = round2(sbBuy - sbNet);
    const pick = (arr: string[], n: number) =>
      arr.slice(0, n).map((code) => ({ code, amount: round2(mapRange(rng(), 2, 28)) }));
    return {
      date,
      northbound: {
        netBuy: nbNet,
        buyAmount: nbBuy,
        sellAmount: nbSell,
        topBuy: pick(TOP_CODES, 5),
        topSell: pick(SELL_CODES, 5),
      },
      southbound: {
        netBuy: sbNet,
        buyAmount: sbBuy,
        sellAmount: sbSell,
        topBuy: pick(TOP_CODES, 5),
      },
    };
  });
})();

/** ② 北向重仓股 Top 15（code/name/shares/marketValue(yuan)/ratioToFloat/changeFromYesterday/consecutiveDays） */
const HOLDING_POOL: Array<{ code: string; name: string }> = [
  { code: '600519', name: '贵州茅台' },
  { code: '601318', name: '中国平安' },
  { code: '600036', name: '招商银行' },
  { code: '000858', name: '五粮液' },
  { code: '002594', name: '比亚迪' },
  { code: '600276', name: '恒瑞医药' },
  { code: '000333', name: '美的集团' },
  { code: '601888', name: '中国中免' },
  { code: '600900', name: '长江电力' },
  { code: '603259', name: '药明康德' },
  { code: '601398', name: '工商银行' },
  { code: '600276', name: '迈瑞医疗' },
  { code: '000001', name: '平安银行' },
  { code: '601166', name: '兴业银行' },
  { code: '600030', name: '中信证券' },
];

export const northboundHoldings: NorthboundHoldings[] = (() => {
  const rng = createLCG(BASE_SEED + 7);
  return HOLDING_POOL.map((s) => {
    const marketValue = round2(mapRange(rng(), 6e9, 9e10)); // 亿元~千亿，均 > 1e9 属大盘
    const ratioToFloat = round2(mapRange(rng(), 0.01, 0.12));
    const changeFromYesterday = round2(mapRange(rng(), -5e8, 6e8));
    const consecutiveDays = Math.round(mapRange(rng(), -8, 12));
    const shares = Math.round(marketValue / mapRange(rng(), 10, 80));
    return {
      code: s.code,
      name: s.name,
      shares,
      marketValue,
      ratioToFloat,
      changeFromYesterday,
      consecutiveDays,
    };
  }).sort((a, b) => b.marketValue - a.marketValue);
})();

/** ③ A-H 溢价对比：约 15 只 A+H 两地上市股票 */
export interface AHPremiumRow {
  codeA: string;
  codeH: string;
  name: string;
  priceA: number; // A股价格(RMB)
  priceH: number; // H股价格(HKD)
  exchangeRate: number; // HKD→RMB
  industry: string;
  premium: number; // AH溢价率 % = (A价 - H价*汇率)/(H价*汇率)*100
}

const AH_POOL: Array<{ codeA: string; codeH: string; name: string; industry: string }> = [
  { codeA: '601398', codeH: '01398', name: '工商银行', industry: '银行' },
  { codeA: '601318', codeH: '02318', name: '中国平安', industry: '非银金融' },
  { codeA: '002594', codeH: '01211', name: '比亚迪', industry: '汽车' },
  { codeA: '600036', codeH: '03968', name: '招商银行', industry: '银行' },
  { codeA: '601939', codeH: '00939', name: '建设银行', industry: '银行' },
  { codeA: '601288', codeH: '01288', name: '农业银行', industry: '银行' },
  { codeA: '601988', codeH: '03988', name: '中国银行', industry: '银行' },
  { codeA: '601628', codeH: '02628', name: '中国人寿', industry: '非银金融' },
  { codeA: '601998', codeH: '00998', name: '中信银行', industry: '银行' },
  { codeA: '601328', codeH: '03328', name: '交通银行', industry: '银行' },
  { codeA: '601088', codeH: '01088', name: '中国神华', industry: '煤炭' },
  { codeA: '600028', codeH: '00386', name: '中国石化', industry: '石油石化' },
  { codeA: '600585', codeH: '00914', name: '海螺水泥', industry: '建筑材料' },
  { codeA: '000338', codeH: '02338', name: '潍柴动力', industry: '汽车' },
  { codeA: '603259', codeH: '02359', name: '药明康德', industry: '医药生物' },
];

export const ahPremiums: AHPremiumRow[] = (() => {
  const rng = createLCG(BASE_SEED + 13);
  return AH_POOL.map((s) => {
    const priceH = round2(mapRange(rng(), 3, 55)); // HKD
    const targetPremium = round2(mapRange(rng(), -18, 52)); // 有正有负
    const priceHInRMB = round2(priceH * HKD_TO_RMB);
    const priceA = round2(priceHInRMB * (1 + targetPremium / 100));
    const premium = round2(((priceA - priceHInRMB) / priceHInRMB) * 100);
    return {
      codeA: s.codeA,
      codeH: s.codeH,
      name: s.name,
      priceA,
      priceH,
      exchangeRate: HKD_TO_RMB,
      industry: s.industry,
      premium,
    };
  }).sort((a, b) => b.premium - a.premium);
})();
