/**
 * AI 个股诊断引擎（诚实数据版）
 *
 * 替换原 ai-stock-selection.ts 中基于 Math.random 的伪随机评分。
 * 各维度评分严格来自真实数据：
 *   - 动量(momentum)   : 近 20 日真实收益率 → 0~100
 *   - 技术面(technical) : 真实日线 RSI(14) → 0~100
 *   - 基本面(fundamental): 真实财报 ROE → 0~100
 *   - 估值(valuation)   : 真实市净率(PB) → 0~100（越低越便宜分越高）
 *
 * 任一维度真实数据不可得 → 该维度不计入（绝不伪造/随机填充）。
 * 全部维度均无真实数据 → dataSource:'unavailable'，totalScore 置 null，不生成假评分。
 */

import { getDb } from '../db/dbFactory';
import { calculateRSI } from '../indicators/technical';
import { getFinancialIndicators } from './financialsDataService';

export interface DimensionScore {
  name: string;
  key: string;
  score: number | null;
  weight: number;
}

export interface DiagnosisResult {
  symbol: string;
  totalScore: number | null;
  rating: string;
  dimensions: DimensionScore[];
  strengths: string[];
  risks: string[];
  suggestion: string;
  dataSource: 'real' | 'unavailable';
  note: string;
  updatedAt: string;
}

function clamp(v: number, lo = 0, hi = 100): number {
  return Math.max(lo, Math.min(hi, v));
}

function mapRange(v: number, inLo: number, inHi: number, outLo = 0, outHi = 100): number {
  if (inHi === inLo) return outLo;
  const t = (v - inLo) / (inHi - inLo);
  return clamp(outLo + t * (outHi - outLo));
}

/**
 * 将 API 传入的多种符号格式归一化为数据库存储格式（CODE.SH / CODE.SZ / CODE.BJ）。
 * 数据库 stocks.symbol 以 '600519.SH' 形式存储（见 multiSignalEngine.normalizeSymbol 注释）。
 * 前端 diagnose 路由传入的是原始 6 位代码（如 600519），须转换后再 JOIN 查询，
 * 否则 WHERE s.symbol='600519' 取不到日线 → 动量/技术面/估值维度全部缺失。
 */
function toDbSymbol(symbol: string): string {
  const t = (symbol || '').trim().toUpperCase();
  if (t.includes('.SH') || t.includes('.SZ') || t.includes('.BJ')) return t;
  let digits = t.replace(/^(SH|SZ|BJ)/, '');
  digits = digits.replace(/[^0-9]/g, '');
  if (!digits) return symbol;
  if (digits.startsWith('6')) return `${digits}.SH`;
  if (digits.startsWith('0') || digits.startsWith('3') || digits.startsWith('2')) return `${digits}.SZ`;
  if (digits.startsWith('4') || digits.startsWith('8')) return `${digits}.BJ`;
  return `${digits}.SZ`;
}

interface Quotes {
  closes: number[]; // 升序
  pb: number | null;
  pe: number | null;
}

async function fetchQuotes(symbol: string): Promise<Quotes | null> {
  let db: any;
  try {
    db = getDb();
  } catch {
    return null; // 数据库未初始化 → 优雅降级，不抛出 500
  }
  const knex = db.connection || db.knexInstance;
  if (!knex || typeof knex.raw !== 'function') return null;
  // 同时以「原始符号」与「DB 格式符号」匹配，兼容不同存储约定，避免取不到日线。
  const dbSymbol = toDbSymbol(symbol);
  const rows: any = await knex.raw(
    `SELECT dq.close_price, dq.pe_ratio, dq.pb_ratio
     FROM daily_quotes dq
     JOIN stocks s ON dq.stock_id = s.id
     WHERE s.symbol IN (?, ?) AND s.is_active = true
     ORDER BY dq.trade_date DESC
     LIMIT 130`,
    [symbol, dbSymbol],
  );
  const arr: any[] = Array.isArray(rows) ? rows : rows.rows ?? [];
  if (!Array.isArray(arr) || arr.length === 0) return null;
  const closes = arr
    .map((r: any) => Number(r.close_price))
    .filter((v: number) => Number.isFinite(v));
  if (closes.length === 0) return null;
  const pb = arr[0].pb_ratio != null ? Number(arr[0].pb_ratio) : null;
  const pe = arr[0].pe_ratio != null ? Number(arr[0].pe_ratio) : null;
  return { closes, pb, pe };
}

