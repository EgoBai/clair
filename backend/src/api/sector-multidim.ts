/**
 * 板块景气度多维度扩展 API
 * GET /api/sectors/:code/multidim
 * 
 * 5个维度(各0-20分, 总分0-100):
 *   1. 拥挤度 (0-20): PE分位数 vs 行业均值, PE越高越拥挤→分越低
 *   2. 扩散程度 (0-20): 板块内%个股站上MA20, >80%→满分
 *   3. 资金集中度 (0-20): Top5成交占比, 40-60%最佳
 *   4. 小白指数 (0-20): 小市值(<100亿)股换手飙升
 *   5. 回补程度 (0-20): 近5日 vs 近20日动量对比
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
}

interface MultidimResult {
  industry: string;
  totalScore: number;
  dimensions: {
    crowding:      { score: number; label: string; detail: string };
    diffusion:     { score: number; label: string; detail: string };
    concentration: { score: number; label: string; detail: string };
    retail:        { score: number; label: string; detail: string };
    recovery:      { score: number; label: string; detail: string };
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

// ============= 1. 拥挤度 (PE分位数法) =============
function calcCrowding(stocks: StockQuote[], allSectorPEs: number[]): { score: number; label: string; detail: string } {
  const pes = stocks.filter(s => s.pe_ratio > 0 && s.pe_ratio < 1000).map(s => s.pe_ratio);
  if (pes.length === 0) return { score: 10, label: '数据不足', detail: 'PE数据缺失,默认中性分' };

  const medianPE = percentile(pes, 50);
  const avgPE = pes.reduce((a, b) => a + b, 0) / pes.length;

  // PE在行业内的百分位 (越低越好, 说明估值合理)
  const peRank = allSectorPEs.length > 1
    ? allSectorPEs.filter(v => v < medianPE).length / allSectorPEs.length
    : 0.5;

  // 拥挤度: PE分位越高越拥挤 → 分数越低
  // peRank=0 (最低PE) → 满分20; peRank=1 (最高PE) → 0分
  const score = Math.round(20 * (1 - peRank));

  let label: string;
  if (score >= 16) label = '估值舒适';
  else if (score >= 11) label = '估值合理';
  else if (score >= 6) label = '轻度拥挤';
  else label = '高度拥挤';

  const detail = `PE中位=${medianPE.toFixed(1)}, 均值=${avgPE.toFixed(1)}, 行业PE分位=${(peRank * 100).toFixed(0)}%`;

  return { score: Math.max(0, Math.min(20, score)), label, detail };
}

// ============= 2. 扩散程度 (%个股站上MA20) =============
function calcDiffusion(
  stocks: StockQuote[],
  aboveMA20Map: Map<number, boolean>
): { score: number; label: string; detail: string } {
  if (stocks.length === 0) return { score: 10, label: '数据不足', detail: '无个股数据' };

  let aboveCount = 0;
  for (const s of stocks) {
    if (aboveMA20Map.get(s.stock_id)) aboveCount++;
  }

  const pct = (aboveCount / stocks.length) * 100;
  // >80% → 20分, 30-80% → 线性, <30% → 0分
  const score = Math.round(20 * Math.max(0, Math.min(1, (pct - 30) / 50)));

  let label: string;
  if (pct >= 80) label = '全面扩散';
  else if (pct >= 50) label = '半数走强';
  else if (pct >= 30) label = '龙头拉抬';
  else label = '弱势集中';

  const detail = `${aboveCount}/${stocks.length} 个股站上MA20 (${pct.toFixed(0)}%)`;

  return { score: Math.max(0, Math.min(20, score)), label, detail };
}

// ============= 3. 资金集中度 (Top5成交占比) =============
function calcConcentration(stocks: StockQuote[]): { score: number; label: string; detail: string } {
  if (stocks.length < 3) return { score: 10, label: '样本不足', detail: `仅${stocks.length}只个股` };

  const sorted = [...stocks].sort((a, b) => b.turnover - a.turnover);
  const totalTurnover = stocks.reduce((s, st) => s + st.turnover, 0);
  if (totalTurnover === 0) return { score: 10, label: '无成交', detail: '成交额为0' };

  const top5Turnover = sorted.slice(0, Math.min(5, sorted.length))
    .reduce((s, st) => s + st.turnover, 0);
  const pct = (top5Turnover / totalTurnover) * 100;

  // 40-60% 最优 → 20分, 偏离越多 → 分越低
  let score: number;
  if (pct >= 40 && pct <= 60) {
    score = 20;
  } else if (pct < 40) {
    score = Math.round(20 * (pct / 40)); // 0%→0, 40%→20
  } else {
    score = Math.round(20 * Math.max(0, (100 - pct) / 40)); // 100%→0, 60%→20
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

// ============= 4. 小白指数 (小市值换手激增) =============
function calcRetailIndex(
  stocks: StockQuote[],
  prevTurnoverMap: Map<number, number> // stock_id → 上月换手率
): { score: number; label: string; detail: string } {
  const smallCaps = stocks.filter(s => s.market_cap > 0 && s.market_cap < 100 * 1e8); // <100亿
  if (smallCaps.length === 0) return { score: 10, label: '无小盘股', detail: '板块内无<100亿市值个股' };

  let surgeCount = 0;
  let totalChange = 0;
  const surged: string[] = [];

  for (const s of smallCaps) {
    const prev = prevTurnoverMap.get(s.stock_id);
    if (prev && prev > 0 && s.turnover_rate > 0) {
      const ratio = s.turnover_rate / prev;
      totalChange += ratio;
      if (ratio > 1.5) {
        surgeCount++;
        if (surged.length < 3) surged.push(`${s.name}(${(ratio * 100 - 100).toFixed(0)}%)`);
      }
    }
  }

  const surgePct = smallCaps.filter(s => prevTurnoverMap.has(s.stock_id)).length > 0
    ? surgeCount / smallCaps.filter(s => prevTurnoverMap.has(s.stock_id)).length
    : 0;

  // surgePct 0→0分, 0.5→20分 (线性)
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

// ============= 5. 回补程度 (5日 vs 20日动量) =============
function calcRecovery(
  ma5Change: number,
  ma20Change: number
): { score: number; label: string; detail: string } {
  // 短期反弹力度 vs 中期趋势
  const diff = ma5Change - ma20Change;

  let score: number;
  let label: string;

  if (ma20Change >= 0) {
    // 中期向好: 短期加速 → 高分
    if (diff > 3) { score = 20; label = '强势加速'; }
    else if (diff > 0) { score = 16; label = '温和上行'; }
    else if (diff > -3) { score = 12; label = '高位整理'; }
    else { score = 6; label = '短期回调'; }
  } else {
    // 中期偏弱: 短期反弹 → 看回补力度
    if (diff > 5) { score = 18; label = '强力回补'; }
    else if (diff > 2) { score = 14; label = '温和反弹'; }
    else if (diff > 0) { score = 8; label = '弱反弹'; }
    else { score = 2; label = '持续走弱'; }
  }

  const detail = `5日均涨=${ma5Change.toFixed(2)}%, 20日均涨=${ma20Change.toFixed(2)}%, 差值=${diff.toFixed(2)}%`;

  return { score: Math.max(0, Math.min(20, score)), label, detail };
}

// ============= 主路由 =============

router.get('/sectors/:code/multidim', asyncHandler(async (req, res) => {
  const { code: industry } = req.params;
  const decodedIndustry = decodeURIComponent(industry);

  const db = getDb();
  const knex = db.connection;

  // 1. 获取板块内所有活跃股票的ID
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

  // 2. 获取最新行情 (单次查询)
  const latestQuotes = await knex.raw(`
    SELECT DISTINCT ON (stock_id) 
      stock_id, close_price, change_percent, turnover, turnover_rate, 
      market_cap, pe_ratio
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
    });
  });

  const stockQuotes: StockQuote[] = [];
  for (const s of stocks) {
    const q = quoteMap.get(s.id);
    if (q) stockQuotes.push(q);
  }

  // 3. 获取全行业PE (用于拥挤度百分位计算)
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

  // 4. MA20判断: 获取近20个交易日的价格
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

  // 5. 历史换手率 (30天前, 用于小白指数的月度对比)
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

  // 6. 5日和20日动量 (板块级别)
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

  // 7. 计算五个维度
  const crowding = calcCrowding(stockQuotes, allSectorPEs);
  const diffusion = calcDiffusion(stockQuotes, aboveMA20Map);
  const concentration = calcConcentration(stockQuotes);
  const retail = calcRetailIndex(stockQuotes, prevTurnoverMap);
  const recovery = calcRecovery(ma5, ma20);

  const totalScore = crowding.score + diffusion.score + concentration.score + retail.score + recovery.score;

  // 8. 聚合元数据
  const pes = stockQuotes.filter(s => s.pe_ratio > 0).map(s => s.pe_ratio);
  const avgPE = pes.length > 0 ? pes.reduce((a, b) => a + b, 0) / pes.length : 0;
  const medianPE = percentile(pes, 50);

  let aboveCount = 0;
  for (const s of stockQuotes) {
    if (aboveMA20Map.get(s.stock_id)) aboveCount++;
  }
  const aboveMA20Pct = stockQuotes.length > 0 ? (aboveCount / stockQuotes.length) * 100 : 0;

  const sortedByTurnover = [...stockQuotes].sort((a, b) => b.turnover - a.turnover);
  const totalTurnover = stockQuotes.reduce((s, st) => s + st.turnover, 0);
  const top5Turnover = sortedByTurnover.slice(0, 5).reduce((s, st) => s + st.turnover, 0);
  const top5TurnoverPct = totalTurnover > 0 ? (top5Turnover / totalTurnover) * 100 : 0;

  const smallCaps = stockQuotes.filter(s => s.market_cap > 0 && s.market_cap < 100 * 1e8);
  let surgeCount = 0;
  for (const s of smallCaps) {
    const prev = prevTurnoverMap.get(s.stock_id);
    if (prev && prev > 0 && s.turnover_rate / prev > 1.5) surgeCount++;
  }
  const smallCapTurnoverSurge = smallCaps.length > 0 ? surgeCount / smallCaps.length : 0;

  const result: MultidimResult = {
    industry: decodedIndustry,
    totalScore,
    dimensions: { crowding, diffusion, concentration, retail, recovery },
    metadata: {
      stockCount: stockQuotes.length,
      avgPE,
      medianPE,
      aboveMA20Pct,
      top5TurnoverPct,
      smallCapTurnoverSurge,
      ma5Change: ma5,
      ma20Change: ma20,
    },
  };

  sendSuccess(res, result);
}));

export default router;
