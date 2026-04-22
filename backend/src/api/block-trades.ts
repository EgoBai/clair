/**
 * 大宗交易 API
 * 参考东方财富大宗交易数据
 */

import { Router, Request, Response } from 'express';
import { queryCache } from '../utils/queryCache';
import { validateQuery, validateParams, schemas } from '../middleware/validation';
import { asyncHandler, sendSuccess, sendPaginated } from '../utils/apiResponse';

const router = Router();

// 模拟大宗交易数据生成
function generateBlockTrades(date?: string, symbol?: string) {
  const tradeDate = date || new Date().toISOString().split('T')[0];
  const stocks = symbol
    ? [{ symbol, name: '指定股票' }]
    : [
        { symbol: '600519', name: '贵州茅台' },
        { symbol: '000858', name: '五粮液' },
        { symbol: '601318', name: '中国平安' },
        { symbol: '000333', name: '美的集团' },
        { symbol: '600036', name: '招商银行' },
        { symbol: '002594', name: '比亚迪' },
        { symbol: '300750', name: '宁德时代' },
        { symbol: '601899', name: '紫金矿业' },
        { symbol: '002475', name: '立讯精密' },
        { symbol: '600276', name: '恒瑞医药' },
      ];

  const buyers = [
    '机构专用', '中信证券上海分公司', '华泰证券深圳益田路',
    '国泰君安上海江苏路', '招商证券深圳蛇口', '中金公司上海分公司',
    '广发证券广州天河路', '海通证券上海崮山路', '申万宏源上海黄浦区',
    '东方证券上海浦东新区',
  ];

  const sellers = [
    '机构专用', '中信证券北京总部', '华泰证券北京月坛南街',
    '国泰君安北京金融街', '招商证券北京车公庄', '中金公司北京建国门外',
    '广发证券北京阜成门南大街', '海通证券北京中关村', '申万宏源北京安定门',
    '东方证券北京霄云路',
  ];

  const trades = [];
  const count = symbol ? Math.floor(Math.random() * 5) + 1 : Math.floor(Math.random() * 15) + 5;

  for (let i = 0; i < count; i++) {
    const stock = stocks[Math.floor(Math.random() * stocks.length)];
    const price = Math.round((Math.random() * 200 + 10) * 100) / 100;
    const volume = Math.floor(Math.random() * 500 + 50) * 10000;
    const amount = Math.round(price * volume);
    const discount = Math.round((Math.random() * 10 - 3) * 100) / 100;
    const closePrice = Math.round(price / (1 + discount / 100) * 100) / 100;

    trades.push({
      id: i + 1,
      symbol: stock.symbol,
      name: stock.name,
      tradeDate,
      price,
      closePrice,
      volume,
      amount,
      discount: Math.round(discount * 100) / 100,
      buyer: buyers[Math.floor(Math.random() * buyers.length)],
      seller: sellers[Math.floor(Math.random() * sellers.length)],
      buyerSeat: `营业部${Math.floor(Math.random() * 50) + 1}`,
      sellerSeat: `营业部${Math.floor(Math.random() * 50) + 1}`,
    });
  }

  trades.sort((a, b) => b.amount - a.amount);
  return trades;
}

// 大宗交易列表
router.get('/block-trades', validateQuery(schemas.blockTradeQuery), asyncHandler(async (req: Request, res: Response) => {
  const date = req.query.date as string;
  const symbol = req.query.symbol as string;
  const page = parseInt(req.query.page as string) || 1;
  const pageSize = parseInt(req.query.pageSize as string) || 20;

  const cacheKey = `block-trades:${date || 'latest'}:${symbol || 'all'}`;
  const trades = await queryCache.query(
    cacheKey,
    () => generateBlockTrades(date, symbol),
    300000
  );

  const total = trades.length;
  const start = (page - 1) * pageSize;
  const paginated = trades.slice(start, start + pageSize);

  const totalAmount = trades.reduce((sum, t) => sum + t.amount, 0);
  const totalVolume = trades.reduce((sum, t) => sum + t.volume, 0);
  const avgDiscount = trades.length
    ? Math.round(trades.reduce((sum, t) => sum + t.discount, 0) / trades.length * 100) / 100
    : 0;
  const premiumCount = trades.filter(t => t.discount > 0).length;
  const discountCount = trades.filter(t => t.discount < 0).length;

  sendSuccess(res, {
    trades: paginated,
    pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) },
    summary: {
      totalAmount,
      totalVolume,
      avgDiscount,
      premiumCount,
      discountCount,
      tradeCount: total,
    },
  });
}));

// 大宗交易统计概览
router.get('/block-trades/overview', asyncHandler(async (_req: Request, res: Response) => {
  const cacheKey = 'block-trades:overview';
  const overview = await queryCache.query(
    cacheKey,
    () => {
      const today = new Date().toISOString().split('T')[0];
      const todayTrades = generateBlockTrades(today);
      const totalAmount = todayTrades.reduce((s, t) => s + t.amount, 0);

      const industryStats: Record<string, { count: number; amount: number }> = {};
      todayTrades.forEach(t => {
        const ind = ['白酒', '金融', '科技', '消费', '医药'][Math.floor(Math.random() * 5)];
        if (!industryStats[ind]) industryStats[ind] = { count: 0, amount: 0 };
        industryStats[ind].count++;
        industryStats[ind].amount += t.amount;
      });

      return {
        date: today,
        totalTrades: todayTrades.length,
        totalAmount,
        avgAmount: Math.round(totalAmount / (todayTrades.length || 1)),
        premiumTrades: todayTrades.filter(t => t.discount > 0).length,
        discountTrades: todayTrades.filter(t => t.discount < 0).length,
        flatTrades: todayTrades.filter(t => t.discount === 0).length,
        topBuyers: [
          { name: '机构专用', count: Math.floor(Math.random() * 8) + 2 },
          { name: '中信证券上海分公司', count: Math.floor(Math.random() * 5) + 1 },
          { name: '华泰证券深圳益田路', count: Math.floor(Math.random() * 4) + 1 },
        ],
        industryDistribution: Object.entries(industryStats).map(([name, s]) => ({
          industry: name,
          count: s.count,
          amount: s.amount,
        })),
      };
    },
    300000
  );

  sendSuccess(res, overview);
}));

// 个股大宗交易历史
router.get('/block-trades/:symbol', validateParams(schemas.stockSymbol), validateQuery(schemas.blockTradeHistory), asyncHandler(async (req: Request, res: Response) => {
  const { symbol } = req.params;
  const days = parseInt(req.query.days as string) || 30;

  const cacheKey = `block-trades:stock:${symbol}:${days}`;
  const history = await queryCache.query(
    cacheKey,
    () => {
      const trades = [];
      const now = new Date();
      for (let d = 0; d < days; d++) {
        const date = new Date(now);
        date.setDate(date.getDate() - d);
        const dateStr = date.toISOString().split('T')[0];
        const dayCount = Math.floor(Math.random() * 4);
        for (let i = 0; i < dayCount; i++) {
          const price = Math.round((Math.random() * 200 + 10) * 100) / 100;
          const volume = Math.floor(Math.random() * 300 + 30) * 10000;
          trades.push({
            tradeDate: dateStr,
            price,
            volume,
            amount: Math.round(price * volume),
            discount: Math.round((Math.random() * 10 - 3) * 100) / 100,
            buyer: '机构专用',
            seller: '营业部',
          });
        }
      }
      return trades.sort((a, b) => b.tradeDate.localeCompare(a.tradeDate));
    },
    600000
  );

  sendSuccess(res, { symbol, trades: history, total: history.length });
}));

export default router;