export async function buildRealDiagnosis(symbol: string): Promise<DiagnosisResult> {
  const dims: DimensionScore[] = [];
  const strengths: string[] = [];
  const risks: string[] = [];

  // 1) 行情数据 → 动量 + 技术面(RSI)
  let quotes: Quotes | null = null;
  try {
    quotes = await fetchQuotes(symbol);
  } catch {
    quotes = null;
  }

  if (quotes && quotes.closes.length >= 15) {
    const asc = quotes.closes.slice().reverse(); // DESC → ASC

    // 动量：近 20 日收益率
    const n = Math.min(20, asc.length - 1);
    const retPct = (asc[asc.length - 1] / asc[asc.length - 1 - n] - 1) * 100;
    const momentumScore = Math.round(mapRange(retPct, -15, 15, 0, 100));
    dims.push({ name: '动量', key: 'momentum', score: momentumScore, weight: 0.2 });
    if (momentumScore >= 70) strengths.push('近 20 日价格动量较强');
    if (momentumScore <= 40) risks.push('近 20 日价格动量偏弱');

    // 技术面：RSI(14)
    const rsiArr = calculateRSI(asc, 14);
    const rsi = rsiArr[rsiArr.length - 1];
    if (rsi != null && Number.isFinite(rsi)) {
      const technicalScore = Math.round(clamp(rsi));
      dims.push({ name: '技术面', key: 'technical', score: technicalScore, weight: 0.25 });
      if (technicalScore >= 70) strengths.push('RSI 处强势区，技术面向好');
      if (technicalScore <= 30) risks.push('RSI 进入超卖区，技术面承压');
    }
  }

  // 2) 财务数据 → 基本面(ROE) + 估值(PB)
  try {
    const fins = await getFinancialIndicators(symbol, 1, 'annual');
    if (fins && fins.length) {
      const f = fins[0];
      if (f.roe != null && Number.isFinite(f.roe)) {
        const fundScore = Math.round(mapRange(f.roe, 0, 25, 0, 100));
        dims.push({ name: '基本面', key: 'fundamental', score: fundScore, weight: 0.3 });
        if (f.roe >= 15) strengths.push(`ROE ${f.roe.toFixed(1)}%，盈利能力较强`);
        if (f.roe < 8) risks.push(`ROE 仅 ${f.roe.toFixed(1)}%，盈利偏弱`);
      }
      // 估值：优先用行情 PB，降级用 现价 / 每股净资产(bps)
      let pb = quotes?.pb ?? null;
      if ((pb == null || !(pb > 0)) && f.bps > 0 && quotes && quotes.closes.length) {
        const pbCalc = quotes.closes[0] / f.bps;
        if (Number.isFinite(pbCalc) && pbCalc > 0) pb = pbCalc;
      }
      if (pb != null && pb > 0) {
        const valScore = Math.round(mapRange(pb, 1, 8, 100, 0)); // PB 越低越便宜 → 高分
        dims.push({ name: '估值', key: 'valuation', score: valScore, weight: 0.15 });
        if (pb < 2) strengths.push(`市净率 ${pb.toFixed(2)} 倍，估值偏低`);
        if (pb > 5) risks.push(`市净率 ${pb.toFixed(2)} 倍，估值偏高`);
      }
    }
  } catch {
    // 财务源不可用 → 该维度缺失，不伪造
  }

  // 全部维度均无真实数据 → 诚实标注 unavailable
  if (dims.length === 0) {
    return {
      symbol,
      totalScore: null,
      rating: '暂无数据',
      dimensions: [],
      strengths: [],
      risks: [],
      suggestion: '暂无可用的真实行情或财务数据，无法生成诊断评分。',
      dataSource: 'unavailable',
      note: '当前个股缺乏真实日线/财务数据，按诚实数据原则不生成随机评分。',
      updatedAt: new Date().toISOString(),
    };
  }

  // 加权总分（按可用维度重新归一化权重）
  const totalW = dims.reduce((s, d) => s + d.weight, 0);
  const totalScore = Math.round(
    dims.reduce((s, d) => s + (d.score ?? 0) * d.weight, 0) / totalW,
  );
  const rating =
    totalScore >= 85 ? '强烈推荐' : totalScore >= 70 ? '推荐' : totalScore >= 55 ? '中性' : '谨慎';
  const suggestion =
    totalScore >= 70
      ? '综合评分基于真实行情与财务数据，可适当关注，注意控制仓位'
      : totalScore >= 55
        ? '综合评分中等，建议结合更多维度判断'
        : '综合评分偏低，建议观望或小仓位参与';

  return {
    symbol,
    totalScore,
    rating,
    dimensions: dims.map((d) => ({ name: d.name, key: d.key, score: d.score, weight: d.weight })),
    strengths,
    risks,
    suggestion,
    dataSource: 'real',
    note: `基于真实数据计算（动量/技术面来自日线，基本面/估值来自财报与行情），覆盖 ${dims.length} 个维度。`,
    updatedAt: new Date().toISOString(),
  };
}
