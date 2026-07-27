/**
 * 北向资金深度追踪 — 确定性演示数据兜底
 *
 * 背景：项目后端 API 多缺失（技术债 T6），统一用「确定性 LCG 演示数据兜底」。
 * 沿用 reportDemoData.ts 的模式：固定基种子（20260725）+ LCG 线性同余，
 * 保证每次渲染数值稳定、可复现、绝不留空白页。
 *
 * 出参直接对接北向引擎 northboundFlow.ts 的 interface，便于页面直接调用引擎函数。
 */

import type { NorthboundFlow, NorthboundHolding } from './northboundFlow';

const BASE_SEED = 20260725;

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

/** 北向重仓股（在 NorthboundHolding 基础上附加较上日增减亿元） */
export interface TopHolding extends NorthboundHolding {
  /** 较上日增减（亿元） */
  dayChange: number;
}

/** 板块净流入聚合（申万一级行业） */
export interface SectorNetFlow {
  sector: string;
  netInflow: number; // 净流入亿元，正为流入、负为流出
}

/** ① 近 60 个交易日北向净流入序列（沪股通 / 深股通拆分、合计，单位亿元） */
export const northboundFlows: NorthboundFlow[] = (() => {
  const rng = createLCG(BASE_SEED);
  return buildTradingDates(60).map((date) => {
    const shConnect = round2(mapRange(rng(), -72, 86));
    const szConnect = round2(mapRange(rng(), -64, 82));
    const total = round2(shConnect + szConnect);
    const shBuy = round2(mapRange(rng(), 200, 620));
    const shSell = round2(shBuy - shConnect);
    const szBuy = round2(mapRange(rng(), 180, 560));
    const szSell = round2(szBuy - szConnect);
    return { date, shConnect, szConnect, total, shBuy, shSell, szBuy, szSell };
  });
})();

/** 重仓股样本池（代码 / 名称 / 申万一级行业） */
const HOLDING_POOL: Array<{ ticker: string; name: string; sector: string }> = [
  { ticker: '600519', name: '贵州茅台', sector: '食品饮料' },
  { ticker: '300750', name: '宁德时代', sector: '电力设备' },
  { ticker: '600036', name: '招商银行', sector: '银行' },
  { ticker: '601318', name: '中国平安', sector: '非银金融' },
  { ticker: '000858', name: '五粮液', sector: '食品饮料' },
  { ticker: '002594', name: '比亚迪', sector: '汽车' },
  { ticker: '600276', name: '恒瑞医药', sector: '医药生物' },
  { ticker: '688981', name: '中芯国际', sector: '电子' },
  { ticker: '000333', name: '美的集团', sector: '家用电器' },
  { ticker: '300059', name: '东方财富', sector: '非银金融' },
  { ticker: '002415', name: '海康威视', sector: '电子' },
  { ticker: '601012', name: '隆基绿能', sector: '电力设备' },
  { ticker: '600900', name: '长江电力', sector: '公用事业' },
  { ticker: '603259', name: '药明康德', sector: '医药生物' },
  { ticker: '000001', name: '平安银行', sector: '银行' },
];

/** ② 北向重仓股 Top 15（按持股市值降序） */
export const topHoldings: TopHolding[] = (() => {
  const rng = createLCG(BASE_SEED + 7);
  return HOLDING_POOL.map((s) => {
    const marketValue = round2(mapRange(rng(), 60, 880));
    const freeFloatRatio = round2(mapRange(rng(), 1.2, 11.5));
    const dayChange = round2(mapRange(rng(), -9, 11));
    const changePercent = round2((dayChange / marketValue) * 100 * 3);
    const shares = Math.round(marketValue * 1e6);
    return {
      ticker: s.ticker,
      name: s.name,
      sector: s.sector,
      marketValue,
      freeFloatRatio,
      dayChange,
      changePercent,
      shares,
    };
  }).sort((a, b) => b.marketValue - a.marketValue);
})();

/** ③ 板块净流入聚合（12 个申万一级行业，净流入亿元有正有负） */
export const sectorNetFlows: SectorNetFlow[] = (() => {
  const rng = createLCG(BASE_SEED + 13);
  const SECTORS = [
    '食品饮料', '电力设备', '银行', '医药生物', '电子', '非银金融',
    '汽车', '家用电器', '计算机', '机械设备', '有色金属', '公用事业',
  ];
  return SECTORS.map((sector) => ({
    sector,
    netInflow: round2(mapRange(rng(), -42, 55)),
  })).sort((a, b) => b.netInflow - a.netInflow);
})();
