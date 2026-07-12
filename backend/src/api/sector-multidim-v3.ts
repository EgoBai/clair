/**
 * 板块景气度多维度 V3 API — 专业指标 + 景气度/拥挤度双重组
 *
 * GET  /api/sectors/:code/multidim-v3         单板块查询
 * POST /api/sectors/multidim-v3/batch         批量查询 {codes:[...]}
 *
 * 14个底层维度(各0-20分):
 *   === v2 维度 (10个, 复用) ===
 *   1. 拥挤度 (PE分位法)
 *   2. 扩散程度 (%个股站上MA20)
 *   3. 资金集中度 (Top5成交占比)
 *   4. 小白指数 (小市值换手激增)
 *   5. 回补程度 (5日 vs 20日动量)
 *   6. 恐慌度 A3 (跌幅>5%占比)
 *   7. 动摇度 A4 (振幅标准差)
 *   8. 宝妈指数 B4 (低价股成交额占比变化)
 *   9. 搜索热度 C1 (概念标签数)
 *   10. 传播扩散度 C2 (涨停比例)
 *
 *   === v3 新增专业指标 (4个) ===
 *   11. 动量仓位 (momentumPosition): 近5日涨幅>5%的股票占比
 *   12. Z值 (zScore): PE偏离20日均值的标准差倍数
 *   13. 总杠杆代理 (leverage): 平均换手率/20日均换手偏离度
 *   14. 基金净持仓代理 (fundFlow): 近5日涨跌家数比值
 *
 * 重组为两组:
 *   - boomScore(景气度100): 扩散+回补+动量仓位+搜索热度+传播扩散度
 *   - crowdingScore(拥挤度100): PE分位+集中度+Z值+杠杆+恐慌度+基金代理
 */

import { Router, Request, Response } from 'express';
import { asyncHandler, sendSuccess, sendNotFound } from '../utils/apiResponse';
import { getDb } from '../db/dbFactory';

const router = Router();

// ============= 类型定义 =============

interface StockQuote {
  stock_id: number;
  symbol: string;
  name: string;
  close_price: number;
  change_percent: number;
  turnover: number;
  turnover_rate: number;
  market_cap: number;
  pe_ratio: number;
  high_price: number;
  low_price: number;
}

interface DimensionResult {
  score: number;
  label: string;
  detail: string;
}

interface MultidimV3Result {
  industry: string;
  totalScore: number;       // 14维度总分 (0-280)
  maxScore: number;
  boomScore: number;        // 景气度 (0-100)
  crowdingScore: number;    // 拥挤度 (0-100)
  dimensions: {
    // v2
    crowding: DimensionResult;
    diffusion: DimensionResult;
    concentration: DimensionResult;
    retail: DimensionResult;
    recovery: DimensionResult;
    panic: DimensionResult;
    volatility: DimensionResult;
    momIndex: DimensionResult;
    searchHeat: DimensionResult;
    spreadDegree: DimensionResult;
    // v3 new
    momentumPosition: DimensionResult;
    zScore: DimensionResult;
    leverage: DimensionResult;
    fundFlow: DimensionResult;
  };
  metadata: {
    stockCount: number;
    avgPE: number;
    medianPE: number;
    aboveMA20Pct: number;
    top5TurnoverPct: number;
    smallCapTurnoverSurge: number;
    ma5Change: number;
    ma20Change: number;
    panicRatio: number;
    amplitudeStd: number;
    lowPriceTurnoverPct: number;
    lowPriceTurnoverPctPrev: number;
    conceptTagCount: number;
    limitUpRatio: number;
    // v3 new
    momentumRatio: number;       // 近5日涨幅>5%股票占比
    peZScore: number;            // PE Z-Score
    turnoverLeverageRatio: number; // 换手率杠杆比
    fundFlowUpDownRatio: number;   // 近5日涨跌家数比
  };
}

// ============= 工具函数 =============

const toNum = (v: unknown): number =>
  v === null || v === undefined ? 0 : parseFloat(String(v));

