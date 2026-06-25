/**
 * 潜力股发现 API v2.0
 * 6因子评分模型 — 动量×成交×估值×规模×行业景气×质量
 * 基于真实市场数据，避免追高和垃圾股
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

router.post('/ai/gems', asyncHandler(async (req: Request, res: Response) => {
  const { topN = 20, minScore = 40 } = req.body;

  const db = getDb();
  
  // 获取板块景气度（动态）
  const sectorScores: Map<string, number> = new Map();
  try {
    const sectors = await db.getSectorMomentumScore();
    sectors.forEach((s: any) => {
      sectorScores.set(s.industry, Number(s.score) || 0);
    });
  } catch { /* 行业动量评分获取失败时降级: sectorScores 保持为空, 不影响主流程 */ }

  // JOIN stocks + latest daily_quotes
  const stocks = await db.connection('stocks as s')
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

  const gems: GemScore[] = [];

  // 注: 评分采用绝对阈值, 无需归一化最大值

  for (const s of stocks) {
    const name = String(s.name || '').trim();
    if (name.includes('ST') || name.includes('退市') || name.includes('*ST')) continue;

    const changePercent = Number(s.change_percent) || 0;
    const turnoverRate = Number(s.turnover_rate) || 0;
    const marketCap = Number(s.market_cap) || 0;
    const peRatio = s.pe_ratio ? Number(s.pe_ratio) : null;
    const industry = String(s.industry || '');
    const capYi = marketCap / 1e4; // 万元→亿

    // ====== 六因子评分 (总分100) ======

    // 1. 动量因子 (0-20): 涨幅适中最佳（3-8%），避免追高
    let momentumScore: number;
    const absChange = Math.abs(changePercent);
    if (absChange >= 3 && absChange <= 8) {
      momentumScore = 20;
    } else if (absChange >= 1.5 && absChange < 3) {
      momentumScore = 15;
    } else if (absChange > 8 && absChange <= 10) {
      momentumScore = 12; // 涨太多降分
    } else if (absChange > 10) {
      momentumScore = 5;  // 涨停追高风险
    } else {
      momentumScore = Math.round((absChange / 3) * 10);
    }

    // 2. 成交活跃因子 (0-20): 换手率3-15%最佳
    let volumeScore: number;
    if (turnoverRate >= 3 && turnoverRate <= 15) {
      volumeScore = 20;
    } else if (turnoverRate >= 1 && turnoverRate < 3) {
      volumeScore = Math.round((turnoverRate / 3) * 15);
    } else if (turnoverRate > 15 && turnoverRate <= 25) {
      volumeScore = Math.round((1 - (turnoverRate - 15) / 10) * 15 + 5);
    } else {
      volumeScore = 5;
    }

    // 3. 估值因子 (0-15): PE在10-40区间，PB合理
    let valuationScore: number;
    if (peRatio && peRatio > 0) {
      if (peRatio >= 10 && peRatio <= 30) {
        valuationScore = 15; // 合理估值
      } else if (peRatio >= 5 && peRatio < 10) {
        valuationScore = 12; // 偏低估值
      } else if (peRatio > 30 && peRatio <= 50) {
        valuationScore = 10; // 略高估
      } else if (peRatio > 50) {
        valuationScore = 5;  // 高估
      } else {
        valuationScore = 8;  // 极低PE可能有陷阱
      }
    } else {
      valuationScore = 7; // 无PE数据（中性）
    }

    // 4. 规模因子 (0-15): 50-500亿最佳成长空间
    let sizeScore: number;
    if (capYi >= 50 && capYi <= 500) {
      sizeScore = 15;
    } else if (capYi >= 20 && capYi < 50) {
      sizeScore = 12;
    } else if (capYi > 500 && capYi <= 1000) {
      sizeScore = 10;
    } else if (capYi > 1000 && capYi <= 3000) {
      sizeScore = 8;
    } else if (capYi > 3000) {
      sizeScore = 5; // 大盘股成长空间有限
    } else {
      sizeScore = 3; // 市值过小风险
    }

    // 5. 产业链景气度因子 (0-15): 从板块数据获取
    const sectorHot = sectorScores.get(industry) || 50; // 默认50分
    const industryScore = Math.round((sectorHot / 100) * 15);

    // 6. 质量因子 (0-15): 排除劣质标的
    let qualityScore = 15; // 基础满分
    if (changePercent > 9.5) qualityScore -= 5; // 接近涨停可能是游资炒作
    if (turnoverRate > 25) qualityScore -= 3; // 过度投机
    if (turnoverRate < 0.5) qualityScore -= 3; // 流动性不足
    if (capYi < 10) qualityScore -= 5; // 市值过小
    if (name.includes('ST') || name.includes('退')) qualityScore = 0;

    const totalScore = momentumScore + volumeScore + valuationScore + sizeScore + industryScore + Math.max(0, qualityScore);

    // 上榜理由 (基于六因子分项的规则化解释，供雷达页展示"为什么有潜力"，不耗LLM/不依赖key)
    const reasons: string[] = [];
    if (momentumScore >= 15) reasons.push('涨势适中不追高');
    if (volumeScore >= 15) reasons.push('成交活跃换手健康');
    if (valuationScore >= 12) reasons.push('估值合理');
    if (sizeScore >= 12) reasons.push('中盘成长空间');
    if (industryScore >= 11) reasons.push('所属板块景气');
    if (Math.max(0, qualityScore) >= 13) reasons.push('质量无瑕疵');

    if (totalScore >= minScore) {
      gems.push({
        symbol: String(s.symbol),
        name,
        price: Number(s.price) || 0,
        changePercent,
        turnoverRate: Math.round(turnoverRate * 100) / 100,
        marketCap: capYi,
        peRatio,
        industry,
        score: totalScore,
        momentumScore,
        volumeScore,
        valuationScore,
        sizeScore,
        industryScore,
        qualityScore: Math.max(0, qualityScore),
        reasons: reasons.slice(0, 3),
      });
    }
  }

  gems.sort((a, b) => b.score - a.score);
  const topGems = gems.slice(0, Math.min(topN, 50));

  res.json({
    success: true,
    data: {
      gems: topGems,
      total: gems.length,
      model: 'v2.0',
      factors: {
        momentum: '涨幅动量(0-20): 3-8%最佳',
        volume: '成交活跃(0-20): 换手3-15%最佳',
        valuation: '估值合理(0-15): PE 10-30最佳',
        size: '成长空间(0-15): 市值50-500亿最佳',
        industry: '行业景气(0-15): 基于板块动量评分',
        quality: '质量过滤(0-15): 排除ST/异常波动',
      },
      scoring: '总分(0-100) = 动量 + 成交 + 估值 + 规模 + 行业 + 质量',
    },
  });
}));

export default router;
