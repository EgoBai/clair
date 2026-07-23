/**
 * 潜力股发现 API v3.0
 * 百分位排序法 + 幂次拉开顶部 + 负向因子
 * 从 4000+ 无效筛选 → Top100 真正潜力股
 */

import { Router, Request, Response } from 'express';
import { asyncHandler } from '../utils/apiResponse';
import { getDb } from '../db/dbFactory';

const router = Router();

interface GemScore {
  symbol: string;
  name: string;
  price: number;
  changePercent: number;
  turnoverRate: number;
  marketCap: number;
  peRatio: number | null;
  industry: string;
  score: number;
  momentumScore: number;
  volumeScore: number;
  valuationScore: number;
  sizeScore: number;
  industryScore: number;
  qualityScore: number;
  reasons: string[];
}

/**
 * 百分位评分: 线性 + 可选幂次拉开顶部
 * 线性: score = round(percentile * maxScore)
 * 幂次=1.0时即线性; >1.0拉开高分段差距
 */
function computePercentileScores(
  rawValues: number[],
  maxScore: number,
  powerExponent: number = 1.0
): number[] {
  const n = rawValues.length;
  if (n === 0) return [];
  if (n === 1) return [Math.round(maxScore * 0.5)];

  const indexed = rawValues.map((v, i) => ({ v, i }));
  indexed.sort((a, b) => a.v - b.v);

  const scores = new Array(n).fill(0);
  for (let rank = 0; rank < n; rank++) {
    const percentile = rank / (n - 1);
    // 幂次变换: p^exponent, 指数>1拉开顶部
    const adjPercentile = Math.pow(percentile, powerExponent);
    scores[indexed[rank].i] = Math.round(adjPercentile * maxScore);
  }
  return scores;
}

interface StockRaw {
  symbol: string;
  name: string;
  price: number;
  changePercent: number;
  turnoverRate: number;
  marketCap: number;
  peRatio: number | null;
  industry: string;
  momentumRaw: number;
  volumeRaw: number;
  valuationRaw: number;
  sizeRaw: number;
}

