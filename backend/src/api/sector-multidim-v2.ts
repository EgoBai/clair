/**
 * 板块景气度多维度扩展 V2 API
 * GET /api/sectors/:code/multidim-v2
 *
 * 10个维度(各0-20分, 总分0-200):
 *   === v1 维度 (复用) ===
 *   1. 拥挤度 (0-20): PE分位数 vs 行业均值, PE越高越拥挤→分越低
 *   2. 扩散程度 (0-20): 板块内%个股站上MA20, >80%→满分
 *   3. 资金集中度 (0-20): Top5成交占比, 40-60%最佳
 *   4. 小白指数 (0-20): 小市值(<100亿)股换手飙升
 *   5. 回补程度 (0-20): 近5日 vs 近20日动量对比
 *   === v2 新维度 ===
 *   6. 恐慌度 A3 (0-20): 板块内跌幅>5%的股票占比, 越低越好
 *   7. 动摇度 A4 (0-20): 板块个股振幅(high-low)/close的标准差, 越低越稳
 *   8. 宝妈指数 B4 (0-20): 低价股(<20元)成交额占比环比变化, 占比上升=预警
 *   9. 搜索热度 C1 (0-20): 代理=概念标签(子行业)数量归一化
 *   10. 传播扩散度 C2 (0-20): 涨停家数/板块股票数的比例, 越高越热
 */

import { Router } from 'express';
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

interface MultidimV2Result {
  industry: string;
  totalScore: number;
  maxScore: number;
  dimensions: {
    // v1
    crowding: DimensionResult;
    diffusion: DimensionResult;
    concentration: DimensionResult;
    retail: DimensionResult;
    recovery: DimensionResult;
    // v2 new
    panic: DimensionResult;        // A3 恐慌度
    volatility: DimensionResult;    // A4 动摇度
    momIndex: DimensionResult;      // B4 宝妈指数
    searchHeat: DimensionResult;    // C1 搜索热度
    spreadDegree: DimensionResult;  // C2 传播扩散度
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
    // v2 new metadata
    panicRatio: number;             // 跌幅>5%的股票占比
    amplitudeStd: number;           // 振幅标准差
    lowPriceTurnoverPct: number;    // 低价股成交额占比
    lowPriceTurnoverPctPrev: number;// 上期低价股成交额占比
    conceptTagCount: number;        // 概念标签数量
    limitUpRatio: number;           // 涨停比例
  };
}

// ============= 工具函数 =============

const toNum = (v: unknown): number =>
  v === null || v === undefined ? 0 : parseFloat(String(v));

