/**
 * AI 智能分析 API 路由
 */

import { Router, Request, Response } from 'express';
import Joi from 'joi';
import { validateQuery } from '../middleware/validation';
import { asyncHandler, sendSuccess, sendNotFound } from '../utils/apiResponse';
import {
  analyzeStock,
  generateRecommendations,
  detectAbnormalEvents,
  analyzeSectorRotation,
} from '../utils/aiAnalysis';

const router = Router();

// 生成模拟数据的辅助
function getMockStocks() {
  const stocks = [
    { symbol: '600519.SH', name: '贵州茅台', industry: '白酒', basePrice: 1920 },
    { symbol: '000858.SZ', name: '五粮液', industry: '白酒', basePrice: 158 },
    { symbol: '300750.SZ', name: '宁德时代', industry: '新能源', basePrice: 215 },
    { symbol: '002594.SZ', name: '比亚迪', industry: '汽车', basePrice: 285 },
    { symbol: '601318.SH', name: '中国平安', industry: '保险', basePrice: 52 },
  ];

  return stocks.map(s => {
    const prices: number[] = [];
    let price = s.basePrice;
    for (let i = 0; i < 60; i++) {
      price += (Math.random() - 0.48) * price * 0.02;
      prices.push(Math.round(price * 100) / 100);
    }
    return {
      ...s,
      prices,
      volumes: Array.from({ length: 60 }, () => Math.floor(Math.random() * 5000000 + 1000000)),
      pe: Math.round(Math.random() * 40 + 10),
      pb: Math.round(Math.random() * 8 + 1),
      roe: Math.round(Math.random() * 30 + 5),
      revenueGrowth: Math.round((Math.random() * 40 - 10) * 10) / 10,
      profitGrowth: Math.round((Math.random() * 50 - 15) * 10) / 10,
      marketCap: Math.round(Math.random() * 20000 + 100),
      changePercent: Math.round((Math.random() * 10 - 5) * 100) / 100,
    };
  });
}

/**
 * GET /api/ai/recommendations
 * AI 选股推荐
 */
router.get('/ai/recommendations', asyncHandler(async (_req: Request, res: Response) => {
  const recommendation = generateRecommendations();
  sendSuccess(res, recommendation);
}));

/**
 * GET /api/ai/analyze/:symbol
 * 单股 AI 分析
 */
router.get('/ai/analyze/:symbol', asyncHandler(async (req: Request, res: Response) => {
  const { symbol } = req.params;
  const stocks = getMockStocks();
  const stock = stocks.find(s => s.symbol === symbol);

  if (!stock) {
    return sendNotFound(res, '股票');
  }

  const analysis = analyzeStock(stock);
  sendSuccess(res, analysis);
}));

/**
 * GET /api/ai/alerts
 * 智能预警列表
 */
const alertQuerySchema = Joi.object({
  severity: Joi.string().valid('high', 'medium', 'low').optional(),
  type: Joi.string().valid(
    'abnormal_volume', 'limit_up', 'limit_down',
    'breakout', 'breakdown', 'macd_cross', 'rsi_extreme', 'sector_rotation'
  ).optional(),
  limit: Joi.number().integer().min(1).max(50).default(20),
});

router.get('/ai/alerts', validateQuery(alertQuerySchema), asyncHandler(async (req: Request, res: Response) => {
  const { severity, type, limit } = req.query as Record<string, string | undefined>;

  let alerts = detectAbnormalEvents();

  if (severity) {
    alerts = alerts.filter(a => a.severity === severity);
  }
  if (type) {
    alerts = alerts.filter(a => a.type === type);
  }

  alerts = alerts.slice(0, Number(limit));

  sendSuccess(res, {
    alerts,
    total: alerts.length,
    generatedAt: new Date().toISOString(),
  });
}));

/**
 * GET /api/ai/sector-rotation
 * 行业轮动分析
 */
router.get('/ai/sector-rotation', asyncHandler(async (_req: Request, res: Response) => {
  const rotation = analyzeSectorRotation();

  sendSuccess(res, {
    sectors: rotation,
    leading: rotation.filter(s => s.currentPhase === 'leading'),
    lagging: rotation.filter(s => s.currentPhase === 'lagging'),
    analyzedAt: new Date().toISOString(),
  });
}));

/**
 * GET /api/ai/market-sentiment
 * 市场情绪综合分析
 */
router.get('/ai/market-sentiment', asyncHandler(async (_req: Request, res: Response) => {
  const stocks = getMockStocks();
  const analyses = stocks.map(s => analyzeStock(s));

  const avgScore = analyses.reduce((a, s) => a + s.totalScore, 0) / analyses.length;
  const bullishCount = analyses.filter(s => s.recommendation === 'strong_buy' || s.recommendation === 'buy').length;
  const bearishCount = analyses.filter(s => s.recommendation === 'sell' || s.recommendation === 'strong_sell').length;

  let sentiment: string;
  let sentimentScore: number;

  if (avgScore > 65) {
    sentiment = '极度乐观';
    sentimentScore = 80;
  } else if (avgScore > 55) {
    sentiment = '偏乐观';
    sentimentScore = 60;
  } else if (avgScore > 45) {
    sentiment = '中性';
    sentimentScore = 50;
  } else if (avgScore > 35) {
    sentiment = '偏悲观';
    sentimentScore = 40;
  } else {
    sentiment = '极度悲观';
    sentimentScore = 20;
  }

  sendSuccess(res, {
    sentiment,
    sentimentScore,
    avgScore: Math.round(avgScore),
    bullishCount,
    bearishCount,
    neutralCount: analyses.length - bullishCount - bearishCount,
    topBullish: analyses
      .filter(s => s.recommendation === 'strong_buy' || s.recommendation === 'buy')
      .sort((a, b) => b.totalScore - a.totalScore)
      .slice(0, 3)
      .map(s => ({ symbol: s.symbol, name: s.name, score: s.totalScore, recommendation: s.recommendation })),
    topBearish: analyses
      .filter(s => s.recommendation === 'sell' || s.recommendation === 'strong_sell')
      .sort((a, b) => a.totalScore - b.totalScore)
      .slice(0, 3)
      .map(s => ({ symbol: s.symbol, name: s.name, score: s.totalScore, recommendation: s.recommendation })),
    analyzedAt: new Date().toISOString(),
  });
}));

export default router;
