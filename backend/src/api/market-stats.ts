/**
 * 市场统计数据 API
 * 提供涨跌分布、板块热度、市场宽度等聚合数据
 */

import { Router, Request, Response } from 'express';
import { validateQuery, schemas } from '../middleware/validation';

const router = Router();

// ---- 涨跌分布统计 ----
router.get('/distribution', validateQuery(schemas.marketStatsQuery), (req: Request, res: Response) => {
  const distribution = {
    timestamp: new Date().toISOString(),
    total: 5200,
    ranges: [
      { label: '涨停', min: 9.9, max: 10.1, count: Math.floor(Math.random() * 30 + 10), color: '#dc2626' },
      { label: '涨幅>7%', min: 7, max: 9.9, count: Math.floor(Math.random() * 50 + 20), color: '#ef4444' },
      { label: '涨幅5-7%', min: 5, max: 7, count: Math.floor(Math.random() * 80 + 30), color: '#f87171' },
      { label: '涨幅3-5%', min: 3, max: 5, count: Math.floor(Math.random() * 150 + 50), color: '#fca5a5' },
      { label: '涨幅1-3%', min: 1, max: 3, count: Math.floor(Math.random() * 300 + 200), color: '#fecaca' },
      { label: '涨幅0-1%', min: 0, max: 1, count: Math.floor(Math.random() * 400 + 300), color: '#fee2e2' },
      { label: '平盘', min: -0.01, max: 0.01, count: Math.floor(Math.random() * 100 + 50), color: '#9ca3af' },
      { label: '跌幅0-1%', min: -1, max: 0, count: Math.floor(Math.random() * 400 + 300), color: '#d1fae5' },
      { label: '跌幅1-3%', min: -3, max: -1, count: Math.floor(Math.random() * 300 + 200), color: '#a7f3d0' },
      { label: '跌幅3-5%', min: -5, max: -3, count: Math.floor(Math.random() * 150 + 50), color: '#6ee7b7' },
      { label: '跌幅5-7%', min: -7, max: -5, count: Math.floor(Math.random() * 80 + 20), color: '#34d399' },
      { label: '跌幅>7%', min: -10.1, max: -7, count: Math.floor(Math.random() * 50 + 10), color: '#10b981' },
      { label: '跌停', min: -10.1, max: -9.9, count: Math.floor(Math.random() * 20 + 5), color: '#059669' },
    ],
    summary: {
      rising: 0,
      falling: 0,
      unchanged: 0,
      limitUp: 0,
      limitDown: 0,
      avgChange: 0,
    },
  };

  // 计算汇总
  distribution.summary.rising = distribution.ranges
    .filter(r => r.min > 0)
    .reduce((sum, r) => sum + r.count, 0);
  distribution.summary.falling = distribution.ranges
    .filter(r => r.max <= 0 && r.min < -0.01)
    .reduce((sum, r) => sum + r.count, 0);
  distribution.summary.unchanged = distribution.ranges
    .find(r => r.label === '平盘')?.count || 0;
  distribution.summary.limitUp = distribution.ranges.find(r => r.label === '涨停')?.count || 0;
  distribution.summary.limitDown = distribution.ranges.find(r => r.label === '跌停')?.count || 0;

  res.json({ success: true, data: distribution });
});

// ---- 板块热度排行 ----
router.get('/sector-heat', validateQuery(schemas.marketStatsQuery), (req: Request, res: Response) => {
  const sectors = [
    { name: '人工智能', changePercent: 3.5, turnover: 850e8, stockCount: 128, leading: '科大讯飞' },
    { name: '半导体', changePercent: 2.8, turnover: 720e8, stockCount: 95, leading: '中芯国际' },
    { name: '新能源车', changePercent: 2.1, turnover: 650e8, stockCount: 82, leading: '比亚迪' },
    { name: '白酒', changePercent: 1.5, turnover: 480e8, stockCount: 20, leading: '贵州茅台' },
    { name: '医药生物', changePercent: 0.8, turnover: 520e8, stockCount: 156, leading: '恒瑞医药' },
    { name: '银行', changePercent: 0.3, turnover: 380e8, stockCount: 42, leading: '工商银行' },
    { name: '房地产', changePercent: -0.5, turnover: 280e8, stockCount: 112, leading: '万科A' },
    { name: '钢铁', changePercent: -1.2, turnover: 150e8, stockCount: 35, leading: '宝钢股份' },
    { name: '煤炭', changePercent: -1.8, turnover: 200e8, stockCount: 38, leading: '中国神华' },
    { name: '传媒', changePercent: -2.3, turnover: 350e8, stockCount: 68, leading: '分众传媒' },
  ];

  const heatData = sectors.map(s => ({
    ...s,
    heatScore: Math.round((s.changePercent * 0.4 + (s.turnover / 1e10) * 0.4 + s.stockCount * 0.01) * 100) / 100,
    phase: s.changePercent > 2 ? '主升' : s.changePercent > 0 ? '吸筹' : s.changePercent > -1 ? '派发' : '下跌',
  })).sort((a, b) => b.heatScore - a.heatScore);

  res.json({ success: true, data: heatData });
});

// ---- 市场宽度指标 ----
router.get('/breadth', validateQuery(schemas.marketStatsQuery), (req: Request, res: Response) => {
  const advancing = Math.floor(Math.random() * 1000 + 1500);
  const declining = Math.floor(Math.random() * 1000 + 1500);
  const unchanged = 5200 - advancing - declining;

  const breadth = {
    timestamp: new Date().toISOString(),
    advancing,
    declining,
    unchanged: Math.max(0, unchanged),
    adRatio: Math.round((advancing / Math.max(declining, 1)) * 100) / 100,
    newHighs: Math.floor(Math.random() * 50 + 10),
    newLows: Math.floor(Math.random() * 30 + 5),
    aboveMA20: Math.floor(Math.random() * 2000 + 1500),
    aboveMA60: Math.floor(Math.random() * 1500 + 1000),
    aboveMA120: Math.floor(Math.random() * 1200 + 800),
    mcclellan: advancing - declining,
    armsIndex: Math.round((Math.random() * 0.8 + 0.6) * 100) / 100,
  };

  res.json({ success: true, data: breadth });
});

// ---- 市场情绪指标 ----
router.get('/sentiment', validateQuery(schemas.marketStatsQuery), (req: Request, res: Response) => {
  const sentiment = {
    timestamp: new Date().toISOString(),
    greedFearIndex: Math.floor(Math.random() * 40 + 30), // 0-100
    vixEquivalent: Math.round((Math.random() * 15 + 15) * 100) / 100,
    marginBalance: Math.round((Math.random() * 2000 + 15000) * 100) / 100, // 亿
    marginChange: Math.round((Math.random() * 200 - 100) * 100) / 100,
    northboundFlow: Math.round((Math.random() * 100 - 50) * 100) / 100, // 亿
    northbound5d: Math.round((Math.random() * 300 - 150) * 100) / 100,
    turnoverRatio: Math.round((Math.random() * 0.5 + 0.8) * 100) / 100,
    limitUpCount: Math.floor(Math.random() * 40 + 15),
    limitDownCount: Math.floor(Math.random() * 15 + 3),
    hotMoneyFlow: Math.round((Math.random() * 50 - 25) * 100) / 100,
  };

  // 情绪判断
  let mood = 'neutral';
  if (sentiment.greedFearIndex >= 60) mood = 'greedy';
  else if (sentiment.greedFearIndex <= 30) mood = 'fearful';

  res.json({ success: true, data: { ...sentiment, mood } });
});

export default router;
