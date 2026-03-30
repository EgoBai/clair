/**
 * ETF 数据 API
 * 提供 ETF 列表、净值、折溢价率、持仓明细
 * 参考 天天基金/蛋卷基金 数据展示
 */

import { Router, Request, Response } from 'express';
import { validateQuery, validateParams, schemas } from '../middleware/validation';
import { asyncHandler, sendSuccess, sendNotFound, sendInternalError } from '../utils/apiResponse';

const router = Router();

// 模拟 ETF 数据
const etfList = [
  { symbol: '510300', name: '沪深300ETF', type: 'index', benchmark: '沪深300', nav: 4.562, preNav: 4.528, changePercent: 0.75, premiumRate: 0.12, totalAssets: 520e8, trackingError: 0.03, dividendYield: 2.1, expenseRatio: 0.15, volume: 85000000, turnover: 38.5e8, holdings: 300 },
  { symbol: '510500', name: '中证500ETF', type: 'index', benchmark: '中证500', nav: 6.215, preNav: 6.178, changePercent: 0.60, premiumRate: -0.05, totalAssets: 380e8, trackingError: 0.04, dividendYield: 1.8, expenseRatio: 0.15, volume: 62000000, turnover: 25.2e8, holdings: 500 },
  { symbol: '159915', name: '创业板ETF', type: 'index', benchmark: '创业板指', nav: 2.135, preNav: 2.102, changePercent: 1.57, premiumRate: 0.08, totalAssets: 280e8, trackingError: 0.05, dividendYield: 0.8, expenseRatio: 0.15, volume: 120000000, turnover: 42.3e8, holdings: 100 },
  { symbol: '588000', name: '科创50ETF', type: 'index', benchmark: '科创50', nav: 1.085, preNav: 1.072, changePercent: 1.21, premiumRate: 0.15, totalAssets: 180e8, trackingError: 0.06, dividendYield: 0.5, expenseRatio: 0.20, volume: 95000000, turnover: 18.6e8, holdings: 50 },
  { symbol: '512000', name: '券商ETF', type: 'sector', benchmark: '证券公司', nav: 0.952, preNav: 0.948, changePercent: 0.42, premiumRate: -0.10, totalAssets: 120e8, trackingError: 0.08, dividendYield: 1.2, expenseRatio: 0.50, volume: 75000000, turnover: 12.8e8, holdings: 50 },
  { symbol: '512880', name: '证券ETF', type: 'sector', benchmark: '证券公司', nav: 1.128, preNav: 1.122, changePercent: 0.53, premiumRate: 0.05, totalAssets: 350e8, trackingError: 0.04, dividendYield: 1.5, expenseRatio: 0.50, volume: 110000000, turnover: 32.5e8, holdings: 50 },
  { symbol: '515030', name: '新能源ETF', type: 'sector', benchmark: '新能源指数', nav: 1.856, preNav: 1.823, changePercent: 1.81, premiumRate: 0.22, totalAssets: 95e8, trackingError: 0.07, dividendYield: 0.6, expenseRatio: 0.50, volume: 55000000, turnover: 15.3e8, holdings: 50 },
  { symbol: '159766', name: '旅游ETF', type: 'sector', benchmark: '旅游指数', nav: 0.875, preNav: 0.882, changePercent: -0.79, premiumRate: -0.15, totalAssets: 25e8, trackingError: 0.10, dividendYield: 0.3, expenseRatio: 0.50, volume: 18000000, turnover: 3.2e8, holdings: 30 },
  { symbol: '513100', name: '纳指ETF', type: 'qdii', benchmark: '纳斯达克100', nav: 1.562, preNav: 1.548, changePercent: 0.90, premiumRate: 2.35, totalAssets: 220e8, trackingError: 0.12, dividendYield: 0.4, expenseRatio: 0.60, volume: 85000000, turnover: 28.6e8, holdings: 100 },
  { symbol: '518880', name: '黄金ETF', type: 'commodity', benchmark: 'Au99.99', nav: 5.428, preNav: 5.410, changePercent: 0.33, premiumRate: 0.02, totalAssets: 160e8, trackingError: 0.01, dividendYield: 0, expenseRatio: 0.20, volume: 42000000, turnover: 22.8e8, holdings: 1 },
];

/**
 * 获取 ETF 列表
 * GET /api/etf/list
 */
router.get('/list', validateQuery(schemas.etfListQuery), (req: Request, res: Response) => {
  const { type, sortBy = 'totalAssets', sortOrder = 'desc' } = req.query;
  let data = [...etfList];
  if (type) data = data.filter(e => e.type === type);
  data.sort((a: any, b: any) => {
    const aVal = a[sortBy as string] ?? 0;
    const bVal = b[sortBy as string] ?? 0;
    return sortOrder === 'desc' ? bVal - aVal : aVal - bVal;
  });
  res.json({ success: true, data, count: data.length });
});

/**
 * 获取 ETF 详情
 * GET /api/etf/:symbol
 */
router.get('/:symbol', validateParams(schemas.etfSymbol), (req: Request, res: Response) => {
  const etf = etfList.find(e => e.symbol === req.params.symbol);
  if (!etf) return res.status(404).json({ success: false, error: 'ETF 未找到' });
  // 模拟持仓明细
  const topHoldings = [
    { name: '贵州茅台', weight: 5.2, change: 0.1 },
    { name: '宁德时代', weight: 3.8, change: -0.2 },
    { name: '招商银行', weight: 3.5, change: 0.3 },
    { name: '比亚迪', weight: 3.2, change: 0.0 },
    { name: '中国平安', weight: 2.9, change: -0.1 },
  ];
  res.json({
    success: true,
    data: { ...etf, topHoldings },
  });
});

/**
 * 获取 ETF 净值历史
 * GET /api/etf/:symbol/nav-history
 */
router.get('/:symbol/nav-history', validateParams(schemas.etfSymbol), validateQuery(schemas.etfNavHistory), (req: Request, res: Response) => {
  const etf = etfList.find(e => e.symbol === req.params.symbol);
  if (!etf) return res.status(404).json({ success: false, error: 'ETF 未找到' });
  const days = parseInt(req.query.days as string) || 30;
  const history = [];
  let nav = etf.nav;
  for (let i = days - 1; i >= 0; i--) {
    const date = new Date();
    date.setDate(date.getDate() - i);
    nav += (Math.random() - 0.48) * 0.03;
    history.push({
      date: date.toISOString().split('T')[0],
      nav: +nav.toFixed(4),
      accNav: +(nav * (1 + Math.random() * 0.001)).toFixed(4),
      changePercent: +((Math.random() - 0.48) * 3).toFixed(2),
    });
  }
  res.json({ success: true, data: { symbol: etf.symbol, name: etf.name, history } });
});

/**
 * ETF 折溢价排行
 * GET /api/etf/premium/rank
 */
router.get('/premium/rank', (_req: Request, res: Response) => {
  const sorted = [...etfList].sort((a, b) => b.premiumRate - a.premiumRate);
  res.json({
    success: true,
    data: {
      premium: sorted.slice(0, 5).map(e => ({ symbol: e.symbol, name: e.name, premiumRate: e.premiumRate })),
      discount: sorted.slice(-5).reverse().map(e => ({ symbol: e.symbol, name: e.name, premiumRate: e.premiumRate })),
    },
  });
});

export default router;
