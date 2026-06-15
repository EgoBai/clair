/**
 * 潜力股发现 API
 * 多因子评分模型 — 涨幅×成交×市值×行业景气
 */

import { Router, Request, Response } from 'express';
import { asyncHandler } from '../utils/apiResponse';
import { getDb } from '../db/dbFactory';
import { normalizeSymbol } from '../utils/symbolUtils';

const router = Router();

// 热门行业景气度排序
const HOT_INDUSTRIES = ['电子', '计算机', '电力设备', '国防军工', '通信', '汽车'];

interface StockScore {
  symbol: string;
  name: string;
  price: number;
  changePercent: number;
  turnoverRate: number;
  marketCap: number;
  industry: string;
  score: number;
  momentumScore: number;
  volumeScore: number;
  sizeScore: number;
  industryScore: number;
}

router.post('/ai/gems', asyncHandler(async (req: Request, res: Response) => {
  const { topN = 20, minScore = 40 } = req.body;

  const db = getDb();
  const stocks = await db.connection('stocks')
    .where('is_active', true)
    .whereNotNull('change_percent')
    .whereNotNull('turnover_rate')
    .whereNotNull('market_cap')
    .where('industry', '!=', '综合')
    .where('industry', '!=', '指数')
    .limit(5000);

  const gems: StockScore[] = [];

  // 标准化参数
  let maxChange = 0, maxTurnover = 0, maxCap = 0;
  for (const s of stocks) {
    const change = Math.abs(Number(s.change_percent));
    const turnover = Number(s.turnover_rate);
    const cap = Number(s.market_cap);
    if (change > maxChange) maxChange = change;
    if (turnover > maxTurnover) maxTurnover = turnover;
    if (cap > maxCap) maxCap = cap;
  }
  maxChange = Math.max(maxChange, 1);
  maxTurnover = Math.max(maxTurnover, 1);
  maxCap = Math.max(maxCap, 1);

  for (const s of stocks) {
    const name = String(s.name || '');
    // 跳过ST和退市
    if (name.includes('ST') || name.includes('退市')) continue;

    const changePercent = Number(s.change_percent);
    const turnoverRate = Number(s.turnover_rate);
    const marketCap = Number(s.market_cap);
    const industry = String(s.industry || '');

    // === 4维度评分（0-25分每个） ===
    
    // 动量分：涨幅越大越好（取绝对值评分）
    const momentumScore = Math.min(25, Math.round((Math.abs(changePercent) / maxChange) * 25));
    
    // 成交分：换手率适中（太高或太低都不好）3-15%为最佳区间
    let volumeScore = 0;
    if (turnoverRate >= 3 && turnoverRate <= 15) {
      volumeScore = 25;
    } else if (turnoverRate >= 1 && turnoverRate < 3) {
      volumeScore = Math.round((turnoverRate / 3) * 20);
    } else if (turnoverRate > 15) {
      volumeScore = Math.max(5, Math.round((1 - (turnoverRate - 15) / 30) * 20));
    } else {
      volumeScore = Math.round((turnoverRate / 1) * 10);
    }
    
    // 规模分：中小盘有更大成长空间（50亿-500亿最佳）
    let sizeScore = 0;
    const capYi = marketCap / 1e4; // 转为亿
    if (capYi >= 50 && capYi <= 500) {
      sizeScore = 25;
    } else if (capYi >= 20 && capYi < 50) {
      sizeScore = 20;
    } else if (capYi > 500 && capYi <= 1000) {
      sizeScore = 15;
    } else if (capYi > 1000) {
      sizeScore = 10;
    } else {
      sizeScore = 5;
    }
    
    // 行业分：热门行业加分
    const isHot = HOT_INDUSTRIES.some(hot => industry.includes(hot));
    const industryScore = isHot ? 25 : 15;

    const totalScore = momentumScore + volumeScore + sizeScore + industryScore;

    if (totalScore >= minScore) {
      gems.push({
        symbol: String(s.symbol),
        name,
        price: Number(s.current_price || 0),
        changePercent,
        turnoverRate,
        marketCap,
        industry,
        score: totalScore,
        momentumScore,
        volumeScore,
        sizeScore,
        industryScore,
      });
    }
  }

  // 排序并取TopN
  gems.sort((a, b) => b.score - a.score);
  const topGems = gems.slice(0, topN);

  res.json({
    success: true,
    data: {
      gems: topGems,
      total: gems.length,
      filters: {
        momentum: '涨幅动量评分',
        volume: '成交活跃度评分',
        size: '市值成长空间评分',
        industry: '行业景气度评分',
      },
      scoring: '总分 = 动量(0-25) + 成交(0-25) + 规模(0-25) + 行业(0-25)',
    },
  });
}));

export default router;