function percentile(arr: number[], p: number): number {
  if (arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const idx = (p / 100) * (sorted.length - 1);
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
}

function stdDev(arr: number[]): number {
  if (arr.length === 0) return 0;
  const mean = arr.reduce((a, b) => a + b, 0) / arr.length;
  const variance = arr.reduce((s, v) => s + (v - mean) ** 2, 0) / arr.length;
  return Math.sqrt(variance);
}

function scoreByThreshold(value: number, thresholds: [number, number, number, number]): number {
  if (value < thresholds[0]) return 20;
  if (value < thresholds[1]) return 15;
  if (value < thresholds[2]) return 10;
  if (value < thresholds[3]) return 5;
  return 0;
}

// ============= v2 维度 (复用) =============

function calcCrowding(stocks: StockQuote[], allSectorPEs: number[]): DimensionResult {
  const pes = stocks.filter(s => s.pe_ratio > 0 && s.pe_ratio < 1000).map(s => s.pe_ratio);
  if (pes.length === 0) return { score: 10, label: '数据不足', detail: 'PE数据缺失,默认中性分' };
  const medianPE = percentile(pes, 50);
  const avgPE = pes.reduce((a, b) => a + b, 0) / pes.length;
  const peRank = allSectorPEs.length > 1
    ? allSectorPEs.filter(v => v < medianPE).length / allSectorPEs.length
    : 0.5;
  const score = Math.round(20 * (1 - peRank));
  let label: string;
  if (score >= 16) label = '估值舒适';
  else if (score >= 11) label = '估值合理';
  else if (score >= 6) label = '轻度拥挤';
  else label = '高度拥挤';
  const detail = `PE中位=${medianPE.toFixed(1)}, 均值=${avgPE.toFixed(1)}, 行业PE分位=${(peRank * 100).toFixed(0)}%`;
  return { score: Math.max(0, Math.min(20, score)), label, detail };
}

function calcDiffusion(stocks: StockQuote[], aboveMA20Map: Map<number, boolean>): DimensionResult {
  if (stocks.length === 0) return { score: 10, label: '数据不足', detail: '无个股数据' };
  let aboveCount = 0;
  for (const s of stocks) { if (aboveMA20Map.get(s.stock_id)) aboveCount++; }
  const pct = (aboveCount / stocks.length) * 100;
  const score = Math.round(20 * Math.max(0, Math.min(1, (pct - 30) / 50)));
  let label: string;
  if (pct >= 80) label = '全面扩散';
  else if (pct >= 50) label = '半数走强';
  else if (pct >= 30) label = '龙头拉抬';
  else label = '弱势集中';
  const detail = `${aboveCount}/${stocks.length} 个股站上MA20 (${pct.toFixed(0)}%)`;
  return { score: Math.max(0, Math.min(20, score)), label, detail };
}

function calcConcentration(stocks: StockQuote[]): DimensionResult {
  if (stocks.length < 3) return { score: 10, label: '样本不足', detail: `仅${stocks.length}只个股` };
  const sorted = [...stocks].sort((a, b) => b.turnover - a.turnover);
  const totalTurnover = stocks.reduce((s, st) => s + st.turnover, 0);
  if (totalTurnover === 0) return { score: 10, label: '无成交', detail: '成交额为0' };
  const top5Turnover = sorted.slice(0, Math.min(5, sorted.length)).reduce((s, st) => s + st.turnover, 0);
  const pct = (top5Turnover / totalTurnover) * 100;
  let score: number;
  if (pct >= 40 && pct <= 60) score = 20;
  else if (pct < 40) score = Math.round(20 * (pct / 40));
  else score = Math.round(20 * Math.max(0, (100 - pct) / 40));
  let label: string;
  if (pct > 80) label = '过度集中';
  else if (pct > 60) label = '偏集中';
  else if (pct >= 40) label = '分布合理';
  else label = '过度分散';
  const topNames = sorted.slice(0, 3).map(s => s.name).join('、');
  const detail = `Top5成交占比=${pct.toFixed(0)}% (${topNames}等)`;
  return { score: Math.max(0, Math.min(20, score)), label, detail };
}

function calcRetailIndex(stocks: StockQuote[], prevTurnoverMap: Map<number, number>): DimensionResult {
  const smallCaps = stocks.filter(s => s.market_cap > 0 && s.market_cap < 100 * 1e8);
  if (smallCaps.length === 0) return { score: 10, label: '无小盘股', detail: '板块内无<100亿市值个股' };
  let surgeCount = 0;
  const surged: string[] = [];
  for (const s of smallCaps) {
    const prev = prevTurnoverMap.get(s.stock_id);
    if (prev && prev > 0 && s.turnover_rate > 0) {
      const ratio = s.turnover_rate / prev;
      if (ratio > 1.5) { surgeCount++; if (surged.length < 3) surged.push(`${s.name}(${(ratio * 100 - 100).toFixed(0)}%)`); }
    }
  }
  const matched = smallCaps.filter(s => prevTurnoverMap.has(s.stock_id)).length;
  const surgePct = matched > 0 ? surgeCount / matched : 0;
  const score = Math.round(20 * Math.min(1, surgePct * 2));
  let label: string;
  if (score >= 16) label = '散户狂热';
  else if (score >= 10) label = '散户关注';
  else if (score >= 4) label = '散户冷淡';
  else label = '无人问津';
  const detail = surged.length > 0
    ? `${surgeCount}只小盘换手激增: ${surged.join(', ')}`
    : `${smallCaps.length}只小盘股, 换手整体平稳`;
  return { score: Math.max(0, Math.min(20, score)), label, detail };
}

function calcRecovery(ma5Change: number, ma20Change: number): DimensionResult {
  const diff = ma5Change - ma20Change;
  let score: number;
  let label: string;
  if (ma20Change >= 0) {
    if (diff > 3) { score = 20; label = '强势加速'; }
    else if (diff > 0) { score = 16; label = '温和上行'; }
    else if (diff > -3) { score = 12; label = '高位整理'; }
    else { score = 6; label = '短期回调'; }
  } else {
    if (diff > 5) { score = 18; label = '强力回补'; }
    else if (diff > 2) { score = 14; label = '温和反弹'; }
    else if (diff > 0) { score = 8; label = '弱反弹'; }
    else { score = 2; label = '持续走弱'; }
  }
  const detail = `5日均涨=${ma5Change.toFixed(2)}%, 20日均涨=${ma20Change.toFixed(2)}%, 差值=${diff.toFixed(2)}%`;
  return { score: Math.max(0, Math.min(20, score)), label, detail };
}

function calcPanic(stocks: StockQuote[]): DimensionResult {
  if (stocks.length === 0) return { score: 10, label: '数据不足', detail: '无个股数据' };
  const panicCount = stocks.filter(s => s.change_percent < -5).length;
  const ratio = (panicCount / stocks.length) * 100;
  const score = scoreByThreshold(ratio, [5, 10, 15, 20]);
  let label: string;
  if (score >= 20) label = '情绪稳定';
  else if (score >= 15) label = '轻微恐慌';
  else if (score >= 10) label = '中度恐慌';
  else if (score >= 5) label = '高度恐慌';
  else label = '极端恐慌';
  const worstNames = stocks.filter(s => s.change_percent < -5)
    .sort((a, b) => a.change_percent - b.change_percent)
    .slice(0, 3).map(s => `${s.name}(${s.change_percent.toFixed(1)}%)`).join('、');
  const detail = `${panicCount}/${stocks.length} 只跌幅>5% (${ratio.toFixed(1)}%)` +
    (worstNames ? ` 最大跌幅: ${worstNames}` : '');
  return { score, label, detail };
}

function calcVolatility(stocks: StockQuote[]): { result: DimensionResult; amplitudeStd: number } {
  if (stocks.length < 2) return { result: { score: 10, label: '样本不足', detail: `仅${stocks.length}只个股` }, amplitudeStd: 0 };
  const amplitudes: number[] = [];
  for (const s of stocks) {
    if (s.high_price > 0 && s.low_price > 0 && s.close_price > 0)
      amplitudes.push((s.high_price - s.low_price) / s.close_price);
  }
  if (amplitudes.length < 2) return { result: { score: 10, label: '数据不足', detail: '振幅数据缺失' }, amplitudeStd: 0 };
  const std = stdDev(amplitudes);
  const score = scoreByThreshold(std, [0.01, 0.02, 0.03, 0.04]);
  let label: string;
  if (score >= 20) label = '板块稳固';
  else if (score >= 15) label = '轻微分化';
  else if (score >= 10) label = '中度分化';
  else if (score >= 5) label = '剧烈分化';
  else label = '极度分化';
  const detail = `振幅标准差=${(std * 100).toFixed(2)}% (${amplitudes.length}只有效), ` +
    `均值=${(amplitudes.reduce((a, b) => a + b, 0) / amplitudes.length * 100).toFixed(2)}%`;
  return { result: { score, label, detail }, amplitudeStd: std };
}

function calcMomIndex(stocks: StockQuote[], lowPriceTurnoverPct: number, lowPriceTurnoverPctPrev: number): DimensionResult {
  if (stocks.length === 0) return { score: 10, label: '数据不足', detail: '无个股数据' };
  const lowPriceCount = stocks.filter(s => s.close_price > 0 && s.close_price < 20).length;
  if (lowPriceCount === 0) return { score: 20, label: '无低价股', detail: '板块内无<20元股票, 散户关注度低(满分)' };
  const pctChange = lowPriceTurnoverPctPrev > 0
    ? ((lowPriceTurnoverPct - lowPriceTurnoverPctPrev) / lowPriceTurnoverPctPrev) * 100 : 0;
  const score = scoreByThreshold(Math.max(0, pctChange), [5, 10, 20, 30]);
  let label: string;
  if (score >= 20) label = '散户冷静';
  else if (score >= 15) label = '散户微增';
  else if (score >= 10) label = '散户涌入';
  else if (score >= 5) label = '散户加速';
  else label = '散户狂热';
  const detail = `低价股(${lowPriceCount}只)成交额占比: 当期=${lowPriceTurnoverPct.toFixed(1)}%, ` +
    `上期=${lowPriceTurnoverPctPrev.toFixed(1)}%, 环比变化=${pctChange >= 0 ? '+' : ''}${pctChange.toFixed(1)}%`;
  return { score, label, detail };
}

function calcSearchHeat(distinctSubIndustries: number): DimensionResult {
  let score: number;
  if (distinctSubIndustries > 15) score = 20;
  else if (distinctSubIndustries > 10) score = 15;
  else if (distinctSubIndustries > 5) score = 10;
  else score = 5;
  let label: string;
  if (score >= 20) label = '概念丰富';
  else if (score >= 15) label = '概念较多';
  else if (score >= 10) label = '概念一般';
  else label = '概念单一';
  return { score, label, detail: `板块涉及${distinctSubIndustries}个细分领域/概念标签` };
}

function calcSpreadDegree(limitUpCount: number, totalStocks: number): DimensionResult {
  if (totalStocks === 0) return { score: 0, label: '无数据', detail: '板块无股票' };
  const ratio = (limitUpCount / totalStocks) * 100;
  let score: number;
  if (ratio > 10) score = 20;
  else if (ratio > 5) score = 15;
  else if (ratio > 2) score = 10;
  else if (ratio > 0) score = 5;
  else score = 0;
  let label: string;
  if (score >= 20) label = '火爆扩散';
  else if (score >= 15) label = '强势扩散';
  else if (score >= 10) label = '温和扩散';
  else if (score >= 5) label = '零星扩散';
  else label = '无扩散';
  return { score, label, detail: `${limitUpCount}/${totalStocks} 只涨停 (${ratio.toFixed(1)}%)` };
}

// ============= v3 新增专业指标 =============

// === 11. 动量仓位: 近5日涨幅>5%的股票占比 ===
function calcMomentumPosition(fiveDayReturns: Map<number, number>, stockQuotes: StockQuote[]): { result: DimensionResult; momentumRatio: number } {
  if (stockQuotes.length === 0) return { result: { score: 10, label: '数据不足', detail: '无个股数据' }, momentumRatio: 0 };

  const matched = stockQuotes.filter(s => fiveDayReturns.has(s.stock_id));
  if (matched.length === 0) return { result: { score: 10, label: '数据不足', detail: '无5日涨跌数据' }, momentumRatio: 0 };

  let strongCount = 0;
  const strongNames: string[] = [];
  for (const s of matched) {
    const ret = fiveDayReturns.get(s.stock_id)!;
    if (ret > 5) {
      strongCount++;
      if (strongNames.length < 3) strongNames.push(`${s.name}(+${ret.toFixed(1)}%)`);
    }
  }

  const ratio = (strongCount / matched.length) * 100;
  // >30%=20分, 20-30%=15, 10-20%=10, 5-10%=5, <5%=0
  const score = scoreByThreshold(ratio, [30, 20, 10, 5]);

  let label: string;
  if (score >= 20) label = '强势爆发';
  else if (score >= 15) label = '动量强劲';
  else if (score >= 10) label = '温和上升';
  else if (score >= 5) label = '动能不足';
  else label = '几乎无动量';

  const detail = `${strongCount}/${matched.length} 只近5日涨幅>5% (${ratio.toFixed(1)}%)` +
    (strongNames.length > 0 ? ` 代表: ${strongNames.join(', ')}` : '');

  return { result: { score, label, detail }, momentumRatio: ratio };
}

// === 12. Z值: PE偏离20日均值的标准差倍数 ===
// |Z|<0.5=20, <1=15, <2=10, <3=5, >3=0
function calcZScore(currentPE: number, pe20History: number[]): { result: DimensionResult; zScore: number } {
  if (!pe20History || pe20History.length < 5) {
    return { result: { score: 10, label: '数据不足', detail: 'PE历史数据不足' }, zScore: 0 };
  }
  if (currentPE <= 0) {
    return { result: { score: 10, label: '数据不足', detail: '当前PE无效' }, zScore: 0 };
  }

  const mean = pe20History.reduce((a, b) => a + b, 0) / pe20History.length;
  const sd = stdDev(pe20History);
  if (sd === 0) return { result: { score: 20, label: 'PE稳定', detail: 'PE几乎无波动,估值稳定' }, zScore: 0 };

  const z = Math.abs((currentPE - mean) / sd);

  let score: number;
  let label: string;
  if (z < 0.5) { score = 20; label = '估值正常'; }
  else if (z < 1) { score = 15; label = '轻微偏离'; }
  else if (z < 2) { score = 10; label = '中度偏离'; }
  else if (z < 3) { score = 5; label = '显著偏离'; }
  else { score = 0; label = '极端偏离'; }

  const detail = `PE=${currentPE.toFixed(1)}, 20日均值=${mean.toFixed(1)}, 标准差=${sd.toFixed(1)}, |Z|=${z.toFixed(2)}`;

  return { result: { score, label, detail }, zScore: z };
}

// === 13. 总杠杆代理: 平均换手率/20日均换手 → 偏离度 ===
// 偏离1.0越大→杠杆越高→越低分
function calcLeverage(
  currentAvgTurnover: number,
  historicalAvgTurnover20d: number
): { result: DimensionResult; ratio: number } {
  if (currentAvgTurnover <= 0 || historicalAvgTurnover20d <= 0) {
    return { result: { score: 10, label: '数据不足', detail: '换手率数据缺失' }, ratio: 0 };
  }

  const ratio = currentAvgTurnover / historicalAvgTurnover20d;
  // 偏离度 = |ratio - 1.0|, 偏离越小越好
  const deviation = Math.abs(ratio - 1.0);

  // deviation <0.1→20, <0.2→15, <0.3→10, <0.5→5, >0.5→0
  const score = scoreByThreshold(deviation, [0.1, 0.2, 0.3, 0.5]);

  let label: string;
  if (score >= 20) label = '杠杆正常';
  else if (score >= 15) label = '轻微放量';
  else if (score >= 10) label = '中度加杠';
  else if (score >= 5) label = '高杠杆';
  else label = '极端杠杆';

  const detail = `当前换手=${currentAvgTurnover.toFixed(2)}%, 20日均=${historicalAvgTurnover20d.toFixed(2)}%, ` +
    `比率=${ratio.toFixed(2)}, 偏离度=${(deviation * 100).toFixed(1)}%`;

  return { result: { score, label, detail }, ratio };
}

// === 14. 基金净持仓代理: 近5日涨跌家数比值 ===
// 净买入偏多=高分
function calcFundFlow(upDownRatio: number): DimensionResult {
  // upDownRatio = 上涨家数/下跌家数 (5日均)
  if (upDownRatio <= 0) return { score: 5, label: '全面下跌', detail: '近5日无上涨日或数据缺失' };

  // ratio >2=20, 1.5-2=15, 1-1.5=10, 0.5-1=5, <0.5=0
  let score: number;
  if (upDownRatio > 2) score = 20;
  else if (upDownRatio > 1.5) score = 15;
  else if (upDownRatio > 1) score = 10;
  else if (upDownRatio >= 0.5) score = 5;
  else score = 0;

  let label: string;
  if (score >= 20) label = '资金净流入';
  else if (score >= 15) label = '偏多格局';
  else if (score >= 10) label = '多空均衡';
  else if (score >= 5) label = '偏空格局';
  else label = '资金净流出';

  const detail = `近5日涨跌家数比=${upDownRatio.toFixed(2)} (上涨/下跌)`;

  return { score, label, detail };
}

// ============= 核心计算函数 (单板块) =============

async function computeSectorV3(
  decodedIndustry: string,
  knex: any,
  shareContext?: {
    allSectorPEs?: number[];
  }
): Promise<MultidimV3Result | null> {
  // 1. 获取板块内所有活跃股票
  let stockQuery = knex('stocks').where('is_active', true);
  if (decodedIndustry === '其他') {
    stockQuery = stockQuery.where(function(this: any) {
      this.whereNull('industry').orWhere('industry', '');
    });
  } else {
    stockQuery = stockQuery.where('industry', decodedIndustry);
  }
  const stocks = await stockQuery.select('id', 'symbol', 'name');
  if (stocks.length === 0) return null;
  const stockIds: number[] = stocks.map((s: any) => s.id);

  // 2. 获取最新行情
  const latestQuotes = await knex.raw(`
    SELECT DISTINCT ON (stock_id) 
      stock_id, close_price, change_percent, turnover, turnover_rate, 
      market_cap, pe_ratio, high_price, low_price
    FROM daily_quotes
    WHERE stock_id = ANY(?)
    ORDER BY stock_id, trade_date DESC
  `, [stockIds]);

  const quoteMap = new Map<number, StockQuote>();
  latestQuotes.rows.forEach((q: any) => {
    const stock = stocks.find((s: any) => s.id === q.stock_id);
    quoteMap.set(q.stock_id, {
      stock_id: q.stock_id,
      symbol: stock?.symbol || '',
      name: stock?.name || '',
      close_price: toNum(q.close_price),
      change_percent: toNum(q.change_percent),
      turnover: toNum(q.turnover),
      turnover_rate: toNum(q.turnover_rate),
      market_cap: toNum(q.market_cap),
      pe_ratio: toNum(q.pe_ratio),
      high_price: toNum(q.high_price),
      low_price: toNum(q.low_price),
    });
  });

  const stockQuotes: StockQuote[] = [];
  for (const s of stocks) {
    const q = quoteMap.get(s.id);
    if (q) stockQuotes.push(q);
  }

  // 3. 全行业PE (共享缓存)
  let allSectorPEs: number[];
  if (shareContext?.allSectorPEs) {
    allSectorPEs = shareContext.allSectorPEs;
  } else {
    const allPEsResult = await knex.raw(`
      SELECT DISTINCT ON (s.industry) 
        s.industry, AVG(dq.pe_ratio) as avg_pe
      FROM daily_quotes dq
      JOIN stocks s ON dq.stock_id = s.id
      WHERE dq.trade_date = (SELECT MAX(trade_date) FROM daily_quotes)
        AND s.industry IS NOT NULL AND s.is_active = true
        AND dq.pe_ratio > 0 AND dq.pe_ratio < 1000
      GROUP BY s.industry
    `);
    allSectorPEs = allPEsResult.rows.map((r: any) => toNum(r.avg_pe)).filter((v: number) => v > 0);
  }

  // 4. MA20判断
  const ma20Result = await knex.raw(`
    WITH recent_dates AS (
      SELECT DISTINCT trade_date FROM daily_quotes 
      WHERE stock_id = ANY(?) ORDER BY trade_date DESC LIMIT 20
    ),
    stock_ma AS (
      SELECT dq.stock_id,
        AVG(dq.close_price) as ma20,
        MAX(dq.close_price) FILTER (WHERE dq.trade_date = (SELECT MAX(trade_date) FROM recent_dates)) as latest_close
      FROM daily_quotes dq
      JOIN recent_dates rd ON dq.trade_date = rd.trade_date
      WHERE dq.stock_id = ANY(?)
      GROUP BY dq.stock_id
    )
    SELECT stock_id, latest_close > ma20 as above_ma20 FROM stock_ma
  `, [stockIds, stockIds]);

  const aboveMA20Map = new Map<number, boolean>();
  ma20Result.rows.forEach((r: any) => { aboveMA20Map.set(r.stock_id, r.above_ma20 === true); });

  // 5. 历史换手率 (30天前)
  const prevTurnoverResult = await knex.raw(`
    WITH date_rank AS (
      SELECT DISTINCT trade_date, ROW_NUMBER() OVER (ORDER BY trade_date DESC) as rn
      FROM daily_quotes WHERE stock_id = ANY(?)
    ),
    target_date AS (SELECT trade_date FROM date_rank WHERE rn = 21)
    SELECT dq.stock_id, dq.turnover_rate
    FROM daily_quotes dq, target_date td
    WHERE dq.stock_id = ANY(?) AND dq.trade_date = td.trade_date
  `, [stockIds, stockIds]);

  const prevTurnoverMap = new Map<number, number>();
  prevTurnoverResult.rows.forEach((r: any) => { prevTurnoverMap.set(r.stock_id, toNum(r.turnover_rate)); });

  // 6. 5日和20日动量
  const momentumResult = await knex.raw(`
    WITH dates AS (
      SELECT DISTINCT trade_date FROM daily_quotes
      WHERE stock_id = ANY(?) ORDER BY trade_date DESC LIMIT 21
    ),
    sector_daily AS (
      SELECT dq.trade_date, AVG(dq.change_percent) as avg_change,
        ROW_NUMBER() OVER (ORDER BY dq.trade_date DESC) as rn
      FROM daily_quotes dq
      JOIN dates d ON dq.trade_date = d.trade_date
      WHERE dq.stock_id = ANY(?)
      GROUP BY dq.trade_date
    )
    SELECT 
      AVG(avg_change) FILTER (WHERE rn <= 5) as ma5,
      AVG(avg_change) FILTER (WHERE rn <= 20) as ma20
    FROM sector_daily
  `, [stockIds, stockIds]);
  const ma5 = toNum(momentumResult.rows[0]?.ma5);
  const ma20 = toNum(momentumResult.rows[0]?.ma20);

  // 7. 概念标签
  let conceptTagCount = 0;
  try {
    const subIndustryResult = await knex('stocks')
      .where('is_active', true)
      .where('industry', decodedIndustry)
      .whereNotNull('sub_industry').where('sub_industry', '!=', '')
      .distinct('sub_industry');
    conceptTagCount = subIndustryResult.length > 0 ? subIndustryResult.length : stocks.length;
  } catch {
    conceptTagCount = stocks.length;
  }

  // 8. 涨停家数
  const limitUpResult = await knex.raw(`
    SELECT COUNT(*) as limit_up_count
    FROM daily_quotes
    WHERE stock_id = ANY(?)
      AND trade_date = (SELECT MAX(trade_date) FROM daily_quotes WHERE stock_id = ANY(?))
      AND change_percent >= 9.9
  `, [stockIds, stockIds]);
  const limitUpCount = parseInt(String(limitUpResult.rows[0]?.limit_up_count || 0), 10);

  // 9. 低价股成交额占比 (当期)
  const totalTurnoverAll = stockQuotes.reduce((sum, s) => sum + s.turnover, 0);
  const lowPriceTurnover = stockQuotes.filter(s => s.close_price > 0 && s.close_price < 20)
    .reduce((sum, s) => sum + s.turnover, 0);
  const lowPriceTurnoverPct = totalTurnoverAll > 0 ? (lowPriceTurnover / totalTurnoverAll) * 100 : 0;

  // 10. 低价股成交额占比 (上期)
  let lowPriceTurnoverPctPrev = lowPriceTurnoverPct;
  try {
    const prevDateResult = await knex.raw(`
      SELECT DISTINCT trade_date FROM daily_quotes
      WHERE stock_id = ANY(?) ORDER BY trade_date DESC LIMIT 2
    `, [stockIds]);
    if (prevDateResult.rows.length >= 2) {
      const prevDate = prevDateResult.rows[1].trade_date;
      const prevQuotesResult = await knex.raw(`
        SELECT dq.stock_id, dq.close_price, dq.turnover
        FROM daily_quotes dq
        WHERE dq.stock_id = ANY(?) AND dq.trade_date = ?
      `, [stockIds, prevDate]);
      const prevLowPriceTurnover = prevQuotesResult.rows
        .filter((r: any) => toNum(r.close_price) > 0 && toNum(r.close_price) < 20)
        .reduce((sum: number, r: any) => sum + toNum(r.turnover), 0);
      const prevTotalTurnover = prevQuotesResult.rows
        .reduce((sum: number, r: any) => sum + toNum(r.turnover), 0);
      if (prevTotalTurnover > 0) lowPriceTurnoverPctPrev = (prevLowPriceTurnover / prevTotalTurnover) * 100;
    }
  } catch { /* fallback */ }

  // ============= v3 新增查询 =============

  // 11. 近5日涨幅 (动量仓位)
  const fiveDayReturnResult = await knex.raw(`
    WITH date_series AS (
      SELECT DISTINCT trade_date FROM daily_quotes
      WHERE stock_id = ANY(?) ORDER BY trade_date DESC LIMIT 6
    ),
    latest AS (
      SELECT dq.stock_id, dq.close_price as latest_close
      FROM daily_quotes dq
      JOIN date_series ds ON dq.trade_date = ds.trade_date
      WHERE dq.stock_id = ANY(?)
        AND dq.trade_date = (SELECT MAX(trade_date) FROM date_series)
    ),
    day5 AS (
      SELECT dq.stock_id, dq.close_price as prev_close
      FROM daily_quotes dq
      JOIN date_series ds ON dq.trade_date = ds.trade_date
      WHERE dq.stock_id = ANY(?)
        AND dq.trade_date = (SELECT trade_date FROM date_series ORDER BY trade_date DESC OFFSET 5 LIMIT 1)
    )
    SELECT l.stock_id, 
      CASE WHEN d.prev_close > 0 THEN ((l.latest_close - d.prev_close) / d.prev_close) * 100 ELSE NULL END as five_day_return
    FROM latest l
    LEFT JOIN day5 d ON l.stock_id = d.stock_id
    WHERE d.prev_close IS NOT NULL
  `, [stockIds, stockIds, stockIds]);

  const fiveDayReturns = new Map<number, number>();
  fiveDayReturnResult.rows.forEach((r: any) => {
    if (r.five_day_return !== null && r.five_day_return !== undefined) {
      fiveDayReturns.set(r.stock_id, toNum(r.five_day_return));
    }
  });

  // 12. PE 20日历史 (Z值)
  const peHistoryResult = await knex.raw(`
    WITH pe_dates AS (
      SELECT DISTINCT trade_date FROM daily_quotes
      WHERE stock_id = ANY(?) ORDER BY trade_date DESC LIMIT 20
    )
    SELECT dq.stock_id, AVG(dq.pe_ratio) as avg_pe
    FROM daily_quotes dq
    JOIN pe_dates pd ON dq.trade_date = pd.trade_date
    WHERE dq.stock_id = ANY(?) AND dq.pe_ratio > 0 AND dq.pe_ratio < 1000
    GROUP BY dq.stock_id
  `, [stockIds, stockIds]);

  // 板块平均PE (对所有个股PE取中位数)
  const peValues = peHistoryResult.rows
    .map((r: any) => toNum(r.avg_pe))
    .filter((v: number) => v > 0);
  const sectorAvgPE = peValues.length > 0 ? percentile(peValues, 50) : 0;

  // 13. 20日均换手率 (杠杆计算)
  const turnover20Result = await knex.raw(`
    WITH turnover_dates AS (
      SELECT DISTINCT trade_date FROM daily_quotes
      WHERE stock_id = ANY(?) ORDER BY trade_date DESC LIMIT 20
    )
    SELECT AVG(dq.turnover_rate) as avg_turnover_20d
    FROM daily_quotes dq
    JOIN turnover_dates td ON dq.trade_date = td.trade_date
    WHERE dq.stock_id = ANY(?) AND dq.turnover_rate > 0
  `, [stockIds, stockIds]);
  const historicalAvgTurnover20d = toNum(turnover20Result.rows[0]?.avg_turnover_20d);

  // 当前平均换手率
  const currentAvgTurnover = stockQuotes.filter(s => s.turnover_rate > 0).length > 0
    ? stockQuotes.filter(s => s.turnover_rate > 0)
        .reduce((s, sq) => s + sq.turnover_rate, 0) /
      stockQuotes.filter(s => s.turnover_rate > 0).length
    : 0;

  // 14. 近5日涨跌家数比值 (基金净持仓代理)
  const upDownResult = await knex.raw(`
    WITH date_series AS (
      SELECT DISTINCT trade_date FROM daily_quotes
      WHERE stock_id = ANY(?) ORDER BY trade_date DESC LIMIT 5
    )
    SELECT 
      AVG(CASE WHEN dq.change_percent > 0 THEN 1.0 ELSE 0.0 END) as avg_up_ratio,
      AVG(CASE WHEN dq.change_percent < 0 THEN 1.0 ELSE 0.0 END) as avg_down_ratio
    FROM daily_quotes dq
    JOIN date_series ds ON dq.trade_date = ds.trade_date
    WHERE dq.stock_id = ANY(?)
  `, [stockIds, stockIds]);
  const avgUpRatio = toNum(upDownResult.rows[0]?.avg_up_ratio);
  const avgDownRatio = toNum(upDownResult.rows[0]?.avg_down_ratio);
  const upDownRatio = avgDownRatio > 0 ? avgUpRatio / avgDownRatio : (avgUpRatio > 0 ? 999 : 0);

  // ============= 计算14个维度 =============

  const crowding = calcCrowding(stockQuotes, allSectorPEs);
  const diffusion = calcDiffusion(stockQuotes, aboveMA20Map);
  const concentration = calcConcentration(stockQuotes);
  const retail = calcRetailIndex(stockQuotes, prevTurnoverMap);
  const recovery = calcRecovery(ma5, ma20);
  const panic = calcPanic(stockQuotes);
  const { result: volatility, amplitudeStd } = calcVolatility(stockQuotes);
  const momIndex = calcMomIndex(stockQuotes, lowPriceTurnoverPct, lowPriceTurnoverPctPrev);
  const searchHeat = calcSearchHeat(conceptTagCount);
  const spreadDegree = calcSpreadDegree(limitUpCount, stockQuotes.length);

  // v3 new
  const { result: momentumPosition, momentumRatio } = calcMomentumPosition(fiveDayReturns, stockQuotes);
  const { result: zScoreResult, zScore } = calcZScore(sectorAvgPE, peValues);
  const { result: leverage, ratio: turnoverLeverageRatio } = calcLeverage(currentAvgTurnover, historicalAvgTurnover20d);
  const fundFlow = calcFundFlow(upDownRatio);

  // 重组两组分数
  // boomScore(景气度100): 扩散+回补+动量仓位+搜索热度+传播扩散度
  const boomScore = diffusion.score + recovery.score + momentumPosition.score + searchHeat.score + spreadDegree.score;

  // crowdingScore(拥挤度100): PE分位+集中度+Z值+杠杆+恐慌度+基金代理 (6维度×20=120, 归一化到100)
  const crowdingRaw = crowding.score + concentration.score + zScoreResult.score + leverage.score + panic.score + fundFlow.score;
  const crowdingScore = Math.min(100, Math.round(crowdingRaw / 120 * 100));

  const totalScore = crowding.score + diffusion.score + concentration.score + retail.score + recovery.score +
    panic.score + volatility.score + momIndex.score + searchHeat.score + spreadDegree.score +
    momentumPosition.score + zScoreResult.score + leverage.score + fundFlow.score;
  const maxScore = 280; // 14 × 20

  // 聚合元数据
  const pes = stockQuotes.filter(s => s.pe_ratio > 0).map(s => s.pe_ratio);
  const avgPE = pes.length > 0 ? pes.reduce((a, b) => a + b, 0) / pes.length : 0;
  const medianPE = percentile(pes, 50);
  let aboveCount = 0;
  for (const s of stockQuotes) { if (aboveMA20Map.get(s.stock_id)) aboveCount++; }
  const aboveMA20Pct = stockQuotes.length > 0 ? (aboveCount / stockQuotes.length) * 100 : 0;
  const sortedByTurnover = [...stockQuotes].sort((a, b) => b.turnover - a.turnover);
  const top5Turnover = sortedByTurnover.slice(0, 5).reduce((s, st) => s + st.turnover, 0);
  const top5TurnoverPct = totalTurnoverAll > 0 ? (top5Turnover / totalTurnoverAll) * 100 : 0;
  const smallCaps = stockQuotes.filter(s => s.market_cap > 0 && s.market_cap < 100 * 1e8);
  let surgeCount = 0;
  for (const s of smallCaps) {
    const prev = prevTurnoverMap.get(s.stock_id);
    if (prev && prev > 0 && s.turnover_rate / prev > 1.5) surgeCount++;
  }
  const smallCapTurnoverSurge = smallCaps.length > 0 ? surgeCount / smallCaps.length : 0;
  const panicCount = stockQuotes.filter(s => s.change_percent < -5).length;
  const panicRatio = stockQuotes.length > 0 ? (panicCount / stockQuotes.length) * 100 : 0;
  const limitUpRatio = stockQuotes.length > 0 ? (limitUpCount / stockQuotes.length) * 100 : 0;

  return {
    industry: decodedIndustry,
    totalScore,
    maxScore,
    boomScore,
    crowdingScore,
    dimensions: {
      crowding, diffusion, concentration, retail, recovery,
      panic, volatility, momIndex, searchHeat, spreadDegree,
      momentumPosition, zScore: zScoreResult, leverage, fundFlow,
    },
    metadata: {
      stockCount: stockQuotes.length,
      avgPE, medianPE, aboveMA20Pct, top5TurnoverPct,
      smallCapTurnoverSurge, ma5Change: ma5, ma20Change: ma20,
      panicRatio, amplitudeStd,
      lowPriceTurnoverPct, lowPriceTurnoverPctPrev,
      conceptTagCount, limitUpRatio,
      momentumRatio, peZScore: zScore, turnoverLeverageRatio,
      fundFlowUpDownRatio: upDownRatio,
    },
  };
}

// ============= 路由 =============

// GET /api/sectors/:code/multidim-v3 - 单板块查询
router.get('/sectors/:code/multidim-v3', asyncHandler(async (req: Request, res: Response) => {
  const { code: industry } = req.params;
  const decodedIndustry = decodeURIComponent(industry);
  const db = getDb();
  const knex = db.connection;

  const result = await computeSectorV3(decodedIndustry, knex);
  if (!result) {
    return sendNotFound(res, `板块 "${decodedIndustry}" 无数据`);
  }
  sendSuccess(res, result);
}));

// POST /api/sectors/multidim-v3/batch - 批量查询
router.post('/sectors/multidim-v3/batch', asyncHandler(async (req: Request, res: Response) => {
  const { codes } = req.body;
  if (!Array.isArray(codes) || codes.length === 0) {
    return sendSuccess(res, { sectors: [] });
  }

  const db = getDb();
  const knex = db.connection;

  // 预加载全行业PE (共享缓存, 避免重复查询)
  const allPEsResult = await knex.raw(`
    SELECT DISTINCT ON (s.industry) 
      s.industry, AVG(dq.pe_ratio) as avg_pe
    FROM daily_quotes dq
    JOIN stocks s ON dq.stock_id = s.id
    WHERE dq.trade_date = (SELECT MAX(trade_date) FROM daily_quotes)
      AND s.industry IS NOT NULL AND s.is_active = true
      AND dq.pe_ratio > 0 AND dq.pe_ratio < 1000
    GROUP BY s.industry
  `);
  const allSectorPEs: number[] = allPEsResult.rows
    .map((r: any) => toNum(r.avg_pe)).filter((v: number) => v > 0);

  const results: MultidimV3Result[] = [];
  for (const code of codes) {
    const decoded = decodeURIComponent(String(code));
    const result = await computeSectorV3(decoded, knex, { allSectorPEs });
    if (result) results.push(result);
  }

  sendSuccess(res, { sectors: results });
}));

export default router;
