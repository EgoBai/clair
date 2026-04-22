/**
 * 限售股解禁 API
 * 参考东方财富限售股解禁数据
 */

import { Router, Request, Response } from 'express';
import { queryCache } from '../utils/queryCache';
import { validateQuery, validateParams, schemas } from '../middleware/validation';
import { asyncHandler, sendSuccess } from '../utils/apiResponse';

const router = Router();

interface LockupExpiry {
  id: number;
  symbol: string;
  name: string;
  expiryDate: string;
  lockupType: string;
  shareholder: string;
  totalShares: number;
  circulatingBefore: number;
  unlockRatio: number;
  marketValue: number;
  price: number;
  actualCirculating: number;
}

// 模拟限售股解禁数据
function generateLockupExpiries(month?: number, year?: number): LockupExpiry[] {
  const now = new Date();
  const targetYear = year || now.getFullYear();
  const targetMonth = month || now.getMonth() + 1;

  const stocks = [
    { symbol: '600519', name: '贵州茅台', price: 1800 },
    { symbol: '000858', name: '五粮液', price: 150 },
    { symbol: '601318', name: '中国平安', price: 50 },
    { symbol: '000333', name: '美的集团', price: 65 },
    { symbol: '600036', name: '招商银行', price: 35 },
    { symbol: '002594', name: '比亚迪', price: 260 },
    { symbol: '300750', name: '宁德时代', price: 200 },
    { symbol: '601899', name: '紫金矿业', price: 18 },
    { symbol: '002475', name: '立讯精密', price: 35 },
    { symbol: '600276', name: '恒瑞医药', price: 48 },
    { symbol: '601012', name: '隆基绿能', price: 25 },
    { symbol: '002714', name: '牧原股份', price: 42 },
  ];

  const lockupTypes = ['首发原股东限售', '定向增发机构配售', '股权激励限售', '追加承诺限售'];
  const shareholders = [
    '控股股东', '实际控制人', '高管团队', '核心员工',
    '战略投资者', '财务投资者', '私募基金', '员工持股计划',
  ];

  const expiries = [];
  const daysInMonth = new Date(targetYear, targetMonth, 0).getDate();
  const count = Math.floor(Math.random() * 12) + 5;

  for (let i = 0; i < count; i++) {
    const stock = stocks[Math.floor(Math.random() * stocks.length)];
    const day = Math.floor(Math.random() * daysInMonth) + 1;
    const expiryDate = `${targetYear}-${String(targetMonth).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const totalShares = Math.floor(Math.random() * 500000000) + 10000000;
    const circulatingBefore = Math.floor(Math.random() * 2000000000) + 500000000;
    const ratio = Math.round(totalShares / circulatingBefore * 10000) / 100;
    const marketValue = Math.round(totalShares * stock.price);

    expiries.push({
      id: i + 1,
      symbol: stock.symbol,
      name: stock.name,
      expiryDate,
      lockupType: lockupTypes[Math.floor(Math.random() * lockupTypes.length)],
      shareholder: shareholders[Math.floor(Math.random() * shareholders.length)],
      totalShares,
      circulatingBefore,
      unlockRatio: ratio,
      marketValue,
      price: stock.price,
      actualCirculating: circulatingBefore + totalShares,
    });
  }

  return expiries.sort((a, b) => a.expiryDate.localeCompare(b.expiryDate));
}

// 月度解禁概览
router.get('/lockup/calendar', validateQuery(schemas.lockupCalendar), asyncHandler(async (req: Request, res: Response) => {
  const year = parseInt(req.query.year as string) || new Date().getFullYear();
  const month = parseInt(req.query.month as string) || new Date().getMonth() + 1;

  const cacheKey = `lockup:calendar:${year}-${month}`;
  const data = await queryCache.query(
    cacheKey,
    () => generateLockupExpiries(month, year),
    600000
  );

  // 按日期分组
  const byDate: Record<string, typeof data> = {};
  let totalMarketValue = 0;
  let totalShares = 0;

  data.forEach(item => {
    if (!byDate[item.expiryDate]) byDate[item.expiryDate] = [];
    byDate[item.expiryDate].push(item);
    totalMarketValue += item.marketValue;
    totalShares += item.totalShares;
  });

  sendSuccess(res, {
    year,
    month,
    expiries: data,
    byDate,
    summary: {
      totalStocks: new Set(data.map(d => d.symbol)).size,
      totalEvents: data.length,
      totalMarketValue,
      totalShares,
      avgUnlockRatio: data.length
        ? Math.round(data.reduce((s, d) => s + d.unlockRatio, 0) / data.length * 100) / 100
        : 0,
    },
  });
}));

// 解禁排行（按解禁市值）
router.get('/lockup/rank', validateQuery(schemas.lockupRank), asyncHandler(async (req: Request, res: Response) => {
  const month = parseInt(req.query.month as string) || new Date().getMonth() + 1;
  const year = parseInt(req.query.year as string) || new Date().getFullYear();

  const cacheKey = `lockup:rank:${year}-${month}`;
  const data = await queryCache.query(
    cacheKey,
    () => {
      const allExpiries = generateLockupExpiries(month, year);
      return allExpiries.sort((a, b) => b.marketValue - a.marketValue).slice(0, 20);
    },
    600000
  );

  sendSuccess(res, data);
}));

// 个股解禁历史
router.get('/lockup/:symbol', validateParams(schemas.stockSymbol), asyncHandler(async (req: Request, res: Response) => {
  const { symbol } = req.params;
  const months = parseInt(req.query.months as string) || 12;

  const cacheKey = `lockup:stock:${symbol}:${months}`;
  const history = await queryCache.query(
    cacheKey,
    () => {
      const now = new Date();
      const all: LockupExpiry[] = [];
      for (let m = 0; m < months; m++) {
        const d = new Date(now);
        d.setMonth(d.getMonth() + m);
        const monthData = generateLockupExpiries(d.getMonth() + 1, d.getFullYear());
        const filtered = monthData.filter(e => e.symbol === symbol);
        all.push(...filtered);
      }
      if (all.length === 0) {
        for (let m = 0; m < Math.min(months, 3); m++) {
          const d = new Date(now);
          d.setMonth(d.getMonth() + m);
          const day = Math.floor(Math.random() * 28) + 1;
          all.push({
            id: m + 1,
            symbol,
            name: symbol,
            expiryDate: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
            lockupType: ['首发原股东限售', '定向增发机构配售'][Math.floor(Math.random() * 2)],
            shareholder: '控股股东',
            totalShares: Math.floor(Math.random() * 200000000) + 10000000,
            circulatingBefore: 1000000000,
            unlockRatio: Math.round(Math.random() * 10 * 100) / 100,
            marketValue: Math.floor(Math.random() * 5000000000) + 100000000,
            price: 50,
          });
        }
      }
      return all.sort((a, b) => a.expiryDate.localeCompare(b.expiryDate));
    },
    600000
  );

  sendSuccess(res, { symbol, expiries: history, total: history.length });
}));

export default router;
