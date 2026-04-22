/**
 * 股东增减持 API
 * 参考东方财富股东增减持数据
 */

import { Router, Request, Response } from 'express';
import { queryCache } from '../utils/queryCache';
import { validateQuery, validateParams, schemas } from '../middleware/validation';
import { asyncHandler, sendSuccess, sendPaginated } from '../utils/apiResponse';

const router = Router();

// 模拟股东增减持数据
function generateShareholderChanges(symbol?: string, type?: string) {
  const shareholders = [
    { name: '香港中央结算有限公司', type: 'institution' as const },
    { name: '中国证券金融股份有限公司', type: 'institution' as const },
    { name: '中央汇金资产管理有限责任公司', type: 'institution' as const },
    { name: '全国社保基金一零一组合', type: 'institution' as const },
    { name: '中国人寿保险股份有限公司', type: 'institution' as const },
    { name: '招商银行股份有限公司', type: 'institution' as const },
    { name: '张三', type: 'individual' as const },
    { name: '李四', type: 'individual' as const },
    { name: '王五', type: 'individual' as const },
    { name: '赵六', type: 'individual' as const },
  ];

  const stocks = symbol
    ? [{ symbol, name: '指定股票' }]
    : [
        { symbol: '600519', name: '贵州茅台' },
        { symbol: '000858', name: '五粮液' },
        { symbol: '601318', name: '中国平安' },
        { symbol: '000333', name: '美的集团' },
        { symbol: '600036', name: '招商银行' },
      ];

  const changes = [];
  const changeTypes = type ? [type] : ['increase', 'decrease', 'new', 'exit'];

  for (const stock of stocks) {
    const count = Math.floor(Math.random() * 6) + 2;
    for (let i = 0; i < count; i++) {
      const shareholder = shareholders[Math.floor(Math.random() * shareholders.length)];
      const changeType = changeTypes[Math.floor(Math.random() * changeTypes.length)];
      const heldShares = Math.floor(Math.random() * 1000000000) + 10000000;
      const changeShares = changeType === 'new'
        ? heldShares
        : changeType === 'exit'
          ? -Math.floor(Math.random() * 100000000)
          : Math.floor(Math.random() * 200000000) * (changeType === 'increase' ? 1 : -1);
      const heldPercent = Math.round(Math.random() * 15 * 100) / 100;
      const changePercent = Math.round(changeShares / heldShares * 100 * 100) / 100;

      changes.push({
        id: changes.length + 1,
        symbol: stock.symbol,
        name: stock.name,
        shareholderName: shareholder.name,
        shareholderType: shareholder.type,
        changeType,
        heldShares,
        changeShares,
        heldPercent,
        changePercent,
        announceDate: randomDate(30),
        source: '定期报告',
      });
    }
  }

  return changes.sort((a, b) => Math.abs(b.changeShares) - Math.abs(a.changeShares));
}

function randomDate(daysBack: number): string {
  const d = new Date();
  d.setDate(d.getDate() - Math.floor(Math.random() * daysBack));
  return d.toISOString().split('T')[0];
}

// 增减持列表
router.get('/shareholder-changes', validateQuery(schemas.blockTradeQuery), asyncHandler(async (req: Request, res: Response) => {
  const symbol = req.query.symbol as string;
  const type = req.query.type as string; // increase/decrease/new/exit
  const page = parseInt(req.query.page as string) || 1;
  const pageSize = parseInt(req.query.pageSize as string) || 20;

  const cacheKey = `shareholder-changes:${symbol || 'all'}:${type || 'all'}`;
  const changes = await queryCache.query(
    cacheKey,
    () => generateShareholderChanges(symbol, type),
    300000
  );

  const start = (page - 1) * pageSize;
  const paginated = changes.slice(start, start + pageSize);

  // 统计
  const increaseCount = changes.filter(c => c.changeType === 'increase').length;
  const decreaseCount = changes.filter(c => c.changeType === 'decrease').length;
  const newCount = changes.filter(c => c.changeType === 'new').length;
  const exitCount = changes.filter(c => c.changeType === 'exit').length;

  sendSuccess(res, {
    changes: paginated,
    pagination: { page, pageSize, total: changes.length },
    summary: { increaseCount, decreaseCount, newCount, exitCount },
  });
}));

// 增减持概览（按增减持净额排序）
router.get('/shareholder-changes/overview', asyncHandler(async (_req: Request, res: Response) => {
  const cacheKey = 'shareholder-changes:overview';
  const overview = await queryCache.query(
    cacheKey,
    () => {
      const allChanges = generateShareholderChanges();
      const bySymbol: Record<string, { name: string; netChange: number; changes: number }> = {};
      allChanges.forEach(c => {
        if (!bySymbol[c.symbol]) bySymbol[c.symbol] = { name: c.name, netChange: 0, changes: 0 };
        bySymbol[c.symbol].netChange += c.changeShares;
        bySymbol[c.symbol].changes++;
      });

      const sorted = Object.entries(bySymbol)
        .map(([symbol, v]) => ({ symbol, ...v }))
        .sort((a, b) => b.netChange - a.netChange);

      return {
        topIncrease: sorted.slice(0, 5),
        topDecrease: sorted.slice(-5).reverse(),
        totalRecords: allChanges.length,
        date: new Date().toISOString().split('T')[0],
      };
    },
    300000
  );

  sendSuccess(res, overview);
}));

// 个股股东增减持历史
router.get('/shareholder-changes/:symbol', validateParams(schemas.stockSymbol), asyncHandler(async (req: Request, res: Response) => {
  const { symbol } = req.params;
  const days = parseInt(req.query.days as string) || 90;

  const cacheKey = `shareholder-changes:stock:${symbol}:${days}`;
  const history = await queryCache.query(
    cacheKey,
    () => generateShareholderChanges(symbol),
    600000
  );

  sendSuccess(res, { symbol, changes: history, total: history.length });
}));

export default router;