/** 计算百分位数 */
function percentile(arr: number[], p: number): number {
  if (arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const idx = (p / 100) * (sorted.length - 1);
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
}

/** 标准差 */
function stdDev(arr: number[]): number {
  if (arr.length === 0) return 0;
  const mean = arr.reduce((a, b) => a + b, 0) / arr.length;
  const variance = arr.reduce((s, v) => s + (v - mean) ** 2, 0) / arr.length;
  return Math.sqrt(variance);
}

/**
 * 区间分档打分
 * @param value 实际值 (必须是数, 越低越好)
 * @param thresholds 阈值数组 [t1, t2, t3, t4] 对应 15, 10, 5, 0 分边界
 * @example scoreByThreshold(6, [5, 10, 15, 20]) => value<5→20, 5-10→15, 10-15→10, 15-20→5, >20→0
 */
function scoreByThreshold(value: number, thresholds: [number, number, number, number]): number {
  if (value < thresholds[0]) return 20;
  if (value < thresholds[1]) return 15;
  if (value < thresholds[2]) return 10;
  if (value < thresholds[3]) return 5;
  return 0;
}

// ============= v1 维度 (复用) =============

// === 1. 拥挤度 (PE分位数法) ===
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

// === 2. 扩散程度 (%个股站上MA20) ===
function calcDiffusion(
  stocks: StockQuote[],
  aboveMA20Map: Map<number, boolean>
): DimensionResult {
  if (stocks.length === 0) return { score: 10, label: '数据不足', detail: '无个股数据' };

  let aboveCount = 0;
  for (const s of stocks) {
    if (aboveMA20Map.get(s.stock_id)) aboveCount++;
  }

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

// === 3. 资金集中度 (Top5成交占比) ===
function calcConcentration(stocks: StockQuote[]): DimensionResult {
  if (stocks.length < 3) return { score: 10, label: '样本不足', detail: `仅${stocks.length}只个股` };

  const sorted = [...stocks].sort((a, b) => b.turnover - a.turnover);
  const totalTurnover = stocks.reduce((s, st) => s + st.turnover, 0);
  if (totalTurnover === 0) return { score: 10, label: '无成交', detail: '成交额为0' };

  const top5Turnover = sorted.slice(0, Math.min(5, sorted.length))
    .reduce((s, st) => s + st.turnover, 0);
  const pct = (top5Turnover / totalTurnover) * 100;

  let score: number;
  if (pct >= 40 && pct <= 60) {
    score = 20;
  } else if (pct < 40) {
    score = Math.round(20 * (pct / 40));
  } else {
    score = Math.round(20 * Math.max(0, (100 - pct) / 40));
  }

  let label: string;
  if (pct > 80) label = '过度集中';
  else if (pct > 60) label = '偏集中';
  else if (pct >= 40) label = '分布合理';
  else label = '过度分散';

  const topNames = sorted.slice(0, 3).map(s => s.name).join('、');
  const detail = `Top5成交占比=${pct.toFixed(0)}% (${topNames}等)`;

  return { score: Math.max(0, Math.min(20, score)), label, detail };
}

// === 4. 小白指数 (小市值换手激增) ===
function calcRetailIndex(
  stocks: StockQuote[],
  prevTurnoverMap: Map<number, number>
): DimensionResult {
  const smallCaps = stocks.filter(s => s.market_cap > 0 && s.market_cap < 100 * 1e8);
  if (smallCaps.length === 0) return { score: 10, label: '无小盘股', detail: '板块内无<100亿市值个股' };

  let surgeCount = 0;
  const surged: string[] = [];

  for (const s of smallCaps) {
    const prev = prevTurnoverMap.get(s.stock_id);
    if (prev && prev > 0 && s.turnover_rate > 0) {
      const ratio = s.turnover_rate / prev;
      if (ratio > 1.5) {
        surgeCount++;
        if (surged.length < 3) surged.push(`${s.name}(${(ratio * 100 - 100).toFixed(0)}%)`);
      }
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

// === 5. 回补程度 (5日 vs 20日动量) ===
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

// ============= v2 新维度 =============

// === 6. 恐慌度 A3: 板块内跌幅>5%的股票占比 ===
// 比例越低越好: <5%=20分, 5-10%=15, 10-15%=10, 15-20%=5, >20%=0
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

  const worstNames = stocks
    .filter(s => s.change_percent < -5)
    .sort((a, b) => a.change_percent - b.change_percent)
    .slice(0, 3)
    .map(s => `${s.name}(${s.change_percent.toFixed(1)}%)`)
    .join('、');

  const detail = `${panicCount}/${stocks.length} 只跌幅>5% (${ratio.toFixed(1)}%)` +
    (worstNames ? ` 最大跌幅: ${worstNames}` : '');

  return { score, label, detail };
}

// === 7. 动摇度 A4: 板块个股振幅(high-low)/close的标准差 ===
// 波动越低越好
function calcVolatility(stocks: StockQuote[]): { result: DimensionResult; amplitudeStd: number } {
  if (stocks.length < 2) return {
    result: { score: 10, label: '样本不足', detail: `仅${stocks.length}只个股` },
    amplitudeStd: 0,
  };

  const amplitudes: number[] = [];
  for (const s of stocks) {
    if (s.high_price > 0 && s.low_price > 0 && s.close_price > 0) {
      const amp = (s.high_price - s.low_price) / s.close_price;
      amplitudes.push(amp);
    }
  }

  if (amplitudes.length < 2) return {
    result: { score: 10, label: '数据不足', detail: '振幅数据缺失' },
    amplitudeStd: 0,
  };

  const std = stdDev(amplitudes);

  // 振幅标准差: <0.01(1%)→20, 0.01-0.02→15, 0.02-0.03→10, 0.03-0.04→5, >0.04→0
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

// === 8. 宝妈指数 B4: 低价股(<20元)成交额占比环比变化 ===
// 占比上升=散户涌入=预警: <5%增量=20, 5-10%=15, 10-20%=10, 20-30%=5, >30%=0
function calcMomIndex(
  stocks: StockQuote[],
  lowPriceTurnoverPct: number,
  lowPriceTurnoverPctPrev: number
): DimensionResult {
  if (stocks.length === 0) return { score: 10, label: '数据不足', detail: '无个股数据' };

  const lowPriceCount = stocks.filter(s => s.close_price > 0 && s.close_price < 20).length;
  if (lowPriceCount === 0) return {
    score: 20,
    label: '无低价股',
    detail: '板块内无<20元股票, 散户关注度低(满分)',
  };

  // 环比变化: 当前占比 vs 上期占比
  const pctChange = lowPriceTurnoverPctPrev > 0
    ? ((lowPriceTurnoverPct - lowPriceTurnoverPctPrev) / lowPriceTurnoverPctPrev) * 100
    : 0;

  // 占比上升是坏事 (散户涌入预警)
  const score = scoreByThreshold(Math.max(0, pctChange), [5, 10, 20, 30]);

  let label: string;
  if (score >= 20) label = '散户冷静';
  else if (score >= 15) label = '散户微增';
  else if (score >= 10) label = '散户涌入';
  else if (score >= 5) label = '散户加速';
  else label = '散户狂热';

  const detail = `低价股(${lowPriceCount}只)成交额占比: 当期=${lowPriceTurnoverPct.toFixed(1)}%, ` +
    `上期=${lowPriceTurnoverPctPrev.toFixed(1)}%, ` +
    `环比变化=${pctChange >= 0 ? '+' : ''}${pctChange.toFixed(1)}%`;

  return { score, label, detail };
}

// === 9. 搜索热度 C1: 代理=概念标签数量(子行业去重) ===
// 0-5标签=5, 5-10=10, 10-15=15, >15=20
function calcSearchHeat(distinctSubIndustries: number): DimensionResult {
  // 归一化系数: 概念丰富度越高, 搜索热度越高
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

  const detail = `板块涉及${distinctSubIndustries}个细分领域/概念标签`;

  return { score, label, detail };
}

// === 10. 传播扩散度 C2: 涨停家数/板块股票数比例 ===
// 0%=0, 0-2%=5, 2-5%=10, 5-10%=15, >10%=20
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

  const detail = `${limitUpCount}/${totalStocks} 只涨停 (${ratio.toFixed(1)}%)`;

  return { score, label, detail };
}

// ============= 主路由 =============

router.get('/sectors/:code/multidim-v2', asyncHandler(async (req, res) => {
  const { code: industry } = req.params;
  const decodedIndustry = decodeURIComponent(industry);

  const db = getDb();
  const knex = db.connection;

  // 1. 获取板块内所有活跃股票
  let stockQuery = (knex('stocks') as any).where('is_active', true);
  if (decodedIndustry === '其他') {
    stockQuery = stockQuery.where(function(this: any) {
      this.whereNull('industry').orWhere('industry', '');
    });
  } else {
    stockQuery = stockQuery.where('industry', decodedIndustry);
  }
  const stocks = await stockQuery.select('id', 'symbol', 'name');
  if (stocks.length === 0) {
    return sendNotFound(res, `板块 "${decodedIndustry}" 无数据`);
  }
  const stockIds: number[] = stocks.map((s: any) => s.id);

  // 2. 获取最新行情 (含 high_price / low_price 用于v2新维度)
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

  // 3. 全行业PE (用于拥挤度百分位)
  const allPEsResult = await knex.raw(`
    SELECT DISTINCT ON (s.industry) 
      s.industry,
      AVG(dq.pe_ratio) as avg_pe
    FROM daily_quotes dq
    JOIN stocks s ON dq.stock_id = s.id
    WHERE dq.trade_date = (SELECT MAX(trade_date) FROM daily_quotes)
      AND s.industry IS NOT NULL
      AND s.is_active = true
      AND dq.pe_ratio > 0 AND dq.pe_ratio < 1000
    GROUP BY s.industry
  `);
  const allSectorPEs: number[] = allPEsResult.rows
    .map((r: any) => toNum(r.avg_pe))
    .filter((v: number) => v > 0);

  // 4. MA20判断
  const ma20Result = await knex.raw(`
    WITH recent_dates AS (
      SELECT DISTINCT trade_date 
      FROM daily_quotes 
      WHERE stock_id = ANY(?)
      ORDER BY trade_date DESC 
      LIMIT 20
    ),
    stock_ma AS (
      SELECT 
        dq.stock_id,
        AVG(dq.close_price) as ma20,
        MAX(dq.close_price) FILTER (WHERE dq.trade_date = (SELECT MAX(trade_date) FROM recent_dates)) as latest_close
      FROM daily_quotes dq
      JOIN recent_dates rd ON dq.trade_date = rd.trade_date
      WHERE dq.stock_id = ANY(?)
      GROUP BY dq.stock_id
    )
    SELECT stock_id, latest_close > ma20 as above_ma20
    FROM stock_ma
  `, [stockIds, stockIds]);

  const aboveMA20Map = new Map<number, boolean>();
  ma20Result.rows.forEach((r: any) => {
    aboveMA20Map.set(r.stock_id, r.above_ma20 === true);
  });

  // 5. 历史换手率 (小白指数月度对比)
  const prevTurnoverResult = await knex.raw(`
    WITH date_rank AS (
      SELECT DISTINCT trade_date,
        ROW_NUMBER() OVER (ORDER BY trade_date DESC) as rn
      FROM daily_quotes
      WHERE stock_id = ANY(?)
    ),
    target_date AS (
      SELECT trade_date FROM date_rank WHERE rn = 21
    )
    SELECT dq.stock_id, dq.turnover_rate
    FROM daily_quotes dq, target_date td
    WHERE dq.stock_id = ANY(?)
      AND dq.trade_date = td.trade_date
  `, [stockIds, stockIds]);

  const prevTurnoverMap = new Map<number, number>();
  prevTurnoverResult.rows.forEach((r: any) => {
    prevTurnoverMap.set(r.stock_id, toNum(r.turnover_rate));
  });

  // 6. 5日和20日动量
  const momentumResult = await knex.raw(`
    WITH dates AS (
      SELECT DISTINCT trade_date
      FROM daily_quotes
      WHERE stock_id = ANY(?)
      ORDER BY trade_date DESC
      LIMIT 21
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

  // ============= v2 新增查询 =============

  // 7. 概念标签: 板块内股票涉及的去重子行业数量 (C1代理)
  let conceptTagCount = 0;
  try {
    const subIndustryResult = await (knex('stocks') as any)
      .where('is_active', true)
      .where('industry', decodedIndustry)
      .whereNotNull('sub_industry')
      .where('sub_industry', '!=', '')
      .distinct('sub_industry');
    conceptTagCount = subIndustryResult.length > 0
      ? subIndustryResult.length
      : stocks.length; // 回退: 使用股票数作为最低代理
  } catch {
    conceptTagCount = stocks.length;
  }

  // 8. 涨停家数 (C2): change_percent >= 9.9
  const limitUpResult = await knex.raw(`
    SELECT COUNT(*) as limit_up_count
    FROM daily_quotes
    WHERE stock_id = ANY(?)
      AND trade_date = (SELECT MAX(trade_date) FROM daily_quotes WHERE stock_id = ANY(?))
      AND change_percent >= 9.9
  `, [stockIds, stockIds]);
  const limitUpCount = parseInt(String(limitUpResult.rows[0]?.limit_up_count || 0), 10);

  // 9. 低价股(<20元)成交额占比 (B4 当期)
  const lowPriceTurnover = stockQuotes
    .filter(s => s.close_price > 0 && s.close_price < 20)
    .reduce((sum, s) => sum + s.turnover, 0);
  const totalTurnoverAll = stockQuotes.reduce((sum, s) => sum + s.turnover, 0);
  const lowPriceTurnoverPct = totalTurnoverAll > 0
    ? (lowPriceTurnover / totalTurnoverAll) * 100
    : 0;

  // 10. 低价股成交额占比 (B4 上期/前一个交易日)
  let lowPriceTurnoverPctPrev = lowPriceTurnoverPct; // 默认同值避免除零
  try {
    const prevDateResult = await knex.raw(`
      SELECT DISTINCT trade_date
      FROM daily_quotes
      WHERE stock_id = ANY(?)
      ORDER BY trade_date DESC
      LIMIT 2
    `, [stockIds]);
    if (prevDateResult.rows.length >= 2) {
      const prevDate = prevDateResult.rows[1].trade_date;
      const prevQuotesResult = await knex.raw(`
        SELECT dq.stock_id, dq.close_price, dq.turnover
        FROM daily_quotes dq
        WHERE dq.stock_id = ANY(?)
          AND dq.trade_date = ?
      `, [stockIds, prevDate]);

      const prevLowPriceTurnover = prevQuotesResult.rows
        .filter((r: any) => toNum(r.close_price) > 0 && toNum(r.close_price) < 20)
        .reduce((sum: number, r: any) => sum + toNum(r.turnover), 0);
      const prevTotalTurnover = prevQuotesResult.rows
        .reduce((sum: number, r: any) => sum + toNum(r.turnover), 0);

      if (prevTotalTurnover > 0) {
        lowPriceTurnoverPctPrev = (prevLowPriceTurnover / prevTotalTurnover) * 100;
      }
    }
  } catch {
    // 降级: 使用当期值
    lowPriceTurnoverPctPrev = lowPriceTurnoverPct;
  }

  // ============= 计算10个维度 =============

  // v1
  const crowding = calcCrowding(stockQuotes, allSectorPEs);
  const diffusion = calcDiffusion(stockQuotes, aboveMA20Map);
  const concentration = calcConcentration(stockQuotes);
  const retail = calcRetailIndex(stockQuotes, prevTurnoverMap);
  const recovery = calcRecovery(ma5, ma20);

  // v2
  const panic = calcPanic(stockQuotes);
  const { result: volatility, amplitudeStd } = calcVolatility(stockQuotes);
  const momIndex = calcMomIndex(stockQuotes, lowPriceTurnoverPct, lowPriceTurnoverPctPrev);
  const searchHeat = calcSearchHeat(conceptTagCount);
  const spreadDegree = calcSpreadDegree(limitUpCount, stockQuotes.length);

  const totalScore = crowding.score + diffusion.score + concentration.score +
    retail.score + recovery.score +
    panic.score + volatility.score + momIndex.score +
    searchHeat.score + spreadDegree.score;
  const maxScore = 200; // 10维度 × 20分

  // 聚合元数据
  const pes = stockQuotes.filter(s => s.pe_ratio > 0).map(s => s.pe_ratio);
  const avgPE = pes.length > 0 ? pes.reduce((a, b) => a + b, 0) / pes.length : 0;
  const medianPE = percentile(pes, 50);

  let aboveCount = 0;
  for (const s of stockQuotes) {
    if (aboveMA20Map.get(s.stock_id)) aboveCount++;
  }
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

  // 恐慌度比例
  const panicCount = stockQuotes.filter(s => s.change_percent < -5).length;
  const panicRatio = stockQuotes.length > 0 ? (panicCount / stockQuotes.length) * 100 : 0;

  // 涨停比例
  const limitUpRatio = stockQuotes.length > 0 ? (limitUpCount / stockQuotes.length) * 100 : 0;

  const result: MultidimV2Result = {
    industry: decodedIndustry,
    totalScore,
    maxScore,
    dimensions: {
      crowding,
      diffusion,
      concentration,
      retail,
      recovery,
      panic,
      volatility,
      momIndex,
      searchHeat,
      spreadDegree,
    },
    metadata: {
      stockCount: stockQuotes.length,
      avgPE,
      medianPE,
      aboveMA20Pct,
      top5TurnoverPct,
      smallCapTurnoverSurge,
      ma5Change: ma5,
      ma20Change: ma20,
      // v2 new
      panicRatio,
      amplitudeStd,
      lowPriceTurnoverPct,
      lowPriceTurnoverPctPrev,
      conceptTagCount,
      limitUpRatio,
    },
  };

  sendSuccess(res, result);
}));

export default router;
