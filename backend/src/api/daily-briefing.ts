/**
 * AI 每日简报 API 路由
 * GET /api/ai/daily-briefing
 */

import { Router, Request, Response } from 'express';
import { asyncHandler, sendSuccess } from '../utils/apiResponse';
import { getDb } from '../db/dbFactory';
import { getMarketRegime } from '../services/engineOrchestrator';

const router = Router();

/**
 * GET /api/ai/daily-briefing
 * 获取每日市场简报
 */
router.get('/ai/daily-briefing', asyncHandler(async (_req: Request, res: Response) => {
  const db = getDb();
  const knex = (db as any).connection || (db as any).knexInstance;
  
  // 获取最新交易日
  const latestDate = await knex('daily_quotes')
    .max('trade_date as latest')
    .first();
  
  if (!latestDate?.latest) {
    return sendSuccess(res, { error: 'No data available' });
  }
  
  // 获取市场宽度统计
  const breadth = await knex('daily_quotes as dq')
    .join('stocks as s', 'dq.stock_id', 's.id')
    .where('dq.trade_date', latestDate.latest)
    .select(
      knex.raw('SUM(CASE WHEN dq.change_percent > 0 THEN 1 ELSE 0 END) as up_count'),
      knex.raw('SUM(CASE WHEN dq.change_percent < 0 THEN 1 ELSE 0 END) as down_count'),
      knex.raw('SUM(CASE WHEN dq.change_percent >= 9.9 THEN 1 ELSE 0 END) as limit_up'),
      knex.raw('SUM(CASE WHEN dq.change_percent <= -9.9 THEN 1 ELSE 0 END) as limit_down'),
      knex.raw('COUNT(*) as total'),
      knex.raw('AVG(dq.change_percent) as avg_change'),
      knex.raw('MAX(dq.change_percent) as max_change'),
      knex.raw('MIN(dq.change_percent) as min_change')
    )
    .first();
  
  // 获取涨幅前5
  const topGainers = await knex('daily_quotes as dq')
    .join('stocks as s', 'dq.stock_id', 's.id')
    .where('dq.trade_date', latestDate.latest)
    .select('s.symbol', 's.name', 'dq.change_percent', 'dq.close_price', 'dq.volume')
    .orderBy('dq.change_percent', 'desc')
    .limit(5);
  
  // 获取跌幅前5
  const topLosers = await knex('daily_quotes as dq')
    .join('stocks as s', 'dq.stock_id', 's.id')
    .where('dq.trade_date', latestDate.latest)
    .select('s.symbol', 's.name', 'dq.change_percent', 'dq.close_price', 'dq.volume')
    .orderBy('dq.change_percent', 'asc')
    .limit(5);
  
  // 获取成交量前5
  const topVolume = await knex('daily_quotes as dq')
    .join('stocks as s', 'dq.stock_id', 's.id')
    .where('dq.trade_date', latestDate.latest)
    .select('s.symbol', 's.name', 'dq.change_percent', 'dq.close_price', 'dq.volume', 'dq.turnover')
    .orderBy('dq.turnover', 'desc')
    .limit(5);
  
  // 获取市场状态 (HMM)
  let marketRegime = null;
  try {
    marketRegime = await getMarketRegime();
  } catch (e) {
    // ignore
  }
  
  // 构建简报
  const briefing = {
    date: latestDate.latest,
    marketOverview: {
      totalStocks: breadth?.total || 0,
      upCount: parseInt(breadth?.up_count) || 0,
      downCount: parseInt(breadth?.down_count) || 0,
      limitUp: parseInt(breadth?.limit_up) || 0,
      limitDown: parseInt(breadth?.limit_down) || 0,
      avgChange: parseFloat(breadth?.avg_change) || 0,
      maxChange: parseFloat(breadth?.max_change) || 0,
      minChange: parseFloat(breadth?.min_change) || 0,
    },
    marketRegime: marketRegime ? {
      regime: marketRegime.currentRegime,
      probability: marketRegime.probability,
    } : null,
    topGainers: topGainers.map((s: any) => ({
      symbol: s.symbol,
      name: s.name,
      changePercent: parseFloat(s.change_percent) || 0,
      closePrice: parseFloat(s.close_price) || 0,
    })),
    topLosers: topLosers.map((s: any) => ({
      symbol: s.symbol,
      name: s.name,
      changePercent: parseFloat(s.change_percent) || 0,
      closePrice: parseFloat(s.close_price) || 0,
    })),
    topVolume: topVolume.map((s: any) => ({
      symbol: s.symbol,
      name: s.name,
      changePercent: parseFloat(s.change_percent) || 0,
      closePrice: parseFloat(s.close_price) || 0,
      turnover: parseFloat(s.turnover) || 0,
    })),
    aiSummary: generateAISummary(breadth, marketRegime),
  };
  
  sendSuccess(res, briefing);
}));

/**
 * 生成AI简报摘要
 */
function generateAISummary(breadth: any, regime: any): string {
  const upCount = parseInt(breadth?.up_count) || 0;
  const downCount = parseInt(breadth?.down_count) || 0;
  const total = parseInt(breadth?.total) || 1;
  const avgChange = parseFloat(breadth?.avg_change) || 0;
  const limitUp = parseInt(breadth?.limit_up) || 0;
  const limitDown = parseInt(breadth?.limit_down) || 0;
  
  const ratio = upCount / (downCount || 1);
  const marketSentiment = ratio > 1.5 ? '偏多' : ratio < 0.67 ? '偏空' : '中性';
  
  let summary = `今日市场${marketSentiment}，`;
  summary += `上涨${upCount}家，下跌${downCount}家，涨跌比${ratio.toFixed(2)}。`;
  summary += `平均涨跌${avgChange > 0 ? '+' : ''}${avgChange.toFixed(2)}%。`;
  
  if (limitUp > 0) summary += `涨停${limitUp}家。`;
  if (limitDown > 0) summary += `跌停${limitDown}家。`;
  
  if (regime) {
    const regimeLabels: Record<string, string> = {
      'bull': '牛市',
      'bear': '熊市',
      'sideways': '震荡',
      'volatile': '高波动',
    };
    summary += `HMM模型判断当前处于${regimeLabels[regime.currentRegime] || regime.currentRegime}状态（概率${(regime.probability * 100).toFixed(0)}%）。`;
  }
  
  return summary;
}

export default router;