router.post('/ai/gems', asyncHandler(async (req: Request, res: Response) => {
  const { topN = 100, minScore = 80 } = req.body;

  const db = getDb();

  // 板块景气度
  const sectorScores: Map<string, number> = new Map();
  try {
    const sectors = await db.getSectorMomentumScore();
    sectors.forEach((s: any) => {
      sectorScores.set(s.industry, Number(s.score) || 0);
    });
  } catch { /* 降级 */ }

  const stocks = await (db.connection as any)('stocks as s')
    .leftJoin('daily_quotes as dq', function(this: any) {
      this.on('s.id', '=', 'dq.stock_id')
        .andOn('dq.trade_date', '=', db.connection.raw(
          '(SELECT MAX(trade_date) FROM daily_quotes WHERE stock_id = s.id)'
        ));
    })
    .where('s.is_active', true)
    .whereNotNull('dq.change_percent')
    .whereNot('s.industry', '综合')
    .whereNot('s.industry', '指数')
    .select(
      's.symbol', 's.name', 's.industry',
      'dq.close_price as price',
      'dq.change_percent',
      'dq.turnover_rate',
      'dq.market_cap',
      's.pe_ratio'
    )
    .limit(5000);

  // ====== 阶段1: 收集原始数据 ======
  const rawStocks: StockRaw[] = [];

  for (const s of stocks) {
    const name = String(s.name || '').trim();
    if (name.includes('ST') || name.includes('退市') || name.includes('*ST')) continue;

    const changePercent = Number(s.change_percent) || 0;
    const turnoverRate = Number(s.turnover_rate) || 0;
    const marketCap = Number(s.market_cap) || 0;
    const peRatio = s.pe_ratio ? Number(s.pe_ratio) : null;
    const industry = String(s.industry || '');
    const capYi = marketCap / 1e4;

    // 动量: 涨幅越高越好
    const momentumRaw = changePercent;

    // 成交: 距离理想换手(9%)越近越好
    const volumeRaw = -Math.abs(turnoverRate - 9);

    // 估值: PE越低越好, 对数距离PE=15
    let valuationRaw: number;
    if (peRatio !== null && peRatio > 0) {
      valuationRaw = -Math.abs(Math.log10(peRatio) - Math.log10(15));
    } else if (peRatio !== null && peRatio <= 0) {
      valuationRaw = -5;
    } else {
      valuationRaw = -0.8;
    }

    // 规模: 对数距离理想市值 ~158亿
    const logCap = Math.log10(Math.max(1, capYi));
    const sizeRaw = -Math.abs(logCap - Math.log10(158));

    rawStocks.push({
      symbol: String(s.symbol), name,
      price: Number(s.price) || 0,
      changePercent,
      turnoverRate: Math.round(turnoverRate * 100) / 100,
      marketCap: capYi, peRatio, industry,
      momentumRaw, volumeRaw, valuationRaw, sizeRaw,
    });
  }

  const totalCount = rawStocks.length;

  // ====== 阶段2: 百分位评分 (幂次=1.3 拉开顶部差距) ======
  const POWER = 1.1;
  const momentumScores  = computePercentileScores(rawStocks.map(s => s.momentumRaw), 20, POWER);
  const volumeScores    = computePercentileScores(rawStocks.map(s => s.volumeRaw), 20, POWER);
  const valuationScores = computePercentileScores(rawStocks.map(s => s.valuationRaw), 15, POWER);
  const sizeScores      = computePercentileScores(rawStocks.map(s => s.sizeRaw), 15, POWER);

  // ====== 阶段3: 合成总分 + 负向因子 ======
  const gems: GemScore[] = [];
  const allScoresDist: number[] = [];

  for (let i = 0; i < rawStocks.length; i++) {
    const s = rawStocks[i];
    const momentumScore  = momentumScores[i];
    const volumeScore    = volumeScores[i];
    const valuationScore = valuationScores[i];
    const sizeScore      = sizeScores[i];

    // 行业景气
    const sectorHot = sectorScores.get(s.industry) || 50;
    const industryScore = Math.round((sectorHot / 100) * 15);

    // 质量因子 (减法)
    let qualityScore = 15;
    if (s.changePercent > 9.5) qualityScore -= 5;
    if (s.turnoverRate > 25) qualityScore -= 3;
    if (s.turnoverRate < 0.5) qualityScore -= 3;
    if (s.marketCap < 10) qualityScore -= 5;

    // 负向惩罚
    let penalty = 0;
    if (s.changePercent < -3) penalty += 10;
    if (s.peRatio !== null && s.peRatio > 100) penalty += 5;
    if (s.peRatio !== null && s.peRatio < 0) penalty += 8;

    const rawTotal = momentumScore + volumeScore + valuationScore + sizeScore
                   + industryScore + Math.max(0, qualityScore) - penalty;

    // 钳制 30-98
    const totalScore = Math.max(30, Math.min(98, rawTotal));
    allScoresDist.push(totalScore);

    // 上榜理由
    const reasons: string[] = [];
    const pctLabel = (score: number, max: number) =>
      max > 0 && score >= max * 0.85 ? 'top15%' :
      score >= max * 0.7 ? 'top30%' : '';

    const ml = pctLabel(momentumScore, 20);
    const vl = pctLabel(volumeScore, 20);
    const val = pctLabel(valuationScore, 15);
    const sl = pctLabel(sizeScore, 15);

    if (ml) reasons.push(`动量${ml} ${s.changePercent > 0 ? '+' : ''}${s.changePercent.toFixed(1)}%`);
    if (vl) reasons.push(`成交${vl} 换手${s.turnoverRate.toFixed(1)}%`);
    if (val) reasons.push(s.peRatio ? `估值${val} PE${s.peRatio.toFixed(0)}` : '估值合理');
    if (sl) reasons.push(`规模${sl} ${s.marketCap.toFixed(0)}亿`);
    if (industryScore >= 12) reasons.push(s.industry ? `行业景气 ${s.industry}` : '行业景气');
    if (Math.max(0, qualityScore) >= 12) reasons.push('质量优良');
    if (penalty > 0) reasons.push(`⚠️扣分${penalty}`);

    if (totalScore >= minScore) {
      gems.push({
        symbol: s.symbol, name: s.name,
        price: s.price, changePercent: s.changePercent,
        turnoverRate: s.turnoverRate,
        marketCap: s.marketCap, peRatio: s.peRatio,
        industry: s.industry,
        score: totalScore,
        momentumScore, volumeScore, valuationScore,
        sizeScore, industryScore,
        qualityScore: Math.max(0, qualityScore),
        reasons: reasons.slice(0, 3),
      });
    }
  }

  gems.sort((a, b) => b.score - a.score);
  const topGems = gems.slice(0, Math.min(topN, 200));

  // ====== 全市场分布统计 ======
  const buckets = { '90+': 0, '80-89': 0, '70-79': 0, '60-69': 0, '50-59': 0, '40-49': 0, '30-39': 0 };
  for (const s of allScoresDist) {
    if (s >= 90) buckets['90+']++;
    else if (s >= 80) buckets['80-89']++;
    else if (s >= 70) buckets['70-79']++;
    else if (s >= 60) buckets['60-69']++;
    else if (s >= 50) buckets['50-59']++;
    else if (s >= 40) buckets['40-49']++;
    else buckets['30-39']++;
  }

  const over80 = buckets['90+'] + buckets['80-89'];

  // ====== AI 摘要 ======
  const avgTopScore = topGems.length > 0
    ? (topGems.reduce((sum, g) => sum + g.score, 0) / topGems.length).toFixed(1)
    : '0';
  const topIndustries = [...new Set(topGems.map(g => g.industry).filter(Boolean))].slice(0, 5);
  const highMomentum = topGems.filter(g => g.momentumScore >= 15).length;
  const highVolume = topGems.filter(g => g.volumeScore >= 15).length;
  const midCap = topGems.filter(g => g.sizeScore >= 10).length;

  const today = new Date().toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric' });
  const aiSummary = [
    `📊 **${today} 潜力股雷达扫描报告**`,
    ``,
    `全市场 ${totalCount} 只标的，百分位模型 v3.0 扫描：`,
    `≥${minScore}分: **${gems.length}** 只（前 ${((gems.length/totalCount)*100).toFixed(1)}%）`,
    `≥80分（优质）: **${over80}** 只（前 ${((over80/totalCount)*100).toFixed(1)}%）`,
    ``,
    `**📈 全市场分布：**`,
    `  90+: ${buckets['90+']}  |  80-89: ${buckets['80-89']}  |  70-79: ${buckets['70-79']}`,
    `  60-69: ${buckets['60-69']}  |  50-59: ${buckets['50-59']}  |  40-49: ${buckets['40-49']}  |  30-39: ${buckets['30-39']}`,
    ``,
    `**🔥 Top${Math.min(topN, 200)} 特征（均分 ${avgTopScore}）：**`,
    `• 动量强势(top15%): ${highMomentum} 只`,
    `• 成交活跃(top15%): ${highVolume} 只`,
    `• 中盘成长: ${midCap} 只`,
    `• 热点行业: ${topIndustries.join('、') || '分散'}`,
    ``,
    `**💡 模型 v3.0：** 6因子百分位排序 + 幂次变换拉大区分度`,
    `负向惩罚：跌>3%(-10) | PE>100(-5) | 亏损(-8)`,
    `⚠️ 量化筛选结果，不构成投资建议。`,
  ].join('\n');

  res.json({
    success: true,
    data: {
      gems: topGems,
      total: gems.length,
      model: 'v3.0',
      distribution: buckets,
      over80,
      aiSummary,
      factors: {
        momentum: '动量(0-20): 涨幅百分位排名,幂次拉开',
        volume: '成交(0-20): 换手距理想区间百分位',
        valuation: '估值(0-15): PE百分位(低PE优)',
        size: '规模(0-15): 市值距理想区间百分位',
        industry: '行业(0-15): 板块动量景气度',
        quality: '质量(0-15): 减法扣分(追高/投机/微型)',
        penalty: '负向: 跌>3%(-10) PE>100(-5) 亏损(-8)',
      },
      scoring: '总分(30-98) = Σ百分位分 + 行业 + 质量 - 负向惩罚',
    },
  });
}));

export default router;
