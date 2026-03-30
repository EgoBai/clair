/**
 * 融资融券 API
 * 融资余额、融券余量、融资融券排行
 * 参考东方财富融资融券功能
 */

import { Request, Response, Router } from 'express';
import { validateParams, validateQuery, schemas } from '../middleware/validation';
import type { MarginTradingData, MarginOverview } from '../../shared/types';

const router = Router();

// 生成模拟融资融券数据
function generateMarginData(symbol: string, name: string, days: number = 30): MarginTradingData[] {
  const data: MarginTradingData[] = [];
  let financingBalance = 1e8 + Math.random() * 1e10;
  let securitiesBalance = 1e4 + Math.random() * 1e6;

  for (let i = days - 1; i >= 0; i--) {
    const date = new Date();
    date.setDate(date.getDate() - i);

    const financingBuy = Math.random() * 5e8;
    const financingRepay = Math.random() * 4e8;
    const financingNet = financingBuy - financingRepay;
    financingBalance += financingNet;

    const secSell = Math.random() * 1e5;
    const secRepay = Math.random() * 8e4;
    const secNet = secSell - secRepay;
    securitiesBalance += secNet;

    data.push({
      symbol,
      name,
      tradeDate: date.toISOString().split('T')[0],
      financingBalance: parseFloat(financingBalance.toFixed(2)),
      financingBuyAmount: parseFloat(financingBuy.toFixed(2)),
      financingRepayAmount: parseFloat(financingRepay.toFixed(2)),
      financingNetBuy: parseFloat(financingNet.toFixed(2)),
      securitiesBalance: Math.floor(securitiesBalance),
      securitiesSellAmount: Math.floor(secSell),
      securitiesRepayAmount: Math.floor(secRepay),
      securitiesNetSell: Math.floor(secNet),
      totalBalance: parseFloat((financingBalance + securitiesBalance * 50).toFixed(2)),
      financingRatio: parseFloat((financingBalance / (financingBalance * 10) * 100).toFixed(4)),
    });
  }

  return data;
}

// 生成融资融券概览
function generateMarginOverview(): MarginOverview {
  const stocks = [
    { symbol: '600519.SH', name: '贵州茅台' },
    { symbol: '000858.SZ', name: '五粮液' },
    { symbol: '601318.SH', name: '中国平安' },
    { symbol: '000333.SZ', name: '美的集团' },
    { symbol: '600036.SH', name: '招商银行' },
    { symbol: '601012.SH', name: '隆基绿能' },
    { symbol: '300750.SZ', name: '宁德时代' },
    { symbol: '002594.SZ', name: '比亚迪' },
  ];

  return {
    totalFinancingBalance: parseFloat((2e12 + Math.random() * 5e11).toFixed(2)),
    totalSecuritiesBalance: Math.floor(1e10 + Math.random() * 5e9),
    financingStockCount: 1600 + Math.floor(Math.random() * 200),
    securitiesStockCount: 800 + Math.floor(Math.random() * 100),
    topFinancingIncrease: stocks.slice(0, 4).map(s => ({
      ...s,
      change: parseFloat((Math.random() * 20 + 5).toFixed(2)),
    })),
    topSecuritiesIncrease: stocks.slice(4).map(s => ({
      ...s,
      change: parseFloat((Math.random() * 15 + 3).toFixed(2)),
    })),
  };
}

// 获取融资融券概览
router.get('/margin/overview', (_req: Request, res: Response) => {
  try {
    const data = generateMarginOverview();
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, error: '获取融资融券概览失败' });
  }
});

// 获取个股融资融券数据
router.get('/margin/:symbol', validateParams(schemas.marginSymbol), (req: Request, res: Response) => {
  try {
    const { symbol } = req.params;
    const days = parseInt(req.query.days as string) || 30;
    const name = req.query.name as string || '未知';
    const data = generateMarginData(symbol, name, Math.min(days, 120));
    res.json({ success: true, data: { symbol, records: data } });
  } catch (error) {
    res.status(500).json({ success: false, error: '获取融资融券数据失败' });
  }
});

// 融资融券排行
router.get('/margin/rank/:type', validateParams(schemas.marginRank), (_req: Request, res: Response) => {
  try {
    const type = _req.params.type; // financing | securities
    const count = parseInt(_req.query.count as string) || 20;

    const stocks = [
      '600519.SH|贵州茅台', '000858.SZ|五粮液', '601318.SH|中国平安',
      '000333.SZ|美的集团', '600036.SH|招商银行', '601012.SH|隆基绿能',
      '300750.SZ|宁德时代', '002594.SZ|比亚迪', '002415.SZ|海康威视',
      '600900.SH|长江电力', '601888.SH|中国中免', '600276.SH|恒瑞医药',
    ];

    const rank = stocks.slice(0, Math.min(count, stocks.length)).map((s, i) => {
      const [symbol, name] = s.split('|');
      return {
        rank: i + 1,
        symbol,
        name,
        financingBalance: parseFloat((1e10 + Math.random() * 1e11).toFixed(2)),
        financingChange: parseFloat((Math.random() * 1e9 - 5e8).toFixed(2)),
        securitiesBalance: Math.floor(1e6 + Math.random() * 1e7),
        securitiesChange: Math.floor(Math.random() * 1e6 - 5e5),
      };
    });

    res.json({ success: true, data: { type, rank } });
  } catch (error) {
    res.status(500).json({ success: false, error: '获取融资融券排行失败' });
  }
});

export { generateMarginData, generateMarginOverview };
export default router;
